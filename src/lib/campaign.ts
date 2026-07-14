import { supabase } from './supabase';
import { cleanKey } from './listSync';
import { getPersisted, setPersisted } from '../store';

// Client-laag voor de koppeling met de campagne-app "De Grensvorsten" (zelfde Supabase-project).
// Een speler koppelt met een korte code; de campagne geeft context terug (fase, punten-cap, roster-
// opties, tafeltactiek, events) die deze app gebruikt om lijstbouw te sturen. Server-RPC's zijn
// anon-executable en gated op de onraadbare code, net als de list-sync elders.

// localStorage-sleutels (via de gedeelde store, niet rechtstreeks localStorage).
const CODE_KEY = 'tow:campaignCode';
const CTX_KEY = 'tow:campaignCtx';

export interface CampaignRosterOptie { id: string; naam: string; level: number; effect: string }
export interface CampaignSpeler { id: string; naam: string; kleur: string; factie: string; alliantie: string }
export interface CampaignEvent { id: string; details?: Record<string, unknown> }
export interface CampaignUnit { naam: string; catalogusId: string | null; cat: string | null; xp: number; abilities: number; littekens: number; status: string }
export interface CampaignContext {
  ok: true;
  /** De koppelcode van deze speler — aanwezig sinds de wachtwoord-koppeling (server geeft 'm mee),
   *  zodat de app 'm kan bewaren voor latere context-refreshes. */
  koppelcode?: string;
  fase: number;
  week: number;
  puntenCap: number;
  // Toegestane compositie-regels deze fase (rule-ids uit COMPOSITION_RULES): fase 1-2 → ["battle-march"],
  // fase 3+ → ["combined-arms","grand-melee"]. Een campagne-lijst MOET een van deze regels gebruiken.
  compositie: string[];
  // Extra magic-item-toelage (0 of 20; 20 = Quartermaster/Armoury-perk). Informatief — gevonden
  // campagne-items zijn ≤30 pt en tellen binnen de normale per-character allowance.
  itemAllowanceBonus: number;
  speler: CampaignSpeler;
  rosterOpties: CampaignRosterOptie[];
  tafelTactiek: CampaignRosterOptie[];
  events: CampaignEvent[];
  // Regiment-register: je named units in de campagne (met XP) — voedt de kies-bestaand-dropdown.
  units: CampaignUnit[];
}

// ---- Defensieve parsing -------------------------------------------------------------------------

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Normaliseer één roster/tactiek-optie; ontbrekende velden krijgen veilige defaults. */
function parseOptie(raw: unknown): CampaignRosterOptie {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { id: str(o.id), naam: str(o.naam), level: num(o.level), effect: str(o.effect) };
}

/** Normaliseer één speler; ontbrekende velden krijgen lege strings. */
function parseSpeler(raw: unknown): CampaignSpeler {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    id: str(s.id),
    naam: str(s.naam),
    kleur: str(s.kleur),
    factie: str(s.factie),
    alliantie: str(s.alliantie),
  };
}

