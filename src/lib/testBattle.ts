// Een NEP campagne-battle, puur om de campagne-flow in OWC te kunnen uitproberen.
//
// Joost (30-08): "ik wil in owc de campagne testbattle zien (…) met 2 armies uit eigen lijst die ik
// kan kiezen en mock battlefield en items en perks zodat ik dat kan testen in de app."
//
// WAAROM EEN MOCK EN GEEN ECHTE RIJ. Een testbattle in de campagne-database zetten zou een ECHTE
// battle zijn: hij duikt op in andermans lijstjes, telt mee in Act-tellingen en kan per ongeluk
// gerapporteerd worden. Deze battle bestaat alleen op dit apparaat, in localStorage.
//
// WAAROM HIJ ER TOCH ECHT UITZIET. `battleByCode` geeft hem terug alsof de server hem stuurde, dus
// alles erachter — CampaignBattlePanel, de objectives-teller, de veteranen-weergave, de reporter —
// draait op precies dezelfde code als bij een echte battle. Een testpad met een eigen route test
// niet wat je wilde testen.
//
// WAT ER NIET GEBEURT: rapporteren landt nergens. De reporter praat met de server, en die kent code
// TEST00 niet — je kunt de knop indrukken en de melding zien, maar er verandert niets in de
// campagne. Dat is de bedoeling.
import { getPersisted } from '../store';
import { campaignUnitId, type BuilderList } from './owbBuilder';
import type {
  BattleLijstSamenvatting, BattleLijstUnit, CampaignBattle, FoundItem, Perk, VetUnit,
} from './campaignBattle';

/** Gereserveerde code. Zelfde vorm als een echte battlecode, zodat niets onderweg struikelt. */
export const TEST_BATTLE_CODE = 'TEST00';
const CONFIG_KEY = 'tow:test-battle';

/** Staat het testgereedschap AAN op dit apparaat? Uit tenzij je het zelf hebt aangezet met
 *  `?testtools=1` in de URL. Zo staat de testbattle niet op het scherm van iedere speler in de
 *  campagne (Joost, 30-08) — die hoeven geen knop te zien die niets met hun potje te maken heeft.
 *
 *  Bewust een LOKALE schakelaar en geen identiteitscontrole: die zou een hardgecodeerd speler-id
 *  of e-mailadres in de bundel betekenen, en zou stuk gaan zodra je op een apparaat werkt dat nog
 *  niet aan de campagne gekoppeld is. Dit is geen beveiliging — het houdt het scherm opgeruimd. */
const TOOLS_KEY = 'tow:test-tools';
export const TEST_TOOLS_KEY = TOOLS_KEY;
export const testToolsAan = (): boolean => getPersisted<boolean>(TOOLS_KEY, false) === true;

export const isTestBattleCode = (code: string): boolean =>
  (code || '').trim().toUpperCase() === TEST_BATTLE_CODE;

/** Welke twee opgeslagen lijsten spelen mee. Alleen de id's — de lijsten zelf leven in `tow:lists`. */
export interface TestBattleConfig { aanvId: string; verdId: string }

interface SavedList extends BuilderList { id: string; name: string; army: string }

/** De opgeslagen lijsten, defensief gefilterd: `tow:lists` is gebruikersdata en mag half zijn. */
export function testBattleLijsten(): SavedList[] {
  const raw = getPersisted<unknown[]>('tow:lists', []);
  return (Array.isArray(raw) ? raw : []).filter((l): l is SavedList => {
    const x = l as Partial<SavedList> | null;
    return !!x && typeof x.id === 'string' && typeof x.name === 'string' && Array.isArray(x.entries);
  });
}

export function getTestBattleConfig(): TestBattleConfig | null {
  const c = getPersisted<Partial<TestBattleConfig> | null>(CONFIG_KEY, null);
  return c && typeof c.aanvId === 'string' && typeof c.verdId === 'string'
    ? { aanvId: c.aanvId, verdId: c.verdId }
    : null;
}

export const TEST_BATTLE_CONFIG_KEY = CONFIG_KEY;

/** Lijstsamenvatting uit een opgeslagen lijst. Punten per unit blijven LEEG: die rekent de campagne
 *  server-side uit, en ze hier narekenen vergt de catalogus voor iets dat alleen informatief is.
 *  `punten: null` is een bestaande, ondersteunde toestand — het scherm toont dan een streepje. */
function samenvatting(l: SavedList): BattleLijstSamenvatting {
  return {
    naam: l.name,
    punten: l.points ?? 0,
    leger: l.army,
    units: l.entries.map((e): BattleLijstUnit => ({
      uid: e.uid ?? null,
      unitId: e.unitId ?? null,
      naam: (e.customName ?? '').trim() || e.unitId || 'Unit',
      datasheet: e.unitId ?? null,
      cat: e.cat ?? null,
      modellen: e.count ?? 1,
      punten: null,
      opties: [],
    })),
  };
}

/** Twee veteranen per kant, opgehangen aan ECHTE entry-sleutels (campaignUnitId), zodat de
 *  veteranen-weergave op de juiste units landt in plaats van op niets. Eén met abilities en een
 *  litteken, één kaal — dan zie je beide toestanden naast elkaar. */
