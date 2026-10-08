import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from '@/lib/settings';

/**
 * Keys for the optional online features. Everything is stored with
 * expo-secure-store on this phone and only ever sent to its own service.
 */
export default function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    loadSettings()
      .then((value) => {
        setSettings(value);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setStatus(null);
  };

  const save = async () => {
    try {
      await saveSettings(settings);
      setStatus('Saved on this phone.');
    } catch {
      setStatus("Couldn't save. Try again.");
    }
  };

  const openLink = (url: string) => void Linking.openURL(url).catch(() => {});

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>Photo recipe import</Text>
        <Text style={styles.body}>
          Importing a recipe photo sends that photo to OCR.space to read its text — only when
          you import one. Paste your free API key here.
        </Text>
        <Pressable onPress={() => openLink('https://ocr.space/ocrapi/freekey')}>
          <Text style={styles.link}>Get a free OCR.space key</Text>
        </Pressable>
        <Text style={styles.label}>OCR.space API key</Text>
        <TextInput
          style={styles.input}
          value={settings.ocrSpaceApiKey}
          onChangeText={(value) => update('ocrSpaceApiKey', value)}
          placeholder="Not set"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          editable={loaded}
        />

        <Text style={styles.section}>Kroger availability (optional)</Text>
        <Text style={styles.body}>
          With your own Kroger developer keys, Kroger-family stores (Kroger, Ralphs, Fred Meyer,
          King Soopers…) show which of your shopping-list items they carry. Only ingredient
          names and the store are sent to Kroger — no quantities, recipes, or your location.
          Results are kept in memory only. Everything works without this.
        </Text>
        <Pressable onPress={() => openLink('https://developer.kroger.com')}>
          <Text style={styles.link}>Kroger developer portal (register an app, scope product.compact)</Text>
        </Pressable>
        <Text style={styles.label}>Client ID</Text>
        <TextInput
          style={styles.input}
          value={settings.krogerClientId}
          onChangeText={(value) => update('krogerClientId', value)}
          placeholder="Not set"
          autoCapitalize="none"
          autoCorrect={false}
          editable={loaded}
        />
        <Text style={styles.label}>Client secret</Text>
        <TextInput
          style={styles.input}
          value={settings.krogerClientSecret}
          onChangeText={(value) => update('krogerClientSecret', value)}
          placeholder="Not set"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          editable={loaded}
        />

        <Text style={styles.section}>Demo</Text>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.switchLabel}>Sample availability</Text>
            <Text style={styles.body}>
              Fill stores without live data with made-up availability, labelled “Sample data”,
              to try the trip planner. Not real.
            </Text>
          </View>
          <Switch
            value={settings.demoAvailability}
            onValueChange={(value) => update('demoAvailability', value)}
            disabled={!loaded}
          />
        </View>

        <Pressable style={styles.saveButton} onPress={save} disabled={!loaded}>
          <Text style={styles.saveButtonText}>Save</Text>
        </Pressable>
        {status && <Text style={styles.status}>{status}</Text>}
        <Text style={styles.note}>Stored securely on this phone; never uploaded or shared.</Text>
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
  section: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: '#5b6b7b',
  },
  link: {
    marginTop: 6,
    fontSize: 14,
    color: '#2f95dc',
    fontWeight: '600',
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchText: {
    flex: 1,
    minWidth: 0,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  saveButton: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2f95dc',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  status: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: 14,
    color: '#2e7d32',
  },
  note: {
    marginTop: 12,
    fontSize: 13,
    color: '#8a97a3',
    textAlign: 'center',
  },
});
