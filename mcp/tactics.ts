// Tactics library tools: search_tactics, get_lesson, list_tactics_index, list_principles.
//
// Data: public/tactics/lessen.json, bronnen.json, themas.json, and (when the re-index has landed)
// public/tactics/tags.json plus a `tags` field and sub-themes on the lessons. Everything about tags and
// sub-themes is read tolerantly: absent → ignored, present in any of the plausible shapes → used.
// public/tactics/principes.json (optional): principles above the lessons, each an AI summary of the
// lessons under it, ranked by distinct channels then lessons (tactics/codex/principes.mjs).

import type { Bron, Kanaal, Les, LesBron } from '../src/lib/tactics';
import { derived, loadJson, need } from './data';
import { bag, expand, norm, timeLabel, tokens, trunc, withTime } from './text';
import { armyName, resolveArmy, RENEGADE_ARMIES } from './armies';

type Raw = Record<string, unknown>;
type Lesson = Les & Raw;

interface Vocab { id: string; naam: string; omschrijving?: string; parent?: string; synonyms: string[] }

export interface Library {
  lessons: Lesson[];
  byId: Map<string, Lesson>;
  sources: Map<string, Bron>;
  channels: Map<string, Kanaal>;
  themes: Vocab[];
  phases: Vocab[];
  subthemes: Vocab[];
  tags: Vocab[];
  updated: string | null;
}

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const nameOf = (o: Raw): string | undefined => str(o.naam) ?? str(o.name) ?? str(o.label) ?? str(o.titel) ?? str(o.title);
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const strList = (v: unknown): string[] => listOf(v).flatMap((x) => (typeof x === 'string' ? [x] : isObj(x) ? [str(x.id) ?? nameOf(x) ?? ''] : [])).filter(Boolean);

/** Read a vocabulary list in any of the shapes a re-index might produce. */
function vocabFrom(v: unknown, parent?: string): Vocab[] {
  const items = Array.isArray(v) ? v : isObj(v) ? (Array.isArray(v.tags) ? v.tags : Array.isArray(v.items) ? v.items
    : Object.entries(v).map(([id, x]) => (isObj(x) ? { id, ...x } : { id, naam: String(x) }))) : [];
  return items.flatMap((x): Vocab[] => {
    if (typeof x === 'string') return [{ id: x, naam: x.replace(/-/g, ' '), parent, synonyms: [] }];
    if (!isObj(x)) return [];
    const id = str(x.id) ?? (nameOf(x) ? norm(nameOf(x)).replace(/ /g, '-') : undefined);
    if (!id) return [];
    return [{
      id,
      naam: nameOf(x) ?? id.replace(/-/g, ' '),
      omschrijving: str(x.omschrijving) ?? str(x.description),
      parent: str(x.thema) ?? str(x.parent) ?? str(x.theme) ?? parent,
      synonyms: strList(x.synoniemen ?? x.synonyms ?? x.aliases ?? x.alias),
    }];
  });
}

const SUB_KEYS = ['subthemas', 'subThemas', 'subthema', 'subthemes', 'subThemes', 'subtheme', 'subtopics'];
const subKeyOf = (o: Raw): unknown => SUB_KEYS.map((k) => o[k]).find((v) => v != null);

export const lessonTags = (l: Lesson): string[] => strList(l.tags);
export const lessonSubthemes = (l: Lesson): string[] => strList(subKeyOf(l));

export async function library(): Promise<Library> {
  const [lessen, bronnen, themas, tagsFile] = await Promise.all([
    need<Raw>('tactics/lessen.json'),
    loadJson<Raw>('tactics/bronnen.json'),
    loadJson<Raw>('tactics/themas.json'),
    loadJson<unknown>('tactics/tags.json'),
  ]);
  return derived(libCache, lessen, () => buildLibrary(lessen, bronnen, themas, tagsFile));
}
const libCache = new WeakMap<Raw, Library>();

