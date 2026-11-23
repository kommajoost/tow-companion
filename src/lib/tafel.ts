/**
 * ACT 4: EEN TAFEL VAN TWEE TEGEN TWEE IN DE COMPANION (blok E, 24-11-2026).
 *
 * Een Act 4-tafel is één battle met vier generals: twee Wardens (alliantie 'stoppen') tegen twee
 * Unchained ('bevrijden'); een raider kan als huurling aan een kant zitten. Scenario "King of the Shrine"
 * (de sheet komt van de server). De Companion opent er ÉÉN gedeelde teambattle voor, op de TAFELCODE,
 * met vier stoelen (lib/teams.ts):
 *
 *   host  = Wardens 1st general     host2  = Wardens 2nd general       (team A, aanvaller)
 *   guest = Unchained 1st general   guest2 = Unchained 2nd general     (team B, verdediger)
 *
 * Wie first is beslissen de spelers aan tafel; elke speler kiest bij binnenkomst zijn eigen general en
 * een van de twee plekken van zijn kant. Zijn eigen gelockte lijst komt dan vanzelf mee.
 *
 * CONTRACT 1 (server, blok D): `towc_tafel_by_code(p_code)` → { ok, fase, tafel, code, codes, district,
 * cap, tafelCap, rapporteur, scenario, artefact, wrath, weer, alleGelockt, kanten: { wardens, unchained } }.
 * CONTRACT 2: `towc_tafel_uitslag_companion(p_code, p_uitslag)`; zie `TafelUitslag`.
 *
 * DE TAFELTEST (alleen de testbuild): `/?tafeltest=1#tafel=<base64url van een contract-1-object>` (of
 * zonder hash: het ingebouwde voorbeeld, met `&variant=shrine|geen`). De tafel draait dan op een eigen
 * `tow_games`-rij op de TESTdatabase (code `TAFELT…`), zodat vier browsertabbladen echt samen spelen,
 * maar er gaat NIETS naar de campagne-uitslag.
 */
import { supabase } from './supabase';
import { getPersisted, setPersisted } from '../store';
import {
  parseItem, parseLijst, parsePerk, parseRollOffBron, parseVetUnit, parseWeer,
  type BattleLijstSamenvatting, type CampaignBattle, type FoundItem, type Perk, type RollOffBron, type VetUnit,
} from './campaignBattle';
import { parseWrath } from './wrathTriggers';
import { zetTafelBattleMaker } from './tafelRegister';
import { base64UrlNaarTekst } from './scenarioTest';
import { leesKillVerwijzing, teamVan, vijandStoelen, type Team } from './teams';
import { collectVeteraan, verliesVan, type VetRegel } from './veteraanRapport';
import { unitToonRegel } from './unitNaam';
import type { Army, GameTracker, GameWeer, TeamStoel } from '../types';
import type { EindReden } from './tempo';

// ── Contract 1 ──────────────────────────────────────────────────────────────────────────────────

export type TafelKantSleutel = 'wardens' | 'unchained';

export interface TafelGeneral {
  id: string;
  naam: string;
  factie: string;
  kleur: string;
  raider: boolean;
  battleId: number | null;
  rol: 'aanvaller' | 'verdediger';
  gelockt: boolean;
  lijst: BattleLijstSamenvatting | null;
  perks: Perk[];
  items: FoundItem[];
  veteranen: VetUnit[];
  /** Alleen de tafeltest: welk mock-leger van het scenario lab deze general speelt ('empire' | 'orcs'). */
  mock?: string;
}

export interface TafelKant {
  alliantie: string;
  rollOff: RollOffBron[] | null;
  generals: TafelGeneral[];
}

export interface TafelArtefact {
  id: string;
  naam: string;
  god: string;
  /** Campagne-speler-id van de houder, of null (ligt op de shrine). */
  houder: string | null;
  /** 'stoppen' | 'bevrijden' (de alliantie van de houder), of null. */
  kant: string | null;
  opShrine: boolean;
}

export interface TafelInfo {
  ok: true;
  fase: number;
  tafel: number;
  code: string;
  codes: string[];
  district: { hex: string; naam: string; god: string };
  cap: number;
  tafelCap: number;
  rapporteur: string | null;
  scenario: Record<string, unknown> | null;
  artefact: TafelArtefact | null;
  wrath: number[] | null;
  weer: GameWeer | null;
  alleGelockt: boolean;
  kanten: Record<TafelKantSleutel, TafelKant>;
}

