// Shape of the data produced by scripts/scrape.mjs (public/rules.json).

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
  stats: { k: string; v: string }[];
}

export interface ArmyUnit {
  id: string; // stable within an army (index-based)
  name: string;
  count: number | null; // leading multiplier (e.g. 15 Warriors), null for single models
  points: number | null;
  category: string; // e.g. "Core Units"
  options: string[]; // the "- …" lines
  specialRules: string[]; // verbatim labels from "Special Rules: …"
  profiles: UnitProfile[];
  /** Wizard only: lore slugs the player has added for spell selection. */
  lores?: string[];
  /** Wizard only: selected spell rule-keys (`spell-<x>`) rolled at game start. */
  spells?: string[];
}

export interface Army {
  name: string;
  points: number | null;
  system: string; // line 2, part 1
  faction: string; // line 2, part 2
  composition: string; // line 2, rest
  units: ArmyUnit[];
  raw: string; // original pasted text
}

/** Per-unit battle state, keyed `<seat>:<unitId>` (seat = host/guest, or me/opp solo). */
export interface UnitTrack {
  lost: number; // wounds/casualties taken
  fleeing: boolean;
}

/** Shared battle-tracking state for a game (round, VP per side, per-unit casualties). */
export interface GameTracker {
  round: number; // 1–6
  /** Victory points keyed by seat (host/guest, or me/opp in solo). */
  vp: Record<string, number>;
  /** Per-unit state keyed `<seat>:<unitId>`. */
  units: Record<string, UnitTrack>;
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