function buildLibrary(lessen: Raw, bronnen: Raw | null, themas: Raw | null, tagsFile: unknown): Library {
  const lessons = (Array.isArray(lessen.lessen) ? lessen.lessen : [])
    .filter((l): l is Lesson => isObj(l) && typeof l.id === 'string' && typeof l.titel === 'string')
    .map((l) => ({ ...l, themas: strList(l.themas), units: Array.isArray(l.units) ? l.units.map(String) : [], bronnen: Array.isArray(l.bronnen) ? l.bronnen : [], markeringen: Array.isArray(l.markeringen) ? l.markeringen : [] }));
  const themes = vocabFrom(themas?.themas);
  const phases = vocabFrom(themas?.fases);
  // Sub-themes: nested in themas.json (theme.subthemas…), or a top-level list, or only on the lessons.
  const subthemes: Vocab[] = [];
  for (const t of (Array.isArray(themas?.themas) ? themas!.themas as unknown[] : [])) {
    if (isObj(t) && subKeyOf(t) != null) subthemes.push(...vocabFrom(subKeyOf(t), str(t.id)));
  }
  if (themas && subKeyOf(themas) != null) subthemes.push(...vocabFrom(subKeyOf(themas)));
  const tags = vocabFrom(tagsFile);
  // Ids seen on lessons but absent from the vocab files still need to be browsable.
  const known = (list: Vocab[]) => new Set(list.map((v) => v.id));
  const addSeen = (list: Vocab[], ids: string[]) => { const k = known(list); for (const id of ids) if (!k.has(id)) { k.add(id); list.push({ id, naam: id.replace(/-/g, ' '), synonyms: [] }); } };
  addSeen(themes, lessons.flatMap((l) => l.themas));
  addSeen(subthemes, lessons.flatMap(lessonSubthemes));
  addSeen(tags, lessons.flatMap(lessonTags));
  const sources = new Map<string, Bron>();
  const channels = new Map<string, Kanaal>();
  for (const b of (Array.isArray(bronnen?.bronnen) ? bronnen!.bronnen as Bron[] : [])) if (b && typeof b.id === 'string') sources.set(b.id, b);
  for (const k of (Array.isArray(bronnen?.kanalen) ? bronnen!.kanalen as Kanaal[] : [])) if (k && typeof k.id === 'string') channels.set(k.id, k);
  return { lessons, byId: new Map(lessons.map((l) => [l.id, l])), sources, channels, themes, phases, subthemes, tags, updated: str(lessen.bijgewerkt) ?? null };
}

// ── index for ranking ─────────────────────────────────────────────────────────────────────────────

interface Doc { l: Lesson; fields: { w: number; b: Map<string, number> }[]; title: string; body: string }
interface Index { docs: Doc[]; df: Map<string, number>; tagSyn: Map<string, string[][]> }

const vocabName = (list: Vocab[], id: string) => list.find((v) => v.id === id)?.naam ?? id;

const idxCache = new WeakMap<Library, Index>();
function index(lib: Library): Index {
  return derived(idxCache, lib, () => {
    const docs: Doc[] = lib.lessons.map((l) => {
      const tagText = [...lessonTags(l).map((t) => `${t} ${vocabName(lib.tags, t)}`), ...lessonSubthemes(l).map((t) => `${t} ${vocabName(lib.subthemes, t)}`)].join(' ');
      const quotes = l.bronnen.map((b: LesBron) => `${b.citaat ?? ''} ${(b.extraCitaten ?? []).map((x) => x.citaat).join(' ')}`).join(' ');
      return {
        l,
        title: norm(l.titel),
        body: norm(`${l.titel} ${l.tekst}`),
        fields: [
          { w: 3, b: bag(l.titel) },
          { w: 3, b: bag(l.units.join(' ')) },
          { w: 2.5, b: bag(tagText) },
          { w: 2, b: bag(l.tekst) },
          { w: 1.2, b: bag(l.waarom) },
          { w: 1, b: bag(l.voorbeeld) },
          { w: 0.6, b: bag(l.wanneerNiet) },
          { w: 1, b: bag(l.themas.map((t) => `${t} ${vocabName(lib.themes, t)}`).join(' ')) },
          { w: 0.5, b: bag(quotes) },
        ],
      };
    });
    const df = new Map<string, number>();
    for (const d of docs) {
      const seen = new Set<string>();
      for (const f of d.fields) for (const t of f.b.keys()) seen.add(t);
      for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
    }
    // Tag synonyms from tags.json join the built-in jargon list.
    const tagSyn = new Map<string, string[][]>();
    for (const v of [...lib.tags, ...lib.subthemes]) {
      const names = [v.id.replace(/-/g, ' '), v.naam, ...v.synonyms];
      for (const n of names) {
        const key = tokens(n).join(' ');
        if (!key || key.includes(' ')) continue;
        tagSyn.set(key, [...(tagSyn.get(key) ?? []), ...names.filter((x) => x !== n).map((x) => tokens(x))]);
      }
    }
    return { docs, df, tagSyn };
  });
}

