import assert from 'node:assert/strict';
import test from 'node:test';
import type { SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';
import { logProgress, setStatus } from '../lib/db';

interface Operation {
  sql: string;
  params: unknown[];
}

class TransactionalFakeDb {
  committed: Operation[] = [];
  completionChanges = 1;
  failOnRun: number | null = null;
  private staged: Operation[] | null = null;
  private runCount = 0;

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    assert.equal(this.staged, null, 'nested transaction is not expected');
    this.staged = [];
    try {
      await task();
      this.committed.push(...this.staged);
    } finally {
      this.staged = null;
    }
  }

  async runAsync(sql: string, ...params: unknown[]): Promise<SQLiteRunResult> {
    this.runCount += 1;
    if (this.runCount === this.failOnRun) throw new Error('simulated write failure');
    const operation = { sql, params };
    if (this.staged) this.staged.push(operation);
    else this.committed.push(operation);
    return {
      lastInsertRowId: 0,
      changes: sql.includes("status = 'read'") ? this.completionChanges : 1,
    };
  }

  async getFirstAsync<T>(): Promise<T | null> {
    return { id: 77 } as T;
  }

  asDatabase(): SQLiteDatabase {
    return this as unknown as SQLiteDatabase;
  }
}

test('progress, session history, and automatic completion commit together', async () => {
  const fake = new TransactionalFakeDb();
  const completed = await logProgress(fake.asDatabase(), 9, 20, 100);

  assert.equal(completed, true);
  assert.equal(fake.committed.length, 3);
  assert.match(fake.committed[0].sql, /INSERT OR IGNORE INTO sessions/);
  assert.match(fake.committed[1].sql, /UPDATE reading_entries SET current_page/);
  assert.match(fake.committed[2].sql, /status = 'read'/);
});

test('an unmoved progress slider does not create a reading session', async () => {
  const fake = new TransactionalFakeDb();
  fake.completionChanges = 0;
  const completed = await logProgress(fake.asDatabase(), 9, 20, 20);

  assert.equal(completed, false);
  assert.equal(fake.committed.length, 2);
  assert.equal(fake.committed.some((operation) => operation.sql.includes('INSERT')), false);
});

test('a failed progress transaction commits none of its staged writes', async () => {
  const fake = new TransactionalFakeDb();
  fake.failOnRun = 2;

  await assert.rejects(() => logProgress(fake.asDatabase(), 9, 20, 50), /simulated/);
  assert.deepEqual(fake.committed, []);
});

test('directly marking an old book read does not invent a session dated today', async () => {
  const fake = new TransactionalFakeDb();

  await setStatus(fake.asDatabase(), 9, 'read');

  assert.equal(fake.committed.length, 1);
  assert.match(fake.committed[0].sql, /UPDATE reading_entries SET status/);
  assert.equal(fake.committed[0].sql.includes('sessions'), false);
});
