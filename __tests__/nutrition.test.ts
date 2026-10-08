import { bundledNutritionSource, createBundledSource, nameTokens } from '../lib/nutrition/bundledSource';
import {
  estimateIngredient,
  estimateRecipeNutrition,
  nutrientsForGrams,
  type NutritionIngredientInput,
} from '../lib/nutrition/estimate';
import { describeIngredientEstimate, formatGrams, formatMacro } from '../lib/nutrition/format';
import { REFERENCE_FOODS } from '../lib/nutrition/referenceFoods';
import type { NutritionFood, ReferenceFood } from '../lib/nutrition/types';
import { DEFAULT_GRAMS_PER_ML, parseUnit, toGrams } from '../lib/nutrition/units';

/** Round numbers so float noise doesn't break exact comparisons. */
function r(value: number, places = 4): number {
  return Math.round(value * 10 ** places) / 10 ** places;
}

const flour: NutritionFood = {
  id: 'flour',
  name: 'Flour',
  per100g: { kcal: 364, protein: 10, carbs: 76, fat: 1, fiber: 3 },
  gramsPerMl: 0.5,
  pieces: {},
};
const egg: NutritionFood = {
  id: 'egg',
  name: 'Egg',
  per100g: { kcal: 143, protein: 12.5, carbs: 0.7, fat: 9.5, fiber: 0 },
  gramsPerMl: 1.03,
  pieces: { large: 50, medium: 44, small: 38 },
};
const garlic: NutritionFood = {
  id: 'garlic',
  name: 'Garlic',
  per100g: { kcal: 149, protein: 6.4, carbs: 33, fat: 0.5, fiber: 2.1 },
  gramsPerMl: null,
  pieces: { clove: 3 },
};

describe('parseUnit', () => {
  it('recognises mass, volume and count units with plurals, abbreviations and punctuation', () => {
    expect(parseUnit('g')).toEqual({ kind: 'mass', gramsPer: 1 });
    expect(parseUnit('Grams')).toEqual({ kind: 'mass', gramsPer: 1 });
    expect(parseUnit('kg')).toEqual({ kind: 'mass', gramsPer: 1000 });
    expect(parseUnit('lbs')).toEqual({ kind: 'mass', gramsPer: 453.592 });
    expect(parseUnit('oz.')).toEqual({ kind: 'mass', gramsPer: 28.3495 });
    expect(parseUnit('cups')).toEqual({ kind: 'volume', mlPer: 236.588 });
    expect(parseUnit('Tbsp.')).toEqual({ kind: 'volume', mlPer: 14.7868 });
    expect(parseUnit('tbs')).toEqual({ kind: 'volume', mlPer: 14.7868 });
    expect(parseUnit('teaspoons')).toEqual({ kind: 'volume', mlPer: 4.92892 });
    expect(parseUnit('fl. oz.')).toEqual({ kind: 'volume', mlPer: 29.5735 });
    expect(parseUnit('L')).toEqual({ kind: 'volume', mlPer: 1000 });
    expect(parseUnit('cloves')).toEqual({ kind: 'count', piece: 'clove' });
    expect(parseUnit('lg')).toEqual({ kind: 'count', piece: 'large' });
    expect(parseUnit(null)).toEqual({ kind: 'count', piece: 'piece' });
    expect(parseUnit('')).toEqual({ kind: 'count', piece: 'piece' });
  });

  it('keeps the case-sensitive cookbook shorthand T (tablespoon) vs t (teaspoon)', () => {
    expect(parseUnit('T')).toEqual({ kind: 'volume', mlPer: 14.7868 });
    expect(parseUnit('t')).toEqual({ kind: 'volume', mlPer: 4.92892 });
  });

  it('returns null for units it cannot weigh', () => {
    expect(parseUnit('handful')).toBeNull();
    expect(parseUnit('to taste')).toBeNull();
  });
});