// ── filters ───────────────────────────────────────────────────────────────────────────────────────

function matchVocab(list: Vocab[], q: string): Vocab | undefined {
  const n = norm(q);
  return list.find((v) => norm(v.id) === n || norm(v.naam) === n)
    ?? list.find((v) => v.synonyms.some((s) => norm(s) === n))
    ?? list.find((v) => norm(v.naam).startsWith(n) || norm(v.id).startsWith(n))
    ?? list.find((v) => norm(v.naam).includes(n) || n.includes(norm(v.naam)));
}

// ── output ────────────────────────────────────────────────────────────────────────────────────────

function sourceLine(lib: Library, b: LesBron, full: boolean): string {
  const bron = lib.sources.get(b.bronId);
  const ch = bron ? lib.channels.get(bron.kanaalId) : undefined;
  const t = timeLabel(b.tijd);
  const parts = [
    ch ? ch.naam : bron?.kanaalId ?? 'unknown channel',
    bron ? `"${bron.titel}"${bron.datum ? ` (${bron.datum})` : ''}` : b.bronId,
    t ? `at ${t}` : null,
  ].filter(Boolean).join(' — ');
  const lines = [`${parts} — ${b.url}`];
  if (b.citaat) lines.push(`  quote: "${b.citaat}"`);
  if (full) {
    for (const x of b.extraCitaten ?? []) lines.push(`  quote at ${timeLabel(x.tijd)}: "${x.citaat}" — ${withTime(b.url, x.tijd)}`);
  }
  return lines.join('\n');
}

const MARK_LABEL: Record<string, string> = {
  verouderd: 'OUTDATED',
  'renegade-afwijking': 'RENEGADE DIFFERS',
  'regel-afwijking': 'RULES DIFFER',
};

function flagLines(l: Lesson): string[] {
  const out = l.markeringen.map((m) => `⚠ ${MARK_LABEL[m.soort] ?? m.soort}: ${m.tekst}`);
  if (l.leger && RENEGADE_ARMIES.has(l.leger) && !l.markeringen.some((m) => m.soort === 'renegade-afwijking')) {
    out.push(`⚠ Renegade check: ${armyName(l.leger)} uses the Renegade V2 list in the Companion. Verify units, points and rules named here with get_unit before applying the lesson.`);
  }
  return out;
}

function lessonHeader(lib: Library, l: Lesson): string {
  const meta = [
    `Army: ${l.leger ? armyName(l.leger) : 'general'}`,
    l.fase ? `Phase: ${vocabName(lib.phases, l.fase)}` : null,
    l.themas.length ? `Themes: ${l.themas.map((t) => vocabName(lib.themes, t)).join(', ')}` : null,
    lessonSubthemes(l).length ? `Sub-themes: ${lessonSubthemes(l).map((t) => vocabName(lib.subthemes, t)).join(', ')}` : null,
    lessonTags(l).length ? `Tags: ${lessonTags(l).map((t) => vocabName(lib.tags, t)).join(', ')}` : null,
    l.datum ? `Date: ${l.datum}` : null,
  ].filter(Boolean);
  return meta.join(' · ');
}

// ── tools ─────────────────────────────────────────────────────────────────────────────────────────

export interface SearchArgs { query?: string; army?: string; only_army?: boolean; theme?: string; tag?: string; phase?: string; limit?: number; offset?: number }

export interface Hit { l: Lesson; score: number }

