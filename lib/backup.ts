import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform, Share } from 'react-native';

// Full-library JSON dump. On web this doubles as insurance against Safari
// evicting site storage; on Android it's a general backup you can save anywhere.
export async function exportLibrary(db: SQLiteDatabase): Promise<void> {
  const books = await db.getAllAsync('SELECT * FROM books');
  const payload = JSON.stringify(
    {
      app: 'bookmarked',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      books,
    },
    null,
    2
  );

  if (Platform.OS === 'web') {
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookmarked-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    await Share.share({ message: payload });
  }
}