describe('toGrams', () => {
  it('converts mass units exactly, with or without a matched food', () => {
    expect(toGrams(250, 'g', null)).toEqual({ grams: 250, method: 'mass' });
    expect(toGrams(1.5, 'kg', flour)).toEqual({ grams: 1500, method: 'mass' });
    expect(r(toGrams(1, 'lb', null)!.grams)).toBe(453.592);
    expect(r(toGrams(2, 'oz', null)!.grams)).toBe(56.699);
  });

  it('converts volume through the food density', () => {
    // 1 cup = 236.588 ml × 0.5 g/ml
    expect(r(toGrams(1, 'cup', flour)!.grams)).toBe(118.294);
    expect(toGrams(1, 'cup', flour)!.method).toBe('volume');
    expect(r(toGrams(2, 'tbsp', flour)!.grams)).toBe(14.7868);
  });

  it('assumes water density for volume when the food has none, and says so', () => {
    const result = toGrams(1, 'tsp', garlic)!;
    expect(r(result.grams)).toBe(r(4.92892 * DEFAULT_GRAMS_PER_ML));
    expect(result.method).toBe('volume-assumed-density');
  });

  it('converts counts with named sizes and pieces, falling back to the default piece', () => {
    expect(toGrams(2, null, egg)).toEqual({ grams: 88, method: 'piece' }); // 2 × medium
    expect(toGrams(3, 'large', egg)).toEqual({ grams: 150, method: 'piece' });
    expect(toGrams(1, 'jumbo', egg)).toEqual({ grams: 44, method: 'piece' }); // no jumbo → medium
    expect(toGrams(4, 'cloves', garlic)).toEqual({ grams: 12, method: 'piece' });
  });

  it('returns null when the amount cannot be weighed', () => {
    expect(toGrams(null, 'cup', flour)).toBeNull();
    expect(toGrams(1, 'handful', flour)).toBeNull();
    expect(toGrams(1, 'cup', null)).toBeNull(); // volume needs a food
    expect(toGrams(2, null, flour)).toBeNull(); // flour has no piece weight
    expect(toGrams(1, 'clove', egg)).toBeNull(); // named piece the food doesn't have
    expect(toGrams(-1, 'g', null)).toBeNull();
  });
});

describe('bundled source matching', () => {
  const source = bundledNutritionSource;

  it('normalises case, accents, punctuation and simple plurals', () => {
    expect(nameTokens('Jalapeños, diced')).toEqual(['jalapeno', 'diced']);
    expect(nameTokens('Tomatoes')).toEqual(['tomato']);
    expect(nameTokens('2% Milk')).toEqual(['2', 'percent', 'milk']);
  });

  it('prefers the most specific alias', () => {
    expect(source.match('brown sugar')?.id).toBe('brown-sugar');
    expect(source.match('sugar')?.id).toBe('sugar');
    expect(source.match('peanut butter')?.id).toBe('peanut-butter');
    expect(source.match('unsalted butter')?.id).toBe('butter-unsalted');
    expect(source.match('garlic powder')?.id).toBe('garlic-powder');
    expect(source.match('red bell pepper')?.id).toBe('bell-pepper-red');
    expect(source.match('freshly ground black pepper')?.id).toBe('black-pepper');
    expect(source.match('sweet potatoes')?.id).toBe('sweet-potato');
    expect(source.match('chicken broth')?.id).toBe('chicken-broth');
  });

  it('finds aliases inside longer ingredient names', () => {
    expect(source.match('Boneless skinless chicken breasts')?.id).toBe('chicken-breast');
    expect(source.match('large eggs')?.id).toBe('egg');
    expect(source.match('yellow onion, chopped')?.id).toBe('onion');
    expect(source.match('2% milk')?.id).toBe('milk-2');
  });

  it('weighs common kitchen amounts with the bundled table', () => {
    const grams = (name: string, quantity: number, unit: string | null) =>
      toGrams(quantity, unit, source.match(name))?.grams;
    expect(grams('eggs', 2, null)).toBe(100); // recipes mean large eggs
    expect(grams('garlic', 3, 'cloves')).toBe(9);
    expect(grams('diced tomatoes', 1, 'can')).toBe(411); // 14.5 oz can
    expect(r(grams('all-purpose flour', 1, 'cup')!, 0)).toBe(125); // USDA: 1 cup = 125 g
    expect(r(grams('butter', 1, 'stick')!)).toBe(113);
  });

  it('returns null when nothing matches', () => {
    expect(source.match('dragon fruit')).toBeNull();
    expect(source.match('')).toBeNull();
  });

  it('looks foods up by id and searches names and aliases', () => {
    expect(source.get('egg')?.name).toBe('Egg, whole, raw');
    expect(source.get('nope')).toBeNull();
    expect(source.search('ched')[0]?.id).toBe('cheddar');
    expect(source.search('')).toEqual([]);
    expect(source.search('rice', 3)).toHaveLength(3);
  });

  it('works with any table passed in (swappable data)', () => {
    const custom: ReferenceFood = {
      ...flour,
      id: 'teff',
      name: 'Teff flour',
      fdcId: 0,
      usdaDescription: 'test',
      aliases: ['teff'],
    };
    expect(createBundledSource([custom]).match('teff flour')?.id).toBe('teff');
  });
});

