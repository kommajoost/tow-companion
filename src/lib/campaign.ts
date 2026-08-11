import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { cleanKey } from './listSync';
import { getPersisted, setPersisted } from '../store';

// Client-laag voor de koppeling met de campagne-app "Isle of Celedon" (zelfde Supabase-project).
//
// 28-07-2026 — ACCOUNT-GEBASEERD. De oude koppeling (een 6-teken-code of je campagne-wachtwoord
// invullen in Settings) is weg: je logt hier in met hetzelfde account als op de campagne-site en de
// koppeling is er dan meteen. Eén account kan aan MEER dan één campagne hangen:
//   • "Isle of Celedon" — je voorbereiding vóór de campagnestart (altijd Act 1, cap 500);
//   • "Playtest"        — een slot in de test-game van de grensmaster.
// De server (towc_account_campagnes) geeft ze allemaal terug; is er meer dan één, dan kiest de speler.
// Bij precies één campagne — de situatie van elke gewone speler — gebeurt dat stil.

/** In welke Acts een unit laten vallen mag. Vast, zodat niemand z'n eigen historie hoeft te kennen.
 *  Staat hier bovenaan omdat `parseEen` 'm nodig heeft, en die draait al bij module-init (de
 *  cache-hydratie onderaan dit bestand). Sinds 11-08-2026 zijn de drop-Acts 3 en 5 (was 2/4/6). */
export const DROP_ACTS = [3, 5];

// localStorage-sleutels (via de gedeelde store, niet rechtstreeks localStorage).
const CODE_KEY = 'tow:campaignCode';
const CTX_KEY = 'tow:campaignCtx';
const ACTIEF_KEY = 'tow:campaignActief';

export interface CampaignRosterOptie { id: string; naam: string; level: number; effect: string }
export interface CampaignSpeler {
  id: string; naam: string; kleur: string; factie: string; alliantie: string;
  /** De factie als catalogus-slug ('dark-elves'), server-side afgeleid — de voorbereiding bewaart een
   *  weergavenaam ("Dark Elves"), een game-slot een slug. Hiermee kan de lijstbouwer het leger kiezen. */
  factieSlug: string;
}
export interface CampaignEvent { id: string; details?: Record<string, unknown> }
/** Eén regel uit het groei-register: waar een unit aan de campagne begon. `eersteKosten` is null als
 *  de campagne die Act nog geen punten per unit bewaarde (snapshots van vóór 30-07) — dan is er geen
 *  plafond te berekenen en blokkeert er niets. */
export interface CampaignBaseline {
  uid: string; introFase: number; eersteKosten: number | null; cat: string; acts: number;
  /** Zoveel modellen had deze unit bij haar LAATSTE inzending — de ondergrens. Een unit mag groeien,
   *  nooit krimpen: anders speel je punten vrij door een regiment uit te kleden. */
  laatsteModellen: number | null; laatsteFase: number | null;
}
export interface CampaignUnit { naam: string; catalogusId: string | null; cat: string | null; xp: number; abilities: number; littekens: number; status: string }
export interface CampaignContext {
  ok: true;
  /** Waar deze campagne uit komt: een voorbereiding (de echte campagne) of een game-slot. */
  bron: 'voorbereiding' | 'game';
  /** Stabiele sleutel van deze campagne = het speler-id ('c1' / 'p0'). Onthouden we als keuze. */
  key: string;
  /** Naam zoals de speler hem ziet: "Isle of Celedon" of "Playtest". */
  label: string;
  /** Staat de factie vast? (Voorbereiding: pas na 'Confirm faction'. Game-slot: altijd.) */
  factieVast: boolean;
  /** Is de lijst voor de HUIDIGE Act vergrendeld? Dan mag hij hier niet meer gewijzigd worden. */
  gelockt: boolean;
  /** De builder-uid van de lijst die de campagne ECHT op slot heeft (towc_spel_lijst.lijst_uid).
   *  Dit is de EXACTE identiteit: dezelfde `id` als op onze lijst staat, gelijk op elk device dat
   *  dezelfde sync-sleutel gebruikt. Is deze gevuld, dan hoeft er niets meer geraden te worden.
   *  Null voor lijsten die vóór 11-08-2026 zijn ingediend (toen legde de server de uid niet vast). */
  lijstId?: string | null;
  /** Naam + leger van de ingediende lijst — de terugval voor die oudere inzendingen. Zonder enige
   *  identiteit gold de lock voor élke campagne-lijst van die speler, ook een vers aangemaakte lege,
   *  die dan meteen "Locked for Act 1" toonde (Jasper, 10-08). */
  lijstNaam?: string | null;
  lijstLeger?: string | null;
  /** Voorbereiding: is de speler al uitgevaren? Game-slot: altijd true. */
  setSail: boolean;
  /** De koppelcode van het game-slot — nog gebruikt door de battle-brug. Null bij een voorbereiding. */
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
  // Groei-register: per unit-uid waar 'ie aan de campagne begon. Samen met de staffel hieronder
  // levert dit het plafond dat elke bestaande unit deze Act mag kosten.
  baseline: CampaignBaseline[];
  // In welke Acts je een unit mag laten vallen (vast: 2, 4 en 6) en of dat NU mag.
  dropActs: number[];
  magDroppen: boolean;
}

