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
  /** Aangehangen found magic item per kant (max 1) — alleen gevuld als `beideGelockt`. Optioneel
   *  (oude servers sturen het niet mee → undefined). */
  items?: BattleItems;
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
