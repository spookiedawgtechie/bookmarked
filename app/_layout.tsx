import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { migrate } from '../lib/db';
import { colors } from '../lib/theme';

type TabGateState = 'checking' | 'ready' | 'blocked';

type WebLockManager = {
  request: (
    name: string,
    options: { ifAvailable: true },
    callback: (lock: object | null) => Promise<void> | void
  ) => Promise<void>;
};

function useSingleWebTab(attempt: number): TabGateState {
  const [state, setState] = useState<TabGateState>(
    Platform.OS === 'web' ? 'checking' : 'ready'
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let active = true;
    let releaseLock: (() => void) | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const lockName = 'bookmarked-sqlite-owner';
    const locks = (navigator as Navigator & { locks?: WebLockManager }).locks;

    setState('checking');

    if (locks) {
      void locks
        .request(lockName, { ifAvailable: true }, async (lock) => {
          if (!active) return;
          if (!lock) {
            setState('blocked');
            return;
          }
          setState('ready');
          await new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
        })
        .catch(() => {
          // A browser without a working Web Locks implementation falls back
          // to a short localStorage lease below on the next retry.
          if (active) setState('blocked');
        });
    } else {
      const storageKey = 'bookmarked-active-tab';
      const tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const leaseMs = 8000;
      const claim = () => {
        const now = Date.now();
        try {
          const existing = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as {
            id?: string;
            expiresAt?: number;
          } | null;
          if (
            existing?.id &&
            existing.id !== tabId &&
            typeof existing.expiresAt === 'number' &&
            existing.expiresAt > now
          ) {
            setState('blocked');
            return false;
          }
          localStorage.setItem(
            storageKey,
            JSON.stringify({ id: tabId, expiresAt: now + leaseMs })
          );
          const confirmed = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as {
            id?: string;
          } | null;
          if (confirmed?.id !== tabId) {
            setState('blocked');
            return false;
          }
          setState('ready');
          return true;
        } catch {
          // If storage itself is unavailable, do not strand the user's only
          // tab. SQLite will still surface its own initialization failure.
          setState('ready');
          return false;
        }
      };

      if (claim()) {
        heartbeat = setInterval(() => {
          localStorage.setItem(
            storageKey,
            JSON.stringify({ id: tabId, expiresAt: Date.now() + leaseMs })
          );
        }, leaseMs / 2);
      }

      return () => {
        active = false;
        if (heartbeat) clearInterval(heartbeat);
        try {
          const current = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as {
            id?: string;
          } | null;
          if (current?.id === tabId) localStorage.removeItem(storageKey);
        } catch {}
      };
    }

    return () => {
      active = false;
      releaseLock?.();
    };
  }, [attempt]);

  return state;
}

export default function RootLayout() {
  const [tabAttempt, setTabAttempt] = useState(0);
  const tabState = useSingleWebTab(tabAttempt);

  useEffect(() => {
    // Ask the browser to mark our storage persistent — without this the
    // OPFS SQLite database is "best effort" and Safari/Chromium may evict
    // it under pressure or disuse. Fire-and-forget; grant is not guaranteed
    // (Safari ties it to Add-to-Home-Screen), but it's strictly beneficial.
    if (Platform.OS === 'web') {
      navigator.storage?.persist?.().catch(() => {});
    }
  }, []);

  if (tabState !== 'ready') {
    return (
      <View style={styles.gateScreen} accessibilityLiveRegion="polite">
        {tabState === 'checking' ? (
          <>
            <ActivityIndicator color={colors.green} />
            <Text style={styles.gateText}>Opening Bookmarked…</Text>
          </>
        ) : (
          <>
            <Text style={styles.gateTitle}>Bookmarked is already open</Text>
            <Text style={styles.gateText}>
              Close it in the other tab or window, then try again here.
            </Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => setTabAttempt((value) => value + 1)}
              accessibilityRole="button"
              accessibilityLabel="Try opening Bookmarked again"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

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

const styles = StyleSheet.create({
  gateScreen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  gateTitle: { color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  gateText: {
    color: colors.textDim,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 360,
  },
  retryButton: {
    minHeight: 44,
    backgroundColor: colors.green,
    borderRadius: 9,
    paddingHorizontal: 20,
    justifyContent: 'center',
    marginTop: 22,
  },
  retryText: { color: colors.onAccent, fontSize: 15, fontWeight: '700' },
});
