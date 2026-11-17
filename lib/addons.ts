/**
 * Stremio addon protocol (stream resource only).
 * https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/stream.md
 *
 * GET {addon}/stream/movie/{imdbId}.json
 * GET {addon}/stream/series/{imdbId}:{season}:{episode}.json
 */
import type { MediaType } from './tmdb';

export type StremioStream = {
  name?: string;
  title?: string;
  description?: string;
  url?: string;
  infoHash?: string;
  fileIdx?: number;
  sources?: string[];
  behaviorHints?: { filename?: string; bingeGroup?: string; videoSize?: number; notWebReady?: boolean };
};

export type ParsedStream = StremioStream & {
  key: string;
  quality: string;
  label: string;
  sizeText?: string;
  sizeBytes?: number;
  seeders?: number;
  source?: string;
  tags: string[];
};

/** Normalize a pasted manifest URL ("…/manifest.json" or "stremio://…") to its base. */
export function addonBase(url: string) {
  return url
    .trim()
    .replace(/^stremio:\/\//, 'https://')
    .replace(/\/manifest\.json$/, '')
    .replace(/\/+$/, '');
}

export async function fetchStreams(
  addonUrl: string,
  type: MediaType,
  imdbId: string,
  season?: number,
  episode?: number
): Promise<ParsedStream[]> {
  const stremioType = type === 'tv' ? 'series' : 'movie';
  const id = type === 'tv' ? `${imdbId}:${season}:${episode}` : imdbId;
  const res = await fetch(`${addonBase(addonUrl)}/stream/${stremioType}/${encodeURIComponent(id)}.json`);
  if (!res.ok) throw new Error(`Stream addon returned ${res.status}`);
  const json = (await res.json()) as { streams?: StremioStream[] };
  return (json.streams ?? []).map(parseStream).sort(rank);
}

const QUALITY_ORDER = ['2160p', '1440p', '1080p', '720p', '480p', 'SD'];

function parseStream(s: StremioStream, i: number): ParsedStream {
  const text = `${s.name ?? ''}\n${s.title ?? ''}\n${s.description ?? ''}`;
  const quality =
    (/\b(2160p|4k|uhd)\b/i.test(text) && '2160p') ||
    (/\b1440p\b/i.test(text) && '1440p') ||
    (/\b1080p\b/i.test(text) && '1080p') ||
    (/\b720p\b/i.test(text) && '720p') ||
    (/\b480p\b/i.test(text) && '480p') ||
    'SD';
  const seeders = text.match(/👤\s*(\d+)/)?.[1];
  const size = text.match(/💾\s*([\d.,]+\s*[KMGT]B)/i)?.[1];
  const source = text.match(/⚙️\s*([^\n]+)/)?.[1]?.trim();
  const firstLine = (s.title ?? s.description ?? s.name ?? '').split('\n')[0];
  const tags: string[] = [];
  if (/\bHDR10\+?|\bHDR\b/i.test(text)) tags.push('HDR');
  if (/\b(DV|DoVi|Dolby.?Vision)\b/i.test(text)) tags.push('DV');
  if (/\b(x265|HEVC|H\.?265)\b/i.test(text)) tags.push('HEVC');
  if (/\bREMUX\b/i.test(text)) tags.push('REMUX');
  if (/\bAtmos\b/i.test(text)) tags.push('Atmos');
  if (/\.mp4\b/i.test(s.behaviorHints?.filename ?? firstLine)) tags.push('MP4');
  if (/\.mkv\b/i.test(s.behaviorHints?.filename ?? firstLine)) tags.push('MKV');
  return {
    ...s,
    key: s.infoHash ? `${s.infoHash}:${s.fileIdx ?? ''}` : s.url ?? String(i),
    quality,
    label: firstLine,
    sizeText: size,
    sizeBytes: size ? toBytes(size) : s.behaviorHints?.videoSize,
    seeders: seeders ? Number(seeders) : undefined,
    source,
    tags,
  };
}

function rank(a: ParsedStream, b: ParsedStream) {
  const q = QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality);
  if (q !== 0) return q;
  return (b.seeders ?? 0) - (a.seeders ?? 0);
}

function toBytes(s: string) {
  const m = s.replace(',', '.').match(/([\d.]+)\s*([KMGT])B/i);
  if (!m) return undefined;
  const mult = { K: 1e3, M: 1e6, G: 1e9, T: 1e12 }[m[2].toUpperCase() as 'K'] ?? 1;
  return Number(m[1]) * mult;
}