// ---- Defensieve parsing -------------------------------------------------------------------------

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v: unknown): boolean => v === true;

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
    // Oudere servers sturen geen factieSlug mee — val terug op de factie zelf (die was al een slug).
    factieSlug: str(s.factieSlug) || str(s.factie),
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

/** Zet één campagne-object uit de server om naar een CampaignContext. `bron` bepaalt het karakter:
 *  alles zonder expliciete bron behandelen we als game-slot (zo deed de oude server het ook). */
function parseEen(raw: unknown): CampaignContext {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const speler = parseSpeler(d.speler);
  const bron = d.bron === 'voorbereiding' ? 'voorbereiding' : 'game';
  return {
    ok: true,
    bron,
    key: str(d.key) || speler.id,
    label: str(d.label) || (bron === 'voorbereiding' ? 'Isle of Celedon' : 'Playtest'),
    factieVast: bron === 'game' ? true : bool(d.factieVast),
    gelockt: bool(d.gelockt),
    lijstId: typeof d.lijstId === 'string' && d.lijstId.trim() !== '' ? d.lijstId : null,
    lijstNaam: typeof d.lijstNaam === 'string' ? d.lijstNaam : null,
    lijstLeger: typeof d.lijstLeger === 'string' ? d.lijstLeger : null,
    setSail: bron === 'game' ? true : bool(d.setSail),
    koppelcode: typeof d.koppelcode === 'string' ? d.koppelcode : undefined,
    fase: num(d.fase, 1),
    week: num(d.week, 1),
    puntenCap: num(d.puntenCap),
    // compositie: alleen strings overhouden; ontbreekt/onbruikbaar ⇒ lege lijst (geen lock).
    compositie: arr(d.compositie).filter((v): v is string => typeof v === 'string'),
    itemAllowanceBonus: num(d.itemAllowanceBonus),
    speler,
    units: arr(d.units).map((raw2) => {
      const u = (raw2 && typeof raw2 === 'object' ? raw2 : {}) as Record<string, unknown>;
      return {
        naam: str(u.naam),
        catalogusId: typeof u.catalogusId === 'string' ? u.catalogusId : null,
        cat: typeof u.cat === 'string' ? u.cat : null,
        xp: num(u.xp), abilities: num(u.abilities), littekens: num(u.littekens),
        status: str(u.status, 'actief'),
      };
    }),
    rosterOpties: arr(d.rosterOpties).map(parseOptie),
    tafelTactiek: arr(d.tafelTactiek).map(parseOptie),
    events: arr(d.events).map(parseEvent),
    baseline: arr(d.baseline).map((raw2) => {
      const b = (raw2 && typeof raw2 === 'object' ? raw2 : {}) as Record<string, unknown>;
      const kosten = Number(b.eersteKosten);
      return {
        uid: str(b.uid),
        introFase: num(b.introFase, 1),
        // Bewust NIET naar 0 afronden: onbekend moet onbekend blijven, anders zou een unit met een
        // ontbrekende historie ineens een plafond van 0 krijgen en nooit meer legaal zijn.
        eersteKosten: Number.isFinite(kosten) ? kosten : null,
        cat: str(b.cat),
        acts: num(b.acts),
        laatsteModellen: Number.isFinite(Number(b.laatsteModellen)) ? Number(b.laatsteModellen) : null,
        laatsteFase: Number.isFinite(Number(b.laatsteFase)) ? Number(b.laatsteFase) : null,
      };
    }).filter((b) => b.uid),
    // Oudere servers sturen dropActs niet mee; DROP_ACTS is de regel, dus dat is de veilige default.
    dropActs: (() => {
      const lijst = arr(d.dropActs).map((v) => Number(v)).filter((n) => Number.isFinite(n));
      return lijst.length ? lijst : DROP_ACTS;
    })(),
    magDroppen: bool(d.magDroppen),
  };
}

