// Composition OVERLAYS — a community pack applied as a patch on top of the OWB catalogue.
//
// The Renegade Legacy Pack (squarebased.com) rebalances the Legacy factions. Rather than shipping a
// second catalogue per faction, each pack is a small overlay keyed by COMPOSITION id, merged onto the
// base army when that composition is chosen. Two reasons: a pack update stays a regenerated diff
// instead of a hand-merge, and the change remains inspectable — every patched value keeps `_was`, so
// "why is this 180 and not 230" is answerable from the data.
//
// PURE: nothing here fetches, and nothing mutates its inputs. The caller owns loading and caching.
//
// V2 SCOPE covers points, unit sizes, options, complete statlines, troop types, weapon profiles,
// special-rule prose, magic items, lore spells, composition placement and pack-introduced units.
// `scripts/import-renegade-reference.mjs` retains the Docs hierarchy and coloured segments losslessly;
// `scripts/compile-renegade-v2.mjs` maps only fields with an unambiguous semantic owner. Clauses the
// builder cannot enforce mechanically remain structured as composition rules, profile notes or pack
// notes rather than being discarded or guessed.

import type { Lore, Rule } from '../types';
import { CATEGORIES, type Category, type MagicItem, type MagicItemsData, type OwbArmy, type OwbOption, type OwbUnit } from './owbBuilder';

/** Where a pack came from, so the UI can credit it and link out. */
export interface OverlaySource {
  name: string;
  author: string;
  url: string;
  official: boolean;
  terms: string;
}

/** One repriced option on a unit.
 *
 *  Keyed by NAME, not by the `<group>/<index>` key the engine stores in `entry.opts`. Indices shift
 *  whenever `npm run sync-owb` regenerates the catalogue, and a shifted index would silently reprice a
 *  DIFFERENT option; a name that no longer exists simply fails to apply, which is the safe direction. */
export interface OverlayOptionPatch {
  /** The option group it lives in — `equipment` | `armor` | `options` | `command` | `mounts`. */
  group: string;
  action?: 'patch' | 'upsert' | 'remove';
  name_en: string;
  points?: number;
  renameTo?: string;
  perModel?: boolean;
  option?: OwbOption;
  _was?: number;
}

/** A single patched unit. Only the fields present are replaced; `_was`/`_changed` are provenance and
 *  are never merged into the unit itself. */
export interface OverlayUnitPatch {
  points?: number;
  minimum?: number;
  maximum?: number;
  specialRules?: string;
  replace?: Partial<Pick<OwbUnit,
    'command' | 'equipment' | 'armor' | 'mounts' | 'items' | 'lores' | 'spellCount'
  >>;
  _was?: number;
  _changed?: string[];
  /** Targeted option mutations — command upgrades, weapons, armour, mounts, special-rule buys. */
  options?: OverlayOptionPatch[];
}

export interface OverlayStatRow {
  Name: string;
  M: string;
  WS: string;
  BS: string;
  S: string;
  T: string;
  W: string;
  I: string;
  A: string;
  Ld: string;
}

export interface OverlayProfilePatch {
  stats?: OverlayStatRow[];
  troopType?: string;
  baseSize?: string;
  armourValue?: string;
  equipment?: string[];
  specialRules?: string[];
  notes?: string[];
}

export interface OverlayCompositionUnit {
  allowed?: boolean;
  category?: Category;
  notes?: string;
}

export interface OverlayComposition {
  includeOnly?: boolean;
  units?: Record<string, OverlayCompositionUnit>;
  /** Verbatim marked composition clauses grouped by their document heading. The current validator
   *  can enforce category placement; conditional/shared caps remain visible here instead of being
   *  flattened into an unsafe guess. */
  sourceRules?: Record<string, string[]>;
}

/** One special rule as the pack words it. `body` is paragraphs, in order. */
export interface OverlayRule {
  name_en: string;
  body: string[];
  /** Optional weapon-profile row. When present the generated rich text contains a real table, so
   *  combat calculations consume the Renegade values instead of only displaying prose. */
  weaponProfile?: { range: string; strength: string; ap: string; specialRules: string };
  /** The `rules.json` slug this REPLACES while the pack is active, or null when the pack introduces a
   *  rule the app has never had. Replacing in place is what stops the app showing two contradictory
   *  versions of the same rule name. */
  overrides: string | null;
}