const str = (v: unknown, terug = ''): string => (typeof v === 'string' ? v : terug);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function parseGeneral(raw: unknown, kant: TafelKantSleutel): TafelGeneral {
  const o = obj(raw);
  return {
    id: str(o.id),
    naam: str(o.naam, str(o.id)),
    factie: str(o.factie),
    kleur: str(o.kleur, kant === 'wardens' ? '#4a6f8a' : '#8a3a2a'),
    raider: o.raider === true,
    battleId: typeof o.battleId === 'number' ? o.battleId : null,
    rol: o.rol === 'verdediger' ? 'verdediger' : o.rol === 'aanvaller' ? 'aanvaller' : kant === 'wardens' ? 'aanvaller' : 'verdediger',
    gelockt: o.gelockt === true,
    lijst: parseLijst(o.lijst),
    perks: arr(o.perks).map(parsePerk).filter((p) => !!p.perk),
    items: arr(o.items).map(parseItem).filter((x): x is FoundItem => !!x),
    veteranen: arr(o.veteranen).map(parseVetUnit),
    ...(typeof o.mock === 'string' ? { mock: o.mock } : {}),
  };
}

function parseKant(raw: unknown, kant: TafelKantSleutel): TafelKant {
  const o = obj(raw);
  const bronnen = Array.isArray(o.rollOff)
    ? o.rollOff.map(parseRollOffBron).filter((b): b is RollOffBron => !!b)
    : null;
  return {
    alliantie: str(o.alliantie, kant === 'wardens' ? 'stoppen' : 'bevrijden'),
    rollOff: bronnen,
    generals: arr(o.generals).map((g) => parseGeneral(g, kant)).filter((g) => !!g.id),
  };
}

function parseArtefact(raw: unknown): TafelArtefact | null {
  const o = obj(raw);
  if (!o.id && !o.naam) return null;
  return {
    id: str(o.id),
    naam: str(o.naam, str(o.id)),
    god: str(o.god),
    houder: typeof o.houder === 'string' && o.houder ? o.houder : null,
    kant: typeof o.kant === 'string' && o.kant ? o.kant : null,
    opShrine: o.opShrine === true,
  };
}

/** Het antwoord van `towc_tafel_by_code`, defensief gelezen. Gooit de server-fout (ONBEKENDE_CODE,
 *  GEEN_TAFEL) als `ok` niet true is. */
export function parseTafel(data: unknown): TafelInfo {
  const d = obj(data);
  if (d.ok !== true) throw new Error(str(d.fout, 'GEEN_TAFEL'));
  const district = obj(d.district);
  const kanten = obj(d.kanten);
  return {
    ok: true,
    fase: typeof d.fase === 'number' ? d.fase : 4,
    tafel: typeof d.tafel === 'number' ? d.tafel : 0,
    code: str(d.code).toUpperCase(),
    codes: arr(d.codes).filter((c): c is string => typeof c === 'string'),
    district: { hex: str(district.hex), naam: str(district.naam, 'The district'), god: str(district.god) },
    cap: typeof d.cap === 'number' ? d.cap : 1250,
    tafelCap: typeof d.tafelCap === 'number' ? d.tafelCap : 2500,
    rapporteur: typeof d.rapporteur === 'string' && d.rapporteur ? d.rapporteur : null,
    scenario: d.scenario && typeof d.scenario === 'object' ? (d.scenario as Record<string, unknown>) : null,
    artefact: parseArtefact(d.artefact),
    wrath: parseWrath(d.wrath),
    weer: parseWeer(d.weer),
    alleGelockt: d.alleGelockt === true,
    kanten: { wardens: parseKant(kanten.wardens, 'wardens'), unchained: parseKant(kanten.unchained, 'unchained') },
  };
}

// ── Stoelen ─────────────────────────────────────────────────────────────────────────────────────

export const KANT_VAN_TEAM: Record<Team, TafelKantSleutel> = { A: 'wardens', B: 'unchained' };
export const TEAM_VAN_KANT: Record<TafelKantSleutel, Team> = { wardens: 'A', unchained: 'B' };
export const KANT_NAAM: Record<TafelKantSleutel, string> = { wardens: 'Wardens', unchained: 'Unchained' };
export const TAFEL_TEAMNAMEN: Record<Team, string> = { A: 'Wardens', B: 'Unchained' };

