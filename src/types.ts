// Shape of the data produced by scripts/scrape.mjs (public/rules.json).

// Type-only import: VpBonus komt uit de VP-engine, die op zijn beurt `import type`-only uit dit
// bestand leest. Beide zijden zijn puur type-only, dus deze cyclus verdwijnt bij compile (geen
// runtime-import) en is veilig.
import type { VpBonus } from './lib/victoryPoints';

/** A Contentful rich-text node (paragraph, heading, list, table, text, link, ...). */
export interface RichNode {
  nodeType: string;
  value?: string;
  marks?: { type: string }[];
  data?: {
    uri?: string;
    target?: {
      sys?: { id?: string };
      fields?: { slug?: string; name?: string };
      /** Contentful content-type id of the target, e.g. "ruleType" or "chart". */
      kind?: string | null;
    };
  };
  content?: RichNode[];
}

export interface Rule {
  slug: string;
  name: string;
  order: number | null;
  pageReference: number | null;
  /** The top-level section this rule belongs to (null for sections themselves). */
  parentSlug: string | null;
  body: RichNode | null;
  /** Plain-text version of the body, used for search. */
  bodyIndex: string;
  /** For sections: the ordered, flat list of sub-rule slugs. */
  childSlugs: string[];
  prevSlug: string | null;
  nextSlug: string | null;
  /** Related rules surfaced by the wiki. */
  crossRefSlugs: string[];
  /** Slugs referenced by inline links inside the body. */
  refSlugs: string[];
}

/** One phase of a player turn; its steps are walked through during a game. */
export interface Phase {
  slug: string;
  name: string;
  stepSlugs: string[];
}

export interface NavSection {
  slug: string;
  name: string;
  order: number | null;
  childSlugs: string[];
}

/** One spell within a Lore of Magic. `slug` is the `spell-<x>` rule key in `rules`. */
export interface LoreSpell {
  slug: string;
  name: string;
  /** 1–6 for numbered spells, null for the signature spell. */
  number: number | null;
  signature: boolean;
}

/** A Lore of Magic and its ordered list of spells. */
export interface Lore {
  slug: string;
  name: string;
  /** Accent colour from the wiki's magicLore entry (e.g. "#6d007a"), or null. */
  color: string | null;
  spells: LoreSpell[];
}

export interface RulesData {
  source: string;
  scrapedAt: string;
  rules: Record<string, Rule>;
  turn: { phases: Phase[]; magicSlug: string | null };
  nav: NavSection[];
  /** Magic lores keyed by slug (optional — absent in older data bundles). */
  lores?: Record<string, Lore>;
  /** Lore slugs in display order (full lores first, then supplementary). */
  loreList?: string[];
}

// ---- Flow enrichment (public/flow.json) ----
// Adds interpreted structure on top of the verbatim rules so each step reads as a
// continuous whole. Rule text is never stored here — blocks reference a slug and the
// verbatim body is resolved from `rules`.
export type FlowBlockType = 'explain' | 'conditional' | 'ability' | 'seealso';

export interface FlowBlock {
  type: FlowBlockType;
  /** Slug of the related rule whose verbatim body this block shows. */
  slug: string;
  /** Short framing written by the enrichment, e.g. a condition question. */
  label?: string;
}

export interface FlowStep {
  /** Optional "only do this step if…" question shown as a banner. */
  stepCondition?: string;
  blocks: FlowBlock[];
}

export interface FlowData {
  generatedAt?: string;
  model?: string;
  /** Steps folded into a parent step and removed from the walkthrough sequence. */
  hidden?: string[];
  steps: Record<string, FlowStep>;
}