export interface CompositionOverlay {
  /** The composition id this overlay belongs to, e.g. `ok-renegade-v2`. */
  id: string;
  label: string;
  /** Slug of the catalogue it patches, e.g. `ogre-kingdoms`. */
  baseArmy: string;
  packVersion: string | null;
  source: OverlaySource;
  /** Marked pack-wide clauses that do not belong to a unit, item, rule, spell or composition slot. */
  notes?: string[];
  status: 'draft' | 'stable';
  /** What the overlay is allowed to touch. Present so a future overlay can widen it explicitly rather
   *  than by accident. */
  scope: 'points-only' | 'points-and-rules';
  units: Record<string, OverlayUnitPatch>;
  /** Entries introduced by the pack and therefore absent from the synced OWB catalogue. */
  addedUnits?: Partial<Record<Category, OwbUnit[]>>;
  /** Existing OWB Renegade composition whose availability, categories and notes V2 inherits. */
  inheritsComposition?: string;
  composition?: OverlayComposition;
  /** Complete unit, mount or weapon statlines, keyed by normalized English lookup name. */
  profiles?: Record<string, OverlayProfilePatch>;
  magicItems: Record<string, MagicItem[]>;
  /** V2 wording for magic items and faction upgrades, keyed by the same stable item slug as
   *  `magic-item-text.json`. Kept beside the price patch so the eye/details view cannot show the
   *  old rule text for an item that the overlay has changed. */
  magicItemText?: Record<string, { description?: string; body?: string }>;
  /** Special-rule prose, keyed by the pack's own slug. Absent on a points-only overlay. */
  rules?: Record<string, OverlayRule>;
  /** Lore spell-list additions/replacements introduced by the pack. Spell rules themselves live in
   *  `rules`; this makes those rules selectable in the builder's lore picker. */
  lores?: Record<string, { name?: string; spells: Lore['spells'] }>;
}

/** The overlays that exist, as compositionId → file under `public/renegade/`. A composition without an
 *  entry here is simply an ordinary OWB composition; nothing breaks. */
export const OVERLAY_FILES: Record<string, string> = {
  'ok-renegade-v2': 'ok-renegade-v2.json',
  'de-renegade-v2': 'de-renegade-v2.json',
  'sk-renegade-v2': 'sk-renegade-v2.json',
  'cd-renegade-v2': 'cd-renegade-v2.json',
  'doc-renegade-v2': 'doc-renegade-v2.json',
  'lm-renegade-v2': 'lm-renegade-v2.json',
  'vc-renegade-v2': 'vc-renegade-v2.json',
};

export const hasOverlay = (composition: string): boolean => composition in OVERLAY_FILES;

/** Which overlay compositions an army offers, derived from the overlay ids themselves.
 *
 *  Registered in CODE, never in `public/owb/the-old-world.json`: that file is REGENERATED by
 *  `npm run sync-owb` from upstream Old World Builder, so a composition added there would vanish at the
 *  next data refresh — and vanish quietly, taking the pack out of the picker with it. Overlays are ours,
 *  so their registration lives with them. */
export function overlayCompsFor(armySlug: string, base: CompositionOverlay['baseArmy'][] = []): string[] {
  void base;
  return Object.keys(OVERLAY_FILES).filter((id) => OVERLAY_BASE_ARMY[id] === armySlug);
}

/** overlay id → the army it patches. Kept beside OVERLAY_FILES so adding a pack is one line in each. */
export const OVERLAY_BASE_ARMY: Record<string, string> = {
  'ok-renegade-v2': 'ogre-kingdoms',
  'de-renegade-v2': 'dark-elves',
  'sk-renegade-v2': 'skaven',
  'cd-renegade-v2': 'chaos-dwarfs',
  'doc-renegade-v2': 'daemons-of-chaos',
  'lm-renegade-v2': 'lizardmen',
  // Vampire Counts carries no `inheritsComposition`, unlike the other six. OWB has no `vc-renegade`
  // composition to inherit from, and naming one that does not exist makes `allowed` false for every
  // unit — the pack would open as an empty army list rather than fail loudly.
  'vc-renegade-v2': 'vampire-counts',
};

