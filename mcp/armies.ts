// Armies, compositions and units, exactly as the Companion's list builder knows them.
//
// Recipe = src/lib/lijstNaarLeger.ts (catalogue + optional Renegade V2 overlay → catalogueFor; statlines via
// overlayStatsFor; troop types via makeTroopTypeLookup over applyOverlayStatIndex; mount text merged with
// mount-details and the overlay; builderListToArmy for a game unit). That module itself cannot be imported
// here (it pulls in React and import.meta.env), so the ~15 lines of recipe are repeated with the same lib
// calls. Nothing about a unit is computed here that the app does not compute the same way.

import type { ArmyUnit } from '../src/types';
import {
  applyOverlayMountText, applyOverlayStatIndex, catalogueFor, isOverlay, mergeMountDetails, overlayCompsFor,
  overlayStatsFor, OVERLAY_BASE_ARMY, OVERLAY_FILES, unitPointsProvenance, type CompositionOverlay, type MountDetailsFile,
} from '../src/lib/overlays';
import {
  CATEGORIES, isRadioGroup, toggleOption, unitAllowedIn, unitCategoryFor, unitNote, type Category, type OwbArmy,
  type OwbOption, type OwbUnit,
} from '../src/lib/owbBuilder';
import { builderListToArmy, type MountText, type StatRow } from '../src/lib/builderToArmy';
import { makeTroopTypeLookup } from '../src/lib/troopTypes';
import { compName } from '../src/lib/armies';
import { statSleutels } from '../src/lib/statSleutel';
import { equipmentVoor, type EquipmentLine, type UnitDetailsFile } from '../src/lib/unitDetails';
import { loadJson, need } from './data';
import { norm, splitTopLevel, stripTags, tokens } from './text';

/** The armies (slug → display name), as public/owb/index.json lists them. Used synchronously for labels;
 *  index.json is still read at runtime for the authoritative list. */
const ARMY_NAMES: Record<string, string> = {
  'beastmen-brayherds': 'Beastmen Brayherds', 'chaos-dwarfs': 'Chaos Dwarfs', 'daemons-of-chaos': 'Daemons of Chaos',
  'dark-elves': 'Dark Elves', 'dwarfen-mountain-holds': 'Dwarfen Mountain Holds', 'empire-of-man': 'Empire of Man',
  'grand-cathay': 'Grand Cathay', 'high-elf-realms': 'High Elf Realms', 'kingdom-of-bretonnia': 'Kingdom of Bretonnia',
  lizardmen: 'Lizardmen', 'ogre-kingdoms': 'Ogre Kingdoms', 'orc-and-goblin-tribes': 'Orc and Goblin Tribes',
  'renegade-crowns': 'Renegade Crowns', skaven: 'Skaven', 'tomb-kings-of-khemri': 'Tomb Kings of Khemri',
  'vampire-counts': 'Vampire Counts', 'warriors-of-chaos': 'Warriors of Chaos', 'wood-elf-realms': 'Wood Elf Realms',
};

/** Common short names. Matched as whole words after `norm`. */
const ALIASES: Record<string, string[]> = {
  'beastmen-brayherds': ['beastmen', 'brayherds', 'brayherd', 'bm'],
  'chaos-dwarfs': ['chaos dwarfs', 'chaos dwarves', 'chaos dwarf', 'cd', 'dawi zharr'],
  'daemons-of-chaos': ['daemons', 'demons', 'daemons of chaos', 'doc'],
  'dark-elves': ['dark elves', 'dark elf', 'druchii', 'de', 'donkere elfen'],
  'dwarfen-mountain-holds': ['dwarfs', 'dwarves', 'dwarf', 'dmh', 'dwarfen mountain holds', 'dwergen'],
  'empire-of-man': ['empire', 'empire of man', 'eom', 'keizerrijk'],
  'grand-cathay': ['cathay', 'grand cathay'],
  'high-elf-realms': ['high elves', 'high elf', 'he', 'asur', 'hoge elfen'],
  'kingdom-of-bretonnia': ['bretonnia', 'bretonnians', 'brets', 'kob'],
  lizardmen: ['lizardmen', 'lizards', 'lm', 'saurus'],
  'ogre-kingdoms': ['ogres', 'ogre kingdoms', 'ogre', 'ok'],
  'orc-and-goblin-tribes': ['orcs', 'goblins', 'orcs and goblins', 'orc and goblin', 'o g', 'og', 'greenskins', 'oandg'],
  'renegade-crowns': ['renegade crowns'],
  skaven: ['skaven', 'sk', 'ratmen'],
  'tomb-kings-of-khemri': ['tomb kings', 'tk', 'tomb kings of khemri', 'khemri'],
  'vampire-counts': ['vampire counts', 'vampires', 'vc'],
  'warriors-of-chaos': ['warriors of chaos', 'woc', 'chaos warriors'],
  'wood-elf-realms': ['wood elves', 'wood elf', 'we', 'asrai', 'bos elfen', 'boself'],
};

