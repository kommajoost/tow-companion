// Convert a saved Army-builder list (tow:lists) into the game's `Army` shape, so a player can
// pick one of their own lists in the Game tab instead of pasting an OWB export. The game stores
// the full Army object, so we build units (name, count, points, options, special rules, stat
// profiles) directly from the builder entries + the OWB catalogue.

import type { Army, ArmyUnit, UnitProfile } from '../types';
import { CATEGORIES, campaignUnitId, entryPoints, loadoutLabels, magicItemId, selectedMagicItems, selectedMountIndex, selectedOptions, validate, type BuilderList, type Category, type OwbArmy, type OwbUnit, type MagicItemsData } from './owbBuilder';
import { applyMountStatModifiers, mountStatModifiers } from './mountModifiers';

/** Per-item flavour + rules text snapshot (public/owb/magic-item-text.json), keyed by item slug. */
export type MagicText = Record<string, {
  description?: string;
  body?: string;
  /** Het wapenprofiel van een magic weapon (15-08-2026). Stond wél op tow.whfb.app maar viel bij het
   *  scrapen stil weg: het zit daar in een `embedded-entry-block`, en die heeft geen tekst-kinderen,
   *  dus flatte hij naar niets. 125 items misten hierdoor hun Range/Strength/AP én hun special rules
   *  — Sword of Sorrow hield alleen z'n Notes-regel over. Meestal één profiel; een array omdat een
   *  item met meerdere standen er meer kan hebben. */
  profiel?: { naam?: string; range?: string; strength?: string; ap?: string; specialRules?: string }[];
}>;

/** Per-mount special-rules snapshot (public/owb/mount-text.json), keyed by normalised mount name. */
export type MountText = Record<string, {
  specialRules?: string[]; troopType?: string; baseSize?: string; armourValue?: string;
  equipment?: string[]; notes?: string[];
}>;

