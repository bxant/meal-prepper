/**
 * User-entered keys and switches, stored on the device with expo-secure-store
 * (Keychain / Keystore). Nothing here is ever committed, logged, or sent
 * anywhere except to the service the key belongs to.
 */

import * as SecureStore from 'expo-secure-store';

export interface AppSettings {
  /** OCR.space API key for photo recipe import; '' = not set. */
  ocrSpaceApiKey: string;
  /** Kroger Developer app credentials for live availability; '' = not set. */
  krogerClientId: string;
  krogerClientSecret: string;
  /** Show made-up "Sample data" availability so the trip flow can be tried. */
  demoAvailability: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  ocrSpaceApiKey: '',
  krogerClientId: '',
  krogerClientSecret: '',
  demoAvailability: false,
};

// SecureStore keys may only contain letters, digits, ".", "-" and "_".
const KEYS: Record<keyof AppSettings, string> = {
  ocrSpaceApiKey: 'settings.ocrSpaceApiKey',
  krogerClientId: 'settings.krogerClientId',
  krogerClientSecret: 'settings.krogerClientSecret',
  demoAvailability: 'settings.demoAvailability',
};

async function read(key: string): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(key)) ?? '';
  } catch {
    // Unavailable (e.g. web) or unreadable: behave as "not set".
    return '';
  }
}

export async function loadSettings(): Promise<AppSettings> {
  const [ocrSpaceApiKey, krogerClientId, krogerClientSecret, demo] = await Promise.all([
    read(KEYS.ocrSpaceApiKey),
    read(KEYS.krogerClientId),
    read(KEYS.krogerClientSecret),
    read(KEYS.demoAvailability),
  ]);
  return { ocrSpaceApiKey, krogerClientId, krogerClientSecret, demoAvailability: demo === '1' };
}

/** Save every field; blank text fields are deleted rather than stored. */
export async function saveSettings(settings: AppSettings): Promise<void> {
  const text: [string, string][] = [
    [KEYS.ocrSpaceApiKey, settings.ocrSpaceApiKey.trim()],
    [KEYS.krogerClientId, settings.krogerClientId.trim()],
    [KEYS.krogerClientSecret, settings.krogerClientSecret.trim()],
  ];
  await Promise.all([
    ...text.map(([key, value]) =>
      value === '' ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value)
    ),
    SecureStore.setItemAsync(KEYS.demoAvailability, settings.demoAvailability ? '1' : '0'),
  ]);
}

export function hasKrogerCredentials(
  settings: Pick<AppSettings, 'krogerClientId' | 'krogerClientSecret'>
): boolean {
  return settings.krogerClientId.trim() !== '' && settings.krogerClientSecret.trim() !== '';
}
