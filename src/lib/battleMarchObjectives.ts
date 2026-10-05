// BATTLE MARCH-OBJECTIVES — de briefing per objective op het pre-game-scherm (05-10-2026).
//
// Joost (05-10-2026): "Battle quests is geen ding. Dit zijn Objectives." En: "bij treasure troves
// staat niet precies waar je ze neer moet leggen, terwijl de regels-site het uitlegt."
//
// WAAROM DIT BESTAND. De campagne levert alleen een id ('bm-troves-3') en coördinaten (`secLayout`).
// Wat een speler aan tafel nodig heeft is (1) WAAR het ding komt, in een zin die je met een meetlint
// kunt narekenen, en (2) wat de regel ervan zegt. Het eerste rekenen we hier uit de coördinaten; het
// tweede is LETTERLIJK overgenomen van tow.whfb.app ("Battle March: General's Companion").
//
// HARDE AFSPRAAK (Joost): "nooit eigen interpretatie-regels in de app". Elke `text` hieronder is een
// letterlijke kopie van de regel-site — alleen de krullende aanhalingstekens zijn recht gemaakt. Wat
// we WEL zelf schrijven zijn koppen, titels en beschrijvingen van DATA (aantallen, posities). De test
// (scripts/tests/battle-march-objectives.test.cjs) legt elke regeltekst naast een canonieke kopie,
// zodat een parafrase van later meteen rood wordt.
//
// Puur: geen React, geen fetch — los te testen en door elk scherm te gebruiken.

/** Eén regelblok: een kop (van ons of van de site) en de LETTERLIJKE regeltekst. */
export interface ObjectiveRuleBlock { heading: string; text: string }

/** Alles wat het scherm over één objective toont. */
export interface ObjectiveBriefing {
  /** Het campagne-id, bv. 'bm-troves-3'. */
  id: string;
  /** Leesbare titel, bv. 'Treasure troves (3)' / 'Strategic landmark'. */
  title: string;
  /** Eén regel uit de DATA: hoeveel en op welke base (40mm/100mm zijn letterlijke feiten uit de regel). */
  what: string;
  /** Waar het ligt, uitgerekend uit de coördinaten (`describePlacement`), of null zonder coördinaten. */
  placement: string | null;
  /** De KORTE uitleg: plaatsingsbeperking, controle-eis en VP-regel — letterlijk. */
  short: ObjectiveRuleBlock[];
  /** De volledige letterlijke teksten voor het uitklapbare "Full rules"-deel. */
  full: ObjectiveRuleBlock[];
  /** Alleen bij de landmark: de Unusual Properties-tabel, letterlijk. Hoort direct na het LAATSTE
   *  blok van `short` (en van `full`): die zin verwijst naar "the table below". */
  table?: { heading: string; columns: [string, string]; rows: [string, string][] };
  /** Bron, bv. "Battle March: General's Companion, p. 24–25, 27". Leeg bij een onbekend id. */
  source: string;
}

// ── De letterlijke regelteksten ───────────────────────────────────────────────────────────────────
// Bron: tow.whfb.app, "Battle March: General's Companion". NIET herschrijven, NIET inkorten binnen een
// zin. Een andere tekst nodig? Kopieer hem van de site en zet hem er als nieuwe constante bij.

const BOEK = "Battle March: General's Companion";

/** p. 24 — Treasure Troves (inleiding). */
export const BM_TROVE_INTRO =
  'Represented by a number of miniature dioramas, each occupying a 40mm round base, treasure troves are a type of battlefield decoration. ' +
  'They can represent many things that the armies are keen to obtain, such as piles of loot, supplies of vittles, or caches of weapons. ' +
  'They may even represent such things as wounded comrades, messengers or spies carrying vital information.';

/** p. 24 — Placement of Treasure Troves (de site heeft een typfout in de kop; die nemen we niet over). */
export const BM_TROVE_PLACEMENT =
  'Treasure troves are placed as shown on the maps opposite, but cannot be placed within 3" of a terrain feature or straddling a low linear obstacle. ' +
  'If necessary, move the terrain by the smallest possible amount to allow the treasure trove to be placed.';

