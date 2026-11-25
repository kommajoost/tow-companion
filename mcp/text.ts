// Text helpers for the MCP server: normalising, tokenising, a light stemmer and output trimming.
// Pure, no I/O.

/** Lower case, no diacritics, no apostrophes, everything that is not a letter or digit becomes a space. */
export function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Strip OWB's bookkeeping tags ("{renegade}", "{mount}") from a display name. */
export const stripTags = (s: unknown): string => String(s ?? '').replace(/\s*\{[^}]*\}/g, '').trim();

const STOP = new Set([
  // English
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'with', 'vs', 'versus', 'how', 'what', 'which',
  'is', 'are', 'do', 'does', 'i', 'my', 'me', 'you', 'your', 'it', 'its', 'be', 'can', 'should', 'would', 'when',
  'where', 'why', 'best', 'good', 'use', 'using', 'play', 'playing', 'against', 'about', 'any', 'some', 'tips',
  'tip', 'advice', 'tactic', 'tactics', 'strategy', 'warhammer', 'old', 'world', 'tow', 'that', 'this', 'there',
  'at', 'as', 'by', 'from', 'into', 'than', 'then', 'them', 'they', 'their', 'we', 'our', 'get', 'have', 'has',
  // Dutch
  'de', 'het', 'een', 'van', 'hoe', 'wat', 'welke', 'ik', 'mijn', 'je', 'jij', 'jouw', 'tegen', 'met', 'en', 'of',
  'voor', 'moet', 'moeten', 'die', 'dat', 'wanneer', 'waar', 'bij', 'op', 'te', 'om', 'speel', 'spelen', 'goed',
  'beste', 'is', 'zijn', 'kan', 'kun', 'ik', 'er', 'als', 'aan', 'naar', 'ook', 'nog', 'wel', 'niet', 'tactiek',
]);

/** A light, symmetric stemmer: plural and -ing/-ed endings, trailing e. Applied to both query and text,
 *  so "flanking", "flanks" and "flank" meet, as do "charge", "charges" and "charging". */