/** De stoel van plek 1 (first general) of 2 (second general) aan een kant. */
export const stoelVoor = (kant: TafelKantSleutel, plek: 1 | 2): TeamStoel =>
  kant === 'wardens' ? (plek === 1 ? 'host' : 'host2') : (plek === 1 ? 'guest' : 'guest2');

export const kantVanStoel = (s: TeamStoel): TafelKantSleutel => KANT_VAN_TEAM[teamVan(s)];
export const plekVanStoel = (s: TeamStoel): 1 | 2 => (s === 'host' || s === 'guest' ? 1 : 2);
export const stoelLabel = (s: TeamStoel): string => `${KANT_NAAM[kantVanStoel(s)]} · ${plekVanStoel(s) === 1 ? '1st' : '2nd'} general`;

/** Alle generals van de tafel, met hun kant. */
export function alleGenerals(info: TafelInfo): (TafelGeneral & { kant: TafelKantSleutel })[] {
  return (['wardens', 'unchained'] as const).flatMap((k) => info.kanten[k].generals.map((g) => ({ ...g, kant: k })));
}

export const generalOpId = (info: TafelInfo | null | undefined, id: string | null | undefined) =>
  (info && id ? alleGenerals(info).find((g) => g.id === id) ?? null : null);

/** Wie zit waar (kolom `tow_games.stoelen`). */
export interface StoelBezetting { apparaat: string; general: string; naam: string; sinds?: string }
export type Stoelen = Partial<Record<TeamStoel, StoelBezetting>>;

export function leesStoelen(v: unknown): Stoelen {
  const o = obj(v);
  const uit: Stoelen = {};
  for (const s of ['host', 'host2', 'guest', 'guest2'] as const) {
    const b = obj(o[s]);
    if (typeof b.apparaat === 'string' && typeof b.general === 'string') {
      uit[s] = { apparaat: b.apparaat, general: b.general, naam: str(b.naam), sinds: typeof b.sinds === 'string' ? b.sinds : undefined };
    }
  }
  return uit;
}

/** De raiders aan deze tafel (huurlingen aan een kant). */
export const raidersVan = (info: TafelInfo | null | undefined) => (info ? alleGenerals(info).filter((g) => g.raider) : []);

/** Welk team heeft het artefact van de campagne in handen (null = op de shrine, of niemand). */
export function artefactTeam(info: TafelInfo | null | undefined): Team | null {
  const a = info?.artefact;
  if (!a || a.opShrine || !a.houder) return null;
  const g = generalOpId(info, a.houder);
  if (g) return TEAM_VAN_KANT[g.kant];
  return a.kant === 'stoppen' ? 'A' : a.kant === 'bevrijden' ? 'B' : null;
}

// ── Identiteit van dit toestel en de eigen stoel ────────────────────────────────────────────────

export const TAFEL_TEST_PREFIX = 'TAFELT';
export const isTafelTestCode = (code: string | null | undefined): boolean =>
  (code || '').trim().toUpperCase().startsWith(TAFEL_TEST_PREFIX);

function sessie(): Storage | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}

function nieuwId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
}

/** Een willekeurig id van dit toestel, waarmee een stoel "van jou" is. In de tafeltest per TABBLAD
 *  (sessionStorage), zodat vier tabbladen vier spelers zijn. */
export function apparaatId(code: string | null | undefined): string {
  if (isTafelTestCode(code)) {
    const s = sessie();
    let id = s?.getItem('tow:tafeltest-apparaat') ?? null;
    if (!id) { id = `tab-${nieuwId()}`; s?.setItem('tow:tafeltest-apparaat', id); }
    return id;
  }
  let id = getPersisted<string | null>('tow:apparaat', null);
  if (!id) { id = nieuwId(); setPersisted('tow:apparaat', id); }
  return id;
}

/** Mijn stoel aan deze tafel. Echt: localStorage (per toestel). Tafeltest: sessionStorage (per tabblad). */
export function leesMijnStoel(code: string | null | undefined): TeamStoel | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  let v: { code?: string; stoel?: string } | null = null;
  if (isTafelTestCode(c)) {
    try { v = JSON.parse(sessie()?.getItem('tow:tafeltest-stoel') ?? 'null'); } catch { v = null; }
  } else {
    v = getPersisted<{ code?: string; stoel?: string } | null>('tow:tafel-stoel', null);
  }
  return v && v.code === c && (['host', 'host2', 'guest', 'guest2'] as string[]).includes(v.stoel ?? '') ? (v.stoel as TeamStoel) : null;
}