/** p. 25 — Landmarks (inleiding). */
export const BM_LANDMARK_INTRO =
  'A strategic landmark is a terrain feature occupying a 100mm round base. ' +
  'All strategic landmarks are impassable terrain over which no line of sight can be drawn.';

/** p. 25 — Placement of a Strategic Landmark. */
export const BM_LANDMARK_PLACEMENT =
  'A strategic landmark must be placed in the centre of the battlefield, but cannot be placed within 3" of a terrain feature or straddling a low linear obstacle. ' +
  'If necessary, move the terrain by the smallest possible amount to allow the strategic landmark to be placed.';

/** p. 25 — Unusual Properties (de worp vóór deployment). */
export const BM_LANDMARK_UNUSUAL =
  "Once a strategic landmark has been placed on the battlefield, before armies are deployed, one of the players rolls on the table below. " +
  "If, at the end of either player's turn, a unit was determined to be in control of the strategic landmark, that unit benefits from the landmark's unusual property until the end of the next turn:";

/** p. 25 — Unusual Properties Table. */
export const BM_LANDMARK_TABLE: [string, string][] = [
  ['1-2', 'Magic in the Air: The Winds of Magic flow unusually around this particular strategic landmark. The controlling unit gains the Magic Resistance (-2) special rule.'],
  ['3-4', 'Righteous Zeal: For unknown reasons, those that hold this strategic landmark feel compelled to drive away interlopers. The controlling unit gains the Frenzy special rule.'],
  ['5-6', '"We\'re Not Leaving": Having gained control of this strategic landmark, its defenders will stubbornly refuse to give it up. The controlling unit gains the Stubborn special rule.'],
];

/** p. 25 — Controlling Objectives, eerste alinea, VOLLEDIG (voor "Full rules"). */
export const BM_CONTROL_FULL_1 =
  'Games of Battle March represent small forces, often scouting ahead of a much larger army, as they attempt to secure resources and capture vital landmarks. ' +
  "To represent this, at the end of each player's turn, an objective, be it a treasure trove or a strategic landmark, can be controlled by a single unit. " +
  'In order to control an objective, a unit must be within 3" of it and have a Unit Strength of 5 or more. ' +
  'Units that are fleeing or that have succumbed to Stupidity cannot control an objective.';

/** p. 25 — Controlling Objectives, tweede alinea. */
export const BM_CONTROL_FULL_2 =
  'If two or more eligible units are within 3" of an objective, the closest unit controls it. ' +
  'If two or more eligible units are equally close to an objective, the unit with the higher Unit Strength controls it. ' +
  "However, should both have the same Unit Strength, the objective is 'contested' and neither unit controls it.";

/** De KORTE controle-eis: letterlijk het staartstuk van BM_CONTROL_FULL_1 (vanaf "In order to …"). */
export const BM_CONTROL_SHORT =
  'In order to control an objective, a unit must be within 3" of it and have a Unit Strength of 5 or more. ' +
  'Units that are fleeing or that have succumbed to Stupidity cannot control an objective.';

/** p. 27 — Victory Points: treasure troves. */
export const BM_VP_TROVES =
  "Treasure Troves: At the end of each player's turn, a player wins a bonus of 10 Victory Points for each treasure trove they control.";

/** p. 27 — Victory Points: strategic landmarks. */
export const BM_VP_LANDMARK =
  "Strategic Landmarks: At the end of each player's turn, if one player controls a strategic landmark, they win a bonus of 25 Victory Points.";

/** p. 27 — Game Length. Voor de Battle-sectie van het scherm. */
export const BM_GAME_LENGTH =
  'All games of Battle March last for five rounds, until one side concedes, or until the agreed time limit is reached.';

/** p. 27 — First Turn. Voor de Reminders-sectie (de roll-off voor de eerste beurt). */
export const BM_FIRST_TURN =
  'Once deployment is complete, the winner of a roll-off chooses which player will take the first turn.';

// ── Plaatsing in woorden ──────────────────────────────────────────────────────────────────────────

