// DE GENERATOR: met één druk op de knop een compleet, speelbaar potje uitrollen.
//
// Joost (13-09): in de Battlefield-stap kies je "Generate" — alles wordt gerold — of "Step by step".
// Na een Generate moet elk onderdeel APART te herrollen of met de hand te zetten zijn zonder de rest
// kwijt te raken. Vandaar dat elke `herrol*` hieronder precies één ding aanraakt en de rest letterlijk
// doorgeeft.
//
// WAAROM ALLES PUUR IS. Deze sheet woont op de tracker en synct realtime naar je tegenstander. Muteer
// je hem in plaats van hem te vervangen, dan ziet React geen wijziging (zelfde referentie) en blijft
// het scherm op het oude scenario staan terwijl de cloud het nieuwe al heeft. Alles hier is dus
// copy-on-write: nooit een veld van de binnenkomende sheet overschrijven.
//
// WAAROM crypto.getRandomValues EN NIET Math.random. Aan tafel is een worp een worp — deze bepaalt
// welk scenario je de komende twee uur speelt, dus hij hoort net zo eerlijk te zijn als de dobbelsteen
// die ernaast ligt. De app doet dat elders al zo (`makeCode` in game.tsx). Met rejection sampling,
// anders vallen 1..4 nét iets vaker dan 5..6 omdat 2^32 niet deelbaar is door 6.
//
// WAAR DE SPELINHOUD VANDAAN KOMT. Niets hier verzint regels: de scenariotabel komt uit `battle.ts`,
// de weertabel letterlijk uit `weather.ts`, en het terreinaantal uit `recommendedTerrainCount` (de
// rulebook-richtlijn van één feature per 12 inch die de app al hanteert).
import {
  SCENARIOS,
  SECONDARY_OBJECTIVES,
  recommendedTerrainCount,
  scatterTerrain,
  scenariosInGroep,
  type ScenarioDef,
} from './battle';
import { formatDef, type BattleFormat, type BattleSheet, type SheetWorpen } from './battleSheet';
import { alsGameWeer, weerVoorWorp } from './weather';

// ── Dobbelen ────────────────────────────────────────────────────────────────────────────────────

/** Een eerlijk getal 0..n-1. Rejection sampling: we gooien de trekkingen weg die in het "restje"
 *  bovenaan het Uint32-bereik vallen, want dat restje is precies wat modulo scheef zou trekken. */
function randInt(n: number): number {
  if (n <= 1) return 0;
  const grens = Math.floor(0x1_0000_0000 / n) * n;
  const arr = new Uint32Array(1);
  // In de praktijk is dit één ronde; de kans op een tweede is < 1 op 700 miljoen bij n = 6.
  for (;;) {
    crypto.getRandomValues(arr);
    if (arr[0] < grens) return arr[0] % n;
  }
}

/** Eén D6. */
const d6 = (): number => randInt(6) + 1;

// ── Scenario uit de D6-tabel van een groep ──────────────────────────────────────────────────────

// Pitched en Matched Play hebben zes scenario's met `d6` 1..6. Battle March heeft er drie die elk
// TWEE nummers beslaan, en die staan in `d6Label` als "1-2" / "3-4" / "5-6". Dat bereik lezen we uit
// het label in plaats van de drie gevallen hard te coderen: komt er ooit een vierde Battle
// March-kaart bij, of een tabel met een ander bereik, dan klopt dit nog steeds.
const D6_BEREIK = /^\s*(\d)\s*-\s*(\d)\s*$/;

/** Welke D6-worpen dit scenario opleveren. Zonder bruikbaar label is dat gewoon zijn eigen `d6`. */
function bereikVan(s: ScenarioDef): [number, number] {
  const m = s.d6Label ? D6_BEREIK.exec(s.d6Label) : null;
  if (m) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    if (lo <= hi) return [lo, hi];
  }
  const enkel = s.d6Label ? Number(s.d6Label.trim()) : NaN;
  if (Number.isInteger(enkel)) return [enkel, enkel];
  return [s.d6, s.d6];
}

/** Het scenario dat bij deze worp hoort. Valt terug op `d6` als geen enkel bereik matcht, en op het
 *  eerste scenario van de groep als de tabel onverwacht een gat heeft — liever een speelbaar potje
 *  dan een lege sheet. */
function scenarioVoorWorp(groep: ScenarioDef['group'] & string, worp: number): ScenarioDef {
  const lijst = scenariosInGroep(groep);
  const raak = lijst.find((s) => {
    const [lo, hi] = bereikVan(s);
    return worp >= lo && worp <= hi;
  });
  return raak ?? lijst.find((s) => s.d6 === worp) ?? lijst[0] ?? SCENARIOS[0];
}

// ── Genereren ───────────────────────────────────────────────────────────────────────────────────

export interface GenereerOpties {
  format: BattleFormat;
  /** Weer meerollen? Buiten de campagne is weer OPTIONEEL (Joost, 13-09). */
  weer: boolean;
  /** Een secondary objective meerollen? */
  secondaries: boolean;
  /** Tafelmaat; weglaten = het standaardformaat van dit format. */
  tableW?: number;
  tableH?: number;
}

/** Het weer als `{ weer, worp }`-paar, of leeg als er niet met weer gespeeld wordt. */
function rolWeer(): { weer: BattleSheet['weer']; worp: number } {
  const worp = d6();
  const def = weerVoorWorp(worp);
  return def ? { weer: alsGameWeer(def), worp } : { weer: null, worp };
}

