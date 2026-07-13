import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { migrate } from '../lib/db';
import { colors } from '../lib/theme';

export default function RootLayout() {
  useEffect(() => {
    // Ask the browser to mark our storage persistent — without this the
    // OPFS SQLite database is "best effort" and Safari/Chromium may evict
    // it under pressure or disuse. Fire-and-forget; grant is not guaranteed
    // (Safari ties it to Add-to-Home-Screen), but it's strictly beneficial.
    if (Platform.OS === 'web') {
      navigator.storage?.persist?.().catch(() => {});
    }
  }, []);

  return (
    <SQLiteProvider databaseName="bookmarked.db" onInit={migrate}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="book/[id]" options={{ title: 'Book' }} />
      </Stack>
    </SQLiteProvider>
  );
}