/** Backwards-compatible recovery for armies saved before `Army.overlayId` existed, and for pasted
 *  OWB exports. Their composition contains the display label ("Renegade V2") rather than our stable
 *  overlay id, so combine it with the faction name to find the matching registered pack. */
export function inferOverlayId(composition?: string, faction?: string): string | undefined {
  if (composition && hasOverlay(composition)) return composition;
  if (!/\brenegade\s+v2\b/i.test(composition ?? '')) return undefined;
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const factionKey = normalise(faction ?? '');
  return Object.entries(OVERLAY_BASE_ARMY)
    .find(([, armySlug]) => normalise(armySlug) === factionKey)?.[0];
}

/** Shallow structural check. An overlay arrives over the network and may be stale or half-written; a
 *  bad file must degrade to "no overlay", never to a broken catalogue. */
export function isOverlay(v: unknown): v is CompositionOverlay {
  const o = v as Partial<CompositionOverlay> | null;
  return !!o && typeof o.id === 'string' && typeof o.baseArmy === 'string'
    && !!o.units && typeof o.units === 'object';
}

/**
 * Apply an overlay's unit patches to a catalogue. Returns a NEW army; the input is untouched.
 *
 * Every unit in the result also gains `armyComposition[overlay.id] = { category }`, because the
 * existing engine decides availability and placement from that map (`unitAllowedIn`,
 * `unitCategoryFor`). Without it, choosing the overlay composition would hide every unit that already
 * carries an `armyComposition` map — the composition would look empty rather than patched.
 */
export function applyOverlay(base: OwbArmy, overlay: CompositionOverlay): OwbArmy {
  const out = { ...base } as OwbArmy & Record<string, unknown>;
  for (const [cat, arr] of Object.entries(base as Record<string, unknown>)) {
    if (!Array.isArray(arr)) continue;
    out[cat] = (arr as OwbUnit[]).map((u): OwbUnit | null => {
      const patch = overlay.units[u.id];
      const baseComp = u.armyComposition ?? {};
      const explicit = overlay.composition?.units?.[u.id];
      const inherited = overlay.inheritsComposition ? baseComp[overlay.inheritsComposition] : undefined;
      const mappedCatalogue = Object.keys(baseComp).length > 0;
      const allowed = explicit?.allowed !== false
        && (explicit != null
          || inherited != null
          || (!overlay.composition?.includeOnly && (!overlay.inheritsComposition || !mappedCatalogue)));
      const comp = { ...baseComp };
      if (allowed) {
        comp[overlay.id] = {
          category: explicit?.category ?? inherited?.category ?? cat as Category,
          notes: explicit?.notes ? { name_en: explicit.notes } : inherited?.notes,
        };
      } else if (mappedCatalogue) {
        delete comp[overlay.id];
      } else {
        // A unit WITHOUT an armyComposition map is "available everywhere" by convention, so deleting
        // our key from it excludes nothing — the only way to honour `allowed: false` is to drop the
        // unit from this composition's catalogue. Safe here: applyOverlay builds the catalogue for
        // one chosen composition, and units are addressed by id, never by array index. First needed
        // for Daemons: the pack folds the four "Chaos Furies of <god>" entries into one priced unit
        // with mark options, but the unmapped originals kept riding along beside it.
        return null;
      }
      // Only real fields are copied over; `_was`/`_changed` stay out of the unit.
      const next: OwbUnit = { ...u, armyComposition: comp };
      // OWB can carry the standard and Renegade version of the same mount side by side. Hide variants
      // for other compositions, but do not remove them: saved lists address options by array index.
      for (const group of ['command', 'equipment', 'armor', 'options', 'mounts'] as const) {
        const list = next[group];
        if (!Array.isArray(list)) continue;
        next[group] = list.map((option) => {
          if (!option.armyComposition) return option;
          const visible = option.armyComposition === overlay.id
            || option.armyComposition === overlay.inheritsComposition;
          return { ...option, hidden: !visible };
        });
      }
      if (!patch) return next;
      if (typeof patch.points === 'number') next.points = patch.points;
      if (typeof patch.minimum === 'number') next.minimum = patch.minimum;
      if (typeof patch.maximum === 'number') next.maximum = patch.maximum;
      if (typeof patch.specialRules === 'string') {
        next.specialRules = { ...(u.specialRules ?? {}), name_en: patch.specialRules };
      }
      if (patch.replace) {
        for (const [field, value] of Object.entries(patch.replace)) {
          (next as OwbUnit & Record<string, unknown>)[field] = structuredClone(value);
        }
      }
      if (patch.options?.length) applyOptionPatches(next, patch.options);
      return next;
    }).filter((u): u is OwbUnit => u != null);
  }
  for (const [category, added] of Object.entries(overlay.addedUnits ?? {})) {
    if (!Array.isArray(added) || !(CATEGORIES as readonly string[]).includes(category)) continue;
    const cat = category as Category;
    const existing = out[cat] ?? [];
    const ids = new Set(existing.map((unit) => unit.id));
    out[cat] = [
      ...existing,
      ...added.filter((unit) => !ids.has(unit.id)).map((unit) => ({
        ...structuredClone(unit),
        armyComposition: {
          ...(unit.armyComposition ?? {}),
          [overlay.id]: unit.armyComposition?.[overlay.id] ?? { category: cat },
        },
      })),
    ];
  }
  return out as OwbArmy;
}