/** Legacy armies that have a Renegade V2 overlay in the Companion. */
export const RENEGADE_ARMIES = new Set(Object.values(OVERLAY_BASE_ARMY));
export const RENEGADE_OF: Record<string, string> = Object.fromEntries(Object.entries(OVERLAY_BASE_ARMY).map(([id, army]) => [army, id]));

export const armyName = (slug: string): string => ARMY_NAMES[slug] ?? slug;

/** Army slug from a name, slug or alias. `inText` = look for an army mentioned anywhere in a sentence. */
export async function resolveArmy(input: string, inText = false): Promise<string | null> {
  const n = norm(input);
  if (!n) return null;
  const idx = await loadJson<{ armies?: { slug: string; name: string }[] }>('owb/index.json');
  const names: Record<string, string> = { ...ARMY_NAMES };
  for (const a of idx?.armies ?? []) names[a.slug] = a.name;
  const cands: [string, string][] = [];
  for (const [slug, name] of Object.entries(names)) {
    cands.push([slug, norm(slug)], [slug, norm(name)]);
    for (const al of ALIASES[slug] ?? []) cands.push([slug, norm(al)]);
  }
  if (!inText) {
    const exact = cands.find(([, c]) => c === n);
    if (exact) return exact[0];
    const sing = cands.find(([, c]) => tokens(c).join(' ') === tokens(n).join(' '));
    if (sing) return sing[0];
    const part = cands.filter(([, c]) => c.length > 3 && (c.includes(n) || n.includes(c))).sort((a, b) => b[1].length - a[1].length)[0];
    return part ? part[0] : null;
  }
  // In a sentence: longest alias that occurs as whole words; two-letter codes only in upper case.
  const padded = ` ${n} `;
  const raw = ` ${String(input)} `;
  let best: [string, string] | null = null;
  for (const c of cands) {
    if (c[1].length < 2 || !padded.includes(` ${c[1]} `)) continue;
    if (c[1].length <= 3 && !new RegExp(`[^A-Za-z]${c[1].toUpperCase()}[^A-Za-z]`).test(raw)) continue;
    if (!best || c[1].length > best[1].length) best = c;
  }
  return best ? best[0] : null;
}

// ── data per army + composition ───────────────────────────────────────────────────────────────────

interface OwbMeta { armies: { id: string; group?: string; items?: string[]; armyComposition?: string[] }[] }
type StatIndex = Record<string, { stats?: StatRow[]; troopType?: string; url?: string; page?: string }>;

export interface ArmyCtx {
  slug: string;
  name: string;
  comp: string;
  compLabel: string;
  compNote: string;
  overlay: CompositionOverlay | null;
  raw: OwbArmy;
  cat: OwbArmy;
  statIdx: StatIndex;
  statsFor: (name: string) => StatRow[];
  troopTypeFor: (name: string) => string | undefined;
  mountText: MountText;
  comps: string[];
  group: string | undefined;
  itemLists: string[];
  allNames: string[];
}

export async function compositionsFor(slug: string): Promise<{ comps: string[]; group?: string; items: string[] }> {
  const meta = await need<OwbMeta>('owb/the-old-world.json');
  const a = meta.armies.find((x) => x.id === slug);
  const base = Array.isArray(a?.armyComposition) ? a!.armyComposition : [slug];
  return { comps: [...base, ...overlayCompsFor(slug).filter((id) => !base.includes(id))], group: a?.group, items: Array.isArray(a?.items) ? a!.items : [] };
}

