// Army-list builder logic (Stap 2 PoC, Dark Elves). Points totalling + composition validation,
// using the Old World Builder catalogue (public/owb/) and composition rules ported from OWB's
// src/utils/rules.js (CC BY 4.0). Underlying data © Games Workshop — unofficial personal-use aid.

export type Category = 'characters' | 'core' | 'special' | 'rare' | 'mercenaries' | 'allies';
export const CATEGORIES: Category[] = ['characters', 'core', 'special', 'rare', 'mercenaries', 'allies'];

export interface OwbOption {
  name_en: string; points?: number; perModel?: boolean; active?: boolean;
  // `alwaysActive` — the option is always on and cannot be toggled off (a free base, e.g. the
  // "Wizard" header on a Sorceress). `exclusive` — the option is one-of among its SIBLINGS in the
  // same nested list (a radio choice, e.g. "Level 3 Wizard" vs "Level 4 Wizard").
  alwaysActive?: boolean; exclusive?: boolean; minimum?: number; maximum?: number;
  // Any option (in any group) may carry NESTED sub-options. These apply only while the parent is
  // active: for a radio group when the parent is the selected choice; for a toggle group when the
  // parent is toggled on (or `alwaysActive`). Exclusive children form a single radio set; the rest
  // are independent toggles. e.g. a Manticore mount → "Venomous tail" toggle; a Sorceress' "Wizard"
  // → the Level radio. Generalised by `subOptionGroups`/`toggleSubOption`/`setExclusiveSubOption`.
  options?: OwbOption[];
}
// A unit's magic-item "section" (from the catalogue's per-unit `items[]`). Each section permits a
// set of item `types` (mapping to the `type` field in magic-items.json) and carries its own
// `maxPoints` budget (the data-driven per-character allowance). e.g. a Dreadlord has one "Magic
// Items" section (types weapon/armor/talisman/enchanted-item, maxPoints 100); a Death Hag also has
// a "Gifts of Khaine" section (types gift-of-khaine, maxPoints 20).
export interface OwbItemSection {
  name_en: string; name_cn?: string; name_de?: string; name_es?: string; name_fr?: string;
  types: string[]; maxPoints?: number; selected?: unknown[];
}
export interface OwbUnit {
  id: string; name_en: string; points?: number; minimum?: number; maximum?: number;
  command?: OwbOption[]; equipment?: OwbOption[]; armor?: OwbOption[]; options?: OwbOption[];
  mounts?: OwbOption[]; lores?: OwbOption[]; specialRules?: { name_en?: string };
  items?: OwbItemSection[];
}
export type OwbArmy = Record<Category, OwbUnit[]>;

// The option groups a unit can spend points on (lores are free spell picks → omitted here).
// `radio` groups are single-choice (you carry one weapon loadout, wear one armour, ride one mount);
// the rest are toggles you can mix (musician + standard, Shield + Sea Dragon Cloak, …). OWB marks
// the free default of a single-choice group with `active:true` (e.g. Hand weapon / Light armour /
// On foot) and lists each alternative — including bundled combinations — as its own entry.
export const OPTION_GROUPS: { key: keyof OwbUnit; label: string; radio?: boolean }[] = [
  { key: 'command', label: 'Command' },
  { key: 'equipment', label: 'Equipment', radio: true },
  { key: 'armor', label: 'Armour', radio: true },
  { key: 'options', label: 'Options' },
  { key: 'mounts', label: 'Mounts', radio: true },
];

// An option block ready for the editor: the group's items with their index + whether it's radio.
export interface OptionBlock { key: keyof OwbUnit; label: string; radio: boolean; items: { i: number; opt: OwbOption }[] }
export function unitBlocks(unit: OwbUnit): OptionBlock[] {
  return OPTION_GROUPS.map(({ key, label, radio }) => {
    const list = (Array.isArray(unit[key]) ? (unit[key] as OwbOption[]) : []).filter((o) => o && o.name_en);
    return { key, label, radio: !!radio, items: list.map((opt, i) => ({ i, opt })) };
  }).filter((b) => b.items.length > 0);
}

