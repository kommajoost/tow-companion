/**
 * TERREIN UIT DE CAMPAGNE-SHEET (18-10-2026, herzien 22-10-2026).
 *
 * De campagne genereert het terrein van een battle en bakt het in de BattleSheet (`sheet.terrain`,
 * inches). Deze module LEEST dat alleen: welke soort, welk officieel kenmerk, wat het aan tafel doet,
 * en of het een scenario-stuk van de verdediger is. Niets wordt hier uitgerekend of verzonnen.
 *
 * KOPIE van de namen, de legenda en de effectregels in de campagne-repo (site/src/data/battlefield.ts:
 * TERRAIN_TYPES, terreinKenmerk, terreinCategorie, TERREIN_EFFECT, terreinLegenda). Andere repo, dus
 * geen import: wijzig je het daar, wijzig het hier.
 *
 * Wat de campagne sinds 20/21-10-2026 (Joost) maakt:
 *   · per hex een vaste mix: `hill`, `wood` (difficult), `field`/`rocky-ground`/`marsh` (difficult),
 *     `outcrop` (Rocky outcrop, impassable), `bog` en `scree` (Scree slope), allebei dangerous, en op de
 *     vlakte een `obstacle` (lage muur, low linear obstacle) als gewoon stuk;
 *   · in Breakthrough de lage muur van de VERDEDIGER (`byDefender`): een scenario-stuk dat hij vóór het
 *     om-de-beurt plaatsen waar hij wil op zijn eigen helft zet; hij scattert niet. De coördinaten op
 *     de sheet zijn alleen een voorbeeld, dus het bord tekent hem niet.
 *   · GEEN hex-gebouw meer. Sheets van 18-10 t/m 20-10 (gebouw + muur `preplaced`) en van vóór 18-10
 *     (sterktepunt met `side`, rivier-strook als 'marsh') blijven gewoon lezen.
 */

export interface CampaignTerrainPiece {
  id?: string | null;
  type: string;
  x: number; y: number; w: number; h: number;
  difficult?: boolean;
  dangerous?: boolean;
  impassable?: boolean;
  obstacle?: boolean;
  /** Op wiens helft het stuk hoort (het gebouw van de hex, of het oude strongpunt). */
  side?: 'defender' | 'attacker' | null;
  /** Staat al op tafel vóór het om-de-beurt plaatsen; wordt niet geplaatst of gescatterd (18-10). */
  preplaced?: boolean;
  /** De lage muur van de verdediger in Breakthrough (20-10): hij zet hem zelf, op zijn eigen helft,
   *  vóór de rest van het terrein; scattert niet. Geen vaste plek, dus niet op het bord. */
  byDefender?: boolean;
}

export type TerrainTrait = 'impassable' | 'dangerous' | 'obstacle' | 'difficult';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Eén stuk uit de sheet. Een stuk zonder type valt weg; zonder bruikbare maat krijgt het 0 en
 *  wordt het wel genoemd maar niet getekend (de tekenaar slaat w/h <= 0 over). */
export function parseTerrainPiece(v: unknown): CampaignTerrainPiece | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const type = typeof o.type === 'string' && o.type.trim() ? o.type.trim() : null;
  if (!type) return null;
  return {
    id: typeof o.id === 'string' ? o.id : null,
    type,
    x: num(o.x) ?? 0,
    y: num(o.y) ?? 0,
    w: num(o.w) ?? 0,
    h: num(o.h) ?? 0,
    difficult: o.difficult === true,
    dangerous: o.dangerous === true,
    impassable: o.impassable === true,
    obstacle: o.obstacle === true,
    side: o.side === 'defender' || o.side === 'attacker' ? o.side : null,
    preplaced: o.preplaced === true,
    byDefender: o.byDefender === true,
  };
}

/** Alle stukken uit `sheet.terrain`. */
export function parseSheetTerrain(v: unknown): CampaignTerrainPiece[] {
  return (Array.isArray(v) ? v : []).map(parseTerrainPiece).filter((t): t is CampaignTerrainPiece => !!t);
}

