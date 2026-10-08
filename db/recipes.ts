import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from '@/lib/id';
import type { RecipeIngredients, StoredIngredient } from '@/lib/shoppingList';

export interface RecipeSummary {
  id: string;
  title: string;
  ingredientCount: number;
  createdAt: number;
}

/** A stored ingredient plus the user's nutrition overrides (NULL = derive automatically). */
export interface RecipeIngredientDetail extends StoredIngredient {
  grams: number | null;
  nutritionFoodId: string | null;
}

export interface RecipeWithIngredients extends RecipeIngredients {
  source: 'manual' | 'photo';
  createdAt: number;
  /** NULL until the user sets how many servings the recipe makes. */
  servings: number | null;
  ingredients: RecipeIngredientDetail[];
}

export interface NewIngredientInput {
  name: string;
  quantity: number | null;
  unit: string | null;
  rawText: string;
  parsedOk: boolean;
  /** Optional measured weight, used for the nutrition estimate. */
  grams: number | null;
}

export interface NewRecipeInput {
  title: string;
  servings: number | null;
  ingredients: NewIngredientInput[];
}

export async function insertRecipeWithIngredients(
  db: SQLiteDatabase,
  input: NewRecipeInput
): Promise<string> {
  const recipeId = newId();
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO recipes (id, title, source, notes, photo_path, servings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      recipeId,
      input.title,
      'manual',
      null,
      null,
      input.servings,
      now,
      now
    );

    for (let position = 0; position < input.ingredients.length; position += 1) {
      const ingredient = input.ingredients[position];
      await db.runAsync(
        'INSERT INTO ingredients (id, recipe_id, position, raw_text, name, quantity, unit, parsed_ok, grams) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        newId(),
        recipeId,
        position,
        ingredient.rawText,
        ingredient.name,
        ingredient.quantity,
        ingredient.unit,
        ingredient.parsedOk ? 1 : 0,
        ingredient.grams
      );
    }
  });

  return recipeId;
}

export async function listRecipes(db: SQLiteDatabase): Promise<RecipeSummary[]> {
  const rows = await db.getAllAsync<{
    id: string;
    title: string;
    created_at: number;
    ingredient_count: number;
  }>(
    `SELECT r.id, r.title, r.created_at, COUNT(i.id) AS ingredient_count
     FROM recipes r
     LEFT JOIN ingredients i ON i.recipe_id = r.id
     GROUP BY r.id
     ORDER BY r.created_at DESC`
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    ingredientCount: row.ingredient_count,
    createdAt: row.created_at,
  }));
}

export async function getRecipeWithIngredients(
  db: SQLiteDatabase,
  recipeId: string
): Promise<RecipeWithIngredients | null> {
  const recipe = await db.getFirstAsync<{
    id: string;
    title: string;
    source: string;
    servings: number | null;
    created_at: number;
  }>('SELECT id, title, source, servings, created_at FROM recipes WHERE id = ?', recipeId);

  if (!recipe) return null;

  const ingredientRows = await db.getAllAsync<{
    id: string;
    name: string;
    quantity: number | null;
    unit: string | null;
    raw_text: string | null;
    grams: number | null;
    nutrition_food_id: string | null;
  }>(
    'SELECT id, name, quantity, unit, raw_text, grams, nutrition_food_id FROM ingredients WHERE recipe_id = ? ORDER BY position',
    recipeId
  );

  return {
    id: recipe.id,
    title: recipe.title,
    source: recipe.source === 'photo' ? 'photo' : 'manual',
    createdAt: recipe.created_at,
    servings: recipe.servings,
    ingredients: ingredientRows.map(
      (row): RecipeIngredientDetail => ({
        id: row.id,
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        rawText: row.raw_text,
        grams: row.grams,
        nutritionFoodId: row.nutrition_food_id,
      })
    ),
  };
}

export async function updateRecipeServings(
  db: SQLiteDatabase,
  recipeId: string,
  servings: number | null
): Promise<void> {
  await db.runAsync(
    'UPDATE recipes SET servings = ?, updated_at = ? WHERE id = ?',
    servings,
    Date.now(),
    recipeId
  );
}

/** Save the user's nutrition overrides for one ingredient (NULL = back to automatic). */
export async function updateIngredientNutrition(
  db: SQLiteDatabase,
  ingredientId: string,
  overrides: { grams: number | null; nutritionFoodId: string | null }
): Promise<void> {
  await db.runAsync(
    'UPDATE ingredients SET grams = ?, nutrition_food_id = ? WHERE id = ?',
    overrides.grams,
    overrides.nutritionFoodId,
    ingredientId
  );
}

/** All recipes with their ingredients — the input for the shopping-list aggregate. */
export async function listRecipesWithIngredients(db: SQLiteDatabase): Promise<RecipeIngredients[]> {
  const recipes = await db.getAllAsync<{ id: string; title: string }>(
    'SELECT id, title FROM recipes ORDER BY created_at'
  );
  const ingredientRows = await db.getAllAsync<{
    id: string;
    recipe_id: string;
    name: string;
    quantity: number | null;
    unit: string | null;
    raw_text: string | null;
  }>(
    'SELECT id, recipe_id, name, quantity, unit, raw_text FROM ingredients ORDER BY recipe_id, position'
  );

  const ingredientsByRecipe = new Map<string, StoredIngredient[]>();
  for (const row of ingredientRows) {
    const ingredient: StoredIngredient = {
      id: row.id,
      name: row.name,
      quantity: row.quantity,
      unit: row.unit,
      rawText: row.raw_text,
    };
    const list = ingredientsByRecipe.get(row.recipe_id);
    if (list) {
      list.push(ingredient);
    } else {
      ingredientsByRecipe.set(row.recipe_id, [ingredient]);
    }
  }

  return recipes.map((recipe) => ({
    id: recipe.id,
    title: recipe.title,
    ingredients: ingredientsByRecipe.get(recipe.id) ?? [],
  }));
}
