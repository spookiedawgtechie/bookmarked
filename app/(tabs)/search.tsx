import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { notify } from '../../lib/alert';
import { addBook, getOwnedOlKeys } from '../../lib/db';
import { searchBooks, type SearchResult } from '../../lib/openlibrary';
import { colors } from '../../lib/theme';

export default function Search() {
  const db = useSQLiteContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownedKeys, setOwnedKeys] = useState<Set<string>>(new Set());
  const [addingKeys, setAddingKeys] = useState<Set<string>>(new Set());
  const addingKeysRef = useRef(new Set<string>());

  const refreshOwned = useCallback(() => {
    getOwnedOlKeys(db).then((keys) => setOwnedKeys(new Set(keys)));
  }, [db]);

  useFocusEffect(refreshOwned);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    // The cancelled flag (not just the timer clear) prevents an in-flight
    // response for an OLD query from overwriting results of a newer one —
    // out-of-order resolution is routine on slow connections.
    let cancelled = false;
    const timer = setTimeout(() => {
      searchBooks(q)
        .then((r) => {
          if (cancelled) return;
          setResults(r);
          setError(null);
        })
        .catch(() => {
          if (!cancelled) setError('Search failed. Check your connection.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function onAdd(item: SearchResult) {
    if (addingKeysRef.current.has(item.key)) return;
    addingKeysRef.current.add(item.key);
    setAddingKeys(new Set(addingKeysRef.current));
    try {
      await addBook(db, {
        olKey: item.key,
        title: item.title,
        author: item.author,
        coverUrl: item.coverUrl,
        totalPages: item.pages,
        editionKey: item.editionKey,
        isbn: item.isbn,
        publisher: item.publisher,
        publishDate: item.publishDate,
        language: item.language,
      });
      refreshOwned();
    } catch {
      notify('Add failed', 'Could not add the book. Try again.');
    } finally {
      addingKeysRef.current.delete(item.key);
      setAddingKeys(new Set(addingKeysRef.current));
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          placeholder="Search books…"
          placeholderTextColor={colors.textDim}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          accessibilityLabel="Search Open Library"
        />
        {query.length > 0 && (
          <Pressable
            style={styles.clearBtn}
            hitSlop={10}
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Text style={styles.clearBtnText}>✕</Text>
          </Pressable>
        )}
      </View>
      {loading && <ActivityIndicator color={colors.green} style={{ marginTop: 24 }} />}
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={results}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingBottom: 32 }}
        renderItem={({ item }) => {
          const owned = ownedKeys.has(item.key);
          const adding = addingKeys.has(item.key);
          return (
            <View style={styles.row}>
              {item.coverUrl ? (
                <Image source={{ uri: item.coverUrl }} style={styles.cover} contentFit="cover" />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]}>
                  <Text style={{ fontSize: 20 }}>📖</Text>
                </View>
              )}
              <View style={styles.rowText}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                {item.originalTitle && (
                  <Text style={styles.originalTitle} numberOfLines={1}>
                    Work title: {item.originalTitle}
                  </Text>
                )}
                <Text style={styles.author} numberOfLines={1}>
                  {item.author}
                  {item.year ? ` · ${item.year}` : ''}
                </Text>
                {item.pages && <Text style={styles.meta}>{item.pages} pages</Text>}
                {(item.publisher || item.publishDate) && (
                  <Text style={styles.meta} numberOfLines={1}>
                    {[item.publisher, item.publishDate].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
              <Pressable
                style={[styles.addBtn, (owned || adding) && styles.addBtnOwned]}
                disabled={owned || adding}
                onPress={() => onAdd(item)}
                accessibilityRole="button"
                accessibilityLabel={
                  owned
                    ? `${item.title} is already in your library`
                    : adding
                      ? `Adding ${item.title}`
                      : `Add ${item.title} to your library`
                }
                accessibilityState={{ disabled: owned || adding, busy: adding }}
              >
                <Text style={[styles.addBtnText, owned && { color: colors.textDim }]}>
                  {owned ? '✓' : adding ? '…' : '+'}
                </Text>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  inputWrap: { marginTop: 12, marginBottom: 12, justifyContent: 'center' },
  input: {
    backgroundColor: colors.card,
    borderRadius: 10,
    color: colors.text,
    fontSize: 16,
    paddingLeft: 14,
    paddingRight: 40,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearBtn: {
    position: 'absolute',
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnText: { color: colors.text, fontSize: 12, fontWeight: '700', lineHeight: 14 },
  error: { color: colors.orange, textAlign: 'center', marginTop: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  cover: { width: 44, height: 66, borderRadius: 4, backgroundColor: colors.border },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, marginLeft: 12 },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  originalTitle: { color: colors.textDim, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  author: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  meta: { color: colors.textDim, fontSize: 12, marginTop: 4 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  addBtnOwned: { backgroundColor: colors.border },
  addBtnText: { color: colors.onAccent, fontSize: 20, fontWeight: '700', lineHeight: 24 },
});
