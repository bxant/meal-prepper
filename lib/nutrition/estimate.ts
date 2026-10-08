import type { NutrientProfile, NutritionFood, NutritionSource } from './types';
import { toGrams, type GramsMethod } from './units';

/**
 * Recipe nutrition estimate: per ingredient grams × per-gram nutrients,
 * summed, then divided per serving and per 100 g of the mixed (uncooked)
 * ingredients. Pure — no React, SQLite, or network.
 */

export interface NutritionIngredientInput {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  /** Weight the user entered for this ingredient; wins over unit conversion. */
  gramsOverride: number | null;
  /** Food the user picked by hand; wins over name matching. */
  foodIdOverride: string | null;
}

export type IngredientEstimateStatus = 'counted' | 'no-match' | 'no-weight';

export interface IngredientEstimate {
  ingredientId: string;
  food: NutritionFood | null;
  /** True when `food` came from the user's manual pick rather than name matching. */
  foodPicked: boolean;
  grams: number | null;
  gramsMethod: GramsMethod | 'entered' | null;
  nutrients: NutrientProfile | null;
  status: IngredientEstimateStatus;
}

export interface RecipeNutrition {
  ingredients: IngredientEstimate[];
  /** Whole recipe, counted ingredients only. */
  total: NutrientProfile;
  /** Combined raw weight of the counted ingredients. */
  totalGrams: number;
  servings: number;
  /** True when the recipe has no servings set and the whole recipe counts as one. */
  servingsAssumed: boolean;
  perServing: NutrientProfile;
  perServingGrams: number;
  /** Per 100 g of the mixed counted ingredients; null when nothing was weighed. */
  per100g: NutrientProfile | null;
  countedCount: number;
  skippedCount: number;
  /** Some counted weights relied on an assumed density (no volume data for that food). */
  usesAssumedDensity: boolean;
}

export const ZERO_NUTRIENTS: NutrientProfile = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

const KEYS: (keyof NutrientProfile)[] = ['kcal', 'protein', 'carbs', 'fat', 'fiber'];

/** Nutrients in `grams` of a food whose values are given per 100 g. */
export function nutrientsForGrams(per100g: NutrientProfile, grams: number): NutrientProfile {
  return scaleNutrients(per100g, grams / 100);
}

export function scaleNutrients(profile: NutrientProfile, factor: number): NutrientProfile {
  const result = { ...ZERO_NUTRIENTS };
  for (const key of KEYS) result[key] = profile[key] * factor;
  return result;
}

export function addNutrients(a: NutrientProfile, b: NutrientProfile): NutrientProfile {
  const result = { ...ZERO_NUTRIENTS };
  for (const key of KEYS) result[key] = a[key] + b[key];
  return result;
}

export function estimateIngredient(
  ingredient: NutritionIngredientInput,
  source: NutritionSource
): IngredientEstimate {
  const picked = ingredient.foodIdOverride ? source.get(ingredient.foodIdOverride) : null;
  const food = picked ?? source.match(ingredient.name);

  let grams: number | null = null;
  let gramsMethod: IngredientEstimate['gramsMethod'] = null;
  if (ingredient.gramsOverride !== null && Number.isFinite(ingredient.gramsOverride) && ingredient.gramsOverride >= 0) {
    grams = ingredient.gramsOverride;
    gramsMethod = 'entered';
  } else {
    const conversion = toGrams(ingredient.quantity, ingredient.unit, food);
    if (conversion) {
      grams = conversion.grams;
      gramsMethod = conversion.method;
    }
  }

  const base = { ingredientId: ingredient.id, food, foodPicked: picked !== null, grams, gramsMethod };
  if (!food) return { ...base, nutrients: null, status: 'no-match' };
  if (grams === null) return { ...base, nutrients: null, status: 'no-weight' };
  return { ...base, nutrients: nutrientsForGrams(food.per100g, grams), status: 'counted' };
}

/**
 * Estimate a recipe. Ingredients that can't be matched to a food or weighed are
 * reported as skipped and left out of every total, including the per-100 g
 * denominator, so one unknown ingredient doesn't skew the density of the rest.
 */
export function estimateRecipeNutrition(
  ingredients: NutritionIngredientInput[],
  servings: number | null,
  source: NutritionSource
): RecipeNutrition {
  const estimates = ingredients.map((ingredient) => estimateIngredient(ingredient, source));

  let total = { ...ZERO_NUTRIENTS };
  let totalGrams = 0;
  let countedCount = 0;
  let usesAssumedDensity = false;
  for (const estimate of estimates) {
    if (estimate.status !== 'counted' || !estimate.nutrients || estimate.grams === null) continue;
    total = addNutrients(total, estimate.nutrients);
    totalGrams += estimate.grams;
    countedCount += 1;
    if (estimate.gramsMethod === 'volume-assumed-density') usesAssumedDensity = true;
  }

  const servingsAssumed = servings === null || !Number.isFinite(servings) || servings <= 0;
  const servingCount = servingsAssumed ? 1 : (servings as number);

  return {
    ingredients: estimates,
    total,
    totalGrams,
    servings: servingCount,
    servingsAssumed,
    perServing: scaleNutrients(total, 1 / servingCount),
    perServingGrams: totalGrams / servingCount,
    per100g: totalGrams > 0 ? scaleNutrients(total, 100 / totalGrams) : null,
    countedCount,
    skippedCount: estimates.length - countedCount,
    usesAssumedDensity,
  };
}