export async function rankLessons(a: SearchArgs): Promise<{ lib: Library; hits: Hit[]; notes: string[]; armySlug: string | null }> {
  const lib = await library();
  const idx = index(lib);
  const notes: string[] = [];
  let armySlug: string | null = null;
  if (a.army) {
    armySlug = await resolveArmy(a.army);
    if (!armySlug) notes.push(`Unknown army "${a.army}"; searched all lessons.`);
  }
  const theme = a.theme ? matchVocab(lib.themes, a.theme) ?? matchVocab(lib.subthemes, a.theme) : undefined;
  if (a.theme && !theme) notes.push(`Unknown theme "${a.theme}" (see list_tactics_index); not filtered on it.`);
  const tag = a.tag ? matchVocab(lib.tags, a.tag) ?? matchVocab(lib.subthemes, a.tag) : undefined;
  if (a.tag && !tag) notes.push(lib.tags.length ? `Unknown tag "${a.tag}"; not filtered on it.` : `The library has no tags yet; "${a.tag}" was used as a search word instead.`);
  const phase = a.phase ? matchVocab(lib.phases, a.phase) : undefined;
  if (a.phase && !phase) notes.push(`Unknown phase "${a.phase}"; not filtered on it.`);

  // An army named inside the query boosts that army's lessons (no filter).
  let boostArmy = armySlug;
  if (!boostArmy && a.query) boostArmy = await resolveArmy(a.query, true);

  const query = `${a.query ?? ''} ${a.tag && !tag ? a.tag : ''}`.trim();
  const terms = [...new Set(tokens(query, true))];
  const extra = expand(terms, idx.tagSyn).filter((t) => idx.df.has(t));
  const N = idx.docs.length;
  const idf = (t: string) => Math.log(1 + N / (1 + (idx.df.get(t) ?? 0)));
  const phrase = norm(query);

  const hits: Hit[] = [];
  for (const d of idx.docs) {
    const l = d.l;
    if (armySlug && !(l.leger === armySlug || (!a.only_army && l.leger == null))) continue;
    if (theme && !(l.themas.includes(theme.id) || lessonSubthemes(l).includes(theme.id))) continue;
    if (tag && !(lessonTags(l).includes(tag.id) || lessonSubthemes(l).includes(tag.id))) continue;
    if (phase && l.fase !== phase.id) continue;
    let score = 0;
    let matched = 0;
    for (const t of terms) {
      let s = 0;
      for (const f of d.fields) { const tf = f.b.get(t); if (tf) s += f.w * (1 + Math.log(tf)); }
      if (s > 0) { matched++; score += s * idf(t); }
    }
    for (const t of extra) {
      let s = 0;
      for (const f of d.fields) { const tf = f.b.get(t); if (tf) s += f.w; }
      score += 0.45 * s * idf(t);
    }
    if (terms.length) {
      if (score <= 0) continue;
      score *= 0.35 + 0.65 * (matched / terms.length);
      if (phrase.includes(' ') && (d.title.includes(phrase) || d.body.includes(phrase))) score *= 1.4;
    } else score = 1; // filters only: everything that passes, newest first
    if (boostArmy && l.leger === boostArmy) score *= 1.35;
    hits.push({ l, score });
  }
  hits.sort((x, y) => y.score - x.score || String(y.l.datum ?? '').localeCompare(String(x.l.datum ?? '')));
  if (!terms.length && !extra.length && !query && !armySlug && !theme && !tag && !phase) notes.push('No query or filter given: showing the newest lessons.');
  return { lib, hits, notes, armySlug };
}

// ── principles ────────────────────────────────────────────────────────────────────────────────────

export interface PrincipleSide { standpunt: string; aantalLessen: number; aantalKanalen: number; lessen: string[] }
export interface Principle {
  id: string; titel: string; tekst: string; soort: 'principe' | 'debat'; thema: string; leger: string | null;
  aantalLessen: number; aantalKanalen: number; kanalen: string[]; lessen: string[]; kanten?: PrincipleSide[];
}
export interface Principles {
  list: Principle[]; byId: Map<string, Principle>; top10: string[]; debat: string[];
  perThema: Record<string, string[]>; perLeger: Record<string, string[]>; updated: string | null;
}

