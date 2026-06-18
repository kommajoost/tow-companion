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

/** Build a name → troop-type-name lookup over a rules-index (normName → { troopType? }). Mirrors the
 *  stat lookup's plural→singular fallback (e.g. "Dark Elf Warriors" → "dark elf warrior"). */
export function makeTroopTypeLookup(statIdx: Record<string, { troopType?: string }> | null) {
  return (name: string): string | undefined => {
    if (!statIdx) return undefined;
    const key = norm(name);
    let e = statIdx[key];
    if (!e?.troopType) {
      const w = key.split(' ');
      const last = w[w.length - 1];
      if (/s$/.test(last)) e = statIdx[[...w.slice(0, -1), last.replace(/s$/, '')].join(' ')];
    }
    return troopTypeName(e?.troopType);
  };
}

/** Fill in each unit's troop type by name (for a pasted army — the OWB export doesn't carry it).
 *  Leaves units that already have a troopType untouched. */
export function enrichArmyTroopTypes(army: Army | null, troopTypeFor: (name: string) => string | undefined): Army | null {
  if (!army) return army;
  return { ...army, units: army.units.map((u) => (u.troopType ? u : { ...u, troopType: troopTypeFor(u.name) })) };
}
