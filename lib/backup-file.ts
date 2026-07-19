import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import {
  createBackupPayload,
  importBackupPayload,
  parseBackupText,
  type ImportSummary,
} from './backup';
import { shareFile } from './share';

export async function exportLibrary(db: SQLiteDatabase): Promise<void> {
  const payload = JSON.stringify(await createBackupPayload(db), null, 2);
  const fileName = `bookmarked-backup-${new Date().toISOString().slice(0, 10)}.json`;
  await shareFile({
    content: payload,
    filename: fileName,
    mimeType: 'application/json',
    dialogTitle: 'Export Bookmarked backup',
  });
}

export async function importLibrary(db: SQLiteDatabase): Promise<ImportSummary | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled || picked.assets.length === 0) return null;
  const asset = picked.assets[0];
  const text = Platform.OS === 'web'
    ? asset.file
      ? await asset.file.text()
      : await (await fetch(asset.uri)).text()
    : await FileSystem.readAsStringAsync(asset.uri);
  return importBackupPayload(db, parseBackupText(text));
}