/** Tolerantie voor "ligt op de middellijn" / "staat in het midden" / "is symmetrisch" (inches). */
const TOL = 0.01;
const gelijk = (a: number, b: number) => Math.abs(a - b) < TOL;

/** Inches leesbaar: hele getallen kaal, halven als ½, de rest met hoogstens twee decimalen.
 *  WAAROM twee en niet één: "nooit stilletjes afronden" — 13.25 als 13.3 printen zou een maat
 *  verzinnen die de campagne niet gaf. Eén decimaal blijft één decimaal (12.3 → "12.3"). */
export function inch(v: number): string {
  const neg = v < 0;
  const a = Math.abs(v);
  const heel = Math.floor(a + TOL);
  const rest = a - heel;
  let s: string;
  if (Math.abs(rest) < TOL) s = String(heel);
  else if (gelijk(rest, 0.5)) s = heel === 0 ? '½' : `${heel}½`;
  else s = String(Math.round(a * 100) / 100);
  return `${neg ? '-' : ''}${s}″`;
}

/**
 * De coördinaten van de campagne als ÉÉN zin die je aan tafel kunt nameten.
 *
 * Coördinaten zijn tafel-inches, oorsprong linksboven, x langs `tableW` (de lange kant), y langs
 * `tableH`. Drie herkenbare patronen krijgen een korte zin (één punt in het midden; twee of drie
 * symmetrisch op de middellijn). Alles daarbuiten krijgt per punt de afstand tot de linker- en
 * bovenrand ZOALS DE KAART GETEKEND IS — precies, nooit afgerond tot een patroon dat er niet is.
 * Null zonder punten of zonder bruikbare tafelmaat.
 */
export function describePlacement(points: { x: number; y: number }[], tableW: number, tableH: number): string | null {
  if (!Number.isFinite(tableW) || !Number.isFinite(tableH) || tableW <= 0 || tableH <= 0) return null;
  const pts = (points ?? []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length === 0) return null;

  const midX = tableW / 2;
  const midY = tableH / 2;
  const opLijn = pts.every((p) => gelijk(p.y, midY));
  // "Korte rand" klopt alleen als x echt langs de LANGE kant loopt; bij een vierkante of staande tafel
  // zou de zin een rand noemen die niet de korte is — dan liever de precieze terugval.
  const liggend = tableW > tableH + TOL;
  const opX = [...pts].sort((a, b) => a.x - b.x);

  if (pts.length === 1 && opLijn && gelijk(pts[0].x, midX)) return 'In the centre of the table.';

  if (opLijn && liggend && pts.length === 2) {
    const [l, r] = opX;
    if (gelijk(l.x + r.x, tableW) && r.x - l.x > TOL) {
      return `On the centre line, ${inch(l.x)} in from each short edge (${inch(r.x - l.x)} apart).`;
    }
  }

  if (opLijn && liggend && pts.length === 3) {
    const [l, m, r] = opX;
    const d = m.x - l.x;
    if (gelijk(m.x, midX) && d > TOL && gelijk(r.x - m.x, d)) {
      return `On the centre line: one in the middle of the table, and one ${inch(d)} to either side of it (${inch(l.x)} in from each short edge).`;
    }
  }

  // Terugval: per punt, in de aangeleverde volgorde. Eén punt krijgt geen nummer.
  const zin = (p: { x: number; y: number }) => `${inch(p.x)} from the left edge, ${inch(p.y)} from the top edge`;
  const delen = pts.length === 1 ? [zin(pts[0])] : pts.map((p, i) => `${i + 1}: ${zin(p)}`);
  return `${delen.join('; ')} (left and top as drawn on the map).`;
}

// ── Briefings ─────────────────────────────────────────────────────────────────────────────────────