// The currently-selected option key in a radio group (the stored choice, else the `active` default).
export function radioSelected(unit: OwbUnit, entry: ListEntry, key: keyof OwbUnit): string {
  const items = (Array.isArray(unit[key]) ? (unit[key] as OwbOption[]) : []);
  const stored = entry.opts.find((k) => k.startsWith(`${key}/`));
  if (stored) return stored;
  const def = items.findIndex((o) => o.active);
  return `${key}/${def >= 0 ? def : 0}`;
}

// ---- Nested sub-options (one level under ANY group item) --------------------------------------
// An option in any group (command/equipment/armor/options/mounts) may carry a nested `options`
// array. Those nested options apply only while the PARENT is active:
//   • radio group (equipment/armor/mounts) — the parent is the currently-selected radio index;
//   • toggle group (command/options)       — the parent is toggled on OR is `alwaysActive`.
// Within an active parent, the nested set is split into:
//   • a single-choice RADIO set  — all children with `exclusive:true` (exactly one selected; the
//     default is the child with `active`, else the first; the free `active` default is implicit);
//   • independent TOGGLES        — the remaining children (each on/off on its own).
// Stored in entry.opts as  subopt/<group>/<parentIndex>/<childIndex>  (new writes). For backwards
// compatibility we ALSO read the legacy mount keys  mountopt/<mountIndex>/<childIndex>  (treated as
// subopt/mounts/...). Stale keys for a no-longer-active parent are simply ignored by points/summary
// (we only consider parents that are currently active) — no need to delete them on radio change.
const SUBOPT_PREFIX = 'subopt';
const MOUNTOPT_PREFIX = 'mountopt'; // legacy (mounts-only) prefix — read, never written
const subOptKey = (group: keyof OwbUnit, parentIndex: number, childIndex: number) =>
  `${SUBOPT_PREFIX}/${String(group)}/${parentIndex}/${childIndex}`;
const legacyMountKey = (parentIndex: number, childIndex: number) =>
  `${MOUNTOPT_PREFIX}/${parentIndex}/${childIndex}`;

// True when a sub-option key (new OR legacy) is currently stored on the entry for this slot.
const hasSubOpt = (entry: ListEntry, group: keyof OwbUnit, parentIndex: number, childIndex: number): boolean => {
  if (entry.opts.includes(subOptKey(group, parentIndex, childIndex))) return true;
  if (group === 'mounts' && entry.opts.includes(legacyMountKey(parentIndex, childIndex))) return true;
  return false;
};

// Is the parent option at `parentIndex` in `group` currently active (so its nested options apply)?
function parentActive(unit: OwbUnit, entry: ListEntry, group: keyof OwbUnit, parent: OwbOption, parentIndex: number): boolean {
  const isRadio = OPTION_GROUPS.find((g) => g.key === group)?.radio;
  if (isRadio) return radioSelected(unit, entry, group) === `${String(group)}/${parentIndex}`;
  return parent.alwaysActive === true || entry.opts.includes(`${String(group)}/${parentIndex}`);
}

// A nested sub-option ready for the editor: its child index, the option, its stored key, selected state.
export interface SubOptionItem { i: number; opt: OwbOption; key: string; selected: boolean }
// A group of nested sub-options under one active parent (radio when `exclusive`, else toggles).
export interface SubOptionGroup {
  group: keyof OwbUnit; parentIndex: number; parentLabel: string;
  parentActive: boolean; alwaysActive: boolean; exclusive: boolean;
  items: SubOptionItem[];
}