/** Eén secondary objective, willekeurig uit de lijst.
 *
 *  EERLIJK ZIJN OVER WAT DIT IS. Dit is GEEN D6-tabel uit het boek. De Matched Play Guide geeft de
 *  secondary objectives als een LIJST om uit te kiezen, niet als een genummerde tabel om op te
 *  gooien — dat het er toevallig zes zijn maakt er nog geen D6-tabel van. Daarom zetten we hier
 *  bewust GEEN `worpen.secondary` (Joost, 13-09): de worpen zijn er om aan tafel te laten zien dat
 *  iets uit een eerlijke boek-worp kwam, en een nummer tonen bij een tabel die niet bestaat is
 *  precies het soort verzonnen spelinhoud dat deze app nergens doet (zie de toelichting boven
 *  `weather.ts`). Een gegenereerde secondary is dus een willekeurige GREEP, en zo heet het ook.
 *
 *  De drie `strategic-*`-varianten sluiten elkaar uit (twee tegelijk is regeltechnisch onzin en de
 *  bestaande UI dwingt dat al af). Dat gaat hier vanzelf goed omdat we er precies ÉÉN pakken — deze
 *  functie mag daarom nooit stiekem naar meerdere uitgebreid worden zonder die uitsluiting alsnog
 *  expliciet te regelen. */
function grijpSecondary(): string[] {
  if (SECONDARY_OBJECTIVES.length === 0) return [];
  return [SECONDARY_OBJECTIVES[randInt(SECONDARY_OBJECTIVES.length)].id];
}

/** Een complete, speelbare sheet: formaat, scenario (gerold), tafel, terrein (gescatterd), en
 *  optioneel een secondary en het weer. `bron: 'generated'`, met de worpen in `worpen`. */
export function genereerSheet(opts: GenereerOpties): BattleSheet {
  // `formatDef` valt zelf al terug op 'battles' bij een onbekend id; we nemen `def.id` over zodat de
  // sheet nooit een format-id draagt dat de rest van de app niet kent.
  const def = formatDef(opts.format);
  const scenarioWorp = d6();
  const scenario = scenarioVoorWorp(def.groep, scenarioWorp);
  const tableW = opts.tableW ?? def.tafel.w;
  const tableH = opts.tableH ?? def.tafel.h;
  const weer = opts.weer ? rolWeer() : null;
  const worpen: SheetWorpen = { scenario: scenarioWorp };
  if (weer) worpen.weer = weer.worp;

  return {
    v: 1,
    format: def.id,
    scenario: scenario.id,
    tableW,
    tableH,
    terrain: scatterTerrain(tableW, tableH, recommendedTerrainCount(tableW, tableH)),
    secondaries: opts.secondaries ? grijpSecondary() : [],
    weer: weer ? weer.weer : null,
    worpen,
    bron: 'generated',
  };
}

// ── Per onderdeel herrollen ─────────────────────────────────────────────────────────────────────
//
// Elk van deze geeft een NIEUWE sheet terug en laat al het andere letterlijk staan — ook de andere
// worpen. Je herrolt het weer niet kwijt door het terrein opnieuw te gooien.

/** Rol het scenario opnieuw, binnen de D6-tabel van het huidige format. Het terrein blijft liggen:
 *  het scenario bepaalt de deployment, niet waar de bossen staan. */
export function herrolScenario(sheet: BattleSheet): BattleSheet {
  const worp = d6();
  const scenario = scenarioVoorWorp(formatDef(sheet.format).groep, worp);
  return { ...sheet, scenario: scenario.id, worpen: { ...sheet.worpen, scenario: worp } };
}

/** Scatter het terrein opnieuw op dezelfde tafel. Geen worp: dit is een plaatsing, geen tabel. */
export function herrolTerrein(sheet: BattleSheet): BattleSheet {
  return {
    ...sheet,
    terrain: scatterTerrain(sheet.tableW, sheet.tableH, recommendedTerrainCount(sheet.tableW, sheet.tableH)),
  };
}

/** Rol het Disruptive Weather opnieuw. Stond het weer uit, dan zet dit het AAN — "herroll" is aan
 *  tafel ook de knop waarmee je alsnog met weer besluit te spelen; uitzetten doe je met
 *  `zonderWeer`. */
export function herrolWeer(sheet: BattleSheet): BattleSheet {
  const { weer, worp } = rolWeer();
  return { ...sheet, weer, worpen: { ...sheet.worpen, weer: worp } };
}

/** Grijp een andere secondary objective. Zie `grijpSecondary`: bewust zonder worp. */
export function herrolSecondary(sheet: BattleSheet): BattleSheet {
  return { ...sheet, secondaries: grijpSecondary() };
}

// ── Onderdelen helemaal uitzetten (het vinkje uit) ──────────────────────────────────────────────
//
// Ook de bijbehorende worp gaat weg. Anders blijft er in `worpen` een getal staan bij iets dat niet
// meer op tafel ligt, en dan liegt de sheet over wat er gerold is.

/** Speel zonder weer. */
export function zonderWeer(sheet: BattleSheet): BattleSheet {
  const { weer: _weg, ...rest } = sheet.worpen ?? {};
  return { ...sheet, weer: null, worpen: rest };
}

/** Speel zonder secondary objectives. */
export function zonderSecondaries(sheet: BattleSheet): BattleSheet {
  const { secondary: _weg, ...rest } = sheet.worpen ?? {};
  return { ...sheet, secondaries: [], worpen: rest };
}
