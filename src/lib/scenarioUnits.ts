/**
 * PUNTWAARDE UIT DE UNITS (24-10-2026, Joost): "bij de units bij Breakthrough een extra knopje met
 * Breakthrough, en dat dan die units punten van dat moment, dus wat er nog van over is, als VP worden
 * toegerekend."
 *
 * Een post van de soort 'puntwaarde' (Breakthrough: `bt-zone`, de aanvaller scoort de puntwaarde van zijn
 * units die aan het eind helemaal in de deployment zone van de verdediger staan) typ je niet meer in. Op
 * elke unit-kaart van de kant die de post kan scoren staat een knopje; de post is de som van de units die
 * aan staan, elk op zijn waarde VAN NU.
 *
 * DE REKENREGEL (waardeNu):
 *   · geen verliezen                → de volle puntwaarde van de unit
 *   · meer dan één model            → round(punten × modellen over ÷ modellen bij de start)
 *                                     modellen over = start − floor(verloren wonden ÷ W), precies zoals de
 *                                     WoundTracker het toont (een gewond voorste model staat nog)
 *   · één model                     → round(punten × wonden over ÷ wonden bij de start)
 *   De bron is de casualty-tracker (`tracker.units['<seat>:<unitId>'].lost`, in wonden). Een character die
 *   bij de unit staat is een eigen unit in de lijst en zit dus nooit in de punten van deze unit.
 *
 * WIE NIET MEETELT (uitsluiting), letterlijk de regel op de post: "not fleeing units, monsters or
 * characters", plus wat al van tafel is:
 *   · characters  categorie "Characters" (dezelfde toets als het veteranen-rapport)
 *   · monsters    troop type Monstrous Creature of Behemoth: de twee sub-categorieën van Monsters in het
 *                 rulebook (tow.whfb.app, "Monsters are split into two sub-categories")
 *   · fleeing     de Fleeing-schakelaar van de unit
 *   · destroyed   Removed, alle wonden weg, of door de tegenstander in zijn kill-log aangewezen (zelfde
 *                 regel als de VP-engine, zie killVp)
 *   Een unit die aan stond en daarna vlucht of sneuvelt blijft aangevinkt maar telt 0, en het paneel zegt
 *   waarom: zo verdwijnt er niets stil.
 *
 * WAAR HET STAAT: op de tracker, naast de ruwe stand van de andere posten:
 *   `tracker.bonus[host|guest].scenarioUnits[post-id] = [unit-id, …]`
 * Daarmee hoort het bij DEZE battle (de tracker is per potje; in het lab en de scenario-test is dat de
 * lokale solo-tracker onder de lab-sleutels), synct het naar de tegenstander en loopt het via de VP mee
 * in de rapport-sig.
 *
 * HANDMATIG BLIJFT ALLEEN ALS TERUGVAL: heeft die kant geen leger in het potje (de scenario-test zonder
 * legers), of staat er van vóór deze versie al een getypt getal en is er nog geen unit aangetikt, dan telt
 * het getypte getal zoals voorheen. Zodra er één unit aangetikt is, rekenen de units.
 *
 * Puur: geen React — los te testen (scripts/tests/scenario-units.test.cjs).
 */
import type { Army, ArmyUnit, GameTracker } from '../types';
import type { VpBonus, VpUnitTrack } from './victoryPoints';
import { unitSize, unitTotalStrength, woundsPerModel } from './armyRules';
import { postGeldtVoor, type BonusPost, type ScenarioBonus, type ScenarioStand, type Zijde } from './scenarioBonus';

/** Per puntwaarde-post de aangetikte units van één stoel: post-id → unit-ids. */
export type ScenarioUnits = Record<string, string[]>;

export type Uitsluiting = 'character' | 'monster' | 'fleeing' | 'destroyed';

/** Rekent deze post uit de units? Alleen de puntwaarde-posten (Breakthrough). */
export const postUitUnits = (p: BonusPost): boolean => p.soort === 'puntwaarde';