export function bewaarMijnStoel(code: string, stoel: TeamStoel | null): void {
  const c = code.trim().toUpperCase();
  const waarde = stoel ? { code: c, stoel } : null;
  if (isTafelTestCode(c)) {
    try { sessie()?.setItem('tow:tafeltest-stoel', JSON.stringify(waarde)); } catch { /* geen opslag */ }
  } else {
    setPersisted('tow:tafel-stoel', waarde);
  }
}

// ── De tafel bewaren (voor herladen en voor battleByCode) ───────────────────────────────────────

const INFO_KEY = 'tow:tafel-info';
const TEST_KEY = 'tow:tafeltest';

/** De laatst geopende echte tafel op dit toestel. */
export function bewaarTafel(info: TafelInfo): void {
  setPersisted(INFO_KEY, info);
}

/** De tafel achter een tow_games-code (echt of tafeltest), of null. */
export function tafelInfo(code: string | null | undefined): TafelInfo | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (isTafelTestCode(c)) {
    const t = getPersisted<TafelInfo | null>(TEST_KEY, null);
    return t && tafelTestCode(t) === c ? t : null;
  }
  const i = getPersisted<TafelInfo | null>(INFO_KEY, null);
  return i && i.code === c ? i : null;
}

/** De tow_games-code van een tafeltest: eigen voorvoegsel, zodat hij nooit op een echte battle valt. */
export const tafelTestCode = (info: Pick<TafelInfo, 'code'>): string =>
  `${TAFEL_TEST_PREFIX}${(info.code || 'TEST').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'TEST'}`;

export const bewaarTafelTest = (info: TafelInfo): void => setPersisted(TEST_KEY, info);
export const tafelTestInfo = (): TafelInfo | null => getPersisted<TafelInfo | null>(TEST_KEY, null);

// ── Server ──────────────────────────────────────────────────────────────────────────────────────

/** Is deze campagnecode een Act 4-tafel? Gooit GEEN_TAFEL / ONBEKENDE_CODE als het dat niet is (ook als
 *  de server de functie nog niet kent: dan is het gewoon geen tafel). */
export async function tafelByCode(code: string): Promise<TafelInfo> {
  const c = code.trim().toUpperCase();
  if (isTafelTestCode(c)) {
    const t = tafelInfo(c);
    if (!t) throw new Error('TAFELTEST_ONVOLLEDIG');
    return t;
  }
  const { data, error } = await supabase.rpc('towc_tafel_by_code', { p_code: c });
  if (error) {
    // PGRST202 = de functie bestaat (nog) niet op deze database: geen tafel, gewoon de 1-tegen-1-weg.
    if ((error as { code?: string }).code === 'PGRST202') throw new Error('GEEN_TAFEL');
    throw error;
  }
  return parseTafel(data);
}

export interface StoelAntwoord { ok: boolean; fout?: string; stoelen: Stoelen; door?: StoelBezetting | null; stoel?: TeamStoel }

/** Claim / neem over / verlaat een stoel (server: `tow_game_stoel`, atomair). */
export async function stoelZet(code: string, stoel: TeamStoel, wie: { apparaat: string; general?: string; naam?: string }, actie: 'claim' | 'overnemen' | 'los' = 'claim'): Promise<StoelAntwoord> {
  const { data, error } = await supabase.rpc('tow_game_stoel', { p_code: code.trim().toUpperCase(), p_stoel: stoel, p_wie: wie, p_actie: actie });
  if (error) throw error;
  const d = obj(data);
  const door = obj(d.door);
  return {
    ok: d.ok === true,
    fout: typeof d.fout === 'string' ? d.fout : undefined,
    stoelen: leesStoelen(d.stoelen),
    door: typeof door.apparaat === 'string' ? { apparaat: door.apparaat, general: str(door.general), naam: str(door.naam) } : null,
    stoel: typeof d.stoel === 'string' ? (d.stoel as TeamStoel) : undefined,
  };
}

// ── De tafel als één campagne-battle (voor objectives, reminders, Wrath, officiele uitslag) ─────

function uniekePerks(lijst: Perk[]): Perk[] {
  const gezien = new Set<string>();
  return lijst.filter((p) => (gezien.has(p.perk) ? false : (gezien.add(p.perk), true)));
}

