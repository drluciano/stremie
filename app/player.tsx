import { router, useLocalSearchParams } from 'expo-router';
import { useEvent } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from '@/constants/theme';

export default function Player() {
  const { url, title } = useLocalSearchParams<{ url: string; title?: string; filename?: string }>();
  const insets = useSafeAreaInsets();

  const player = useVideoPlayer({ uri: url, metadata: { title: title ?? 'stremie' } }, (p) => {
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = true;
    p.allowsExternalPlayback = true;
    p.play();
  });

  const { status, error } = useEvent(player, 'statusChange', { status: player.status });

  return (
    <View style={styles.root}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls
        contentFit="contain"
        allowsPictureInPicture
        startsPictureInPictureAutomatically
        fullscreenOptions={{ enable: true }}
      />
      {status === 'error' && (
        <View style={styles.error}>
          <Text style={styles.errorTitle}>The built-in player can't play this file</Text>
          <Text style={styles.errorText}>{error?.message ?? 'Unsupported format.'} Try Infuse, VLC or Outplayer from Settings → Player.</Text>
        </View>
      )}
      <Pressable onPress={() => router.back()} style={[styles.close, { top: insets.top + 8 }]} hitSlop={12}>
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  close: { position: 'absolute', left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { position: 'absolute', left: 24, right: 24, top: '40%', backgroundColor: C.card, borderRadius: 14, padding: 16, gap: 6 },
  errorTitle: { color: C.text, fontWeight: '700', fontSize: 16 },
  errorText: { color: C.dim, lineHeight: 20 },
});
