import { Image } from 'expo-image';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { C } from '@/constants/theme';
import { DOWNLOADS_SUPPORTED, DownloadItem, formatBytes, useDownloads } from '@/lib/downloads';
import { playDownload } from '@/lib/playLocal';
import { poster } from '@/lib/tmdb';

export default function Downloads() {
  const { items, freeBytes, usedBytes } = useDownloads();

  if (!DOWNLOADS_SUPPORTED) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>Downloads work in the iOS app only.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: C.bg }}
      data={items}
      keyExtractor={(d) => d.id}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
      ListHeaderComponent={
        <Text style={styles.storage}>
          Using {formatBytes(usedBytes)}
          {freeBytes != null ? ` · ${formatBytes(freeBytes)} free on this iPhone` : ''}
        </Text>
      }
      ListEmptyComponent={
        <View style={{ marginTop: 60, gap: 8 }}>
          <Text style={[styles.title, { textAlign: 'center' }]}>No downloads yet</Text>
          <Text style={[styles.dim, { textAlign: 'center', lineHeight: 20 }]}>
            Open a movie or episode, tap Find streams, then tap ⬇ next to a stream to save it for offline viewing.
          </Text>
        </View>
      }
      renderItem={({ item }) => <Row d={item} />}
    />
  );
}

function Row({ d }: { d: DownloadItem }) {
  const { pause, resume, remove } = useDownloads();
  const pct = d.bytesTotal > 0 ? Math.min(100, Math.round((d.bytesWritten / d.bytesTotal) * 100)) : 0;
  const subtitle = d.type === 'tv' ? `S${d.season} E${d.episode}${d.episodeTitle ? ` · ${d.episodeTitle}` : ''}` : d.stream.quality;

  const status =
    d.status === 'done'
      ? `${formatBytes(d.bytesTotal)} · ${d.stream.quality}`
      : d.status === 'downloading'
        ? `${pct}% · ${formatBytes(d.bytesWritten)} of ${formatBytes(d.bytesTotal)}`
        : d.status === 'resolving'
          ? 'Getting link from AllDebrid…'
          : d.status === 'queued'
            ? 'Waiting…'
            : d.status === 'paused'
              ? `Paused · ${pct}%`
              : d.error ?? 'Failed';

  const confirmDelete = () =>
    Alert.alert(d.status === 'done' ? 'Delete download?' : 'Cancel download?', d.title, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(d.id) },
    ]);

  return (
    <Pressable
      onPress={() => d.status === 'done' && playDownload(d)}
      onLongPress={confirmDelete}
      style={({ pressed }) => [styles.row, { opacity: pressed && d.status === 'done' ? 0.7 : 1 }]}>
      <Image source={poster(d.poster ?? null, 'w185')} style={styles.poster} contentFit="cover" />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.title} numberOfLines={1}>
          {d.title}
        </Text>
        <Text style={styles.dim} numberOfLines={1}>
          {subtitle}
        </Text>
        <Text style={[styles.status, d.status === 'error' && { color: C.bad }, d.status === 'done' && { color: C.good }]} numberOfLines={2}>
          {status}
        </Text>
        {(d.status === 'downloading' || d.status === 'paused') && (
          <View style={styles.bar}>
            <View style={[styles.fill, { width: `${pct}%`, backgroundColor: d.status === 'paused' ? C.faint : C.accent }]} />
          </View>
        )}
      </View>
      <View style={styles.actions}>
        {d.status === 'done' && <Action label="▶" onPress={() => playDownload(d)} />}
        {(d.status === 'downloading' || d.status === 'resolving') && <Action label="❚❚" onPress={() => pause(d.id)} />}
        {(d.status === 'paused' || d.status === 'error') && <Action label={d.status === 'error' ? '↻' : '▶'} onPress={() => resume(d.id)} />}
        <Action label="✕" onPress={confirmDelete} />
      </View>
    </Pressable>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  storage: { color: C.faint, fontSize: 12, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 12, backgroundColor: C.card, borderRadius: 12, padding: 10, alignItems: 'center' },
  poster: { width: 54, height: 81, borderRadius: 6, backgroundColor: C.cardHi },
  title: { color: C.text, fontWeight: '700', fontSize: 15 },
  dim: { color: C.dim, fontSize: 13 },
  status: { color: C.dim, fontSize: 12 },
  bar: { height: 4, borderRadius: 2, backgroundColor: C.cardHi, overflow: 'hidden', marginTop: 2 },
  fill: { height: 4 },
  actions: { gap: 8 },
  action: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.cardHi, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: C.text, fontSize: 13, fontWeight: '700' },
});
