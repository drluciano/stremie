import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PosterRow } from '@/components/PosterRow';
import { Button } from '@/components/ui';
import { C } from '@/constants/theme';
import { useSettings } from '@/lib/settings';
import { backdrop, titleOf, tmdbClient, typeOf, yearOf } from '@/lib/tmdb';

export default function Home() {
  const { tmdbKey, allDebridKey } = useSettings();
  const tmdb = useMemo(() => tmdbClient(tmdbKey), [tmdbKey]);
  const insets = useSafeAreaInsets();

  if (!tmdbKey) {
    return (
      <View style={[styles.empty, { paddingTop: insets.top + 40 }]}>
        <Text style={styles.brand}>stremie</Text>
        <Text style={styles.emptyText}>
          Add a free TMDB API key to start browsing, and connect AllDebrid to stream.
        </Text>
        <Button title="Open Settings" onPress={() => router.push('/settings')} />
      </View>
    );
  }

  const k = tmdbKey.slice(-6);
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Hero tmdb={tmdb} cacheKey={k} />
      {!allDebridKey && (
        <Pressable onPress={() => router.push('/settings')} style={styles.banner}>
          <Text style={styles.bannerText}>Connect AllDebrid in Settings to play streams →</Text>
        </Pressable>
      )}
      <PosterRow title="Trending this week" queryKey={['trending', 'all', k]} queryFn={() => tmdb.trending('all', 'week')} />
      <PosterRow title="New in theaters" queryKey={['movie', 'now_playing', k]} queryFn={() => tmdb.list('movie', 'now_playing')} />
      <PosterRow title="Popular movies" queryKey={['movie', 'popular', k]} queryFn={() => tmdb.list('movie', 'popular')} />
      <PosterRow title="Trending series" queryKey={['trending', 'tv', k]} queryFn={() => tmdb.trending('tv', 'week')} />
      <PosterRow title="Airing this week" queryKey={['tv', 'on_the_air', k]} queryFn={() => tmdb.list('tv', 'on_the_air')} />
      <PosterRow title="Popular series" queryKey={['tv', 'popular', k]} queryFn={() => tmdb.list('tv', 'popular')} />
      <PosterRow title="Upcoming movies" queryKey={['movie', 'upcoming', k]} queryFn={() => tmdb.list('movie', 'upcoming')} />
      <PosterRow title="Top rated movies" queryKey={['movie', 'top_rated', k]} queryFn={() => tmdb.list('movie', 'top_rated')} />
      <PosterRow title="Top rated series" queryKey={['tv', 'top_rated', k]} queryFn={() => tmdb.list('tv', 'top_rated')} />
    </ScrollView>
  );
}

function Hero({ tmdb, cacheKey }: { tmdb: ReturnType<typeof tmdbClient>; cacheKey: string }) {
  const { width } = useWindowDimensions();
  const q = useQuery({ queryKey: ['trending', 'day', cacheKey], queryFn: () => tmdb.trending('all', 'day'), staleTime: 30 * 60 * 1000 });
  const item = q.data?.results.find((i) => i.backdrop_path && i.media_type !== 'person');
  const height = Math.min(width * 1.15, 520);
  if (!item) return <View style={{ height: height * 0.6 }} />;
  const type = typeOf(item);
  return (
    <Link href={{ pathname: '/title/[type]/[id]', params: { type, id: String(item.id) } }} asChild>
      <Pressable style={{ height }}>
        <Image source={backdrop(item.backdrop_path)} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={['rgba(11,11,16,0.2)', 'rgba(11,11,16,0.1)', C.bg]} style={StyleSheet.absoluteFill} />
        <View style={styles.heroText}>
          <Text style={styles.heroKicker}>#1 TRENDING TODAY</Text>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {titleOf(item)}
          </Text>
          <Text style={styles.heroMeta}>
            {yearOf(item)} · {type === 'tv' ? 'Series' : 'Movie'} · ★ {item.vote_average.toFixed(1)}
          </Text>
          <Text style={styles.heroOverview} numberOfLines={3}>
            {item.overview}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, backgroundColor: C.bg, padding: 24, gap: 18 },
  brand: { color: C.text, fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  emptyText: { color: C.dim, fontSize: 16, lineHeight: 23 },
  heroText: { position: 'absolute', left: 16, right: 16, bottom: 8 },
  heroKicker: { color: C.accent, fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  heroTitle: { color: C.text, fontSize: 32, fontWeight: '900', marginTop: 4, letterSpacing: -0.5 },
  heroMeta: { color: C.dim, fontSize: 14, marginTop: 4 },
  heroOverview: { color: '#cfcfdc', fontSize: 14, lineHeight: 20, marginTop: 8 },
  banner: { marginHorizontal: 16, marginTop: 16, backgroundColor: C.accentSoft, borderRadius: 12, padding: 12 },
  bannerText: { color: C.text, fontWeight: '600' },
});