/** Normaliseer één event; `details` blijft optioneel en alleen als het echt een object is. */
function parseEvent(raw: unknown): CampaignEvent {
  const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ev: CampaignEvent = { id: str(e.id) };
  if (e.details && typeof e.details === 'object') ev.details = e.details as Record<string, unknown>;
  return ev;
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Zet een onbekende RPC-response om naar CampaignContext, of gooi een nette Error bij een fout.
 *  Verwacht `{ ok:true, … }`; bij `ok:false` gooit hij de meegegeven fout-code (of 'CAMPAGNE_FOUT'). */
function parseContext(data: unknown): CampaignContext {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  if (d.ok !== true) {
    throw new Error(str(d.fout, 'CAMPAGNE_FOUT'));
  }
  return {
    ok: true,
    koppelcode: typeof d.koppelcode === 'string' ? d.koppelcode : undefined,
    fase: num(d.fase),
    week: num(d.week),
    puntenCap: num(d.puntenCap),
    // compositie: alleen strings overhouden; ontbreekt/onbruikbaar ⇒ lege lijst (geen lock).
    compositie: arr(d.compositie).filter((v): v is string => typeof v === 'string'),
    itemAllowanceBonus: num(d.itemAllowanceBonus),
    speler: parseSpeler(d.speler),
    units: arr(d.units).map((raw) => { const u = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>; return { naam: str(u.naam), catalogusId: typeof u.catalogusId === 'string' ? u.catalogusId : null, cat: typeof u.cat === 'string' ? u.cat : null, xp: num(u.xp), abilities: num(u.abilities), littekens: num(u.littekens), status: str(u.status, 'actief') } }),
    rosterOpties: arr(d.rosterOpties).map(parseOptie),
    tafelTactiek: arr(d.tafelTactiek).map(parseOptie),
    events: arr(d.events).map(parseEvent),
  };
}

/** Trim + upper-case de campagne-code voor de wire (codes zijn hoofdletter-ongevoelig ingevoerd). */
const cleanCode = (code: string): string => (code || '').trim().toUpperCase();

// ---- RPC-aanroepen ------------------------------------------------------------------------------

/** Koppel op je CAMPAGNE-WACHTWOORD (spelersprofiel in de campagne-app) — geen code nodig.
 *  De server vindt je speler op de profiel-hash, zet zonodig de sync-key (zelfde afleiding als
 *  het list-sync-wachtwoord) en geeft de context incl. `koppelcode` terug. Fouten:
 *  ONBEKEND_WACHTWOORD / WACHTWOORD_TE_KORT. */
export async function koppelMetWachtwoord(wachtwoord: string): Promise<CampaignContext> {
  const { data, error } = await supabase.rpc('towc_companion_koppel_wachtwoord', { p_wachtwoord: wachtwoord });
  if (error) throw error;
  return parseContext(data);
}

/** Koppel via het INGELOGDE account — geen code nodig. De server vindt je speler op `auth.uid()`
 *  (het geclaimde factie-slot) en geeft dezelfde context terug als de code-koppeling, incl.
 *  `koppelcode`. Gooit bij een Supabase-fout of `ok:false` (fout-code als message: 'NIET_INGELOGD'
 *  / 'GEEN_SLOT'). Hergebruikt dezelfde `parseContext` + foutafhandeling als de code-koppeling. */
export async function koppelViaAccount(): Promise<CampaignContext> {
  const { data, error } = await supabase.rpc('towc_account_context');
  if (error) throw error;
  return parseContext(data);
}

/** Koppel deze app aan een campagne: valideer de code en leg optioneel de sync-key vast.
 *  Gooit bij een Supabase-fout of `ok:false` (fout-code als message, bv. 'ONBEKENDE_CODE'). */
export async function koppelCampagne(code: string, syncKey: string | null): Promise<CampaignContext> {
  const { data, error } = await supabase.rpc('towc_companion_koppel', {
    p_code: cleanCode(code),
    p_sync_key: syncKey,
  });
  if (error) throw error;
  return parseContext(data);
}

/** Ververs de campagne-context voor een al gekoppelde code (zonder sync-key). Zelfde fout-afhandeling. */
export async function versCampagneContext(code: string): Promise<CampaignContext> {
  const key = eigenSyncKey();
  if (key) {
    // Self-heal: staat list-sync (inmiddels) aan, ga dan via de koppel-RPC — die legt de sync-key
    // (opnieuw) vast op de speler én synct de named units meteen de campagne in. Zo werkt de keten
    // ook als de speler pas ná het koppelen zijn sync-wachtwoord instelde.
    try {
      const { data, error } = await supabase.rpc('towc_companion_koppel', { p_code: cleanCode(code), p_sync_key: key });
      if (!error) return parseContext(data);
    } catch { /* val terug op de read-only context */ }
  }
  const { data, error } = await supabase.rpc('towc_companion_context', { p_code: cleanCode(code) });
  if (error) throw error;
  return parseContext(data);
}

/** De sync-key van deze app, of null zonder actieve list-sync. Bron is `tow:syncKey` — de ECHTE
 *  provider-key (random gegenereerd óf uit een wachtwoord afgeleid). Niet zelf uit het wachtwoord
 *  afleiden: wie zijn sync via een gegenereerde key verbond, heeft helemaal geen wachtwoord. */
export function eigenSyncKey(): string | null {
  const key = cleanKey(getPersisted<string | null>('tow:syncKey', null) ?? '');
  return key.length >= 8 ? key : null;
}

/** Hernoem een geregistreerde campagne-unit (veteraan) — XP/abilities/scars blijven behouden.
 *  De server hernoemt de register-rij én schrijft de nieuwe naam meteen in de cloud-lijsten. */
export async function hernoemRegiment(code: string, unitId: string, naam: string): Promise<{ unitId: string; naam: string }> {
  const { data, error } = await supabase.rpc('towc_companion_unit_hernoem', {
    p_code: cleanCode(code), p_unit_id: unitId, p_naam: naam,
  });
  if (error) throw error;
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  if (d.ok !== true) throw new Error(str(d.fout, 'CAMPAGNE_FOUT'));
  return { unitId: str(d.unitId), naam: str(d.naam) };
}

/** Verwijder een geregistreerd regiment DEFINITIEF (XP/abilities verloren; UI vraagt extra
 *  bevestiging). De server stript de naam ook uit de cloud-lijsten zodat sync 'm niet herschept. */
export async function verwijderRegiment(code: string, unitId: string): Promise<void> {
  const { data, error } = await supabase.rpc('towc_companion_unit_verwijder', {
    p_code: cleanCode(code), p_unit_id: unitId,
  });
  if (error) throw error;
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  if (d.ok !== true) throw new Error(str(d.fout, 'CAMPAGNE_FOUT'));
}

/** De naam-slug zoals de campagne 'm als unit-identiteit gebruikt (zelfde regex als server-side). */
export const regimentSlug = (naam: string): string => naam.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '-');

