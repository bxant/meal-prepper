import { StyleSheet, Text, View } from 'react-native';

import type { RecipeNutrition } from '@/lib/nutrition/estimate';
import { formatGrams, formatKcal, formatMacro } from '@/lib/nutrition/format';
import type { NutrientProfile } from '@/lib/nutrition/types';

const ROWS: { key: keyof NutrientProfile; label: string }[] = [
  { key: 'kcal', label: 'Calories' },
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
  { key: 'fiber', label: 'Fiber' },
];

function formatValue(key: keyof NutrientProfile, value: number): string {
  return key === 'kcal' ? formatKcal(value) : formatMacro(value);
}

export function NutritionCard({ nutrition, ingredientCount }: { nutrition: RecipeNutrition; ingredientCount: number }) {
  const { perServing, per100g } = nutrition;
  const nothingCounted = nutrition.countedCount === 0;

  return (
    <View style={styles.card} testID="nutrition-card">
      <View style={styles.header}>
        <Text style={styles.title}>Nutrition</Text>
        <Text style={styles.badge}>ESTIMATE</Text>
      </View>

      {nothingCounted ? (
        <Text style={styles.empty}>
          No ingredients could be counted yet. Tap an ingredient below to add its weight in grams
          or pick a matching food.
        </Text>
      ) : (
        <>
          <View style={styles.row}>
            <Text style={[styles.cell, styles.labelCell]} />
            <Text style={[styles.cell, styles.columnHeading]}>
              Per serving{'\n'}
              <Text style={styles.columnSub}>≈ {formatGrams(nutrition.perServingGrams)}</Text>
            </Text>
            <Text style={[styles.cell, styles.columnHeading]}>Per 100 g{'\n'}<Text style={styles.columnSub}>of the mix</Text></Text>
          </View>
          {ROWS.map(({ key, label }) => (
            <View style={styles.row} key={key}>
              <Text style={[styles.cell, styles.labelCell]}>{label}</Text>
              <Text style={[styles.cell, styles.value]}>{formatValue(key, perServing[key])}</Text>
              <Text style={[styles.cell, styles.value]}>{per100g ? formatValue(key, per100g[key]) : '—'}</Text>
            </View>
          ))}
          <Text style={styles.note}>
            Whole recipe ≈ {formatKcal(nutrition.total.kcal)} kcal in {formatGrams(nutrition.totalGrams)}{' '}
            of raw ingredients
            {nutrition.servingsAssumed ? ' — servings not set, so one serving is the whole recipe.' : ` across ${nutrition.servings} servings.`}
          </Text>
        </>
      )}

      {nutrition.skippedCount > 0 && (
        <Text style={styles.warning}>
          Counted {nutrition.countedCount} of {ingredientCount} ingredients. Tap one marked “Not counted”
          to add grams or pick a food.
        </Text>
      )}
      <Text style={styles.footnote}>
        Rough estimate from USDA FoodData Central reference values for raw ingredients. Weights
        before cooking; entering grams makes it more accurate.
        {nutrition.usesAssumedDensity ? ' Some cup/spoon amounts assume the density of water.' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e9ef',
    backgroundColor: '#f9fbfd',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#8a5a00',
    backgroundColor: '#fff3d6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e9ef',
  },
  cell: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
  },
  labelCell: {
    color: '#3b4a59',
  },
  columnHeading: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    color: '#3b4a59',
  },
  columnSub: {
    fontSize: 12,
    fontWeight: '400',
    color: '#8a97a3',
  },
  value: {
    textAlign: 'right',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  note: {
    marginTop: 10,
    fontSize: 13,
    color: '#5b6b7b',
  },
  empty: {
    fontSize: 14,
    color: '#5b6b7b',
  },
  warning: {
    marginTop: 10,
    fontSize: 13,
    color: '#8a5a00',
  },
  footnote: {
    marginTop: 10,
    fontSize: 12,
    color: '#8a97a3',
  },
});
