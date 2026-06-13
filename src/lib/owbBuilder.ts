// Army-list builder logic (Stap 2 PoC, Dark Elves). Points totalling + composition validation,
// using the Old World Builder catalogue (public/owb/) and composition rules ported from OWB's
// src/utils/rules.js (CC BY 4.0). Underlying data © Games Workshop — unofficial personal-use aid.

export type Category = 'characters' | 'core' | 'special' | 'rare' | 'mercenaries' | 'allies';
export const CATEGORIES: Category[] = ['characters', 'core', 'special', 'rare', 'mercenaries', 'allies'];

export interface OwbOption { name_en: string; points?: number; perModel?: boolean }
export interface OwbUnit {
  id: string; name_en: string; points?: number; minimum?: number; maximum?: number;
  command?: OwbOption[]; equipment?: OwbOption[]; armor?: OwbOption[]; options?: OwbOption[];
  mounts?: OwbOption[]; lores?: OwbOption[]; specialRules?: { name_en?: string };
}
export type OwbArmy = Record<Category, OwbUnit[]>;

// The option groups a unit can spend points on (lores are free spell picks → omitted here).
export const OPTION_GROUPS: { key: keyof OwbUnit; label: string }[] = [
  { key: 'command', label: 'Command' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'armor', label: 'Armour' },
  { key: 'options', label: 'Options' },
  { key: 'mounts', label: 'Mounts' },
];

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

/** Points for one list entry: base (per model × count) + each selected option (× count if perModel). */
export function entryPoints(unit: OwbUnit, entry: ListEntry): number {
  let pts = (unit.points ?? 0) * entry.count;
  for (const { opt } of selectedOptions(unit, entry)) {
    pts += (opt.points ?? 0) * (opt.perModel ? entry.count : 1);
  }
  return pts;
}

export interface CategoryTally { points: number; limit: CatLimit; cap: number | null; floor: number | null; over: boolean; under: boolean }
export interface Validation {
  total: number;
  byCategory: Record<Category, CategoryTally>;
  warnings: string[];
}

// Tally points per category and check them against the composition's limits (percent of the points
// target) plus each unit's min/max model count.
export function validate(list: BuilderList, getUnit: (cat: Category, id: string) => OwbUnit | undefined): Validation {
  const limits = limitsFor(list.rule);
  const target = list.points || 0;
  const byCategory = {} as Record<Category, CategoryTally>;
  for (const c of CATEGORIES) byCategory[c] = { points: 0, limit: limits[c], cap: null, floor: null, over: false, under: false };

  const warnings: string[] = [];
  let total = 0;
  for (const e of list.entries) {
    const unit = getUnit(e.cat, e.unitId);
    if (!unit) continue;
    const p = entryPoints(unit, e);
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
