import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useShoppingSummary } from '@/components/ShoppingSummary';
import { listRecipes, type RecipeSummary } from '@/db/recipes';
import { describeShoppingList } from '@/lib/shoppingListSummary';

export default function RecipesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const { summary, refresh: refreshSummary } = useShoppingSummary();
  const hasItemsToBuy = summary.remaining > 0;

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
      // Saving a recipe returns here, so this keeps the "to buy" count current.
      refreshSummary().catch(() => {});
      return () => {
        active = false;
      };
    }, [db, refreshSummary])
  );

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.shoppingListBanner, !hasItemsToBuy && styles.shoppingListBannerIdle]}
        onPress={() => router.navigate('/shopping')}
        testID="shopping-list-banner">
        {hasItemsToBuy && (
          <View style={styles.bannerBadge}>
            <Text style={styles.bannerBadgeText}>{summary.remaining}</Text>
          </View>
        )}
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle}>
            {hasItemsToBuy ? describeShoppingList(summary) : 'Shopping list'}
          </Text>
          <Text style={styles.bannerSubtitle}>
            {hasItemsToBuy ? 'Tap to open your shopping list' : describeShoppingList(summary)}
          </Text>
        </View>
        <Text style={styles.bannerChevron}>›</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#E6F4FE',
    borderWidth: 1,
    borderColor: '#2f95dc',
  },
  shoppingListBannerIdle: {
    backgroundColor: '#f5f7fa',
    borderColor: '#e4e9ef',
  },
  bannerBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 8,
    marginRight: 12,
    backgroundColor: '#2f95dc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBadgeText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  bannerText: {
    flex: 1,
    minWidth: 0,
  },
  bannerChevron: {
    marginLeft: 8,
    fontSize: 26,
    color: '#8a97a3',
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