const EMPTY_PRINCIPLES: Principles = { list: [], byId: new Map(), top10: [], debat: [], perThema: {}, perLeger: {}, updated: null };
const prCache = new WeakMap<Raw, Principles>();
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** public/tactics/principes.json, or an empty set when it is not there (older deploys). */
export async function principles(): Promise<Principles> {
  const raw = await loadJson<Raw>('tactics/principes.json');
  if (!raw || !Array.isArray(raw.principes)) return EMPTY_PRINCIPLES;
  return derived(prCache, raw, () => {
    const list: Principle[] = (raw.principes as unknown[]).filter((p): p is Raw => isObj(p) && !!str(p.id) && !!str(p.titel)).map((p) => ({
      id: String(p.id), titel: String(p.titel), tekst: str(p.tekst) ?? '', soort: p.soort === 'debat' ? 'debat' : 'principe',
      thema: str(p.thema) ?? '', leger: str(p.leger) ?? null, aantalLessen: num(p.aantalLessen), aantalKanalen: num(p.aantalKanalen),
      kanalen: strList(p.kanalen), lessen: strList(p.lessen),
      ...(Array.isArray(p.kanten) ? { kanten: (p.kanten as unknown[]).filter(isObj).map((k) => ({ standpunt: str(k.standpunt) ?? '', aantalLessen: num(k.aantalLessen), aantalKanalen: num(k.aantalKanalen), lessen: strList(k.lessen) })) } : {}),
    }));
    const byId = new Map(list.map((p) => [p.id, p]));
    const ids = (v: unknown) => strList(v).filter((id) => byId.has(id));
    const per = (v: unknown) => (isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ids(x)])) : {});
    return { list, byId, top10: ids(raw.top10), debat: ids(raw.debat), perThema: per(raw.perThema), perLeger: per(raw.perLeger), updated: str(raw.bijgewerkt) ?? null };
  });
}

const PRINCIPLE_NOTE = 'Each principle is a short AI summary of the lessons listed under it (advice several players give independently), ranked by distinct channels, then lessons. Start from the principles, then cite the lessons (get_lesson) and their sources, not the principle text.';

function principleBlock(lib: Library, p: Principle, n: number | null, opts: { maxIds?: number; titles?: boolean } = {}): string {
  const channels = p.kanalen.map((k) => lib.channels.get(k)?.naam ?? k);
  const ids = (list: string[]) => {
    const shown = opts.maxIds ? list.slice(0, opts.maxIds) : list;
    const more = list.length - shown.length;
    return `${shown.join(', ')}${more > 0 ? ` (+${more} more: list_principles)` : ''}`;
  };
  const lessonLine = (id: string) => `     - ${id}: ${lib.byId.get(id)?.titel ?? '(unknown lesson)'}`;
  const out = [
    `${n != null ? `${n}. ` : ''}${p.soort === 'debat' ? 'DEBATED: ' : ''}${p.titel}  [principle: ${p.id}]`,
    `   ${p.tekst}`,
    `   Backed by ${p.aantalLessen} lessons from ${p.aantalKanalen} channels (${channels.join(', ')}) · Theme: ${vocabName(lib.themes, p.thema)} · Army: ${p.leger ? armyName(p.leger) : 'general'}`,
  ];
  if (p.soort === 'debat' && p.kanten?.length) {
    p.kanten.forEach((k, i) => {
      out.push(`   Side ${i + 1}: ${k.standpunt} (${k.aantalLessen} lessons, ${k.aantalKanalen} channels)`);
      if (opts.titles) out.push(...k.lessen.map(lessonLine));
      else out.push(`     Lessons: ${ids(k.lessen)}`);
    });
  } else if (opts.titles) {
    out.push('   Lessons:', ...p.lessen.map(lessonLine));
  } else out.push(`   Lessons: ${ids(p.lessen)}`);
  return out.join('\n');
}

/** Principles that fit a search: the words of the query in the principle's title or text, or several of
 *  its lessons among the top hits. Army filter: general principles plus that army's. */
