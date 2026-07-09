import { supabase } from './supabase';

// Client-laag voor de campagne-BATTLE-brug ("De Grensvorsten", zelfde Supabase-project). Waar
// campaign.ts de speler-identiteit/lijstbouw-context levert, opent deze module een concrete
// campagne-battle in OWC's `tow_games`-speelmodus: opzoeken op de sync-code, en na afloop de
// gemelde uitslag terugpushen als voorstel. Server-RPC's zijn anon-executable en gated op de
// onraadbare code (net als campaign.ts en de list-sync). Defensieve parsing volgt hetzelfde
// patroon als campaign.ts — vertrouw geen enkel veld van de wire.

// ---- Defensieve parsing -------------------------------------------------------------------------

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Eén kant van de battle (aanvaller of verdediger) — een campagne-speler. */
export interface BattleSide {
  /** Campagne-speler-id (NIET host/guest) — hierop matchen we de gekoppelde OWC-speler. */
  id: string;
  naam: string;
  factie: string;
  kleur: string;
}

/** Samenvatting van een gekozen campagne-lijst (alleen namen/punten — GEEN stats). Alleen gevuld
 *  als beide kanten gelockt zijn. We gebruiken de `naam` om een eigen builder-lijst te auto-matchen;
 *  het volledige leger komt uit de speler z'n eigen Companion-lijsten, niet hieruit. */
export interface BattleLijstSamenvatting {
  naam: string;
  punten: number;
  leger: string;
  units: string[];
}

/** Een campagne-battle zoals opgehaald via de sync-code. */
export interface CampaignBattle {
  ok: true;
  id: number;
  code: string;
  status: string;
  type: string;
  hex: string;
  /** Ruwe BattleSheet uit de campagne (scenario/tafel/terrein). Vorm verschilt van OWC's lokale
   *  `tow:battle`, dus we tonen 'm alleen informatief (scenario-naam) en dwingen niks af. */
  scenario: Record<string, unknown> | null;
  beideGelockt: boolean;
  aanvaller: BattleSide;
  verdediger: BattleSide;
  /** Alleen gevuld als `beideGelockt`. */
  aanvLijst: BattleLijstSamenvatting | null;
  verdLijst: BattleLijstSamenvatting | null;
}

function parseSide(raw: unknown): BattleSide {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { id: str(s.id), naam: str(s.naam), factie: str(s.factie), kleur: str(s.kleur) };
}

function parseLijst(raw: unknown): BattleLijstSamenvatting | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  return {
    naam: str(l.naam),
    punten: num(l.punten),
    leger: str(l.leger),
    units: arr(l.units).filter((u): u is string => typeof u === 'string'),
  };
}

function parseBattle(data: unknown): CampaignBattle {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  if (d.ok !== true) throw new Error(str(d.fout, 'CAMPAGNE_BATTLE_FOUT'));
  return {
    ok: true,
    id: num(d.id),
    code: str(d.code),
    status: str(d.status),
    type: str(d.type),
    hex: str(d.hex),
    scenario: d.scenario && typeof d.scenario === 'object' ? (d.scenario as Record<string, unknown>) : null,
    beideGelockt: d.beideGelockt === true,
    aanvaller: parseSide(d.aanvaller),
    verdediger: parseSide(d.verdediger),
    aanvLijst: parseLijst(d.aanvLijst),
    verdLijst: parseLijst(d.verdLijst),
  };
}

/** Trim + upper-case de sync-code voor de wire (codes zijn hoofdletter-ongevoelig ingevoerd, net
 *  als OWC's eigen game-codes). */
export const cleanBattleCode = (code: string): string => (code || '').trim().toUpperCase();

// ---- RPC-aanroepen ------------------------------------------------------------------------------

/** Zoek een campagne-battle op via de sync-code (die de campagne genereert zodra beide legers
 *  gelockt zijn). Gooit 'ONBEKENDE_CODE' als er geen battle met die code is. De lijst-samenvattingen
 *  (`aanvLijst`/`verdLijst`) zijn alleen gevuld als beide kanten gelockt zijn. */
