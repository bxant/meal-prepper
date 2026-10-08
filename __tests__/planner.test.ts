import {
  assignMeals,
  buildPlanShoppingList,
  formatCents,
  mealCountForScope,
  normalizeHouseholdSize,
  parseBudgetCents,
  placeholderEstimator,
  PLACEHOLDER_PACK_CENTS,
  planMeals,
  priceLines,
  recipeServings,
  scaleFactor,
  scaleRecipe,
  trimLinesToBudget,
  type PlanRecipe,
  type PriceEstimator,
} from '../lib/planner';
import type { ShoppingListLine } from '../lib/shoppingList';

function ingredient(name: string, quantity: number | null, unit: string | null, rawText?: string) {
  return { id: `${name}-${unit}`, name, quantity, unit, rawText: rawText ?? null };
}

const pasta: PlanRecipe = {
  id: 'r-pasta',
  title: 'Pasta',
  servings: 2,
  ingredients: [
    ingredient('Spaghetti', 200, 'g'),
    ingredient('Garlic', 2, 'cloves'),
    ingredient('Salt', null, null, 'a pinch'),
  ],
};

const tacos: PlanRecipe = {
  id: 'r-tacos',
  title: 'Tacos',
  ingredients: [ingredient('Tortillas', 2, null), ingredient('garlic', 1, 'cloves')],
};

function line(overrides: Partial<ShoppingListLine>): ShoppingListLine {
  return {
    key: 'x|',
    name: 'x',
    quantity: 1,
    unit: null,
    label: '1',
    recipeIds: [],
    recipeTitles: [],
    ...overrides,
  };
}

describe('normalizeHouseholdSize / recipeServings', () => {
  it('clamps household size to a whole number of at least 1', () => {
    expect(normalizeHouseholdSize(4)).toBe(4);
    expect(normalizeHouseholdSize(2.7)).toBe(2);
    expect(normalizeHouseholdSize(0)).toBe(1);
    expect(normalizeHouseholdSize(-3)).toBe(1);
    expect(normalizeHouseholdSize(NaN)).toBe(1);
    expect(normalizeHouseholdSize(null)).toBe(1);
  });

  it('defaults servings to 1 when missing or invalid', () => {
    expect(recipeServings(pasta)).toBe(2);
    expect(recipeServings(tacos)).toBe(1);
    expect(recipeServings({ ...tacos, servings: null })).toBe(1);
    expect(recipeServings({ ...tacos, servings: 0 })).toBe(1);
    expect(recipeServings({ ...tacos, servings: -2 })).toBe(1);
  });
});

describe('mealCountForScope', () => {
  it('maps scopes to meal counts', () => {
    expect(mealCountForScope('one-meal')).toBe(1);
    expect(mealCountForScope('two-meals')).toBe(2);
    expect(mealCountForScope('week')).toBe(7);
    expect(mealCountForScope('week', 2)).toBe(14);
    expect(mealCountForScope('week', 0)).toBe(7);
  });
});

