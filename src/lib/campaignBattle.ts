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
  /** Door de campagne bestuurde AI-general. Die drukt nooit op Start en keurt nooit een rapport goed,
   *  dus er valt niets te wachten: de server stempelt zo'n kant automatisch mee (30-07). */
  ai: boolean;
}

/** Samenvatting van een gekozen campagne-lijst (alleen namen/punten — GEEN stats). Alleen gevuld
 *  als beide kanten gelockt zijn. We gebruiken de `naam` om een eigen builder-lijst te auto-matchen;
 *  het volledige leger komt uit de speler z'n eigen Companion-lijsten, niet hieruit. */
export interface BattleLijstSamenvatting {
  naam: string;
  punten: number;
  leger: string;
  /** Sinds 30-07 volledige unit-regels: aantal, categorie, punten en de gekozen opties, uitgerekend
   *  door OWC zelf en via de campagne doorgegeven. Battles van vóór die datum leverden kale namen;
   *  die worden hier naar `{ naam }` opgetild, met punten/opties leeg. */
  units: BattleLijstUnit[];
}

/** Eén unit-regel in een campagne-lijst. `punten` is null als de campagne het (nog) niet weet — dan
 *  tonen we een streepje in plaats van een verzonnen getal. */
export interface BattleLijstUnit {
  uid: string | null;
  unitId: string | null;
  naam: string;
  /** Catalogusnaam; null bij een oude battle die alleen namen bewaarde. */
  datasheet: string | null;
  cat: string | null;
  modellen: number;
  punten: number | null;
  opties: string[];
}

/** Wie heeft er al op Start (en op Eindigen) gedrukt. De battle loopt pas als BEIDE kanten gestart
 *  zijn, en is pas afgelopen als beide 'klaar' staan — anders kon één speler het potje alleen
 *  beginnen en zelfs afsluiten (Joost 30-07). Optioneel: een oudere server stuurt het niet mee. */
export interface BattleHanden {
  startAanv: string | null;
  startVerd: string | null;
  klaarAanv: string | null;
  klaarVerd: string | null;
  beideGestart: boolean;
  beideKlaar: boolean;
}

/** Eén veteraan-unit (campagne-progressie) voor een battle-kant. De server voegt dit toe aan
 *  `towc_battle_by_code` zodra beide legers gelockt zijn, gekeyd op `unitId` (= de builder-uid van
 *  de lijst-entry, met terugval op de oude naam-slug/het type-id — één gedeelde afleiding, zie
 *  `campaignUnitId` in owbBuilder.ts, en `ArmyUnit.campaignId` in builderToArmy.ts). Zo kan OWC de
 *  campagne-XP/abilities/scars op de juiste unit in het geladen leger tonen. */
export interface VetUnit {
  unitId: string;
  naam: string;
  cat: string | null;
  xp: number;
  /** Gewonnen veteran-abilities: `t` = engine-type (zie ABILITY_LABEL), `keuze` = evt. sub-keuze
   *  (bv. 'ws'/'bs' bij Weapon Master), anders null. */
  abilities: { t: string; keuze: string | null }[];
  /** Aantal battle-scars (Battlefield Losses) op deze unit. */
  littekens: number;
}

/** Eén actieve gebouw-perk (campagne-progressie) voor een battle-kant. `label`+`effect` zijn
 *  server-side al leesbaar gemaakt; we tonen ze read-only. */
export interface Perk {
  perk: string;
  label: string;
  effect: string;
}

/** Veteraan-units per kant. Alleen gevuld als `beideGelockt`. */
export interface BattleVeteranen {
  aanvaller: VetUnit[];
  verdediger: VetUnit[];
}

/** Actieve gebouw-perks per kant. Alleen gevuld als `beideGelockt`. */
export interface BattlePerks {
  aanvaller: Perk[];
  verdediger: Perk[];
}

/** Eén gevonden magic item (campagne-progressie) dat de speler aan zijn leger hangt (max 1). De
 *  server maakt naam/effect al leesbaar; we tonen ze read-only. `soort` === 'consumable' → single
 *  use (één keer bruikbaar per battle). */
export interface FoundItem {
  naam: string;
  punten: number;
  effect: string;
  soort: string;
}