export function compLabel(comp: string, slug: string): string {
  if (comp.endsWith('-renegade-v2')) return 'Renegade V2 (Renegade Legacy Pack, community rebalance)';
  if (comp === slug) return 'Grand Army (official)';
  return compName(comp, slug);
}

/** Composition id from user input: undefined → default (Renegade V2 for a Legacy army that has it). */
export function pickComposition(slug: string, comps: string[], input?: string): { comp: string; note: string } | { error: string } {
  const renegade = RENEGADE_OF[slug];
  if (!input || !String(input).trim()) {
    return renegade
      ? { comp: renegade, note: `Renegade V2 is the default for this Legacy army (it takes precedence where it exists). Pass composition "official" for the Grand Army list.` }
      : { comp: slug, note: '' };
  }
  const n = norm(input);
  if (/^(renegade|renegade v2|rv2|renegade legacy|renegade legacy pack|legacy pack)$/.test(n)) {
    return renegade ? { comp: renegade, note: '' } : { error: `${armyName(slug)} has no Renegade V2 list in the Companion. Compositions: ${comps.join(', ')}.` };
  }
  if (/^(official|grand army|standard|default official|gw|base)$/.test(n)) return { comp: slug, note: '' };
  const hit = comps.find((c) => norm(c) === n) ?? comps.find((c) => norm(compName(c, slug)) === n) ?? comps.find((c) => norm(c).includes(n) || norm(compName(c, slug)).includes(n));
  return hit ? { comp: hit, note: '' } : { error: `Unknown composition "${input}" for ${armyName(slug)}. Compositions: ${comps.map((c) => `${c} (${compName(c, slug)})`).join(', ')}.` };
}

const ctxCache = new Map<string, Promise<ArmyCtx>>();

export async function armyCtx(slug: string, compositionInput?: string): Promise<ArmyCtx | { error: string }> {
  const { comps, group, items } = await compositionsFor(slug);
  const picked = pickComposition(slug, comps, compositionInput);
  if ('error' in picked) return picked;
  const key = `${slug}|${picked.comp}`;
  let p = ctxCache.get(key);
  if (!p) {
    p = buildCtx(slug, picked.comp, comps, group, items, picked.note);
    ctxCache.set(key, p);
    p.catch(() => ctxCache.delete(key));
  }
  const ctx = await p;
  return { ...ctx, compNote: picked.note };
}

async function buildCtx(slug: string, comp: string, comps: string[], group: string | undefined, itemLists: string[], compNote: string): Promise<ArmyCtx> {
  const overlayFile = OVERLAY_FILES[comp];
  const [raw, statIdx, mount, mountDetails, overlayRaw, idx] = await Promise.all([
    need<OwbArmy>(`owb/${slug}.json`),
    need<StatIndex>('owb/rules-index.json'),
    loadJson<MountText>('owb/mount-text.json'),
    loadJson<MountDetailsFile>('mount-details.json'),
    overlayFile ? loadJson<unknown>(`renegade/${overlayFile}`) : Promise.resolve(null),
    loadJson<{ armies?: { slug: string; name: string }[] }>('owb/index.json'),
  ]);
  if (overlayFile && !isOverlay(overlayRaw)) throw new Error(`Could not load the ${compLabel(comp, slug)} overlay.`);
  const overlay = overlayFile ? (overlayRaw as CompositionOverlay) : null;
  const name = idx?.armies?.find((a) => a.slug === slug)?.name ?? armyName(slug);
  const resolvedIndex = overlay ? applyOverlayStatIndex(statIdx, overlay) : statIdx;
  return {
    slug,
    name,
    comp,
    compLabel: compLabel(comp, slug),
    compNote,
    overlay,
    raw,
    cat: catalogueFor(raw, comp, overlay),
    statIdx,
    statsFor: (n: string) => overlayStatsFor(statIdx, n, overlay) as StatRow[],
    troopTypeFor: makeTroopTypeLookup(resolvedIndex),
    mountText: applyOverlayMountText(mergeMountDetails(mount ?? {}, mountDetails), overlay),
    comps,
    group,
    itemLists,
    allNames: (idx?.armies ?? []).map((a) => a.name),
  };
}

// ── unit lookup ───────────────────────────────────────────────────────────────────────────────────

export interface Found { unit: OwbUnit; baseCat: Category; score: number }

