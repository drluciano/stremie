import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { PosterCard } from '@/components/PosterRow';
import { C } from '@/constants/theme';
import { useSettings } from '@/lib/settings';
import { MediaType, tmdbClient } from '@/lib/tmdb';

const MOVIE_GENRES = [
  [28, 'Action'], [12, 'Adventure'], [16, 'Animation'], [35, 'Comedy'], [80, 'Crime'], [99, 'Documentary'],
  [18, 'Drama'], [14, 'Fantasy'], [27, 'Horror'], [9648, 'Mystery'], [10749, 'Romance'], [878, 'Sci-Fi'], [53, 'Thriller'],
] as const;
const TV_GENRES = [
  [10759, 'Action'], [16, 'Animation'], [35, 'Comedy'], [80, 'Crime'], [99, 'Documentary'], [18, 'Drama'],
  [10751, 'Family'], [10762, 'Kids'], [9648, 'Mystery'], [10765, 'Sci-Fi & Fantasy'], [10764, 'Reality'],
] as const;
const SORTS = [
  ['popularity.desc', 'Popular'],
  ['primary_release_date.desc', 'Newest'],
  ['vote_average.desc', 'Top rated'],
] as const;

export default function Discover() {
  const { tmdbKey } = useSettings();
  const tmdb = useMemo(() => tmdbClient(tmdbKey), [tmdbKey]);
  const { width } = useWindowDimensions();
  const [type, setType] = useState<MediaType>('movie');
  const [genre, setGenre] = useState<number | null>(null);
  const [sort, setSort] = useState<string>('popularity.desc');

  const cols = width > 700 ? 5 : 3;
  const cardW = (width - 32 - (cols - 1) * 12) / cols;
  const sortBy = type === 'tv' ? sort.replace('primary_release_date', 'first_air_date') : sort;
  const today = new Date().toISOString().slice(0, 10);

  const q = useInfiniteQuery({
    queryKey: ['discover', type, genre, sortBy, tmdbKey?.slice(-6)],
    enabled: !!tmdbKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      tmdb.discover(type, {
        page: pageParam,
        sort_by: sortBy,
        ...(genre ? { with_genres: genre } : {}),
        ...(sort.startsWith('vote') ? { 'vote_count.gte': 300 } : {}),
        ...(sort.includes('date') ? { [type === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte']: today, 'vote_count.gte': 20 } : {}),
      }).then((r) => ({ ...r, results: r.results.map((x) => ({ ...x, media_type: type })) })),
    getNextPageParam: (last) => (last.page < last.total_pages ? last.page + 1 : undefined),
  });

  const items = q.data?.pages.flatMap((p) => p.results) ?? [];
  const genres = type === 'movie' ? MOVIE_GENRES : TV_GENRES;

  return (
    <FlatList
      style={{ backgroundColor: C.bg }}
      data={items}
      key={cols}
      numColumns={cols}
      keyExtractor={(i) => `${i.id}`}
      columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
      contentContainerStyle={{ gap: 16, paddingBottom: 40 }}
      renderItem={({ item }) => <PosterCard item={item} width={cardW} />}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
      onEndReachedThreshold={0.6}
      ListHeaderComponent={
        <View style={{ gap: 10, paddingTop: 8 }}>
          <Chips
            options={[['movie', 'Movies'], ['tv', 'Series']]}
            value={type}
            onChange={(v) => {
              setType(v as MediaType);
              setGenre(null);
            }}
          />
          <Chips options={SORTS} value={sort} onChange={setSort} />
          <Chips options={[[0, 'All genres'], ...genres]} value={genre ?? 0} onChange={(v) => setGenre(v ? Number(v) : null)} />
        </View>
      }
      ListEmptyComponent={
        q.isLoading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
        ) : (
          <Text style={{ color: C.dim, textAlign: 'center', marginTop: 40 }}>
            {q.error ? (q.error as Error).message : tmdbKey ? 'Nothing found.' : 'Add a TMDB key in Settings.'}
          </Text>
        )
      }
      ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={C.accent} /> : undefined}
    />
  );
}

function Chips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
      {options.map(([v, label]) => {
        const active = v === value;
        return (
          <Pressable key={String(v)} onPress={() => onChange(v)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && { color: C.text }]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.dim, fontWeight: '600', fontSize: 14 },
});
