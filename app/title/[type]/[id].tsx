import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { PosterCard } from '@/components/PosterRow';
import { Button, Pill } from '@/components/ui';
import { C } from '@/constants/theme';
import { useDownloads } from '@/lib/downloads';
import { playDownload } from '@/lib/playLocal';
import { useSettings } from '@/lib/settings';
import { Episode, MediaType, TvDetails, backdrop, poster, titleOf, tmdbClient, yearOf } from '@/lib/tmdb';

export default function TitleScreen() {
  const { type, id } = useLocalSearchParams<{ type: MediaType; id: string }>();
  const { tmdbKey } = useSettings();
  const tmdb = useMemo(() => tmdbClient(tmdbKey), [tmdbKey]);
  const { width } = useWindowDimensions();
  const { findDone } = useDownloads();

  const q = useQuery({
    queryKey: ['details', type, id],
    queryFn: () => (type === 'tv' ? tmdb.tv(Number(id)) : tmdb.movie(Number(id))),
  });

  if (q.isLoading) return <ActivityIndicator color={C.accent} style={{ flex: 1, backgroundColor: C.bg }} />;
  if (q.error || !q.data)
    return (
      <View style={styles.center}>
        <Text style={{ color: C.bad }}>{(q.error as Error)?.message ?? 'Not found'}</Text>
      </View>
    );

  const d = q.data;
  const imdb = d.external_ids?.imdb_id || d.imdb_id || null;
  const runtime = type === 'tv' ? (d as TvDetails).episode_run_time?.[0] : d.runtime;
  const trailer = d.videos?.results.find((v) => v.site === 'YouTube' && v.type === 'Trailer');
  const title = titleOf(d);

  const openStreams = (season?: number, episode?: number, epTitle?: string) => {
    if (!imdb) return;
    router.push({
      pathname: '/streams',
      params: {
        type,
        imdb,
        title,
        ...(season != null ? { season: String(season), episode: String(episode), epTitle: epTitle ?? '' } : {}),
        backdrop: d.backdrop_path ?? '',
        poster: d.poster_path ?? '',
        tmdbId: String(d.id),
      },
    });
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 60 }}>
      <View style={{ height: width * 0.75 }}>
        <Image source={backdrop(d.backdrop_path)} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={['rgba(11,11,16,0.5)', 'transparent', C.bg]} style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.header}>
        <Image source={poster(d.poster_path)} style={styles.poster} contentFit="cover" />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.meta}>
            {[yearOf(d), runtime ? `${runtime} min` : null, type === 'tv' ? `${(d as TvDetails).number_of_seasons} seasons` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {d.vote_average > 0 && <Pill text={`★ ${d.vote_average.toFixed(1)}`} color="#ffd166" />}
            {d.genres.slice(0, 3).map((g) => (
              <Pill key={g.id} text={g.name} />
            ))}
          </View>
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 10, marginTop: 16 }}>
        {type === 'movie' && findDone({ type, tmdbId: d.id }) && (
          <Button title="▶  Play downloaded" onPress={() => playDownload(findDone({ type, tmdbId: d.id })!)} />
        )}
        {type === 'movie' && <Button kind={findDone({ type, tmdbId: d.id }) ? 'secondary' : 'primary'} title={imdb ? '▶  Find streams' : 'No IMDb ID: streams unavailable'} disabled={!imdb} onPress={() => openStreams()} />}
        {trailer && <Button title="Watch trailer" kind="secondary" onPress={() => WebBrowser.openBrowserAsync(`https://www.youtube.com/watch?v=${trailer.key}`)} />}
        {d.tagline ? <Text style={styles.tagline}>{d.tagline}</Text> : null}
        <Text style={styles.overview}>{d.overview}</Text>
      </View>

      {type === 'tv' && <Seasons show={d as TvDetails} tmdb={tmdb} onPick={(s, e, t) => openStreams(s, e, t)} hasImdb={!!imdb} />}

      {!!d.credits?.cast.length && (
        <View style={{ marginTop: 24 }}>
          <Text style={styles.h2}>Cast</Text>
          <FlatList
            horizontal
            data={d.credits.cast.slice(0, 20)}
            keyExtractor={(c) => String(c.id)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            renderItem={({ item }) => (
              <View style={{ width: 80 }}>
                <Image source={poster(item.profile_path, 'w185')} style={styles.cast} contentFit="cover" />
                <Text style={styles.castName} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.castRole} numberOfLines={1}>
                  {item.character}
                </Text>
              </View>
            )}
          />
        </View>
      )}

      {!!d.recommendations?.results.length && (
        <View style={{ marginTop: 24 }}>
          <Text style={styles.h2}>More like this</Text>
          <FlatList
            horizontal
            data={d.recommendations.results.map((r) => ({ ...r, media_type: r.media_type ?? type }))}
            keyExtractor={(r) => String(r.id)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            renderItem={({ item }) => <PosterCard item={item} />}
          />
        </View>
      )}
    </ScrollView>
  );
}

