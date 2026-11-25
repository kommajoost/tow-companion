// Rules tools: search_rules and get_rule. Text is verbatim from tow.whfb.app, via the compact index
// public/mcp/rules-compact.json that `npm run build:mcp` derives from public/rules.json (same slugs, names
// and plain-text `bodyIndex`; rich text is kept only for tables, which the calculator reads).

import type { RichNode, Rule } from '../src/types';
import { applyOverlayRules, type CompositionOverlay } from '../src/lib/overlays';
import { getRuleIndex, resolveRuleSlug } from '../src/lib/armyRules';
import { derived, need } from './data';
import { bag, norm, snippet, tokens, trunc } from './text';
import { armyCtx, resolveArmy } from './armies';

export interface CompactRule {
  slug: string;
  name: string;
  parentSlug: string | null;
  pageReference: number | null;
  ruleType?: string;
  association?: string[];
  bodyIndex: string;
  tables?: string[][][];
  childSlugs?: string[];
  url?: string | null;
}
interface Note { slug: string; name: string; bodyIndex: string; source?: string; refSlugs?: string[] }
export interface CompactFile {
  source: string;
  scrapedAt: string;
  rules: Record<string, CompactRule>;
  errata: Note[];
  faq: Note[];
  lores: Record<string, { slug: string; name: string; spells: { slug: string; name: string; signature?: boolean }[] }>;
}

export const RULES_FILE = 'mcp/rules-compact.json';
const SITE = 'https://tow.whfb.app';

const cell = (value: string, header: boolean): RichNode => ({ nodeType: header ? 'table-header-cell' : 'table-cell', content: [{ nodeType: 'paragraph', content: [{ nodeType: 'text', value }] }] } as RichNode);
/** Rebuild the minimal rich body the weapon-profile parser reads (src/lib/weaponStats.ts `tableRows`). */
function bodyFromTables(tables: string[][][] | undefined): RichNode | null {
  if (!tables?.length) return null;
  return {
    nodeType: 'document',
    content: tables.map((rows) => ({ nodeType: 'table', content: rows.map((r, i) => ({ nodeType: 'table-row', content: r.map((v) => cell(v, i === 0)) })) })),
  } as RichNode;
}

function toRule(c: CompactRule): Rule {
  return {
    slug: c.slug,
    name: c.name,
    order: null,
    pageReference: c.pageReference ?? null,
    ...(c.association ? { association: c.association } : {}),
    ...(c.ruleType ? { ruleType: c.ruleType } : {}),
    parentSlug: c.parentSlug ?? null,
    body: bodyFromTables(c.tables),
    bodyIndex: c.bodyIndex ?? '',
    childSlugs: c.childSlugs ?? [],
    prevSlug: null,
    nextSlug: null,
    crossRefSlugs: [],
    refSlugs: [],
  } as Rule;
}

const rulesCache = new WeakMap<CompactFile, Record<string, Rule>>();
export async function rulesFile(): Promise<CompactFile> {
  return need<CompactFile>(RULES_FILE);
}
export async function baseRules(): Promise<Record<string, Rule>> {
  const f = await rulesFile();
  return derived(rulesCache, f, (x) => Object.fromEntries(Object.entries(x.rules).map(([k, v]) => [k, toRule(v)])));
}

/** The rules with one or more Renegade overlays folded in (same as the app's data context). */
const overlaid = new Map<string, Record<string, Rule>>();
export async function rulesWith(overlays: (CompositionOverlay | null | undefined)[]): Promise<Record<string, Rule>> {
  const base = await baseRules();
  const list = overlays.filter((o): o is CompositionOverlay => !!o);
  if (!list.length) return base;
  const key = list.map((o) => o.id).join('+');
  const hit = overlaid.get(key);
  if (hit) return hit;
  const r = list.reduce((acc, o) => applyOverlayRules(acc, o), base);
  overlaid.set(key, r);
  return r;
}

/** Tables of a rich-text body as rows of cell texts. */
function richTables(body: RichNode | null | undefined): string[][][] {
  const out: string[][][] = [];
  const text = (n: RichNode | undefined): string => (!n ? '' : n.nodeType === 'text' ? n.value ?? '' : (n.content ?? []).map(text).join(''));
  const walk = (n: RichNode | undefined) => {
    if (!n) return;
    if (n.nodeType === 'table') {
      out.push((n.content ?? []).filter((r) => r.nodeType === 'table-row').map((r) => (r.content ?? []).map((c) => text(c).trim())));
      return;
    }
    (n.content ?? []).forEach(walk);
  };
  walk(body ?? undefined);
  return out;
}

