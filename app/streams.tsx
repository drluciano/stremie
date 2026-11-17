import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Pill } from '@/components/ui';
import { C } from '@/constants/theme';
import { ParsedStream, fetchStreams } from '@/lib/addons';
import { EXTERNAL_PLAYERS, openInExternal } from '@/lib/players';
import { NotCachedError, ResolveProgress, Resolved, isNativePlayable, resolveStream } from '@/lib/resolve';
import { useSettings } from '@/lib/settings';
import { MediaType } from '@/lib/tmdb';

const QUALITIES = ['All', '2160p', '1080p', '720p'] as const;

export default function Streams() {
  const p = useLocalSearchParams<{ type: MediaType; imdb: string; title: string; season?: string; episode?: string; epTitle?: string }>();
  const { addonUrl, allDebridKey, externalPlayer } = useSettings();
  const nav = useNavigation();
  const season = p.season ? Number(p.season) : undefined;
  const episode = p.episode ? Number(p.episode) : undefined;
  const [filter, setFilter] = useState<(typeof QUALITIES)[number]>('All');
  const [busy, setBusy] = useState<{ key: string; progress: ResolveProgress } | null>(null);
  const cancel = useRef({ cancelled: false });

  useEffect(() => {
    nav.setOptions({ title: season != null ? `S${season} E${episode}` : p.title });
  }, [nav, p.title, season, episode]);
  useEffect(() => () => void (cancel.current.cancelled = true), []);

  const q = useQuery({
    queryKey: ['streams', addonUrl, p.type, p.imdb, season, episode],
    queryFn: () => fetchStreams(addonUrl, p.type, p.imdb, season, episode),
    staleTime: 5 * 60 * 1000,
  });

  const streams = useMemo(() => (q.data ?? []).filter((s) => filter === 'All' || s.quality === filter), [q.data, filter]);
  const heading = season != null ? `${p.title} · S${season}E${episode}${p.epTitle ? ` · ${p.epTitle}` : ''}` : p.title;

  const play = (resolved: Resolved) => {
    const go = (choice: string) => {
      if (choice === 'builtin') {
        router.push({ pathname: '/player', params: { url: resolved.url, title: heading, filename: resolved.filename } });
      } else if (choice === 'copy') {
        Clipboard.setStringAsync(resolved.url);
        Alert.alert('Link copied', 'The direct AllDebrid link is on your clipboard.');
      } else {
        openInExternal(choice, resolved.url).then((ok) => {
          if (!ok) Alert.alert('Player not installed', 'Install it from the App Store, or pick another player.');
        });
      }
    };

    const native = isNativePlayable(resolved.filename);
    if (externalPlayer === 'builtin') return go('builtin');
    if (externalPlayer !== 'auto') return go(externalPlayer);
    if (native) return go('builtin');

    const options = [...EXTERNAL_PLAYERS.map((x) => ({ id: x.id, label: `Open in ${x.name}` })), { id: 'builtin', label: 'Try built-in player' }, { id: 'copy', label: 'Copy link' }];
    const message = `${resolved.filename}\nThis file type usually needs an external player on iOS.`;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Choose a player', message, options: [...options.map((o) => o.label), 'Cancel'], cancelButtonIndex: options.length },
        (i) => i < options.length && go(options[i].id)
      );
    } else {
      Alert.alert('Choose a player', message, [...options.map((o) => ({ text: o.label, onPress: () => go(o.id) })), { text: 'Cancel', style: 'cancel' as const }]);
    }
  };

  const onPick = async (s: ParsedStream) => {
    if (!allDebridKey) {
      Alert.alert('AllDebrid not connected', 'Log in to AllDebrid in Settings first.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Settings', onPress: () => router.push('/settings') },
      ]);
      return;
    }
    cancel.current = { cancelled: false };
    setBusy({ key: s.key, progress: { stage: 'uploading' } });
    try {
      const r = await resolveStream(allDebridKey, s, {
        season,
        episode,
        signal: cancel.current,
        onProgress: (progress) => setBusy({ key: s.key, progress }),
      });
      if (!cancel.current.cancelled) play(r);
    } catch (e) {
      if ((e as Error).message === 'cancelled') return;
      if (e instanceof NotCachedError) {
        Alert.alert('Not cached yet', `${e.message}\n\nProgress: ${e.percent}%. Pick a different stream, or come back once it finishes.`);
      } else {
        Alert.alert('Could not play', (e as Error).message);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Text style={styles.heading} numberOfLines={2}>
        {heading}
      </Text>
      <View style={styles.filters}>
        {QUALITIES.map((ql) => (
          <Pressable key={ql} onPress={() => setFilter(ql)} style={[styles.chip, filter === ql && styles.chipOn]}>
            <Text style={{ color: filter === ql ? C.text : C.dim, fontWeight: '600' }}>{ql === '2160p' ? '4K' : ql}</Text>
          </Pressable>
        ))}
      </View>
      {q.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.accent} />
          <Text style={styles.dim}>Searching for streams…</Text>
        </View>
      ) : q.error ? (
        <View style={styles.center}>
          <Text style={{ color: C.bad, textAlign: 'center' }}>{(q.error as Error).message}</Text>
          <Button title="Retry" kind="secondary" onPress={() => q.refetch()} />
        </View>
      ) : (
        <FlatList
          data={streams}
          keyExtractor={(s) => s.key}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
          ListEmptyComponent={<Text style={[styles.dim, { textAlign: 'center', marginTop: 30 }]}>No streams found.</Text>}
          renderItem={({ item }) => (
            <StreamRow
              s={item}
              busy={busy?.key === item.key ? busy.progress : null}
              disabled={!!busy && busy.key !== item.key}
              onPress={() => onPick(item)}
              onCancel={() => {
                cancel.current.cancelled = true;
                setBusy(null);
              }}
            />
          )}
        />
      )}
    </View>
  );
}

