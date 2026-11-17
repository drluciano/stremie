/**
 * Turns a Stremio stream (torrent hash) into a playable HTTPS link via AllDebrid:
 *   magnet/upload → (wait for ready) → magnet/files → pick the right file → link/unlock
 */
import type { ParsedStream } from './addons';
import { AllDebridError, FlatFile, magnetFiles, magnetStatus, sleep, unlockAndWait, uploadMagnet } from './alldebrid';

export type ResolveProgress =
  | { stage: 'uploading' }
  | { stage: 'downloading'; percent: number; speed: number; seeders: number }
  | { stage: 'unlocking' };

export type Resolved = { url: string; filename: string; size: number; magnetId?: number };

export class NotCachedError extends Error {
  constructor(public magnetId: number, public percent: number) {
    super('This torrent is not cached on AllDebrid yet. It has been added to your AllDebrid magnets and is downloading.');
  }
}

const VIDEO_EXT = /\.(mkv|mp4|m4v|mov|avi|webm|ts|m2ts|wmv|mpg|mpeg)$/i;
const JUNK = /\b(sample|trailer|extras?|featurette)\b/i;

export function pickFile(files: FlatFile[], stream: ParsedStream, season?: number, episode?: number): FlatFile | undefined {
  const videos = files.filter((f) => VIDEO_EXT.test(f.name));
  if (!videos.length) return undefined;

  const wanted = stream.behaviorHints?.filename;
  if (wanted) {
    const exact = videos.find((f) => f.name === wanted || f.path.endsWith(wanted));
    if (exact) return exact;
  }

  if (season != null && episode != null) {
    const s = String(season).padStart(2, '0');
    const e = String(episode).padStart(2, '0');
    const patterns = [
      new RegExp(`s${s}[ ._-]?e${e}(?!\\d)`, 'i'),
      new RegExp(`\\b${season}x${e}(?!\\d)`, 'i'),
      new RegExp(`(?:ep?|episode)[ ._-]?${e}(?!\\d)`, 'i'),
    ];
    for (const re of patterns) {
      const match = videos.filter((f) => re.test(f.name) && !JUNK.test(f.name));
      if (match.length) return match.sort((a, b) => b.size - a.size)[0];
    }
  }

  const clean = videos.filter((f) => !JUNK.test(f.name));
  return (clean.length ? clean : videos).sort((a, b) => b.size - a.size)[0];
}

export async function resolveStream(
  apiKey: string,
  stream: ParsedStream,
  opts: {
    season?: number;
    episode?: number;
    onProgress?: (p: ResolveProgress) => void;
    signal?: { cancelled: boolean };
    /** How long to wait for an uncached torrent before giving up (ms). */
    waitMs?: number;
  } = {}
): Promise<Resolved> {
  const { onProgress, signal, season, episode, waitMs = 20000 } = opts;

  // Addons that already return a direct URL (e.g. a debrid-configured addon) need no resolving.
  if (stream.url && !stream.infoHash) {
    if (/^https?:/i.test(stream.url)) return { url: stream.url, filename: stream.behaviorHints?.filename ?? stream.label, size: stream.sizeBytes ?? 0 };
    if (/^magnet:/i.test(stream.url)) stream = { ...stream, infoHash: stream.url };
  }
  if (!stream.infoHash) throw new AllDebridError('NO_HASH', 'This stream has no torrent hash to send to AllDebrid.');

  onProgress?.({ stage: 'uploading' });
  const magnet = stream.infoHash.startsWith('magnet:') ? stream.infoHash : `magnet:?xt=urn:btih:${stream.infoHash}`;
  const up = await uploadMagnet(apiKey, magnet);

  if (!up.ready) {
    const deadline = Date.now() + waitMs;
    let percent = 0;
    while (Date.now() < deadline) {
      if (signal?.cancelled) throw new Error('cancelled');
      const st = await magnetStatus(apiKey, up.id);
      if (st.statusCode === 4) break;
      if (st.statusCode > 4) throw new AllDebridError('MAGNET_ERROR', `AllDebrid: ${st.status}`);
      percent = st.size ? Math.round((st.downloaded / st.size) * 100) : 0;
      onProgress?.({ stage: 'downloading', percent, speed: st.downloadSpeed, seeders: st.seeders });
      await sleep(3000);
    }
    const final = await magnetStatus(apiKey, up.id);
    if (final.statusCode !== 4) throw new NotCachedError(up.id, percent);
  }

  if (signal?.cancelled) throw new Error('cancelled');
  const files = await magnetFiles(apiKey, up.id);
  const file = pickFile(files, stream, season, episode);
  if (!file) throw new AllDebridError('NO_VIDEO', 'No video file was found in this torrent.');

  onProgress?.({ stage: 'unlocking' });
  const unlocked = await unlockAndWait(apiKey, file.link, signal);
  return { url: unlocked.link, filename: unlocked.filename || file.name, size: unlocked.filesize || file.size, magnetId: up.id };
}

/** AVPlayer (expo-video on iOS) plays MP4/MOV/M4V/HLS but not MKV/AVI/WMV. */
export const isNativePlayable = (filename: string) => /\.(mp4|m4v|mov|m3u8)$/i.test(filename);