const tableText = (t: string[][]): string => t.map((r) => `| ${r.join(' | ')} |`).join('\n');

// ── search ────────────────────────────────────────────────────────────────────────────────────────

interface RDoc { kind: 'rule' | 'faq' | 'errata'; slug: string; name: string; nameKey: string; nb: Map<string, number>; tb: Map<string, number>; text: string; parent?: string }
const idxCache = new WeakMap<object, { docs: RDoc[]; df: Map<string, number> }>();
const nameKey = (s: string) => norm(s.replace(/\(.*?\)/g, ' '));

function index(rules: Record<string, Rule>, file: CompactFile) {
  return derived(idxCache, rules, () => {
    const docs: RDoc[] = [];
    for (const r of Object.values(rules)) docs.push({ kind: 'rule', slug: r.slug, name: r.name, nameKey: nameKey(r.name), nb: bag(r.name), tb: bag(r.bodyIndex), text: r.bodyIndex, parent: r.parentSlug ?? undefined });
    for (const [kind, list] of [['faq', file.faq], ['errata', file.errata]] as const) {
      for (const n of list ?? []) docs.push({ kind, slug: n.slug, name: n.name, nameKey: nameKey(n.name), nb: bag(n.name), tb: bag(n.bodyIndex), text: n.bodyIndex });
    }
    const df = new Map<string, number>();
    for (const d of docs) for (const t of new Set([...d.nb.keys(), ...d.tb.keys()])) df.set(t, (df.get(t) ?? 0) + 1);
    return { docs, df };
  });
}

function rank(rules: Record<string, Rule>, file: CompactFile, query: string, includeFaq: boolean): { d: RDoc; score: number }[] {
  const { docs, df } = index(rules, file);
  const terms = [...new Set(tokens(query, true))];
  if (!terms.length) return [];
  const N = docs.length;
  const qKey = nameKey(query);
  const hits: { d: RDoc; score: number }[] = [];
  for (const d of docs) {
    if (!includeFaq && d.kind !== 'rule') continue;
    let score = 0;
    let matched = 0;
    for (const t of terms) {
      const idf = Math.log(1 + N / (1 + (df.get(t) ?? 0)));
      const s = (d.nb.has(t) ? 4 : 0) + (d.tb.has(t) ? 1 + Math.log(d.tb.get(t)!) * 0.5 : 0);
      if (s) { matched++; score += s * idf; }
    }
    if (!score) continue;
    score *= 0.3 + 0.7 * (matched / terms.length);
    if (d.nameKey === qKey) score *= 4;
    else if (d.nameKey.startsWith(qKey) || qKey.startsWith(d.nameKey) && d.nameKey.length > 3) score *= 1.8;
    if (d.kind !== 'rule') score *= 0.75;
    if (/-profile$/.test(d.slug) && !/profile/.test(norm(query))) score *= 0.6;
    hits.push({ d, score });
  }
  return hits.sort((a, b) => b.score - a.score);
}

export function ruleUrl(file: CompactFile, r: Rule): string | null {
  const c = file.rules[r.slug];
  if (c?.url) return `${SITE}/${c.url}`;
  return null;
}

async function overlaysFor(army?: string, composition?: string): Promise<{ overlay: CompositionOverlay | null; label?: string; faction?: string; note?: string }> {
  if (!army) return { overlay: null };
  const slug = await resolveArmy(army);
  if (!slug) return { overlay: null, note: `Unknown army "${army}"; showing the rulebook wording.` };
  const ctx = await armyCtx(slug, composition);
  if ('error' in ctx) return { overlay: null, note: ctx.error };
  return { overlay: ctx.overlay, label: `${ctx.name}, ${ctx.compLabel}`, faction: ctx.name };
}

