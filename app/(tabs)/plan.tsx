import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { listRecipesWithIngredients } from '@/db/recipes';
import {
  formatCents,
  MEAL_SCOPE_LABELS,
  MEAL_SCOPES,
  normalizeHouseholdSize,
  parseBudgetCents,
  placeholderEstimator,
  planMeals,
  type MealScope,
  type PlanRecipe,
} from '@/lib/planner';

/**
 * Placeholder planning panel: household size, meal scope, and a budget cap
 * feed the pure planner in `lib/planner.ts`. Settings live in memory only.
 */
export default function PlanScreen() {
  const db = useSQLiteContext();
  const [recipes, setRecipes] = useState<PlanRecipe[]>([]);
  // Track exclusions so newly saved recipes join the plan by default.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [householdSize, setHouseholdSize] = useState(2);
  const [scope, setScope] = useState<MealScope>('week');
  const [budgetText, setBudgetText] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listRecipesWithIngredients(db)
        .then((rows) => {
          if (active) setRecipes(rows);
        })
        .catch(() => {
          // Local-only read; keep the current recipes on failure.
        });
      return () => {
        active = false;
      };
    }, [db])
  );

  const budgetCapCents = parseBudgetCents(budgetText);
  const budgetInvalid = budgetText.trim() !== '' && budgetCapCents === null;
  const selected = useMemo(
    () => recipes.filter((recipe) => !excludedIds.has(recipe.id)),
    [recipes, excludedIds]
  );
  const plan = useMemo(
    () => planMeals(selected, { householdSize, scope, budgetCapCents }, placeholderEstimator),
    [selected, householdSize, scope, budgetCapCents]
  );

  const toggleRecipe = (id: string) => {
    setExcludedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>Household</Text>
      <View style={styles.stepperRow}>
        <Pressable
          style={styles.stepperButton}
          onPress={() => setHouseholdSize((n) => normalizeHouseholdSize(n - 1))}
          testID="household-decrement">
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>
          {householdSize} {householdSize === 1 ? 'person' : 'people'}
        </Text>
        <Pressable
          style={styles.stepperButton}
          onPress={() => setHouseholdSize((n) => normalizeHouseholdSize(n + 1))}
          testID="household-increment">
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Meals</Text>
      <View style={styles.segmentRow}>
        {MEAL_SCOPES.map((option) => (
          <Pressable
            key={option}
            style={[styles.segment, scope === option && styles.segmentActive]}
            onPress={() => setScope(option)}
            testID={`scope-${option}`}>
            <Text style={[styles.segmentText, scope === option && styles.segmentTextActive]}>
              {MEAL_SCOPE_LABELS[option]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Budget cap</Text>
      <TextInput
        style={[styles.input, budgetInvalid && styles.inputInvalid]}
        value={budgetText}
        onChangeText={setBudgetText}
        placeholder="No cap (e.g. 60)"
        keyboardType="decimal-pad"
        testID="budget-input"
      />
      {budgetInvalid && <Text style={styles.warning}>Enter a dollar amount like 45 or 45.50.</Text>}

      <Text style={styles.sectionTitle}>Recipes in the plan</Text>
      {recipes.length === 0 ? (
        <Text style={styles.muted}>Save a recipe first — it will show up here.</Text>
      ) : (
        recipes.map((recipe) => {
          const included = !excludedIds.has(recipe.id);
          return (
            <Pressable
              key={recipe.id}
              style={styles.recipeRow}
              onPress={() => toggleRecipe(recipe.id)}
              testID={`plan-recipe-${recipe.id}`}>
              <View style={[styles.checkbox, included && styles.checkboxChecked]}>
                {included && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.recipeTitle}>{recipe.title}</Text>
            </Pressable>
          );
        })
      )}

      {plan.requestedSlots.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>
            {plan.slots.length === 1 ? '1 meal' : `${plan.slots.length} meals`} planned
          </Text>
          <Text style={styles.muted}>
            {plan.slots.map((slot) => slot.recipeTitle).join(' → ')}
          </Text>
          {plan.droppedSlots.length > 0 && (
            <Text style={styles.warning}>
              Dropped {plan.droppedSlots.length} of {plan.requestedSlots.length} meals to fit the
              budget.
            </Text>
          )}
          {plan.overBudget && (
            <Text style={styles.warning}>Even one meal is over the cap.</Text>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Estimated total</Text>
            <Text style={styles.totalValue}>{formatCents(plan.totalCents)}</Text>
          </View>
          <Text style={styles.note}>
            Placeholder estimate (~$3 per package) until real store prices arrive.
            {plan.unpricedCount > 0 ? ` ${plan.unpricedCount} item(s) unpriced.` : ''}
          </Text>

          {plan.lines.map((line) => (
            <View key={line.key} style={styles.lineRow}>
              <View style={styles.lineText}>
                <Text style={styles.lineName}>{line.name}</Text>
                <Text style={styles.lineMeta}>{line.label}</Text>
              </View>
              <Text style={styles.linePrice}>
                {line.estimateCents === null ? '—' : formatCents(line.estimateCents)}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cfd8e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    fontSize: 22,
    lineHeight: 26,
  },
  stepperValue: {
    fontSize: 16,
    marginHorizontal: 16,
    minWidth: 80,
    textAlign: 'center',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cfd8e0',
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: '#2f95dc',
    borderColor: '#2f95dc',
  },
  segmentText: {
    fontSize: 14,
  },
  segmentTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cfd8e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  inputInvalid: {
    borderColor: '#d9534f',
  },
  recipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#9aa8b5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#2f95dc',
    borderColor: '#2f95dc',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  recipeTitle: {
    fontSize: 16,
  },
  muted: {
    fontSize: 14,
    color: '#5b6b7b',
  },
  warning: {
    marginTop: 6,
    fontSize: 14,
    color: '#b5532c',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 16,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  note: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 13,
    color: '#8a97a3',
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dde3e8',
  },
  lineText: {
    flex: 1,
  },
  lineName: {
    fontSize: 16,
  },
  lineMeta: {
    marginTop: 2,
    fontSize: 13,
    color: '#5b6b7b',
  },
  linePrice: {
    fontSize: 15,
    marginLeft: 12,
  },
});
