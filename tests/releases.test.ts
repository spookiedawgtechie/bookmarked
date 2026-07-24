import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getAppSetting, migrate, setAppSetting } from '../lib/db';
import {
  CURRENT_RELEASE,
  LAST_SEEN_RELEASE_KEY,
  shouldShowRelease,
} from '../lib/releases';
import { NodeSQLiteAdapter } from './sqlite';

test('release notes show once for each local database', async () => {
  const adapter = new NodeSQLiteAdapter();
  const db = adapter.asDatabase();
  await migrate(db);

  const unseen = await getAppSetting(db, LAST_SEEN_RELEASE_KEY);
  assert.equal(unseen, null);
  assert.equal(shouldShowRelease(unseen), true);

  await setAppSetting(db, LAST_SEEN_RELEASE_KEY, CURRENT_RELEASE.id);

  const seen = await getAppSetting(db, LAST_SEEN_RELEASE_KEY);
  assert.equal(seen, CURRENT_RELEASE.id);
  assert.equal(shouldShowRelease(seen), false);
});

test('a newer release appears after an older release was acknowledged', () => {
  assert.equal(shouldShowRelease('1.0.0'), true);
});

test('app, package, and release-note versions stay synchronized', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    version: string;
  };
  const appJson = JSON.parse(readFileSync('app.json', 'utf8')) as {
    expo: { version: string };
  };
  const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
    version: string;
    packages: { '': { version: string } };
  };

  assert.equal(packageJson.version, CURRENT_RELEASE.id);
  assert.equal(appJson.expo.version, CURRENT_RELEASE.id);
  assert.equal(packageLock.version, CURRENT_RELEASE.id);
  assert.equal(packageLock.packages[''].version, CURRENT_RELEASE.id);
});
