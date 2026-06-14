// Convert a saved Army-builder list (tow:lists) into the game's `Army` shape, so a player can
// pick one of their own lists in the Game tab instead of pasting an OWB export. The game stores
// the full Army object, so we build units (name, count, points, options, special rules, stat
// profiles) directly from the builder entries + the OWB catalogue.

import type { Army, ArmyUnit, UnitProfile } from '../types';
import { CATEGORIES, entryPoints, summaryLabels, validate, type BuilderList, type Category, type OwbArmy, type OwbUnit, type MagicItemsData } from './owbBuilder';

const CAT_LABEL: Record<Category, string> = {
  characters: 'Characters', core: 'Core', special: 'Special', rare: 'Rare', mercenaries: 'Mercenaries', allies: 'Allies',
};
const STAT_COLS = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld'] as const;
export type StatRow = { Name: string } & Record<(typeof STAT_COLS)[number], string>;

/** A saved builder list = a BuilderList plus its name/faction. */
export interface NamedBuilderList extends BuilderList { name: string; army?: string }

const getUnitFrom = (catalogue: OwbArmy) => (cat: Category, id: string): OwbUnit | undefined =>
  catalogue[cat]?.find((u) => u.id === id);

/** Total points of a saved list (for the picker chips). */
export function listTotal(list: BuilderList, catalogue: OwbArmy, itemsData?: MagicItemsData): number {
  return validate(list, getUnitFrom(catalogue), itemsData).total;
}

export function builderListToArmy(
  list: NamedBuilderList,
  catalogue: OwbArmy,
  statsFor: (name: string) => StatRow[],
  opts: { faction?: string; composition?: string; itemsData?: MagicItemsData; armyItemLists?: string[] } = {},
): Army {
  const getUnit = getUnitFrom(catalogue);
  const units: ArmyUnit[] = [];
  for (const e of list.entries) {
    const u = getUnit(e.cat, e.unitId);
    if (!u) continue;
    const multi = (u.maximum ?? 1) !== 1 || (u.minimum ?? 1) > 1;
    const profiles: UnitProfile[] = statsFor(u.name_en).map((r) => ({
      label: r.Name, stats: STAT_COLS.map((k) => ({ k, v: r[k] ?? '-' })),
    }));
    const specialRules = (u.specialRules?.name_en || '').split(',').map((s) => s.trim()).filter(Boolean);
    units.push({
      id: e.uid,
      name: u.name_en,
      count: multi ? e.count : null,
      points: entryPoints(u, e, opts.itemsData),
      category: CAT_LABEL[e.cat],
      options: summaryLabels(u, e, opts.itemsData),
      specialRules,
      profiles,
    });
  }
  // Keep roster order grouped by category, mirroring the builder.
  units.sort((a, b) => CATEGORIES.indexOf(catOf(a.category)) - CATEGORIES.indexOf(catOf(b.category)));
  return {
    name: list.name || 'My army',
    points: validate(list, getUnit, opts.itemsData).total,
    system: 'Warhammer: The Old World',
    faction: opts.faction || 'Dark Elves',
    composition: opts.composition || list.composition,
    units,
    raw: '',
  };
}

const catOf = (label: string): Category => {
  const k = label.toLowerCase() as Category;
  return (CATEGORIES as readonly string[]).includes(k) ? (k as Category) : 'core';
};