const normOpt = (s: string): string =>
  String(s).toLowerCase().replace(/\{[^}]*\}/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Reprice options on a unit, in place on the already-copied `unit`.
 *
 * Matches on the option's NAME within its group, one level of nesting included (a mount's sub-options,
 * a Wizard's levels). Arrays are rebuilt rather than mutated, because the caller only shallow-copied the
 * unit — writing into `unit.command[0]` would reach through into the base catalogue and reprice the
 * option for every composition, including the ones this overlay does not apply to.
 */
function applyOptionPatches(unit: OwbUnit, patches: OverlayOptionPatch[]): void {
  const byGroup = new Map<string, OverlayOptionPatch[]>();
  for (const p of patches) {
    if (!p.group || !p.name_en) continue;
    if (!byGroup.has(p.group)) byGroup.set(p.group, []);
    byGroup.get(p.group)!.push(p);
  }
  const u = unit as OwbUnit & Record<string, unknown>;
  for (const [group, wanted] of byGroup) {
    let list = Array.isArray(u[group]) ? structuredClone(u[group] as OwbOption[]) : [];
    for (const p of wanted) {
      const target = normOpt(p.name_en);
      let found = false;
      const mutate = (items: OwbOption[]): OwbOption[] => items.flatMap((opt) => {
        if (normOpt(opt.name_en) === target) {
          found = true;
          if (p.action === 'remove') return [];
          return [{
            ...opt,
            ...(p.option ?? {}),
            ...(typeof p.points === 'number' ? { points: p.points } : {}),
            ...(typeof p.perModel === 'boolean' ? { perModel: p.perModel } : {}),
            ...(p.renameTo ? { name_en: p.renameTo } : {}),
          }];
        }
        return [{ ...opt, ...(opt.options ? { options: mutate(opt.options) } : {}) }];
      });
      list = mutate(list);
      if (!found && p.action === 'upsert') {
        list.push({
          name_en: p.renameTo ?? p.option?.name_en ?? p.name_en,
          ...(p.option ?? {}),
          ...(typeof p.points === 'number' ? { points: p.points } : {}),
          ...(typeof p.perModel === 'boolean' ? { perModel: p.perModel } : {}),
        });
      }
    }
    u[group] = list;
  }
}

/** Resolve an OWB statline by name and replace it when the active pack supplies a complete table. */
export function overlayStatsFor(
  index: Record<string, { stats?: OverlayStatRow[] }>,
  name: string,
  overlay?: CompositionOverlay | null,
): OverlayStatRow[] {
  const key = normOpt(name);
  const words = key.split(' ');
  const singular = /s$/.test(words.at(-1) ?? '')
    ? [...words.slice(0, -1), (words.at(-1) ?? '').replace(/s$/, '')].join(' ')
    : key;
  const patch = overlay?.profiles?.[key] ?? overlay?.profiles?.[singular];
  if (patch?.stats) return patch.stats;
  return index[key]?.stats ?? index[singular]?.stats ?? [];
}

