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
//
// BATTLE MARCH (21-08-2026) — het kleine-spel-format, General's Companion p.27:
//   https://tow.whfb.app/battle-march/victory-points-battle-march
//     - The King is Dead → +50 (i.p.v. 100) ; Trophies of War → +25 per standaard EN +25 voor de BSB
//       (i.p.v. 50/50) ; Dead or Fled ONGEWIJZIGD.
//     - Twee eigen posten die het gewone formaat niet heeft: Treasure Troves (+10 VP per trove, aan het
//       eind van elke speler-turn) en Strategic Landmarks (+25 VP per speler-turn) → die lopen via
//       `objectives` (zie objectiveVp.ts, sleutels bm-troves/bm-landmark).
//     - De WIN-DREMPELS zijn NIET anders: /battle-march heeft geen eigen marge-pagina en linkt terug
//       naar de gewone uitslag-regel. 100 meer = victory, 2× = crushing, in beide formaten.
import type { Army, ArmyUnit, GameTracker } from '../types';
import { unitTotalStrength } from './armyRules';

/** Per-kant handmatige bonussen — de categorieën die de app niet uit de casualty-tracker kan afleiden. */
export interface VpBonus {
  generalDown?: boolean; // vijandelijke General dood/gevlucht/vluchtend → +100 (Battle March: +50)
  bsbDown?: boolean;     // vijandelijke Battle Standard Bearer idem → +50 (Battle March: +25)
  standaards?: number;   // aantal buitgemaakte vijandelijke standaards → +50 elk (Battle March: +25)
  objectiveVp?: number;  // handmatig vrij veld: overige/onbekende objective-VP
  /** Gestructureerde objective-VP per scenario/secondary (optie B): sleutel → gescoorde VP.
   *  Sleutels + bedragen komen uit OBJECTIVE_VP (objectiveVp.ts, letterlijk van tow.whfb.app). */
  objectives?: Record<string, number>;
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

/** De bedragen van de drie handmatige kill-bonussen. Battle March halveert ze (zie VP_SCHAAL_*), dus
 *  ze staan hier als tabel in plaats van hard in de formule — anders liegt de app zodra er in een
 *  ander formaat gespeeld wordt. `Dead or Fled` (unitVp) is in BEIDE formaten gelijk. */
export interface VpSchaal {
  general: number;   // The King is Dead — vijandelijke General dood/gevlucht/vluchtend
  bsb: number;       // vijandelijke Battle Standard Bearer idem
  standaard: number; // per buitgemaakte vijandelijke standaard
}

/** Warhammer Battles (het gewone formaat) — kernrulebook p.286 / tow.whfb.app/warhammer-battles. */
export const VP_SCHAAL_STANDAARD: VpSchaal = { general: 100, bsb: 50, standaard: 50 };
/** Battle March (klein formaat) — General's Companion p.27 / tow.whfb.app/battle-march/victory-points-
 *  battle-march: "Battle March armies are seldom led by mighty heroes", dus alle drie de bonussen zijn
 *  gehalveerd. De WIN-DREMPELS zijn NIET anders (zie berekenVictory). */
export const VP_SCHAAL_BATTLE_MARCH: VpSchaal = { general: 50, bsb: 25, standaard: 25 };

/** De actieve schaal bij deze game-modus. */
export const vpSchaal = (battleMarch?: boolean | null): VpSchaal =>
  (battleMarch ? VP_SCHAAL_BATTLE_MARCH : VP_SCHAAL_STANDAARD);

export const bonusVp = (b: VpBonus, schaal: VpSchaal = VP_SCHAAL_STANDAARD): number =>
  (b.generalDown ? schaal.general : 0) +
  (b.bsbDown ? schaal.bsb : 0) +
  Math.max(0, b.standaards ?? 0) * schaal.standaard +
  Math.max(0, Math.round(b.objectiveVp ?? 0)) +
  Object.values(b.objectives ?? {}).reduce((a, c) => a + Math.max(0, Math.round(c || 0)), 0);

/** Volledige VP-stand + uitslag. host-VP = kill-VP tegen het guest-leger + host-bonussen (wat host
 *  scoort), en vice versa.
 *
 *  `battleMarch` kiest de VP-schaal; standaard leest 'ie de vlag van de tracker, zodat elke bestaande
 *  aanroep automatisch het juiste formaat rekent. De DREMPELS (100 meer = victory, 2× = crushing)
 *  blijven in beide formaten identiek: de Battle March-pagina definieert geen eigen marge en linkt
 *  voor de uitslag terug naar /warhammer-battles/victory-points-warhammer-battles. */
export function berekenVictory(
  hostArmy: Army | null,
  guestArmy: Army | null,
  tracker: GameTracker | null,
  hostBonus: VpBonus = {},
  guestBonus: VpBonus = {},
  battleMarch: boolean = tracker?.battleMarch === true,
): VpResultaat {
  const schaal = vpSchaal(battleMarch);
  const hostVp = killVp(guestArmy, 'guest', tracker) + bonusVp(hostBonus, schaal);
  const guestVp = killVp(hostArmy, 'host', tracker) + bonusVp(guestBonus, schaal);
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