export function tafelAlsBattle(info: TafelInfo, code: string): CampaignBattle {
  const w = info.kanten.wardens;
  const u = info.kanten.unchained;
  return {
    ok: true,
    id: -4,
    code,
    status: 'legers_vergrendeld',
    type: 'calling',
    hex: info.district.hex,
    scenario: info.scenario,
    beideGelockt: info.alleGelockt,
    aanvaller: { id: 'wardens', naam: 'Wardens', factie: '', kleur: '#4a6f8a', ai: false },
    verdediger: { id: 'unchained', naam: 'Unchained', factie: '', kleur: '#8a3a2a', ai: false },
    aanvLijst: null,
    verdLijst: null,
    veteranen: { aanvaller: w.generals.flatMap((g) => g.veteranen), verdediger: u.generals.flatMap((g) => g.veteranen) },
    perks: { aanvaller: uniekePerks(w.generals.flatMap((g) => g.perks)), verdediger: uniekePerks(u.generals.flatMap((g) => g.perks)) },
    items: { aanvaller: w.generals.flatMap((g) => g.items), verdediger: u.generals.flatMap((g) => g.items) },
    fase: info.fase,
    // De uitslagtabel rekent op de punten van een hele kant (2 x 1250 = 2500 bij twee tegen twee).
    cap: info.tafelCap,
    warFase: true,
    actStatus: 'battles',
    battleMarch: false,
    weer: info.weer,
    hexGebouw: null,
    rollOff: w.rollOff || u.rollOff ? { aanvaller: w.rollOff ?? [], verdediger: u.rollOff ?? [] } : null,
    wrath: info.wrath,
  };
}

zetTafelBattleMaker((code) => {
  const info = tafelInfo(code);
  return info ? tafelAlsBattle(info, code.trim().toUpperCase()) : null;
});

// ── Contract 2: de uitslag ──────────────────────────────────────────────────────────────────────

export interface TafelUitslag {
  vp: { wardens: number; unchained: number };
  artefactControleur: string | null;
  raiders: Record<string, { beurten: number; eind: boolean }>;
  rondes: number;
  eindReden: EindReden;
  tempo: Record<string, unknown> | null;
  kills: Record<string, unknown>[];
  veteraan: Record<string, unknown>[];
}

export interface TafelUitkomst {
  ok: boolean;
  fout?: string;
  res?: string;
  fame?: Record<string, number>;
  artefactNaar?: string | null;
  district?: unknown;
  ritueel?: unknown;
}

/** Meld de uitslag van de tafel bij de campagne. Weigert in de tafeltest (daar gaat er nooit iets heen). */
export async function tafelUitslagMelden(code: string, uitslag: TafelUitslag): Promise<TafelUitkomst> {
  if (isTafelTestCode(code)) throw new Error('TAFELTEST');
  const { data, error } = await supabase.rpc('towc_tafel_uitslag_companion', { p_code: code.trim().toUpperCase(), p_uitslag: uitslag });
  if (error) throw error;
  const d = obj(data);
  return {
    ok: d.ok === true,
    fout: typeof d.fout === 'string' ? d.fout : undefined,
    res: typeof d.res === 'string' ? d.res : undefined,
    fame: d.fame && typeof d.fame === 'object' ? (d.fame as Record<string, number>) : undefined,
    artefactNaar: typeof obj(d.artefact).naar === 'string' ? (obj(d.artefact).naar as string) : null,
    district: d.district,
    ritueel: d.ritueel,
  };
}

/**
 * Kills en veteranen van ÉÉN stoel, in de vorm van het 1-tegen-1-rapport (CampaignResultReporter), met
 * het campagne-speler-id erbij (`speler`), zoals contract 2 vraagt.
 *
 * WAAROM EEN OMGEZETTE TRACKER. `collectVeteraan` kent alleen host tegen guest. In 2-tegen-2 staat een
 * unit onder `<stoel>:<id>` en wijst een kill naar `<vijandstoel>:<id>` (lib/teams.ts). We zetten de
 * tracker dus om naar "deze stoel = host, beide vijanden samen = guest" (vijand-ids met hun stoel ervoor,
 * precies zoals de kill-log ze noemt) en laten de bestaande functie het werk doen. Zo rekent de tafel
 * met dezelfde XP-regels als elke andere battle.
 */