// All ACTIVE nested sub-option groups across every option group, split per parent into its exclusive
// (radio) set and its non-exclusive (toggle) set — so one parent can yield up to two groups.
export function subOptionGroups(unit: OwbUnit, entry: ListEntry): SubOptionGroup[] {
  const out: SubOptionGroup[] = [];
  for (const { key: group } of OPTION_GROUPS) {
    const parents = groupItems(unit, group);
    parents.forEach((parent, parentIndex) => {
      const children = (Array.isArray(parent.options) ? parent.options : []).filter((o) => o && o.name_en);
      if (children.length === 0) return;
      if (!parentActive(unit, entry, group, parent, parentIndex)) return;
      const active = true;
      // Find which (if any) exclusive child is the default-active one, for the implicit selection.
      const exclChildren = children.filter((c) => c.exclusive);
      const defExclIdx = exclChildren.length
        ? (() => { const a = children.findIndex((c) => c.exclusive && c.active); return a >= 0 ? a : children.findIndex((c) => c.exclusive); })()
        : -1;
      const storedExcl = children.findIndex((c, i) => c.exclusive && hasSubOpt(entry, group, parentIndex, i));
      const selectedExcl = storedExcl >= 0 ? storedExcl : defExclIdx; // nothing stored → the default
      // Emit the exclusive (radio) sub-group, if any.
      const excl = children
        .map((opt, i) => ({ opt, i }))
        .filter(({ opt }) => opt.exclusive)
        .map(({ opt, i }) => ({ i, opt, key: subOptKey(group, parentIndex, i), selected: i === selectedExcl }));
      if (excl.length) out.push({ group, parentIndex, parentLabel: parent.name_en, parentActive: active, alwaysActive: !!parent.alwaysActive, exclusive: true, items: excl });
      // Emit the non-exclusive (toggle) sub-group, if any.
      const toggles = children
        .map((opt, i) => ({ opt, i }))
        .filter(({ opt }) => !opt.exclusive)
        .map(({ opt, i }) => ({ i, opt, key: subOptKey(group, parentIndex, i), selected: hasSubOpt(entry, group, parentIndex, i) }));
      if (toggles.length) out.push({ group, parentIndex, parentLabel: parent.name_en, parentActive: active, alwaysActive: !!parent.alwaysActive, exclusive: false, items: toggles });
    });
  }
  return out;
}

// Pure toggle for a non-exclusive nested sub-option: returns the new opts with it flipped on/off.
// Clears any legacy mount key for the same slot so the new key is authoritative.
export function toggleSubOption(entry: ListEntry, group: keyof OwbUnit, parentIndex: number, childIndex: number): string[] {
  const key = subOptKey(group, parentIndex, childIndex);
  const on = hasSubOpt(entry, group, parentIndex, childIndex);
  const cleared = entry.opts.filter((k) => k !== key && k !== legacyMountKey(parentIndex, childIndex));
  return on ? cleared : [...cleared, key];
}

// Pure radio set for an exclusive nested sub-option: returns the new opts with this child selected,
// dropping any sibling exclusive pick under the same parent (new + legacy keys).
export function setExclusiveSubOption(unit: OwbUnit, entry: ListEntry, group: keyof OwbUnit, parentIndex: number, childIndex: number): string[] {
  const parent = groupItems(unit, group)[parentIndex];
  const children = (Array.isArray(parent?.options) ? parent!.options! : []);
  const siblingKeys = new Set<string>();
  children.forEach((c, i) => { if (c.exclusive) { siblingKeys.add(subOptKey(group, parentIndex, i)); siblingKeys.add(legacyMountKey(parentIndex, i)); } });
  const rest = entry.opts.filter((k) => !siblingKeys.has(k));
  return [...rest, subOptKey(group, parentIndex, childIndex)];
}

// ---- Mount sub-options (legacy shim over the general engine) ----------------------------------
// The mount index currently selected in the `mounts` radio group (resolves the `active` default).
export function selectedMountIndex(unit: OwbUnit, entry: ListEntry): number {
  const sel = radioSelected(unit, entry, 'mounts'); // "mounts/<i>"
  const i = Number(sel.split('/')[1]);
  return Number.isFinite(i) ? i : 0;
}

// A mount sub-option ready for the editor: its index, the option, its stored key and whether it's on.
export interface MountSubOption { i: number; opt: OwbOption; key: string; selected: boolean }