/** Trim + upper-case de campagne-code voor de wire (codes zijn hoofdletter-ongevoelig ingevoerd). */
const cleanCode = (code: string): string => (code || '').trim().toUpperCase();

// ---- Ophalen ------------------------------------------------------------------------------------

/** Alle campagnes waar het INGELOGDE account aan hangt (server leest auth.uid()). Leeg = geen enkele.
 *  Gooit bij een verbindingsfout; `NIET_INGELOGD` levert een lege lijst (geen fout — je bent gewoon
 *  niet ingelogd, en de lijstbouwer werkt hier prima zonder). */
export async function laadCampagnes(): Promise<CampaignContext[]> {
  const { data, error } = await supabase.rpc('towc_account_campagnes');
  if (error) throw error;
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  if (d.ok !== true) {
    if (str(d.fout) === 'NIET_INGELOGD') return [];
    throw new Error(str(d.fout, 'CAMPAGNE_FOUT'));
  }
  return arr(d.campagnes).map(parseEen);
}

// ---- Module-store: de campagnes + welke actief is -----------------------------------------------
// Zelfde patroon als lib/auth.ts en theme.tsx: een piepklein store'tje op moduleniveau dat elke
// consument via useSyncExternalStore gelijk houdt. Eén auth-subscriptie voor de hele app-levensduur.

export interface CampagneState {
  campagnes: CampaignContext[];
  /** De gekozen campagne (of de enige). Null zolang er niets is. */
  actief: CampaignContext | null;
  /** True tot de eerste poging klaar is — laat de UI "geen campagne" niet even laten flitsen. */
  laden: boolean;
  fout: string | null;
}

let state: CampagneState = { campagnes: [], actief: null, laden: true, fout: null };
const listeners = new Set<() => void>();

function emit() { for (const fn of listeners) fn(); }
function setState(next: CampagneState) { state = next; emit(); }

/** Kies uit een lijst de campagne die actief moet zijn: de onthouden keuze als die er nog is, anders
 *  de eerste (de voorbereiding staat vooraan — dat is de echte campagne). */
function bepaalActief(lijst: CampaignContext[]): CampaignContext | null {
  if (lijst.length === 0) return null;
  const onthouden = getPersisted<string | null>(ACTIEF_KEY, null);
  return lijst.find((c) => c.key === onthouden) ?? lijst[0];
}

/** Haal de campagnes (opnieuw) op en werk de store bij. Faalt stil naar `fout` — een onbereikbare
 *  campagne mag de lijstbouwer nooit blokkeren. */
export async function verversCampagnes(): Promise<CampaignContext[]> {
  try {
    const lijst = await laadCampagnes();
    const actief = bepaalActief(lijst);
    setState({ campagnes: lijst, actief, laden: false, fout: null });
    // Cache de actieve context in de oude vorm: schermen die 'm synchroon nodig hebben (de battle-brug,
    // de game-setup) lezen nog getCachedCampaign().
    if (actief) cacheCampaignContext(actief);
    else clearCampaignCache();
    return lijst;
  } catch (e) {
    const fout = e instanceof Error ? e.message : 'CAMPAGNE_FOUT';
    setState({ ...state, laden: false, fout });
    return state.campagnes;
  }
}