/** Aangehangen magic item per kant (max 1, of null). Alleen gevuld als `beideGelockt`. */
export interface BattleItems {
  aanvaller: FoundItem | null;
  verdediger: FoundItem | null;
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
  /** Veteraan-progressie per kant — alleen gevuld als `beideGelockt`. Optioneel: oude servers
   *  sturen het niet mee → undefined (de UI toont dan niks). */
  veteranen?: BattleVeteranen;
  /** Actieve gebouw-perks per kant — alleen gevuld als `beideGelockt`. Optioneel (zie boven). */
  perks?: BattlePerks;
  /** Act-nummer en de punten-cap van die Act. De cap bepaalt welke legergrootte-kolom van de officiële
   *  Tournament-Points-tabel geldt. Optioneel: oudere servers sturen het niet mee. */
  fase?: number;
  cap?: number;
  /** Aangehangen found magic item per kant (max 1) — alleen gevuld als `beideGelockt`. Optioneel
   *  (oude servers sturen het niet mee → undefined). */
  items?: BattleItems;
  /** Start-/klaar-stand van beide kanten. Optioneel (oude server → undefined; dan geen poort). */
  handen?: BattleHanden;
  /** Loopt de WAR PHASE van deze Act al? Een battle wordt in de War phase gespeeld, niet terwijl er nog
   *  generals marcheren — de server weigert een start met NOG_REALM_PHASE. Optioneel: een oudere server
   *  stuurt het niet mee (undefined) en dan houden we de knop open, want dan is er ook geen poort. */
  warFase?: boolean;
  /** Ruwe act_status uit de campagne ('initiatief' | 'beurten' | 'battles' | 'afronding'). */
  actStatus?: string | null;
}

function parseSide(raw: unknown): BattleSide {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { id: str(s.id), naam: str(s.naam), factie: str(s.factie), kleur: str(s.kleur), ai: s.ai === true };
}

/** Eén unit-regel, tolerant voor beide formaten: een kale naam-string (oude battles) of het volledige
 *  object. Ontbrekende punten blijven null — nooit 0, want 0 pts is een bewering. */
function parseLijstUnit(raw: unknown): BattleLijstUnit {
  if (typeof raw === 'string') {
    return { uid: null, unitId: null, naam: raw, datasheet: null, cat: null, modellen: 1, punten: null, opties: [] };
  }
  const u = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    uid: typeof u.uid === 'string' ? u.uid : null,
    unitId: typeof u.unitId === 'string' ? u.unitId : null,
    naam: str(u.naam),
    datasheet: typeof u.datasheet === 'string' && u.datasheet ? u.datasheet : null,
    cat: typeof u.cat === 'string' ? u.cat : null,
    modellen: Math.max(1, num(u.modellen) || 1),
    punten: typeof u.punten === 'number' ? u.punten : null,
    opties: arr(u.opties).filter((o): o is string => typeof o === 'string'),
  };
}

function parseLijst(raw: unknown): BattleLijstSamenvatting | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  return {
    naam: str(l.naam),
    punten: num(l.punten),
    leger: str(l.leger),
    units: arr(l.units).map(parseLijstUnit).filter((u) => !!u.naam),
  };
}

/** Undefined als het veld ontbreekt (oude server). */
function parseHanden(raw: unknown): BattleHanden | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const h = raw as Record<string, unknown>;
  const ts = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  return {
    startAanv: ts(h.startAanv), startVerd: ts(h.startVerd),
    klaarAanv: ts(h.klaarAanv), klaarVerd: ts(h.klaarVerd),
    beideGestart: h.beideGestart === true,
    beideKlaar: h.beideKlaar === true,
  };
}

function parseAbility(raw: unknown): { t: string; keuze: string | null } {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { t: str(a.t), keuze: typeof a.keuze === 'string' ? a.keuze : null };
}

function parseVetUnit(raw: unknown): VetUnit {
  const u = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    unitId: str(u.unitId),
    naam: str(u.naam),
    cat: typeof u.cat === 'string' ? u.cat : null,
    xp: num(u.xp),
    abilities: arr(u.abilities).map(parseAbility).filter((a) => a.t),
    littekens: num(u.littekens),
  };
}

/** Undefined als het veld ontbreekt (oude server) — anders per kant een defensief geparste lijst. */
function parseVeteranen(raw: unknown): BattleVeteranen | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const v = raw as Record<string, unknown>;
  return { aanvaller: arr(v.aanvaller).map(parseVetUnit), verdediger: arr(v.verdediger).map(parseVetUnit) };
}

