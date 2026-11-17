/**
 * AllDebrid API client. Docs: https://docs.alldebrid.com/
 * Auth is `Authorization: Bearer <apikey>`. Responses are `{ status: 'success', data }` or
 * `{ status: 'error', error: { code, message } }`.
 */
const API = 'https://api.alldebrid.com';
const AGENT = 'stremie';

export class AllDebridError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

type Params = Record<string, string | number | (string | number)[] | undefined>;

function form(params: Params) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => body.append(`${k}[]`, String(x)));
    else body.append(k, String(v));
  }
  return body.toString();
}

async function call<T>(path: string, apiKey: string | null, params: Params = {}, method: 'GET' | 'POST' = 'POST'): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  let url = `${API}${path}?agent=${AGENT}`;
  let body: string | undefined;
  if (method === 'GET') {
    const qs = form(params);
    if (qs) url += `&${qs}`;
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = form(params);
  }
  const res = await fetch(url, { method, headers, body });
  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new AllDebridError('BAD_RESPONSE', `AllDebrid returned an invalid response (${res.status}).`);
  }
  if (json?.status !== 'success') {
    const err = json?.error ?? {};
    throw new AllDebridError(err.code || 'UNKNOWN', err.message || `AllDebrid request failed (${res.status}).`);
  }
  return json.data as T;
}

// ---------- PIN login ----------
export type PinStart = { pin: string; check: string; expires_in: number; user_url: string; base_url: string };
export type PinCheck = { activated: boolean; expires_in: number; apikey?: string };

export const pinGet = () => call<PinStart>('/v4.1/pin/get', null, {}, 'GET');
export const pinCheck = (pin: string, check: string) => call<PinCheck>('/v4/pin/check', null, { pin, check });

// ---------- Account ----------
export type AdUser = { username: string; email: string; isPremium: boolean; isTrial: boolean; premiumUntil: number };
export const getUser = (key: string) => call<{ user: AdUser }>('/v4/user', key, {}, 'GET').then((d) => d.user);

// ---------- Magnets ----------
export type UploadedMagnet = { magnet: string; hash: string; name: string; size: number; ready: boolean; id: number; error?: { code: string; message: string } };

export async function uploadMagnet(key: string, magnetOrHash: string): Promise<UploadedMagnet> {
  const data = await call<{ magnets: UploadedMagnet[] }>('/v4/magnet/upload', key, { magnets: [magnetOrHash] });
  const m = data.magnets[0];
  if (!m) throw new AllDebridError('MAGNET_UPLOAD', 'AllDebrid did not accept the magnet.');
  if (m.error) throw new AllDebridError(m.error.code, m.error.message);
  return m;
}

export type MagnetStatus = {
  id: number;
  filename: string;
  size: number;
  status: string;
  statusCode: number; // 0-3 processing, 4 ready, 5+ error
  downloaded: number;
  downloadSpeed: number;
  seeders: number;
};

export async function magnetStatus(key: string, id: number): Promise<MagnetStatus> {
  const data = await call<{ magnets: MagnetStatus | MagnetStatus[] }>('/v4.1/magnet/status', key, { id });
  const m = Array.isArray(data.magnets) ? data.magnets[0] : data.magnets;
  if (!m) throw new AllDebridError('MAGNET_INVALID_ID', 'Magnet not found on AllDebrid.');
  return m;
}

/** File tree node: folders have `e` (entries), files have `s` (size) and `l` (link). */
export type FileNode = { n: string; s?: number; l?: string; e?: FileNode[] };
export type FlatFile = { path: string; name: string; size: number; link: string };

export async function magnetFiles(key: string, id: number): Promise<FlatFile[]> {
  const data = await call<{ magnets: { id: number; files?: FileNode[]; error?: { code: string; message: string } }[] }>(
    '/v4/magnet/files',
    key,
    { id: [id] }
  );
  const m = data.magnets[0];
  if (m?.error) throw new AllDebridError(m.error.code, m.error.message);
  const out: FlatFile[] = [];
  const walk = (nodes: FileNode[], prefix: string) => {
    for (const n of nodes) {
      const path = prefix ? `${prefix}/${n.n}` : n.n;
      if (n.e) walk(n.e, path);
      else if (n.l) out.push({ path, name: n.n, size: n.s ?? 0, link: n.l });
    }
  };
  walk(m?.files ?? [], '');
  return out;
}

// ---------- Links ----------
export type Unlocked = { link: string; filename: string; filesize: number; id: string; delayed?: number; host: string };

export const unlockLink = (key: string, link: string) => call<Unlocked>('/v4/link/unlock', key, { link });
export const delayedLink = (key: string, id: number) =>
  call<{ status: 1 | 2 | 3; time_left: number; link?: string }>('/v4/link/delayed', key, { id });

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Unlock a hoster/magnet file link, waiting for delayed links when needed. */
export async function unlockAndWait(key: string, link: string, signal?: { cancelled: boolean }) {
  const u = await unlockLink(key, link);
  if (u.link) return u;
  if (u.delayed) {
    for (let i = 0; i < 24 && !signal?.cancelled; i++) {
      await sleep(5000);
      const d = await delayedLink(key, u.delayed);
      if (d.status === 2 && d.link) return { ...u, link: d.link };
      if (d.status === 3) throw new AllDebridError('DELAYED_ERROR', 'AllDebrid could not generate this link.');
    }
  }
  throw new AllDebridError('NO_LINK', 'AllDebrid did not return a playable link.');
}