type TraitInput = Pick<CampaignTerrainPiece, 'type' | 'difficult' | 'dangerous' | 'impassable' | 'obstacle'>;

/** Het officiële kenmerk. De vlaggen op het stuk winnen; zonder vlag de default van het type, zodat
 *  een oud gebouw of een rotspartij zonder vlag toch "impassable" heet. */
export function terrainTrait(t: TraitInput): TerrainTrait | null {
  if (t.impassable) return 'impassable';
  if (t.dangerous) return 'dangerous';
  if (t.obstacle) return 'obstacle';
  if (t.difficult) return 'difficult';
  if (t.type === 'building' || t.type === 'outcrop') return 'impassable';
  if (t.type === 'obstacle') return 'obstacle';
  return null;
}

/** Naam (enkelvoud, meervoud) van de soorten die de campagne genereert (labels van TERRAIN_TYPES). */
const NAMES: Record<string, [string, string]> = {
  hill: ['Hill', 'hills'],
  wood: ['Woods', 'woods'],
  'dense-wood': ['Dense woods', 'dense woods'],
  rocks: ['Rocky ground', 'rocky ground'],
  'rocky-ground': ['Rocky ground', 'rocky ground'],
  outcrop: ['Rocky outcrop', 'rocky outcrops'],
  bog: ['Bog', 'bogs'],
  scree: ['Scree slope', 'scree slopes'],
  building: ['Building', 'buildings'],
  obstacle: ['Low wall', 'low walls'],
  marsh: ['Marsh', 'marshes'],
  field: ['Field', 'fields'],
  forest: ['Woods', 'woods'],
  water: ['Water feature', 'water features'],
};
const pretty = (s: string): string => s.replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());

export const terrainName = (type: string): string => NAMES[type.toLowerCase()]?.[0] ?? pretty(type);
export const terrainPlural = (type: string): string => NAMES[type.toLowerCase()]?.[1] ?? `${pretty(type).toLowerCase()}s`;

/** De legenda-regel: "Rocky outcrop · impassable", "Woods · difficult", "Hill". */
export function terrainLegend(t: TraitInput): string {
  const k = terrainTrait(t);
  return k ? `${terrainName(t.type)} · ${k}` : terrainName(t.type);
}

/** Het kenmerk voluit, zoals het achter de naam in de boodschappenlijst staat. */
export const TRAIT_TEXT: Record<TerrainTrait, string> = {
  impassable: 'impassable',
  dangerous: 'dangerous terrain',
  obstacle: 'low linear obstacle',
  difficult: 'difficult terrain',
};

/** De zes categorieën waar een effectregel bij hoort (20-10-2026). */
export type TerrainCategory = 'difficult' | 'dangerous' | 'wood' | 'hill' | 'obstacle' | 'impassable';

/** Wat een stuk aan tafel DOET, per categorie. Letterlijke KOPIE van TERREIN_EFFECT in de campagne
 *  (teksten van Joost, 20-10-2026); de volledige regel staat op tow.whfb.app en die is aan tafel de
 *  scheidsrechter. */
export const TERRAIN_EFFECT: Record<TerrainCategory, string> = {
  difficult: '−1 Movement (minimum 1). A charge through it rolls 2D6 and discards the highest. A unit with 25% or more of its models inside is Disrupted.',
  dangerous: 'As difficult, and each model that starts, ends or moves through it rolls a D6: on a 1 it loses a Wound.',
  wood: 'Difficult. A unit with more than half inside has partial cover (−1 to hit). No line of sight through it.',
  hill: 'No movement penalty. +1 combat result for the higher fighting rank. A unit wholly on it shoots with one extra rank and sees over units below.',
  obstacle: 'Crossing it counts as difficult terrain. A unit straddling it in combat is Disrupted. Charging a unit that defends it is a disordered charge.',
  impassable: 'Cannot be entered; units go around. Blocks line of sight.',
};

