// WELK MODEL DRAAGT WELK WAPEN? (22-11-2026)
//
// Een unit heeft één platte lijst `options` ("Wicked claws; Serrated maws; Fiery breath; Hand weapons;
// Whips") over meerdere profielrijen ("War Hydra", "Beastmaster Handlers (x2)"). Joost: "Nu lijkt het
// alsof de Beast handlers ook met de claws vechten". De wiki schrijft de uitrusting PER MODEL; die regels
// staan verbatim in public/unit-details.json (scripts/sync-unit-details.mjs).
//
// Dit bestand is PUUR (geen fetch, geen React): de rekenkern (mathhammer.ts) en de tests gebruiken het.
// Laden + hook: useUnitDetails.ts.
//
// Niets eigen: een rij die bij geen enkele regel past krijgt null (= onbekend, het oude gedrag).

import type { ArmyUnit } from '../types';
import type { WeaponProfile } from './weaponStats';
import { statSleutels } from './statSleutel';

/** Eén regel van de wiki: "War Hydra: Wicked claws, …" → { model: 'War Hydra', line: 'Wicked claws, …' }. */
export interface EquipmentLine { model: string | null; line: string }
export type UnitDetails = Record<string, { equipment: EquipmentLine[] }>;
export interface UnitDetailsFile { source: string; scrapedAt: string; units: UnitDetails }

const plat = (s: string) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
/** "Beastmaster Handlers (x2)" → ['beastmaster', 'handlers']: no "(x2)", no "{tag}". */
const woorden = (s: string) => plat(String(s || '').replace(/\([^)]*\)/g, ' ').replace(/\{[^}]*\}/g, ' ')).split(' ').filter(Boolean);
/** The singular forms a word may stand for: "handlers" → handler, "wolves" → wolf, "yeomen" → yeoman,
 *  "flies" → fly, "boyz" → boy. Two words are the same when their forms overlap. */
function vormen(w: string): string[] {
  const uit = [w];
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) uit.push(w.slice(0, -1));
  if (w.length > 4 && w.endsWith('es')) uit.push(w.slice(0, -2));
  if (w.length > 4 && w.endsWith('ies')) uit.push(`${w.slice(0, -3)}y`);
  if (w.length > 4 && w.endsWith('ves')) uit.push(`${w.slice(0, -3)}f`, `${w.slice(0, -3)}fe`);
  if (w.length > 4 && w.endsWith('men')) uit.push(`${w.slice(0, -3)}man`);
  if (w.length > 3 && w.endsWith('yz')) uit.push(w.slice(0, -1));
  return uit;
}
const zelfde = (a: string, b: string) => { const vb = vormen(b); return vormen(a).some((x) => vb.includes(x)); };
/** At most one letter added, dropped or changed: the wiki's own spelling slips ("Characian Lions" for
 *  the "Chracian Lion" row, "Elyrian Reavers" for "Ellyrian Reaver"). Long words only. */
function bijna(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 6 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const ra = a.slice(i), rb = b.slice(i);
  return ra.slice(1) === rb.slice(1) || ra.slice(1) === rb || ra === rb.slice(1);
}
/** Same idea as ListBuilder's `modelSleutel` for mount equipment lines (words without a plural s). */
export const modelSleutel = (s: string) => woorden(s).map((w) => vormen(w)[vormen(w).length > 1 ? 1 : 0]).join(' ');

const reeksGelijk = (a: string[], b: string[]) => a.length === b.length && a.every((w, i) => zelfde(w, b[i]));
/** Is `naald` a run of words inside `hooi` (word by word, plural-insensitive)? */
const bevat = (hooi: string[], naald: string[], waar: 'overal' | 'rand' = 'overal') => {
  if (!naald.length || naald.length > hooi.length) return false;
  const starts = waar === 'rand' ? [0, hooi.length - naald.length] : Array.from({ length: hooi.length - naald.length + 1 }, (_, i) => i);
  return starts.some((s) => naald.every((w, j) => zelfde(hooi[s + j], w)));
};

/** The equipment lines of this unit, or null when unit-details.json does not know it. */
export function equipmentVoor(unit: Pick<ArmyUnit, 'name' | 'datasheet' | 'statNaam'>, details: UnitDetails | null | undefined, factie?: string): EquipmentLine[] | null {
  if (!details) return null;
  const naam = unit.statNaam ?? unit.datasheet ?? unit.name;
  const k = statSleutels(naam, details, factie).find((x) => details[x]?.equipment?.length);
  return k ? details[k].equipment : null;
}

/**
 * Per profile row: the wiki line of the model in that row, or null (unknown).
 *  1. the model name in the line equals the row label, plural/singular and "(x2)" ignored;
 *  2. a line left over that names exactly ONE row still without a line, by being the start or the end of
 *     its label ("Knights" → "Empire Knight", "Settra" → "Settra the Imperishable", "Warhorses" →
 *     "Barded Warhorse (x2)") or by a one-letter spelling slip ("Characian Lions" → "Chracian Lion");
 *  3. a wielder row that matches nothing (a champion: "Dread Knight" in Cold One Knights) shares the line
 *     of the nearest wielder row ABOVE it that did match (the rank and file).
 *  A line without a model prefix only counts when the unit has a single line and a single row.
 */