// The nested sub-options of the CURRENTLY-selected mount, each with its index + selected state.
// Empty when the selected mount has no nested options (the common case). Reimplemented on top of
// the general engine; kept for back-compat with existing callers.
export function mountSubOptions(unit: OwbUnit, entry: ListEntry): MountSubOption[] {
  const mIndex = selectedMountIndex(unit, entry);
  return subOptionGroups(unit, entry)
    .filter((g) => g.group === 'mounts' && g.parentIndex === mIndex && !g.exclusive)
    .flatMap((g) => g.items.map(({ i, opt, key, selected }) => ({ i, opt, key, selected })));
}

// Pure toggle: returns the new opts array with the given mount sub-option flipped on/off.
// Writes the new `subopt/mounts/...` key (and clears the legacy key) via the general helper.
export function toggleMountSubOption(entry: ListEntry, mountIndex: number, optIndex: number): string[] {
  return toggleSubOption(entry, 'mounts', mountIndex, optIndex);
}

// Short labels of the chosen non-default upgrades, for a roster row's one-line summary.
// Pass `itemsData` (the parsed magic-items.json) to also list chosen magic items.
export function summaryLabels(unit: OwbUnit, entry: ListEntry, itemsData?: MagicItemsData): string[] {
  const labels = selectedOptions(unit, entry)
    .filter(({ opt }) => !opt.active)
    .map(({ opt }) => opt.name_en);
  // Nested sub-options of active parents: toggles when on; exclusive picks unless they are the
  // free `active` default (e.g. show "Level 4 Wizard" / "Venomous tail", not "Level 3 Wizard").
  for (const g of subOptionGroups(unit, entry)) {
    for (const it of g.items) {
      if (!it.selected) continue;
      if (g.exclusive && it.opt.active) continue; // the implicit default — don't list it
      labels.push(it.opt.name_en);
    }
  }
  if (itemsData) for (const it of selectedMagicItems(unit, entry, itemsData)) labels.push(it.item.name_en);
  return labels;
}

// One chosen entry in the list. `opts` holds selected option keys "group/index".
export interface ListEntry { uid: string; cat: Category; unitId: string; count: number; opts: string[] }
export interface BuilderList { composition: string; rule: string; points: number; entries: ListEntry[] }

// Composition category percentage limits — ported from OWB src/utils/rules.js "grand-army".
// (The lords/heroes 25%/25% sub-split needs a lord/hero flag the catalogue doesn't carry, so we
// validate the combined Characters ≤50% for now.)
export interface CatLimit { minPercent?: number; maxPercent?: number }
export const GRAND_ARMY: Record<Category, CatLimit> = {
  characters: { maxPercent: 50 },
  core: { minPercent: 25 },
  special: { maxPercent: 50 },
  rare: { maxPercent: 25 },
  mercenaries: { maxPercent: 20 },
  allies: { maxPercent: 25 },
};

// The "Army composition rule" axis. Open War uses the Grand Army limits as-is; Grand Melee tightens
// every category to 25% (OWB validation.js). Others fall back to the baseline for this PoC.
export const COMPOSITION_RULES: { id: string; name: string }[] = [
  { id: 'open-war', name: 'Open War' },
  { id: 'combined-arms', name: 'Combined Arms' },
  { id: 'grand-melee', name: 'Grand Melee' },
  { id: 'battle-march', name: 'Battle March' },
];

export function limitsFor(rule: string): Record<Category, CatLimit> {
  if (rule === 'grand-melee') {
    const out = {} as Record<Category, CatLimit>;
    for (const c of CATEGORIES) out[c] = { ...GRAND_ARMY[c], maxPercent: Math.min(25, GRAND_ARMY[c].maxPercent ?? 25) };
    return out;
  }
  return GRAND_ARMY;
}

const groupItems = (unit: OwbUnit, group: keyof OwbUnit): OwbOption[] =>
  (Array.isArray(unit[group]) ? (unit[group] as OwbOption[]) : []).filter((o) => o && o.name_en);

/** Selected options for an entry, as {group, option} pairs. */
export function selectedOptions(unit: OwbUnit, entry: ListEntry): { group: keyof OwbUnit; opt: OwbOption }[] {
  const out: { group: keyof OwbUnit; opt: OwbOption }[] = [];
  for (const key of entry.opts) {
    const [g, iStr] = key.split('/');
    const list = groupItems(unit, g as keyof OwbUnit);
    const opt = list[Number(iStr)];
    if (opt) out.push({ group: g as keyof OwbUnit, opt });
  }
  return out;
}