function Seasons({
  show,
  tmdb,
  onPick,
  hasImdb,
}: {
  show: TvDetails;
  tmdb: ReturnType<typeof tmdbClient>;
  onPick: (season: number, episode: number, title: string) => void;
  hasImdb: boolean;
}) {
  const seasons = show.seasons.filter((s) => s.season_number > 0 && s.episode_count > 0);
  const [season, setSeason] = useState(seasons[0]?.season_number ?? 1);
  useEffect(() => {
    if (seasons.length && !seasons.some((s) => s.season_number === season)) setSeason(seasons[0].season_number);
  }, [show.id]);

  const q = useQuery({ queryKey: ['season', show.id, season], queryFn: () => tmdb.season(show.id, season) });
  const { findDone, findAny } = useDownloads();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <View style={{ marginTop: 24 }}>
      <Text style={styles.h2}>Episodes</Text>
      {!hasImdb && <Text style={[styles.castRole, { marginHorizontal: 16 }]}>No IMDb ID for this show: streams unavailable.</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {seasons.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => setSeason(s.season_number)}
            style={[styles.chip, season === s.season_number && { backgroundColor: C.accent, borderColor: C.accent }]}>
            <Text style={{ color: season === s.season_number ? C.text : C.dim, fontWeight: '600' }}>Season {s.season_number}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {q.isLoading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 20 }} />
      ) : (
        <View style={{ paddingHorizontal: 16, marginTop: 12, gap: 10 }}>
          {q.data?.episodes.map((ep: Episode) => {
            const aired = !ep.air_date || ep.air_date <= today;
            const meta = { type: 'tv' as const, tmdbId: show.id, season: ep.season_number, episode: ep.episode_number };
            const done = findDone(meta);
            const dl = findAny(meta);
            return (
              <Pressable
                key={ep.id}
                disabled={!done && (!hasImdb || !aired)}
                onPress={() => (done ? playDownload(done) : onPick(ep.season_number, ep.episode_number, ep.name))}
                onLongPress={() => done && onPick(ep.season_number, ep.episode_number, ep.name)}
                style={({ pressed }) => [styles.episode, { opacity: !aired ? 0.45 : pressed ? 0.7 : 1 }]}>
                <View style={styles.still}>
                  {ep.still_path && <Image source={backdrop(ep.still_path, 'w300')} style={StyleSheet.absoluteFill} contentFit="cover" />}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.epTitle} numberOfLines={1}>
                    {ep.episode_number}. {ep.name}
                  </Text>
                  <Text style={styles.castRole}>
                    {done ? '⬇ Downloaded · ' : dl && dl.status !== 'error' ? '⬇ Downloading · ' : ''}
                    {aired ? [ep.air_date, ep.runtime ? `${ep.runtime}m` : null].filter(Boolean).join(' · ') : `Airs ${ep.air_date}`}
                  </Text>
                  <Text style={styles.epOverview} numberOfLines={2}>
                    {ep.overview}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  header: { flexDirection: 'row', gap: 14, paddingHorizontal: 16, marginTop: -70, alignItems: 'flex-end' },
  poster: { width: 110, height: 165, borderRadius: 10, backgroundColor: C.card },
  title: { color: C.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.3 },
  meta: { color: C.dim, fontSize: 14 },
  tagline: { color: C.dim, fontStyle: 'italic', fontSize: 15 },
  overview: { color: '#d4d4e0', fontSize: 15, lineHeight: 22 },
  h2: { color: C.text, fontSize: 19, fontWeight: '700', marginHorizontal: 16, marginBottom: 10 },
  cast: { width: 80, height: 110, borderRadius: 8, backgroundColor: C.card },
  castName: { color: C.text, fontSize: 12, fontWeight: '600', marginTop: 5 },
  castRole: { color: C.dim, fontSize: 11 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  episode: { flexDirection: 'row', gap: 12, backgroundColor: C.card, borderRadius: 12, padding: 8 },
  still: { width: 128, height: 72, borderRadius: 8, overflow: 'hidden', backgroundColor: C.cardHi },
  epTitle: { color: C.text, fontWeight: '700', fontSize: 14 },
  epOverview: { color: C.dim, fontSize: 12, lineHeight: 16 },
});
