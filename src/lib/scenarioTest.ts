/**
 * SCENARIO-TESTMODUS (22-10-2026) — alleen in de TEST-build.
 *
 * Doel: een sheet van de campagne (Plunder, The Forge, Breakthrough …) in de Companion openen zonder
 * dat er een echte battle bestaat, en dan precies zien wat spelers zien: de briefing met het bord,
 * het terrein plaatsen, de objectives, de VP-posten uit `scenarioBonus`, de Wrath-reminder en de
 * officiële uitslag (`towc_vp_resultaat` op de test-DB).
 *
 * Openen: `/?scenariotest=1#sheet=<base64url>`, met in de hash JSON (UTF-8, base64url):
 *   { sheet, fase, cap, aanvaller, verdediger }
 *   - sheet       de BattleSheet zoals de campagne hem bakt (verplicht, met `scenario`)
 *   - fase, cap   Act en punten-cap (cap kiest de kolom van de uitslagtabel); fase valt terug op sheet.fase
 *   - aanvaller, verdediger  een naam (string) of { naam, factie?, kleur? }
 *
 * NIETS GAAT NAAR DE SERVER. `battleByCode` onderschept de code (net als de TEST00-testbattle) en
 * bouwt de battle uit localStorage; het potje speelt SOLO (lokale tracker, geen `tow_games`-rij);
 * het rapport wordt niet getoond. Alleen lezen mag: de uitslag-RPC (`towc_vp_resultaat`).
 * Buiten de testbuild (IS_TEST_DB) doet de URL niets.
 */
import { getPersisted, setPersisted } from '../store';
import type { CampaignBattle, BattleSide, BattleLijstSamenvatting } from './campaignBattle';
import { parseVersterking, type BattleVersterking } from './versterking';

/** Gereserveerde code: acht tekens, dus nooit een vrij potje (vier) en nooit een campagne-code (zes). */
export const SCENARIO_TEST_CODE = 'SCENTEST';
const KEY = 'tow:scenario-test';

export const isScenarioTestCode = (code: string | null | undefined): boolean =>
  (code || '').trim().toUpperCase() === SCENARIO_TEST_CODE;

export interface ScenarioTestPayload {
  sheet: Record<string, unknown>;
  fase: number;
  cap: number | null;
  aanvaller: { naam: string; factie: string; kleur: string };
  verdediger: { naam: string; factie: string; kleur: string };
  /** Optioneel: roll-off-modifiers voor de eerste beurt, om te zien dat ze wegvallen waar de eerste
   *  beurt vastligt. Zelfde vorm als `towc_battle_by_code.rollOff`. */
  rollOff?: CampaignBattle['rollOff'];
  /** Wanneer hij geladen is: een nieuwe payload is een nieuw potje. */
  geladen: string;
  /** HET SCENARIO LAB (23-10-2026): welke vaste mock-legers (ids uit lib/scenarioLab.ts) aan welke kant
   *  staan. Met dit veld laadt de briefing BEIDE legers vanzelf (geen keuze uit je eigen lijsten) en
   *  opent het potje met allebei. Zonder dit veld is het de gewone scenario-test van 22-10. */
  legers?: { aanvaller: string; verdediger: string };
  /** Lijst-samenvattingen voor de sectie "Armies" van de briefing, zoals de campagne ze meestuurt. */
  aanvLijst?: BattleLijstSamenvatting | null;
  verdLijst?: BattleLijstSamenvatting | null;
  /** REINFORCEMENT DETACHMENT (23-10-2026): per kant de punten die die kant als versterking mag
   *  toevoegen (twee tegen drie), in dezelfde vorm als `towc_battle_by_code.versterking`. In het lab
   *  laadt de briefing dan de mock-versterking van dat leger vanzelf. */
  versterking?: BattleVersterking | null;
}

const kant = (v: unknown, terug: string, kleur: string): ScenarioTestPayload['aanvaller'] => {
  if (typeof v === 'string' && v.trim()) return { naam: v.trim(), factie: '', kleur };
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const naam = typeof o.naam === 'string' && o.naam.trim() ? o.naam.trim() : terug;
  return {
    naam,
    factie: typeof o.factie === 'string' ? o.factie : '',
    kleur: typeof o.kleur === 'string' && o.kleur.trim() ? o.kleur.trim() : kleur,
  };
};

