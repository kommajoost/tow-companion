// DE BATTLE SHEET: alles wat twee spelers over hun potje moeten delen, in één object.
//
// Joost (13-09): "het geheel moet gewoon veel duidelijker en gestructureerd worden voor mensen om
// samen een potje te starten."
//
// WAT HIER HET PROBLEEM WAS. De battlefield-setup schreef naar `tow:battle` — een LOKALE sleutel,
// per apparaat. Jouw tegenstander zag jouw scenario dus nooit. Bij Domination of Strategic Locations
// telde ieder zijn eigen objectives, en het weer en het formaat bestonden buiten de campagne
// helemaal niet. Een campagne-battle had dat allemaal wél, want daar komt de sheet van de server.
//
// WAAR HIJ NU WOONT: op de TRACKER (`GameTracker.sheet`). Dat is de jsonb-kolom van `tow_games` die
// al realtime naar beide spelers synct, en `normTracker` laat onbekende velden sinds 02-08 met rust —
// dus er is geen databasewijziging voor nodig en een oude game blijft gewoon werken. Zelfde
// redenering als waarom `battleMarch` en `weer` daar al stonden.
//
// WIE HEM MAG WIJZIGEN: de HOST (Joost, 13-09). In een potje buiten de campagne is er geen server die
// arbitreert, dus één van de twee moet de baas zijn — anders overschrijven twee spelers elkaars
// scenario en weet niemand meer wat er op tafel ligt.
import type { GameWeer } from '../types';
import type { TerrainPiece } from './battle';

/** Het FORMAT van een potje. Bepaalt drie dingen tegelijk: hoeveel rounds het duurt, welke
 *  D6-scenariotabel geldt, en of de halve (Battle March) VP-schaal van toepassing is.
 *
 *  Dit zijn precies de drie scenario-groepen die `battle.ts` al kent, dus de keuze hier valt één op
 *  één samen met welke scenario's je kunt spelen. */
export type BattleFormat = 'battles' | 'matched-play' | 'battle-march';

export interface FormatDef {
  id: BattleFormat;
  label: string;
  blurb: string;
  /** Hoeveel battle rounds het potje duurt. */
  rounds: number;
  /** De `group` in SCENARIOS waaruit dit format zijn scenario's trekt. */
  groep: 'pitched' | 'matched-play' | 'battle-march';
  /** Speelt dit format onder de Battle March-regels? Stempelt `tracker.battleMarch`, dat de
   *  rondeteller en de VP-engine al lezen. */
  battleMarch: boolean;
  /** Het tafelformaat waar dit format standaard op speelt (inches). */
  tafel: { w: number; h: number };
}

export const FORMATS: FormatDef[] = [
  {
    id: 'battles',
    label: 'Warhammer Battles',
    blurb: 'The six pitched-battle scenarios from the rulebook. Six battle rounds.',
    rounds: 6,
    groep: 'pitched',
    battleMarch: false,
    tafel: { w: 72, h: 48 },
  },
  {
    id: 'matched-play',
    label: 'Matched Play',
    blurb: 'The six tournament scenarios from the Matched Play Guide. Six battle rounds.',
    rounds: 6,
    groep: 'matched-play',
    battleMarch: false,
    tafel: { w: 72, h: 48 },
  },
  {
    id: 'battle-march',
    label: 'Battle March',
    blurb: 'The small-game format: five rounds, halved VP bonuses, a 44×30″ board.',
    rounds: 5,
    groep: 'battle-march',
    battleMarch: true,
    tafel: { w: 44, h: 30 },
  },
];

export const formatDef = (id: BattleFormat | undefined): FormatDef =>
  FORMATS.find((f) => f.id === id) ?? FORMATS[0];

/** De worpen achter een gegenereerde sheet. Puur om te KUNNEN TONEN wat er gerold is — aan tafel wil
 *  je kunnen zien dat het scenario uit een eerlijke D6 kwam en niet uit een keuze. Ontbreekt een
 *  worp, dan is dat onderdeel met de hand gezet. */
export interface SheetWorpen {
  scenario?: number;
  weer?: number;
  secondary?: number;
}

export interface BattleSheet {
  /** Versie van deze vorm. Hoger = nieuwer; lezers mogen een onbekende hogere versie tonen zoals ze
   *  hem begrijpen in plaats van hem weg te gooien. */
  v: 1;
  format: BattleFormat;
  /** Scenario-id uit SCENARIOS (battle.ts). */
  scenario: string;
  tableW: number;
  tableH: number;
  terrain: TerrainPiece[];
  /** Gekozen secondary-objective-ids (SECONDARY_OBJECTIVES in battle.ts). */
  secondaries: string[];
  /** Het Disruptive Weather van dit potje, of null als er geen weer geldt. Buiten de campagne is weer
   *  OPTIONEEL (Joost, 13-09): je zet het aan als je ermee wilt spelen. */
  weer: GameWeer | null;
  worpen?: SheetWorpen;
  /** Hoe deze sheet tot stand kwam. Alleen informatief. */
  bron?: 'generated' | 'manual';
}

export const DEFAULT_SHEET: BattleSheet = {
  v: 1,
  format: 'battles',
  scenario: 'open-battle',
  tableW: 72,
  tableH: 48,
  terrain: [],
  secondaries: [],
  weer: null,
};

/** Een sheet uit de cloud opschonen. Zelfde houding als `normTracker` in game.tsx: alleen de VORM
 *  afdwingen, nooit iets verzinnen — en `null` teruggeven als er niets bruikbaars in zit, zodat de
 *  aanroeper weet dat deze game (nog) geen sheet heeft in plaats van een lege te tonen. */
export function normSheet(raw: unknown): BattleSheet | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.scenario !== 'string' || !o.scenario) return null;
  const getal = (x: unknown, terugval: number): number =>
    typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : terugval;
  const format: BattleFormat = FORMATS.some((f) => f.id === o.format)
    ? (o.format as BattleFormat)
    : 'battles';
  const weer = o.weer && typeof o.weer === 'object'
    ? (() => {
      const w = o.weer as Record<string, unknown>;
      const naam = typeof w.naam === 'string' ? w.naam : '';
      return naam
        ? { worp: typeof w.worp === 'number' ? w.worp : 0, naam, effect: typeof w.effect === 'string' ? w.effect : '' }
        : null;
    })()
    : null;
  return {
    v: 1,
    format,
    scenario: o.scenario,
    tableW: getal(o.tableW, formatDef(format).tafel.w),
    tableH: getal(o.tableH, formatDef(format).tafel.h),
    terrain: Array.isArray(o.terrain) ? (o.terrain as TerrainPiece[]).filter((t) => t && typeof t === 'object') : [],
    secondaries: Array.isArray(o.secondaries) ? (o.secondaries as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    weer,
    worpen: o.worpen && typeof o.worpen === 'object' ? (o.worpen as SheetWorpen) : undefined,
    bron: o.bron === 'generated' || o.bron === 'manual' ? o.bron : undefined,
  };
}
