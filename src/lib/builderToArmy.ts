// Convert a saved Army-builder list (tow:lists) into the game's `Army` shape, so a player can
// pick one of their own lists in the Game tab instead of pasting an OWB export. The game stores
// the full Army object, so we build units (name, count, points, options, special rules, stat
// profiles) directly from the builder entries + the OWB catalogue.

import type { Army, ArmyUnit, UnitProfile } from '../types';
import { CATEGORIES, entryPoints, loadoutLabels, magicItemId, selectedMagicItems, selectedMountIndex, validate, type BuilderList, type Category, type OwbArmy, type OwbUnit, type MagicItemsData } from './owbBuilder';

/** Per-item flavour + rules text snapshot (public/owb/magic-item-text.json), keyed by item slug. */
export type MagicText = Record<string, { description?: string; body?: string }>;

/** Per-mount special-rules snapshot (public/owb/mount-text.json), keyed by normalised mount name. */
export type MountText = Record<string, { specialRules?: string[] }>;

// Normalise a mount/option name to the mount-text key (strip "(…)", "{…}", "*", a leading "2x ").
const normMount = (s: string) => (s || '').toLowerCase().replace(/ *\([^)]*\) */g, '').replace(/[{}[\]*]/g, '').replace(/^[0-9]+x /g, '').trim();

// A magic weapon mostly fires/strikes as the wielder's mundane weapon but adds special rules; the
// snapshot body is usually a clean "Rule, Rule, Rule" list (e.g. "Armour Bane (1), Magical Attacks").
// Prose ("Notes: …" or full sentences) is kept as a single line rather than chopped into fake chips.
const RANGED_WEAPON = /\bbow\b|crossbow|handbow|pistol|\bsling\b|throwing|thrown|shooting|\brange\b/i;
function magicWeaponRules(body?: string): string[] {
  const t = (body || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  if (/^notes\b/i.test(t) || /\.\s/.test(t)) return [t];
  return t.split(',').map((s) => s.trim()).filter(Boolean);
}

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
  opts: { faction?: string; composition?: string; itemsData?: MagicItemsData; armyItemLists?: string[]; magicText?: MagicText; mountText?: MountText } = {},
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
    // Selected magic weapons (item type "weapon") → surfaced as pickable loadout weapons in the game.
    const magicWeapons = opts.itemsData
      ? selectedMagicItems(u, e, opts.itemsData, opts.armyItemLists)
          .filter(({ item }) => /weapon/i.test(item.type || ''))
          .map(({ item }) => {
            const tx = opts.magicText?.[magicItemId(item)];
            const rules = magicWeaponRules(tx?.body);
            const kind: 'melee' | 'ranged' = RANGED_WEAPON.test(`${item.name_en} ${rules.join(' ')}`) ? 'ranged' : 'melee';
            return { name: item.name_en, kind, specialRules: rules, flavour: tx?.description || undefined };
          })
      : [];
    // Chosen mount → its own stat profile (statsFor) + special rules (mount-text), surfaced in-game.
    const mounts: ArmyUnit['mounts'] = [];
    const mIdx = selectedMountIndex(u, e);
    const mOpt = mIdx >= 0 && Array.isArray(u.mounts) ? u.mounts[mIdx] : undefined;
    if (mOpt?.name_en && !/^on foot$/i.test(mOpt.name_en)) {
      const nm = normMount(mOpt.name_en);
      const rows = statsFor(mOpt.name_en).length ? statsFor(mOpt.name_en) : statsFor(nm);
      const mProfiles: UnitProfile[] = rows.map((r) => ({ label: r.Name, stats: STAT_COLS.map((k) => ({ k, v: r[k] ?? '-' })) }));
      const mRules = opts.mountText?.[nm]?.specialRules ?? [];
      if (mProfiles.length || mRules.length) mounts.push({ name: mOpt.name_en, profiles: mProfiles, specialRules: mRules });
    }
    units.push({
      id: e.uid,
      name: u.name_en,
      count: multi ? e.count : null,
      points: entryPoints(u, e, opts.itemsData),
      category: CAT_LABEL[e.cat],
      // Full effective loadout (base weapons + upgrades + magic), so the game resolves shooting/melee
      // profiles the same way it does for a pasted OWB list — not just the non-default upgrades.
      options: loadoutLabels(u, e, opts.itemsData),
      specialRules,
      profiles,
      // Lore/spell choices made in the builder (Wizards) → carried into the game Army.
      lores: e.lores,
      spells: e.spells,
      magicWeapons: magicWeapons.length ? magicWeapons : undefined,
      mounts: mounts.length ? mounts : undefined,
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
