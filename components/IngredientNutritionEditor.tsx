import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { IngredientEstimate } from '@/lib/nutrition/estimate';
import { formatGrams } from '@/lib/nutrition/format';
import type { NutritionSource } from '@/lib/nutrition/types';
import { parseQuantity } from '@/lib/shoppingList';

interface Props {
  ingredientName: string;
  grams: number | null;
  nutritionFoodId: string | null;
  estimate: IngredientEstimate;
  source: NutritionSource;
  onSave: (overrides: { grams: number | null; nutritionFoodId: string | null }) => void;
  onCancel: () => void;
}

/**
 * Inline editor for one ingredient's nutrition inputs: a measured weight in
 * grams and which reference food it is. Empty / "Automatic" means derive it.
 */
export function IngredientNutritionEditor({
  ingredientName,
  grams,
  nutritionFoodId,
  estimate,
  source,
  onSave,
  onCancel,
}: Props) {
  const [gramsText, setGramsText] = useState(grams !== null ? String(grams) : '');
  const [foodId, setFoodId] = useState<string | null>(nutritionFoodId);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const autoFood = useMemo(() => source.match(ingredientName), [source, ingredientName]);
  const pickedFood = foodId ? source.get(foodId) : null;
  const results = useMemo(() => source.search(query, 6), [source, query]);

  const autoGrams = estimate.gramsMethod !== 'entered' && estimate.grams !== null ? estimate.grams : null;

  const save = () => {
    const trimmed = gramsText.trim();
    const value = trimmed === '' ? null : parseQuantity(trimmed);
    if (trimmed !== '' && value === null) {
      setError('Weight must be a number of grams, like 250.');
      return;
    }
    onSave({ grams: value, nutritionFoodId: foodId });
  };

  return (
    <View style={styles.editor}>
      <Text style={styles.label}>Weight in grams</Text>
      <TextInput
        style={styles.input}
        value={gramsText}
        onChangeText={(value) => {
          setGramsText(value);
          setError(null);
        }}
        placeholder={autoGrams !== null ? `Automatic: ≈ ${formatGrams(autoGrams)}` : 'e.g. 250'}
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Matches food</Text>
      <Text style={styles.current}>
        {pickedFood
          ? pickedFood.name
          : autoFood
            ? `Automatic: ${autoFood.name}`
            : 'Automatic: no match found'}
      </Text>
      {pickedFood && (
        <Pressable onPress={() => setFoodId(null)} hitSlop={6}>
          <Text style={styles.link}>Use automatic match</Text>
        </Pressable>
      )}
      <TextInput
        style={[styles.input, styles.search]}
        value={query}
        onChangeText={setQuery}
        placeholder="Search foods (e.g. rice, cheddar)"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {results.map((food) => (
        <Pressable
          key={food.id}
          style={[styles.result, food.id === foodId && styles.resultSelected]}
          onPress={() => {
            setFoodId(food.id);
            setQuery('');
          }}>
          <Text style={styles.resultText}>{food.name}</Text>
          <Text style={styles.resultMeta}>{Math.round(food.per100g.kcal)} kcal / 100 g</Text>
        </Pressable>
      ))}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.secondary]} onPress={onCancel}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.primary]} onPress={save}>
          <Text style={styles.primaryText}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  editor: {
    marginTop: 10,
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5b6b7b',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d4dbe3',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  search: {
    marginTop: 2,
  },
  current: {
    fontSize: 15,
  },
  link: {
    fontSize: 14,
    color: '#2f95dc',
  },
  result: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e4e9ef',
  },
  resultSelected: {
    borderColor: '#2f95dc',
  },
  resultText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
  },
  resultMeta: {
    fontSize: 12,
    color: '#8a97a3',
  },
  error: {
    color: '#c0392b',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: '#2f95dc',
  },
  primaryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  secondary: {
    borderWidth: 1,
    borderColor: '#d4dbe3',
  },
  secondaryText: {
    fontSize: 15,
    color: '#3b4a59',
  },
});
