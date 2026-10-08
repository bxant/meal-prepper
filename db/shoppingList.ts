import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from '@/lib/id';
import { shoppingListKey, type ShoppingListLine } from '@/lib/shoppingList';

export interface ShoppingListItem {
  id: string;
  recipeId: string | null;
  itemName: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
  createdAt: number;
}

interface RawRow {
  id: string;
  recipe_id: string | null;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  checked: number;
  created_at: number;
}

function toItem(row: RawRow): ShoppingListItem {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    itemName: row.item_name,
    quantity: row.quantity,
    unit: row.unit,
    checked: row.checked === 1,
    createdAt: row.created_at,
  };
}

/**
 * Make `shopping_list_items` match the aggregate built from the saved recipes:
 * insert lines that are new, refresh quantity/unit, and drop rows whose
 * ingredient no longer exists in any recipe. Checkboxes are never touched here,
 * so ticking something off survives the sync.
 */
export async function syncShoppingList(
  db: SQLiteDatabase,
  lines: ShoppingListLine[]
): Promise<ShoppingListItem[]> {
  await db.withTransactionAsync(async () => {
    const existing = await db.getAllAsync<RawRow>('SELECT * FROM shopping_list_items');
    const existingByKey = new Map<string, RawRow>();
    for (const row of existing) {
      existingByKey.set(shoppingListKey(row.item_name, row.unit), row);
    }

    const desiredKeys = new Set(lines.map((line) => line.key));
    for (const [key, row] of existingByKey) {
      if (!desiredKeys.has(key)) {
        await db.runAsync('DELETE FROM shopping_list_items WHERE id = ?', row.id);
      }
    }

    for (const line of lines) {
      const row = existingByKey.get(line.key);
      if (row) {
        if (row.quantity !== line.quantity || row.unit !== line.unit) {
          await db.runAsync(
            'UPDATE shopping_list_items SET quantity = ?, unit = ? WHERE id = ?',
            line.quantity,
            line.unit,
            row.id
          );
        }
      } else {
        await db.runAsync(
          `INSERT INTO shopping_list_items (id, recipe_id, item_name, quantity, unit, barcode, checked, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          newId(),
          line.recipeIds.length === 1 ? line.recipeIds[0] : null,
          line.name,
          line.quantity,
          line.unit,
          null,
          0,
          Date.now()
        );
      }
    }
  });

  return listShoppingListItems(db);
}

export async function listShoppingListItems(db: SQLiteDatabase): Promise<ShoppingListItem[]> {
  const rows = await db.getAllAsync<RawRow>(
    'SELECT * FROM shopping_list_items ORDER BY checked ASC, item_name COLLATE NOCASE ASC'
  );
  return rows.map(toItem);
}

export async function setShoppingListItemChecked(
  db: SQLiteDatabase,
  id: string,
  checked: boolean
): Promise<void> {
  await db.runAsync('UPDATE shopping_list_items SET checked = ? WHERE id = ?', checked ? 1 : 0, id);
}