/** De categorie van één stuk (kopie van terreinCategorie). Een bos is een bos (eigen regel), tenzij
 *  het als dangerous is opgeslagen: dan wint het gevaar. Een heuvel heeft geen kenmerk maar wél een regel. */
export function terrainCategory(t: TraitInput): TerrainCategory | null {
  const k = terrainTrait(t);
  if (k === 'impassable' || k === 'dangerous' || k === 'obstacle') return k;
  if (t.type === 'wood' || t.type === 'forest' || t.type === 'dense-wood') return 'wood';
  if (t.type === 'hill' || t.type === 'low_hill' || t.type === 'high_hill') return 'hill';
  return k === 'difficult' ? 'difficult' : null;
}

/** De effectregel van één stuk, of null als er niets bijzonders geldt. */
export function terrainEffect(t: TraitInput): string | null {
  const c = terrainCategory(t);
  return c ? TERRAIN_EFFECT[c] : null;
}

// ── Kleuren (22-10-2026) ─────────────────────────────────────────────────────────────────────────
// Dezelfde tinten als het bord in de campagne-app (BattleBoard, app-huid), zodat een soort in beide
// apps hetzelfde oogt. `scree` heeft daar (nog) geen eigen stijl; hier de kleur van TERRAIN_TYPES
// (#7d7466) als vlak, gestippeld zodat hij niet voor rotsgrond doorgaat. Gebruikt door het bord en
// door de kleurstaaltjes in de terreinlijst.
export interface TerrainStyle { fill: string; edge: string; ink: string; rx: number }
const TERRAIN_STYLE: Record<string, TerrainStyle> = {
  building: { fill: '#5a4632', edge: '#2e2318', ink: '#f2e7cd', rx: 0.3 },
  obstacle: { fill: '#6b5436', edge: '#2e2318', ink: '#3a2f1c', rx: 0.2 },
  hill: { fill: 'rgba(176,138,79,0.42)', edge: 'rgba(120,92,40,0.75)', ink: '#5c4326', rx: 2 },
  wood: { fill: 'rgba(78,122,69,0.42)', edge: 'rgba(46,82,40,0.8)', ink: '#24401f', rx: 1.4 },
  'dense-wood': { fill: 'rgba(47,90,50,0.62)', edge: 'rgba(28,56,30,0.9)', ink: '#f2e7cd', rx: 1.4 },
  rocks: { fill: 'rgba(138,132,120,0.55)', edge: 'rgba(70,66,58,0.85)', ink: '#2b2722', rx: 0.8 },
  marsh: { fill: 'rgba(79,123,138,0.42)', edge: 'rgba(48,86,100,0.8)', ink: '#1f3b46', rx: 1.8 },
  field: { fill: 'rgba(154,138,58,0.38)', edge: 'rgba(110,98,38,0.8)', ink: '#4a3f14', rx: 0.4 },
  'rocky-ground': { fill: 'rgba(143,134,118,0.45)', edge: 'rgba(90,84,74,0.8)', ink: '#2b2722', rx: 0.8 },
  outcrop: { fill: '#6e675c', edge: '#2b2722', ink: '#f2e7cd', rx: 1.2 },
  bog: { fill: 'rgba(63,106,110,0.55)', edge: 'rgba(36,70,74,0.9)', ink: '#f2e7cd', rx: 1.8 },
  scree: { fill: 'rgba(125,116,102,0.6)', edge: 'rgba(72,66,56,0.9)', ink: '#f2e7cd', rx: 1.4 },
};
const TERRAIN_UNKNOWN: TerrainStyle = { fill: 'rgba(120,92,40,0.25)', edge: 'rgba(120,92,40,0.7)', ink: '#3a2f1c', rx: 1 };
export const terrainStyle = (type: string): TerrainStyle => TERRAIN_STYLE[type] ?? TERRAIN_UNKNOWN;
