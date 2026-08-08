// Army-builder REDESIGN — the derived values + validation the new screens read (foundation only; no
// screen consumes these yet). Everything here is PURE: no fetching, no React, no storage.
//
// THIS FILE ADDS NO SECOND ENGINE. Points totalling and rule validation already live in
// `src/lib/owbBuilder.ts`; `deriveList` is a normaliser over `validate()` that reshapes its output
// into the flat, render-ready form the redesign asks for (fixed category order, percentages, typed
// violations). Concretely, everything numeric comes out of `validate()`, which internally uses
// `entryPoints()` (base + options + sub-options + magic items), `unitCategoryFor()` (a unit's
// effective category under the chosen army composition), `unitAllowedIn()` and the GRAND_ARMY
// percentage limits. The ONLY per-entry check re-derived here is the unit-size one — see the comment
// at that spot: `Violation.uid` needs entry identity that `validate()`'s flat `warnings: string[]`
// cannot carry.

import {
  CATEGORIES, loadoutLabels, selectedMagicItems, validate,
  type BuilderList, type Category, type ListEntry, type MagicItemsData, type OwbArmy, type OwbUnit,
} from './owbBuilder';

export interface Violation {
  kind: 'over-cap' | 'core-min' | 'category-max' | 'unit-size';
  message: string;
  /** puntentekort/overschot waar van toepassing */
  delta?: number;
  /** entry-uid bij unit-size */
  uid?: string;
  /** Which category this is about, for `category-max` and `core-min`. The Resolve solver needs it:
   *  freeing points only helps a category maximum if the points come OUT OF THAT CATEGORY. */
  category?: Category;
}
export interface CategoryTotal {
  key: Category;
  points: number;
  pct: number;
  /** The rule as text: "max 50%" / "min 25%", or "" for an unlimited category. */
  rule: string;
  ok: boolean;
  /** The ABSOLUTE limit in points, forwarded straight from `validate()` — `cap` for a capped category
   *  (`floor(pct × target)`), `floor` for a floored one (`ceil(pct × target)`), null when the category
   *  has no limit of that kind or there is no points target.
   *
   *  Forwarded on purpose: the desktop table and the picker both print absolute thresholds
   *  ("638 / min 500"), and each was re-deriving them by parsing the percentage back out of `rule` and
   *  re-applying the rounding. Two copies of the engine's rounding is exactly how a printed threshold
   *  drifts from the one actually enforced — so the numbers come from the engine, once. */
  cap: number | null;
  floor: number | null;
}
export interface DerivedList {
  totalPoints: number;
  categoryTotals: CategoryTotal[];   // vaste orde characters → core → special → rare
  remainingPoints: number;           // cap − total, mag negatief
  /** The TYPED violations, worded per the redesign spec — what the warning band / status bar joins
   *  with " · ". This is deliberately a SUBSET: only the four kinds the spec's band describes. */
  violations: Violation[];
  /** `validate()`'s COMPLETE warning list, verbatim and unfiltered — the authoritative set.
   *
   *  Why both: the four `Violation` kinds cannot express the rest of what `validate()` checks —
   *  `unitAllowedIn` ("not allowed in this army composition"), the Grand Melee 25% single-unit cap
   *  and wizard caps, Combined Arms per-datasheet counts, Battle March minimums, and the campaign
   *  named-unit requirement. Those have no typed shape here, and dropping them would silently remove
   *  validation the app shows TODAY in its "N to fix" panel. So they are carried through untouched.
   *
   *  These two overlap by design (a points overshoot appears in both, worded differently) because
   *  they feed DIFFERENT surfaces: `violations` → the spec's band, `warnings` → the issues/Resolve
   *  list. Never render both in one place. */
  warnings: string[];
  /** The subset of `warnings` that belongs to ONE entry, with its uid — forwarded from `validate()`.
   *
   *  Every entry-level problem is here, not just the size ones: the Grand Melee and Battle March
   *  single-unit caps, `unitAllowedIn`, and the campaign's named-unit requirement. A roster row reads
   *  this to flag itself, so the row and the band can never disagree about which unit is at fault. */
  entryWarnings: { uid: string; message: string }[];
  unitCount: number;
  modelCount: number;
}

/** The four categories the redesign's budget bar and section list show, in their fixed spec order.
 *  Mercenaries/allies still count towards `totalPoints` (via `validate()`) and still produce
 *  violations, they just have no segment of their own. */
const SPEC_CATEGORIES: readonly Category[] = ['characters', 'core', 'special', 'rare'];

