import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

// Centralizes the "produce a file, then hand it to the OS share sheet /
// trigger a download" logic — one cross-platform helper instead of every
// caller re-deriving the web-vs-native branch (same reasoning as
// lib/alert.ts centralizing the Alert-on-web workaround).
export async function shareFile(input: {
  content?: string; // raw text payload (e.g. JSON)
  uri?: string; // native file URI already on disk (e.g. captureRef tmpfile)
  base64?: string; // web-only image data (captureRef base64 result)
  filename: string;
  mimeType: string;
  dialogTitle?: string;
}): Promise<void> {
  const { content, uri, base64, filename, mimeType, dialogTitle } = input;

  if (Platform.OS === 'web') {
    // On mobile browsers (iOS PWA especially) sharing a real File keeps the
    // filename and type; anchor download is the desktop fallback.
    const blob = content
      ? new Blob([content], { type: mimeType })
      : await (await fetch(`data:${mimeType};base64,${base64}`)).blob();
    const file = new File([blob], filename, { type: mimeType });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: dialogTitle });
      } catch (e) {
        // Dismissing the share sheet rejects with AbortError — the user
        // canceling is not a failure and must not surface as one.
        if ((e as Error)?.name !== 'AbortError') throw e;
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
    return;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  let fileUri = uri;
  if (!fileUri) {
    fileUri = `${FileSystem.cacheDirectory}${filename}`;
    if (content !== undefined) {
      await FileSystem.writeAsStringAsync(fileUri, content);
    } else if (base64 !== undefined) {
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
    }
  }
  await Sharing.shareAsync(fileUri, { mimeType, dialogTitle });
}
