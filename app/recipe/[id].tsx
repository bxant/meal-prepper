import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IngredientNutritionEditor } from '@/components/IngredientNutritionEditor';
import { NutritionCard } from '@/components/NutritionCard';
import {
  getRecipeWithIngredients,
  updateIngredientNutrition,
  updateRecipeServings,
  type RecipeWithIngredients,
} from '@/db/recipes';
import { bundledNutritionSource } from '@/lib/nutrition/bundledSource';
import { estimateRecipeNutrition } from '@/lib/nutrition/estimate';
import { describeIngredientEstimate } from '@/lib/nutrition/format';
import { formatQuantity } from '@/lib/shoppingList';

function ingredientLine(ingredient: RecipeWithIngredients['ingredients'][number]): string {
  if (ingredient.quantity !== null) {
    const unit = ingredient.unit ? `${ingredient.unit} ` : '';
    return `${formatQuantity(ingredient.quantity)} ${unit}${ingredient.name}`;
  }
  return ingredient.rawText?.trim() || ingredient.name;
}

export default function RecipeDetailScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<RecipeWithIngredients | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const nutrition = useMemo(
    () =>
      recipe
        ? estimateRecipeNutrition(
            recipe.ingredients.map((ingredient) => ({
              id: ingredient.id,
              name: ingredient.name,
              quantity: ingredient.quantity,
              unit: ingredient.unit,
              gramsOverride: ingredient.grams,
              foodIdOverride: ingredient.nutritionFoodId,
            })),
            recipe.servings,
            bundledNutritionSource
          )
        : null,
    [recipe]
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getRecipeWithIngredients(db, id)
        .then((row) => {
          if (active) {
            setRecipe(row);
            setLoaded(true);
          }
        })
        .catch(() => {
          if (active) setLoaded(true);
        });
      return () => {
        active = false;
      };
    }, [db, id])
  );

  if (!loaded) {
    return null;
  }

  const changeServings = async (delta: number) => {
    if (!recipe) return;
    // "Not set" steps to 1 first; unset is already counted as a single serving.
    const next = recipe.servings === null ? 1 : Math.max(1, recipe.servings + delta);
    if (next === recipe.servings) return;
    const previous = recipe;
    setRecipe({ ...recipe, servings: next });
    setSaveError(null);
    try {
      await updateRecipeServings(db, recipe.id, next);
    } catch {
      setRecipe(previous);
      setSaveError('Could not save servings. Please try again.');
    }
  };

  const saveIngredientNutrition = async (
    ingredientId: string,
    overrides: { grams: number | null; nutritionFoodId: string | null }
  ) => {
    if (!recipe) return;
    setSaveError(null);
    try {
      await updateIngredientNutrition(db, ingredientId, overrides);
      setRecipe({
        ...recipe,
        ingredients: recipe.ingredients.map((ingredient) =>
          ingredient.id === ingredientId
            ? { ...ingredient, grams: overrides.grams, nutritionFoodId: overrides.nutritionFoodId }
            : ingredient
        ),
      });
      setEditingId(null);
    } catch {
      setSaveError('Could not save that ingredient. Please try again.');
    }
  };

  if (!recipe || !nutrition) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyBody}>Recipe not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: recipe.title }} />
      <Text style={styles.title}>{recipe.title}</Text>
      <Text style={styles.meta}>
        {recipe.ingredients.length === 1 ? '1 ingredient' : `${recipe.ingredients.length} ingredients`}
      </Text>

      <View style={styles.servingsRow}>
        <Text style={styles.servingsLabel}>Servings</Text>
        <View style={styles.stepper}>
          <Pressable
            style={[styles.stepButton, (recipe.servings ?? 1) <= 1 && styles.stepButtonDisabled]}
            onPress={() => changeServings(-1)}
            disabled={(recipe.servings ?? 1) <= 1}
            accessibilityLabel="Fewer servings"
            hitSlop={6}>
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text style={styles.servingsValue} testID="servings-value">
            {recipe.servings ?? 'Not set'}
          </Text>
          <Pressable
            style={styles.stepButton}
            onPress={() => changeServings(1)}
            accessibilityLabel="More servings"
            hitSlop={6}>
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
      </View>

      {recipe.ingredients.length === 0 ? (
        <Text style={styles.emptyBody}>No ingredients saved for this recipe.</Text>
      ) : (
        <View style={styles.card}>
          {recipe.ingredients.map((ingredient, index) => {
            const estimate = nutrition.ingredients[index];
            const editing = editingId === ingredient.id;
            return (
              <Pressable
                key={ingredient.id}
                onPress={() => setEditingId(editing ? null : ingredient.id)}
                disabled={editing}
                style={[styles.ingredientRow, index === recipe.ingredients.length - 1 && styles.lastRow]}>
                <Text style={styles.ingredientText}>{ingredientLine(ingredient)}</Text>
                <Text
                  style={[
                    styles.ingredientNutrition,
                    estimate.status !== 'counted' && styles.ingredientNotCounted,
                  ]}>
                  {describeIngredientEstimate(estimate, ingredient.unit)}
                </Text>
                {editing && (
                  <IngredientNutritionEditor
                    ingredientName={ingredient.name}
                    grams={ingredient.grams}
                    nutritionFoodId={ingredient.nutritionFoodId}
                    estimate={estimate}
                    source={bundledNutritionSource}
                    onSave={(overrides) => saveIngredientNutrition(ingredient.id, overrides)}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {saveError && <Text style={styles.error}>{saveError}</Text>}

      {recipe.ingredients.length > 0 && (
        <NutritionCard nutrition={nutrition} ingredientCount={recipe.ingredients.length} />
      )}

      <Text style={styles.privacyNote}>Stored only on this device.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  meta: {
    marginTop: 4,
    fontSize: 14,
    color: '#5b6b7b',
    marginBottom: 16,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e9ef',
    backgroundColor: '#f9fbfd',
  },
  ingredientRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e9ef',
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  ingredientText: {
    fontSize: 16,
  },
  ingredientNutrition: {
    marginTop: 2,
    fontSize: 13,
    color: '#5b6b7b',
  },
  ingredientNotCounted: {
    color: '#8a5a00',
  },
  servingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  servingsLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2f95dc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDisabled: {
    opacity: 0.35,
  },
  stepText: {
    fontSize: 20,
    color: '#2f95dc',
    fontWeight: '600',
  },
  servingsValue: {
    minWidth: 56,
    textAlign: 'center',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  error: {
    marginTop: 12,
    color: '#c0392b',
    fontSize: 14,
  },
  emptyBody: {
    fontSize: 15,
    color: '#5b6b7b',
    textAlign: 'center',
  },
  privacyNote: {
    marginTop: 20,
    fontSize: 13,
    color: '#8a97a3',
    textAlign: 'center',
  },
});