function StreamRow({
  s,
  busy,
  disabled,
  onPress,
  onCancel,
}: {
  s: ParsedStream;
  busy: ResolveProgress | null;
  disabled: boolean;
  onPress: () => void;
  onCancel: () => void;
}) {
  const qColor = s.quality === '2160p' ? '#ffd166' : s.quality === '1080p' ? C.good : C.dim;
  return (
    <Pressable onPress={busy ? onCancel : onPress} disabled={disabled} style={({ pressed }) => [styles.row, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Pill text={s.quality === '2160p' ? '4K' : s.quality} color={qColor} />
        {s.tags.map((t) => (
          <Pill key={t} text={t} />
        ))}
      </View>
      <Text style={styles.label} numberOfLines={2}>
        {s.label}
      </Text>
      <Text style={styles.meta}>
        {[s.sizeText && `💾 ${s.sizeText}`, s.seeders != null && `👤 ${s.seeders}`, s.source && `⚙️ ${s.source}`].filter(Boolean).join('   ')}
      </Text>
      {busy && (
        <View style={styles.busy}>
          <ActivityIndicator color={C.accent} size="small" />
          <Text style={styles.busyText}>
            {busy.stage === 'uploading'
              ? 'Sending to AllDebrid…'
              : busy.stage === 'downloading'
                ? `Not cached: AllDebrid downloading ${busy.percent}% (${busy.seeders} seeders)`
                : 'Unlocking link…'}
          </Text>
          <Text style={{ color: C.faint, fontSize: 12 }}>Tap to cancel</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: { color: C.text, fontSize: 16, fontWeight: '700', paddingHorizontal: 16, paddingTop: 12 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  dim: { color: C.dim },
  row: { backgroundColor: C.card, borderRadius: 12, padding: 12, gap: 7 },
  label: { color: C.text, fontSize: 13, lineHeight: 18 },
  meta: { color: C.dim, fontSize: 12 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  busyText: { color: C.text, fontSize: 12, flexShrink: 1 },
});
