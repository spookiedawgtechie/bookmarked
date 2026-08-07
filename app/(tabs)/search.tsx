import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BookCover } from '../../components/BookCover';
import { confirmDialog, notify } from '../../lib/alert';
import {
  addBook,
  addBookCopy,
  applyEditionMetadata,
  getOwnedWorkItems,
  type AddBookInput,
  type OwnedWorkItem,
} from '../../lib/db';
import {
  looksLikeIsbn,
  normalizeIsbn,
  searchBooks,
  type SearchResult,
} from '../../lib/openlibrary';
import { useTheme, useThemedStyles, type ThemeColors } from '../../lib/theme';
import { readableContentStyle } from '../../lib/layout';

export default function Search() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownedItems, setOwnedItems] = useState<Map<string, OwnedWorkItem[]>>(new Map());
  const [copyChoice, setCopyChoice] = useState<SearchResult | null>(null);
  const [addingKeys, setAddingKeys] = useState<Set<string>>(new Set());
  const addingKeysRef = useRef(new Set<string>());

  const refreshOwned = useCallback(() => {
    getOwnedWorkItems(db).then((items) => {
      const grouped = new Map<string, OwnedWorkItem[]>();
      for (const item of items) {
        grouped.set(item.olKey, [...(grouped.get(item.olKey) ?? []), item]);
      }
      setOwnedItems(grouped);
    });
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
      setCopyChoice(null);
      notify('Edition updated', `${item.title} now matches that ISBN.`);
    } catch {
      notify('Update failed', 'Could not update the physical edition. Try again.');
    } finally {
      addingKeysRef.current.delete(item.key);
      setAddingKeys(new Set(addingKeysRef.current));
    }
  }

  function toAddBookInput(item: SearchResult): AddBookInput {
    return {
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
    };
  }

  async function addNewItem(item: SearchResult, anotherCopy: boolean) {
    if (addingKeysRef.current.has(item.key)) return;
    addingKeysRef.current.add(item.key);
    setAddingKeys(new Set(addingKeysRef.current));
    try {
      const input = toAddBookInput(item);
      if (anotherCopy) await addBookCopy(db, input);
      else await addBook(db, input);
      refreshOwned();
      setCopyChoice(null);
      if (anotherCopy) notify('Copy added', `${item.title} is now tracked as another copy.`);
    } catch {
      notify('Add failed', 'Could not add the physical copy. Try again.');
    } finally {
      addingKeysRef.current.delete(item.key);
      setAddingKeys(new Set(addingKeysRef.current));
    }
  }

  function onAdd(item: SearchResult) {
    if ((ownedItems.get(item.key)?.length ?? 0) > 0) {
      setCopyChoice(item);
      return;
    }
    void addNewItem(item, false);
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
          const copies = ownedItems.get(item.key) ?? [];
          const owned = copies.length > 0;
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
                  owned && styles.manageBtn,
                  adding && styles.addBtnOwned,
                ]}
                disabled={adding}
                onPress={() => onAdd(item)}
                accessibilityRole="button"
                accessibilityLabel={
                  adding
                    ? `Adding ${item.title}`
                    : owned
                      ? `Manage ${copies.length} ${copies.length === 1 ? 'copy' : 'copies'} of ${item.title}`
                      : `Add ${item.title} to your library`
                }
                accessibilityState={{
                  disabled: adding,
                  busy: adding,
                }}
              >
                <Text
                  style={[styles.addBtnText, owned && styles.addBtnLabel]}
                >
                  {adding
                    ? '…'
                    : owned
                      ? `${copies.length} ${copies.length === 1 ? 'copy' : 'copies'}`
                      : '+'}
                </Text>
              </Pressable>
            </View>
          );
          }}
        />
      </View>
      <Modal
        visible={copyChoice !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setCopyChoice(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setCopyChoice(null)}
          accessible={false}
        >
          <Pressable
            style={styles.copySheet}
            onPress={() => {}}
            accessibilityViewIsModal
            accessibilityLabel="Manage physical copies"
          >
            {copyChoice && (
              <>
                <View style={styles.sheetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetTitle}>Physical copies</Text>
                    <Text style={styles.sheetBookTitle} numberOfLines={2}>
                      {copyChoice.title}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.sheetClose}
                    onPress={() => setCopyChoice(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Close physical copy options"
                  >
                    <Text style={styles.sheetCloseText}>Close</Text>
                  </Pressable>
                </View>
                <Text style={styles.sheetHint}>
                  Add this result as another physical copy. For an exact ISBN match, you can
                  instead apply its edition metadata to one existing copy.
                </Text>
                <Pressable
                  style={styles.addCopyBtn}
                  onPress={() => void addNewItem(copyChoice, true)}
                  disabled={addingKeys.has(copyChoice.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add another physical copy of ${copyChoice.title}`}
                  accessibilityState={{ disabled: addingKeys.has(copyChoice.key) }}
                >
                  <Text style={styles.addCopyBtnText}>
                    {addingKeys.has(copyChoice.key) ? 'Adding…' : 'Add another copy'}
                  </Text>
                </Pressable>
                <Text style={styles.existingLabel}>
                  Existing {ownedItems.get(copyChoice.key)?.length === 1 ? 'copy' : 'copies'}
                </Text>
                <ScrollView style={styles.copyList}>
                  {(ownedItems.get(copyChoice.key) ?? []).map((copy, index) => {
                    const sameEdition =
                      (copyChoice.editionKey !== null &&
                        copy.editionKey === copyChoice.editionKey) ||
                      (copyChoice.isbn !== null &&
                        normalizeIsbn(copy.isbn ?? '') === normalizeIsbn(copyChoice.isbn));
                    return (
                      <View key={copy.itemId} style={styles.copyRow}>
                        <BookCover
                          uri={copy.coverUrl}
                          title={copy.title}
                          style={styles.copyCover}
                        />
                        <View style={styles.copyText}>
                          <Text style={styles.copyTitle} numberOfLines={2}>
                            Copy {index + 1}: {copy.title}
                          </Text>
                          <Text style={styles.copyMeta} numberOfLines={1}>
                            {copy.isbn ? `ISBN ${copy.isbn}` : 'ISBN not recorded'}
                          </Text>
                        </View>
                        {copyChoice.exactIsbnMatch && (
                          <Pressable
                            style={[
                              styles.useEditionBtn,
                              sameEdition && styles.useEditionBtnDisabled,
                            ]}
                            disabled={sameEdition || addingKeys.has(copyChoice.key)}
                            onPress={() => {
                              confirmDialog(
                                'Use this physical edition?',
                                'Bookmarked will update this copy’s ISBN, publisher, language, publication date, and cover. Its title, page count, notes, progress, ratings, reviews, and reading dates stay unchanged.',
                                'Use edition',
                                () => {
                                  void replaceEdition(copyChoice, copy.itemId);
                                },
                                false
                              );
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={
                              sameEdition
                                ? `Copy ${index + 1} already uses this edition`
                                : `Use this ISBN edition for copy ${index + 1}`
                            }
                            accessibilityState={{ disabled: sameEdition }}
                          >
                            <Text
                              style={[
                                styles.useEditionText,
                                sameEdition && styles.useEditionTextDisabled,
                              ]}
                            >
                              {sameEdition ? 'Matched' : 'Use edition'}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
                {!copyChoice.exactIsbnMatch && (
                  <Text style={styles.isbnHint}>
                    Search the ISBN printed on your copy to update a specific edition.
                  </Text>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
  manageBtn: {
    minWidth: 68,
    paddingHorizontal: 10,
    backgroundColor: colors.blue,
  },
  addBtnOwned: { backgroundColor: colors.border },
  addBtnText: { color: colors.onAccent, fontSize: 20, fontWeight: '700', lineHeight: 24 },
  addBtnLabel: { fontSize: 12, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  copySheet: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '82%',
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sheetTitle: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sheetBookTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 4 },
  sheetClose: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  sheetHint: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: 12 },
  addCopyBtn: {
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  addCopyBtnText: { color: colors.onAccent, fontSize: 15, fontWeight: '800' },
  existingLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
  },
  copyList: { maxHeight: 300 },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 10,
  },
  copyCover: { width: 36, height: 54, borderRadius: 3, backgroundColor: colors.border },
  copyText: { flex: 1, marginLeft: 10, marginRight: 8 },
  copyTitle: { color: colors.text, fontSize: 13, fontWeight: '600' },
  copyMeta: { color: colors.textDim, fontSize: 12, marginTop: 3 },
  useEditionBtn: {
    minHeight: 40,
    minWidth: 82,
    borderRadius: 8,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  useEditionBtnDisabled: { backgroundColor: colors.border },
  useEditionText: { color: colors.onAccent, fontSize: 12, fontWeight: '700' },
  useEditionTextDisabled: { color: colors.textDim },
  isbnHint: { color: colors.textDim, fontSize: 12, lineHeight: 17, marginTop: 10 },
});