// Normalise a mount/option name to the mount-text key (strip "(…)", "{…}", "*", a leading "2x ").
const normMount = (s: string) => (s || '').toLowerCase().replace(/ *\([^)]*\) */g, '').replace(/[{}[\]*]/g, '').replace(/^[0-9]+x /g, '').trim();
const normMountProfile = (s: string) => (s || '').toLowerCase().replace(/\{[^}]*\}/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// A magic item's snapshot body is usually a clean "Rule, Rule, Rule" list (e.g. a weapon's
// "Armour Bane (1), Magical Attacks", a rune's effects). Prose ("Notes: …" or full sentences) is kept
// as a single line rather than chopped into fake rule chips.
const RANGED_WEAPON = /\bbow\b|crossbow|handbow|pistol|\bsling\b|throwing|thrown|shooting|\brange\b/i;
function magicItemRules(body?: string): string[] {
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
  opts: { faction?: string; composition?: string; overlayId?: string; itemsData?: MagicItemsData; armyItemLists?: string[]; magicText?: MagicText; mountText?: MountText; troopTypeFor?: (name: string) => string | undefined; factionNames?: string[] } = {},
): Army {
  // A shared datasheet (e.g. the War Hydra) bundles weapons for several armies, tagged like
  // "Serrated maws {renegade}" / "Fiery breath {dark elves}". Keep only the ones for THIS army:
  // drop a loadout label whose brace tag names a different faction (an army name, or "renegade").
  // Non-faction tags ({mount}, {weapon}, a unit name) are left alone.
  const normF = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const myFaction = normF(opts.faction || '');
  const factionSet = new Set([...(opts.factionNames || []).map(normF), 'renegade']);
  const keepLoadout = (label: string): boolean => {
    const m = label.match(/\{([^}]+)\}/);
    if (!m) return true;
    const tag = normF(m[1]);
    if (!tag || tag === myFaction || !factionSet.has(tag)) return true; // mine, or not a faction tag
    return false; // a different army's variant of a shared weapon → drop
  };
  const getUnit = getUnitFrom(catalogue);
  const units: ArmyUnit[] = [];
  for (const e of list.entries) {
    const u = getUnit(e.cat, e.unitId);
    if (!u) continue;
    const multi = (u.maximum ?? 1) !== 1 || (u.minimum ?? 1) > 1;
    // A unit's stat block includes its champion's row (e.g. Warriors → "Dark Elf Warrior" + "Lordling").
    // If the champion command upgrade isn't taken, drop that row so the game shows only profiles in play.
    const selectedOptNames = new Set(selectedOptions(u, e).map(({ opt }) => (opt.name_en || '').toLowerCase()));
    const droppedChampions = (Array.isArray(u.command) ? u.command : [])
      .filter((o) => /\(champion\)/i.test(o?.name_en || '') && !o.active && !selectedOptNames.has((o.name_en || '').toLowerCase()))
      .map((o) => (o.name_en || '').replace(/\s*\(champion\)\s*/i, '').trim().toLowerCase());
    const mIdx = selectedMountIndex(u, e);
    const mOpt = mIdx >= 0 && Array.isArray(u.mounts) ? u.mounts[mIdx] : undefined;
    const mRows = mOpt?.name_en && !/^on foot$/i.test(mOpt.name_en)
      ? (statsFor(mOpt.name_en).length ? statsFor(mOpt.name_en) : statsFor(normMount(mOpt.name_en)))
      : [];
    const mountModifiers = mountStatModifiers(mRows);
    const baseRows = statsFor(u.name_en)
      .filter((r) => !droppedChampions.includes((r.Name || '').toLowerCase()));
    const effectiveRows = applyMountStatModifiers(baseRows, mountModifiers);
    const mountName = mOpt?.name_en?.replace(/\s*\{[^}]*\}/g, '').trim();
    // mount-text sleutelt de factie plat in de sleutel ("cold one dark elves"), omdat dezelfde
    // mount per leger andere regels heeft. Een ingebakken profielrij heet kaal "Cold One" en vindt
    // zichzelf dus alleen mét die factienaam als extra kandidaat.
    const facKey = normMountProfile(opts.faction ?? '');
    const rijInfo = (naam: string): UnitProfile['info'] => {
      // "(x2)" is een AANTAL, geen deel van de naam: een strijdwagen noteert zijn twee trekdieren
      // als "Cold One (x2)" en dat vindt zichzelf nergens terug. Eraf voor het opzoeken.
      const basis = normMountProfile(naam.replace(/s*(xs*d+)s*$/i, ''));
      if (!basis) return undefined;
      const sleutels = [basis, `${basis} ${facKey}`, `${basis} renegade`];
      const tx = sleutels.map((k) => opts.mountText?.[k]).find(Boolean);
      const tt = tx?.troopType ?? sleutels.map((k) => opts.troopTypeFor?.(k)).find(Boolean);
      const det = [
        tx?.baseSize ? `Base size: ${tx.baseSize}` : null,
        tx?.armourValue ? `Armour value: ${tx.armourValue}` : null,
        ...(tx?.equipment ?? []).map((value) => `Equipment: ${value}`),
        ...(tx?.notes ?? []),
      ].filter((value): value is string => !!value);
      const regels = tx?.specialRules ?? [];
      // Niets eigens te tonen -> geen info, dus straks ook geen oogje.
      return (regels.length || tt || det.length) ? { specialRules: regels, troopType: tt, details: det } : undefined;
    };
    const profiles: UnitProfile[] = effectiveRows.map((r, rowIndex) => ({
      label: r.Name,
      ...(rowIndex > 0 ? { info: rijInfo(r.Name) } : {}),
      stats: STAT_COLS.map((k) => {
        const base = baseRows[rowIndex]?.[k] ?? '-';
        const value = r[k] ?? '-';
        const modified = value !== base;
        return { k, v: value, ...(modified ? { modified: true, base, source: mountName } : {}) };
      }),
    }));
    const specialRules = (u.specialRules?.name_en || '').split(',').map((s) => s.trim()).filter(Boolean);
    // Selected magic items (one pass). `magicItems` = ALL of them (weapons, armour, talismans,
    // enchanted/arcane items, runes, banners) → tappable terms on the unit card. `magicWeapons` =
    // just the weapons, also surfaced as pickable loadout weapons in CombatStats.
    const selMagic = opts.itemsData ? selectedMagicItems(u, e, opts.itemsData, opts.armyItemLists) : [];
    const magicItems = selMagic.map(({ item }) => {
      const tx = opts.magicText?.[magicItemId(item)];
      return { name: item.name_en, specialRules: magicItemRules(tx?.body), flavour: tx?.description || undefined };
    });
    const magicWeapons = selMagic
      .filter(({ item }) => /weapon/i.test(item.type || ''))
      .map(({ item }) => {
        const tx = opts.magicText?.[magicItemId(item)];
        const rules = magicItemRules(tx?.body);
        const kind: 'melee' | 'ranged' = RANGED_WEAPON.test(`${item.name_en} ${rules.join(' ')}`) ? 'ranged' : 'melee';
        return { name: item.name_en, kind, specialRules: rules, flavour: tx?.description || undefined };
      });
    // Chosen mount → its own stat profile (statsFor) + special rules (mount-text), surfaced in-game.
    const mounts: ArmyUnit['mounts'] = [];
    if (mOpt?.name_en && !/^on foot$/i.test(mOpt.name_en)) {
      const nm = normMount(mOpt.name_en);
      const profileKey = normMountProfile(mOpt.name_en);
      const mProfiles: UnitProfile[] = mRows.map((r) => ({ label: r.Name, stats: STAT_COLS.map((k) => ({ k, v: r[k] ?? '-' })) }));
      const text = opts.mountText?.[profileKey] ?? opts.mountText?.[nm] ?? {};
      const mRules = text.specialRules ?? [];
      const mType = text.troopType ?? opts.troopTypeFor?.(mOpt.name_en)
        ?? opts.troopTypeFor?.(profileKey) ?? opts.troopTypeFor?.(nm);
      const details = [
        text.baseSize ? `Base size: ${text.baseSize}` : null,
        text.armourValue ? `Armour value: ${text.armourValue}` : null,
        ...(text.equipment ?? []).map((value) => `Equipment: ${value}`),
        ...(text.notes ?? []),
      ].filter((value): value is string => !!value);
      if (mProfiles.length || mRules.length || details.length) {
        mounts.push({ name: mOpt.name_en, profiles: mProfiles, specialRules: mRules, troopType: mType, details });
      }
    }
    units.push({
      id: e.uid,
      // Campagne-match-id: de STABIELE sleutel uit campaignUnitId (= de builder-uid, met terugval op de
      // oude naam-slug/het type-id) — exact dezelfde afleiding als de campagne-kant, zodat de
      // veteraan-XP op de juiste campagne-unit landt. + custom-naam als display.
      campaignId: campaignUnitId(e),
      name: e.customName?.trim() || u.name_en,
      datasheet: u.name_en,
      count: multi ? e.count : null,
      points: entryPoints(u, e, opts.itemsData),
      category: CAT_LABEL[e.cat],
      troopType: opts.troopTypeFor?.(u.name_en),
      // Full effective loadout (base weapons + upgrades + magic), so the game resolves shooting/melee
      // profiles the same way it does for a pasted OWB list — not just the non-default upgrades.
      options: loadoutLabels(u, e, opts.itemsData).filter(keepLoadout),
      specialRules,
      profiles,
      // Lore/spell choices made in the builder (Wizards) → carried into the game Army.
      lores: e.lores,
      spells: e.spells,
      magicWeapons: magicWeapons.length ? magicWeapons : undefined,
      magicItems: magicItems.length ? magicItems : undefined,
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
    overlayId: opts.overlayId,
    units,
    raw: '',
  };
}

const catOf = (label: string): Category => {
  const k = label.toLowerCase() as Category;
  return (CATEGORIES as readonly string[]).includes(k) ? (k as Category) : 'core';
};
