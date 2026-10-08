/**
 * Pure "how much is left to buy" summary for the shopping list.
 *
 * Works from the aggregate lines (`buildShoppingList`) plus whatever rows are
 * already persisted, so callers can show a count without first syncing
 * `shopping_list_items`: a line with no persisted row counts as unchecked,
 * exactly as `syncShoppingList` would insert it.
 */

import { shoppingListKey } from './shoppingList';

export interface ShoppingListSummary {
  total: number;
  remaining: number;
}

export const EMPTY_SUMMARY: ShoppingListSummary = { total: 0, remaining: 0 };

type PersistedItem = { itemName: string; unit: string | null; checked: boolean };

/** Lines not yet ticked off: what is still left to buy. */
export function remainingLines<T extends { key: string }>(lines: T[], items: PersistedItem[]): T[] {
  const checkedKeys = new Set(
    items.filter((item) => item.checked).map((item) => shoppingListKey(item.itemName, item.unit))
  );
  return lines.filter((line) => !checkedKeys.has(line.key));
}

export function summarizeShoppingList(
  lines: { key: string }[],
  items: PersistedItem[]
): ShoppingListSummary {
  return { total: lines.length, remaining: remainingLines(lines, items).length };
}

function itemCount(count: number): string {
  return count === 1 ? '1 item' : `${count} items`;
}

/** One-line status for banners and headers. */
export function describeShoppingList(summary: ShoppingListSummary): string {
  if (summary.total === 0) return 'Nothing to buy yet';
  if (summary.remaining === 0) return `All done — ${itemCount(summary.total)} checked off`;
  if (summary.remaining === summary.total) return `${itemCount(summary.remaining)} to buy`;
  return `${itemCount(summary.remaining)} left to buy (of ${summary.total})`;
}
