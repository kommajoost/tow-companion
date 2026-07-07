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
  // Some options unlock a magic-item allowance when taken — e.g. a "Standard bearer" command option
  // lets the unit buy a magic standard (`{ types: ["banner"], maxPoints: 50 }`). Surfaced as an extra
  // magic category (gated on the option being active) by `magicCategories`.
  magic?: { types: string[]; maxPoints?: number; maxItemsPerCategory?: number };
}
// A unit's magic-item "section" (from the catalogue's per-unit `items[]`). Each section permits a
// set of item `types` (mapping to the `type` field in magic-items.json) and carries its own
// `maxPoints` budget (the data-driven per-character allowance). e.g. a Dreadlord has one "Magic
// Items" section (types weapon/armor/talisman/enchanted-item, maxPoints 100); a Death Hag also has
// a "Gifts of Khaine" section (types gift-of-khaine, maxPoints 20).
export interface OwbItemSection {
  name_en: string; name_cn?: string; name_de?: string; name_es?: string; name_fr?: string;
  types: string[]; maxPoints?: number; maxItemsPerCategory?: number; selected?: unknown[];
}
export interface OwbUnit {
  id: string; name_en: string; points?: number; minimum?: number; maximum?: number;
  command?: OwbOption[]; equipment?: OwbOption[]; armor?: OwbOption[]; options?: OwbOption[];
  mounts?: OwbOption[]; lores?: string[]; specialRules?: { name_en?: string };
  items?: OwbItemSection[];
  /** Per army-composition placement (from OWB): { <compId>: { category, notes } }. A unit's list
   *  category can differ per composition (e.g. State Troops are Core normally, Special for a knightly
   *  order), and a unit is only available in the compositions it lists. */
  armyComposition?: Record<string, { category?: Category; notes?: { name_en?: string } }>;
}
export type OwbArmy = Record<Category, OwbUnit[]>;

// ---- Army-composition (army-of-infamy) helpers -------------------------------------------------
// The chosen composition (list.composition) can move a unit to a different list category and can drop
// units entirely. These read the unit's `armyComposition` map; a unit without that map is treated as
// always available in its base category (defensive — keeps older/edge data working).
const compMap = (unit: OwbUnit): Record<string, { category?: Category; notes?: { name_en?: string } }> | null => {
  const ac = unit.armyComposition;
  return ac && typeof ac === 'object' && !Array.isArray(ac) && Object.keys(ac).length ? ac : null;
};
/** The unit's list category under `composition` (falls back to `base` when the map doesn't say). */
export function unitCategoryFor(unit: OwbUnit, composition: string, base: Category): Category {
  const c = compMap(unit)?.[composition]?.category;
  return c && (CATEGORIES as readonly string[]).includes(c) ? c : base;
}
/** Whether a unit may be fielded in `composition` (a mapped unit is only available where it's listed). */
export function unitAllowedIn(unit: OwbUnit, composition: string): boolean {
  const ac = compMap(unit);
  return !ac || !!ac[composition];
}
/** The composition's restriction note for a unit (e.g. "0-1 General per 1000 points"), if any. */
export function unitCompNote(unit: OwbUnit, composition: string): string | undefined {
  return compMap(unit)?.[composition]?.notes?.name_en || undefined;
}

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

// The FULL effective loadout of an entry — active base equipment + chosen upgrades + active sub-
// options + magic items — with comma-bundled catalogue labels split into individual wargear names.
// Unlike `summaryLabels` (which lists only non-default upgrades for a roster row), this mirrors what
// an OWB export lists, so the game can resolve each weapon's profile — including a unit's FREE base
// weapon (e.g. a Reaper Bolt Thrower's "Repeater bolt thrower", which is the `active` default and so
// is omitted by summaryLabels, leaving the game with no shooting profile).
export function loadoutLabels(unit: OwbUnit, entry: ListEntry, itemsData?: MagicItemsData): string[] {
  const labels: string[] = [];
  const add = (name?: string) => {
    if (!name) return;
    for (const part of name.split(',').map((s) => s.trim()).filter(Boolean)) if (!labels.includes(part)) labels.push(part);
  };
  for (const b of unitBlocks(unit)) {
    if (b.radio) {
      // single-choice group: the stored pick, else the free `active` default.
      const i = Number(radioSelected(unit, entry, b.key).split('/')[1]);
      add(b.items.find((it) => it.i === i)?.opt.name_en);
    } else {
      // toggles: every `active` base option plus any the player switched on.
      for (const { i, opt } of b.items) if (opt.active || entry.opts.includes(`${String(b.key)}/${i}`)) add(opt.name_en);
    }
  }
  for (const g of subOptionGroups(unit, entry)) for (const it of g.items) {
    if (!it.selected) continue;
    if (g.exclusive && it.opt.active) continue; // the implicit default — already covered by its parent
    add(it.opt.name_en);
  }
  if (itemsData) for (const it of selectedMagicItems(unit, entry, itemsData)) add(it.item.name_en);
  return labels;
}