export function veteraanVoorStoel(
  tracker: GameTracker,
  legers: Partial<Record<TeamStoel, Army | null>>,
  stoel: TeamStoel,
  gewonnen: boolean,
): VetRegel[] {
  const eigen = legers[stoel];
  if (!eigen) return [];
  const units: GameTracker['units'] = {};
  const vijanden = vijandStoelen(stoel);
  for (const [sleutel, t] of Object.entries(tracker.units ?? {})) {
    const { stoel: s, id } = leesKillVerwijzing(sleutel);
    if (!s) continue;
    if (s === stoel) units[`host:${id}`] = t;
    else if (vijanden.includes(s)) {
      // De kill-log van de vijand wijst naar `<mijnstoel>:<id>`; in de omgezette tracker heet mijn unit kaal `<id>`.
      units[`guest:${s}:${id}`] = {
        ...t,
        killDetails: t.killDetails?.map((d) => (d.unit && d.unit.startsWith(`${stoel}:`) ? { ...d, unit: d.unit.slice(stoel.length + 1) } : d)),
      };
    }
  }
  const vijandLeger: Army = {
    name: 'Enemies', points: null, system: '', faction: '', composition: '', raw: '',
    units: vijanden.flatMap((s) => (legers[s]?.units ?? []).map((u) => ({ ...u, id: `${s}:${u.id}` }))),
  };
  return collectVeteraan({ ...tracker, units }, eigen, 'host', gewonnen, vijandLeger);
}

/** De verliezen van één stoel (zelfde vorm als collectKills van het 1-tegen-1-rapport). */
export function killsVoorStoel(tracker: GameTracker, leger: Army | null | undefined, stoel: TeamStoel): Record<string, unknown>[] {
  const uit: Record<string, unknown>[] = [];
  for (const u of leger?.units ?? []) {
    const t = tracker.units[`${stoel}:${u.id}`];
    if (!t) continue;
    const lost = verliesVan(u, t);
    if (lost > 0 || t.fleeing) {
      uit.push({ side: teamVan(stoel) === 'A' ? 'attacker' : 'defender', unitId: u.id, unit: unitToonRegel(u), lost, fleeing: t.fleeing, ...(u.versterking ? { versterking: true } : {}) });
    }
  }
  return uit;
}

// ── De tafeltest (alleen de testbuild) ──────────────────────────────────────────────────────────

/** De King of the Shrine-sheet (v6) zoals de campagne hem op TEST bakt (tafel 3, The Phoenix Shrine),
 *  met een artefact aan de Unchained-kant. Alleen voor de tafeltest. */
const VOORBEELD_SHEET: Record<string, unknown> = {
  v: 6,
  fase: 4,
  scenario: 'act4-king-of-the-shrine',
  scenarioNaam: 'King of the Shrine',
  terrein: 'district',
  intentie: 'attack',
  tableW: 72,
  tableH: 48,
  bordLabel: '72×48″',
  blurb: 'Two against two in a district of Maerdrah’mar: hold the plaza around the shrine, and take the artefact.',
  reden: 'Act 4 · The Battle for the Districts: The Phoenix Shrine, the shrine of Asuryan. Two against two, 1250 points per general.',
  verdedigerKant: 'A',
  layout: {
    plein: { x: 36, y: 24, r: 4, label: 'Plaza' },
    objective: { x: 36, y: 24 },
    zones: [
      { x: 36, y: 0, w: 36, h: 12, kind: 'main', label: 'Unchained · 1st' },
      { x: 0, y: 0, w: 36, h: 12, kind: 'main', label: 'Unchained · 2nd' },
      { x: 0, y: 36, w: 36, h: 12, kind: 'main', label: 'Wardens · 1st' },
      { x: 36, y: 36, w: 36, h: 12, kind: 'main', label: 'Wardens · 2nd' },
    ],
  },
  secLayout: { baggage: [], quarters: false, objectives: [], artefacten: [{ x: 54, y: 12, id: 'bound-crown', aura: 6, naam: 'The Bound Crown', opShrine: false }] },
  terrain: [],
  secondaries: [],
  gameEnd: 'Six turns, or until the end time (no new round starts after 22:15). The plaza (about 8″ across) lies in the centre with the shrine in its middle.',
  scenarioBonus: {
    versie: 1,
    posten: [
      { id: 'ks-plaza-turn', vp: 50, max: 12, kant: 'beide', soort: 'per-beurt', label: 'King of the Shrine: plaza held at the end of a player’s turn' },
      { id: 'ks-plaza-end', vp: 150, kant: 'beide', soort: 'eind', label: 'King of the Shrine: plaza held at the end' },
      { id: 'ks-artefact', vp: 200, kant: 'beide', soort: 'eind', label: 'King of the Shrine: artefact controlled at the end' },
    ],
  },
};