// ---- Companion structure (public/companion.json) ----
// The curated turn structure shown in Play: 4 phases × 4 sub-phases, each with tabs.
// "Quick" tabs are hand-written; "Rules" tabs render verbatim wiki bodies via `rule` blocks.
export interface CompanionBlock {
  type: 'steps' | 'dice' | 'prose' | 'callouts' | 'reactions' | 'defs' | 'note' | 'rule' | 'chart' | 'detail';
  // steps: ordered action prompts
  items?: unknown;
  // dice helper
  m?: number;
  d?: number[];
  total?: string;
  note?: string;
  // note / fallback text
  text?: string;
  // rule: verbatim rule resolved from rules.json
  slug?: string;
}

export interface CompanionTab {
  id: string;
  label: string;
  blocks: CompanionBlock[];
}

export interface CompanionSub {
  name: string;
  intro: string;
  tabs: CompanionTab[];
}

export interface CompanionPhase {
  id: string;
  num: string; // 'I'..'IV'
  name: string;
  glyph: string;
  flavour: string;
  next?: string; // label shown on the final "Advance" (e.g. 'Shooting Phase')
  subs: CompanionSub[];
}

export interface CompanionData {
  round?: string;
  phases: CompanionPhase[];
}

// ---- Game mode: parsed army lists (Old World Builder export) ----

/** A single stat profile line, e.g. [Dark Steed] M(9) WS(3) … Ld(-). */
export interface UnitProfile {
  label: string;
  /** Ordered stat cells, e.g. [{k:'M',v:'9'}, {k:'WS',v:'3'}, …]. */
  stats: { k: string; v: string; modified?: boolean; base?: string; source?: string }[];
}

export interface ArmyUnit {
  id: string; // stable within an army (index-based)
  /** Campagne-koppeling (De Grensvorsten): matcht towc_spel_unit.unit_id = de builder-uid van de
   *  lijst-entry (terugval: oude naam-slug, dan het type-id) — afgeleid via de gedeelde helper
   *  `campaignUnitId` (owbBuilder.ts), exact zoals de campagne-sync het doet, zodat de veteraan-XP
   *  op de juiste campagne-unit landt en een hernoeming de koppeling niet breekt. */
  campaignId?: string;
  /** Campagne-veteraan-info (De Grensvorsten), aangebracht bij het openen van een campagne-battle: de
   *  unit z'n gewonnen veteran-abilities + battle-scars. Rijdt via `tow_games` mee naar beide spelers,
   *  zodat de UnitCard ze read-only toont. Optioneel: alleen aanwezig voor gematchte veteraan-units. */
  veteraan?: { abilities: { t: string; keuze: string | null }[]; littekens: number };
  /** De naam die op het scherm hoort: de eigen naam van de speler als die er is, anders het
   *  datasheet. Blijft de sleutel voor alles wat op naam matcht (statlines van een geplakte lijst). */
  name: string;
  /** De CATALOGUSNAAM ("Dark Elf Warriors"), ook als `name` een campagne-eigennaam draagt. Alleen
   *  gezet door de lijstbouwer, die de catalogus kent — een geplakte OWB-lijst heeft 'm niet.
   *  Overal waar een unit getoond wordt is DIT de primaire regel en is `name` de secundaire: bij een
   *  leger vol eigennamen ("Dreth's Thunder") zie je anders nergens meer WAT er op tafel staat. */
  datasheet?: string;
  count: number | null; // leading multiplier (e.g. 15 Warriors), null for single models
  points: number | null;
  category: string; // e.g. "Core Units"
  /** Troop type, e.g. "Regular Infantry", "Monstrous Cavalry" (from rules-index troopType). */
  troopType?: string;
  options: string[]; // the "- …" lines
  specialRules: string[]; // verbatim labels from "Special Rules: …"
  profiles: UnitProfile[];
  /** Wizard only: lore slugs the player has added for spell selection. */
  lores?: string[];
  /** Wizard only: selected spell rule-keys (`spell-<x>`) rolled at game start. */
  spells?: string[];
  /** Magic weapons chosen in the builder. They carry special rules rather than a profile table, so
   *  they aren't found by resolving `options` to weapon profiles — they're surfaced here so the
   *  loadout weapon picker can offer them (using the wielder's base profile + these special rules). */
  magicWeapons?: { name: string; kind: 'melee' | 'ranged'; specialRules: string[]; flavour?: string }[];
  /** Every chosen magic item (weapons, armour, talismans, enchanted/arcane items, runes, banners),
   *  with its flavour + special rules — so the unit card can show each as a tappable term (like the
   *  unit's special rules) that opens the item's info, since magic items have no rule page. */
  magicItems?: { name: string; specialRules: string[]; flavour?: string }[];
  /** A chosen mount (Dark Pegasus, Black Dragon, …) with its own stat profile + special rules + its
   *  own troop type — the game surfaces it as a tappable chip so the player can see the mount's full
   *  info. */
  mounts?: { name: string; profiles: UnitProfile[]; specialRules: string[]; troopType?: string; details?: string[] }[];
}

