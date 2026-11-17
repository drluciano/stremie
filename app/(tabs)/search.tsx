import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { PosterCard } from '@/components/PosterRow';
import { Field } from '@/components/ui';
import { C } from '@/constants/theme';
import { useSettings } from '@/lib/settings';
import { tmdbClient } from '@/lib/tmdb';

export default function Search() {
  const { tmdbKey } = useSettings();
  const tmdb = useMemo(() => tmdbClient(tmdbKey), [tmdbKey]);
  const { width } = useWindowDimensions();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  const q = useQuery({
    queryKey: ['search', query, tmdbKey?.slice(-6)],
    queryFn: () => tmdb.search(query),
    enabled: !!tmdbKey && query.length > 1,
  });
  const items = (q.data?.results ?? []).filter((i) => i.media_type === 'movie' || i.media_type === 'tv');

  const cols = width > 700 ? 5 : 3;
  const cardW = (width - 32 - (cols - 1) * 12) / cols;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Field
          placeholder="Search movies and series"
          value={text}
          onChangeText={setText}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoFocus
        />
      </View>
      <FlatList
        data={items}
        key={cols}
        numColumns={cols}
        keyboardDismissMode="on-drag"
        keyExtractor={(i) => `${i.media_type}-${i.id}`}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        contentContainerStyle={{ gap: 16, paddingVertical: 8, paddingBottom: 40 }}
        renderItem={({ item }) => <PosterCard item={item} width={cardW} />}
        ListEmptyComponent={
          q.isFetching ? (
            <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
          ) : (
            <Text style={styles.hint}>
              {q.error ? (q.error as Error).message : query.length > 1 ? 'No results.' : 'Find any movie or show.'}
            </Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { color: C.dim, textAlign: 'center', marginTop: 40 },
});
