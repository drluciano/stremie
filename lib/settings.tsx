import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { KEYS, getSecret, setSecret } from './storage';

export const DEFAULT_ADDON_URL = 'https://torrentio.strem.fun';

export type ExternalPlayer = 'auto' | 'builtin' | 'vlc' | 'infuse' | 'outplayer';

export type Settings = {
  allDebridKey: string | null;
  tmdbKey: string | null;
  addonUrl: string;
  externalPlayer: ExternalPlayer;
};

type Ctx = Settings & {
  loaded: boolean;
  update: (patch: Partial<Settings>) => Promise<void>;
};

const SettingsContext = createContext<Ctx | null>(null);

// A TMDB key baked in at build time (EXPO_PUBLIC_TMDB_API_KEY) is used when none is set in the app.
const ENV_TMDB = process.env.EXPO_PUBLIC_TMDB_API_KEY || null;

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Settings>({
    allDebridKey: null,
    tmdbKey: null,
    addonUrl: DEFAULT_ADDON_URL,
    externalPlayer: 'auto',
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [ad, tmdb, addon, player] = await Promise.all([
        getSecret(KEYS.allDebridKey),
        getSecret(KEYS.tmdbKey),
        getSecret(KEYS.addonUrl),
        getSecret(KEYS.externalPlayer),
      ]);
      setState({
        allDebridKey: ad,
        tmdbKey: tmdb,
        addonUrl: addon || DEFAULT_ADDON_URL,
        externalPlayer: (player as ExternalPlayer) || 'auto',
      });
      setLoaded(true);
    })();
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    const writes: Promise<void>[] = [];
    if ('allDebridKey' in patch) writes.push(setSecret(KEYS.allDebridKey, patch.allDebridKey ?? null));
    if ('tmdbKey' in patch) writes.push(setSecret(KEYS.tmdbKey, patch.tmdbKey ?? null));
    if ('addonUrl' in patch) writes.push(setSecret(KEYS.addonUrl, patch.addonUrl ?? null));
    if ('externalPlayer' in patch) writes.push(setSecret(KEYS.externalPlayer, patch.externalPlayer ?? null));
    await Promise.all(writes);
    setState((s) => ({ ...s, ...patch, addonUrl: 'addonUrl' in patch ? patch.addonUrl || DEFAULT_ADDON_URL : s.addonUrl }));
  }, []);

  const value = useMemo<Ctx>(
    () => ({ ...state, tmdbKey: state.tmdbKey || ENV_TMDB, loaded, update }),
    [state, loaded, update]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
