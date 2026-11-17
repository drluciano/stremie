/**
 * Offline downloads.
 *
 * Files are saved to Documents/Downloads (visible in the Files app under "On My iPhone → Stremie",
 * so VLC/Infuse can open MKVs from there). The index lives in a hidden JSON file next to it.
 * Downloads use an iOS background URLSession, so they keep going while the app is in the background.
 * If the app is killed mid-download the item comes back as "paused"; resuming re-resolves a fresh
 * AllDebrid link (old links can expire) and restarts, or continues from saved resume data if we have it.
 */
import * as FS from 'expo-file-system/legacy';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { ParsedStream } from './addons';
import { NotCachedError, resolveStream } from './resolve';
import { useSettings } from './settings';
import type { MediaType } from './tmdb';

export const DOWNLOADS_SUPPORTED = Platform.OS !== 'web' && !!FS.documentDirectory;
const DIR = `${FS.documentDirectory ?? ''}Downloads/`;
const INDEX = `${FS.documentDirectory ?? ''}.stremie-downloads.json`;
const MAX_ACTIVE = 2;

export type DownloadStatus = 'queued' | 'resolving' | 'downloading' | 'paused' | 'done' | 'error';

export type DownloadMeta = {
  type: MediaType;
  tmdbId: number;
  title: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  poster?: string | null;
  backdrop?: string | null;
};

export type DownloadItem = DownloadMeta & {
  id: string;
  status: DownloadStatus;
  /** File name inside the Downloads folder. Stored relative because the app container path changes between installs. */
  localName?: string;
  filename?: string;
  url?: string;
  resumeData?: string;
  bytesWritten: number;
  bytesTotal: number;
  error?: string;
  createdAt: number;
  completedAt?: number;
  stream: Pick<ParsedStream, 'infoHash' | 'fileIdx' | 'url' | 'behaviorHints' | 'label' | 'quality' | 'key' | 'tags' | 'sizeText' | 'sizeBytes'>;
};

export const fileUriOf = (d: DownloadItem) => (d.localName ? DIR + d.localName : undefined);
export const downloadKey = (m: Pick<DownloadMeta, 'type' | 'tmdbId' | 'season' | 'episode'>) =>
  m.type === 'tv' ? `tv-${m.tmdbId}-s${m.season}e${m.episode}` : `movie-${m.tmdbId}`;

type Ctx = {
  items: DownloadItem[];
  start: (meta: DownloadMeta, stream: ParsedStream) => Promise<void>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** The finished download for a movie or episode, if any. */
  findDone: (m: Pick<DownloadMeta, 'type' | 'tmdbId' | 'season' | 'episode'>) => DownloadItem | undefined;
  findAny: (m: Pick<DownloadMeta, 'type' | 'tmdbId' | 'season' | 'episode'>) => DownloadItem | undefined;
  freeBytes: number | null;
  usedBytes: number;
};

const DownloadsContext = createContext<Ctx | null>(null);

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);