export function rijUitrusting(rows: { label: string; wielder: boolean }[], equipment: EquipmentLine[] | null | undefined): (EquipmentLine | null)[] {
  if (!equipment?.length) return rows.map(() => null);
  const rw = rows.map((r) => woorden(r.label));
  const uit: (EquipmentLine | null)[] = rows.map((_, i) => equipment.find((e) => (e.model
    ? reeksGelijk(woorden(e.model), rw[i])
    : equipment.length === 1 && rows.length === 1)) ?? null);
  for (const e of equipment) {
    if (!e.model || uit.includes(e)) continue;
    const ew = woorden(e.model);
    const kand = rows.map((_, i) => i).filter((i) => !uit[i] && (
      bevat(rw[i], ew, 'rand')
      || (ew.length === rw[i].length && ew.every((w, j) => zelfde(w, rw[i][j]) || vormen(w).some((x) => vormen(rw[i][j]).some((y) => bijna(x, y)))))
    ));
    if (kand.length === 1) uit[kand[0]] = e;
  }
  // A unit of two kinds of rank and file (a Skeleton Cavalry Cohort: horsemen AND horse archers) does not
  // say whose champion the third wielder row is → it stays unknown.
  const wielderRegels = new Set(rows.flatMap((r, i) => (r.wielder && uit[i] ? [uit[i]] : [])));
  if (wielderRegels.size > 1) return uit;
  rows.forEach((r, i) => {
    if (uit[i] || !r.wielder) return;
    for (let j = i - 1; j >= 0; j--) {
      if (!rows[j].wielder) continue;
      if (uit[j]) { uit[i] = uit[j]; break; }
    }
  });
  return uit;
}

/** What one row may fight / shoot with. `hand`: the line names hand weapons (or "counts as a hand weapon"). */
export interface RijWapens { melee: WeaponProfile[]; ranged: WeaponProfile[]; hand: boolean }

/** Does the weapon's name appear in the line (plural-insensitive)? */
export function wapenInRegel(w: WeaponProfile, line: string): boolean {
  const l = woorden(line);
  // The synthesised "Two hand weapons" (weaponStats.unitWeapons) is written "additional hand weapon(s)".
  if (w.slug === 'two-hand-weapons-additional-hand-weapon') return bevat(l, woorden('additional hand weapon')) || bevat(l, woorden('two hand weapons'));
  return bevat(l, woorden(w.name));
}

/**
 * The weapons of each profile row, from its wiki line. Weapons the player has that are in NO line (an
 * upgrade, a Renegade-only weapon, a magic weapon) belong to the unit's main model: the first wielder row,
 * and the rows that share its line (its champion). null for a row = unknown (old behaviour); every row null
 * when the unit has no per-model data at all.
 */
export function wapensPerRij(
  rows: { label: string; wielder: boolean }[],
  equipment: EquipmentLine[] | null | undefined,
  wapens: { melee: WeaponProfile[]; ranged: WeaponProfile[] },
): (RijWapens | null)[] {
  const regels = rijUitrusting(rows, equipment);
  if (!regels.some(Boolean)) return rows.map(() => null);
  const alle = [...wapens.melee, ...wapens.ranged];
  const inEenRegel = new Set(alle.filter((w) => (equipment ?? []).some((e) => wapenInRegel(w, e.line))).map((w) => w.slug));
  const hoofd = rows.findIndex((r) => r.wielder);
  const hoofdRegel = hoofd >= 0 ? regels[hoofd] : null;
  return rows.map((r, i) => {
    const e = regels[i];
    if (!e) return null;
    const eigen = (w: WeaponProfile) => wapenInRegel(w, e.line) || (!inEenRegel.has(w.slug) && r.wielder && (i === hoofd || (!!hoofdRegel && e === hoofdRegel)));
    return {
      melee: wapens.melee.filter(eigen),
      ranged: wapens.ranged.filter(eigen),
      hand: /\bhand weapons?\b/i.test(e.line),
    };
  });
}

const isGewoonHandwapen = (w: WeaponProfile) => /^hand weapons?$/i.test(w.name);

/**
 * The melee weapon a row fights with: the chosen one if the row carries it, else the row's own default
 * (CombatStats' rule: the first weapon that is not the plain hand weapon, else the hand weapon). null =
 * no profile weapon (the plain hand weapon / natural attacks).
 */
export function rijMeleeWapen(rw: RijWapens, gekozen?: WeaponProfile | null): WeaponProfile | null {
  if (gekozen && rw.melee.some((w) => w.slug === gekozen.slug)) return gekozen;
  return rw.melee.find((w) => !isGewoonHandwapen(w)) ?? rw.melee[0] ?? null;
}