// ---- Cache --------------------------------------------------------------------------------------

export interface CachedCampaign { context: CampaignContext; fetchedAt: number }

/** Cache de laatst opgehaalde context met een tijdstempel; de UI beslist wanneer dit gebeurt. */
export function cacheCampaignContext(context: CampaignContext): void {
  const payload: CachedCampaign = { context, fetchedAt: Date.now() };
  setPersisted<CachedCampaign>(CTX_KEY, payload);
}

/** Lees de gecachete context terug, of null als er niets (geldigs) staat. */
export function getCachedCampaign(): CachedCampaign | null {
  const raw = getPersisted<CachedCampaign | null>(CTX_KEY, null);
  if (!raw || typeof raw !== 'object' || !raw.context || raw.context.ok !== true) return null;
  return raw;
}

/** Wis de gecachete context. */
export function clearCampaignCache(): void {
  setPersisted<CachedCampaign | null>(CTX_KEY, null);
}

/** De opgeslagen campagne-code (null als deze app nog niet gekoppeld is). */
export function getCampaignCode(): string | null {
  return getPersisted<string | null>(CODE_KEY, null);
}

// ---- Afgeleide modifiers ------------------------------------------------------------------------
// De campagne gate't sinds 05-07-2026 GEEN roster-unlocks meer (wizard-levels/unit-slots/cavalerie);
// de voormalige roster-gebouwen zijn PERK-gebouwen (hun `effect`-tekst = tafel-regel). Het enige wat
// nog mechanisch geldt is de fase-puntencap — die lees je rechtstreeks van `ctx.puntenCap`, dus er is
// geen afgeleide modifiers-functie meer nodig.

/** De enige mechanisch afgedwongen lijstbouw-modifier: de fase-puntencap. */
export function campaignPointsCap(ctx: CampaignContext): number {
  return ctx.puntenCap;
}