/** De korte naam voor het knopje: het stuk vóór de dubbele punt ("Breakthrough: units in …" → "Breakthrough"). */
export const knopLabel = (p: BonusPost): string => (p.label.split(':')[0] || p.label).trim() || p.label;

/** De regel in één zin, voor de tooltip op het knopje en onder de post. */
export const REKENREGEL = 'Points of the unit as it stands now: its points × models left ÷ models at the start (a single model: wounds left ÷ its wounds). Characters, monsters, fleeing and destroyed units don’t count.';

export const uitsluitingTekst = (u: Uitsluiting): string =>
  u === 'character' ? 'character' : u === 'monster' ? 'monster' : u === 'fleeing' ? 'fleeing' : 'destroyed';

const IS_CHARACTER = /^characters$/i;
const IS_MONSTER = /^(monstrous creatures?|behemoths?)$/i;

/** Komt deze unit om zijn SOORT nooit in aanmerking (character, monster)? Los van hoe het nu met hem gaat. */
export function soortUitsluiting(u: ArmyUnit): 'character' | 'monster' | null {
  if (IS_CHARACTER.test((u.category ?? '').trim())) return 'character';
  if (IS_MONSTER.test((u.troopType ?? '').trim())) return 'monster';
  return null;
}

/** Waarom deze unit NU niet meetelt, of null als hij meetelt. `gedood` = de tegenstander heeft hem in
 *  zijn kill-log aangewezen. */
export function uitsluiting(u: ArmyUnit, t: VpUnitTrack | undefined, gedood = false): Uitsluiting | null {
  const soort = soortUitsluiting(u);
  if (soort) return soort;
  const lost = Math.max(0, t?.lost ?? 0);
  if (gedood || t?.weg || unitTotalStrength(u) - lost <= 0) return 'destroyed';
  if (t?.fleeing) return 'fleeing';
  return null;
}

/** De puntwaarde van deze unit zoals hij er NU bij staat (zie de rekenregel bovenaan). */
export function waardeNu(u: ArmyUnit, t: VpUnitTrack | undefined): number {
  const punten = Math.max(0, u.points ?? 0);
  if (punten <= 0) return 0;
  const ts = unitTotalStrength(u);
  const lost = Math.min(ts, Math.max(0, Math.round(t?.lost ?? 0)));
  if (lost <= 0) return punten;
  if (lost >= ts) return 0;
  const start = unitSize(u);
  if (start <= 1) return Math.round((punten * (ts - lost)) / ts);
  const over = start - Math.min(start, Math.floor(lost / woundsPerModel(u)));
  return Math.round((punten * over) / start);
}

/** "12/20 models" of "2/4 wounds": wat er nog staat, voor naast de waarde. */
export function restTekst(u: ArmyUnit, t: VpUnitTrack | undefined): string {
  const ts = unitTotalStrength(u);
  const lost = Math.min(ts, Math.max(0, Math.round(t?.lost ?? 0)));
  const start = unitSize(u);
  if (start <= 1) return `${ts - lost}/${ts} ${ts === 1 ? 'wound' : 'wounds'}`;
  const over = start - Math.min(start, Math.floor(lost / woundsPerModel(u)));
  return `${over}/${start} models`;
}

/** De unit-ids die de TEGENSTANDER van deze stoel in zijn kill-log heeft aangewezen (zelfde afleiding als
 *  killVp: alles wat niet onder `<seat>:` staat is van de ander). */
export function gedoodDoorVijand(seat: string, tracker: GameTracker | null | undefined): Set<string> {
  const gedood = new Set<string>();
  for (const [sleutel, track] of Object.entries(tracker?.units ?? {})) {
    if (sleutel.startsWith(`${seat}:`)) continue;
    for (const d of (track as { killDetails?: { unit?: string }[] })?.killDetails ?? []) {
      if (d?.unit) gedood.add(d.unit);
    }
  }
  return gedood;
}

/** Eén aangetikte unit in het paneel. */
export interface PuntRegel {
  id: string;
  unit: ArmyUnit;
  /** De volle puntwaarde uit de lijst. */
  punten: number;
  /** Wat hij nu oplevert (0 als hij is uitgesloten). */
  nu: number;
  rest: string;
  uitgesloten: Uitsluiting | null;
}

