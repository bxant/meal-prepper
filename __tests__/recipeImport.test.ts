import { normalizeFractions, parseIngredientLine, parseRecipeText } from '../lib/recipeImport';

describe('parseIngredientLine', () => {
  it('splits quantity, unit and name, as decimals the form accepts', () => {
    expect(parseIngredientLine('2 cups all-purpose flour')).toEqual({ name: 'All-purpose flour', quantity: '2', unit: 'cups' });
    expect(parseIngredientLine('1 1/2 tsp. baking soda')).toEqual({ name: 'Baking soda', quantity: '1.5', unit: 'tsp' });
    expect(parseIngredientLine('½ cup sugar')).toEqual({ name: 'Sugar', quantity: '0.5', unit: 'cup' });
    expect(parseIngredientLine('1½ lbs ground beef')).toEqual({ name: 'Ground beef', quantity: '1.5', unit: 'lbs' });
    expect(parseIngredientLine('2 T olive oil')).toEqual({ name: 'Olive oil', quantity: '2', unit: 'T' });
  });

  it('handles counts, ranges, package sizes and prep notes', () => {
    expect(parseIngredientLine('3 large eggs')).toEqual({ name: 'Eggs', quantity: '3', unit: 'large' });
    expect(parseIngredientLine('2-3 cloves garlic, minced')).toEqual({ name: 'Garlic', quantity: '2', unit: 'cloves' });
    expect(parseIngredientLine('1 (15 oz) can black beans, drained')).toEqual({ name: 'Black beans', quantity: '1', unit: 'can' });
    expect(parseIngredientLine('1 onion, diced')).toEqual({ name: 'Onion', quantity: '1', unit: '' });
    expect(parseIngredientLine('• 4 tomatoes')).toEqual({ name: 'Tomatoes', quantity: '4', unit: '' });
    expect(parseIngredientLine('a pinch of salt')).toEqual({ name: 'Salt', quantity: '1', unit: 'pinch' });
  });

  it('keeps unquantified ingredients as free text and rejects non-ingredients', () => {
    expect(parseIngredientLine('Salt and pepper to taste')).toEqual({ name: 'Salt and pepper', quantity: '', unit: '' });
    expect(parseIngredientLine('12')).toBeNull();
    expect(parseIngredientLine('---')).toBeNull();
  });
});

describe('normalizeFractions', () => {
  it('turns unicode fractions into ASCII', () => {
    expect(normalizeFractions('1¾ cups and ⅓ tsp')).toBe('1 3/4 cups and 1/3 tsp');
  });
});

describe('parseRecipeText', () => {
  it('reads a cookbook page: title, servings, ingredients up to the method', () => {
    const text = [
      'Weeknight Chili',
      'Serves 4 · Prep time 10 minutes',
      'INGREDIENTS',
      '1 lb ground beef',
      '1 onion, diced',
      '2 cloves garlic',
      '1 (15 oz) can kidney beans',
      '2 tbsp chili powder',
      'Salt to taste',
      'For the topping:',
      '1/2 cup shredded cheddar',
      'DIRECTIONS',
      '1. Brown the beef in a large pot over medium heat, about 8 minutes.',
      '2. Add 1 cup water and simmer.',
    ].join('\n');

    const recipe = parseRecipeText(text);
    expect(recipe.title).toBe('Weeknight Chili');
    expect(recipe.servings).toBe(4);
    expect(recipe.ingredients.map((i) => [i.quantity, i.unit, i.name])).toEqual([
      ['1', 'lb', 'Ground beef'],
      ['1', '', 'Onion'],
      ['2', 'cloves', 'Garlic'],
      ['1', 'can', 'Kidney beans'],
      ['2', 'tbsp', 'Chili powder'],
      ['', '', 'Salt'],
      ['0.5', 'cup', 'Shredded cheddar'],
    ]);
  });

  it('reads a social-media screenshot with no ingredients heading', () => {
    const text = [
      '9:41',
      '@easyeats',
      'Creamy Garlic Pasta 🍝',
      '♥ 12.3k likes',
      '8 oz spaghetti',
      '3 tbsp butter',
      '4 cloves garlic',
      '1 cup heavy cream',
      '½ cup parmesan',
      'Method',
      'Boil pasta...',
      '#pasta #dinner',
    ].join('\n');

    const recipe = parseRecipeText(text);
    expect(recipe.title).toBe('Creamy Garlic Pasta 🍝');
    expect(recipe.servings).toBeNull();
    expect(recipe.ingredients.map((i) => i.name)).toEqual([
      'Spaghetti',
      'Butter',
      'Garlic',
      'Heavy cream',
      'Parmesan',
    ]);
  });

  it('returns no rows rather than inventing them', () => {
    expect(parseRecipeText('Just a photo of my dog').ingredients).toEqual([]);
    expect(parseRecipeText('')).toEqual({ title: null, servings: null, ingredients: [] });
  });
});
