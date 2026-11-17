/**
 * Minimal TMDB client. Accepts either a v3 API key or a v4 "API Read Access Token" (JWT, starts with "eyJ").
 * https://developer.themoviedb.org/reference/intro/getting-started
 */
const BASE = 'https://api.themoviedb.org/3';
export const IMG = 'https://image.tmdb.org/t/p';

export type MediaType = 'movie' | 'tv';

export type TmdbItem = {
  id: number;
  media_type?: MediaType | 'person';
  title?: string; // movie
  name?: string; // tv
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
};

export type Paged<T> = { page: number; results: T[]; total_pages: number; total_results: number };

export type Genre = { id: number; name: string };

export type MovieDetails = TmdbItem & {
  runtime: number | null;
  genres: Genre[];
  tagline?: string;
  imdb_id?: string | null;
  external_ids?: { imdb_id: string | null };
  credits?: { cast: { id: number; name: string; character: string; profile_path: string | null }[] };
  videos?: { results: { key: string; site: string; type: string }[] };
  recommendations?: Paged<TmdbItem>;
};

export type SeasonSummary = { id: number; season_number: number; name: string; episode_count: number; poster_path: string | null };

export type TvDetails = MovieDetails & {
  number_of_seasons: number;
  seasons: SeasonSummary[];
  episode_run_time?: number[];
};

export type Episode = {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
};

export class TmdbError extends Error {}

export function tmdbClient(key: string | null) {
  async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    if (!key) throw new TmdbError('Add a TMDB API key in Settings to browse.');
    const isBearer = key.startsWith('eyJ');
    const qs = new URLSearchParams({ language: 'en-US' });
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
    if (!isBearer) qs.set('api_key', key);
    const res = await fetch(`${BASE}${path}?${qs}`, {
      headers: isBearer ? { Authorization: `Bearer ${key}`, accept: 'application/json' } : { accept: 'application/json' },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new TmdbError(body.status_message || `TMDB request failed (${res.status})`);
    }
    return res.json();
  }

  return {
    trending: (type: 'all' | MediaType = 'all', window: 'day' | 'week' = 'week', page = 1) =>
      get<Paged<TmdbItem>>(`/trending/${type}/${window}`, { page }),
    list: (type: MediaType, list: string, page = 1) => get<Paged<TmdbItem>>(`/${type}/${list}`, { page }),
    discover: (type: MediaType, params: Record<string, string | number>) =>
      get<Paged<TmdbItem>>(`/discover/${type}`, params),
    search: (query: string, page = 1) =>
      get<Paged<TmdbItem>>('/search/multi', { query, page, include_adult: 'false' }),
    movie: (id: number) =>
      get<MovieDetails>(`/movie/${id}`, { append_to_response: 'external_ids,credits,videos,recommendations' }),
    tv: (id: number) => get<TvDetails>(`/tv/${id}`, { append_to_response: 'external_ids,credits,videos,recommendations' }),
    season: (id: number, season: number) =>
      get<{ episodes: Episode[]; name: string; season_number: number }>(`/tv/${id}/season/${season}`),
  };
}

export const titleOf = (i: TmdbItem) => i.title || i.name || 'Untitled';
export const yearOf = (i: TmdbItem) => (i.release_date || i.first_air_date || '').slice(0, 4);
export const typeOf = (i: TmdbItem): MediaType => (i.media_type === 'tv' || (!i.title && i.name) ? 'tv' : 'movie');
export const poster = (p: string | null, size = 'w342') => (p ? `${IMG}/${size}${p}` : undefined);
export const backdrop = (p: string | null, size = 'w1280') => (p ? `${IMG}/${size}${p}` : undefined);
