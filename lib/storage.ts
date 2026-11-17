import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Secrets (AllDebrid API key, TMDB key) live in the iOS Keychain via expo-secure-store.
 * On web (dev preview only) we fall back to localStorage so the UI can still be exercised.
 */
const isWeb = Platform.OS === 'web';

export async function getSecret(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setSecret(key: string, value: string | null): Promise<void> {
  if (isWeb) {
    try {
      if (value == null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
    } catch {}
    return;
  }
  if (value == null || value === '') await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
}

export const KEYS = {
  allDebridKey: 'alldebrid_api_key',
  tmdbKey: 'tmdb_api_key',
  addonUrl: 'stream_addon_url',
  externalPlayer: 'external_player',
} as const;