export async function searchRules(a: { query?: string; army?: string; composition?: string; include_faq?: boolean; limit?: number; offset?: number }): Promise<string> {
  const q = String(a.query ?? '').trim();
  if (!q) return 'Give a query (a rule name or words from its text).';
  const limit = Math.min(20, Math.max(1, Math.floor(a.limit ?? 8)));
  const offset = Math.max(0, Math.floor(a.offset ?? 0));
  const file = await rulesFile();
  const ov = await overlaysFor(a.army, a.composition);
  const rules = await rulesWith([ov.overlay]);
  const hits = rank(rules, file, q, a.include_faq !== false);
  const terms = tokens(q, true).map((t) => t.slice(0, Math.max(3, t.length - 1)));
  const out = [`Rules search "${q}" — verbatim rules from tow.whfb.app${ov.label ? `, with the ${ov.label} wording where the pack replaces a rule` : ''}.`];
  if (ov.note) out.push(ov.note);
  if (!hits.length) return [...out, 'No rule matches. Try the rule\'s exact name or other words. Do not state the rule from memory.'].join('\n');
  out.push(`Showing ${offset + 1}–${Math.min(hits.length, offset + limit)} of ${hits.length}. Use get_rule with the slug for the full text.`, '');
  for (const { d } of hits.slice(offset, offset + limit)) {
    if (d.kind === 'rule') {
      const r = rules[d.slug];
      const parent = r.parentSlug ? rules[r.parentSlug]?.name ?? r.parentSlug : null;
      const url = ruleUrl(file, r) ?? (/-renegade-v2$/.test(r.slug) || ov.overlay?.rules && Object.values(ov.overlay.rules).some((x) => x.overrides === r.slug) ? ov.overlay?.source.url ?? null : null);
      out.push(`- ${r.name} [slug: ${r.slug}]${parent ? ` · ${parent}` : ''}${url ? ` · ${url}` : ''}`);
      out.push(`  ${snippet(r.bodyIndex || '(table only; see get_rule)', terms, 200)}`);
    } else {
      out.push(`- ${d.kind === 'faq' ? 'FAQ' : 'Errata'}: ${trunc(d.name, 140)} [slug: ${d.slug}]`);
      out.push(`  ${snippet(d.text, terms, 200)}`);
    }
  }
  if (hits.length > offset + limit) out.push('', `More: offset ${offset + limit}.`);
  return out.join('\n');
}