const bronnen = (v: unknown): { bron: string; label: string; waarde: number }[] =>
  (Array.isArray(v) ? v : []).flatMap((x) => {
    const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
    return typeof o.label === 'string' && typeof o.waarde === 'number'
      ? [{ bron: typeof o.bron === 'string' ? o.bron : o.label, label: o.label, waarde: o.waarde }]
      : [];
  });
function rollOffUit(v: unknown): CampaignBattle['rollOff'] {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return { aanvaller: bronnen(o.aanvaller), verdediger: bronnen(o.verdediger) };
}

/** base64url → UTF-8 tekst. Gooit bij rommel. */
export function base64UrlNaarTekst(b64: string): string {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const pad = s.length % 4 === 0 ? s : s + '='.repeat(4 - (s.length % 4));
  const bin = atob(pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Lees de payload uit een hash ("#sheet=…"). null als er geen bruikbare sheet in zit. */
export function payloadUitHash(hash: string): ScenarioTestPayload | null {
  const m = /(?:^#?|&)sheet=([^&]+)/.exec(hash || '');
  if (!m) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(base64UrlNaarTekst(decodeURIComponent(m[1])));
  } catch {
    return null;
  }
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const sheet = o?.sheet && typeof o.sheet === 'object' && !Array.isArray(o.sheet) ? (o.sheet as Record<string, unknown>) : null;
  if (!o || !sheet || typeof sheet.scenario !== 'string') return null;
  const faseRaw = typeof o.fase === 'number' ? o.fase : typeof sheet.fase === 'number' ? sheet.fase : 3;
  const cap = typeof o.cap === 'number' && o.cap > 0 ? o.cap : null;
  return {
    sheet: { ...sheet, fase: typeof sheet.fase === 'number' ? sheet.fase : faseRaw },
    fase: faseRaw,
    cap,
    aanvaller: kant(o.aanvaller, 'Attacker', '#8a6c30'),
    verdediger: kant(o.verdediger, 'Defender', '#4a5d6b'),
    rollOff: rollOffUit(o.rollOff),
    geladen: new Date().toISOString(),
    versterking: parseVersterking(o) ?? null,
  };
}

export const bewaarScenarioTest = (p: ScenarioTestPayload): void => setPersisted(KEY, p);
export const scenarioTestPayload = (): ScenarioTestPayload | null => {
  const p = getPersisted<ScenarioTestPayload | null>(KEY, null);
  return p && p.sheet && typeof p.sheet === 'object' ? p : null;
};

/** De nep-battle, zoals `towc_battle_by_code` hem zou sturen. null zonder payload. */
export function buildScenarioTestBattle(): CampaignBattle | null {
  const p = scenarioTestPayload();
  return p ? battleUitPayload(p) : null;
}

/** De nep-battle bij een payload. Los van de opslag, zodat het lab ook een VOORBEELD kan tekenen (de
 *  kaart vóór je start) met precies dezelfde battle als die het potje straks krijgt. */
export function battleUitPayload(p: ScenarioTestPayload): CampaignBattle {
  const side = (k: ScenarioTestPayload['aanvaller'], id: string): BattleSide => ({ id, naam: k.naam, factie: k.factie, kleur: k.kleur, ai: false });
  const intentie = typeof p.sheet.intentie === 'string' ? p.sheet.intentie : 'attack';
  return {
    ok: true,
    id: -2,
    code: SCENARIO_TEST_CODE,
    status: 'legers_vergrendeld',
    type: ['attack', 'raid', 'claim', 'calling', 'challenge', 'call'].includes(intentie) ? intentie : 'attack',
    hex: '0,0',
    scenario: p.sheet,
    beideGelockt: true,
    aanvaller: side(p.aanvaller, 'scen-a'),
    verdediger: side(p.verdediger, 'scen-b'),
    aanvLijst: p.aanvLijst ?? null,
    verdLijst: p.verdLijst ?? null,
    veteranen: { aanvaller: [], verdediger: [] },
    perks: { aanvaller: [], verdediger: [] },
    items: { aanvaller: [], verdediger: [] },
    fase: p.fase,
    cap: p.cap ?? undefined,
    handen: {
      startAanv: p.geladen, startVerd: p.geladen, klaarAanv: null, klaarVerd: null, beideGestart: true, beideKlaar: false,
    },
    warFase: true,
    actStatus: 'battles',
    battleMarch: p.fase <= 2,
    weer: null,
    hexGebouw: null,
    rollOff: p.rollOff ?? null,
    versterking: p.versterking ?? undefined,
  };
}