function parsePerk(raw: unknown): Perk {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { perk: str(p.perk), label: str(p.label), effect: str(p.effect) };
}

/** Undefined als het veld ontbreekt (oude server) — anders per kant een defensief geparste lijst. */
function parsePerks(raw: unknown): BattlePerks | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  return { aanvaller: arr(p.aanvaller).map(parsePerk), verdediger: arr(p.verdediger).map(parsePerk) };
}

/** Null als er geen item hangt — anders een defensief geparst item. */
function parseItem(raw: unknown): FoundItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const i = raw as Record<string, unknown>;
  const naam = str(i.naam);
  if (!naam) return null;
  return { naam, punten: num(i.punten), effect: str(i.effect), soort: str(i.soort) };
}

/** Undefined als het veld ontbreekt (oude server) — anders per kant een item of null. */
function parseItems(raw: unknown): BattleItems | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const i = raw as Record<string, unknown>;
  return { aanvaller: parseItem(i.aanvaller), verdediger: parseItem(i.verdediger) };
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
    veteranen: parseVeteranen(d.veteranen),
    perks: parsePerks(d.perks),
    items: parseItems(d.items),
    handen: parseHanden(d.handen),
    warFase: typeof d.warFase === 'boolean' ? d.warFase : undefined,
    actStatus: typeof d.actStatus === 'string' ? d.actStatus : null,
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

/** Zet (of haal) je eigen Start-/Eindigen-stempel op deze battle. De battle begint pas als BEIDE
 *  kanten 'start' gezet hebben; 'klaar' weigert server-side zolang er niet gestart is. Geeft de
 *  verse stand van beide kanten terug. */