/** Points for one list entry: base (per model × count) + each selected option (× count if perModel)
 *  + selected sub-options of the current mount + selected magic items (both per-unit, not per-model).
 *  Pass `itemsData` (parsed magic-items.json) to include magic-item points; omit it and they count 0
 *  (keeps the older 2-arg call sites working until the magic-items UI supplies the data). */
export function entryPoints(unit: OwbUnit, entry: ListEntry, itemsData?: MagicItemsData): number {
  let pts = (unit.points ?? 0) * entry.count;
  for (const { opt } of selectedOptions(unit, entry)) {
    pts += (opt.points ?? 0) * (opt.perModel ? entry.count : 1);
  }
  // Nested sub-options of active parents (mount toggles, wizard levels, …). The free `active`
  // exclusive default is implicit/free; only a non-default exclusive pick (or any on toggle) costs.
  for (const g of subOptionGroups(unit, entry)) {
    for (const it of g.items) {
      if (!it.selected) continue;
      if (g.exclusive && it.opt.active) continue; // free default — don't charge it
      pts += (it.opt.points ?? 0) * (it.opt.perModel ? entry.count : 1);
    }
  }
  // Magic items (only characters can carry them; per-unit, never per-model).
  if (itemsData) pts += magicItemsPoints(unit, entry, itemsData);
  return pts;
}

export interface CategoryTally { points: number; limit: CatLimit; cap: number | null; floor: number | null; over: boolean; under: boolean }
export interface Validation {
  total: number;
  byCategory: Record<Category, CategoryTally>;
  warnings: string[];
}