export interface PuntDetail {
  /** 'units' = de som van de aangetikte units; 'hand' = het getypte getal (terugval, zie bovenaan). */
  bron: 'units' | 'hand';
  som: number;
  regels: PuntRegel[];
}

const heeftLeger = (a: Army | null | undefined): a is Army => !!a && Array.isArray(a.units) && a.units.length > 0;

/** De aangetikte unit-ids van deze stoel bij deze post, of undefined als er nooit één aangetikt is. */
export function aangetikt(bonus: VpBonus | null | undefined, postId: string): string[] | undefined {
  const v = bonus?.scenarioUnits?.[postId];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
}

/** De puntwaarde-post van één stoel uitgerekend: uit de units, of (terugval) het getypte getal. */
export function puntDetail(
  p: BonusPost,
  zijde: Zijde,
  bonus: VpBonus | null | undefined,
  leger: Army | null | undefined,
  tracker: GameTracker | null | undefined,
): PuntDetail {
  const hand = Math.max(0, Math.round(bonus?.scenario?.[p.id] ?? 0));
  const ids = aangetikt(bonus, p.id);
  if (!heeftLeger(leger) || (ids === undefined && hand > 0)) return { bron: 'hand', som: hand, regels: [] };
  const gedood = gedoodDoorVijand(zijde, tracker);
  const regels: PuntRegel[] = [];
  for (const u of leger.units) {
    if (!ids?.includes(u.id)) continue;
    const t = tracker?.units?.[`${zijde}:${u.id}`] as VpUnitTrack | undefined;
    const uit = uitsluiting(u, t, gedood.has(u.id));
    regels.push({ id: u.id, unit: u, punten: Math.max(0, u.points ?? 0), nu: uit ? 0 : waardeNu(u, t), rest: restTekst(u, t), uitgesloten: uit });
  }
  return { bron: 'units', som: regels.reduce((s, r) => s + r.nu, 0), regels };
}

/** De stand van één stoel zoals de VP-engine hem moet lezen: elke puntwaarde-post vervangen door de som
 *  van de units (of het getypte getal, zie puntDetail). De rest van de stand blijft zoals hij is. */
export function effectieveStand(
  def: ScenarioBonus | null | undefined,
  zijde: Zijde,
  bonus: VpBonus | null | undefined,
  leger: Army | null | undefined,
  tracker: GameTracker | null | undefined,
): ScenarioStand | undefined {
  const stand = bonus?.scenario;
  if (!def) return stand;
  const posten = def.posten.filter((p) => postUitUnits(p) && postGeldtVoor(p, zijde));
  if (!posten.length) return stand;
  const uit: ScenarioStand = { ...(stand ?? {}) };
  for (const p of posten) uit[p.id] = puntDetail(p, zijde, bonus, leger, tracker).som;
  return uit;
}

/** Beide stoelen tegelijk (host = aanvaller). */
export function effectieveStanden(
  def: ScenarioBonus | null | undefined,
  hostBonus: VpBonus | null | undefined,
  guestBonus: VpBonus | null | undefined,
  hostArmy: Army | null | undefined,
  guestArmy: Army | null | undefined,
  tracker: GameTracker | null | undefined,
): { host: ScenarioStand | undefined; guest: ScenarioStand | undefined } {
  return {
    host: effectieveStand(def, 'host', hostBonus, hostArmy, tracker),
    guest: effectieveStand(def, 'guest', guestBonus, guestArmy, tracker),
  };
}

/** Eén unit aan- of uittikken bij een post. Geeft de nieuwe bonus van die stoel terug. */
export function tikUnit(bonus: VpBonus | null | undefined, postId: string, unitId: string, aan: boolean): VpBonus {
  const nu = aangetikt(bonus, postId) ?? [];
  const lijst = aan ? (nu.includes(unitId) ? nu : [...nu, unitId]) : nu.filter((x) => x !== unitId);
  return { ...(bonus ?? {}), scenarioUnits: { ...(bonus?.scenarioUnits ?? {}), [postId]: lijst } };
}
