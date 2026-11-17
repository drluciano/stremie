import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { DownloadItem, fileUriOf } from './downloads';
import { isNativePlayable } from './resolve';

/** Play a finished download: MP4/MOV in the built-in player, everything else via "Open in…" (VLC, Infuse, …). */
export async function playDownload(d: DownloadItem) {
  const uri = fileUriOf(d);
  if (!uri) return;
  const title = d.type === 'tv' ? `${d.title} · S${d.season}E${d.episode}${d.episodeTitle ? ` · ${d.episodeTitle}` : ''}` : d.title;
  if (isNativePlayable(d.filename ?? uri)) {
    router.push({ pathname: '/player', params: { url: uri, title, filename: d.filename ?? '' } });
    return;
  }
  Alert.alert(
    'Open in another player',
    'The built-in iOS player cannot play this file type. Choose VLC, Infuse or Outplayer in the next sheet. You can also find it in the Files app under On My iPhone → Stremie → Downloads.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Try built-in', onPress: () => router.push({ pathname: '/player', params: { url: uri, title, filename: d.filename ?? '' } }) },
      {
        text: 'Open in…',
        onPress: async () => {
          if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { dialogTitle: title });
        },
      },
    ]
  );
}
