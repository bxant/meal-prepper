/**
 * Pure helpers for the recipe → shopping-list contract.
 *
 * Nothing here touches React, SQLite, or the network: given already-stored
 * recipe/ingredient data, `buildShoppingList` produces the aggregate list the
 * shopping screen persists and renders. Kept dependency-free so it can be
 * unit-tested directly.
 */

export interface StoredIngredient {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  rawText: string | null;
}

export interface RecipeIngredients {
  id: string;
  title: string;
  ingredients: StoredIngredient[];
}

export interface ShoppingListLine {
  /** Stable identity for a merged line: normalized name + unit. */
  key: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  /** Human label: "2 cups", or the free-text fallback when quantity is not numeric. */
  label: string;
  recipeIds: string[];
  recipeTitles: string[];
}

/** Merge key shared by the aggregator and the persisted `shopping_list_items` rows. */
export function shoppingListKey(name: string, unit: string | null): string {
  return `${name.trim().toLowerCase()}|${(unit ?? '').trim().toLowerCase()}`;
}

/**
 * Parse a free-text quantity ("2", "2.5", "1/2") into a number.
 * Anything else ("a pinch", "to taste") stays free text and returns null.
 */
export function parseQuantity(text: string): number | null {
  const value = text.trim();
  if (value === '') return null;

  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(value);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    const result = Number(fraction[1]) / denominator;
    return Number.isFinite(result) ? result : null;
  }

  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

/** Trim floating-point noise and trailing zeros: 2.0 → "2", 2.5 → "2.5". */
export function formatQuantity(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * Combine the ingredients of every saved recipe into one aggregate list.
 *
 * Lines merge when name and unit match (case-insensitive, trimmed).
 * Numeric quantities are summed; non-numeric quantities fall back to their
 * raw text so free-text amounts ("a pinch") survive the merge.
 * The result is sorted by name for a stable shopping order.
 */
export function buildShoppingList(recipes: RecipeIngredients[]): ShoppingListLine[] {
  interface Group {
    name: string;
    unit: string | null;
    numericSum: number;
    hasNumeric: boolean;
    fallbackLabels: string[];
    recipeIds: string[];
    recipeTitles: string[];
  }

  const groups = new Map<string, Group>();

  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      const name = ingredient.name.trim();
      if (name === '') continue;

      const key = shoppingListKey(name, ingredient.unit);
      let group = groups.get(key);
      if (!group) {
        group = {
          name,
          unit: ingredient.unit,
          numericSum: 0,
          hasNumeric: false,
          fallbackLabels: [],
          recipeIds: [],
          recipeTitles: [],
        };
        groups.set(key, group);
      }

      if (ingredient.quantity !== null && Number.isFinite(ingredient.quantity)) {
        group.numericSum += ingredient.quantity;
        group.hasNumeric = true;
      } else {
        const fallback = (ingredient.rawText ?? name).trim();
        if (fallback !== '' && !group.fallbackLabels.includes(fallback)) {
          group.fallbackLabels.push(fallback);
        }
      }

      if (!group.recipeIds.includes(recipe.id)) {
        group.recipeIds.push(recipe.id);
        group.recipeTitles.push(recipe.title);
      }
    }
  }

  const lines: ShoppingListLine[] = [];
  for (const [key, group] of groups) {
    const quantity = group.hasNumeric ? Math.round(group.numericSum * 1000) / 1000 : null;
    const unitSuffix = group.unit ? ` ${group.unit}` : '';
    const label =
      quantity !== null
        ? `${formatQuantity(quantity)}${unitSuffix}`
        : group.fallbackLabels.join(', ') || group.name;

    lines.push({
      key,
      name: group.name,
      quantity,
      unit: group.unit,
      label,
      recipeIds: group.recipeIds,
      recipeTitles: group.recipeTitles,
    });
  }

  lines.sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    if (byName !== 0) return byName;
    return (a.unit ?? '').localeCompare(b.unit ?? '');
  });

  return lines;
}
