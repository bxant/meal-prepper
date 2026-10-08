import { REFERENCE_FOODS } from '../lib/nutrition/referenceFoods';
import { AVERAGE_PRICES } from '../lib/prices/averagePrices';
import { averagePriceEstimator } from '../lib/prices/estimate';
import type { ShoppingListLine } from '../lib/shoppingList';

function line(name: string, quantity: number | null, unit: string | null): ShoppingListLine {
  return { key: `${name}|${unit ?? ''}`, name, quantity, unit, label: '', recipeIds: [], recipeTitles: [] };
}

const centsPerKg = (foodId: string) => AVERAGE_PRICES.find((p) => p.foodId === foodId)!.centsPerKg;

describe('bundled average-price table', () => {
  it('maps every row to a food in the nutrition table, once', () => {
    const foodIds = new Set(REFERENCE_FOODS.map((food) => food.id));
    for (const price of AVERAGE_PRICES) expect(foodIds.has(price.foodId)).toBe(true);
    expect(new Set(AVERAGE_PRICES.map((p) => p.foodId)).size).toBe(AVERAGE_PRICES.length);
  });

  it('holds plausible grocery prices with provenance', () => {
    for (const price of AVERAGE_PRICES) {
      // Between $0.50/kg and $50/kg.
      expect(price.centsPerKg).toBeGreaterThan(50);
      expect(price.centsPerKg).toBeLessThan(5000);
      expect(price.ref).not.toBe('');
      expect(price.period).toMatch(/\d{4}/);
    }
  });
});

describe('averagePriceEstimator', () => {
  it('prices a weighed amount per gram', () => {
    // 2 lb of ground beef ≈ 0.907 kg.
    expect(averagePriceEstimator(line('ground beef', 2, 'lb'))).toBe(
      Math.round(0.907185 * centsPerKg('beef-ground-85'))
    );
  });

  it('converts counts and volumes through the nutrition table', () => {
    // 6 large eggs at 50 g each.
    expect(averagePriceEstimator(line('eggs', 6, null))).toBe(Math.round(0.3 * centsPerKg('egg')));
    const cupOfMilk = averagePriceEstimator(line('milk', 1, 'cup'))!;
    // A cup is ~1/16 gallon.
    expect(cupOfMilk).toBeGreaterThan(15);
    expect(cupOfMilk).toBeLessThan(40);
  });

  it('uses the nutrition table’s standard can weights', () => {
    expect(averagePriceEstimator(line('black beans', 1, 'can'))).toBeGreaterThan(0);
  });

  it('returns null instead of guessing', () => {
    expect(averagePriceEstimator(line('salt', null, null))).toBeNull(); // "to taste"
    expect(averagePriceEstimator(line('saffron threads', 1, 'g'))).toBeNull(); // unknown food
    expect(averagePriceEstimator(line('cumin', 1, 'tsp'))).toBeNull(); // no average price
    expect(averagePriceEstimator(line('onion', 1, 'handful'))).toBeNull(); // can't weigh
  });

  it('exposes the matched average price for display', () => {
    expect(averagePriceEstimator.priceFor('Roma tomatoes')?.foodId).toBe('tomato');
    expect(averagePriceEstimator.priceFor('unobtainium')).toBeNull();
  });
});
