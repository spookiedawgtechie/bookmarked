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
import { BookCover } from '../../components/BookCover';
import { confirmDialog, notify } from '../../lib/alert';
import { addBook, applyEditionMetadata, getOwnedWorkItems } from '../../lib/db';
import {
  looksLikeIsbn,
  normalizeIsbn,
  searchBooks,
  type SearchResult,
} from '../../lib/openlibrary';
import { colors } from '../../lib/theme';
import { readableContentStyle } from '../../lib/layout';

export default function Search() {
  const db = useSQLiteContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownedItems, setOwnedItems] = useState<Map<string, number>>(new Map());
  const [addingKeys, setAddingKeys] = useState<Set<string>>(new Set());
  const addingKeysRef = useRef(new Set<string>());

  const refreshOwned = useCallback(() => {
    getOwnedWorkItems(db).then((items) =>
      setOwnedItems(new Map(items.map((item) => [item.olKey, item.itemId])))
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
    if (looksLikeIsbn(q) && normalizeIsbn(q) === null) {
      setResults([]);
      setError('That ISBN checksum is invalid.');
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

  async function replaceEdition(item: SearchResult, itemId: number) {
    if (addingKeysRef.current.has(item.key)) return;
    addingKeysRef.current.add(item.key);
    setAddingKeys(new Set(addingKeysRef.current));
    try {
      await applyEditionMetadata(db, itemId, {
        editionKey: item.editionKey,
        isbn: item.isbn,
        publisher: item.publisher,
        publishDate: item.publishDate,
        language: item.language,
        coverUrl: item.coverUrl,
        totalPages: item.pages,
      });
      refreshOwned();
      notify('Edition updated', `${item.title} now matches that ISBN.`);
    } catch {
      notify('Update failed', 'Could not update the physical edition. Try again.');
    } finally {
      addingKeysRef.current.delete(item.key);
      setAddingKeys(new Set(addingKeysRef.current));
    }
  }

  async function onAdd(item: SearchResult) {
    const existingItemId = ownedItems.get(item.key);
    if (existingItemId !== undefined) {
      if (!item.exactIsbnMatch) return;
      confirmDialog(
        'Use this physical edition?',
        'Bookmarked will update the ISBN, publisher, language, publication date, and cover. Your title, page count, notes, progress, ratings, reviews, and reading dates stay unchanged.',
        'Use edition',
        () => {
          void replaceEdition(item, existingItemId);
        },
        false
      );
      return;
    }
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
      <View style={[readableContentStyle, styles.content]}>
        <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          placeholder="Search title, author, or ISBN…"
          placeholderTextColor={colors.textDim}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Search Open Library by title, author, or ISBN"
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
        {!loading && !error && query.trim().length >= 3 && results.length === 0 && (
          <Text style={styles.empty}>
            {normalizeIsbn(query)
              ? 'No Open Library edition matched that ISBN.'
              : 'No books matched that search.'}
          </Text>
        )}
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.key}:${item.editionKey ?? item.isbn ?? 'work'}`}
          contentContainerStyle={{ paddingBottom: 96 }}
          renderItem={({ item }) => {
          const owned = ownedItems.has(item.key);
          const canReplaceEdition = owned && item.exactIsbnMatch;
          const adding = addingKeys.has(item.key);
          return (
            <View style={styles.row}>
              <BookCover uri={item.coverUrl} title={item.title} style={styles.cover} />
              <View style={styles.rowText}>
                {item.exactIsbnMatch && <Text style={styles.exactBadge}>Exact ISBN match</Text>}
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
                {item.exactIsbnMatch && item.isbn && (
                  <Text style={styles.meta}>ISBN {item.isbn}</Text>
                )}
                {(item.publisher || item.publishDate) && (
                  <Text style={styles.meta} numberOfLines={1}>
                    {[item.publisher, item.publishDate].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
              <Pressable
                style={[
                  styles.addBtn,
                  canReplaceEdition && styles.replaceBtn,
                  (adding || (owned && !canReplaceEdition)) && styles.addBtnOwned,
                ]}
                disabled={adding || (owned && !canReplaceEdition)}
                onPress={() => onAdd(item)}
                accessibilityRole="button"
                accessibilityLabel={
                  canReplaceEdition
                    ? `Use this ISBN edition for ${item.title}`
                    : owned
                    ? `${item.title} is already in your library`
                    : adding
                      ? `Adding ${item.title}`
                      : `Add ${item.title} to your library`
                }
                accessibilityState={{
                  disabled: adding || (owned && !canReplaceEdition),
                  busy: adding,
                }}
              >
                <Text
                  style={[
                    styles.addBtnText,
                    canReplaceEdition && styles.addBtnLabel,
                    owned && !canReplaceEdition && { color: colors.textDim },
                  ]}
                >
                  {adding ? '…' : canReplaceEdition ? 'Use edition' : owned ? '✓' : '+'}
                </Text>
              </Pressable>
            </View>
          );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, paddingHorizontal: 16 },
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
  empty: { color: colors.textDim, textAlign: 'center', marginTop: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  cover: { width: 44, height: 66, borderRadius: 4, backgroundColor: colors.border },
  rowText: { flex: 1, marginLeft: 12 },
  exactBadge: {
    alignSelf: 'flex-start',
    color: colors.onAccent,
    backgroundColor: colors.blue,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  originalTitle: { color: colors.textDim, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  author: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  meta: { color: colors.textDim, fontSize: 12, marginTop: 4 },
  addBtn: {
    minWidth: 36,
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  replaceBtn: {
    minWidth: 84,
    paddingHorizontal: 10,
    backgroundColor: colors.blue,
  },
  addBtnOwned: { backgroundColor: colors.border },
  addBtnText: { color: colors.onAccent, fontSize: 20, fontWeight: '700', lineHeight: 24 },
  addBtnLabel: { fontSize: 12, textAlign: 'center' },
});
