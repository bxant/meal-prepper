/**
 * Pure meal-planning logic: household size, meal scope, quantity scaling, and
 * fitting the resulting grocery list under a budget cap.
 *
 * Like `lib/shoppingList.ts`, nothing here touches React, SQLite, or the
 * network. Prices do not exist yet, so budgeting takes a `PriceEstimator`
 * function; `placeholderEstimator` stands in until a real price source
 * (stores/products/prices) plugs into the same signature.
 *
 * Money is handled in integer cents to avoid floating-point drift.
 */

import {
  buildShoppingList,
  type RecipeIngredients,
  type ShoppingListLine,
} from './shoppingList';

export type MealScope = 'one-meal' | 'two-meals' | 'week';

export const MEAL_SCOPES: readonly MealScope[] = ['one-meal', 'two-meals', 'week'];

export const MEAL_SCOPE_LABELS: Record<MealScope, string> = {
  'one-meal': 'One meal',
  'two-meals': 'Two meals',
  week: 'Whole week',
};

export interface PlanSettings {
  /** People eating each meal. Clamped to a whole number ≥ 1. */
  householdSize: number;
  scope: MealScope;
  /** Meals per day when scope is `week` (default 1: one main meal a day). */
  mealsPerDay?: number;
  /** Spending cap in cents; null means no cap. */
  budgetCapCents: number | null;
}

/** A recipe as the planner sees it. `servings` defaults to 1 when absent. */
export interface PlanRecipe extends RecipeIngredients {
  servings?: number | null;
}

/** One cooked meal in the plan. */
export interface MealSlot {
  /** 0-based position in the plan; trimming removes from the end. */
  index: number;
  recipeId: string;
  recipeTitle: string;
}

/** Estimated price of one shopping line in cents, or null when unknown. */
export type PriceEstimator = (line: ShoppingListLine) => number | null;

export interface PricedLine extends ShoppingListLine {
  estimateCents: number | null;
}

export interface PlanResult {
  /** Every slot the scope asked for, before budget trimming. */
  requestedSlots: MealSlot[];
  /** Slots that fit the budget (all of them when there is no cap). */
  slots: MealSlot[];
  /** Slots removed to get under the cap, in removal order. */
  droppedSlots: MealSlot[];
  lines: PricedLine[];
  totalCents: number;
  /** Lines whose price is unknown; they are excluded from `totalCents`. */
  unpricedCount: number;
  /** True when even the smallest non-empty plan exceeds the cap. */
  overBudget: boolean;
}

export const DEFAULT_SERVINGS = 1;
export const DAYS_PER_WEEK = 7;

function wholeAtLeastOne(value: number | null | undefined, fallback: number): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

/** Clamp a household size input to a whole number of people, at least 1. */
export function normalizeHouseholdSize(value: number | null | undefined): number {
  return wholeAtLeastOne(value, 1);
}

/** Positive servings for a recipe; missing, zero, or invalid values become 1. */
export function recipeServings(recipe: PlanRecipe): number {
  const servings = recipe.servings;
  if (servings === null || servings === undefined || !Number.isFinite(servings) || servings <= 0) {
    return DEFAULT_SERVINGS;
  }
  return servings;
}

/** How many meals a scope covers: 1, 2, or 7 × meals per day. */
export function mealCountForScope(scope: MealScope, mealsPerDay?: number): number {
  switch (scope) {
    case 'one-meal':
      return 1;
    case 'two-meals':
      return 2;
    case 'week':
      return DAYS_PER_WEEK * wholeAtLeastOne(mealsPerDay, 1);
  }
}

/**
 * Fill `mealCount` slots by cycling through the chosen recipes in order,
 * so a week with three recipes cooks A, B, C, A, B, C, A.
 */
export function assignMeals(recipes: PlanRecipe[], mealCount: number): MealSlot[] {
  if (recipes.length === 0) return [];
  const count = Math.max(0, Math.floor(mealCount));
  const slots: MealSlot[] = [];
  for (let index = 0; index < count; index += 1) {
    const recipe = recipes[index % recipes.length];
    slots.push({ index, recipeId: recipe.id, recipeTitle: recipe.title });
  }
  return slots;
}

/**
 * Scale factor for a recipe: servings needed across all its slots divided by
 * the servings one batch makes. 2 slots × 4 people of a 2-serving recipe → 4.
 */
export function scaleFactor(timesCooked: number, householdSize: number, servings: number): number {
  const perBatch = servings > 0 && Number.isFinite(servings) ? servings : DEFAULT_SERVINGS;
  return (Math.max(0, timesCooked) * normalizeHouseholdSize(householdSize)) / perBatch;
}

/** Multiply every numeric ingredient quantity; free-text amounts pass through unchanged. */
export function scaleRecipe(recipe: RecipeIngredients, factor: number): RecipeIngredients {
  return {
    id: recipe.id,
    title: recipe.title,
    ingredients: recipe.ingredients.map((ingredient) => ({
      ...ingredient,
      quantity:
        ingredient.quantity !== null && Number.isFinite(ingredient.quantity)
          ? ingredient.quantity * factor
          : ingredient.quantity,
    })),
  };
}

/**
 * The aggregated shopping list for a set of meal slots: each recipe is scaled
 * to `timesCooked × householdSize / servings`, then merged by the same
 * `buildShoppingList` contract the shopping screen uses.
 */