function principleHits(pr: Principles, q: string, hits: Hit[], armySlug: string | null, themeId: string | null): Principle[] {
  const terms = [...new Set(tokens(q, true))];
  const top = new Set(hits.slice(0, 10).map((h) => h.l.id));
  const rank = new Map(pr.list.map((p, i) => [p.id, i]));
  const scored = pr.list
    .filter((p) => (p.leger == null || p.leger === armySlug) && (!themeId || p.thema === themeId))
    .map((p) => {
      const b = bag(`${p.titel} ${p.tekst}`);
      const matched = terms.filter((t) => b.has(t)).length;
      const support = p.lessen.filter((id) => top.has(id)).length;
      const own = armySlug != null && p.leger === armySlug;
      const fits = terms.length ? matched === terms.length || support >= 2 : own || (!armySlug && !!themeId);
      return { p, fits, score: (terms.length ? (2 * matched) / terms.length : 0) + 0.5 * support + (own ? 0.5 : 0) };
    })
    .filter((x) => x.fits)
    .sort((x, y) => y.score - x.score || (rank.get(x.p.id) ?? 0) - (rank.get(y.p.id) ?? 0));
  return scored.slice(0, 3).map((x) => x.p);
}

export interface PrincipleArgs { theme?: string; army?: string; limit?: number }

export async function listPrinciples(a: PrincipleArgs): Promise<string> {
  const [lib, pr] = await Promise.all([library(), principles()]);
  if (!pr.list.length) return 'The tactics library has no principles yet. Use search_tactics for the lessons.';
  const limit = Math.min(30, Math.max(1, Math.floor(a.limit ?? 10)));
  const notes: string[] = [];
  let armySlug: string | null = null;
  if (a.army) {
    armySlug = await resolveArmy(a.army);
    if (!armySlug) notes.push(`Unknown army "${a.army}"; showing general principles.`);
  }
  let themeId: string | null = null;
  if (a.theme) {
    const v = matchVocab(lib.themes, a.theme) ?? matchVocab(lib.subthemes, a.theme);
    themeId = v ? (lib.themes.some((t) => t.id === v.id) ? v.id : v.parent ?? null) : null;
    if (!themeId) notes.push(`Unknown theme "${a.theme}" (see list_tactics_index); not filtered on it.`);
  }
  const head = [`Tactics principles (${pr.list.length}${pr.updated ? `, updated ${pr.updated}` : ''}). ${PRINCIPLE_NOTE}`, ...notes, ''];
  const block = (list: Principle[], start = 1) => list.slice(0, limit).map((p, i) => principleBlock(lib, p, start + i, { maxIds: 15 }));
  const get = (ids: string[]) => ids.map((id) => pr.byId.get(id)).filter((p): p is Principle => !!p);

  if (!armySlug && !themeId) {
    const out = [...head, 'Essentials (the most widely backed general principles):', ...block(get(pr.top10))];
    const debated = get(pr.debat);
    if (debated.length) out.push('', 'Debated (players disagree; give both sides):', ...debated.map((p) => principleBlock(lib, p, null, { maxIds: 10 })));
    const themes = lib.themes.map((t) => `${t.id} (${pr.list.filter((p) => p.leger == null && p.thema === t.id).length})`).join(', ');
    const armies = Object.entries(pr.perLeger).map(([k, ids]) => `${k} (${ids.length})`).join(', ');
    out.push('', `By theme (list_principles theme=<id>): ${themes}`, `By army (list_principles army=<slug>): ${armies || 'none yet'}`);
    return out.join('\n');
  }
  const inTheme = (p: Principle) => !themeId || p.thema === themeId;
  const out = [...head];
  if (armySlug) {
    const own = pr.list.filter((p) => p.leger === armySlug && inTheme(p));
    out.push(own.length ? `${armyName(armySlug)} principles:` : `No ${armyName(armySlug)} principles${themeId ? ' in this theme' : ''} yet (too few players repeat the same advice); the general principles below still apply.`, ...block(own));
    out.push('');
  }
  const general = pr.list.filter((p) => p.leger == null && inTheme(p));
  out.push(`General principles${themeId ? ` in ${vocabName(lib.themes, themeId)}` : ''}:`, ...(general.length ? block(general) : ['(none)']));
  if (general.length > limit) out.push(`(${general.length - limit} more: raise limit)`);
  return out.join('\n').trimEnd();
}