export function applyOverlayStatIndex<T extends { stats?: OverlayStatRow[]; troopType?: string }>(
  index: Record<string, T>,
  overlay?: CompositionOverlay | null,
): Record<string, T> {
  if (!overlay?.profiles || !Object.keys(overlay.profiles).length) return index;
  const out = { ...index };
  for (const [name, patch] of Object.entries(overlay.profiles)) {
    const key = normOpt(name);
    out[key] = {
      ...(index[key] ?? {}),
      ...(patch.stats ? { stats: patch.stats } : {}),
      ...(patch.troopType ? { troopType: patch.troopType } : {}),
    } as T;
  }
  return out;
}

/**
 * Apply an overlay's magic-item changes. Returns NEW items data; the input is untouched.
 *
 * An entry either REPRICES a base item (matched on `name`) or adds a new one. Matching on `name` rather
 * than on display text because `name` is the id the engine stores in `entry.opts` as
 * `magic/<catId>/<itemId>` — repricing by display name would create a second, unreachable item and the
 * player's existing pick would silently keep the old price.
 */
export function applyOverlayItems(items: MagicItemsData, overlay: CompositionOverlay): MagicItemsData {
  const lists = overlay.magicItems;
  if (!lists || Object.keys(lists).length === 0) return items;
  const out: MagicItemsData = { ...items };
  for (const [listId, patches] of Object.entries(lists)) {
    const existing = Array.isArray(items[listId]) ? items[listId] : [];
    const byName = new Map(existing.map((it, i) => [String(it.name), i]));
    const merged = [...existing];
    for (const p of patches) {
      const at = byName.get(String(p.name));
      // Strip provenance so it never reaches the item the UI renders or the engine prices.
      const clean = { ...p } as MagicItem & { _was?: number };
      delete clean._was;
      if (at != null) merged[at] = { ...merged[at], ...clean };
      else merged.push(clean);
    }
    out[listId] = merged;
  }
  return out;
}

export function applyOverlayMagicText<T extends Record<string, { description?: string; body?: string }>>(
  text: T,
  overlay?: CompositionOverlay | null,
): T {
  if (!overlay?.magicItemText || !Object.keys(overlay.magicItemText).length) return text;
  return { ...text, ...overlay.magicItemText };
}

export interface MountProfileText {
  specialRules?: string[];
  troopType?: string;
  baseSize?: string;
  armourValue?: string;
  equipment?: string[];
  notes?: string[];
}

export function applyOverlayMountText<T extends Record<string, MountProfileText>>(
  text: T,
  overlay?: CompositionOverlay | null,
): T & Record<string, MountProfileText> {
  if (!overlay?.profiles) return text;
  const additions = Object.fromEntries(Object.entries(overlay.profiles)
    .filter(([, profile]) => profile.specialRules?.length || profile.troopType || profile.baseSize
      || profile.armourValue || profile.equipment?.length || profile.notes?.length)
    .map(([name, profile]) => [normOpt(name), {
      specialRules: profile.specialRules,
      troopType: profile.troopType,
      baseSize: profile.baseSize,
      armourValue: profile.armourValue,
      equipment: profile.equipment,
      notes: profile.notes,
    }]));
  return (Object.keys(additions).length ? { ...text, ...additions } : text) as T & Record<string, MountProfileText>;
}

/** Plain paragraphs as the Contentful-shaped rich text the rule sheet already renders. */
const richText = (paras: string[]): Rule['body'] => ({
  nodeType: 'document',
  content: paras.map((p) => ({
    nodeType: 'paragraph',
    content: [{ nodeType: 'text', value: p, marks: [] }],
  })),
});

const tableCell = (value: string, header = false) => ({
  nodeType: header ? 'table-header-cell' : 'table-cell',
  data: {},
  content: [{
    nodeType: 'paragraph',
    data: {},
    content: [{ nodeType: 'text', value, marks: header ? [{ type: 'bold' }] : [], data: {} }],
  }],
});