/** Zet de actieve campagne (onthouden op dit apparaat). Onbekende sleutel ⇒ niets. */
export function kiesCampagne(key: string): void {
  const gekozen = state.campagnes.find((c) => c.key === key);
  if (!gekozen) return;
  setPersisted<string | null>(ACTIEF_KEY, key);
  setState({ ...state, actief: gekozen });
  cacheCampaignContext(gekozen);
}

// Eén keer hydrateren uit de cache (zodat er meteen iets staat), dan ophalen bij elke auth-wijziging.
if (typeof window !== 'undefined') {
  const cached = getCachedCampaign()?.context ?? null;
  if (cached) state = { campagnes: [cached], actief: cached, laden: true, fout: null };
  void verversCampagnes();
  // TERUG IN DE APP = OPNIEUW OPHALEN (10-08). De context werd alleen bij het opstarten en bij een
  // auth-wijziging geladen. Ontgrendelde je je lijst in de campagne-app, dan bleef de Companion in een
  // al open tab de oude stand tonen ("werkt nog niet echt", Joost). Nu verversen we zodra het tabblad
  // weer zichtbaar wordt of focus krijgt -- precies het moment waarop je van de ene app naar de andere
  // wisselt. Gethrottled op 5s zodat wisselen tussen tabs geen stortvloed aan calls geeft.
  let laatsteVervers = Date.now();
  const misschienVervers = () => {
    if (document.visibilityState === 'hidden') return;
    if (Date.now() - laatsteVervers < 5000) return;
    laatsteVervers = Date.now();
    void verversCampagnes();
  };
  document.addEventListener('visibilitychange', misschienVervers);
  window.addEventListener('focus', misschienVervers);

  supabase.auth.onAuthStateChange((event) => {
    // TOKEN_REFRESHED verandert niets aan WIE je bent — daar hoeft de campagne niet opnieuw voor.
    if (event === 'TOKEN_REFRESHED') return;
    if (event === 'SIGNED_OUT') {
      setPersisted<string | null>(ACTIEF_KEY, null);
      clearCampaignCache();
      setState({ campagnes: [], actief: null, laden: false, fout: null });
      return;
    }
    void verversCampagnes();
  });
}

function subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }
function getSnapshot(): CampagneState { return state; }

/** Non-React lees van de huidige stand. */
export function campagneStand(): CampagneState { return state; }

/** React-hook: de campagnes van dit account + welke actief is, live bijgehouden. */
export function useCampagnes(): CampagneState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ---- Losse RPC's die een koppelcode nodig hebben ------------------------------------------------

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

// ---- De lijstkeuring van de campagne ------------------------------------------------------------
// De campagne keurt de lijst die in de CLOUD staat (tow_lists), niet de lijst in dit tabblad. Vraag
// 'm dus pas op nadat de sync geduwd heeft — `lastSyncedAt` uit useListSync is daar het signaal
// voor. De server is de autoriteit: dezelfde functie beslist of je mag indienen.

/** De keuring van één campagne-lijst zoals `towc_lijst_diff` 'm teruggeeft. */
export interface LijstKeuring {
  ok: boolean;
  /** Alleen bij ok=false: waarom er niets te keuren viel (bv. GEEN_CAMPAGNE_LIJST). */
  fout?: string;
  hint?: string;
  fase: number;
  cap: number;
  punten: number;
  puntenBekend: boolean;
  /** Blokkerend: zolang hier iets in staat mag de lijst niet ingediend worden. */
  fouten: string[];
  waarschuwingen: string[];
  /** Het eindoordeel van de server. */
  mag: boolean;
  gelockt: boolean;
  magDroppen: boolean;
  dropActs: number[];
  eersteAct: boolean;
  drops: string[];
}