describe('assignMeals', () => {
  it('cycles through recipes in order', () => {
    const slots = assignMeals([pasta, tacos], 5);
    expect(slots.map((slot) => slot.recipeId)).toEqual([
      'r-pasta',
      'r-tacos',
      'r-pasta',
      'r-tacos',
      'r-pasta',
    ]);
    expect(slots.map((slot) => slot.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('returns no slots without recipes', () => {
    expect(assignMeals([], 7)).toEqual([]);
  });
});

describe('scaling', () => {
  it('computes servings needed over servings per batch', () => {
    expect(scaleFactor(1, 1, 1)).toBe(1);
    expect(scaleFactor(2, 4, 2)).toBe(4);
    expect(scaleFactor(1, 3, 4)).toBe(0.75);
    expect(scaleFactor(1, 2, 0)).toBe(2);
  });

  it('scales numeric quantities and leaves free text alone', () => {
    const scaled = scaleRecipe(pasta, 1.5);
    expect(scaled.ingredients.map((i) => i.quantity)).toEqual([300, 3, null]);
    expect(scaled.ingredients[2].rawText).toBe('a pinch');
    expect(pasta.ingredients[0].quantity).toBe(200);
  });

  it('builds a merged list scaled per recipe usage and household', () => {
    // Household of 4: pasta cooked once (servings 2 → ×2), tacos once (servings 1 → ×4).
    const slots = assignMeals([pasta, tacos], 2);
    const lines = buildPlanShoppingList([pasta, tacos], slots, 4);
    const byName = Object.fromEntries(lines.map((l) => [l.name.toLowerCase(), l]));
    expect(byName.spaghetti.quantity).toBe(400);
    expect(byName.tortillas.quantity).toBe(8);
    expect(byName.garlic.quantity).toBe(2 * 2 + 1 * 4);
    expect(byName.garlic.recipeIds).toEqual(['r-pasta', 'r-tacos']);
    expect(byName.salt.quantity).toBeNull();
    expect(byName.salt.label).toBe('a pinch');
  });

  it('ignores recipes that are not in any slot', () => {
    const lines = buildPlanShoppingList([pasta, tacos], assignMeals([tacos], 1), 1);
    expect(lines.map((l) => l.name)).toEqual(['garlic', 'Tortillas']);
  });
});

describe('pricing', () => {
  it('placeholder charges per assumed package', () => {
    expect(placeholderEstimator(line({ quantity: 400, unit: 'g' }))).toBe(PLACEHOLDER_PACK_CENTS);
    expect(placeholderEstimator(line({ quantity: 501, unit: 'g' }))).toBe(2 * PLACEHOLDER_PACK_CENTS);
    expect(placeholderEstimator(line({ quantity: 3, unit: null }))).toBe(3 * PLACEHOLDER_PACK_CENTS);
    expect(placeholderEstimator(line({ quantity: 0.25, unit: 'Unknown' }))).toBe(PLACEHOLDER_PACK_CENTS);
    expect(placeholderEstimator(line({ quantity: null }))).toBe(PLACEHOLDER_PACK_CENTS);
  });

  it('totals known prices and counts unknown ones', () => {
    const estimate: PriceEstimator = (l) => (l.name === 'unknown' ? null : 125.4);
    const result = priceLines([line({ name: 'a' }), line({ name: 'unknown' })], estimate);
    expect(result.totalCents).toBe(125);
    expect(result.unpricedCount).toBe(1);
    expect(result.lines[1].estimateCents).toBeNull();
  });
});

describe('planMeals', () => {
  // $1 per line regardless of size keeps the arithmetic obvious.
  const flat: PriceEstimator = () => 100;

  it('plans every slot when there is no cap', () => {
    const result = planMeals(
      [pasta, tacos],
      { householdSize: 2, scope: 'week', budgetCapCents: null },
      flat
    );
    expect(result.slots).toHaveLength(7);
    expect(result.droppedSlots).toEqual([]);
    expect(result.totalCents).toBe(result.lines.length * 100);
    expect(result.overBudget).toBe(false);
  });

  it('drops meals from the end until the total fits', () => {
    const perGram: PriceEstimator = (l) => (l.quantity ?? 1) * 1;
    // One pasta meal for 2 → 200 g spaghetti (200) + 2 garlic (2) + salt (1) = 203.
    // Adding tacos adds tortillas 4 + garlic 2 → 209, so a cap of 205 keeps one meal.
    const result = planMeals(
      [pasta, tacos],
      { householdSize: 2, scope: 'two-meals', budgetCapCents: 205 },
      perGram
    );
    expect(result.requestedSlots).toHaveLength(2);
    expect(result.slots.map((s) => s.recipeId)).toEqual(['r-pasta']);
    expect(result.droppedSlots.map((s) => s.recipeId)).toEqual(['r-tacos']);
    expect(result.totalCents).toBe(203);
    expect(result.overBudget).toBe(false);
  });

  it('keeps one meal and flags overBudget when nothing fits', () => {
    const result = planMeals(
      [pasta],
      { householdSize: 1, scope: 'week', budgetCapCents: 50 },
      flat
    );
    expect(result.slots).toHaveLength(1);
    expect(result.droppedSlots).toHaveLength(6);
    expect(result.overBudget).toBe(true);
  });

  it('does not count unpriced lines against the cap', () => {
    const result = planMeals(
      [tacos],
      { householdSize: 1, scope: 'one-meal', budgetCapCents: 0 },
      () => null
    );
    expect(result.totalCents).toBe(0);
    expect(result.unpricedCount).toBe(2);
    expect(result.overBudget).toBe(false);
  });

  it('defaults to the placeholder estimator', () => {
    const result = planMeals([tacos], {
      householdSize: 1,
      scope: 'one-meal',
      budgetCapCents: null,
    });
    // 2 tortillas (2 packs) + 1 garlic clove (1 pack).
    expect(result.totalCents).toBe(3 * PLACEHOLDER_PACK_CENTS);
  });

  it('returns an empty plan without recipes', () => {
    const result = planMeals([], { householdSize: 3, scope: 'week', budgetCapCents: 1000 });
    expect(result.slots).toEqual([]);
    expect(result.lines).toEqual([]);
    expect(result.overBudget).toBe(false);
  });
});

describe('trimLinesToBudget', () => {
  it('keeps lines in order while they fit, always keeping unpriced lines', () => {
    const lines = [
      { ...line({ name: 'a' }), estimateCents: 300 },
      { ...line({ name: 'b' }), estimateCents: 500 },
      { ...line({ name: 'c' }), estimateCents: null },
      { ...line({ name: 'd' }), estimateCents: 200 },
    ];
    const result = trimLinesToBudget(lines, 600);
    expect(result.kept.map((l) => l.name)).toEqual(['a', 'c', 'd']);
    expect(result.dropped.map((l) => l.name)).toEqual(['b']);
    expect(result.totalCents).toBe(500);
  });
});

describe('budget text helpers', () => {
  it('parses dollar input into cents', () => {
    expect(parseBudgetCents('25')).toBe(2500);
    expect(parseBudgetCents('$12.50')).toBe(1250);
    expect(parseBudgetCents('1,200.5')).toBe(120050);
    expect(parseBudgetCents('.99')).toBe(99);
    expect(parseBudgetCents('')).toBeNull();
    expect(parseBudgetCents('abc')).toBeNull();
    expect(parseBudgetCents('1.234')).toBeNull();
    expect(parseBudgetCents('-5')).toBeNull();
  });

  it('formats cents as dollars', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(1250)).toBe('$12.50');
    expect(formatCents(5)).toBe('$0.05');
  });
});
