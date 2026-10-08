import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { insertRecipeWithIngredients, type NewIngredientInput } from '@/db/recipes';
import { parseQuantity } from '@/lib/shoppingList';

interface DraftIngredient {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  grams: string;
}

let draftCounter = 0;
function newDraft(): DraftIngredient {
  draftCounter += 1;
  return { key: `draft-${draftCounter}`, name: '', quantity: '', unit: '', grams: '' };
}

export default function NewRecipeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [servingsText, setServingsText] = useState('');
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([newDraft()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateIngredient = (key: string, field: keyof DraftIngredient, value: string) => {
    setIngredients((rows) => rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  };

  const addIngredient = () => setIngredients((rows) => [...rows, newDraft()]);

  const removeIngredient = (key: string) =>
    setIngredients((rows) => rows.filter((row) => row.key !== key));

  const save = async () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle === '') {
      setError('Give the recipe a title.');
      return;
    }

    const servingsValue = servingsText.trim();
    const servings = servingsValue === '' ? null : Number(servingsValue);
    if (servings !== null && !(/^\d+$/.test(servingsValue) && servings > 0)) {
      setError('Servings must be a whole number, like 4.');
      return;
    }

    const filled = ingredients.filter(
      (row) =>
        row.name.trim() !== '' ||
        row.quantity.trim() !== '' ||
        row.unit.trim() !== '' ||
        row.grams.trim() !== ''
    );
    if (filled.length === 0) {
      setError('Add at least one ingredient.');
      return;
    }
    if (filled.some((row) => row.name.trim() === '')) {
      setError('Every ingredient needs a name — quantity and unit are optional.');
      return;
    }
    if (filled.some((row) => row.grams.trim() !== '' && parseQuantity(row.grams) === null)) {
      setError('Weight must be a number of grams, like 250.');
      return;
    }

    const ingredientInputs: NewIngredientInput[] = filled.map((row) => {
      const name = row.name.trim();
      const quantityText = row.quantity.trim();
      const unit = row.unit.trim() || null;
      const quantity = parseQuantity(quantityText);
      const rawText = [quantityText, unit ?? '', name].filter((part) => part !== '').join(' ');
      const grams = row.grams.trim() === '' ? null : parseQuantity(row.grams);
      return { name, quantity, unit, rawText, parsedOk: quantity !== null, grams };
    });

    setSaving(true);
    try {
      await insertRecipeWithIngredients(db, {
        title: trimmedTitle,
        servings,
        ingredients: ingredientInputs,
      });
      router.back();
    } catch {
      setError('Could not save the recipe. Please try again.');
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            setError(null);
          }}
          placeholder="e.g. Weeknight chili"
          autoCapitalize="sentences"
          testID="recipe-title-input"
        />

        <Text style={styles.label}>Servings</Text>
        <TextInput
          style={[styles.input, styles.servingsInput]}
          value={servingsText}
          onChangeText={(value) => {
            setServingsText(value);
            setError(null);
          }}
          placeholder="e.g. 4"
          keyboardType="number-pad"
          testID="recipe-servings-input"
        />
        <Text style={styles.hint}>Used to split the nutrition estimate per serving.</Text>

        <Text style={styles.label}>Ingredients</Text>
        {ingredients.map((row, index) => (
          <View style={styles.ingredientCard} key={row.key}>
            <View style={styles.ingredientHeader}>
              <Text style={styles.ingredientNumber}>Ingredient {index + 1}</Text>
              {ingredients.length > 1 && (
                <Pressable onPress={() => removeIngredient(row.key)} hitSlop={8}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              )}
            </View>
            <TextInput
              style={styles.input}
              value={row.name}
              onChangeText={(value) => {
                updateIngredient(row.key, 'name', value);
                setError(null);
              }}
              placeholder="Name (required)"
              autoCapitalize="sentences"
            />
            <View style={styles.quantityRow}>
              <TextInput
                style={[styles.input, styles.quantityInput]}
                value={row.quantity}
                onChangeText={(value) => {
                  updateIngredient(row.key, 'quantity', value);
                  setError(null);
                }}
                placeholder="Quantity (e.g. 2)"
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.input, styles.quantityInput]}
                value={row.unit}
                onChangeText={(value) => {
                  updateIngredient(row.key, 'unit', value);
                  setError(null);
                }}
                placeholder="Unit (e.g. cups)"
                autoCapitalize="none"
              />
            </View>
            <TextInput
              style={styles.input}
              value={row.grams}
              onChangeText={(value) => {
                updateIngredient(row.key, 'grams', value);
                setError(null);
              }}
              placeholder="Weight in grams (optional, most accurate)"
              keyboardType="decimal-pad"
            />
          </View>
        ))}

        <Pressable style={styles.addIngredientButton} onPress={addIngredient}>
          <Text style={styles.addIngredientText}>+ Add ingredient</Text>
        </Pressable>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={save}
          disabled={saving}
          testID="save-recipe-button">
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save recipe'}</Text>
        </Pressable>

        <Text style={styles.privacyNote}>
          Saved only on this device — no account, nothing uploaded.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d4dbe3',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  servingsInput: {
    maxWidth: 140,
  },
  hint: {
    marginTop: 4,
    fontSize: 13,
    color: '#8a97a3',
  },
  ingredientCard: {
    borderWidth: 1,
    borderColor: '#e4e9ef',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#f9fbfd',
    gap: 8,
  },
  ingredientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ingredientNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5b6b7b',
  },
  removeText: {
    fontSize: 14,
    color: '#c0392b',
  },
  quantityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quantityInput: {
    flex: 1,
    minWidth: 0,
  },
  addIngredientButton: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2f95dc',
    alignItems: 'center',
    marginTop: 4,
  },
  addIngredientText: {
    color: '#2f95dc',
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    marginTop: 12,
    color: '#c0392b',
    fontSize: 14,
  },
  saveButton: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2f95dc',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  privacyNote: {
    marginTop: 12,
    fontSize: 13,
    color: '#8a97a3',
    textAlign: 'center',
  },
});