export function buildPlanShoppingList(
  recipes: PlanRecipe[],
  slots: MealSlot[],
  householdSize: number
): ShoppingListLine[] {
  const timesCooked = new Map<string, number>();
  for (const slot of slots) {
    timesCooked.set(slot.recipeId, (timesCooked.get(slot.recipeId) ?? 0) + 1);
  }

  const scaled: RecipeIngredients[] = [];
  for (const recipe of recipes) {
    const times = timesCooked.get(recipe.id);
    if (!times) continue;
    scaled.push(scaleRecipe(recipe, scaleFactor(times, householdSize, recipeServings(recipe))));
  }
  return buildShoppingList(scaled);
}

/** Attach estimates and total the known prices. */
export function priceLines(
  lines: ShoppingListLine[],
  estimate: PriceEstimator
): { lines: PricedLine[]; totalCents: number; unpricedCount: number } {
  let totalCents = 0;
  let unpricedCount = 0;
  const priced = lines.map((line): PricedLine => {
    const raw = estimate(line);
    const estimateCents = raw !== null && Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : null;
    if (estimateCents === null) {
      unpricedCount += 1;
    } else {
      totalCents += estimateCents;
    }
    return { ...line, estimateCents };
  });
  return { lines: priced, totalCents, unpricedCount };
}

/**
 * Assumed package sizes for the placeholder estimator, keyed by lowercase unit.
 * A line is charged one flat price per package it needs.
 */
const PLACEHOLDER_PACK_SIZES: Record<string, number> = {
  g: 500,
  gram: 500,
  grams: 500,
  kg: 1,
  ml: 1000,
  l: 1,
  liter: 1,
  litre: 1,
  oz: 16,
  lb: 1,
  lbs: 1,
  cup: 4,
  cups: 4,
  tbsp: 16,
  tsp: 48,
  clove: 10,
  cloves: 10,
};

export const PLACEHOLDER_PACK_CENTS = 300;

/**
 * Stand-in price source until real prices exist: $3.00 per package, where the
 * package count comes from a rough per-unit pack size (unitless counts are one
 * item per package). Free-text amounts count as one package. Deliberately
 * crude — it only has to grow with quantity so budget trimming behaves.
 */
export const placeholderEstimator: PriceEstimator = (line) => {
  if (line.quantity === null || line.quantity <= 0) return PLACEHOLDER_PACK_CENTS;
  const packSize = PLACEHOLDER_PACK_SIZES[(line.unit ?? '').trim().toLowerCase()] ?? 1;
  return Math.max(1, Math.ceil(line.quantity / packSize - 1e-9)) * PLACEHOLDER_PACK_CENTS;
};

/**
 * Build the full plan: assign meals for the scope, scale to the household,
 * price the list, and, when a cap is set, drop meals from the end until the
 * known total fits. Whole meals are dropped rather than single ingredients so
 * every remaining recipe stays cookable. Unpriced lines never count against
 * the cap. If even one meal is over the cap, that meal is kept and
 * `overBudget` is set so the UI can say so.
 */
export function planMeals(
  recipes: PlanRecipe[],
  settings: PlanSettings,
  estimate: PriceEstimator = placeholderEstimator
): PlanResult {
  const householdSize = normalizeHouseholdSize(settings.householdSize);
  const requestedSlots = assignMeals(
    recipes,
    mealCountForScope(settings.scope, settings.mealsPerDay)
  );
  const cap =
    settings.budgetCapCents !== null && Number.isFinite(settings.budgetCapCents)
      ? Math.max(0, settings.budgetCapCents)
      : null;

  const evaluate = (slots: MealSlot[]) =>
    priceLines(buildPlanShoppingList(recipes, slots, householdSize), estimate);

  let slots = requestedSlots;
  let priced = evaluate(slots);
  while (cap !== null && priced.totalCents > cap && slots.length > 1) {
    slots = slots.slice(0, -1);
    priced = evaluate(slots);
  }

  return {
    requestedSlots,
    slots,
    droppedSlots: requestedSlots.slice(slots.length).reverse(),
    lines: priced.lines,
    totalCents: priced.totalCents,
    unpricedCount: priced.unpricedCount,
    overBudget: cap !== null && priced.totalCents > cap,
  };
}

/**
 * Line-level alternative to meal dropping: keep lines in the given order while
 * the running known total stays within the cap; unpriced lines are always
 * kept. Useful for an "only buy what fits" view of an existing list.
 */
export function trimLinesToBudget(
  lines: PricedLine[],
  capCents: number
): { kept: PricedLine[]; dropped: PricedLine[]; totalCents: number } {
  const kept: PricedLine[] = [];
  const dropped: PricedLine[] = [];
  let totalCents = 0;
  for (const line of lines) {
    if (line.estimateCents === null) {
      kept.push(line);
    } else if (totalCents + line.estimateCents <= capCents) {
      kept.push(line);
      totalCents += line.estimateCents;
    } else {
      dropped.push(line);
    }
  }
  return { kept, dropped, totalCents };
}

/** Parse a dollar amount typed by the user ("25", "$12.50") into cents; blank or invalid → null. */
export function parseBudgetCents(text: string): number | null {
  const value = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}

/** Format cents as dollars: 1250 → "$12.50". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