/** One principle with the titles of its lessons (for the generic fetch). */
export async function principleText(id: string): Promise<{ title: string; text: string } | null> {
  const [lib, pr] = await Promise.all([library(), principles()]);
  const p = pr.byId.get(id);
  if (!p) return null;
  return { title: `Principle: ${p.titel}`, text: `${principleBlock(lib, p, null, { titles: true })}\n\n${PRINCIPLE_NOTE}` };
}

export async function searchTactics(a: SearchArgs): Promise<string> {
  const limit = Math.min(25, Math.max(1, Math.floor(a.limit ?? 8)));
  const offset = Math.max(0, Math.floor(a.offset ?? 0));
  const [{ lib, hits, notes, armySlug }, pr] = await Promise.all([rankLessons(a), principles()]);
  const page = hits.slice(offset, offset + limit);
  const head = [`Tactics library (${lib.lessons.length} lessons${lib.updated ? `, updated ${lib.updated}` : ''}).`,
    `Query: "${a.query ?? ''}"${armySlug ? ` · army: ${armyName(armySlug)}${a.only_army ? ' only' : ' + general lessons'}` : ''}${a.theme ? ` · theme: ${a.theme}` : ''}${a.tag ? ` · tag: ${a.tag}` : ''}${a.phase ? ` · phase: ${a.phase}` : ''}`,
    ...notes];
  // Matching principles first (first page only).
  if (offset === 0 && pr.list.length) {
    const tv = a.theme ? matchVocab(lib.themes, a.theme) ?? matchVocab(lib.subthemes, a.theme) : undefined;
    const themeId = tv ? (lib.themes.some((t) => t.id === tv.id) ? tv.id : tv.parent ?? null) : null;
    const ph = principleHits(pr, `${a.query ?? ''} ${a.tag ?? ''}`, hits, armySlug, themeId);
    if (ph.length) head.push('', 'Principles that match (start here; each summarises the lessons listed under it, cite those lessons):', ...ph.map((p, i) => principleBlock(lib, p, null, { maxIds: 12 }).replace(/^/, `P${i + 1}. `)), '', 'Lessons:');
  }
  if (!page.length) {
    return [...head, '',
      offset > 0 && hits.length ? `No more results (total ${hits.length}).` :
        'NO LESSONS FOUND. The tactics library has nothing on this. Tell the user so explicitly, and mark any advice you give as your own assessment (not from the library). Try broader words, another theme (list_tactics_index) or drop the army filter.'].join('\n');
  }
  // Blocks until the result would get too long for a chat context (~14k characters); the rest is paged.
  const blocks: string[] = [];
  let size = 0;
  for (const [i, { l }] of page.entries()) {
    const b: string[] = [`${offset + i + 1}. ${l.titel}  [id: ${l.id}]`, `   ${trunc(l.tekst, 260)}`];
    if (l.waarom) b.push(`   Why: ${trunc(l.waarom, 220)}`);
    if (l.wanneerNiet) b.push(`   Not when: ${trunc(l.wanneerNiet, 160)}`);
    b.push(`   ${lessonHeader(lib, l)}`);
    if (l.units.length) b.push(`   Units: ${l.units.join(', ')}`);
    const [first, ...rest] = l.bronnen;
    if (first) b.push(`   Source: ${sourceLine(lib, first, false).replace(/\n/g, '\n   ')}${rest.length ? `\n   (+${rest.length} more source${rest.length > 1 ? 's' : ''}: get_lesson)` : ''}`);
    for (const f of flagLines(l)) b.push(`   ${f}`);
    const text = `${b.join('\n')}\n`;
    if (blocks.length && size + text.length > 14000) break;
    blocks.push(text);
    size += text.length;
  }
  const shown = blocks.length;
  const out = [...head, `Showing ${offset + 1}–${offset + shown} of ${hits.length}. Cite the source (channel, video, timestamped link) for every piece of advice you take from these; use get_lesson for the full lesson.`, '', ...blocks];
  if (hits.length > offset + shown) out.push(`More: call again with offset ${offset + shown}.`);
  return out.join('\n').trimEnd();
}

