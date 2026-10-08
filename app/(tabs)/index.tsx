import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { listRecipes, type RecipeSummary } from '@/db/recipes';

export default function RecipesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listRecipes(db)
        .then((rows) => {
          if (active) setRecipes(rows);
        })
        .catch(() => {
          // The local DB is the only source; an empty list degrades gracefully.
        });
      return () => {
        active = false;
      };
    }, [db])
  );

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.shoppingListBanner}
        onPress={() => router.push('/shopping-list')}
        testID="shopping-list-banner">
        <Text style={styles.bannerTitle}>Shopping list</Text>
        <Text style={styles.bannerSubtitle}>Combined ingredients from all your recipes</Text>
      </Pressable>

      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No recipes yet</Text>
            <Text style={styles.emptyBody}>
              Tap “New recipe” to type in a title and its ingredients. Everything stays on this
              device.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.recipeRow}
            onPress={() => router.push(`/recipe/${item.id}`)}>
            <Text style={styles.recipeTitle}>{item.title}</Text>
            <Text style={styles.recipeMeta}>
              {item.ingredientCount === 1
                ? '1 ingredient'
                : `${item.ingredientCount} ingredients`}
            </Text>
          </Pressable>
        )}
      />

      <Pressable style={styles.newButton} onPress={() => router.push('/recipe/new')}>
        <Text style={styles.newButtonText}>New recipe</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  shoppingListBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#E6F4FE',
    borderWidth: 1,
    borderColor: '#cfe6fb',
  },
  bannerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  bannerSubtitle: {
    marginTop: 2,
    fontSize: 14,
    color: '#5b6b7b',
  },
  listContent: {
    padding: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 15,
    color: '#5b6b7b',
    textAlign: 'center',
    lineHeight: 21,
  },
  recipeRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#f5f7fa',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e4e9ef',
  },
  recipeTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  recipeMeta: {
    marginTop: 2,
    fontSize: 14,
    color: '#5b6b7b',
  },
  newButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2f95dc',
    alignItems: 'center',
  },
  newButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
