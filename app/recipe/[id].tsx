import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getRecipeWithIngredients, type RecipeWithIngredients } from '@/db/recipes';
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

  if (!recipe) {
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

      {recipe.ingredients.length === 0 ? (
        <Text style={styles.emptyBody}>No ingredients saved for this recipe.</Text>
      ) : (
        <View style={styles.card}>
          {recipe.ingredients.map((ingredient, index) => (
            <View
              key={ingredient.id}
              style={[styles.ingredientRow, index === recipe.ingredients.length - 1 && styles.lastRow]}>
              <Text style={styles.ingredientText}>{ingredientLine(ingredient)}</Text>
            </View>
          ))}
        </View>
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
