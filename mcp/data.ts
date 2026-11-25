// Loading the Companion's static data files for the MCP server.
//
// The function does NOT bundle the data: it fetches the same files the app serves (public/…) over HTTPS
// from its own deployment, and keeps them in memory for the life of the warm instance. That way a data
// deploy (tactics library, Renegade pack, catalogue sync) reaches the MCP with no code change.
//
// Base URL: the request's own host when that is the Companion (production, a preview, or localhost), else
// production. A failed fetch from a preview (deployment protection) falls back to production.
// `TOW_MCP_DATA_DIR` reads the files from disk instead (local tests); `TOW_MCP_DATA_BASE` forces a base.

export const PROD_BASE = 'https://oldworldcompanion.vercel.app';
const TTL_MS = 30 * 60 * 1000;

interface Entry { at: number; p: Promise<unknown> }
const cache = new Map<string, Entry>();
/** Load timings of this instance, for diagnostics (path → ms of the first load). */
export const loadLog: { path: string; ms: number; bytes: number; from: string }[] = [];

let currentBase = PROD_BASE;

const env = (k: string): string | undefined => (typeof process !== 'undefined' ? process.env?.[k] : undefined) || undefined;

/** Pick the data base for this request from its Host header. */
export function setBaseFromHost(host: string | undefined, proto?: string): string {
  const forced = env('TOW_MCP_DATA_BASE');
  if (forced) return (currentBase = forced.replace(/\/+$/, ''));
  const h = String(host ?? '').trim().toLowerCase();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(h);
  // Only hosts that can only be this app: production, its own preview deployments, or a local server.
  const ours = h === 'oldworldcompanion.vercel.app' || /^oldworldcompanion[a-z0-9-]*\.vercel\.app$/.test(h)
    || /^tow-companion[a-z0-9-]*\.vercel\.app$/.test(h);
  if (local) currentBase = `${proto === 'https' ? 'https' : 'http'}://${h}`;
  else if (ours) currentBase = `https://${h}`;
  else currentBase = PROD_BASE;
  return currentBase;
}

export const dataBase = (): string => currentBase;

async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    const t = await r.text();
    // A missing file can come back as the SPA's index.html; that is "not there", not data.
    if (/^\s*</.test(t)) return null;
    return t;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readRaw(path: string): Promise<{ text: string; from: string } | null> {
  const dir = env('TOW_MCP_DATA_DIR');
  if (dir) {
    const fs = await import('node:fs/promises');
    const p = await import('node:path');
    try {
      return { text: await fs.readFile(p.join(dir, path), 'utf8'), from: 'disk' };
    } catch {
      return null;
    }
  }
  const base = currentBase;
  const first = await fetchText(`${base}/${path}`);
  if (first != null) return { text: first, from: base };
  if (base !== PROD_BASE) {
    const second = await fetchText(`${PROD_BASE}/${path}`);
    if (second != null) return { text: second, from: PROD_BASE };
  }
  return null;
}

/** Fetch and parse a data file (path relative to the site root, e.g. `tactics/lessen.json`).
 *  `null` when it does not exist or cannot be read. Cached per base for TTL_MS. */
export function loadJson<T = unknown>(path: string): Promise<T | null> {
  const key = `${env('TOW_MCP_DATA_DIR') ?? currentBase}|${path}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p as Promise<T | null>;
  const t0 = Date.now();
  const p = readRaw(path).then((raw) => {
    if (!raw) return null;
    const parsed = JSON.parse(raw.text) as T;
    loadLog.push({ path, ms: Date.now() - t0, bytes: raw.text.length, from: raw.from });
    return parsed;
  }).catch(() => null);
  cache.set(key, { at: Date.now(), p });
  // Do not pin a failure: the next call tries again.
  void p.then((v) => { if (v == null && cache.get(key)?.p === p) cache.delete(key); });
  return p;
}

/** A required file: throws a readable error when it cannot be loaded. */
export async function need<T = unknown>(path: string): Promise<T> {
  const v = await loadJson<T>(path);
  if (v == null) throw new Error(`Could not load ${path} from ${currentBase}. Try again in a moment.`);
  return v;
}

/** Memoise a derived structure on the loaded object it came from (cheap per-instance indexes). */
export function derived<O extends object, R>(store: WeakMap<O, R>, from: O, make: (o: O) => R): R {
  let v = store.get(from);
  if (v === undefined) {
    v = make(from);
    store.set(from, v);
  }
  return v;
}

/** For tests: forget everything. */
export function resetCache(): void {
  cache.clear();
  loadLog.length = 0;
}
