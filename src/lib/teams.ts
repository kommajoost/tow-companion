/**
 * 2 VS 2 IN EEN SOLO-POTJE (Joost 28-10-2026): "Ik wil 2 vs 2 voor een game (…) alleen voor een SOLO
 * game. Bij 2 vs 2 wil ik 2 teams selecteren, dus 4 army lists. (…) er moeten 4 spelers zijn, en je moet
 * daar snel tussen kunnen schakelen tijdens de game."
 *
 * De stoelen: team A = `host` (speler 1, "You") + `host2` (speler 2, bondgenoot); team B = `guest`
 * (speler 3) + `guest2` (speler 4). `host` en `guest` zijn precies de stoelen van een 1v1-potje, dus een
 * 1v1-tracker verandert niet: 2v2 voegt alleen sleutels met `host2:`/`guest2:` toe.
 *
 * Puur (geen React), zodat de VP-test (scripts/tests/team-vp.test.cjs) hem los kan laden.
 */
import type { Army, ArmyUnit, GameTracker, TeamStoel } from '../types';
import { unitToonRegel } from './unitNaam';

export type Team = 'A' | 'B';

/** Volgorde waarin de stoelen overal getoond worden: per team, de "hoofdspeler" eerst. */
export const TEAM_STOELEN: readonly TeamStoel[] = ['host', 'host2', 'guest', 'guest2'];

/** De standaardnaam van een stoel als er geen eigen naam is ingevuld. */
export const STANDAARD_NAAM: Record<TeamStoel, string> = {
  host: 'You',
  host2: 'Ally',
  guest: 'Opponent 1',
  guest2: 'Opponent 2',
};

export const TEAM_NAAM: Record<Team, string> = { A: 'Team A', B: 'Team B' };

/** Is dit een solo-teampotje? Alleen de vlag telt; ontbreekt hij, dan is het 1v1. */
export const isTeamTracker = (t: GameTracker | null | undefined): boolean => t?.teams === '2v2';

export const teamVan = (s: TeamStoel): Team => (s === 'host' || s === 'host2' ? 'A' : 'B');

/** De twee stoelen van een team, hoofdspeler eerst. */
export const stoelenVan = (team: Team): [TeamStoel, TeamStoel] => (team === 'A' ? ['host', 'host2'] : ['guest', 'guest2']);

/** De twee stoelen aan de ANDERE kant van de tafel. */
export const vijandStoelen = (s: TeamStoel): [TeamStoel, TeamStoel] => stoelenVan(teamVan(s) === 'A' ? 'B' : 'A');

/** De stoel waarop de team-objectives staan (ObjectivesTracker): `host` voor team A, `guest` voor B. */
export const objectiefStoel = (team: Team): 'host' | 'guest' => (team === 'A' ? 'host' : 'guest');

/** De naam van een stoel: de eigen naam als die is ingevuld, anders het standaardlabel. */
export function naamVan(t: GameTracker | null | undefined, s: TeamStoel): string {
  const eigen = t?.spelers?.[s];
  return typeof eigen === 'string' && eigen.trim() ? eigen.trim() : STANDAARD_NAAM[s];
}

/** Alleen de ingevulde, niet-lege namen houden (voor de tracker). Geeft undefined als er niets over is. */
export function schoneNamen(n: Partial<Record<TeamStoel, string>> | null | undefined): Partial<Record<TeamStoel, string>> | undefined {
  const uit: Partial<Record<TeamStoel, string>> = {};
  for (const s of TEAM_STOELEN) {
    const v = n?.[s];
    if (typeof v === 'string' && v.trim()) uit[s] = v.trim().slice(0, 24);
  }
  return Object.keys(uit).length ? uit : undefined;
}

/** Scheidingsteken tussen stoel en unit-id in een 2v2-kill-log (`killDetails[].unit`). */
const SEP = ':';

/** De vijandelijke units voor de kill-keuze van een 2v2-speler: de units van BEIDE vijanden.
 *
 *  WAAROM DE ID EEN STOEL-VOORVOEGSEL KRIJGT. Kiezen twee spelers dezelfde lijst (mag gewoon), dan hebben
 *  hun units dezelfde ids. Een kale id in de kill-log zou dan niet zeggen WELKE van de twee vijanden je
 *  neerhaalde, en de VP-engine zou bij allebei de unit als gedood tellen. Daarom staat in een 2v2-kill-log
 *  `guest2:<unitId>`; `teamKillVp` leest dat terug. De naam krijgt de spelernaam ervoor, zodat je in de
 *  keuzelijst ziet van wie de unit is. */
export function vijandUnitsVoor(
  s: TeamStoel,
  legers: Partial<Record<TeamStoel, Army | null>>,
  t: GameTracker | null | undefined,
): ArmyUnit[] {
  const uit: ArmyUnit[] = [];
  for (const v of vijandStoelen(s)) {
    const a = legers[v];
    if (!a) continue;
    for (const u of a.units) {
      uit.push({ ...u, id: `${v}${SEP}${u.id}`, name: `${naamVan(t, v)} — ${unitToonRegel(u)}`, datasheet: undefined });
    }
  }
  return uit;
}

/** Splits een 2v2-kill-verwijzing `stoel:unitId`. Een kale id (zonder bekende stoel) geeft stoel null. */
export function leesKillVerwijzing(ref: string): { stoel: TeamStoel | null; id: string } {
  const i = ref.indexOf(SEP);
  if (i > 0) {
    const s = ref.slice(0, i);
    if ((TEAM_STOELEN as readonly string[]).includes(s)) return { stoel: s as TeamStoel, id: ref.slice(i + 1) };
  }
  return { stoel: null, id: ref };
}
