import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import {
  ActivityIndicator,
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
import { createOcrSpaceRecognizer, OcrError } from '@/lib/ocr';
import { pickRecipePhoto, type PhotoSource } from '@/lib/photoImport';
import { parseRecipeText } from '@/lib/recipeImport';
import { loadSettings } from '@/lib/settings';
import { parseQuantity } from '@/lib/shoppingList';

interface DraftIngredient {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  grams: string;
}

let draftCounter = 0;
function newDraft(fields: Partial<Omit<DraftIngredient, 'key'>> = {}): DraftIngredient {
  draftCounter += 1;
  return { key: `draft-${draftCounter}`, name: '', quantity: '', unit: '', grams: '', ...fields };
}

function isBlank(row: DraftIngredient): boolean {
  return [row.name, row.quantity, row.unit, row.grams].every((value) => value.trim() === '');
}

export default function NewRecipeScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [servingsText, setServingsText] = useState('');
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([newDraft()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ text: string; isError: boolean; needsKey?: boolean } | null>(null);

  /** Read a recipe photo into the form; the user reviews everything before saving. */
  const importPhoto = async (source: PhotoSource) => {
    setImportMessage(null);
    const { ocrSpaceApiKey } = await loadSettings();
    if (ocrSpaceApiKey.trim() === '') {
      setImportMessage({
        text: 'Add your free OCR.space API key in Settings to import from a photo.',
        isError: true,
        needsKey: true,
      });
      return;
    }
    try {
      const image = await pickRecipePhoto(source);
      if (!image) return;
      setImporting(true);
      const text = await createOcrSpaceRecognizer(ocrSpaceApiKey).recognize(image);
      const recipe = parseRecipeText(text);
      if (recipe.ingredients.length === 0) {
        setImportMessage({
          text: "Couldn't find an ingredient list in that photo. Try cropping it to just the ingredients.",
          isError: true,
        });
        return;
      }
      if (recipe.title && title.trim() === '') setTitle(recipe.title);
      if (recipe.servings && servingsText.trim() === '') setServingsText(String(recipe.servings));
      setIngredients((rows) => [
        ...rows.filter((row) => !isBlank(row)),
        ...recipe.ingredients.map((row) => newDraft(row)),
      ]);
      setError(null);
      setImportMessage({
        text: `Read ${recipe.ingredients.length} ingredient${recipe.ingredients.length === 1 ? '' : 's'} from the photo. Check them below — fix or remove anything misread — then save.`,
        isError: false,
      });
    } catch (e) {
      setImportMessage({
        text: e instanceof OcrError ? e.message : "Couldn't read that photo. Try again.",
        isError: true,
      });
    } finally {
      setImporting(false);
    }
  };

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
        <View style={styles.importCard}>
          <Text style={styles.importTitle}>Import from a photo</Text>
          <Text style={styles.hint}>
            A cookbook page or a saved screenshot. The photo is sent to OCR.space to read its
            text; you review the ingredients before saving.
          </Text>
          <View style={styles.importButtons}>
            <Pressable
              style={[styles.importButton, importing && styles.saveButtonDisabled]}
              onPress={() => void importPhoto('camera')}
              disabled={importing}>
              <Text style={styles.importButtonText}>Take photo</Text>
            </Pressable>
            <Pressable
              style={[styles.importButton, importing && styles.saveButtonDisabled]}
              onPress={() => void importPhoto('library')}
              disabled={importing}>
              <Text style={styles.importButtonText}>Choose screenshot</Text>
            </Pressable>
          </View>
          {importing && (
            <View style={styles.importStatus}>
              <ActivityIndicator />
              <Text style={styles.hint}>Reading the recipe…</Text>
            </View>
          )}
          {importMessage && (
            <Text style={importMessage.isError ? styles.error : styles.importNotice}>
              {importMessage.text}
            </Text>
          )}
          {importMessage?.needsKey && (
            <Pressable onPress={() => router.push('/settings')}>
              <Text style={styles.importLink}>Open Settings</Text>
            </Pressable>
          )}
        </View>

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
          Saved only on this device — no account. A photo you import is sent to OCR.space
          only to read its text.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  importCard: {
    borderWidth: 1,
    borderColor: '#e4e9ef',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#f5f9fd',
  },
  importTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  importButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  importButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2f95dc',
    alignItems: 'center',
  },
  importButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  importStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  importNotice: {
    marginTop: 10,
    fontSize: 14,
    color: '#2e7d32',
  },
  importLink: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#2f95dc',
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