function parseKeuring(raw: unknown): LijstKeuring {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === 'string');
  return {
    ok: d.ok === true,
    fout: typeof d.fout === 'string' ? d.fout : undefined,
    hint: typeof d.hint === 'string' ? d.hint : undefined,
    fase: num(d.fase, 1),
    cap: num(d.cap),
    punten: num(d.punten),
    puntenBekend: bool(d.puntenBekend),
    fouten: strs(d.fouten),
    waarschuwingen: strs(d.waarschuwingen),
    // Geen expliciet oordeel (oude server, of ok=false) ⇒ niet indienen. Nooit stilzwijgend "mag wel".
    mag: bool(d.mag),
    gelockt: bool(d.gelockt),
    magDroppen: bool(d.magDroppen),
    dropActs: arr(d.dropActs).map((v) => Number(v)).filter((n) => Number.isFinite(n)),
    eersteAct: bool(d.eersteAct),
    drops: strs(d.drops),
  };
}

/** Keur de lijst van deze speler zoals de campagne 'm nu in de cloud ziet. */
export async function keurLijst(speler: string): Promise<LijstKeuring> {
  const { data, error } = await supabase.rpc('towc_lijst_diff', { p_speler: speler });
  if (error) throw error;
  return parseKeuring(data);
}

/** Dien de lijst in voor de huidige Act. De server keurt zelf opnieuw en weigert een lijst met
 *  fouten — deze knop kan dus niets forceren wat de campagne niet toestaat. */
export async function dienLijstIn(speler: string): Promise<LijstKeuring> {
  const { data, error } = await supabase.rpc('towc_lijst_lock', { p_speler: speler });
  if (error) throw error;
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  // Weigering komt terug als { ok:false, fout:'LIJST_ONGELDIG', fouten:[…] } — geen volledige keuring.
  if (d.ok !== true) {
    const k = parseKeuring(d);
    throw new Error(k.fouten[0] ?? str(d.fout, 'Could not submit the list.'));
  }
  return parseKeuring(data);
}

/** Het minimum dat we van een opgeslagen lijst moeten weten om 'm te kunnen identificeren. */
export interface LijstIdentiteit {
  id: string; name: string; army: string;
  campaign?: boolean; campaignSpeler?: string;
}

/** Is DIT de lijst die de campagne voor de huidige Act op slot heeft?
 *
 *  Eén bron van waarheid voor de builder én het Celedon-paneel — die liepen uit elkaar en zetten
 *  daardoor allebei een ander slot. Sinds 11-08-2026 geeft de server de builder-uid van de gelockte
 *  lijst mee (`lijstId`) en is dit een exacte vergelijking.
 *
 *  Voor inzendingen van vóór die datum is er alleen een naam+leger-snapshot; die matchen we strikt.
 *  Is er geen enkel spoor van de ingediende lijst (oude server, of een lijst die niet meer bestaat),
 *  dan is het antwoord NEE. Die kant is bewust gekozen: onterecht bewerkbaar is hooguit verwarrend —
 *  de server keurt bij het indienen opnieuw en weigert een tweede lock (AL_GELOCKT) — terwijl
 *  onterecht op slot de speler volledig blokkeert. Precies dát overkwam Jasper (10/11-08). */
export function isIngediendeLijst(ctx: CampaignContext | null, lijst: LijstIdentiteit | null): boolean {
  if (!ctx || !lijst) return false;
  if (!lijst.campaign || lijst.campaignSpeler !== ctx.speler.id) return false;
  if (ctx.lijstId) return lijst.id === ctx.lijstId;
  const leger = ctx.lijstLeger ?? null;
  const naam = ctx.lijstNaam ?? null;
  if (!leger && !naam) return false;
  if (leger && lijst.army !== leger) return false;
  return !!naam && lijst.name.trim() === naam.trim();
}

/** Staat deze lijst op slot? = de campagne is gelockt EN het is de ingediende lijst. */
export function staatOpSlot(ctx: CampaignContext | null, lijst: LijstIdentiteit | null): boolean {
  return !!ctx?.gelockt && isIngediendeLijst(ctx, lijst);
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
  // Oude caches (vóór 28-07) missen bron/key/label — parseEen vult die veilig aan.
  return { context: parseEen(raw.context), fetchedAt: num(raw.fetchedAt) };
}

/** Wis de gecachete context. */
export function clearCampaignCache(): void {
  setPersisted<CachedCampaign | null>(CTX_KEY, null);
}