function nameScore(query: string, unitName: string): number {
  const q = norm(query);
  const u = norm(stripTags(unitName));
  if (!q || !u) return 0;
  if (q === u) return 100;
  const qt = tokens(q);
  const ut = tokens(u);
  if (qt.join(' ') === ut.join(' ')) return 95;
  if (qt.every((t) => ut.includes(t))) return 80 - (ut.length - qt.length) * 3;
  if (ut.every((t) => qt.includes(t))) return 65 - (qt.length - ut.length) * 3;
  const common = qt.filter((t) => ut.includes(t)).length;
  return common ? (45 * common) / Math.max(qt.length, ut.length) : 0;
}

export function findUnits(cat: OwbArmy, comp: string, query: string): Found[] {
  const out: Found[] = [];
  for (const c of CATEGORIES) {
    for (const u of cat[c] ?? []) {
      if (!u || !unitAllowedIn(u, comp)) continue;
      const s = Math.max(nameScore(query, u.name_en), u.bronNaam ? nameScore(query, u.bronNaam) - 2 : 0, norm(u.id) === norm(query) ? 100 : 0);
      if (s >= 30) out.push({ unit: u, baseCat: c, score: s });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Find a unit, in one army or in all of them. */
export async function locateUnit(name: string, army?: string, composition?: string): Promise<
  { ctx: ArmyCtx; found: Found; others: string[] } | { error: string }> {
  if (army) {
    const slug = await resolveArmy(army);
    if (!slug) return { error: `Unknown army "${army}". Use list_armies.` };
    const ctx = await armyCtx(slug, composition);
    if ('error' in ctx) return ctx;
    const hits = findUnits(ctx.cat, ctx.comp, name);
    if (!hits.length) {
      const elsewhere = ctx.comps.filter((c) => c !== ctx.comp);
      return { error: `No unit "${name}" in ${ctx.name} (${ctx.compLabel}).${elsewhere.length ? ` Other compositions: ${elsewhere.join(', ')}.` : ''} Use get_army to list its units.` };
    }
    return { ctx, found: hits[0], others: hits.slice(1, 6).filter((h) => h.score >= 60).map((h) => h.unit.name_en) };
  }
  const idx = await loadJson<{ armies?: { slug: string }[] }>('owb/index.json');
  const slugs = (idx?.armies ?? []).map((a) => a.slug);
  const all: { ctx: ArmyCtx; found: Found }[] = [];
  for (const s of (slugs.length ? slugs : Object.keys(ARMY_NAMES))) {
    const ctx = await armyCtx(s, composition && RENEGADE_ARMIES.has(s) ? composition : undefined);
    if ('error' in ctx) continue;
    const h = findUnits(ctx.cat, ctx.comp, name)[0];
    if (h) all.push({ ctx, found: h });
  }
  if (!all.length) return { error: `No unit "${name}" found in any army. Check the spelling or use get_army.` };
  all.sort((a, b) => b.found.score - a.found.score);
  const top = all[0];
  return { ctx: top.ctx, found: top.found, others: all.slice(1).filter((x) => x.found.score >= Math.min(90, top.found.score)).map((x) => `${x.found.unit.name_en} (${x.ctx.name})`) };
}

// ── formatting ────────────────────────────────────────────────────────────────────────────────────

const STAT_COLS = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld'] as const;
export const statLine = (r: StatRow): string => `${r.Name}: ${STAT_COLS.map((k) => `${k}${r[k] ?? '-'}`).join(' ')}`;

const isMulti = (u: OwbUnit) => (u.maximum ?? 1) !== 1 || (u.minimum ?? 1) > 1;
export function pointsLabel(u: OwbUnit): string {
  if (typeof u.points !== 'number') return 'points not listed';
  if (!isMulti(u)) return `${u.points} pts`;
  const size = u.minimum ? `, min ${u.minimum}${u.maximum ? `, max ${u.maximum}` : ''}` : '';
  return `${u.points} pts per model${size}`;
}

function optLabel(o: OwbOption, multi = true): string {
  const pts = typeof o.points === 'number' && o.points !== 0 ? ` +${o.points}${o.perModel && multi ? '/model' : ''}` : '';
  const flags = [o.alwaysActive ? 'always' : o.active || o.equippedDefault ? 'default' : null, o.stackable ? 'per model, any number' : null].filter(Boolean);
  const kids = (o.options ?? []).filter((k) => k && !k.hidden).map((k) => optLabel(k, multi));
  return `${stripTags(o.name_en)}${pts}${flags.length ? ` (${flags.join(', ')})` : ''}${kids.length ? ` [${kids.join('; ')}]` : ''}`;
}

const GROUPS: { key: 'command' | 'equipment' | 'armor' | 'options' | 'mounts'; label: string }[] = [
  { key: 'command', label: 'Command' }, { key: 'equipment', label: 'Equipment' }, { key: 'armor', label: 'Armour' },
  { key: 'options', label: 'Options' }, { key: 'mounts', label: 'Mounts' },
];

const CAT_LABEL: Record<string, string> = { characters: 'Characters', core: 'Core', special: 'Special', rare: 'Rare', mercenaries: 'Mercenaries', allies: 'Allies' };

/** The tow.whfb.app datasheet link for a unit, from rules-index.json. */
export function datasheet(ctx: ArmyCtx, u: OwbUnit): { url?: string; page?: string } {
  const key = statSleutels(u.bronNaam ?? u.name_en, ctx.statIdx, ctx.name).find((k) => ctx.statIdx[k]);
  const e = key ? ctx.statIdx[key] : undefined;
  return { url: e?.url ? `https://tow.whfb.app/${e.url.replace(/^\/+/, '')}` : undefined, page: e?.page };
}

export async function getUnit(a: { name?: string; army?: string; composition?: string }): Promise<string> {
  if (!a.name) return 'Give a unit name.';
  const r = await locateUnit(a.name, a.army, a.composition);
  if ('error' in r) return r.error;
  const { ctx, found, others } = r;
  const u = found.unit;
  const cat = unitCategoryFor(u, ctx.comp, found.baseCat);
  const out: string[] = [];
  out.push(`${u.name_en} — ${ctx.name} · composition: ${ctx.compLabel} [${ctx.comp}]`);
  if (ctx.compNote) out.push(ctx.compNote);
  if (found.score < 90) out.push(`(Closest match for "${a.name}".)`);
  if (others.length) out.push(`Also matching: ${others.join('; ')}.`);
  out.push(`Category: ${CAT_LABEL[cat] ?? cat} · Points: ${pointsLabel(u)}`);
  const note = unitNote(u, ctx.comp);
  if (note) out.push(`Restriction: ${note}`);
  const tt = ctx.troopTypeFor(u.bronNaam ?? u.name_en);
  if (tt) out.push(`Troop type: ${tt}`);

  // Renegade provenance and the official numbers, so a lesson about the official list can be compared.
  if (ctx.overlay) {
    const patch = ctx.overlay.units[u.id];
    const prov = unitPointsProvenance(ctx.overlay, u.id);
    const added = Object.values(ctx.overlay.addedUnits ?? {}).some((list) => (list ?? []).some((x) => x.id === u.id));
    const official = CATEGORIES.flatMap((c) => ctx.raw[c] ?? []).find((x) => x.id === u.id);
    const changes: string[] = [];
    if (added) changes.push('unit added by the Renegade pack (not in the official list)');
    if (prov) changes.push(`points ${prov.was} → ${prov.now}`);
    if (patch?._changed?.length) changes.push(`changed: ${patch._changed.join(', ')}`);
    if (!added && official && typeof official.points === 'number' && official.points !== u.points && !prov) changes.push(`official points ${official.points}`);
    out.push(`Renegade V2 vs official: ${changes.length ? changes.join('; ') : 'no unit-level change recorded (options, items or rules may still differ)'}.`);
    if (official && !added && patch?.specialRules && official.specialRules?.name_en !== patch.specialRules) out.push(`Official special rules: ${official.specialRules?.name_en ?? '-'}`);
  }

  const rows = ctx.statsFor(u.bronNaam ?? u.name_en);
  out.push('', 'Profile:');
  out.push(...(rows.length ? rows.map((r) => `  ${statLine(r)}`) : ['  (no statline in the Companion data)']));
  const prof = ctx.overlay?.profiles?.[norm(u.name_en)];
  if (prof?.notes?.length) out.push(`Profile notes (Renegade): ${prof.notes.join(' ')}`);
  if (prof?.armourValue) out.push(`Armour value (Renegade): ${prof.armourValue}`);
  if (prof?.baseSize) out.push(`Base size (Renegade): ${prof.baseSize}`);

  const details = await loadJson<UnitDetailsFile>('unit-details.json');
  const eq: EquipmentLine[] | null = details ? equipmentVoor({ name: u.name_en, datasheet: u.name_en, statNaam: u.bronNaam ?? u.name_en }, details.units, ctx.name) : null;
  if (eq?.length) out.push('', `Equipment per model (official datasheet, tow.whfb.app${ctx.overlay ? '; the Renegade options below win where they differ' : ''}):`, ...eq.map((e) => `  ${e.model ? `${e.model}: ` : ''}${e.line}`));

  out.push('', 'Options (Companion list builder):');
  for (const g of GROUPS) {
    const list = (Array.isArray(u[g.key]) ? (u[g.key] as OwbOption[]) : []).filter((o) => o && o.name_en && !o.hidden);
    if (!list.length) continue;
    const radio = isRadioGroup(u, g.key);
    out.push(`  ${g.label}${radio ? ' (choose one)' : ''}: ${list.map((o) => optLabel(o, isMulti(u))).join('; ')}`);
  }
  const sections = (u.items ?? []).filter((s) => s && !s.hidden);
  if (sections.length) out.push(`  Magic items: ${sections.map((s) => `${s.name_en}${s.maxPoints ? ` up to ${s.maxPoints} pts` : ''} (${(s.types ?? []).join('/')})`).join('; ')}`);
  if (u.lores?.length) out.push(`  Lores: ${u.lores.join(', ')}`);

  const mounts = (u.mounts ?? []).filter((m) => m && !m.hidden && m.name_en && !/^on foot$/i.test(m.name_en));
  const mountLines: string[] = [];
  for (const m of mounts.slice(0, 10)) {
    const mr = ctx.statsFor(m.name_en);
    if (mr.length) mountLines.push(...mr.map((r) => `  ${statLine(r)}  (mount: ${stripTags(m.name_en)})`));
  }
  if (mountLines.length) out.push('', 'Mount profiles:', ...mountLines);

  const sr = splitTopLevel(u.specialRules?.name_en ?? '');
  out.push('', `Special rules: ${sr.length ? sr.join(', ') : '-'}`);
  if (ctx.overlay?.rules) {
    const packed = Object.values(ctx.overlay.rules);
    const key = (s: string) => norm(s.replace(/\(.*?\)/g, ''));
    const hits = sr.filter((x) => packed.some((p) => key(p.name_en) === key(x)));
    if (hits.length) out.push(`Renegade wording exists for: ${hits.join(', ')} (get_rule with army="${ctx.slug}" shows it).`);
  }
  const ds = datasheet(ctx, u);
  out.push('', `Datasheet: ${ds.url ?? 'not linked'}${ds.page ? ` (${ds.page})` : ''}`);
  out.push('Rule texts: use get_rule for each special rule (verbatim tow.whfb.app text).');
  return out.join('\n');
}

export async function listArmies(): Promise<string> {
  const idx = await need<{ armies: { slug: string; name: string; units?: number }[] }>('owb/index.json');
  const out = ['Armies in the Companion (Old World Builder catalogues; Renegade V2 overlays for Legacy armies):'];
  for (const a of idx.armies) {
    const { comps, group } = await compositionsFor(a.slug);
    const legacy = group === 'legends';
    out.push(`- ${a.name} [${a.slug}]${legacy ? ' · Legacy' : ''}${RENEGADE_OF[a.slug] ? ' · Renegade V2 available (default)' : ''} · compositions: ${comps.map((c) => `${c} (${compName(c, a.slug)})`).join(', ')}`);
  }
  out.push('', 'Use get_army for the units of one army, get_unit for one unit.');
  return out.join('\n');
}

export async function getArmy(a: { army?: string; composition?: string; category?: string }): Promise<string> {
  if (!a.army) return 'Give an army (name, slug or short name). Use list_armies.';
  const slug = await resolveArmy(a.army);
  if (!slug) return `Unknown army "${a.army}". Use list_armies.`;
  const ctx = await armyCtx(slug, a.composition);
  if ('error' in ctx) return ctx.error;
  const out = [`${ctx.name} — composition: ${ctx.compLabel} [${ctx.comp}]`];
  if (ctx.compNote) out.push(ctx.compNote);
  out.push(`Other compositions: ${ctx.comps.filter((c) => c !== ctx.comp).map((c) => `${c} (${compName(c, slug)})`).join(', ') || 'none'}`);
  const want = a.category ? norm(a.category) : '';
  const byCat = new Map<Category, string[]>();
  for (const c of CATEGORIES) {
    for (const u of ctx.cat[c] ?? []) {
      if (!u || !unitAllowedIn(u, ctx.comp)) continue;
      const eff = unitCategoryFor(u, ctx.comp, c);
      if (want && !norm(eff).startsWith(want.replace(/s$/, ''))) continue;
      const note = unitNote(u, ctx.comp);
      const prov = ctx.overlay ? unitPointsProvenance(ctx.overlay, u.id) : null;
      const line = `- ${u.name_en} — ${pointsLabel(u)}${prov ? ` (official ${prov.was})` : ''}${note ? ` · ${note}` : ''}`;
      byCat.set(eff, [...(byCat.get(eff) ?? []), line]);
    }
  }
  for (const c of CATEGORIES) {
    const lines = byCat.get(c);
    if (lines?.length) out.push('', `${CAT_LABEL[c]} (${lines.length}):`, ...lines);
  }
  if (!byCat.size) out.push('', 'No units in this category.');
  out.push('', 'Use get_unit for statlines, options and special rules.');
  return out.join('\n');
}

// ── a game unit for the calculator ────────────────────────────────────────────────────────────────

/** Option names → `<group>/<index>` keys, applied like the list builder (radio groups replace). */
export function applyOptionNames(u: OwbUnit, names: string[]): { opts: string[]; unknown: string[]; applied: string[] } {
  let opts: string[] = [];
  const unknown: string[] = [];
  const applied: string[] = [];
  for (const raw of names) {
    const n = norm(raw);
    let best: { key: string; group: string; score: number; label: string } | null = null;
    for (const g of GROUPS) {
      const list = Array.isArray(u[g.key]) ? (u[g.key] as OwbOption[]) : [];
      list.forEach((o, i) => {
        if (!o || o.hidden || !o.name_en) return;
        const on = norm(stripTags(o.name_en));
        const s = on === n ? 100 : tokens(on).join(' ') === tokens(n).join(' ') ? 95 : on.includes(n) ? 70 : tokens(n).every((t) => tokens(on).includes(t)) ? 60 : 0;
        if (s && (!best || s > best.score)) best = { key: `${g.key}/${i}`, group: g.key, score: s, label: stripTags(o.name_en) };
      });
    }
    if (!best) { unknown.push(raw); continue; }
    const b = best as { key: string; group: string; score: number; label: string };
    if (isRadioGroup(u, b.group as keyof OwbUnit)) opts = [...opts.filter((k) => !k.startsWith(`${b.group}/`)), b.key];
    else if (!opts.includes(b.key)) opts = toggleOption(u, { uid: u.id, cat: 'core', unitId: u.id, count: 1, opts }, b.key);
    applied.push(b.label);
  }
  return { opts, unknown, applied };
}

export function gameUnit(ctx: ArmyCtx, found: Found, opts: string[], count: number): ArmyUnit | null {
  const army = builderListToArmy(
    { name: 'mcp', composition: ctx.comp, rule: 'open-war', points: 0, entries: [{ uid: found.unit.id, cat: found.baseCat, unitId: found.unit.id, count, opts }] },
    ctx.cat,
    ctx.statsFor,
    {
      faction: ctx.name,
      composition: compName(ctx.comp, ctx.slug),
      overlayId: ctx.overlay?.id,
      armyItemLists: ctx.itemLists,
      mountText: ctx.mountText,
      troopTypeFor: ctx.troopTypeFor,
      factionNames: ctx.allNames.length ? ctx.allNames : Object.values(ARMY_NAMES),
    },
  );
  return army.units[0] ?? null;
}

export const unitMinimum = (u: OwbUnit): number => Math.max(1, u.minimum || 1);
export const unitIsMulti = isMulti;