describe('reference table integrity', () => {
  it('has unique ids and aliases', () => {
    const ids = REFERENCE_FOODS.map((food) => food.id);
    expect(new Set(ids).size).toBe(ids.length);
    const aliases = REFERENCE_FOODS.flatMap((food) => food.aliases);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it('has plausible per-100 g values', () => {
    for (const food of REFERENCE_FOODS) {
      const { kcal, protein, carbs, fat, fiber } = food.per100g;
      for (const value of [kcal, protein, carbs, fat, fiber]) {
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(kcal).toBeLessThanOrEqual(902);
      expect(protein + carbs + fat).toBeLessThanOrEqual(101);
      if (food.gramsPerMl !== null) {
        expect(food.gramsPerMl).toBeGreaterThan(0);
        expect(food.gramsPerMl).toBeLessThan(2);
      }
    }
  });
});

describe('nutrition estimate', () => {
  const source = createBundledSource([
    { ...flour, fdcId: 1, usdaDescription: 'flour', aliases: ['flour'] },
    { ...egg, fdcId: 2, usdaDescription: 'egg', aliases: ['egg'] },
    {
      id: 'water',
      name: 'Water',
      per100g: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      gramsPerMl: 1,
      pieces: {},
      fdcId: 3,
      usdaDescription: 'water',
      aliases: ['water'],
    },
  ]);

  const ingredient = (
    id: string,
    name: string,
    quantity: number | null,
    unit: string | null,
    overrides: Partial<NutritionIngredientInput> = {}
  ): NutritionIngredientInput => ({
    id,
    name,
    quantity,
    unit,
    gramsOverride: null,
    foodIdOverride: null,
    ...overrides,
  });

  it('scales per-100 g values to a weight', () => {
    expect(nutrientsForGrams(flour.per100g, 250)).toEqual({
      kcal: 910,
      protein: 25,
      carbs: 190,
      fat: 2.5,
      fiber: 7.5,
    });
  });

  it('sums ingredients and divides per serving and per 100 g of the mix', () => {
    const result = estimateRecipeNutrition(
      [
        ingredient('a', 'flour', 200, 'g'),
        ingredient('b', 'eggs', 2, 'large'), // 100 g
        ingredient('c', 'water', 100, 'ml'), // 100 g, 0 kcal
      ],
      4,
      source
    );

    // flour 200 g → 728 kcal; eggs 100 g → 143 kcal; water 0.
    expect(r(result.total.kcal)).toBe(871);
    expect(r(result.total.protein)).toBe(32.5);
    expect(result.totalGrams).toBe(400);
    expect(result.countedCount).toBe(3);
    expect(result.skippedCount).toBe(0);

    expect(result.servings).toBe(4);
    expect(result.servingsAssumed).toBe(false);
    expect(r(result.perServing.kcal)).toBe(217.75);
    expect(result.perServingGrams).toBe(100);

    // 871 kcal in 400 g → 217.75 kcal per 100 g
    expect(r(result.per100g!.kcal)).toBe(217.75);
    expect(r(result.per100g!.fat)).toBe(r((2 + 9.5) / 4));
  });

  it('treats a missing servings count as one serving and flags it', () => {
    const result = estimateRecipeNutrition([ingredient('a', 'flour', 100, 'g')], null, source);
    expect(result.servings).toBe(1);
    expect(result.servingsAssumed).toBe(true);
    expect(r(result.perServing.kcal)).toBe(364);
    expect(r(result.per100g!.kcal)).toBe(364);
  });

  it('leaves skipped ingredients out of every total, including the per-100 g denominator', () => {
    const result = estimateRecipeNutrition(
      [
        ingredient('a', 'flour', 100, 'g'),
        ingredient('b', 'mystery spice', 50, 'g'), // weighed but unmatched
        ingredient('c', 'eggs', null, null), // matched but no quantity
      ],
      2,
      source
    );
    expect(result.countedCount).toBe(1);
    expect(result.skippedCount).toBe(2);
    expect(result.totalGrams).toBe(100);
    expect(r(result.per100g!.kcal)).toBe(364);
    expect(result.ingredients.map((line) => line.status)).toEqual(['counted', 'no-match', 'no-weight']);
  });

  it('uses entered grams and a picked food over automatic conversion and matching', () => {
    const entered = estimateIngredient(ingredient('a', 'eggs', 2, 'large', { gramsOverride: 120 }), source);
    expect(entered.grams).toBe(120);
    expect(entered.gramsMethod).toBe('entered');

    const picked = estimateIngredient(
      ingredient('b', 'my grandma’s dough', 300, 'g', { foodIdOverride: 'flour' }),
      source
    );
    expect(picked.food?.id).toBe('flour');
    expect(picked.foodPicked).toBe(true);
    expect(r(picked.nutrients!.kcal)).toBe(1092);
  });

  it('has no per-100 g figure when nothing could be weighed', () => {
    const result = estimateRecipeNutrition([ingredient('a', 'unknown', 1, 'handful')], 2, source);
    expect(result.per100g).toBeNull();
    expect(result.totalGrams).toBe(0);
    expect(result.perServing.kcal).toBe(0);
  });
});

describe('nutrition formatting', () => {
  it('formats grams and macros at a readable precision', () => {
    expect(formatGrams(7.46)).toBe('7.5 g');
    expect(formatGrams(240.4)).toBe('240 g');
    expect(formatGrams(1234)).toBe('1.23 kg');
    expect(formatMacro(3.14)).toBe('3.1 g');
    expect(formatMacro(42.6)).toBe('43 g');
  });

  it('explains how each ingredient was counted', () => {
    const source = createBundledSource([{ ...flour, fdcId: 1, usdaDescription: 'f', aliases: ['flour'] }]);
    const base = { id: 'a', name: 'flour', gramsOverride: null, foodIdOverride: null };
    expect(describeIngredientEstimate(estimateIngredient({ ...base, quantity: 1, unit: 'cup' }, source), 'cup')).toBe(
      '≈ 118 g · Flour'
    );
    expect(describeIngredientEstimate(estimateIngredient({ ...base, quantity: 50, unit: 'g' }, source), 'g')).toBe(
      '50 g · Flour'
    );
    expect(
      describeIngredientEstimate(estimateIngredient({ ...base, quantity: 1, unit: 'handful' }, source), 'handful')
    ).toBe("Not counted — can't weigh “handful” of Flour; add grams");
    expect(
      describeIngredientEstimate(
        estimateIngredient({ ...base, name: 'saffron', quantity: 1, unit: 'g' }, source),
        'g'
      )
    ).toBe('Not counted — no reference food matched (1 g)');
  });
});
