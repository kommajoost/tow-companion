// Troop type (e.g. Regular Infantry, Monstrous Cavalry, Behemoth) for a unit or mount. The codes
// live in public/owb/rules-index.json under each entry's `troopType` (e.g. "RI", "MCr"); this maps
// them to the rulebook's full names and resolves a code from a unit/mount name.

import type { Army } from '../types';

export const TROOP_TYPE_NAMES: Record<string, string> = {
  RI: 'Regular Infantry',
  HI: 'Heavy Infantry',
  MI: 'Monstrous Infantry',
  Sw: 'Swarm',
  LCa: 'Light Cavalry',
  HCa: 'Heavy Cavalry',
  MCa: 'Monstrous Cavalry',
  LCh: 'Light Chariot',
  HCh: 'Heavy Chariot',
  MCr: 'Monstrous Creature',
  Be: 'Behemoth',
  WB: 'War Beast',
  WM: 'War Machine',
  NChar: 'Character',
};

export const troopTypeName = (code?: string | null): string | undefined =>
  code ? (TROOP_TYPE_NAMES[code] ?? code) : undefined;

const norm = (s: string) =>
  (s || '').toLowerCase().replace(/ *\([^)]*\) */g, '').replace(/[{}[\]*]/g, '').replace(/^[0-9]+x /g, '').replace(/[“”]/g, '"').trim();

/** Build a name → rules-index-entry lookup, with the plural→singular fallback every lookup over this
 *  index needs ("Dark Elf Warriors" → "dark elf warrior"). `heeft` decides whether a hit counts, so a
 *  caller after `stats` is not satisfied by an entry that only has a `troopType` and vice versa. */
function makeEntryLookup<T extends object>(statIdx: Record<string, T> | null, heeft: (e: T) => boolean) {
  return (name: string): T | undefined => {
    if (!statIdx) return undefined;
    const key = norm(name);
    let e = statIdx[key];
    if (!e || !heeft(e)) {
      const w = key.split(' ');
      const last = w[w.length - 1];
      if (/s$/.test(last)) e = statIdx[[...w.slice(0, -1), last.replace(/s$/, '')].join(' ')] ?? e;
    }
    return e;
  };
}

/** Build a name → troop-type-name lookup over a rules-index (normName → { troopType? }). Mirrors the
 *  stat lookup's plural→singular fallback (e.g. "Dark Elf Warriors" → "dark elf warrior"). */
export function makeTroopTypeLookup(statIdx: Record<string, { troopType?: string }> | null) {
  const zoek = makeEntryLookup(statIdx, (e) => !!e.troopType);
  return (name: string): string | undefined => troopTypeName(zoek(name)?.troopType);
}

// ── Unit Strength ────────────────────────────────────────────────────────────────────────────────
// Officiële Troop Type Table (tow.whfb.app, rulebook p. 105), kolom "Unit Strength per Model".
// Niet uit het hoofd: overgenomen uit de gescrapete regels in public/rules.json (`troop-type-table-chart`).
const US_PER_MODEL: Record<string, number> = {
  'Regular Infantry': 1,
  'Heavy Infantry': 1,
  'Monstrous Infantry': 3,
  Swarm: 3,
  'Light Cavalry': 2,
  'Heavy Cavalry': 2,
  'Monstrous Cavalry': 3,
  'War Beast': 1,
  'Light Chariot': 3,
  'Heavy Chariot': 5,
};
/** Deze drie staan in de tabel als "As Starting Wounds" — hun US komt uit de statline, niet uit een
 *  vaste waarde. */
const US_UIT_WOUNDS = new Set(['Monstrous Creature', 'Behemoth', 'War Machine']);

/**
 * Build a (unitName, models) → Unit Strength lookup.
 *
 * Returns `null` when the troop type is unknown, or when it is one of the "As Starting Wounds" types
 * and the statline has no usable Wounds value. Null means UNKNOWN, never zero: callers that compare
 * US between two moments (Fresh Blood) must fall back to counting models rather than treat a missing
 * lookup as "no strength at all".
 */
export function makeUnitStrengthLookup(
  statIdx: Record<string, { troopType?: string; stats?: { W?: string }[] }> | null,
) {
  const zoek = makeEntryLookup(statIdx, (e) => !!e.troopType);
  return (name: string, models: number): number | null => {
    const e = zoek(name);
    const type = troopTypeName(e?.troopType);
    if (!type) return null;
    const per = US_PER_MODEL[type];
    if (per != null) return per * models;
    if (!US_UIT_WOUNDS.has(type)) return null;
    // "3" of "3*" of "D6" — alleen een echt getal telt; de rest is onbekend.
    const w = Number((e?.stats?.[0]?.W ?? '').replace(/[^0-9]/g, ''));
    return Number.isFinite(w) && w > 0 ? w * models : null;
  };
}

/** Fill in each unit's troop type by name (for a pasted army — the OWB export doesn't carry it).
 *  Leaves units that already have a troopType untouched. */
export function enrichArmyTroopTypes(army: Army | null, troopTypeFor: (name: string) => string | undefined): Army | null {
  if (!army) return army;
  return { ...army, units: army.units.map((u) => (u.troopType ? u : { ...u, troopType: troopTypeFor(u.name) })) };
}