const CAT_LABEL: Record<Category, string> = {
  characters: 'Characters', core: 'Core', special: 'Special', rare: 'Rare',
  mercenaries: 'Mercenaries', allies: 'Allies',
};

/**
 * Everything the redesigned builder screens need about a list, in one pass.
 *
 * `army` is the parsed catalogue (public/owb/<slug>.json); entries whose unit is missing from it are
 * skipped, exactly as `validate()` skips them — a stale list never throws, it just under-reports.
 *
 * `campaignMods` passes the campaign's own list rules straight through to `validate()`: the phase
 * points cap, the named-unit requirement and the per-unit growth ceiling. Omit it for a plain list —
 * and for `renderedLists`, which reports the TOW rules to the campaign server, never the campaign's
 * own rules (the server checks those itself, against data the client cannot be trusted with).
 */
export function deriveList(
  list: BuilderList,
  army: OwbArmy,
  itemsData?: MagicItemsData,
  campaignMods?: Parameters<typeof validate>[3],
  /** De 0-X-beperkingen; zonder deze wordt er niet op getoetst (zie validate). */
  compRules?: Parameters<typeof validate>[4],
): DerivedList {
  const getUnit = (cat: Category, id: string): OwbUnit | undefined => army?.[cat]?.find((u) => u.id === id);

  // ── the one and only points/limits computation ────────────────────────────────────────────────
  const v = validate(list, getUnit, itemsData, campaignMods, compRules);
  const totalPoints = v.total;
  // The points target. Clamped at 0 so a missing/NaN/negative target can never produce a negative
  // percentage denominator; `validate()` itself already treats a falsy target as 0.
  const cap = Math.max(0, Number.isFinite(list?.points) ? list.points : 0);
  const pctOf = (points: number) => (cap > 0 ? (points / cap) * 100 : 0);
  // With no points target there is no percentage base, so the percentage limits say nothing: every
  // cap collapses to floor(pct × 0) = 0 and validate() flags EVERY non-empty category at once. Those
  // would render as the nonsense "Characters at 0% of max 50%" (0% — yet breached), so the
  // percentage verdicts are suppressed while `cap <= 0`. `over-cap` and `unit-size` still fire, so a
  // target-less list is never silently reported as clean. This is a display guard on validate()'s
  // result, not a second opinion about it.
  const ratedLimits = cap > 0;

  // NOTE — the redesign spec prints "max 25%" for Characters (and an example reading "Characters at
  // 23% of max 25%"). That is an ERROR IN THE SPEC, verified against the official Games Workshop
  // Legacy army-list PDF, whose Grand Army composition reads: "Characters — Up to 50% of your army's
  // points value may be spent on…", Core "At least 25%", Mercenaries "Up to 20%", Allies "Up to 25%".
  // `GRAND_ARMY` in owbBuilder.ts matches that (characters 50). Special 50% and Rare 25% in the spec
  // are correct. Do NOT "fix" this towards the spec: 25% would reject legal armies.
  const categoryTotals: CategoryTotal[] = SPEC_CATEGORIES.map((key) => {
    const t = v.byCategory[key];
    // A category is capped OR floored, never both, in the GRAND_ARMY limits — prefer the cap if that
    // ever changes, and fall back to an empty rule for an unlimited category.
    const rule = t.limit.maxPercent != null ? `max ${t.limit.maxPercent}%`
      : t.limit.minPercent != null ? `min ${t.limit.minPercent}%`
        : '';
    // `ok` mirrors validate()'s verdict exactly, including its boundary behaviour: the cap is
    // `floor(pct × target)` and only `points > cap` is over, so a category landing EXACTLY on its
    // limit is still ok. Likewise `points === floor(min)` satisfies Core's minimum.
    return {
      key, points: t.points, pct: pctOf(t.points), rule,
      ok: !ratedLimits || (!t.over && !t.under),
      // From validate(), but SANITISED. validate() derives these as `pct × list.points`, so a list with
      // a NaN/null/undefined points target yields NaN — and before this field existed that NaN stayed
      // inside the engine. Surfacing it raw leaked "NaN" into a rendered threshold, which a test caught.
      // Non-finite collapses to null, i.e. "no such limit", which every consumer already handles.
      cap: ratedLimits && Number.isFinite(t.cap) ? t.cap : null,
      floor: ratedLimits && Number.isFinite(t.floor) ? t.floor : null,
    };
  });

  // ── violations, in descending severity: budget → composition → single unit ────────────────────
  const violations: Violation[] = [];
  if (totalPoints > cap) {
    // Spec text, e.g. "34 points over the limit" — pluralised, because the spec's template would
    // otherwise render "1 points over the limit" for a one-point overshoot.
    const by = totalPoints - cap;
    violations.push({ kind: 'over-cap', message: `${by} point${by === 1 ? '' : 's'} over the limit`, delta: by });
  }
  // Iterate ALL categories, not just the four with a segment, so a mercenaries/allies breach that
  // validate() flags is never silently swallowed here.
  for (const key of ratedLimits ? CATEGORIES : []) {
    const t = v.byCategory[key];
    const pct = Math.round(pctOf(t.points));
    if (t.over && t.limit.maxPercent != null) {
      // Spec text verbatim, e.g. "Characters at 23% of max 25%".
      violations.push({
        kind: 'category-max',
        message: `${CAT_LABEL[key]} at ${pct}% of max ${t.limit.maxPercent}%`,
        delta: t.points - (t.cap ?? 0),
        category: key,
      });
    }
    if (t.under && t.limit.minPercent != null) {
      // The spec pins only the max-side sentence; the min side reuses its shape so the two read as
      // one family, e.g. "Core at 18% of min 25%".
      violations.push({
        kind: 'core-min',
        message: `${CAT_LABEL[key]} at ${pct}% of min ${t.limit.minPercent}%`,
        delta: (t.floor ?? 0) - t.points,
        category: key,
      });
    }
  }

  // ── per-entry tallies + the unit-size check ───────────────────────────────────────────────────
  // The size check is the one thing re-derived rather than read back from `validate()`: a
  // `unit-size` Violation must carry the offending entry's `uid`, and validate() reports it as a
  // flat warning string. Matching those strings back to entries by unit NAME would be ambiguous the
  // moment a list holds two entries of the same unit. The thresholds are read from the same fields
  // validate() reads (`unit.minimum ?? 1`, `unit.maximum` with 0 meaning "no maximum"), so the two
  // can only disagree if owbBuilder changes — and then this is a two-line follow-up, not a fork.
  let unitCount = 0;
  let modelCount = 0;
  for (const e of list?.entries ?? []) {
    const unit = getUnit(e.cat, e.unitId);
    if (!unit) continue;
    unitCount += 1;
    modelCount += Math.max(0, Number.isFinite(e.count) ? e.count : 0);
    const min = unit.minimum ?? 1;
    const max = unit.maximum ?? 0; // 0 = no maximum
    if (e.count < min) {
      violations.push({ kind: 'unit-size', message: `${unit.name_en}: below minimum size (${min})`, delta: min - e.count, uid: e.uid });
    } else if (max > 0 && e.count > max) {
      violations.push({ kind: 'unit-size', message: `${unit.name_en}: above maximum size (${max})`, delta: e.count - max, uid: e.uid });
    }
  }

  return {
    totalPoints,
    categoryTotals,
    remainingPoints: cap - totalPoints,
    violations,
    // Verbatim, unfiltered — see the field's doc comment. Everything validate() checks reaches the
    // caller, including the composition-rule and campaign checks that have no typed shape above.
    warnings: v.warnings,
    // Same messages, with the entry each belongs to — see `Validation.entryWarnings`. This is what lets
    // a roster ROW carry its own problem instead of only the band naming it.
    entryWarnings: v.entryWarnings,
    unitCount,
    modelCount,
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// optionSummary — the one-line "whisper" under a unit's name in the roster
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Built on `loadoutLabels()`, which returns the FULL effective loadout: chosen upgrades AND the free
// `active` defaults (a unit's base weapon/armour/mount) AND active sub-options AND magic items, with
// comma-bundled catalogue labels already split into individual wargear names. That completeness is
// exactly right for the game (it needs the base weapon to resolve a shooting profile) and exactly
// wrong for an 11px single-line whisper, where the free baseline every entry shares would push the
// actual choices past the ellipsis.
//
// So the whisper is a NOISE-FILTERED loadout, by four stated rules:
//   1. drop the universal free baseline (MUNDANE below) — a short, explicit denylist, so unknown
//      wargear is never silently hidden;
//   2. abbreviate "Level N Wizard" → "Level N" (the "Wizard" header itself is already dropped);
//   3. roll a complete champion + standard bearer + musician set up into "Full command";
//   4. order it gear → command → lore → magic items, which reads as "what it carries, who leads it,
//      what magic it knows, what magic it holds".
// Those rules reproduce the spec's two examples exactly ("Shields · Full command" and
// "Level 4 · Dark Magic · Sacrificial Dagger") — but they are stated rules, not a fit to the
// examples: nothing here special-cases a unit, an army or a label beyond the four MUNDANE regexes.

const SEP = ' · ';

/** Strip the catalogue's bookkeeping marks: `{faction}` tags and the `*` multi-takeable marker.
 *  Mirrors `cleanLabel` in BuilderWorkspace so the whisper reads like the rest of the app. */
const clean = (s: string): string => (s || '').replace(/\{[^}]*\}/g, ' ').replace(/\*/g, '').replace(/\s+/g, ' ').trim();

/** Split a catalogue label on commas the way `loadoutLabels` does, then clean each part. Used on both
 *  sides of every comparison below, so a bundled label always matches its unbundled counterpart. */
const parts = (s?: string): string[] => (s || '').split(',').map(clean).filter(Boolean);

/** The universal free baseline — present on (almost) every entry in the game, so it carries no
 *  information about THIS entry. Deliberately tiny and regex-anchored. */
const MUNDANE: RegExp[] = [
  /^hand weapons?$/i, // every model has one: the free `active` default of every Equipment group
  /^light armour$/i,  // the baseline free armour. NOTE: "Shields", bundled in the same catalogue
  //                     label ("Light armour, Shields"), IS kept — a shield changes the save and
  //                     players call it out, where light armour is simply the floor.
  /^on foot$/i,       // the absence of a mount is not a choice worth a line
  /^wizard$/i,        // the bare `alwaysActive` header; its Level sub-option carries the information
];

/** "Level 4 Wizard" → "Level 4". The word "Wizard" is redundant once the header is dropped. */
const shortenLevel = (s: string): string => s.replace(/^Level\s*(\d+)\s*Wizard$/i, 'Level $1');

/** 'dark-magic' → 'Dark Magic'. The authoritative display name lives in the app's lore data
 *  (`useData().lores`), which a pure lib cannot reach — title-casing the slug is the pure
 *  approximation. A lore whose display name is not just its title-cased slug will therefore read
 *  slightly differently here than in the lore picker. */
const loreLabel = (slug: string): string =>
  slug.split('-').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

type CommandRole = 'champion' | 'standard' | 'musician';
const ALL_ROLES: readonly CommandRole[] = ['champion', 'standard', 'musician'];
/** Which command role a label fills, if any. Order matters: "Battle Standard Bearer" must resolve as
 *  a standard bearer, and a champion label ("Lordling (champion)") is only matched last. */
const roleOf = (label: string): CommandRole | null =>
  /musician/i.test(label) ? 'musician'
    : /standard bearer/i.test(label) ? 'standard'
      : /champion/i.test(label) ? 'champion'
        : null;
const isRole = (r: CommandRole | null): r is CommandRole => r !== null;

/** De whisper-regel van één entry: gekozen optielabels joined met ' · '. */
export function optionSummary(unit: OwbUnit, entry: ListEntry, itemsData?: MagicItemsData): string {
  // The single source of truth for what this entry carries.
  const loadout = loadoutLabels(unit, entry, itemsData).flatMap((l) => parts(l));

  // Which of those labels are magic items, and which came from the Command group — needed to order
  // the line (rule 4) rather than to recompute anything.
  const itemNames = new Set(
    itemsData ? selectedMagicItems(unit, entry, itemsData).flatMap(({ item }) => parts(item.name_en)) : [],
  );
  const commandNames = new Set((Array.isArray(unit.command) ? unit.command : []).flatMap((o) => parts(o?.name_en)));

  const gear: string[] = [];
  const command: string[] = [];
  const items: string[] = [];
  for (const label of loadout) {
    if (MUNDANE.some((re) => re.test(label))) continue;        // rule 1
    if (itemNames.has(label)) items.push(label);
    else if (commandNames.has(label)) command.push(label);
    else gear.push(shortenLevel(label));                       // rule 2
  }

  // Rule 3 — only when the unit HAS all three command roles and all three are taken; an incomplete
  // command group is listed role by role instead. Any non-role command option (a "General" flag, a
  // "Veteran" upgrade sitting in the command group) survives the rollup untouched.
  const unitRoles = new Set([...commandNames].map(roleOf).filter(isRole));
  const takenRoles = new Set(command.map(roleOf).filter(isRole));
  const fullCommand = ALL_ROLES.every((r) => unitRoles.has(r) && takenRoles.has(r));
  const commandOut = fullCommand
    ? ['Full command', ...command.filter((l) => roleOf(l) === null)]
    : command;

  // A wizard's chosen lore of magic. `loadoutLabels` omits it (lores are free spell picks, not
  // wargear), but it is the single most identifying thing about a wizard on a roster row.
  const lores = (entry.lores ?? []).filter(Boolean).map(loreLabel);

  return [...gear, ...commandOut, ...lores, ...items].join(SEP); // rule 4
}
