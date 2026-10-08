import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Versioned schema for the on-device database.
 *
 * Every migration that adds tables/columns goes into `MIGRATIONS` as a new
 * integer version; `runMigrations` applies anything the local DB is missing,
 * tracked with `PRAGMA user_version`. Later milestones (stores, products,
 * prices) only append new versions here.
 */
export const SCHEMA_VERSION = 2;

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'photo')),
      notes TEXT,
      photo_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY NOT NULL,
      recipe_id TEXT NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      raw_text TEXT,
      name TEXT NOT NULL,
      quantity REAL,
      unit TEXT,
      parsed_ok INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_ingredients_recipe_id ON ingredients (recipe_id);

    CREATE TABLE IF NOT EXISTS shopping_list_items (
      id TEXT PRIMARY KEY NOT NULL,
      recipe_id TEXT REFERENCES recipes (id) ON DELETE SET NULL,
      item_name TEXT NOT NULL,
      quantity REAL,
      unit TEXT,
      barcode TEXT,
      checked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `,
  // Nutrition estimate inputs. All nullable so existing recipes keep working:
  // NULL servings = not set yet; NULL grams / nutrition_food_id = derive from
  // quantity + unit and match by name.
  2: `
    ALTER TABLE recipes ADD COLUMN servings INTEGER CHECK (servings IS NULL OR servings > 0);
    ALTER TABLE ingredients ADD COLUMN grams REAL CHECK (grams IS NULL OR grams >= 0);
    ALTER TABLE ingredients ADD COLUMN nutrition_food_id TEXT;
  `,
};

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (let version = current + 1; version <= SCHEMA_VERSION; version += 1) {
    const sql = MIGRATIONS[version];
    if (!sql) {
      throw new Error(`Missing migration for schema version ${version}`);
    }
    // One transaction per version, so a failed migration leaves the DB at the
    // previous version instead of half-applied (ALTER TABLE can't be re-run).
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${version}`);
    });
  }
}
