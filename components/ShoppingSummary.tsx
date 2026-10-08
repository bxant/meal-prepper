import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { listRecipesWithIngredients } from '@/db/recipes';
import { listShoppingListItems } from '@/db/shoppingList';
import { buildShoppingList } from '@/lib/shoppingList';
import {
  EMPTY_SUMMARY,
  summarizeShoppingList,
  type ShoppingListSummary,
} from '@/lib/shoppingListSummary';

interface ShoppingSummaryValue {
  summary: ShoppingListSummary;
  /** Recompute from the DB (read-only); call when a screen regains focus. */
  refresh: () => Promise<void>;
  /** Push a summary the caller already computed, e.g. right after a checkbox toggle. */
  setSummary: (summary: ShoppingListSummary) => void;
}

const ShoppingSummaryContext = createContext<ShoppingSummaryValue | null>(null);

/** Shares the "items left to buy" count between the tab badge and the screens. */
export function ShoppingSummaryProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [summary, setSummary] = useState<ShoppingListSummary>(EMPTY_SUMMARY);

  const refresh = useCallback(async () => {
    const [recipes, items] = await Promise.all([
      listRecipesWithIngredients(db),
      listShoppingListItems(db),
    ]);
    setSummary(summarizeShoppingList(buildShoppingList(recipes), items));
  }, [db]);

  useEffect(() => {
    refresh().catch(() => {
      // Local-only read; the badge just stays empty on failure.
    });
  }, [refresh]);

  const value = useMemo(() => ({ summary, refresh, setSummary }), [summary, refresh]);
  return (
    <ShoppingSummaryContext.Provider value={value}>{children}</ShoppingSummaryContext.Provider>
  );
}

export function useShoppingSummary(): ShoppingSummaryValue {
  const value = useContext(ShoppingSummaryContext);
  if (!value) throw new Error('useShoppingSummary must be used inside ShoppingSummaryProvider');
  return value;
}
