import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

// Full-library JSON dump. On web this doubles as insurance against Safari
// evicting site storage; on Android it's a general backup you can save anywhere.
export async function exportLibrary(db: SQLiteDatabase): Promise<void> {
  const books = await db.getAllAsync('SELECT * FROM books');
  // Sessions carry the book's ol_key (not its local numeric id, which is
  // meaningless on another device) so import can re-link them correctly.
  const sessions = await db.getAllAsync(
    `SELECT sessions.logged_at, sessions.from_page, sessions.to_page, books.ol_key as book_ol_key
     FROM sessions JOIN books ON books.id = sessions.book_id`
  );
  const payload = JSON.stringify(
    {
      app: 'bookmarked',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      books,
      sessions,
    },
    null,
    2
  );

  const fileName = `bookmarked-backup-${new Date().toISOString().slice(0, 10)}.json`;

  if (Platform.OS === 'web') {
    // On mobile browsers (iOS PWA especially) sharing a real File keeps the
    // .json name and type; anchor download is the desktop fallback.
    const file = new File([payload], fileName, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Bookmarked backup' });
    } else {
      const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  } else {
    // Share an actual .json file, not a text message.
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, payload);
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle: 'Export Bookmarked backup',
    });
  }
}

// Restores a backup produced by exportLibrary. Books are matched by their
// Open Library key: existing rows are overwritten, new ones inserted.
// Returns the number of books imported, or throws on an unrecognized file.
export async function importLibrary(db: SQLiteDatabase): Promise<number | null> {
  // text/plain included so backups that platforms saved as .txt still import.
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || picked.assets.length === 0) return null;
  const asset = picked.assets[0];

  let text: string;
  if (Platform.OS === 'web') {
    text = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
  } else {
    text = await FileSystem.readAsStringAsync(asset.uri);
  }

  const payload = JSON.parse(text) as {
    app?: string;
    books?: Record<string, unknown>[];
    sessions?: Record<string, unknown>[];
  };
  if (payload.app !== 'bookmarked' || !Array.isArray(payload.books)) {
    throw new Error('Not a Bookmarked backup file');
  }

  let count = 0;
  for (const b of payload.books) {
    if (typeof b.ol_key !== 'string' || typeof b.title !== 'string') continue;
    await db.runAsync(
      `INSERT INTO books
         (ol_key, title, author, cover_url, total_pages, status, current_page,
          rating, review, added_at, started_at, finished_at, description, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ol_key) DO UPDATE SET
         title = excluded.title, author = excluded.author,
         cover_url = excluded.cover_url, total_pages = excluded.total_pages,
         status = excluded.status, current_page = excluded.current_page,
         rating = excluded.rating, review = excluded.review,
         added_at = excluded.added_at, started_at = excluded.started_at,
         finished_at = excluded.finished_at, description = excluded.description,
         updated_at = excluded.updated_at`,
      b.ol_key,
      b.title,
      (b.author as string) ?? '',
      (b.cover_url as string) ?? null,
      (b.total_pages as number) ?? null,
      (b.status as string) ?? 'want',
      (b.current_page as number) ?? 0,
      (b.rating as number) ?? null,
      (b.review as string) ?? null,
      (b.added_at as string) ?? new Date().toISOString(),
      (b.started_at as string) ?? null,
      (b.finished_at as string) ?? null,
      (b.description as string) ?? null,
      (b.updated_at as string) ?? null
    );
    count += 1;
  }

  // Sessions reference books by ol_key in the backup (schemaVersion 1
  // backups predate sessions entirely — payload.sessions is simply absent).
  if (Array.isArray(payload.sessions)) {
    for (const s of payload.sessions) {
      if (
        typeof s.book_ol_key !== 'string' ||
        typeof s.logged_at !== 'string' ||
        typeof s.from_page !== 'number' ||
        typeof s.to_page !== 'number'
      ) {
        continue;
      }
      const row = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM books WHERE ol_key = ?',
        s.book_ol_key
      );
      if (!row) continue;
      await db.runAsync(
        `INSERT OR IGNORE INTO sessions (book_id, logged_at, from_page, to_page) VALUES (?, ?, ?, ?)`,
        row.id,
        s.logged_at,
        s.from_page,
        s.to_page
      );
    }
  }

  return count;
}
