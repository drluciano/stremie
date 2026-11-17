import { Linking } from 'react-native';

import type { ExternalPlayer } from './settings';

/** Deep-link URL schemes for popular iOS players (must also be listed in LSApplicationQueriesSchemes). */
export const EXTERNAL_PLAYERS: { id: Exclude<ExternalPlayer, 'auto' | 'builtin'>; name: string; build: (url: string) => string }[] = [
  { id: 'infuse', name: 'Infuse', build: (u) => `infuse://x-callback-url/play?url=${encodeURIComponent(u)}` },
  { id: 'vlc', name: 'VLC', build: (u) => `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(u)}` },
  { id: 'outplayer', name: 'Outplayer', build: (u) => `outplayer://${u}` },
];

export async function openInExternal(id: string, url: string) {
  const p = EXTERNAL_PLAYERS.find((x) => x.id === id);
  if (!p) return false;
  try {
    await Linking.openURL(p.build(url));
    return true;
  } catch {
    return false;
  }
}

export async function installedPlayers() {
  const out: typeof EXTERNAL_PLAYERS = [];
  for (const p of EXTERNAL_PLAYERS) {
    try {
      if (await Linking.canOpenURL(p.build('https://example.com/x.mkv'))) out.push(p);
    } catch {}
  }
  return out;
}