export async function battleByCode(code: string): Promise<CampaignBattle> {
  const { data, error } = await supabase.rpc('towc_battle_by_code', { p_code: cleanBattleCode(code) });
  if (error) throw error;
  return parseBattle(data);
}

/** De uitslag zoals OWC 'm terugmeldt aan de campagne. Winnaar + VP-keys zijn CAMPAGNE-speler-ids
 *  (niet host/guest). De campagne slaat dit op als VOORSTEL; de grensmaster keurt het pas daarna goed
 *  en boekt dan de beloningen — dat is niet OWC's zorg. */
export interface BattleResultaat {
  /** Campagne-speler-id van de winnaar, of null bij gelijkspel. */
  winnaar: string | null;
  /** VP per kant, gekeyd op campagne-speler-id. */
  vp: Record<string, number>;
  /** Per-unit verliezen/kills (vrije vorm — we sturen wat de tracker weet). */
  kills: unknown[];
  /** Vrije notities of null. */
  notities: string | null;
  /** Campagne-relevante per-unit feiten voor de MELDENDE speler z'n EIGEN leger — voedt de
   *  veteraan-XP + battle-scar-triggers van "De Grensvorsten". De campagne-RPC mag dit voorlopig
   *  negeren; het gaat mee in dezelfde jsonb-payload. Optioneel (oude clients sturen het niet). */
  veteraan?: {
    /** Campagne-unit-id (matcht towc_spel_unit.unit_id — slug van de custom-naam óf het type-id). */
    unitId: string;
    /** Unit-naam (custom-naam of type) — informatief voor de campagne/grensmaster. */
    naam?: string;
    /** Unit overleefde met ≥50% start-Unit-Strength én is niet vluchtend/removed bij einde spel. */
    overleefd_50: boolean;
    /** Aantal kills + trofeeën door deze unit (0 als niet bijgehouden). */
    kills: number;
    /** Battle-scar-trigger: unit onder 25% start-US, of removed, of vluchtend bij einde spel. */
    scar_trigger: boolean;
  }[];
}

/** Meld de uitslag van een campagne-battle terug (als voorstel). Gated op de sync-code. */
export async function reportBattleResult(code: string, resultaat: BattleResultaat): Promise<void> {
  const { data, error } = await supabase.rpc('towc_battle_resultaat', {
    p_code: cleanBattleCode(code),
    p_resultaat: resultaat,
  });
  if (error) throw error;
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  // De RPC hoeft geen {ok:true} terug te geven, maar als hij een fout-veld zet, respecteer dat.
  if (d.ok === false) throw new Error(str(d.fout, 'CAMPAGNE_BATTLE_FOUT'));
}

/** Samenvatting van één speelklare campagne-battle (beide legers gelockt → code aanwezig). Voor de
 *  OWC-ingang: zo hoef je geen deep-link/code te plakken — je klaarstaande battles verschijnen vanzelf. */
export interface CampaignBattleSummary {
  id: number;
  code: string;
  status: string;
  scenarioNaam: string | null;
  aanvaller: BattleSide;
  verdediger: BattleSide;
}

/** Haal de speelklare campagne-battles van een speler op (via z'n campagne-speler-id uit de koppeling).
 *  Alleen battles waar beide legers gelockt zijn (er is een code) en die nog niet beslecht zijn. */
export async function myCampaignBattles(speler: string): Promise<CampaignBattleSummary[]> {
  const { data, error } = await supabase.rpc('towc_battles_voor_speler', { p_speler: speler });
  if (error) throw error;
  return arr(data).map((raw) => {
    const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
      id: num(d.id),
      code: str(d.code),
      status: str(d.status),
      scenarioNaam: typeof d.scenarioNaam === 'string' ? d.scenarioNaam : null,
      aanvaller: parseSide(d.aanvaller),
      verdediger: parseSide(d.verdediger),
    };
  });
}
