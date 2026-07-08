// Victory Points — Warhammer: The Old World, "Warhammer Battles" systeem (kernrulebook p.286).
// Bron (letterlijk, tow.whfb.app — NIETS hier is verzonnen; elk getal komt van de wiki):
//   Dead or Fled  https://tow.whfb.app/warhammer-battles/dead-or-fled-warhammer-battles
//     - vijandelijke unit vernietigd of van tafel gevlucht → 100% van de punten
//     - vijandelijke unit nog aan het vluchten bij einde spel → 50% (naar boven afgerond)
//     - vijandelijke unit terug tot ≤25% van start-Unit Strength (of start-Wounds) → 50% (naar boven)
//   The King is Dead  https://tow.whfb.app/warhammer-battles/the-king-is-dead-warhammer-battles
//     - vijandelijke General dood/van-tafel/vluchtend → +100 VP
//   Trophies of War  https://tow.whfb.app/warhammer-battles/trophies-of-war-warhammer-battles
//     - elke buitgemaakte vijandelijke standaard → +50 VP
//     - vijandelijke Battle Standard Bearer dood/van-tafel/vluchtend → +50 VP
//   Scenario Objectives / Special Features → PER SCENARIO gedefinieerd (geen algemeen getal) →
//     handmatig `objectiveVp` (de app verzint hier niks, de speler vult het gescoorde in).
//   Uitslag  https://tow.whfb.app/warhammer-battles/victory-points-warhammer-battles
//     - VP-verschil < 100 → Draw ; ≥100 meer → Victory ; winnaar ≥ 2× de verliezer → Crushing Victory.
import type { Army, ArmyUnit, GameTracker } from '../types';
import { unitTotalStrength } from './armyRules';

/** Per-kant handmatige bonussen — de categorieën die de app niet uit de casualty-tracker kan afleiden. */
export interface VpBonus {
  generalDown?: boolean; // vijandelijke General dood/gevlucht/vluchtend → +100
  bsbDown?: boolean;     // vijandelijke Battle Standard Bearer idem → +50
  standaards?: number;   // aantal buitgemaakte vijandelijke standaards → +50 elk
  objectiveVp?: number;  // handmatig: scenario-/secondary-objective-VP (per scenario gedefinieerd)
}

/** De per-unit toestand die de VP-engine nodig heeft (subset van UnitTrack). */
export interface VpUnitTrack {
  lost?: number;    // wonden/casualties op de unit (0..unitTotalStrength)
  fleeing?: boolean; // vluchtend op dit moment (telt als 50% als het bij einde spel nog zo is)
  weg?: boolean;    // vernietigd of van tafel gevlucht (volledig verwijderd) → 100%
}

export type Uitslag = 'draw' | 'victory' | 'crushing';

export interface VpResultaat {
  hostVp: number;
  guestVp: number;
  verschil: number;
  winnaar: 'host' | 'guest' | null; // null bij draw
  uitslag: Uitslag;
}

/** De VP die de VIJAND scoort voor één unit, o.b.v. z'n Dead-or-Fled-toestand. */
export function unitVp(u: ArmyUnit, track: VpUnitTrack | undefined): number {
  const punten = u.points ?? 0;
  if (punten <= 0) return 0;
  const ts = unitTotalStrength(u); // = modellen × wounds-per-model
  const lost = Math.max(0, track?.lost ?? 0);
  const remaining = ts - lost;
  if (track?.weg || remaining <= 0) return punten;         // vernietigd / van tafel → 100%
  if (track?.fleeing) return Math.ceil(punten / 2);        // vluchtend bij einde → 50% (naar boven)
  if (remaining <= ts * 0.25) return Math.ceil(punten / 2); // ≤25% van start-strength → 50% (naar boven)
  return 0;
}

/** Totale kill-VP die de vijand scoort tegen `leger`. seat = wiens units dit zijn ('host'/'guest'). */
export function killVp(leger: Army | null, seat: string, tracker: GameTracker | null): number {
  if (!leger) return 0;
  let vp = 0;
  for (const u of leger.units) vp += unitVp(u, tracker?.units?.[`${seat}:${u.id}`] as VpUnitTrack | undefined);
  return vp;
}

const bonusVp = (b: VpBonus): number =>
  (b.generalDown ? 100 : 0) + (b.bsbDown ? 50 : 0) + Math.max(0, b.standaards ?? 0) * 50 + Math.max(0, Math.round(b.objectiveVp ?? 0));

/** Volledige VP-stand + uitslag. host-VP = kill-VP tegen het guest-leger + host-bonussen (wat host
 *  scoort), en vice versa. */
export function berekenVictory(
  hostArmy: Army | null,
  guestArmy: Army | null,
  tracker: GameTracker | null,
  hostBonus: VpBonus = {},
  guestBonus: VpBonus = {},
): VpResultaat {
  const hostVp = killVp(guestArmy, 'guest', tracker) + bonusVp(hostBonus);
  const guestVp = killVp(hostArmy, 'host', tracker) + bonusVp(guestBonus);
  const verschil = Math.abs(hostVp - guestVp);
  let winnaar: 'host' | 'guest' | null = null;
  let uitslag: Uitslag = 'draw';
  if (verschil >= 100) {
    winnaar = hostVp > guestVp ? 'host' : 'guest';
    const win = Math.max(hostVp, guestVp);
    const verl = Math.min(hostVp, guestVp);
    uitslag = win >= 2 * verl ? 'crushing' : 'victory'; // "twice as many VP" → crushing
  }
  return { hostVp, guestVp, verschil, winnaar, uitslag };
}
