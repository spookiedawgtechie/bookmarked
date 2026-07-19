import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase, SQLiteRunResult } from 'expo-sqlite';

export class NodeSQLiteAdapter {
  readonly raw = new DatabaseSync(':memory:');
  failWhenSqlContains: string | null = null;

  async execAsync(sql: string): Promise<void> {
    if (this.failWhenSqlContains && sql.includes(this.failWhenSqlContains)) {
      throw new Error('simulated migration failure');
    }
    this.raw.exec(sql);
  }

  async runAsync(sql: string, ...params: unknown[]): Promise<SQLiteRunResult> {
    const result = this.raw.prepare(sql).run(...(params as never[]));
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return (this.raw.prepare(sql).get(...(params as never[])) as T | undefined) ?? null;
  }

  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.raw.prepare(sql).all(...(params as never[])) as T[];
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.raw.exec('BEGIN');
    try {
      await task();
      this.raw.exec('COMMIT');
    } catch (error) {
      this.raw.exec('ROLLBACK');
      throw error;
    }
  }

  asDatabase(): SQLiteDatabase {
    return this as unknown as SQLiteDatabase;
  }
}