// Tally points per category and check them against the composition's limits (percent of the points
// target) plus each unit's min/max model count. Pass `itemsData` (parsed magic-items.json) to fold
// magic-item points into the total/category tallies; omit it and they count 0.
export function validate(list: BuilderList, getUnit: (cat: Category, id: string) => OwbUnit | undefined, itemsData?: MagicItemsData): Validation {
  const limits = limitsFor(list.rule);
  const target = list.points || 0;
  const byCategory = {} as Record<Category, CategoryTally>;
  for (const c of CATEGORIES) byCategory[c] = { points: 0, limit: limits[c], cap: null, floor: null, over: false, under: false };

  const warnings: string[] = [];
  let total = 0;
  for (const e of list.entries) {
    const unit = getUnit(e.cat, e.unitId);
    if (!unit) continue;
    const p = entryPoints(unit, e, itemsData);
    total += p;
    byCategory[e.cat].points += p;
    const min = unit.minimum ?? 1;
    const max = unit.maximum ?? 0; // 0 = no max
    if (e.count < min) warnings.push(`${unit.name_en}: below minimum size (${min})`);
    if (max > 0 && e.count > max) warnings.push(`${unit.name_en}: above maximum size (${max})`);
  }

  for (const c of CATEGORIES) {
    const t = byCategory[c];
    if (t.limit.maxPercent != null) {
      t.cap = Math.floor((t.limit.maxPercent / 100) * target);
      if (t.points > t.cap) { t.over = true; warnings.push(`${cap(c)} over its ${t.limit.maxPercent}% cap (${t.points}/${t.cap} pts)`); }
    }
    if (t.limit.minPercent != null) {
      t.floor = Math.ceil((t.limit.minPercent / 100) * target);
      if (t.points < t.floor) { t.under = true; warnings.push(`${cap(c)} below its ${t.limit.minPercent}% minimum (${t.points}/${t.floor} pts)`); }
    }
  }

  if (total > target) warnings.push(`Over the points limit by ${total - target}`);

  return { total, byCategory, warnings };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ============================================================================================
// Magic items (Feature 2) — DATA SHAPE + PURE ENGINE
// ============================================================================================
// The catalogue lives in public/owb/magic-items.json: one object keyed by item-list id
// ("general", "dark-elves", "gifts-of-khaine", "forbidden-poisons", …), each value an array of
// MagicItem. An army's metadata (the-old-world.json) lists which item-lists it may use in its
// `items` array; a UNIT's `items[]` sections then filter those by item `type` and cap each
// section with `maxPoints`. We keep this engine PURE: the UI fetches the JSON and passes the
// parsed data in (mirroring how `army`/`statsFor` are passed in) — we never fetch here.

/** One magic item as stored in magic-items.json. `name` is OWB's stable slug-ish id; `type` is the
 *  category (weapon/armor/talisman/enchanted-item/arcane-item/banner/gift-of-khaine/…). */
export interface MagicItem {
  name_en: string; name?: string; points?: number; type: string;
  onePerArmy?: boolean; stackable?: boolean; maximum?: number;
}
/** Parsed magic-items.json: list-id → items. (Other locale name_* fields are ignored here.) */
export type MagicItemsData = Record<string, MagicItem[]>;

// Default per-character magic-item budget when neither the data nor the caller supplies one.
// TOW's real allowance is the unit's section `maxPoints` (present in the catalogue) — prefer that;
// this constant is only the last-resort fallback the UI/list can override.
export const DEFAULT_MAGIC_BUDGET = 50;

const MAGIC_PREFIX = 'magic';
// Stable id for an item within its category: prefer OWB's `name` slug, else slugify name_en.
const slug = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const magicItemId = (item: MagicItem): string => slug(item.name || item.name_en);
const magicKey = (categoryId: string, itemId: string) => `${MAGIC_PREFIX}/${categoryId}/${itemId}`;

/** Only characters carry magic items (keep it simple, per the spec). */
export function isCharacter(cat: Category): boolean { return cat === 'characters'; }

// A magic-item category for a unit: one section of the unit's `items[]`, resolved to the actual
// items it may take (gathered from the army's item-lists, filtered by the section's `types`).
export interface MagicCategory {
  id: string;            // stable category id, e.g. "weapon" or "gift-of-khaine" (first allowed type)
  label: string;         // section name, e.g. "Magic Items" / "Gifts of Khaine"
  types: string[];       // item `type`s this section accepts
  maxPoints: number | null; // data-driven section budget (null = none in data → use param budget)
  items: MagicItem[];    // the items selectable in this category
}

// Flatten every item-list this army may use into a single pool (army.items → magic-items.json).
// `armyItemLists` is the army metadata's `items` array (e.g. ["general","dark-elves",…]).
function itemPool(armyItemLists: string[], itemsData: MagicItemsData): MagicItem[] {
  const pool: MagicItem[] = [];
  for (const listId of armyItemLists) for (const it of (itemsData[listId] ?? [])) if (it && it.type) pool.push(it);
  return pool;
}

/** Shape the magic-item categories available to a unit: one per section in unit.items[], each
 *  resolved against the army's item pool. The UI calls this to render the groups + budget meters.
 *  Returns [] for non-characters or units without an `items` section. */
export function magicCategories(unit: OwbUnit, armyItemLists: string[], itemsData: MagicItemsData): MagicCategory[] {
  const sections = Array.isArray(unit.items) ? unit.items : [];
  if (sections.length === 0) return [];
  const pool = itemPool(armyItemLists, itemsData);
  return sections.map((sec) => {
    const types = Array.isArray(sec.types) ? sec.types : [];
    const items = pool.filter((it) => types.includes(it.type));
    return {
      id: types[0] ?? slug(sec.name_en),       // first type doubles as the category id
      label: sec.name_en,
      types,
      maxPoints: typeof sec.maxPoints === 'number' ? sec.maxPoints : null,
      items,
    };
  });
}

// Internal: every magic-item key stored on the entry, parsed into {categoryId, itemId}.
function parsedMagicKeys(entry: ListEntry): { categoryId: string; itemId: string; key: string }[] {
  const out: { categoryId: string; itemId: string; key: string }[] = [];
  for (const key of entry.opts) {
    if (!key.startsWith(`${MAGIC_PREFIX}/`)) continue;
    const [, categoryId, itemId] = key.split('/');
    if (categoryId && itemId) out.push({ categoryId, itemId, key });
  }
  return out;
}

/** Resolve the entry's selected magic items against the data: {category section, item, key}.
 *  Only resolves keys whose category + item still exist for this unit (stale/foreign keys ignored). */
export function selectedMagicItems(unit: OwbUnit, entry: ListEntry, itemsData: MagicItemsData, armyItemLists?: string[]):
  { category: MagicCategory; item: MagicItem; key: string }[] {
  // We can resolve items from the raw pool even without armyItemLists by scanning all lists, but
  // prefer the army-scoped categories when provided for correct labels/budgets.
  const cats = magicCategories(unit, armyItemLists ?? Object.keys(itemsData), itemsData);
  if (cats.length === 0) return [];
  const out: { category: MagicCategory; item: MagicItem; key: string }[] = [];
  for (const { categoryId, itemId, key } of parsedMagicKeys(entry)) {
    const category = cats.find((c) => c.id === categoryId);
    if (!category) continue;
    const item = category.items.find((it) => magicItemId(it) === itemId);
    if (item) out.push({ category, item, key });
  }
  return out;
}

/** Total points spent on magic items by this entry (per-unit, never per-model). */
export function magicItemsPoints(unit: OwbUnit, entry: ListEntry, itemsData: MagicItemsData, armyItemLists?: string[]): number {
  return selectedMagicItems(unit, entry, itemsData, armyItemLists).reduce((n, { item }) => n + (item.points ?? 0), 0);
}

/** Points spent within a single category (for that category's budget meter). */
export function magicSpent(unit: OwbUnit, entry: ListEntry, categoryId: string, itemsData: MagicItemsData, armyItemLists?: string[]): number {
  return selectedMagicItems(unit, entry, itemsData, armyItemLists)
    .filter(({ category }) => category.id === categoryId)
    .reduce((n, { item }) => n + (item.points ?? 0), 0);
}

/** The currently-selected item key in a category, or undefined (max 1 per category). */
export function selectedMagicItem(entry: ListEntry, categoryId: string): string | undefined {
  return parsedMagicKeys(entry).find((p) => p.categoryId === categoryId)?.key;
}

/** Pure toggle for a magic item (max 1 per category): picking an item in a category replaces any
 *  previous pick in that same category; picking the already-selected item clears it. Returns the
 *  new opts array — the UI calls onUpdate with it (no mutation, mirroring the radio/toggle helpers). */
export function toggleMagicItem(entry: ListEntry, categoryId: string, item: MagicItem): string[] {
  const key = magicKey(categoryId, magicItemId(item));
  const already = selectedMagicItem(entry, categoryId);
  // Drop any existing pick in this category, then add the new one unless it was the one selected.
  const rest = entry.opts.filter((k) => !k.startsWith(`${MAGIC_PREFIX}/${categoryId}/`));
  return already === key ? rest : [...rest, key];
}

/** Would picking `item` in `categoryId` exceed the budget? (For disabling options in the UI.)
 *  Budget order of precedence: explicit `budget` arg → the category's data `maxPoints` →
 *  DEFAULT_MAGIC_BUDGET. The check is per-category (each section has its own allowance). Re-picking
 *  the currently-selected item is never "over" (it's a no-op / deselect). */
export function magicWouldExceed(
  unit: OwbUnit, entry: ListEntry, categoryId: string, item: MagicItem, itemsData: MagicItemsData,
  opts?: { budget?: number; armyItemLists?: string[] },
): boolean {
  const armyItemLists = opts?.armyItemLists;
  const cats = magicCategories(unit, armyItemLists ?? Object.keys(itemsData), itemsData);
  const category = cats.find((c) => c.id === categoryId);
  const budget = opts?.budget ?? category?.maxPoints ?? DEFAULT_MAGIC_BUDGET;
  const key = magicKey(categoryId, magicItemId(item));
  if (selectedMagicItem(entry, categoryId) === key) return false; // re-pick = deselect
  // Selecting replaces any current pick in the category, so the resulting spend is just this item.
  return (item.points ?? 0) > budget;
}