export async function getRule(a: { slug?: string; name?: string; army?: string; composition?: string }): Promise<string> {
  const key = String(a.slug ?? a.name ?? '').trim();
  if (!key) return 'Give a rule slug or name.';
  const file = await rulesFile();
  const base = await baseRules();
  const ov = await overlaysFor(a.army, a.composition);
  const rules = await rulesWith([ov.overlay]);
  const notes: string[] = ov.note ? [ov.note] : [];

  // Lores: list their spells (each spell is its own rule).
  const loreHit = Object.values(file.lores ?? {}).find((l) => l.slug === key || norm(l.name) === norm(key));
  let slug: string | null = rules[key] ? key : null;
  if (!slug) slug = Object.keys(rules).find((k) => norm(k) === norm(key)) ?? null;
  if (!slug) slug = resolveRuleSlug(key, getRuleIndex(rules), ov.faction);
  if (!slug) slug = Object.values(rules).find((r) => nameKey(r.name) === nameKey(key))?.slug ?? null;
  let fuzzy = false;
  if (!slug && !loreHit) {
    const hits = rank(rules, file, key, false);
    if (!hits.length) return `No rule found for "${key}". Use search_rules. Do not state the rule from memory.`;
    slug = hits[0].d.slug;
    fuzzy = true;
    notes.push(`No exact match for "${key}"; closest: ${hits.slice(0, 4).map((h) => `${h.d.name} [${h.d.slug}]`).join(', ')}. Showing the first.`);
  }
  if (!slug && loreHit) {
    return [`${loreHit.name} [lore: ${loreHit.slug}] — ${SITE}/the-lores-of-magic/${loreHit.slug}`,
      'Spells (get_rule with the spell slug for its text):',
      ...loreHit.spells.map((s) => `- ${s.name} [${s.slug}]${s.signature ? ' (signature)' : ''}`)].join('\n');
  }
  const r = rules[slug!];
  const packed = Object.entries(ov.overlay?.rules ?? {}).find(([k, x]) => (x.overrides ?? `${k}-renegade-v2`) === r.slug)?.[1];
  const isPack = !!packed;
  const parent = r.parentSlug ? rules[r.parentSlug]?.name ?? r.parentSlug : null;
  const c = file.rules[r.slug];
  const url = isPack ? ov.overlay!.source.url : ruleUrl(file, r);
  const out: string[] = [];
  out.push(`${r.name} [slug: ${r.slug}]${parent ? ` — section: ${parent}` : ''}${c?.association?.length ? ` · ${c.association.join(', ')}` : ''}${r.pageReference ? ` · p. ${r.pageReference}` : ''}`);
  out.push(isPack
    ? `Source: ${ov.overlay!.label}, ${ov.overlay!.source.name} (${ov.overlay!.source.author}) — ${url}. Community rebalance, not Games Workshop. ${packed!.overrides ? 'Replaces the rulebook wording for this army composition.' : 'New rule in the pack.'}`
    : `Source: ${url ?? `${SITE}/ (page path not recorded; search the site for "${r.name}")`} — verbatim from tow.whfb.app (scraped ${file.scrapedAt?.slice(0, 10) ?? '?'}).`);
  out.push(...notes, '');
  const text = r.bodyIndex || '';
  out.push(text.length > 9000 ? `${text.slice(0, 9000)}… [truncated; open the source link for the rest]` : text || '(no prose; see table)');
  const tables = richTables(r.body);
  if (tables.length) out.push('', ...tables.map(tableText));
  // A weapon's page shows its profile, which the scrape keeps as separate "<weapon>-profile" rules.
  if (!/-profile$/.test(r.slug)) {
    const stemSlug = r.slug.replace(/s$/, '');
    const profiles = Object.keys(rules).filter((k) => /-profile$/.test(k) && (k.startsWith(`${r.slug}-`) || k.startsWith(`${stemSlug}-`))
      && /^(ranged-|combat-)?profile$|^[a-z-]*profile$/.test(k.slice(stemSlug.length + 1))).slice(0, 6);
    for (const k of profiles) {
      const t = richTables(rules[k].body);
      if (t.length) out.push('', `${rules[k].name}:`, ...t.map(tableText));
    }
  }
  if (r.childSlugs?.length) {
    out.push('', `Sub-rules (${r.childSlugs.length}): ${r.childSlugs.slice(0, 60).map((s) => `${rules[s]?.name ?? s} [${s}]`).join(', ')}${r.childSlugs.length > 60 ? ', …' : ''}`);
  }
  if (isPack && packed!.overrides && base[packed!.overrides]) {
    const o = base[packed!.overrides];
    out.push('', `Official rulebook wording (for comparison, ${ruleUrl(file, o) ?? SITE}):`, trunc(o.bodyIndex, 3000));
  }
  const refs = [...(file.errata ?? []).map((n) => ({ ...n, kind: 'Errata' })), ...(file.faq ?? []).map((n) => ({ ...n, kind: 'FAQ' }))]
    .filter((n) => n.refSlugs?.includes(r.slug));
  if (refs.length) {
    out.push('', `Errata / FAQ that reference this rule (${refs.length}):`);
    for (const n of refs.slice(0, 6)) out.push(`- ${n.kind}: ${trunc(n.name, 160)} — ${trunc(n.bodyIndex, 420)}${n.source ? ` (${trunc(n.source, 80)})` : ''}`);
  }
  if (fuzzy) out.push('', 'Check that this is the rule the user meant.');
  out.push('', 'Quote this text; do not paraphrase it as the rule. Your own reading of it is your interpretation and must be labelled as such.');
  return out.join('\n');
}

/** Lightweight lookups for the generic search/fetch tools. */
export async function ruleHits(query: string, n: number): Promise<{ slug: string; name: string; url: string | null; kind: string }[]> {
  const file = await rulesFile();
  const rules = await baseRules();
  return rank(rules, file, query, true).slice(0, n).map(({ d }) => ({ slug: d.slug, name: d.name, kind: d.kind, url: d.kind === 'rule' ? ruleUrl(file, rules[d.slug]) : null }));
}

export async function getNote(slug: string): Promise<string | null> {
  const file = await rulesFile();
  const n = [...(file.faq ?? []).map((x) => ({ ...x, kind: 'FAQ' })), ...(file.errata ?? []).map((x) => ({ ...x, kind: 'Errata' }))].find((x) => x.slug === slug);
  return n ? `${n.kind}: ${n.name}\n${n.bodyIndex}${n.source ? `\nSource: ${n.source}` : ''}` : null;
}
