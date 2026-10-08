import { buildShoppingList, type RecipeIngredients } from '../lib/shoppingList';
import { describeShoppingList, summarizeShoppingList } from '../lib/shoppingListSummary';

const recipes: RecipeIngredients[] = [
  {
    id: 'r1',
    title: 'Pancakes',
    ingredients: [
      { id: 'i1', name: 'Flour', quantity: 2, unit: 'cups', rawText: '2' },
      { id: 'i2', name: 'Eggs', quantity: 2, unit: null, rawText: '2' },
    ],
  },
  {
    id: 'r2',
    title: 'Omelette',
    ingredients: [
      { id: 'i3', name: 'eggs', quantity: 3, unit: null, rawText: '3' },
      { id: 'i4', name: 'Salt', quantity: null, unit: null, rawText: 'a pinch' },
    ],
  },
];

describe('summarizeShoppingList', () => {
  const lines = buildShoppingList(recipes);

  it('counts every aggregate line as remaining before anything is persisted', () => {
    expect(summarizeShoppingList(lines, [])).toEqual({ total: 3, remaining: 3 });
  });

  it('subtracts checked rows, matching on the shared merge key', () => {
    const items = [
      { itemName: 'EGGS ', unit: null, checked: true },
      { itemName: 'Flour', unit: 'cups', checked: false },
    ];
    expect(summarizeShoppingList(lines, items)).toEqual({ total: 3, remaining: 2 });
  });

  it('ignores checked rows whose line no longer exists', () => {
    const items = [{ itemName: 'Butter', unit: null, checked: true }];
    expect(summarizeShoppingList(lines, items)).toEqual({ total: 3, remaining: 3 });
  });

  it('does not match a checked row with a different unit', () => {
    const items = [{ itemName: 'Flour', unit: 'g', checked: true }];
    expect(summarizeShoppingList(lines, items).remaining).toBe(3);
  });

  it('is empty with no recipes', () => {
    expect(summarizeShoppingList([], [])).toEqual({ total: 0, remaining: 0 });
  });
});

describe('describeShoppingList', () => {
  it('describes each state', () => {
    expect(describeShoppingList({ total: 0, remaining: 0 })).toBe('Nothing to buy yet');
    expect(describeShoppingList({ total: 1, remaining: 1 })).toBe('1 item to buy');
    expect(describeShoppingList({ total: 4, remaining: 4 })).toBe('4 items to buy');
    expect(describeShoppingList({ total: 4, remaining: 1 })).toBe('1 item left to buy (of 4)');
    expect(describeShoppingList({ total: 4, remaining: 0 })).toBe('All done — 4 items checked off');
  });
});
