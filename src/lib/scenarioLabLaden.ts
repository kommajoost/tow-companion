/**
 * HET SCENARIO LAB — laden en klaarzetten (23-10-2026). De pure helft (index lezen, keuzes, de
 * mock-legers, de payload) staat in scenarioLab.ts; waarom het lab bestaat staat daar ook.
 */
import { setPersisted } from '../store';
import type { OwbArmy, MagicItemsData } from './owbBuilder';
import { findUnit, entryPoints, validate } from './owbBuilder';
import { optionSummary } from './builderDerived';
import { catalogueFor, itemsFor } from './overlays';
import type { BattleLijstSamenvatting } from './campaignBattle';
import { SCENARIO_TEST_CODE, bewaarScenarioTest, type ScenarioTestPayload } from './scenarioTest';
import { wrathSleutel } from './wrathTriggers';
import { vergeetCampagneBattle } from '../components/game/useCampaignBattle';
import { leesLabIndex, mockLeger, type LabAct, type LabIndex, type LabSheets, type MockLeger } from './scenarioLab';

const BASE = import.meta.env.BASE_URL;

let indexBelofte: Promise<LabIndex | null> | null = null;
/** Het index-bestand, één keer per sessie opgehaald. */
export function laadLabIndex(): Promise<LabIndex | null> {
  if (!indexBelofte) {
    indexBelofte = fetch(`${BASE}scenario-lab/index.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then(leesLabIndex)
      .catch(() => { indexBelofte = null; return null; });
  }
  return indexBelofte;
}

const actCache = new Map<string, Promise<LabSheets | null>>();
/** Alle sheets van één Act (één bestand), gecachet per bestand. */
export function laadLabAct(act: LabAct): Promise<LabSheets | null> {
  let p = actCache.get(act.bestand);
  if (!p) {
    p = fetch(`${BASE}scenario-lab/${act.bestand}`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && typeof j === 'object' && !Array.isArray(j) ? (j as LabSheets) : null))
      .catch(() => null)
      .then((j) => { if (!j) actCache.delete(act.bestand); return j; });
    actCache.set(act.bestand, p);
  }
  return p;
}

const catalogusCache = new Map<string, Promise<OwbArmy | null>>();
const laadCatalogus = (slug: string): Promise<OwbArmy | null> => {
  let p = catalogusCache.get(slug);
  if (!p) {
    p = fetch(`${BASE}owb/${slug}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    catalogusCache.set(slug, p);
  }
  return p;
};
let itemsBelofte: Promise<MagicItemsData | null> | null = null;
const laadItems = (): Promise<MagicItemsData | null> =>
  (itemsBelofte ??= fetch(`${BASE}owb/magic-items.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));

/**
 * De lijst-samenvatting van een mock-leger, zoals de campagne hem in `aanvLijst`/`verdLijst` meestuurt:
 * per unit model-aantal, punten en opties, uitgerekend met dezelfde `entryPoints`/`optionSummary` als
 * de builder. Faalt het laden van de catalogus, dan zonder punten (het scherm toont dan een streepje).
 */
export async function mockSamenvatting(m: MockLeger): Promise<BattleLijstSamenvatting> {
  const [raw, items] = await Promise.all([laadCatalogus(m.lijst.army), laadItems()]);
  const cat = raw ? catalogueFor(raw, m.lijst.composition, null) : null;
  const pool = items ? itemsFor(items, m.lijst.composition, null) : undefined;
  const totaal = cat ? validate(m.lijst, (c, id) => findUnit(cat, c, id), pool).total : null;
  return {
    naam: m.lijst.name,
    punten: totaal ?? m.lijst.points,
    leger: m.lijst.army,
    units: m.lijst.entries.map((en) => {
      const unit = cat ? findUnit(cat, en.cat, en.unitId) : undefined;
      const opties = unit ? optionSummary(unit, en, pool).split(' · ').map((s) => s.trim()).filter(Boolean) : [];
      return {
        uid: en.uid,
        unitId: en.unitId,
        naam: unit?.name_en ?? en.unitId,
        datasheet: unit?.name_en ?? en.unitId,
        cat: en.cat,
        modellen: en.count,
        punten: unit ? entryPoints(unit, en, pool) : null,
        opties,
      };
    }),
  };
}

/**
 * Zet een nieuwe lab-battle klaar: de payload (met de lijst-samenvattingen) in de opslag, een schoon
 * solo-potje, geen aangevinkte Wrath Triggers, en de briefing als openstaande battle. Alle sleutels hier
 * zijn de gewone namen; in het lab leidt de store ze om naar `tow:lab:` (zie labModus.ts).
 */
export async function startLabBattle(p: ScenarioTestPayload): Promise<void> {
  const a = mockLeger(p.legers?.aanvaller);
  const v = mockLeger(p.legers?.verdediger);
  const [aanvLijst, verdLijst] = await Promise.all([a ? mockSamenvatting(a) : null, v ? mockSamenvatting(v) : null]);
  wisLabPotje();
  vergeetCampagneBattle(SCENARIO_TEST_CODE);
  bewaarScenarioTest({ ...p, aanvLijst, verdLijst });
  setPersisted('tow:campaign-battle', SCENARIO_TEST_CODE);
}

/** Wis de lokale staat van het lab-potje (het potje zelf en de Wrath-keuze); de payload blijft staan. */
export function wisLabPotje(): void {
  setPersisted('tow:game', null);
  setPersisted('tow:solo-mine', null);
  setPersisted('tow:solo-opp', null);
  setPersisted('tow:solo-tracker', { round: 1, vp: {}, units: {} });
  setPersisted(wrathSleutel(SCENARIO_TEST_CODE), []);
}
