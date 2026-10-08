import {
  buildShoppingList,
  formatQuantity,
  parseQuantity,
  shoppingListKey,
  type RecipeIngredients,
} from '../lib/shoppingList';

describe('parseQuantity', () => {
  it('parses plain decimals', () => {
    expect(parseQuantity('2')).toBe(2);
    expect(parseQuantity(' 2.5 ')).toBe(2.5);
    expect(parseQuantity('0')).toBe(0);
  });

  it('parses simple fractions', () => {
    expect(parseQuantity('1/2')).toBe(0.5);
    expect(parseQuantity('3/4')).toBe(0.75);
  });

  it('keeps free text as non-numeric', () => {
    expect(parseQuantity('a pinch')).toBeNull();
    expect(parseQuantity('to taste')).toBeNull();
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('1/0')).toBeNull();
  });
});

describe('formatQuantity', () => {
  it('trims floating-point noise and trailing zeros', () => {
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(2.5)).toBe('2.5');
    expect(formatQuantity(0.1 + 0.2)).toBe('0.3');
  });
});

describe('shoppingListKey', () => {
  it('normalizes name and unit so case/whitespace variants merge', () => {
    expect(shoppingListKey(' Flour ', null)).toBe(shoppingListKey('flour', ''));
    expect(shoppingListKey('flour', 'CUPS')).toBe('flour|cups');
    expect(shoppingListKey('flour', 'cups')).not.toBe(shoppingListKey('flour', 'g'));
  });
});

describe('buildShoppingList', () => {
  const recipes: RecipeIngredients[] = [
    {
      id: 'r1',
      title: 'Pancakes',
      ingredients: [
        { id: 'i1', name: 'flour', quantity: 2, unit: 'cups', rawText: '2 cups flour' },
        { id: 'i2', name: 'milk', quantity: 1, unit: 'cups', rawText: '1 cups milk' },
        { id: 'i3', name: 'salt', quantity: null, unit: null, rawText: 'a pinch salt' },
      ],
    },
    {
      id: 'r2',
      title: 'Bread',
      ingredients: [
        { id: 'i4', name: 'flour', quantity: 500, unit: 'g', rawText: '500 g flour' },
        { id: 'i5', name: 'flour', quantity: 3, unit: 'cups', rawText: '3 cups flour' },
        { id: 'i6', name: 'Salt', quantity: null, unit: null, rawText: 'Salt to taste' },
      ],
    },
  ];

  it('merges matching ingredients across recipes and sums numeric quantities', () => {
    const lines = buildShoppingList(recipes);
    const flourCups = lines.find((line) => line.key === shoppingListKey('flour', 'cups'));

    expect(flourCups).toBeDefined();
    expect(flourCups?.quantity).toBe(5);
    expect(flourCups?.label).toBe('5 cups');
    expect(flourCups?.name).toBe('flour');
    expect(flourCups?.recipeTitles).toEqual(['Pancakes', 'Bread']);
    expect(flourCups?.recipeIds).toEqual(['r1', 'r2']);
  });

  it('keeps the same ingredient with different units as separate lines', () => {
    const lines = buildShoppingList(recipes);
    const flourLines = lines.filter((line) => shoppingListKey(line.name, line.unit).startsWith('flour|'));

    expect(flourLines).toHaveLength(2);
    expect(flourLines.map((line) => line.label).sort()).toEqual(['5 cups', '500 g']);
    const flourGrams = lines.find((line) => line.key === shoppingListKey('flour', 'g'));
    expect(flourGrams?.quantity).toBe(500);
    expect(flourGrams?.label).toBe('500 g');
  });

  it('merges case-insensitive names and falls back to raw text for non-numeric quantities', () => {
    const lines = buildShoppingList(recipes);
    const salt = lines.find((line) => line.key === shoppingListKey('salt', null));

    expect(salt).toBeDefined();
    expect(salt?.quantity).toBeNull();
    expect(salt?.recipeTitles).toEqual(['Pancakes', 'Bread']);
    expect(salt?.label).toBe('a pinch salt, Salt to taste');
  });

  it('sorts lines by name for a stable shopping order', () => {
    const lines = buildShoppingList(recipes);
    expect(lines.map((line) => line.name)).toEqual(['flour', 'flour', 'milk', 'salt']);
  });

  it('returns an empty list when there are no recipes', () => {
    expect(buildShoppingList([])).toEqual([]);
  });
});
