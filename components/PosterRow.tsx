import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { C } from '@/constants/theme';
import { Paged, TmdbItem, poster, titleOf, typeOf, yearOf } from '@/lib/tmdb';

export function PosterCard({ item, width = 120 }: { item: TmdbItem; width?: number }) {
  const type = typeOf(item);
  return (
    <Link href={{ pathname: '/title/[type]/[id]', params: { type, id: String(item.id) } }} asChild>
      <Pressable style={{ width }}>
        {({ pressed }) => (
          <View style={{ opacity: pressed ? 0.7 : 1 }}>
            <View style={[styles.poster, { width, height: width * 1.5 }]}>
              {item.poster_path ? (
                <Image source={poster(item.poster_path)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
              ) : (
                <Text style={styles.noPoster} numberOfLines={3}>
                  {titleOf(item)}
                </Text>
              )}
              {item.vote_average > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>★ {item.vote_average.toFixed(1)}</Text>
                </View>
              )}
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {titleOf(item)}
            </Text>
            <Text style={styles.sub}>
              {yearOf(item)} · {type === 'tv' ? 'Series' : 'Movie'}
            </Text>
          </View>
        )}
      </Pressable>
    </Link>
  );
}

export function PosterRow({
  title,
  queryKey,
  queryFn,
  enabled = true,
}: {
  title: string;
  queryKey: unknown[];
  queryFn: () => Promise<Paged<TmdbItem>>;
  enabled?: boolean;
}) {
  const q = useQuery({ queryKey, queryFn, enabled, staleTime: 10 * 60 * 1000 });
  const items = (q.data?.results ?? []).filter((i) => i.media_type !== 'person');
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{title}</Text>
      {q.isLoading ? (
        <ActivityIndicator color={C.accent} style={{ height: 200 }} />
      ) : q.error ? (
        <Text style={styles.error}>{(q.error as Error).message}</Text>
      ) : (
        <FlatList
          horizontal
          data={items}
          keyExtractor={(i) => `${typeOf(i)}-${i.id}`}
          renderItem={({ item }) => <PosterCard item={item} />}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: 22 },
  rowTitle: { color: C.text, fontSize: 19, fontWeight: '700', marginHorizontal: 16, marginBottom: 10 },
  poster: { borderRadius: 10, overflow: 'hidden', backgroundColor: C.card, justifyContent: 'center' },
  noPoster: { color: C.dim, textAlign: 'center', padding: 8, fontSize: 13 },
  badge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  badgeText: { color: '#ffd166', fontSize: 11, fontWeight: '700' },
  title: { color: C.text, fontSize: 13, fontWeight: '600', marginTop: 6 },
  sub: { color: C.dim, fontSize: 11, marginTop: 1 },
  error: { color: C.bad, marginHorizontal: 16 },
});
