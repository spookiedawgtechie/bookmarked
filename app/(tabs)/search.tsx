import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
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
import { addBook } from '../../lib/db';
import { searchBooks, type SearchResult } from '../../lib/openlibrary';
import { colors } from '../../lib/theme';

export default function Search() {
  const db = useSQLiteContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownedKeys, setOwnedKeys] = useState<Set<string>>(new Set());

  const refreshOwned = useCallback(() => {
    db.getAllAsync<{ ol_key: string }>('SELECT ol_key FROM books').then((rows) =>
      setOwnedKeys(new Set(rows.map((r) => r.ol_key)))
    );
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
    try {
      await addBook(db, {
        olKey: item.key,
        title: item.title,
        author: item.author,
        coverUrl: item.coverUrl,
        totalPages: item.pages,
      });
      refreshOwned();
    } catch {
      notify('Add failed', 'Could not add the book. Try again.');
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
        />
        {query.length > 0 && (
          <Pressable style={styles.clearBtn} hitSlop={10} onPress={() => setQuery('')}>
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
                <Text style={styles.author} numberOfLines={1}>
                  {item.author}
                  {item.year ? ` · ${item.year}` : ''}
                </Text>
                {item.pages && <Text style={styles.meta}>{item.pages} pages</Text>}
              </View>
              <Pressable
                style={[styles.addBtn, owned && styles.addBtnOwned]}
                disabled={owned}
                onPress={() => onAdd(item)}
              >
                <Text style={[styles.addBtnText, owned && { color: colors.textDim }]}>
                  {owned ? '✓' : '+'}
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
  addBtnText: { color: '#000', fontSize: 20, fontWeight: '700', lineHeight: 24 },
});