export interface Army {
  name: string;
  points: number | null;
  system: string; // line 2, part 1
  faction: string; // line 2, part 2
  composition: string; // line 2, rest
  /** Stable composition-overlay id (for example `de-renegade-v2`).
   *  Kept beside the display label so a saved/remote game can restore the pack's rule text. */
  overlayId?: string;
  units: ArmyUnit[];
  raw: string; // original pasted text
}

/** Per-unit battle state, keyed `<seat>:<unitId>` (seat = host/guest, or me/opp solo). */
export interface UnitTrack {
  lost: number; // wounds/casualties taken
  fleeing: boolean;
  /** Unit vernietigd of van tafel gevlucht (volledig verwijderd) → 100% VP voor de vijand.
   *  Optioneel: oude trackers hebben dit veld niet; de VP-engine verdraagt het ontbreken. */
  weg?: boolean;
  /** Aantal vijandelijke units vernietigd + buitgemaakte trofeeën door deze unit. Voedt de
   *  campagne-XP van "De Grensvorsten" (veteraan-berekening). Optioneel: oude trackers missen dit
   *  veld → behandeld als 0. */
  kills?: number;
}

/** Shared battle-tracking state for a game (round, VP per side, per-unit casualties). */
export interface GameTracker {
  round: number; // 1–6
  /** Victory points keyed by seat (host/guest, or me/opp in solo). */
  vp: Record<string, number>;
  /** Per-unit state keyed `<seat>:<unitId>`. */
  units: Record<string, UnitTrack>;
  /** Handmatige VP-bonussen per kant (General/BSB down, buitgemaakte standaards, scenario-VP).
   *  Optioneel + back-compat: oude trackers hebben dit niet; berekenVictory valt terug op {}. */
  bonus?: { host?: VpBonus; guest?: VpBonus };
  /** Campagne-rapport: beide spelers moeten de uitslag goedkeuren vóór er iemand mag indienen.
   *  `sig` is de vingerafdruk van de cijfers waarvóór de goedkeuringen gelden — verandert er daarna
   *  nog iets (VP-bonus, casualty), dan wijkt de sig af en vervallen beide goedkeuringen vanzelf.
   *  Leeft in de tracker, dus 'ie lift mee op de bestaande realtime-sync van de game-rij. */
  report?: { sig: string; host?: boolean; guest?: boolean };
  /** 01-08: battle-quest gehaald, per seat. Staat op de tracker zodat het realtime meesynct met de
   *  andere speler en meeloopt in de report-`sig` (verandert een vinkje, dan vervallen beide
   *  goedkeuringen — zelfde regel als voor de VP's). */
  quests?: { host?: boolean; guest?: boolean };
}

/** A shared game row (mirrors the tow_games table). */
export interface GameRow {
  code: string;
  host_name: string | null;
  host_army: Army | null;
  guest_name: string | null;
  guest_army: Army | null;
  tracker: GameTracker | null;
}

/** Lightweight game summary for the join lobby (no army payloads). */
export interface GameSummary {
  code: string;
  host_name: string | null;
  guest_name: string | null;
  created_at: string;
}
