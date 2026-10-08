import type { SQLiteDatabase } from 'expo-sqlite';

import { runMigrations, SCHEMA_VERSION } from '../db/schema';

/** Minimal stand-in for expo-sqlite that records what the migration runner does. */
function fakeDb(userVersion: number) {
  const log: string[] = [];
  let version = userVersion;
  const db = {
    getFirstAsync: async () => ({ user_version: version }),
    execAsync: async (sql: string) => {
      const pragma = /PRAGMA user_version = (\d+)/.exec(sql);
      if (pragma) version = Number(pragma[1]);
      log.push(sql.trim().split('\n')[0].trim());
    },
    withTransactionAsync: async (task: () => Promise<void>) => {
      log.push('BEGIN');
      await task();
      log.push('COMMIT');
    },
  };
  return { db: db as unknown as SQLiteDatabase, log, version: () => version };
}

describe('runMigrations', () => {
  it('upgrades an M1 (v1) database with only the nutrition migration, in a transaction', async () => {
    const { db, log, version } = fakeDb(1);
    await runMigrations(db);
    expect(SCHEMA_VERSION).toBe(2);
    expect(version()).toBe(2);
    expect(log).toEqual([
      'BEGIN',
      'ALTER TABLE recipes ADD COLUMN servings INTEGER CHECK (servings IS NULL OR servings > 0);',
      'PRAGMA user_version = 2',
      'COMMIT',
    ]);
  });

  it('builds a fresh database through every version in order', async () => {
    const { db, log, version } = fakeDb(0);
    await runMigrations(db);
    expect(version()).toBe(SCHEMA_VERSION);
    expect(log.filter((line) => line.startsWith('PRAGMA'))).toEqual([
      'PRAGMA user_version = 1',
      'PRAGMA user_version = 2',
    ]);
  });

  it('does nothing on an up-to-date database', async () => {
    const { db, log } = fakeDb(SCHEMA_VERSION);
    await runMigrations(db);
    expect(log).toEqual([]);
  });
});