/** De koppelcode van de actieve campagne. Sinds de account-koppeling voert de speler die niet meer
 *  zelf in; de code komt uit de campagne-context en bestaat alleen voor een GAME-slot (de battle-brug
 *  gebruikt 'm nog). Een voorbereiding heeft er geen — daar zijn ook nog geen battles. */
export function getCampaignCode(): string | null {
  return state.actief?.koppelcode ?? getPersisted<string | null>(CODE_KEY, null) ?? null;
}

/** De sync-key van deze app, of null zonder actieve list-sync. Bron is `tow:syncKey` — de ECHTE
 *  provider-key (uit het account afgeleid, random gegenereerd, óf uit een wachtwoord). */
export function eigenSyncKey(): string | null {
  const key = cleanKey(getPersisted<string | null>('tow:syncKey', null) ?? '');
  return key.length >= 8 ? key : null;
}

// ---- Afgeleide modifiers ------------------------------------------------------------------------
// De campagne gate't sinds 05-07-2026 GEEN roster-unlocks meer (wizard-levels/unit-slots/cavalerie);
// de voormalige roster-gebouwen zijn PERK-gebouwen (hun `effect`-tekst = tafel-regel). Het enige wat
// nog mechanisch geldt is de fase-puntencap — die lees je rechtstreeks van `ctx.puntenCap`.

/** De fase-puntencap — de eerste van de drie mechanisch afgedwongen lijstbouw-regels. */
export function campaignPointsCap(ctx: CampaignContext): number {
  return ctx.puntenCap;
}

// ---- Groei per unit -----------------------------------------------------------------------------
// Regel 2 (02-08-2026): een unit die al eerder is ingediend mag elke Act een beetje duurder worden,
// gemeten tegen de kosten waarmee 'ie DEBUTEERDE — niet tegen de vorige Act. De ruimte stapelt dus
// op en je mag 'm bewaren. Een unit uit Act 1 van 150 pt mag in Act 5 hooguit 150 + 4×25 = 250 pt
// kosten. Nieuwe units hebben geen plafond: die passen alleen binnen de gewone puntencap.
//
// De server (towc_groei_staffel / towc_lijst_diff) rekent exact hetzelfde na bij het indienen. Deze
// kopie bestaat zodat de speler het TIJDENS het bouwen ziet in plaats van pas bij het inleveren;
// de server blijft de autoriteit.

/** Groeiruimte per Act. Characters krijgen het dubbele: een Act-1 generaal moet magic items en
 *  wizard-levels kunnen meenemen naar een lijst die uiteindelijk 4× zo groot is. */
export const groeiStaffel = (cat: string): number => (cat === 'characters' ? 50 : 25);

export interface GroeiPlafond {
  max: number; basis: number; introFase: number; staffel: number;
  /** Ondergrens in modellen (uit de laatste inzending), of null als die er niet is. */
  minModellen: number | null; laatsteFase: number | null;
}

/**
 * Het plafond per unit-uid voor de huidige Act, klaar om als `campaignMods.groei` aan `validate`
 * te geven. `catVan` levert de HUIDIGE categorie van een entry: die bepaalt de staffel, en een unit
 * kan sinds z'n debuut van categorie gewisseld zijn. Units zonder bewaarde debuutkosten blijven
 * eruit — geen plafond is beter dan een verzonnen plafond.
 */
export function groeiPlafonds(
  ctx: CampaignContext,
  catVan: (uid: string) => string | undefined,
): Record<string, GroeiPlafond> {
  const uit: Record<string, GroeiPlafond> = {};
  for (const b of ctx.baseline) {
    if (b.eersteKosten == null) continue;
    const staffel = groeiStaffel(catVan(b.uid) ?? b.cat);
    const acts = Math.max(0, ctx.fase - b.introFase);
    uit[b.uid] = {
      max: b.eersteKosten + staffel * acts, basis: b.eersteKosten, introFase: b.introFase, staffel,
      minModellen: b.laatsteModellen, laatsteFase: b.laatsteFase,
    };
  }
  return uit;
}