export function stem(w: string): string {
  let s = w;
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`;
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && /(ches|shes|sses|xes|zes)$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss') && !s.endsWith('us')) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
}

/** Tokens of a text, stemmed. Keeps stop words out only when `query` is set (a lesson's text keeps them,
 *  they simply never match a query term). */
export function tokens(s: unknown, query = false): string[] {
  const out: string[] = [];
  for (const w of norm(s).split(' ')) {
    if (!w) continue;
    if (query && STOP.has(w)) continue;
    out.push(stem(w));
  }
  return out;
}

/** Counted tokens. */
export function bag(s: unknown): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens(s)) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/** Query expansion: game jargon and a few Dutch words. Keys and values are matched after `norm`+`stem`.
 *  Expanded terms score at a lower weight than the words the user typed. */
const SYNONYMS: Record<string, string[]> = {
  chaff: ['redirect', 'redirector', 'screen', 'distract', 'speed bump'],
  redirect: ['chaff', 'redirector'],
  redirector: ['chaff', 'redirect'],
  screen: ['chaff', 'screening'],
  flank: ['flanking', 'side', 'rear'],
  hammer: ['hammer', 'breaker', 'damage dealer', 'shock'],
  anvil: ['tarpit', 'tar pit', 'hold', 'block', 'anvil'],
  tarpit: ['anvil', 'tar pit', 'hold'],
  magic: ['spell', 'wizard', 'lore', 'caster'],
  spell: ['magic', 'lore'],
  wizard: ['magic', 'caster', 'spell'],
  shoot: ['shooting', 'missile', 'ranged', 'gunline'],
  shooting: ['missile', 'ranged', 'gunline'],
  ranged: ['shooting', 'missile'],
  artillery: ['war machine', 'cannon', 'bolt thrower', 'stone thrower'],
  cannon: ['war machine', 'artillery'],
  monster: ['behemoth', 'monstrous'],
  character: ['hero', 'lord', 'general'],
  general: ['character', 'leadership'],
  deploy: ['deployment', 'setup'],
  deployment: ['deploy'],
  list: ['list building', 'army building'],
  terrain: ['cover', 'line of sight', 'forest', 'hill', 'building'],
  psychology: ['fear', 'terror', 'panic', 'frenzy', 'stupidity'],
  scenario: ['objective', 'mission', 'victory point'],
  objective: ['scenario', 'victory point'],
  march: ['marching', 'movement'],
  infantry: ['block', 'regiment', 'rank'],
  cavalry: ['knight', 'rider'],
  knight: ['cavalry', 'lance'],
  msu: ['small unit', 'multiple small unit'],
  deathstar: ['death star', 'bus'],
  // Dutch → English game terms
  flanken: ['flank'],
  omleiden: ['redirect', 'chaff'],
  afleiden: ['redirect', 'chaff', 'distract'],
  schieten: ['shooting', 'missile'],
  magie: ['magic', 'spell'],
  spreuk: ['spell', 'magic'],
  tovenaar: ['wizard', 'magic'],
  opstelling: ['deployment'],
  opstellen: ['deployment', 'deploy'],
  lijst: ['list building', 'army building'],
  leger: ['army'],
  terrein: ['terrain'],
  infanterie: ['infantry'],
  cavalerie: ['cavalry'],
  ridder: ['knight', 'cavalry'],
  aanval: ['charge', 'attack'],
  charge: ['charging', 'charge'],
  scenarios: ['scenario'],
  doel: ['objective'],
  paniek: ['panic'],
  angst: ['fear'],
  terreur: ['terror'],
  verdedig: ['defend', 'hold'],
  karakter: ['character', 'hero'],
  held: ['hero', 'character'],
  monsters: ['monster', 'behemoth'],
  oorlogsmachine: ['war machine', 'artillery'],
};

let synIndex: Map<string, string[][]> | null = null;
/** stemmed key → list of stemmed token sequences */
function synonyms(): Map<string, string[][]> {
  if (synIndex) return synIndex;
  synIndex = new Map();
  for (const [k, vs] of Object.entries(SYNONYMS)) {
    const key = stem(norm(k));
    const list = synIndex.get(key) ?? [];
    for (const v of vs) list.push(tokens(v));
    synIndex.set(key, list);
  }
  return synIndex;
}

/** Add synonyms (from the built-in list and from the library's own tag synonyms, when present). */
export function expand(terms: string[], extra?: Map<string, string[][]>): string[] {
  const out = new Set<string>();
  for (const t of terms) {
    for (const seq of [...(synonyms().get(t) ?? []), ...(extra?.get(t) ?? [])]) for (const w of seq) if (!terms.includes(w)) out.add(w);
  }
  return [...out];
}

/** Cut a text at a word boundary. */
export function trunc(s: unknown, max: number): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

/** A short passage around the first place where one of the terms occurs (for rule search results). */
export function snippet(text: string, terms: string[], max = 220): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const low = t.toLowerCase();
  let at = -1;
  for (const term of terms) {
    if (term.length < 3) continue;
    const i = low.indexOf(term);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return trunc(t, max);
  const start = Math.max(0, at - Math.floor(max / 3));
  const piece = t.slice(start, start + max);
  const firstSpace = start > 0 ? piece.indexOf(' ') + 1 : 0;
  return `${start > 0 ? '…' : ''}${trunc(piece.slice(firstSpace), max)}`;
}

/** Seconds (or "m:ss") as a readable timestamp, like src/lib/tactics.ts `tijdLabel`. */
export function timeLabel(t: number | string | null | undefined): string | null {
  if (t == null || t === '') return null;
  if (typeof t === 'string') return t;
  if (!Number.isFinite(t) || t < 0) return null;
  const s = Math.floor(t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** A YouTube URL with its `t=` set to `seconds`. */
export function withTime(url: string, seconds: number): string {
  try {
    const u = new URL(url);
    u.searchParams.set('t', `${Math.max(0, Math.floor(seconds))}s`);
    return u.toString();
  } catch {
    return url;
  }
}

/** Format a number for output: at most `d` decimals, no trailing zeros. */
export function num(n: number, d = 2): string {
  if (!Number.isFinite(n)) return String(n);
  return String(Math.round(n * 10 ** d) / 10 ** d);
}

/** Split a comma-separated rules label without breaking "Armour Bane (1, Cold One only)". */
export function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of String(s ?? '')) {
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