/** 'strategic-2' → 'Strategic 2'. Alleen voor ids die we niet kennen: een titel, geen regel. */
const titelVan = (id: string): string =>
  id.split(/[-_\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/**
 * Eén briefing per secondary-id van de sheet, in dezelfde volgorde.
 *
 * Live gebruikt de campagne alleen 'bm-troves-2', 'bm-troves-3' en 'bm-landmark'. Elk ander id (oudere
 * sheets: 'domination', 'strategic-2', …) krijgt een kale kaart met alleen een titel — we hebben van
 * die objectives geen letterlijke tekst, en dan zeggen we liever niets dan iets verzonnens.
 *
 * Troves: het AANTAL in de titel komt uit het id; de PLAATS komt uit de coördinaten. Wijken die twee
 * af, dan voegen we niets toe: de kaart en de "Where"-regel laten dan gewoon zien wat er ligt.
 */
export function objectiveBriefings(
  secondaries: string[],
  secLayout: { specialFeature?: { x: number; y: number }; objectives: { x: number; y: number; n: number }[] } | null,
  tableW: number | null,
  tableH: number | null,
): ObjectiveBriefing[] {
  const maat = tableW != null && tableH != null;
  const plaats = (pts: { x: number; y: number }[]) => (maat ? describePlacement(pts, tableW as number, tableH as number) : null);

  return (secondaries ?? []).filter((s) => typeof s === 'string' && s.trim()).map((raw): ObjectiveBriefing => {
    const id = raw.trim();
    const troves = /^bm-troves-(\d+)$/.exec(id);
    if (troves) {
      const n = Number(troves[1]);
      // Op het nummer van de kaart gesorteerd, zodat "1:", "2:" in de terugval-zin de cijfers op de
      // getekende kaart volgen.
      const pts = [...(secLayout?.objectives ?? [])].sort((a, b) => a.n - b.n || a.x - b.x);
      return {
        id,
        title: `Treasure troves (${n})`,
        what: n === 1 ? '1 treasure trove, on a 40mm round base.' : `${n} treasure troves, each on a 40mm round base.`,
        placement: plaats(pts),
        short: [
          { heading: 'Placement', text: BM_TROVE_PLACEMENT },
          { heading: 'Control', text: BM_CONTROL_SHORT },
          { heading: 'Victory points', text: BM_VP_TROVES },
        ],
        full: [
          { heading: 'Treasure Troves', text: BM_TROVE_INTRO },
          { heading: 'Placement of Treasure Troves', text: BM_TROVE_PLACEMENT },
          { heading: 'Controlling Objectives', text: BM_CONTROL_FULL_1 },
          { heading: 'Controlling Objectives', text: BM_CONTROL_FULL_2 },
          { heading: 'Victory Points', text: BM_VP_TROVES },
        ],
        source: `${BOEK}, p. 24–25, 27`,
      };
    }
    if (id === 'bm-landmark') {
      const sf = secLayout?.specialFeature;
      return {
        id,
        title: 'Strategic landmark',
        what: '1 strategic landmark, on a 100mm round base.',
        placement: sf ? plaats([sf]) : null,
        // De Unusual Properties-zin staat ACHTERAAN: hij verwijst naar "the table below", dus de tabel
        // (`table`) moet er direct op volgen — het scherm tekent hem na het laatste blok.
        short: [
          { heading: 'Placement', text: BM_LANDMARK_PLACEMENT },
          { heading: 'Control', text: BM_CONTROL_SHORT },
          { heading: 'Victory points', text: BM_VP_LANDMARK },
          { heading: 'Unusual property', text: BM_LANDMARK_UNUSUAL },
        ],
        full: [
          { heading: 'Landmarks', text: BM_LANDMARK_INTRO },
          { heading: 'Placement of a Strategic Landmark', text: BM_LANDMARK_PLACEMENT },
          { heading: 'Controlling Objectives', text: BM_CONTROL_FULL_1 },
          { heading: 'Controlling Objectives', text: BM_CONTROL_FULL_2 },
          { heading: 'Victory Points', text: BM_VP_LANDMARK },
          { heading: 'Unusual Properties', text: BM_LANDMARK_UNUSUAL },
        ],
        table: {
          heading: 'Unusual Properties Table',
          columns: ['D6', 'Unusual Property'],
          rows: BM_LANDMARK_TABLE.map(([a, b]) => [a, b] as [string, string]),
        },
        source: `${BOEK}, p. 25, 27`,
      };
    }
    return { id, title: titelVan(id), what: '', placement: null, short: [], full: [], source: '' };
  });
}
