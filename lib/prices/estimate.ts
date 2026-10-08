/**
 * Expected prices from the bundled US average retail prices
 * (`averagePrices.ts`, BLS + USDA ERS, public domain). Fully offline.
 *
 * A line is matched to a food with the nutrition table's name matching and
 * converted to grams with its units, then priced per gram — so the estimate is
 * the average cost of the amount the recipes call for, not of a whole package.
 * Anything that can't be matched, has no average price, or can't be weighed
 * ("a pinch", "1 can") is `null`: shown as "no average price", never guessed.
 */

import { bundledNutritionSource } from '../nutrition/bundledSource';
import type { NutritionSource } from '../nutrition/types';
import { toGrams } from '../nutrition/units';
import type { PriceEstimator } from '../planner';
import { AVERAGE_PRICES } from './averagePrices';
import type { AveragePrice } from './types';

export function createAveragePriceEstimator(
  prices: readonly AveragePrice[],
  foods: NutritionSource
): PriceEstimator & { priceFor(name: string): AveragePrice | null } {
  const byFood = new Map(prices.map((price) => [price.foodId, price]));
  const priceFor = (name: string) => {
    const food = foods.match(name);
    return food ? (byFood.get(food.id) ?? null) : null;
  };
  const estimate = (line: Parameters<PriceEstimator>[0]) => {
    const food = foods.match(line.name);
    const price = food ? byFood.get(food.id) : undefined;
    if (!food || !price) return null;
    const grams = toGrams(line.quantity, line.unit, food)?.grams;
    if (grams === undefined || grams <= 0) return null;
    return Math.max(1, Math.round((grams / 1000) * price.centsPerKg));
  };
  return Object.assign(estimate, { priceFor });
}

/** The app's price estimator for plan budgets and trip totals. */
export const averagePriceEstimator = createAveragePriceEstimator(AVERAGE_PRICES, bundledNutritionSource);

/** Shown wherever these estimates appear. */
export const AVERAGE_PRICE_LABEL = 'US average prices (BLS / USDA)';