// One chosen entry in the list. `opts` holds selected option keys "group/index".
// `lores`/`spells` (Wizards only) are the lore + spell choices made in the builder, carried into a
// game Army by builderListToArmy (so the in-game spell card is pre-filled).
export interface ListEntry { uid: string; cat: Category; unitId: string; count: number; opts: string[]; lores?: string[]; spells?: string[]; customName?: string }  // customName: campagne — named unit (veteranen-identiteit in De Grensvorsten)
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
  { id: 'combined-arms-grand-melee', name: 'Combined Arms + Grand Melee' },
  { id: 'battle-march', name: 'Battle March' },
];

// The slugs whose rulebook text explains each composition (the info eye opens these). The combined
// option shows BOTH rule pages, since its restrictions are the union of the two.
export const COMPOSITION_RULE_SLUGS: Record<string, string[]> = {
  'open-war': ['open-war'],
  'combined-arms': ['combined-arms'],
  'grand-melee': ['grand-melee'],
  'combined-arms-grand-melee': ['combined-arms', 'grand-melee'],
  // The `battle-march` rule page is just a stub; the list-building requirements live in "Mustering".
  'battle-march': ['mustering-a-battle-march'],
};

export function limitsFor(_rule: string): Record<Category, CatLimit> {
  // The category percentage limits come from the Grand Army composition list and are the same under
  // every composition rule. The rule-specific restrictions (Grand Melee's 25%-per-single-unit and
  // wizard-level caps, Combined Arms' per-unit counts, Battle March's caps) are applied in validate().
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

/** The Wizard level of an entry (0 = not a Wizard), read from its effective loadout — base options,
 *  radio picks/defaults and nested level sub-options (e.g. the "Level 4 Wizard" upgrade). Used by the
 *  Grand Melee wizard restrictions. */
export function wizardLevelOf(unit: OwbUnit, entry: ListEntry): number {
  let lvl = 0;
  const scan = (name?: string) => { const m = name && name.match(/Level\s*(\d)\s*Wizard/i); if (m) lvl = Math.max(lvl, Number(m[1])); };
  for (const b of unitBlocks(unit)) {
    if (b.radio) { const i = Number(radioSelected(unit, entry, b.key).split('/')[1]); scan(b.items.find((it) => it.i === i)?.opt.name_en); }
    else for (const { i, opt } of b.items) if (opt.active || entry.opts.includes(`${String(b.key)}/${i}`)) scan(opt.name_en);
  }
  for (const g of subOptionGroups(unit, entry)) for (const it of g.items) if (it.selected) scan(it.opt.name_en);
  return lvl;
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
export function validate(
  list: BuilderList,
  getUnit: (cat: Category, id: string) => OwbUnit | undefined,
  itemsData?: MagicItemsData,
  // Campagne-modifiers (De Grensvorsten). Weglaten ⇒ identiek aan de niet-campagne-validatie.
  // `pointsCap` vervangt de puntenbasis (fase-cap i.p.v. de vrij gekozen list.points). Dit is de
  // ENIGE mechanisch afgedwongen modifier; alle campagne-perks zijn tafel-regels.
  campaignMods?: { pointsCap?: number; namedUnits?: boolean },  // namedUnits: campagne — elke unit MOET een eigen naam hebben (veteranen-identiteit)
): Validation {
  const limits = limitsFor(list.rule);
  const target = campaignMods?.pointsCap ?? (list.points || 0);
  const byCategory = {} as Record<Category, CategoryTally>;
  for (const c of CATEGORIES) byCategory[c] = { points: 0, limit: limits[c], cap: null, floor: null, over: false, under: false };

  const warnings: string[] = [];
  let total = 0;
  // A unit's category for limits depends on the chosen army composition (army-of-infamy lists can
  // move it), so tally by its EFFECTIVE category, not the catalogue array it was added from.
  const rows: { e: ListEntry; unit: OwbUnit; p: number; level: number; cat: Category }[] = [];
  for (const e of list.entries) {
    const unit = getUnit(e.cat, e.unitId);
    if (!unit) continue;
    const p = entryPoints(unit, e, itemsData);
    const effCat = unitCategoryFor(unit, list.composition, e.cat);
    total += p;
    byCategory[effCat].points += p;
    rows.push({ e, unit, p, level: wizardLevelOf(unit, e), cat: effCat });
    const min = unit.minimum ?? 1;
    const max = unit.maximum ?? 0; // 0 = no max
    if (e.count < min) warnings.push(`${unit.name_en}: below minimum size (${min})`);
    if (max > 0 && e.count > max) warnings.push(`${unit.name_en}: above maximum size (${max})`);
    if (!unitAllowedIn(unit, list.composition)) warnings.push(`${unit.name_en}: not allowed in this army composition`);
    if (campaignMods?.namedUnits && !(e.customName ?? '').trim()) warnings.push(`${unit.name_en}: needs a unit name (campaign veterans follow the name)`);
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

  // ---- Composition-rule-specific restrictions (beyond the category % limits above) --------------
  const rule = list.rule;
  const hasGrandMelee = rule === 'grand-melee' || rule === 'combined-arms-grand-melee';
  const hasCombinedArms = rule === 'combined-arms' || rule === 'combined-arms-grand-melee';
  const isBattleMarch = rule === 'battle-march';

  // Grand Melee: a single character or unit may not exceed 25% of the army's points.
  if (hasGrandMelee && target > 0) {
    const cap25 = Math.floor(0.25 * target);
    for (const r of rows) if (r.p > cap25) warnings.push(`${r.unit.name_en} over the 25% single-unit cap (${r.p}/${cap25} pts)`);
  }

  // Grand Melee: 0-1 Level 3 Wizard per 1,000 pts; 0-1 Level 4 Wizard per 2,000 pts (named characters
  // are exempt, but the catalogue doesn't flag those, so this counts every Wizard of that level).
  if (hasGrandMelee && target > 0) {
    const l3 = rows.filter((r) => r.level === 3).reduce((n, r) => n + r.e.count, 0);
    const l4 = rows.filter((r) => r.level === 4).reduce((n, r) => n + r.e.count, 0);
    const maxL3 = Math.floor(target / 1000);
    const maxL4 = Math.floor(target / 2000);
    if (l3 > maxL3) warnings.push(`Level 3 Wizards: ${l3} taken, ${maxL3} allowed (0-1 per 1,000 pts)`);
    if (l4 > maxL4) warnings.push(`Level 4 Wizards: ${l4} taken, ${maxL4} allowed (0-1 per 2,000 pts)`);
  }

  // Combined Arms: a cap on how many of each unit type you may field (per datasheet) — 0-3 Characters,
  // 0-4 Core, 0-3 Special, 0-2 Rare/Mercenary, +1 per full 1,000 pts above 2,000. (Detachments and
  // named characters are exempt in the rules; we don't track those, so this counts every entry.)
  if (hasCombinedArms) {
    const extra = target > 2000 ? Math.floor((target - 2000) / 1000) : 0;
    const baseCap: Partial<Record<Category, number>> = { characters: 3, core: 4, special: 3, rare: 2, mercenaries: 2 };
    const perUnit = new Map<string, { unit: OwbUnit; cat: Category; n: number }>();
    for (const r of rows) {
      const key = `${r.e.cat}/${r.e.unitId}`;
      const cur = perUnit.get(key);
      if (cur) cur.n += 1; else perUnit.set(key, { unit: r.unit, cat: r.cat, n: 1 });
    }
    for (const { unit, cat, n } of perUnit.values()) {
      const base = baseCap[cat];
      if (base == null) continue;
      const capN = base + extra;
      if (n > capN) warnings.push(`${unit.name_en}: ${n} taken, Combined Arms allows 0-${capN} of this unit`);
    }
  }

  // Battle March (500-750 pts): at least two non-character units, and single-unit point caps.
  if (isBattleMarch) {
    const nonCharUnits = rows.filter((r) => r.cat !== 'characters').length;
    if (nonCharUnits < 2) warnings.push(`Battle March needs at least 2 non-character units (have ${nonCharUnits})`);
    if (target > 0) {
      const capPct: Partial<Record<Category, number>> = { characters: 25, core: 35, special: 30, rare: 25, mercenaries: 25 };
      for (const r of rows) {
        const pct = capPct[r.cat];
        if (pct == null) continue;
        const capPts = Math.floor((pct / 100) * target);
        if (r.p > capPts) warnings.push(`${r.unit.name_en} over the ${pct}% single-${r.cat === 'characters' ? 'character' : 'unit'} cap (${r.p}/${capPts} pts)`);
      }
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
  /** "Common" = a MULTI-TAKEABLE item: one that more than one model may carry (OWB prints these with
   *  a '*'; in the data they carry `stackable: true`). Any number of common items may be taken in a
   *  category, alongside one unique (one-per-army) item. NOT "from the general list" — most general
   *  items (e.g. Lore Familiar, Ogre Blade) are unique, not common. Set by itemPool. */
  common?: boolean;
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

// Friendly labels per magic-item `type`, so the list mirrors the rulebook's categories
// (Magic Weapons / Magic Armour / Talismans / …). Unknown types fall back to a title-cased slug.
const MAGIC_TYPE_LABEL: Record<string, string> = {
  weapon: 'Magic Weapons', armor: 'Magic Armour', 'armor-mages': 'Magic Armour',
  talisman: 'Talismans', 'enchanted-item': 'Enchanted Items', 'arcane-item': 'Arcane Items',
  banner: 'Magic Standards', 'gift-of-khaine': 'Gifts of Khaine', 'forbidden-poison': 'Forbidden Poisons',
  'weapon-runes': 'Weapon Runes', 'armor-runes': 'Armour Runes', 'talismanic-runes': 'Talismanic Runes',
  'banner-runes': 'Standard Runes', 'engineering-runes': 'Engineering Runes',
  'ranged-weapon-runes': 'Ranged Weapon Runes', 'runic-tattoos': 'Runic Tattoos',
};
export const magicTypeLabel = (type: string): string =>
  MAGIC_TYPE_LABEL[type] ?? type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// A magic-item category the UI renders as one collapsible group. A unit's "Magic Items" section is
// split into one category PER item type (Magic Weapons, Magic Armour, …) so the player may take one
// of each within the SHARED section budget (`budgetGroup`); a Rune section stays a single multi-pick
// category; and a Standard-bearer's magic-standard allowance becomes its own option-gated category.
export interface MagicCategory {
  id: string;            // stable id used in the `magic/<id>/<itemId>` key (the item type, usually)
  label: string;         // this group's heading, e.g. "Magic Weapons" / "Runes"
  groupLabel: string;    // the parent section's name (e.g. "Magic Items") — groups share one budget
  budgetGroup: string;   // categories sharing this id pool into one points budget
  types: string[];       // item `type`s this category accepts
  maxPoints: number | null; // the shared budget for this category's `budgetGroup`
  maxItems: number;      // how many items this category may hold (Infinity = points-limited multi-pick; Dwarf Runes = 3; a BSB banner = 1)
  items: MagicItem[];    // the items selectable in this category
}

// Flatten every item-list this army may use into a single pool (army.items → magic-items.json).
// `armyItemLists` is the army metadata's `items` array (e.g. ["general","dark-elves",…]).
// "Common" is decided PER ITEM, not per list: an item is common when it is multi-takeable — i.e. more
// than one model may carry it (OWB marks these with a '*'; the data flags them `stackable: true`).
// Unique items (one per army / one per category) are NOT common, even when they sit in the universal
// "general" list (e.g. Lore Familiar, Ogre Blade, Wand of Jet are all one-per-army, not common).
function itemPool(armyItemLists: string[], itemsData: MagicItemsData): MagicItem[] {
  const pool: MagicItem[] = [];
  for (const listId of armyItemLists) {
    for (const it of (itemsData[listId] ?? [])) if (it && it.type) pool.push({ ...it, common: !!it.stackable });
  }
  return pool;
}

/** The magic-item categories available to a unit, ready to render as collapsible groups.
 *  - Each `unit.items[]` section that allows several types is split into one category per type
 *    (Magic Weapons / Armour / Talismans / …), all sharing the section's points budget so the player
 *    may take one of each up to the total. A section with a per-section item cap (Dwarf Runes) stays
 *    a single multi-pick category.
 *  - Plus any option-unlocked allowance (e.g. a chosen Standard bearer's magic standard) — included
 *    only when `entry` is given AND that option is currently active. */
export function magicCategories(unit: OwbUnit, armyItemLists: string[], itemsData: MagicItemsData, entry?: ListEntry): MagicCategory[] {
  const pool = itemPool(armyItemLists, itemsData);
  const out: MagicCategory[] = [];
  const sections = Array.isArray(unit.items) ? unit.items : [];
  sections.forEach((sec, si) => {
    const types = Array.isArray(sec.types) ? sec.types : [];
    const maxPoints = typeof sec.maxPoints === 'number' ? sec.maxPoints : null;
    const group = `sec:${si}`;
    const capped = typeof sec.maxItemsPerCategory === 'number' && sec.maxItemsPerCategory > 0;
    if (capped) {
      // Runes etc. — one category, multi-pick up to the section cap, items across all its types.
      const items = pool.filter((it) => types.includes(it.type));
      if (items.length) out.push({ id: types[0] ?? slug(sec.name_en), label: sec.name_en, groupLabel: sec.name_en, budgetGroup: group, types, maxPoints, maxItems: sec.maxItemsPerCategory!, items });
      return;
    }
    // Normal magic items — one category per type, sharing the section's points budget. Each category
    // is a multi-pick (maxItems Infinity): you may take more than one item of the SAME type, limited
    // only by the shared points allowance — the OWB data only caps a section by points, not "one of
    // each type", so we don't either.
    for (const type of types) {
      const items = pool.filter((it) => it.type === type);
      if (!items.length) continue;
      out.push({ id: type, label: magicTypeLabel(type), groupLabel: sec.name_en, budgetGroup: group, types: [type], maxPoints, maxItems: Infinity, items });
    }
  });
  // Option-unlocked allowances (magic standards from a Standard bearer, …) — active options only.
  if (entry) {
    // The army's "magic standard" item type(s) — usually "banner", but Dwarfs inscribe runes on the
    // standard ("banner-runes"/Standard Runes). Used to fill in a Battle Standard Bearer's allowance
    // for army books whose BSB option is missing the explicit `magic` field in the data.
    const bannerTypes = [...new Set(pool.map((it) => it.type).filter((t) => /banner/i.test(t)))];
    for (const { key: g } of OPTION_GROUPS) {
      groupItems(unit, g).forEach((opt, idx) => {
        // Use the option's declared magic allowance; otherwise, a Battle Standard Bearer (a CHARACTER
        // upgrade — the only model that may carry a magic standard) always gets one, even when the
        // catalogue omits the field. Plain unit "Standard bearer"s without a field are NOT granted one.
        let magic = opt.magic;
        if ((!magic || !magic.types?.length) && /battle standard bearer/i.test(opt.name_en || '') && bannerTypes.length) {
          magic = { types: bannerTypes, maxPoints: 0 }; // 0 = no points limit
        }
        if (!magic || !Array.isArray(magic.types) || !magic.types.length) return;
        if (!parentActive(unit, entry, g, opt, idx)) return;
        const items = pool.filter((it) => magic!.types.includes(it.type));
        if (!items.length) return;
        // OWB encodes "no points limit" as maxPoints 0 (a BSB may take a magic standard of ANY value)
        // — treat that as unlimited (Infinity), not a 0 budget that would disable every option.
        const mp = magic.maxPoints;
        const cap = magic.maxItemsPerCategory; // e.g. a Dwarf BSB standard may bear up to 3 runes
        out.push({ id: magic.types[0], label: magicTypeLabel(magic.types[0]), groupLabel: magicTypeLabel(magic.types[0]), budgetGroup: `opt:${String(g)}:${idx}`, types: magic.types, maxPoints: typeof mp === 'number' && mp > 0 ? mp : Infinity, maxItems: typeof cap === 'number' && cap > 0 ? cap : 1, items });
      });
    }
  }
  return out;
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
  const cats = magicCategories(unit, armyItemLists ?? Object.keys(itemsData), itemsData, entry);
  if (cats.length === 0) return [];
  const out: { category: MagicCategory; item: MagicItem; key: string }[] = [];
  for (const { categoryId, itemId, key } of parsedMagicKeys(entry)) {
    // Prefer the category named in the key; else ANY category holding the item — so keys written
    // before the per-type split (stored under a section's first type) still resolve by item id.
    const category =
      cats.find((c) => c.id === categoryId && c.items.some((it) => magicItemId(it) === itemId)) ??
      cats.find((c) => c.items.some((it) => magicItemId(it) === itemId));
    if (!category) continue;
    const item = category.items.find((it) => magicItemId(it) === itemId)!;
    out.push({ category, item, key });
  }
  return out;
}

/** Points spent within a category's shared budget group — all per-type categories of one section
 *  (Magic Weapons + Armour + Talismans …) pool into a single allowance. */
export function magicGroupSpent(unit: OwbUnit, entry: ListEntry, budgetGroup: string, itemsData: MagicItemsData, armyItemLists?: string[]): number {
  return selectedMagicItems(unit, entry, itemsData, armyItemLists)
    .filter(({ category }) => category.budgetGroup === budgetGroup)
    .reduce((n, { item }) => n + (item.points ?? 0), 0);
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

/** The currently-selected item key in a category, or undefined (the FIRST pick in the category). */
export function selectedMagicItem(entry: ListEntry, categoryId: string): string | undefined {
  return parsedMagicKeys(entry).find((p) => p.categoryId === categoryId)?.key;
}

/** Every magic-item key stored on the entry in this category (multi-select aware, e.g. Dwarf Runes). */
export function selectedMagicKeys(entry: ListEntry, categoryId: string): string[] {
  return entry.opts.filter((k) => k.startsWith(`${MAGIC_PREFIX}/${categoryId}/`));
}

/** Pure toggle for a magic item. With `maxItems <= 1` (the default) the category is single-select:
 *  picking an item replaces any previous pick in that same category; picking the already-selected
 *  item clears it. With `maxItems > 1` (e.g. Dwarf Runes, up to 3) it is an additive toggle of THIS
 *  specific key only — present → removed, absent → appended — leaving the category's other picks
 *  untouched. Returns the new opts array (no mutation, mirroring the radio/toggle helpers). */
export function toggleMagicItem(entry: ListEntry, categoryId: string, item: MagicItem, maxItems = 1): string[] {
  const key = magicKey(categoryId, magicItemId(item));
  if (maxItems > 1) {
    return entry.opts.includes(key) ? entry.opts.filter((k) => k !== key) : [...entry.opts, key];
  }
  const already = selectedMagicItem(entry, categoryId);
  // Single-select: drop any existing pick in this category, then add the new one unless it was selected.
  const rest = entry.opts.filter((k) => !k.startsWith(`${MAGIC_PREFIX}/${categoryId}/`));
  return already === key ? rest : [...rest, key];
}

/** Would picking `item` in `categoryId` exceed the category's allowance? (For disabling options in
 *  the UI.) Returns true when adding the item would blow EITHER the points budget OR the per-category
 *  item-count cap (`maxItems`). Budget precedence: explicit `budget` arg → the category's data
 *  `maxPoints` → DEFAULT_MAGIC_BUDGET. Re-picking an already-selected item is never "over" (it's a
 *  no-op / deselect). For single-item categories `maxItems` is 1, matching the prior single-select. */
export function magicWouldExceed(
  unit: OwbUnit, entry: ListEntry, categoryId: string, item: MagicItem, itemsData: MagicItemsData,
  opts?: { budget?: number; armyItemLists?: string[] },
): boolean {
  const armyItemLists = opts?.armyItemLists;
  const cats = magicCategories(unit, armyItemLists ?? Object.keys(itemsData), itemsData, entry);
  const category = cats.find((c) => c.id === categoryId);
  const budget = opts?.budget ?? category?.maxPoints ?? DEFAULT_MAGIC_BUDGET;
  const maxItems = category?.maxItems ?? 1;
  const key = magicKey(categoryId, magicItemId(item));
  const selected = selectedMagicKeys(entry, categoryId);
  if (selected.includes(key)) return false; // re-pick = deselect (always allowed)
  // Per-category limit. Runes/banners use a plain count cap (finite maxItems). The normal magic-item
  // categories (maxItems Infinity) allow only ONE unique (one-per-army) item — but ANY number of
  // common (multi-takeable) items alongside it. So a fresh unique item is blocked once a unique item
  // is already chosen; common items are limited only by the shared points budget below.
  if (isFinite(maxItems)) {
    if (selected.length >= maxItems) return true;
  } else if (!item.common) {
    const hasArmyItem = selected.some((k) => {
      const id = k.split('/')[2];
      const it = category?.items.find((x) => magicItemId(x) === id);
      return !!it && !it.common;
    });
    if (hasArmyItem) return true;
  }
  // Points budget is SHARED across the category's budget group (all per-type categories of a section).
  const spent = category ? magicGroupSpent(unit, entry, category.budgetGroup, itemsData, armyItemLists) : 0;
  return spent + (item.points ?? 0) > budget;
}