function veteranen(l: SavedList): VetUnit[] {
  return l.entries.slice(0, 2).map((e, i): VetUnit => ({
    unitId: campaignUnitId(e),
    naam: (e.customName ?? '').trim() || e.unitId || 'Unit',
    cat: e.cat ?? null,
    xp: i === 0 ? 4 : 1,
    abilities: i === 0 ? [{ t: 'grizzled', keuze: null }, { t: 'weapon_master', keuze: 'ws' }] : [],
    littekens: i === 0 ? 1 : 0,
  }));
}

const PERKS_AANV: Perk[] = [
  { perk: 'outpost-watch', label: 'Outpost Watch', effect: 'Test perk — one unit may redeploy after both armies are set up.' },
  { perk: 'quartermaster', label: 'Quartermaster', effect: 'Test perk — re-roll the first failed Panic test of the battle.' },
];
const PERKS_VERD: Perk[] = [
  { perk: 'forest-paths', label: 'Forest Paths', effect: 'Test perk — one infantry unit gains Ambushers for this battle.' },
];
const ITEM_AANV: FoundItem = {
  naam: 'Testing Stone',
  punten: 25,
  soort: 'permanent',
  effect: 'Test item — the bearer may re-roll one failed Armour Save each turn.',
};
const ITEM_VERD: FoundItem = {
  naam: 'Draught of Trial',
  punten: 15,
  soort: 'consumable',
  effect: 'Test item — single use. The bearer gains +1 Attack for one round of combat.',
};

/** Het nep-battlefield. Bewust een BATTLE MARCH met drie treasure troves: dat zet de objectives-
 *  teller aan, plus de 5-rondenlengte en de halve VP-schaal — precies de dingen die anders alleen
 *  in een echte Act-1-battle te zien zijn. */
const SCENARIO: Record<string, unknown> = {
  v: 4,
  fase: 1,
  scenario: 'bm-opposed-flanks',
  scenarioNaam: 'Opposed Flanks (test)',
  blurb: 'Battle March — slanted, opposed flank deployment.',
  reden: 'Test battle — niets hiervan wordt naar de campagne geschreven.',
  deployNote: 'Slanted opposed zones, 18″ deep at the outer edge — A top-left, B bottom-right.',
  bordLabel: '44×30″',
  tableW: 44,
  tableH: 30,
  terrein: 'woud',
  intentie: 'raid',
  gebouw: 'outpost',
  verdedigerKant: 'A',
  secondaries: ['bm-troves-3'],
  secLayout: {
    quarters: false,
    baggage: [],
    objectives: [{ n: 1, x: 11, y: 15 }, { n: 2, x: 22, y: 15 }, { n: 3, x: 33, y: 15 }],
  },
  terrain: [
    { id: 't-test-1', type: 'wood', x: 18, y: 5, w: 8, h: 5, difficult: true },
    { id: 't-test-2', type: 'wood', x: 32, y: 6, w: 9, h: 5, difficult: true },
    { id: 't-test-3', type: 'hill', x: 3, y: 17, w: 9, h: 9 },
  ],
};

/** Bouw de nep-battle uit de bewaarde keuze. null als de keuze ontbreekt of een lijst weg is. */
export function buildTestBattle(): CampaignBattle | null {
  const cfg = getTestBattleConfig();
  if (!cfg) return null;
  const alle = testBattleLijsten();
  const a = alle.find((l) => l.id === cfg.aanvId);
  const b = alle.find((l) => l.id === cfg.verdId);
  if (!a || !b) return null;

  return {
    ok: true,
    id: -1,
    code: TEST_BATTLE_CODE,
    status: 'legers_vergrendeld',
    type: 'raid',
    hex: '0,0',
    scenario: SCENARIO,
    beideGelockt: true,
    // Twee nep-spelers, allebei `ai: false`. Met een AI-kant slaat het scherm de dubbele goedkeuring
    // over, en juist die wil je kunnen testen.
    aanvaller: { id: 'test-a', naam: `${a.name} (you)`, factie: a.army, kleur: '#8a6c30', ai: false },
    verdediger: { id: 'test-b', naam: `${b.name} (opponent)`, factie: b.army, kleur: '#4a5d6b', ai: false },
    aanvLijst: samenvatting(a),
    verdLijst: samenvatting(b),
    veteranen: { aanvaller: veteranen(a), verdediger: veteranen(b) },
    perks: { aanvaller: PERKS_AANV, verdediger: PERKS_VERD },
    items: { aanvaller: ITEM_AANV, verdediger: ITEM_VERD },
    fase: 1,
    cap: 750,
    // Beide handen staan al op start: bij een echte battle drukt de tegenstander die knop, en dat kan
    // hier niemand. Zonder dit blijf je op de startpoort hangen en valt er niets te testen.
    handen: {
      startAanv: '2026-01-01T00:00:00.000Z',
      startVerd: '2026-01-01T00:00:00.000Z',
      klaarAanv: null,
      klaarVerd: null,
      beideGestart: true,
      beideKlaar: false,
    },
    warFase: true,
    actStatus: 'battles',
    battleMarch: true,
    weer: {
      worp: 3,
      naam: 'Driving Rain (test)',
      effect: 'Test weather — shooting attacks suffer an additional -1 To Hit modifier.',
    },
  };
}
