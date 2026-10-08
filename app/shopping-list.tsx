import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { listRecipesWithIngredients } from '@/db/recipes';
import {
  setShoppingListItemChecked,
  syncShoppingList,
  type ShoppingListItem,
} from '@/db/shoppingList';
import { buildShoppingList, shoppingListKey, type ShoppingListLine } from '@/lib/shoppingList';

export default function ShoppingListScreen() {
  const db = useSQLiteContext();
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [lineByKey, setLineByKey] = useState<Map<string, ShoppingListLine>>(new Map());

  const refresh = useCallback(async () => {
    const recipes = await listRecipesWithIngredients(db);
    const lines = buildShoppingList(recipes);
    const rows = await syncShoppingList(db, lines);
    setLineByKey(new Map(lines.map((line) => [line.key, line])));
    setItems(rows);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {
        // Local-only read; leave the current list in place on failure.
      });
    }, [refresh])
  );

  const toggle = useCallback(
    async (item: ShoppingListItem) => {
      const next = !item.checked;
      setItems((rows) => rows.map((row) => (row.id === item.id ? { ...row, checked: next } : row)));
      try {
        await setShoppingListItemChecked(db, item.id, next);
      } catch {
        setItems((rows) => rows.map((row) => (row.id === item.id ? { ...row, checked: !next } : row)));
      }
    },
    [db]
  );

  const renderSubLabel = (item: ShoppingListItem): string | null => {
    const line = lineByKey.get(shoppingListKey(item.itemName, item.unit));
    if (!line) return null;
    const from = line.recipeTitles.length > 1 ? `from ${line.recipeTitles.join(', ')}` : null;
    if (line.quantity !== null && from) return `${line.label} · ${from}`;
    return from;
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Nothing to shop yet</Text>
            <Text style={styles.emptyBody}>
              Save a recipe and its ingredients appear here, combined across all your recipes.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const subLabel = renderSubLabel(item);
          return (
            <Pressable
              style={styles.itemRow}
              onPress={() => toggle(item)}
              testID={`shopping-item-${item.id}`}>
              <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                {item.checked && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={styles.itemText}>
                <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
                  {item.itemName}
                </Text>
                {subLabel && <Text style={styles.itemMeta}>{subLabel}</Text>}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    flexGrow: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
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
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e9ef',
    backgroundColor: '#f9fbfd',
    marginBottom: 8,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#2f95dc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#2f95dc',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontSize: 16,
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: '#8a97a3',
  },
  itemMeta: {
    marginTop: 2,
    fontSize: 13,
    color: '#5b6b7b',
  },
});