export async function battleHandZet(
  code: string,
  kant: 'aanvaller' | 'verdediger',
  soort: 'start' | 'klaar' = 'start',
  aan = true,
): Promise<BattleHanden | undefined> {
  const { data, error } = await supabase.rpc('towc_battle_hand_zet', {
    p_code: cleanBattleCode(code), p_kant: kant, p_soort: soort, p_aan: aan,
  });
  if (error) throw error;
  return parseHanden(data);
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
  /** 01-08: battle-quest gehaald, per kant. Battle-quests zijn TAFEL-feiten ("vang de standaard",
   *  "versla hun generaal") die de campagne-app nooit zelf kan zien, dus vinken de twee spelers ze
   *  hier samen af. De campagne-RPC roept per `true` towc_spel_quest_voltooi aan; false = geen actie. */
  questAanv?: boolean;
  questVerd?: boolean;
  /** Campagne-relevante per-unit feiten voor de MELDENDE speler z'n EIGEN leger — voedt de
   *  veteraan-XP + battle-scar-triggers van "De Grensvorsten". De campagne-RPC mag dit voorlopig
   *  negeren; het gaat mee in dezelfde jsonb-payload. Optioneel (oude clients sturen het niet). */
  veteraan?: {
    /** Campagne-unit-id (matcht towc_spel_unit.unit_id) — dezelfde sleutel als `VetUnit.unitId`,
     *  afgeleid via `campaignUnitId` (owbBuilder.ts) en gedragen door `ArmyUnit.campaignId`. */
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

/** De zeven officiële uitkomsten (Tournament Points), altijd vanuit de AANVALLER gezien. */
export type ToernooiResultaat = 'CD' | 'RD' | 'MD' | 'D' | 'MV' | 'RV' | 'CV';

export const RESULTAAT_NAAM: Record<ToernooiResultaat, string> = {
  CD: 'Crushing Defeat', RD: 'Resounding Defeat', MD: 'Marginal Defeat', D: 'Draw',
  MV: 'Marginal Victory', RV: 'Resounding Victory', CV: 'Crushing Victory',
};
export const TP_VAN_RESULTAAT: Record<ToernooiResultaat, number> = {
  CD: 0, RD: 1, MD: 2, D: 3, MV: 4, RV: 5, CV: 6,
};
/** De uitkomst gespiegeld naar de andere kant (winnaar ↔ verliezer). */
export const SPIEGEL: Record<ToernooiResultaat, ToernooiResultaat> = {
  CV: 'CD', RV: 'RD', MV: 'MD', D: 'D', MD: 'MV', RD: 'RV', CD: 'CV',
};

/**
 * Vraag de SERVER om de officiële uitslag bij dit VP-verschil. Bewust géén eigen kopie van de
 * VP-tabel hier: die staat al in de campagne-DB (`towc_vp_resultaat`) én in de campagne-frontend.
 * Een derde kopie zou onvermijdelijk uit de pas gaan lopen.
 * `cap` = de punten-cap van de Act (bepaalt de legergrootte-kolom); komt mee met `battleByCode`.
 */
export async function officieleUitslag(vpAanvaller: number, vpVerdediger: number, cap: number): Promise<ToernooiResultaat | null> {
  const { data, error } = await supabase.rpc('towc_vp_resultaat', {
    p_vp_aanv: Math.max(0, Math.round(vpAanvaller)),
    p_vp_verd: Math.max(0, Math.round(vpVerdediger)),
    p_cap: cap,
  });
  if (error || typeof data !== 'string') return null;
  return data as ToernooiResultaat;
}

/** Meld de uitslag van een campagne-battle terug (als voorstel). Gated op de sync-code. */
/** De actieve BATTLE-quest van één kant, met de tekst uit de campagne-catalogus. */
export interface BattleQuest {
  speler: string;
  questId: string;
  naam: string;
  opdracht: string;
  fame: number;
  goud: number;
}

/** Beide kanten hun openstaande battle-quest voor deze Act (null = geen, of een realm-quest die
 *  server-side geverifieerd wordt en dus niet aan tafel afgevinkt hoort te worden). */
export interface BattleQuests {
  aanvaller: BattleQuest | null;
  verdediger: BattleQuest | null;
}

function parseQuest(v: unknown): BattleQuest | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Record<string, unknown>;
  if (typeof d.questId !== 'string' || !d.questId) return null;
  return {
    speler: str(d.speler),
    questId: d.questId,
    naam: str(d.naam, d.questId),
    opdracht: str(d.opdracht),
    fame: num(d.fame),
    goud: num(d.goud),
  };
}

/** Haal de battle-quests van beide kanten op. Onbekende code / geen campagne-battle → beide null. */
export async function battleQuests(code: string): Promise<BattleQuests> {
  const { data, error } = await supabase.rpc('towc_battle_quests', { p_code: cleanBattleCode(code) });
  if (error) throw error;
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  if (d.ok !== true) return { aanvaller: null, verdediger: null };
  return { aanvaller: parseQuest(d.aanvaller), verdediger: parseQuest(d.verdediger) };
}

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

// ---- Veteraan-ability labels (geport uit "De Grensvorsten") --------------------------------------
// De campagne (site/src/pages/Spel.tsx, ~r46-60) mapt de engine-ability-`t` op de officiële TOW-naam
// + effect-tekst. We porten diezelfde tekst hier zodat OWC's veteraan-chips exact tonen wat De
// Grensvorsten toont. Onbekende types vallen terug op het ruwe `t` (label) / leeg (effect).
export const ABILITY_LABEL: Record<string, string> = {
  grizzled: 'Grizzled Veteran',
  experienced: 'Experienced Warriors',
  weapon_master: 'Weapon Master',
  fighting_formation: 'Fighting Formation',
  spoils: 'The Spoils of War',
};
export const ABILITY_EFFECT: Record<string, string> = {
  grizzled: '+1 Leadership (to a max of 10).',
  experienced: 'Once per game, re-roll To Hit rolls of a natural 1. Rolled again → a second re-roll.',
  weapon_master: '+1 Weapon Skill or Ballistic Skill, your choice (max 10).',
  fighting_formation: '+1 to the maximum rank bonus (max +4).',
  spoils: '+1 Armour Piercing on one weapon (max −5).',
};
/** Leesbaar ability-label ('weapon_master' → 'Weapon Master'); valt terug op het ruwe type. */
export const abilityLabel = (t: string): string => ABILITY_LABEL[t] ?? t;
/** Effect-tekst van een ability-type (leeg bij onbekend) — geschikt als tooltip/title. */
export const abilityEffect = (t: string): string => ABILITY_EFFECT[t] ?? '';
/** Scar-badge-tekst: 1 → 'scar', N → 'N scars' (zelfde bewoording als De Grensvorsten). */
export const scarLabel = (n: number): string => (n === 1 ? 'scar' : `${n} scars`);
