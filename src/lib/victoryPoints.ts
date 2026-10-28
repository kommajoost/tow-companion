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
import type { Army, ArmyUnit, GameTracker, TeamStoel } from '../types';
import { leesKillVerwijzing, vijandStoelen } from './teams';
import { unitTotalStrength } from './armyRules';
import { scenarioVp, type ScenarioBonus, type ScenarioStand } from './scenarioBonus';
import { effectieveStanden, gedoodDoorVijand, type ScenarioUnits } from './scenarioUnits';

/** Per-kant handmatige bonussen — de categorieën die de app niet uit de casualty-tracker kan afleiden. */
export interface VpBonus {
  generalDown?: boolean; // vijandelijke General dood/gevlucht/vluchtend → +100 (Battle March: +50)
  bsbDown?: boolean;     // vijandelijke Battle Standard Bearer idem → +50 (Battle March: +25)
  standaards?: number;   // aantal buitgemaakte vijandelijke standaards → +50 elk (Battle March: +25)
  objectiveVp?: number;  // handmatig vrij veld: overige/onbekende objective-VP
  /** Gestructureerde objective-VP per scenario/secondary (optie B): sleutel → gescoorde VP.
   *  Sleutels + bedragen komen uit OBJECTIVE_VP (objectiveVp.ts, letterlijk van tow.whfb.app). */
  objectives?: Record<string, number>;
  /** 22-10-2026: de RUWE stand van de scenario-posten uit de sheet (`scenarioBonus`, Act 3+): post-id
   *  → aantal (eind: 0/1, puntwaarde: punten). Géén VP: de pot van de verdediger hangt af van de teller
   *  van de aanvaller, dus de VP worden pas in berekenVictory uitgerekend (zie scenarioBonus.ts).
   *  `bonusVp` telt dit veld daarom bewust NIET mee. */
  scenario?: ScenarioStand;
  /** 24-10-2026: bij een PUNTWAARDE-post (Breakthrough) de units van deze stoel die meetellen: post-id →
   *  unit-ids. De post rekent dan zelf de som van hun puntwaarde van nu (zie scenarioUnits.ts); het getypte
   *  getal in `scenario` is alleen nog de terugval. Telt net als `scenario` NIET mee in `bonusVp`. */
  scenarioUnits?: ScenarioUnits;
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

/**
 * De VP die de VIJAND scoort voor één unit, o.b.v. z'n Dead-or-Fled-toestand.
 *
 * `gedood` (12-09-2026, Joost: "kill log is dan leidend. veel mensen vergeten de unit deaths in te
 * vullen") — de tegenstander heeft deze unit in z'n kill-log aangewezen. Dat telt net zo hard als de
 * eigen tracker: het is een positieve bewering dat hij gevallen is, terwijl een lege eigen tracker
 * net zo goed "vergeten in te vullen" betekent. Zonder dit miste de winnaar VP voor een unit die hij
 * wél had neergehaald, puur omdat de eigenaar 'm niet had afgevinkt.
 */
export function unitVp(u: ArmyUnit, track: VpUnitTrack | undefined, gedood = false): number {
  const punten = u.points ?? 0;
  if (punten <= 0) return 0;
  const ts = unitTotalStrength(u); // = modellen × wounds-per-model
  const lost = Math.max(0, track?.lost ?? 0);
  const remaining = ts - lost;
  if (gedood || track?.weg || remaining <= 0) return punten; // vernietigd / van tafel → 100%
  if (track?.fleeing) return Math.ceil(punten / 2);        // vluchtend bij einde → 50% (naar boven)
  if (remaining <= ts * 0.25) return Math.ceil(punten / 2); // ≤25% van start-strength → 50% (naar boven)
  return 0;
}

/** Totale kill-VP die de vijand scoort tegen `leger`. seat = wiens units dit zijn ('host'/'guest'). */
export function killVp(leger: Army | null, seat: string, tracker: GameTracker | null): number {
  if (!leger) return 0;
  // Wie de TEGENSTANDER heeft aangewezen in z'n kill-log. De sleutels in de tracker zijn
  // `seat:unitId`, dus alles wat niet van dit leger is, is van de ander — daarmee hoeven we het
  // vijandelijke leger hier niet te kennen.
  const gedood = gedoodDoorVijand(seat, tracker);
  let vp = 0;
  for (const u of leger.units) {
    vp += unitVp(u, tracker?.units?.[`${seat}:${u.id}`] as VpUnitTrack | undefined, gedood.has(u.id));
  }
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
  /** 22-10-2026: de scenario-posten van de campagne-sheet (Act 3+). Zonder definitie tellen ze niet:
   *  een vrij potje of een oudere sheet rekent precies zoals voorheen. Host = aanvaller. */
  scenario: ScenarioBonus | null = null,
): VpResultaat {
  const schaal = vpSchaal(battleMarch);
  // 24-10-2026: een puntwaarde-post (Breakthrough) rekent uit de aangetikte units, met hun waarde van nu.
  const st = effectieveStanden(scenario, hostBonus, guestBonus, hostArmy, guestArmy, tracker);
  const sc = scenarioVp(scenario, st.host, st.guest);
  const hostVp = killVp(guestArmy, 'guest', tracker) + bonusVp(hostBonus, schaal) + sc.host;
  const guestVp = killVp(hostArmy, 'host', tracker) + bonusVp(guestBonus, schaal) + sc.guest;
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

// ══════════════════ 2 VS 2 (Joost 28-10-2026, alleen solo) ══════════════════════════════════════════
// Vier spelers in twee teams: team A = host + host2, team B = guest + guest2 (zie lib/teams.ts).
// `berekenVictory` hierboven blijft ONAANGEROERD: elk 1v1-potje (solo, host, join, campagne) rekent
// precies als voorheen. Dit is een aparte ingang die alleen GameView aanroept bij `tracker.teams === '2v2'`.

/** De vier legers van een teampotje. Een lege stoel (nog geen leger) is null en levert 0 VP. */
export type TeamLegers = Record<TeamStoel, Army | null>;

/** Wat één speler bijdraagt, voor het per-speler-overzicht in End battle. */
export interface SpelerVp {
  /** Dead-or-Fled-VP die het VIJANDELIJKE team scoort op het leger van deze speler. */
  afgestaan: number;
  /** De eigen handmatige bonussen van deze speler (General/BSB/standaards/"anything else") — zonder de
   *  team-objectives, die staan apart in `objectives`. Telt mee voor zijn team. */
  bonus: number;
  /** Team-objectives (alleen bij `host` en `guest`, de stoel waarop ObjectivesTracker ze zet); 0 bij
   *  host2/guest2. */
  objectives: number;
}

/** Het resultaat van een teampotje. BEWUST dezelfde vorm als VpResultaat, met host = TEAM A en guest =
 *  TEAM B (ook `winnaar: 'host'` = team A wint). Zo kunnen de BattleBar, het VP-paneel en het
 *  einde-overzicht het ongewijzigd lezen. `spelers` is de uitsplitsing per stoel. */
export interface TeamVpResultaat extends VpResultaat {
  spelers: Record<TeamStoel, SpelerVp>;
  /** Scenario-VP (campagne-sheet) per team; in een solo-teampotje altijd 0. */
  scenarioA: number;
  scenarioB: number;
}

/** De team-objectives van één bonus (de `objectives`-map), zoals bonusVp ze telt. */
const objectivesVp = (b: VpBonus | undefined): number =>
  Object.values(b?.objectives ?? {}).reduce((a, c) => a + Math.max(0, Math.round(c || 0)), 0);

/**
 * Kill-VP tegen het leger van één 2v2-stoel. Zelfde rekenregel als `killVp` (unitVp per unit, de eigen
 * tracker onder `stoel:unitId`), maar "gedood door de vijand" leest ALLEEN de kill-logs van het
 * vijandelijke TEAM, en alleen verwijzingen die naar DEZE stoel wijzen (`stoel:unitId`, zie
 * vijandUnitsVoor in lib/teams.ts). Waarom niet gewoon killVp: die telt elke kill-log behalve die van
 * de eigen stoel — in 2v2 dus ook die van je bondgenoot, en bij twee keer dezelfde lijst zou een kill op
 * de ene vijand ook de andere vijand raken. Een kale id (zonder stoel) telt als terugval voor elk
 * vijandelijk leger dat die id heeft.
 */
export function teamKillVp(leger: Army | null, stoel: TeamStoel, tracker: GameTracker | null): number {
  if (!leger) return 0;
  const vijanden = vijandStoelen(stoel);
  const gedood = new Set<string>();
  for (const [sleutel, track] of Object.entries(tracker?.units ?? {})) {
    const van = sleutel.slice(0, sleutel.indexOf(':'));
    if (!(vijanden as string[]).includes(van)) continue;
    for (const d of (track as { killDetails?: { unit?: string }[] })?.killDetails ?? []) {
      if (!d?.unit) continue;
      const ref = leesKillVerwijzing(d.unit);
      if (ref.stoel === null || ref.stoel === stoel) gedood.add(ref.id);
    }
  }
  let vp = 0;
  for (const u of leger.units) {
    vp += unitVp(u, tracker?.units?.[`${stoel}:${u.id}`] as VpUnitTrack | undefined, gedood.has(u.id));
  }
  return vp;
}

/**
 * De team-uitslag van een solo-2v2-potje.
 *   team A VP = teamKillVp(guest) + teamKillVp(guest2) + bonus(host) + bonus(host2) [+ scenario A]
 *   team B VP = teamKillVp(host)  + teamKillVp(host2)  + bonus(guest) + bonus(guest2) [+ scenario B]
 * De team-objectives tellen ÉÉN keer per team: alleen die op `host`/`guest` (waar ObjectivesTracker ze
 * zet). Mocht er op host2/guest2 toch een `objectives`-map staan, dan telt die niet mee.
 * Marges zoals altijd: ≥100 VP verschil = victory, winnaar ≥ 2× verliezer = crushing.
 */
export function berekenTeamVictory(
  legers: TeamLegers,
  tracker: GameTracker | null,
  battleMarch: boolean = tracker?.battleMarch === true,
  scenario: ScenarioBonus | null = null,
): TeamVpResultaat {
  const schaal = vpSchaal(battleMarch);
  const b = tracker?.bonus ?? {};
  // Scenario-posten (campagne-sheet) per team, via de hoofdstoelen — in solo is er geen campagne-sheet.
  const st = effectieveStanden(scenario, b.host, b.guest, legers.host, legers.guest, tracker);
  const sc = scenarioVp(scenario, st.host, st.guest);
  const speler = (s: TeamStoel): SpelerVp => {
    const bon = b[s] ?? {};
    const isHoofd = s === 'host' || s === 'guest';
    const obj = isHoofd ? objectivesVp(bon) : 0;
    return {
      afgestaan: teamKillVp(legers[s], s, tracker),
      bonus: bonusVp({ ...bon, objectives: undefined }, schaal),
      objectives: obj,
    };
  };
  const spelers: Record<TeamStoel, SpelerVp> = {
    host: speler('host'), host2: speler('host2'), guest: speler('guest'), guest2: speler('guest2'),
  };
  const bijdrage = (s: TeamStoel) => spelers[s].bonus + spelers[s].objectives;
  const hostVp = spelers.guest.afgestaan + spelers.guest2.afgestaan + bijdrage('host') + bijdrage('host2') + sc.host;
  const guestVp = spelers.host.afgestaan + spelers.host2.afgestaan + bijdrage('guest') + bijdrage('guest2') + sc.guest;
  const verschil = Math.abs(hostVp - guestVp);
  let winnaar: 'host' | 'guest' | null = null;
  let uitslag: Uitslag = 'draw';
  if (verschil >= 100) {
    winnaar = hostVp > guestVp ? 'host' : 'guest';
    const win = Math.max(hostVp, guestVp);
    const verl = Math.min(hostVp, guestVp);
    uitslag = win >= 2 * verl ? 'crushing' : 'victory';
  }
  return { hostVp, guestVp, verschil, winnaar, uitslag, spelers, scenarioA: sc.host, scenarioB: sc.guest };
}