const gen = (id: string, naam: string, factie: string, kleur: string, rol: 'aanvaller' | 'verdediger', mock: string, raider = false) =>
  ({ id, naam, factie, kleur, raider, battleId: null, rol, gelockt: true, lijst: null, perks: [], items: [], veteranen: [], mock });

/** Het ingebouwde voorbeeld: tafel 3, Wardens met een raider als huurling, de Bound Crown bij de Unchained. */
export const TAFEL_VOORBEELD: Record<string, unknown> = {
  ok: true, fase: 4, tafel: 3, code: 'VOORB3', codes: ['VOORB3', 'VOORB4'],
  district: { hex: '10,13', naam: 'The Phoenix Shrine', god: 'asuryan' },
  cap: 1250, tafelCap: 2500, rapporteur: 'c1',
  scenario: VOORBEELD_SHEET,
  artefact: { id: 'bound-crown', naam: 'The Bound Crown', god: 'asuryan', houder: 'c1', kant: 'bevrijden', opShrine: false },
  wrath: { d6: [4, 1, 6], worp: [4, 1, 6], modus: 'actief' },
  weer: null,
  alleGelockt: true,
  kanten: {
    wardens: { alliantie: 'stoppen', rollOff: [], generals: [gen('c2', 'Joris', 'ogre-kingdoms', '#3f7fb0', 'aanvaller', 'empire'), gen('c9', 'Arnold', 'lizardmen', '#2f8f6f', 'aanvaller', 'empire', true)] },
    unchained: { alliantie: 'bevrijden', rollOff: [], generals: [gen('c1', 'Joost', 'dark-elves', '#d97a2b', 'verdediger', 'orcs'), gen('c8', 'Tim', 'orc-and-goblin-tribes', '#834034', 'verdediger', 'orcs')] },
  },
};

/** Een variant van het voorbeeld: 'shrine' (artefact op de shrine, geen houder) of 'geen' (geen artefact). */
function voorbeeldVariant(variant: string | null): Record<string, unknown> {
  const v = JSON.parse(JSON.stringify(TAFEL_VOORBEELD)) as Record<string, unknown>;
  const sheet = v.scenario as Record<string, unknown>;
  const sec = sheet.secLayout as Record<string, unknown>;
  if (variant === 'shrine') {
    v.artefact = { id: 'bound-crown', naam: 'The Bound Crown', god: 'asuryan', houder: null, kant: null, opShrine: true };
    sec.artefacten = [{ x: 36, y: 24, id: 'bound-crown', aura: 6, naam: 'The Bound Crown', opShrine: true }];
    v.code = 'VOORBS';
  } else if (variant === 'geen') {
    v.artefact = null;
    sec.artefacten = [];
    const sb = sheet.scenarioBonus as { posten: { id: string }[] };
    sb.posten = sb.posten.filter((p) => p.id !== 'ks-artefact');
    v.code = 'VOORBG';
  }
  return v;
}

/** De tafel voor de tafeltest uit de URL: `#tafel=<base64url van een contract-1-object>`, of het
 *  ingebouwde voorbeeld (met `variant`). null bij een onbruikbaar object. Zonder `mock` per general
 *  spelen de Wardens het Empire-leger en de Unchained de Orcs uit het scenario lab. */
export function tafelTestUitUrl(hash: string, variant: string | null): TafelInfo | null {
  const m = /(?:^#?|&)tafel=([^&]+)/.exec(hash || '');
  let raw: unknown = null;
  if (m) {
    try { raw = JSON.parse(base64UrlNaarTekst(decodeURIComponent(m[1]))); } catch { return null; }
  } else {
    raw = voorbeeldVariant(variant);
  }
  let info: TafelInfo;
  try { info = parseTafel(raw); } catch { return null; }
  for (const k of ['wardens', 'unchained'] as const) {
    info.kanten[k].generals = info.kanten[k].generals.map((g) => ({ ...g, mock: g.mock ?? (k === 'wardens' ? 'empire' : 'orcs'), gelockt: true }));
  }
  return { ...info, alleGelockt: true };
}