export async function getLesson(a: { id?: string }): Promise<string> {
  const lib = await library();
  const id = String(a.id ?? '').trim();
  let l = lib.byId.get(id);
  if (!l) {
    const n = norm(id);
    l = lib.lessons.find((x) => norm(x.id) === n || norm(x.titel) === n);
  }
  if (!l) {
    const near = lib.lessons.filter((x) => norm(x.id).includes(norm(id)) || norm(x.titel).includes(norm(id))).slice(0, 5);
    return `No lesson with id "${id}".${near.length ? ` Did you mean: ${near.map((x) => x.id).join(', ')}?` : ' Use search_tactics to find lesson ids.'}`;
  }
  const out = [
    `${l.titel}  [id: ${l.id}]`,
    lessonHeader(lib, l),
    l.units.length ? `Units: ${l.units.join(', ')}` : null,
    '',
    `Lesson: ${l.tekst}`,
    l.waarom ? `Why (the speaker's reasoning): ${l.waarom}` : 'Why: the speaker gives no reasoning.',
    l.voorbeeld ? `Example: ${l.voorbeeld}` : null,
    l.wanneerNiet ? `Not when / caveats: ${l.wanneerNiet}` : null,
    ...flagLines(l),
    '',
    `Sources (${l.bronnen.length}):`,
    ...l.bronnen.map((b, i) => `${i + 1}. ${sourceLine(lib, b, true)}`),
  ].filter((x): x is string => x != null);
  return out.join('\n');
}

export async function listTacticsIndex(): Promise<string> {
  const lib = await library();
  const count = (pred: (l: Lesson) => boolean) => lib.lessons.filter(pred).length;
  const out = [`Tactics library: ${lib.lessons.length} lessons from ${new Set(lib.lessons.flatMap((l) => l.bronnen.map((b) => b.bronId))).size} videos${lib.updated ? `, updated ${lib.updated}` : ''}.`, '', 'Themes (filter with search_tactics theme=<id>):'];
  for (const t of lib.themes) {
    out.push(`- ${t.id}: ${t.naam} (${count((l) => l.themas.includes(t.id))})${t.omschrijving ? ` — ${t.omschrijving}` : ''}`);
    const subs = lib.subthemes.filter((s) => s.parent === t.id);
    for (const s of subs) out.push(`    · ${s.id}: ${s.naam} (${count((l) => lessonSubthemes(l).includes(s.id))})`);
  }
  const loose = lib.subthemes.filter((s) => !s.parent || !lib.themes.some((t) => t.id === s.parent));
  if (loose.length) out.push('', 'Sub-themes:', ...loose.map((s) => `- ${s.id}: ${s.naam} (${count((l) => lessonSubthemes(l).includes(s.id))})`));
  out.push('', 'Phases (phase=<id>):', ...lib.phases.map((p) => `- ${p.id}: ${p.naam} (${count((l) => l.fase === p.id)})`));
  const armies = new Map<string, number>();
  for (const l of lib.lessons) armies.set(l.leger ?? 'general', (armies.get(l.leger ?? 'general') ?? 0) + 1);
  out.push('', 'Armies (army=<slug>; general lessons are included unless only_army=true):',
    [...armies.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k === 'general' ? 'general' : `${k} (${armyName(k)})`}: ${n}`).join(' · '));
  if (lib.tags.length) {
    const used = lib.tags.map((t) => ({ t, n: count((l) => lessonTags(l).includes(t.id)) })).sort((a, b) => b.n - a.n);
    const shown = used.slice(0, 120);
    out.push('', `Tags (tag=<id>; ${used.length} total${used.length > shown.length ? `, top ${shown.length} shown` : ''}):`, shown.map(({ t, n }) => `${t.id} (${n})`).join(', '));
  } else out.push('', 'Tags: none yet (the library is being re-indexed; search by words instead).');
  const channels = [...lib.channels.values()].filter((k) => [...lib.sources.values()].some((b) => b.kanaalId === k.id && b.status === 'processed'));
  if (channels.length) out.push('', `Channels: ${channels.map((k) => `${k.naam}${k.waardering ? ` (${k.waardering})` : ''}`).join(', ')}`);
  return out.join('\n');
}
