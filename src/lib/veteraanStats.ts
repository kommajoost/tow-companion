// Veteraan-abilities in de statline (08-10-2026, Joost: "als een unit +Ld krijgt, moet dat verwerkt en
// te zien zijn tijdens een battle, met een gekleurd cijfer").
//
// Tot vandaag was een veteran ability alleen een chip ("Grizzled Veteran") naast de unit; de statline
// en de gevechtshulp rekenden met de basiswaarde. Nu verwerken we de twee abilities die een
// characteristic permanent veranderen (officiële Path to Glory-tabellen, AJ: The Razing of Westerland
// p.24-25, zie site/src/data/progressie.ts):
//   - grizzled       Grizzled Veteran(s): +1 Leadership, max 10
//   - weapon_master  Weapon Master(s): +1 WS of BS, de keuze van de speler ('ws' | 'bs'), max 10
// The Spoils of War (+1 AP op één wapen) en Fighting Formation (+1 maximale rank bonus) zitten niet in
// de statline; die blijven een chip met de effecttekst.
//
// Welke rijen: alleen modellen met een NUMERIEKE Leadership. Dat zijn de unit-modellen zelf (en hun
// champion of crew); een mount of steed in dezelfde unit heeft Ld '-' en krijgt dus niets. Een
// waarde die geen getal is ('-', '3+', '(+1)') blijft altijd ongemoeid.
//
// HOUD GELIJK met site/src/lib/veteraanStats.ts (kopie voor het battle-overzicht op de campagnesite).

export interface VeteraanAbility { t: string; keuze?: string | null }
export interface StatCel { k: string; v: string; modified?: boolean; base?: string; source?: string }

const MAX = 10;
const NAAM: Record<string, string> = { grizzled: 'Grizzled Veteran', weapon_master: 'Weapon Master' };

/** Welke characteristic een ability verhoogt (hoofdletterongevoelig: 'LD' = 'Ld'). Null = geen statline-effect. */
function doelVan(a: VeteraanAbility): string | null {
  if (a.t === 'grizzled') return 'ld';
  if (a.t === 'weapon_master') {
    const k = String(a.keuze ?? '').trim().toLowerCase();
    return k === 'ws' || k === 'bs' ? k : null; // nog geen keuze gemaakt: niets raden
  }
  return null;
}

/** Per characteristic (kleine letters): hoeveel erbij en waar het vandaan komt. */
export function veteraanBonussen(abilities: VeteraanAbility[] | undefined | null): Record<string, { n: number; bron: string[] }> {
  const uit: Record<string, { n: number; bron: string[] }> = {};
  for (const a of abilities ?? []) {
    const doel = a && typeof a.t === 'string' ? doelVan(a) : null;
    if (!doel) continue;
    const b = (uit[doel] ??= { n: 0, bron: [] });
    b.n += 1;
    b.bron.push(NAAM[a.t] ?? a.t);
  }
  return uit;
}

/** Eén profielrij met de veteraan-bonussen erin. `modified`/`base`/`source` zijn dezelfde velden die de
 *  mount-bonus al gebruikt, dus de bestaande gouden weergave in UnitCard/CombatStats pakt het vanzelf op.
 *  Idempotent als je hem op de BASISrij toepast; pas hem nooit twee keer toe op dezelfde rij. */
export function pasVeteraanToe<T extends StatCel>(stats: T[], abilities: VeteraanAbility[] | undefined | null): T[] {
  const bonus = veteraanBonussen(abilities);
  if (!Object.keys(bonus).length) return stats;
  const ld = stats.find((s) => s.k.toLowerCase() === 'ld');
  if (!ld || !/^\d+$/.test(String(ld.v).trim())) return stats; // mount/steed: geen eigen Ld
  return stats.map((s) => {
    const b = bonus[s.k.toLowerCase()];
    const huidig = String(s.v).trim();
    if (!b || !/^\d+$/.test(huidig)) return s;
    const nieuw = Math.min(MAX, Number(huidig) + b.n);
    if (nieuw === Number(huidig)) return s; // al op het maximum
    const bron = b.bron.join(' + ');
    return { ...s, v: String(nieuw), modified: true, base: s.base ?? huidig, source: s.source ? `${s.source} + ${bron}` : bron };
  });
}

/** Alle profielrijen van een unit. */
export function profielenMetVeteraan<P extends { stats: StatCel[] }>(profiles: P[], abilities: VeteraanAbility[] | undefined | null): P[] {
  if (!abilities?.length) return profiles;
  return profiles.map((p) => ({ ...p, stats: pasVeteraanToe(p.stats, abilities) }));
}

/** Weergave van een gewijzigde cel: hoeveel verschilt hij van de basis (null = geen getal of geen basis).
 *  Positief = beter (groen met "+1"), negatief = slechter (rood). Voor UnitCard en CombatStats. */
export function celDelta(c: { v: string; modified?: boolean; base?: string }): number | null {
  if (!c.modified || c.base == null) return null;
  const a = Number(String(c.v).trim()), b = Number(String(c.base).trim());
  return Number.isFinite(a) && Number.isFinite(b) && a !== b ? a - b : null;
}
export const BETER_KLEUR = 'var(--tow-beter)';
export const BETER_ACHTERGROND = 'var(--tow-beter-bg)';