const richRuleBody = (rule: OverlayRule, paras: string[]): Rule['body'] => {
  const body = richText(paras);
  if (!rule.weaponProfile || !body) return body;
  body.content = [{
    nodeType: 'table',
    data: {},
    content: [
      {
        nodeType: 'table-row',
        data: {},
        content: ['R', 'S', 'AP', 'Special Rules'].map((value) => tableCell(value, true)),
      },
      {
        nodeType: 'table-row',
        data: {},
        content: [
          rule.weaponProfile.range,
          rule.weaponProfile.strength,
          rule.weaponProfile.ap,
          rule.weaponProfile.specialRules,
        ].map((value) => tableCell(value)),
      },
    ],
  }, ...(body.content ?? [])];
  return body;
};

/**
 * Fold an overlay's special rules into the app's rules, returning a NEW record; the input is untouched.
 *
 * An OVERRIDING rule takes the base rule's slug AND its name. Keeping the base name matters more than it
 * looks: `buildRuleIndex` maps a rule's NAME to its slug, and that index is how a unit's "Aquatic" label
 * finds its rule. Renaming it "Aquatic (Renegade V2)" would leave nothing in the index answering to
 * "Aquatic", so every unit carrying the label would silently stop resolving.
 *
 * A NEW rule gets its own `-renegade-v2` slug — no base entry is displaced — and resolves by name as
 * usual, because no base rule answers to that name.
 */
export function applyOverlayRules(rules: Record<string, Rule>, overlay: CompositionOverlay): Record<string, Rule> {
  const packed = overlay.rules;
  if (!packed || Object.keys(packed).length === 0) return rules;
  const out = { ...rules };
  for (const [slug, r] of Object.entries(packed)) {
    const base = r.overrides ? rules[r.overrides] : undefined;
    const targetSlug = r.overrides ?? `${slug}-renegade-v2`;
    // The reader has to be able to tell which wording they are looking at — the pack's version of a
    // rule can be materially different from the one in the book.
    const paras = [...r.body, `— ${overlay.label}, ${overlay.source.name} (${overlay.source.author}). ${base ? 'Replaces the standard rule' : 'New rule'} for this army composition.`];
    out[targetSlug] = {
      slug: targetSlug,
      name: base?.name ?? r.name_en,
      order: base?.order ?? null,
      // NOT inherited from the base rule: this is the pack's wording, and citing the rulebook page it
      // replaced would send the reader to a page that says something else.
      pageReference: null,
      parentSlug: base?.parentSlug ?? 'special-rules',
      body: richRuleBody(r, paras),
      bodyIndex: r.body.join(' '),
      childSlugs: [],
      prevSlug: null,
      nextSlug: null,
      crossRefSlugs: [],
      // No inline links are reconstructed from plain prose, so nothing is claimed here.
      refSlugs: [],
    };
  }
  return out;
}

export function applyOverlayLores(lores: Record<string, Lore>, overlay?: CompositionOverlay | null): Record<string, Lore> {
  if (!overlay?.lores || !Object.keys(overlay.lores).length) return lores;
  const out = { ...lores };
  for (const [loreSlug, patch] of Object.entries(overlay.lores)) {
    const base = lores[loreSlug];
    if (!base) continue;
    const spells = [...base.spells];
    for (const spell of patch.spells) {
      const at = spells.findIndex((candidate) => candidate.slug === spell.slug
        || candidate.name.toLowerCase() === spell.name.toLowerCase());
      if (at >= 0) spells[at] = spell;
      else spells.push(spell);
    }
    out[loreSlug] = { ...base, ...(patch.name ? { name: patch.name } : {}), spells };
  }
  return out;
}

/** The provenance of a patched unit's points, for a "why is this different" affordance. */
export function unitPointsProvenance(overlay: CompositionOverlay, unitId: string): { was: number; now: number } | null {
  const p = overlay.units[unitId];
  if (!p || typeof p.points !== 'number' || typeof p._was !== 'number') return null;
  return { was: p._was, now: p.points };
}