export function DownloadsProvider({ children }: { children: React.ReactNode }) {
  const { allDebridKey } = useSettings();
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [freeBytes, setFreeBytes] = useState<number | null>(null);
  const itemsRef = useRef<DownloadItem[]>([]);
  const tasks = useRef(new Map<string, FS.DownloadResumable>());
  const cancels = useRef(new Map<string, { cancelled: boolean }>());
  const lastTick = useRef(new Map<string, number>());
  const keyRef = useRef(allDebridKey);
  keyRef.current = allDebridKey;

  const persist = useCallback(async (list: DownloadItem[]) => {
    if (!DOWNLOADS_SUPPORTED) return;
    try {
      await FS.writeAsStringAsync(INDEX, JSON.stringify(list));
    } catch {}
  }, []);

  const commit = useCallback(
    (fn: (list: DownloadItem[]) => DownloadItem[], save = true) => {
      const next = fn(itemsRef.current);
      itemsRef.current = next;
      setItems(next);
      if (save) persist(next);
    },
    [persist]
  );

  const patch = useCallback(
    (id: string, p: Partial<DownloadItem>, save = true) => commit((l) => l.map((d) => (d.id === id ? { ...d, ...p } : d)), save),
    [commit]
  );

  const refreshFree = useCallback(() => {
    if (DOWNLOADS_SUPPORTED) FS.getFreeDiskStorageAsync().then(setFreeBytes).catch(() => {});
  }, []);

  // Load the index on launch. Anything that was mid-flight is now paused.
  useEffect(() => {
    if (!DOWNLOADS_SUPPORTED) return;
    (async () => {
      await FS.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
      let list: DownloadItem[] = [];
      try {
        list = JSON.parse(await FS.readAsStringAsync(INDEX));
      } catch {}
      list = list.map((d) =>
        d.status === 'downloading' || d.status === 'resolving' || d.status === 'queued' ? { ...d, status: 'paused' as const } : d
      );
      // Drop finished items whose file was deleted (e.g. from the Files app).
      const checked = await Promise.all(
        list.map(async (d) => {
          if (d.status !== 'done') return d;
          const uri = fileUriOf(d);
          const info = uri ? await FS.getInfoAsync(uri).catch(() => null) : null;
          return info?.exists ? d : null;
        })
      );
      commit(() => checked.filter(Boolean) as DownloadItem[]);
      refreshFree();
    })();
  }, [commit, refreshFree]);

  // Save resume data when the app goes to the background, in case iOS kills it.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'background') return;
      for (const [id, task] of tasks.current) {
        try {
          const sv = task.savable();
          if (sv.resumeData) patch(id, { resumeData: sv.resumeData });
        } catch {}
      }
      persist(itemsRef.current);
    });
    return () => sub.remove();
  }, [patch, persist]);

  const runDownload = useCallback(
    async (id: string, url: string, resumeData?: string) => {
      const d = itemsRef.current.find((x) => x.id === id);
      if (!d?.localName) return;
      const fileUri = DIR + d.localName;
      const task = FS.createDownloadResumable(
        url,
        fileUri,
        { sessionType: FS.FileSystemSessionType.BACKGROUND },
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          const now = Date.now();
          if (now - (lastTick.current.get(id) ?? 0) < 500) return;
          lastTick.current.set(id, now);
          patch(id, { bytesWritten: totalBytesWritten, bytesTotal: totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : d.bytesTotal }, false);
        },
        resumeData
      );
      tasks.current.set(id, task);
      patch(id, { status: 'downloading', url, error: undefined });
      try {
        const res = resumeData ? await task.resumeAsync() : await task.downloadAsync();
        tasks.current.delete(id);
        if (!res) return; // paused or cancelled
        if (res.status >= 400) throw new Error(`Download failed (HTTP ${res.status}). The link may have expired; tap retry.`);
        const info = await FS.getInfoAsync(fileUri);
        const size = info.exists ? info.size ?? 0 : 0;
        patch(id, { status: 'done', bytesWritten: size, bytesTotal: size, resumeData: undefined, completedAt: Date.now() });
      } catch (e) {
        tasks.current.delete(id);
        const cur = itemsRef.current.find((x) => x.id === id);
        if (cur && cur.status !== 'paused') patch(id, { status: 'error', error: (e as Error).message });
      } finally {
        refreshFree();
      }
    },
    [patch, refreshFree]
  );

  const resolveAndRun = useCallback(
    async (id: string) => {
      const d = itemsRef.current.find((x) => x.id === id);
      const key = keyRef.current;
      if (!d) return;
      if (!key) return patch(id, { status: 'error', error: 'Log in to AllDebrid first.' });
      const signal = { cancelled: false };
      cancels.current.set(id, signal);
      patch(id, { status: 'resolving', error: undefined });
      try {
        const r = await resolveStream(key, d.stream as ParsedStream, { season: d.season, episode: d.episode, signal, waitMs: 8000 });
        if (signal.cancelled) return;
        const free = await FS.getFreeDiskStorageAsync().catch(() => null);
        if (free != null && r.size && r.size > free - 200e6) throw new Error('Not enough free space on this iPhone.');
        const localName = d.localName ?? `${d.id}-${safeName(r.filename) || 'video.mp4'}`;
        patch(id, { localName, filename: r.filename, bytesTotal: r.size || d.bytesTotal });
        await runDownload(id, r.url);
      } catch (e) {
        if (signal.cancelled) return;
        const msg = e instanceof NotCachedError ? 'Not cached on AllDebrid yet. It is downloading there; retry later.' : (e as Error).message;
        patch(id, { status: 'error', error: msg });
      } finally {
        cancels.current.delete(id);
      }
    },
    [patch, runDownload]
  );

  // Simple queue: keep at most MAX_ACTIVE downloads running.
  useEffect(() => {
    const active = items.filter((d) => d.status === 'downloading' || d.status === 'resolving').length;
    const next = items.filter((d) => d.status === 'queued').slice(0, Math.max(0, MAX_ACTIVE - active));
    next.forEach((d) => resolveAndRun(d.id));
  }, [items, resolveAndRun]);

  const start = useCallback(
    async (meta: DownloadMeta, stream: ParsedStream) => {
      if (!DOWNLOADS_SUPPORTED) throw new Error('Downloads are only available in the iOS app.');
      const key = downloadKey(meta);
      const existing = itemsRef.current.find((d) => d.id.startsWith(key + '-') && d.status !== 'error');
      if (existing) throw new Error(existing.status === 'done' ? 'Already downloaded.' : 'Already in your downloads.');
      const { infoHash, fileIdx, url, behaviorHints, label, quality, key: sk, tags, sizeText, sizeBytes } = stream;
      const item: DownloadItem = {
        ...meta,
        id: `${key}-${Date.now().toString(36)}`,
        status: 'queued',
        bytesWritten: 0,
        bytesTotal: sizeBytes ?? 0,
        createdAt: Date.now(),
        stream: { infoHash, fileIdx, url, behaviorHints, label, quality, key: sk, tags, sizeText, sizeBytes },
      };
      // Replace a failed attempt for the same title.
      commit((l) => [item, ...l.filter((d) => !(d.id.startsWith(key + '-') && d.status === 'error'))]);
    },
    [commit]
  );

  const pause = useCallback(
    async (id: string) => {
      const task = tasks.current.get(id);
      const c = cancels.current.get(id);
      if (c) c.cancelled = true;
      patch(id, { status: 'paused' });
      if (task) {
        try {
          const st = await task.pauseAsync();
          patch(id, { resumeData: st.resumeData });
        } catch {}
        tasks.current.delete(id);
      }
    },
    [patch]
  );

  const resume = useCallback(
    async (id: string) => {
      const d = itemsRef.current.find((x) => x.id === id);
      if (!d) return;
      if (d.resumeData && d.url) {
        patch(id, { resumeData: undefined });
        await runDownload(id, d.url, d.resumeData);
        // If resuming failed (expired link), fall back to a fresh link.
        const after = itemsRef.current.find((x) => x.id === id);
        if (after?.status === 'error') patch(id, { status: 'queued', bytesWritten: 0 });
      } else {
        patch(id, { status: 'queued', bytesWritten: 0 });
      }
    },
    [patch, runDownload]
  );

  const remove = useCallback(
    async (id: string) => {
      const d = itemsRef.current.find((x) => x.id === id);
      const c = cancels.current.get(id);
      if (c) c.cancelled = true;
      const task = tasks.current.get(id);
      if (task) {
        await task.cancelAsync().catch(() => {});
        tasks.current.delete(id);
      }
      const uri = d && fileUriOf(d);
      if (uri) await FS.deleteAsync(uri, { idempotent: true }).catch(() => {});
      commit((l) => l.filter((x) => x.id !== id));
      refreshFree();
    },
    [commit, refreshFree]
  );

  const findDone = useCallback(
    (m: Pick<DownloadMeta, 'type' | 'tmdbId' | 'season' | 'episode'>) => {
      const k = downloadKey(m) + '-';
      return items.find((d) => d.id.startsWith(k) && d.status === 'done');
    },
    [items]
  );
  const findAny = useCallback(
    (m: Pick<DownloadMeta, 'type' | 'tmdbId' | 'season' | 'episode'>) => {
      const k = downloadKey(m) + '-';
      return items.find((d) => d.id.startsWith(k));
    },
    [items]
  );

  const usedBytes = useMemo(() => items.reduce((n, d) => n + (d.status === 'done' ? d.bytesTotal : d.bytesWritten), 0), [items]);

  const value = useMemo<Ctx>(
    () => ({ items, start, pause, resume, remove, findDone, findAny, freeBytes, usedBytes }),
    [items, start, pause, resume, remove, findDone, findAny, freeBytes, usedBytes]
  );
  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>;
}

export function useDownloads() {
  const ctx = useContext(DownloadsContext);
  if (!ctx) throw new Error('useDownloads must be used inside DownloadsProvider');
  return ctx;
}

export function formatBytes(n: number) {
  if (!n || n < 0) return '0 MB';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  return `${Math.round(n / 1e6)} MB`;
}
