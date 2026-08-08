// Army-list builder logic (Stap 2 PoC, Dark Elves). Points totalling + composition validation,
// using the Old World Builder catalogue (public/owb/) and composition rules ported from OWB's
// src/utils/rules.js (CC BY 4.0). Underlying data © Games Workshop — unofficial personal-use aid.

export type Category = 'characters' | 'core' | 'special' | 'rare' | 'mercenaries' | 'allies';
export const CATEGORIES: Category[] = ['characters', 'core', 'special', 'rare', 'mercenaries', 'allies'];

export interface OwbOption {
  name_en: string; points?: number; perModel?: boolean; active?: boolean;
  /** Hidden by a composition overlay while retaining its catalogue index for saved-list stability. */
  hidden?: boolean;
  /** An option variant that belongs only to one OWB army composition. */
  armyComposition?: string;
  // `alwaysActive` — the option is always on and cannot be toggled off (a free base, e.g. the
  // "Wizard" header on a Sorceress). `exclusive` — the option is one-of among its SIBLINGS in the
  // same nested list (a radio choice, e.g. "Level 3 Wizard" vs "Level 4 Wizard").
  alwaysActive?: boolean; exclusive?: boolean; minimum?: number; maximum?: number;
  // `stackable` — NOT a toggle: a COUNT of how many models in the unit take it, each paying `points`.
  // The army lists word it "Any model in the unit may take one of the following: Additional hand
  // weapon +3 points per model", so a unit can mix — two models with great weapons, one with an
  // ironfist — which a checkbox cannot express. OWB prices these as `count × points` (src/utils/
  // points.js); we had no notion of it, so a checkbox charged the price ONCE for the whole unit.
  // The count lives in `ListEntry.optCounts`, keyed by the same "<group>/<index>" key as `opts`.
  stackable?: boolean;
  // Any option (in any group) may carry NESTED sub-options. These apply only while the parent is
  // active: for a radio group when the parent is the selected choice; for a toggle group when the
  // parent is toggled on (or `alwaysActive`). Exclusive children form a single radio set; the rest
  // are independent toggles. e.g. a Manticore mount → "Venomous tail" toggle; a Sorceress' "Wizard"
  // → the Level radio. Generalised by `subOptionGroups`/`toggleSubOption`/`setExclusiveSubOption`.
  options?: OwbOption[];
  // Some options unlock a magic-item allowance when taken — e.g. a "Standard bearer" command option
  // lets the unit buy a magic standard (`{ types: ["banner"], maxPoints: 50 }`). Surfaced as an extra
  // magic category (gated on the option being active) by `magicCategories`.
  magic?: { types: string[]; maxPoints?: number; maxItemsPerCategory?: number };
}
// A unit's magic-item "section" (from the catalogue's per-unit `items[]`). Each section permits a
// set of item `types` (mapping to the `type` field in magic-items.json) and carries its own
// `maxPoints` budget (the data-driven per-character allowance). e.g. a Dreadlord has one "Magic
// Items" section (types weapon/armor/talisman/enchanted-item, maxPoints 100); a Death Hag also has
// a "Gifts of Khaine" section (types gift-of-khaine, maxPoints 20).
export interface OwbItemSection {
  name_en: string; name_cn?: string; name_de?: string; name_es?: string; name_fr?: string;
  types: string[]; maxPoints?: number; maxItemsPerCategory?: number; selected?: unknown[];
}
export interface OwbUnit {
  id: string; name_en: string; points?: number; minimum?: number; maximum?: number;
  command?: OwbOption[]; equipment?: OwbOption[]; armor?: OwbOption[]; options?: OwbOption[];
  mounts?: OwbOption[]; lores?: string[]; specialRules?: { name_en?: string };
  items?: OwbItemSection[]; spellCount?: number;
  /** A named/unique character (Settra, Orion, Galrauch …). Present in the catalogue but never read
   *  until now; the promotion rules use it to keep unique characters out (they have no lighter
   *  version and their profile is one-off). */
  named?: boolean;
  /** The unit's own restriction note, e.g. "0-1 Supreme Sorceress per 1000 points". The
   *  composition-specific note in `armyComposition[<comp>].notes` overrides it — see `unitNote`. */
  notes?: { name_en?: string };
  /** Per army-composition placement (from OWB): { <compId>: { category, notes } }. A unit's list
   *  category can differ per composition (e.g. State Troops are Core normally, Special for a knightly
   *  order), and a unit is only available in the compositions it lists. */
  armyComposition?: Record<string, { category?: Category; notes?: { name_en?: string } }>;
}
export type OwbArmy = Record<Category, OwbUnit[]>;

// ---- Army-composition (army-of-infamy) helpers -------------------------------------------------
// The chosen composition (list.composition) can move a unit to a different list category and can drop
// units entirely. These read the unit's `armyComposition` map; a unit without that map is treated as
// always available in its base category (defensive — keeps older/edge data working).
const compMap = (unit: OwbUnit): Record<string, { category?: Category; notes?: { name_en?: string } }> | null => {
  const ac = unit.armyComposition;
  return ac && typeof ac === 'object' && !Array.isArray(ac) && Object.keys(ac).length ? ac : null;
};
/** The unit's list category under `composition` (falls back to `base` when the map doesn't say). */
export function unitCategoryFor(unit: OwbUnit, composition: string, base: Category): Category {
  const c = compMap(unit)?.[composition]?.category;
  return c && (CATEGORIES as readonly string[]).includes(c) ? c : base;
}
/** Whether a unit may be fielded in `composition` (a mapped unit is only available where it's listed). */
export function unitAllowedIn(unit: OwbUnit, composition: string): boolean {
  const ac = compMap(unit);
  return !ac || !!ac[composition];
}
/** The composition's restriction note for a unit (e.g. "0-1 General per 1000 points"), if any. */
export function unitCompNote(unit: OwbUnit, composition: string): string | undefined {
  return compMap(unit)?.[composition]?.notes?.name_en || undefined;
}

/** The restriction note that ACTUALLY applies to a unit in this composition: the composition's own
 *  note when it has one, otherwise the unit's base `notes`.
 *
 *  `unitCompNote` alone was not enough, and that was a real gap rather than a nicety: most armies
 *  (Dark Elves, Orcs & Goblins, Ogres …) carry no `armyComposition` map at all, so every one of their
 *  notes — including "0-1 Supreme Sorceress per 1000 points" — resolved to `undefined` and was neither
 *  shown nor checked. */
export function unitNote(unit: OwbUnit, composition: string): string | undefined {
  return unitCompNote(unit, composition) || unit.notes?.name_en?.trim() || undefined;
}

// ---- Restriction notes, PARSED ----------------------------------------------------------------
// The catalogue states a unit's list restriction as free text ("0-1 per 1000 points", "0-1 Black Orc
// Warboss or Black Orc Bigboss"). Until now that text was only ever DISPLAYED — nothing checked it —
// so a 500-point list could field a Supreme Sorceress ("0-1 per 1000 points" ⇒ zero at 500) without a
// murmur. `parseCompNote` reads the handful of shapes that actually occur in `public/owb/*.json` and
// leaves everything else alone.
//
// THE RULE THIS FOLLOWS: a note we cannot parse must NEVER block a list. Every pattern below is
// fully anchored, every name has to resolve against a unit that is really in the list, and any clause
// carrying a word that betrays a shape we do not model (conditionals, per-unit ratios, "may be taken
// as a Core choice", war-machine pick-lists) is dropped on the floor. The cost of that is a missed
// warning; the cost of the opposite is a false accusation about someone's army list.

/** One "you may field at most N of these" limit read out of a restriction note. */
export interface NoteLimit {
  /** The N in "0-N". */
  max: number;
  /** The points step N scales with ("per 1000 points"), or null for a flat maximum. */
  perPoints: number | null;
  /** The entry names the limit is shared between, or null when it is about the unit carrying it. */
  names: string[] | null;
  /** The clause this came from, verbatim — quoted back in the warning so it can be traced. */
  text: string;
}

// Words that mean "this clause is not a plain 0-N cap on a set of named entries". Deliberately broad:
// dropping a clause costs a warning, mis-reading one costs trust.
// NOT in the list, though it looks like it belongs: "general". It reads as the conditional shape
// ("0-1 if General is Doombull or Gorebull") but it is also half of a real entry name — "0-1 General
// of the Empire or Grand Master per 1000 points" — and `if` / `your` already catch every conditional.
const NOTE_STOPWORDS = /\b(if|may|per|units?|army|chosen|following|list|taken|choices?|regiments?|detachments?|your|includes?|additional|upgraded|must|only|purchase|belong(?:ing)?)\b/i;

/** Split the name blob of a note ("Lector of Sigmar or High Priest of Ulric") into entry names, or
 *  null when the blob is not a name list at all. */
function noteNames(blob: string): string[] | null {
  // A parenthetical is either an aside on one name ("Khemrian Warsphinx (not counting character
  // mounts)") or a list inside a list ("Greater Daemon (of Khorne, Nurgle, Slaanesh or Tzeentch)") —
  // and the second kind would otherwise be torn into four fictional entry names by the comma split.
  // Dropped whole; a LEFTOVER bracket means the clause was already cut through one, so give up.
  const flat = blob.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!flat || /[()]/.test(flat)) return null;
  if (NOTE_STOPWORDS.test(flat)) return null;
  const names = flat.split(/\s*,\s*|\s+or\s+/i).map((s) => s.trim()).filter(Boolean);
  return names.length ? names : null;
}

/** One fully-anchored clause → a limit, or null when it is a shape we do not model. */
function parseNoteClause(clause: string): NoteLimit | null {
  const c = clause.trim();
  let m: RegExpMatchArray | null;
  // "0-1 per 1000 points" / "0-2 per 1000 points" — about the unit carrying the note.
  if ((m = c.match(/^0-(\d+)\s+per\s+(\d+)\s*(?:points|pts)$/i))) return { max: +m[1], perPoints: +m[2], names: null, text: c };
  // "0-1 per army" — same, but a flat maximum.
  if ((m = c.match(/^0-(\d+)\s+per\s+army$/i))) return { max: +m[1], perPoints: null, names: null, text: c };
  // "0-1 Dark Elf Dreadlord or Supreme Sorceress per 1000 points" — one slot shared by named entries.
  if ((m = c.match(/^0-(\d+)\s+(.+?)\s+per\s+(\d+)\s*(?:points|pts)$/i))) {
    const names = noteNames(m[2]);
    return names ? { max: +m[1], perPoints: +m[3], names, text: c } : null;
  }
  // "0-4 Dwarf Carts per army".
  if ((m = c.match(/^0-(\d+)\s+(.+?)\s+per\s+army$/i))) {
    const names = noteNames(m[2]);
    return names ? { max: +m[1], perPoints: null, names, text: c } : null;
  }
  // "0-1 Grand Master" / "0-1 Chaos Lord or Daemon Prince" — a flat maximum on named entries.
  if ((m = c.match(/^0-(\d+)\s+(.+)$/i))) {
    const names = noteNames(m[2]);
    return names ? { max: +m[1], perPoints: null, names, text: c } : null;
  }
  return null;
}

/** Read a restriction note into the limits it states, plus the clauses we could not read.
 *
 *  `unparsed` is returned rather than swallowed so the gap is inspectable — it is diagnostic only and
 *  no caller may treat it as a violation. Notably, the "1+ X" MINIMUM shapes all land there on
 *  purpose: they sit on the very entry that satisfies them, so a list without the entry never reaches
 *  the note and checking it would only ever fire on lists that are already fine. */
export function parseCompNote(note?: string): { limits: NoteLimit[]; unparsed: string[] } {
  const raw = (note ?? '').trim();
  if (!raw) return { limits: [], unparsed: [] };
  // "1,000 points" → "1000 points" (so the digit-group comma survives the clause split), and drop the
  // explanatory tail some notes hang behind a colon.
  const head = raw.replace(/(\d),(\d{3})\b/g, '$1$2').split(':')[0].trim();
  if (!head) return { limits: [], unparsed: [raw] };
  // WHOLE FIRST, then per clause: several notes list their shared entries with commas ("0-1 Shugengan
  // Lord, Gate Master, Lord Magistrate or Supreme Astromancer per 1000 points"), which a comma split
  // would tear apart into nonsense.
  const whole = parseNoteClause(head);
  if (whole) return { limits: [whole], unparsed: [] };
  const limits: NoteLimit[] = [];
  const unparsed: string[] = [];
  for (const piece of head.split(/\s*,\s*/)) {
    const p = piece.trim();
    if (!p) continue;
    const one = parseNoteClause(p);
    if (one) limits.push(one); else unparsed.push(p);
  }
  return { limits, unparsed };
}

/** Catalogue bookkeeping out of a name, for comparing a note's wording with an entry's name. */
const plainName = (s: string): string => (s || '').replace(/\{[^}]*\}/g, ' ').replace(/\*/g, '').replace(/\s+/g, ' ').trim();

// The option groups a unit can spend points on (lores are free spell picks → omitted here).
// `radio` groups are single-choice (you carry one weapon loadout, wear one armour, ride one mount);
// the rest are toggles you can mix (musician + standard, Shield + Sea Dragon Cloak, …). OWB marks
// the free default of a single-choice group with `active:true` (e.g. Hand weapon / Light armour /
// On foot) and lists each alternative — including bundled combinations — as its own entry.
export const OPTION_GROUPS: { key: keyof OwbUnit; label: string; radio?: boolean }[] = [
  { key: 'command', label: 'Command' },
  { key: 'equipment', label: 'Equipment', radio: true },
  { key: 'armor', label: 'Armour', radio: true },
  { key: 'options', label: 'Options' },
  { key: 'mounts', label: 'Mounts', radio: true },
];

// An option block ready for the editor: the group's items with their index + whether it's radio.
export interface OptionBlock { key: keyof OwbUnit; label: string; radio: boolean; items: { i: number; opt: OwbOption }[] }
export function unitBlocks(unit: OwbUnit): OptionBlock[] {
  return OPTION_GROUPS.map(({ key, label, radio }) => {
    const list = Array.isArray(unit[key]) ? (unit[key] as OwbOption[]) : [];
    return {
      key,
      label,
      radio: !!radio,
      items: list.map((opt, i) => ({ i, opt })).filter(({ opt }) => opt && opt.name_en && !opt.hidden),
    };
  }).filter((b) => b.items.length > 0);
}

// The currently-selected option key in a radio group (the stored choice, else the `active` default).
export function radioSelected(unit: OwbUnit, entry: ListEntry, key: keyof OwbUnit): string {
  const items = (Array.isArray(unit[key]) ? (unit[key] as OwbOption[]) : []);
  const stored = entry.opts.find((k) => k.startsWith(`${key}/`));
  if (stored) {
    const storedIndex = Number(stored.split('/')[1]);
    const chosen = items[storedIndex];
    if (chosen && !chosen.hidden) return stored;
    // A V2 overlay can hide an old composition-specific variant. Redirect an existing saved choice
    // to the visible variant with the same display name without rewriting the saved list.
    if (chosen?.hidden) {
      const name = chosen.name_en.replace(/\s*\{[^}]*\}/g, '').trim().toLowerCase();
      const replacement = items.findIndex((o) =>
        !o.hidden && o.name_en.replace(/\s*\{[^}]*\}/g, '').trim().toLowerCase() === name);
      if (replacement >= 0) return `${String(key)}/${replacement}`;
    }
  }
  const def = items.findIndex((o) => o.active && !o.hidden);
  const first = items.findIndex((o) => !o.hidden);
  return `${String(key)}/${def >= 0 ? def : Math.max(0, first)}`;
}

// ---- Nested sub-options (one level under ANY group item) --------------------------------------
// An option in any group (command/equipment/armor/options/mounts) may carry a nested `options`
// array. Those nested options apply only while the PARENT is active:
//   • radio group (equipment/armor/mounts) — the parent is the currently-selected radio index;
//   • toggle group (command/options)       — the parent is toggled on OR is `alwaysActive`.
// Within an active parent, the nested set is split into:
//   • a single-choice RADIO set  — all children with `exclusive:true` (exactly one selected; the
//     default is the child with `active`, else the first; the free `active` default is implicit);
//   • independent TOGGLES        — the remaining children (each on/off on its own).
// Stored in entry.opts as  subopt/<group>/<parentIndex>/<childIndex>  (new writes). For backwards
// compatibility we ALSO read the legacy mount keys  mountopt/<mountIndex>/<childIndex>  (treated as
// subopt/mounts/...). Stale keys for a no-longer-active parent are simply ignored by points/summary
// (we only consider parents that are currently active) — no need to delete them on radio change.
const SUBOPT_PREFIX = 'subopt';
const MOUNTOPT_PREFIX = 'mountopt'; // legacy (mounts-only) prefix — read, never written
const subOptKey = (group: keyof OwbUnit, parentIndex: number, childIndex: number) =>
  `${SUBOPT_PREFIX}/${String(group)}/${parentIndex}/${childIndex}`;
const legacyMountKey = (parentIndex: number, childIndex: number) =>
  `${MOUNTOPT_PREFIX}/${parentIndex}/${childIndex}`;

// True when a sub-option key (new OR legacy) is currently stored on the entry for this slot.
const hasSubOpt = (entry: ListEntry, group: keyof OwbUnit, parentIndex: number, childIndex: number): boolean => {
  if (entry.opts.includes(subOptKey(group, parentIndex, childIndex))) return true;
  if (group === 'mounts' && entry.opts.includes(legacyMountKey(parentIndex, childIndex))) return true;
  return false;
};

// Is the parent option at `parentIndex` in `group` currently active (so its nested options apply)?
function parentActive(unit: OwbUnit, entry: ListEntry, group: keyof OwbUnit, parent: OwbOption, parentIndex: number): boolean {
  const isRadio = OPTION_GROUPS.find((g) => g.key === group)?.radio;
  if (isRadio) return radioSelected(unit, entry, group) === `${String(group)}/${parentIndex}`;
  return parent.alwaysActive === true || entry.opts.includes(`${String(group)}/${parentIndex}`);
}

// A nested sub-option ready for the editor: its child index, the option, its stored key, selected state.
export interface SubOptionItem { i: number; opt: OwbOption; key: string; selected: boolean }
// A group of nested sub-options under one active parent (radio when `exclusive`, else toggles).
export interface SubOptionGroup {
  group: keyof OwbUnit; parentIndex: number; parentLabel: string;
  parentActive: boolean; alwaysActive: boolean; exclusive: boolean;
  items: SubOptionItem[];
}

// All ACTIVE nested sub-option groups across every option group, split per parent into its exclusive
// (radio) set and its non-exclusive (toggle) set — so one parent can yield up to two groups.
export function subOptionGroups(unit: OwbUnit, entry: ListEntry): SubOptionGroup[] {
  const out: SubOptionGroup[] = [];
  for (const { key: group } of OPTION_GROUPS) {
    const parents = groupItems(unit, group);
    parents.forEach((parent, parentIndex) => {
      const children = (Array.isArray(parent.options) ? parent.options : []).filter((o) => o && o.name_en);
      if (children.length === 0) return;
      if (!parentActive(unit, entry, group, parent, parentIndex)) return;
      const active = true;
      // Find which (if any) exclusive child is the default-active one, for the implicit selection.
      const exclChildren = children.filter((c) => c.exclusive);
      const defExclIdx = exclChildren.length
        ? (() => { const a = children.findIndex((c) => c.exclusive && c.active); return a >= 0 ? a : children.findIndex((c) => c.exclusive); })()
        : -1;
      const storedExcl = children.findIndex((c, i) => c.exclusive && hasSubOpt(entry, group, parentIndex, i));
      const selectedExcl = storedExcl >= 0 ? storedExcl : defExclIdx; // nothing stored → the default
      // Emit the exclusive (radio) sub-group, if any.
      const excl = children
        .map((opt, i) => ({ opt, i }))
        .filter(({ opt }) => opt.exclusive)
        .map(({ opt, i }) => ({ i, opt, key: subOptKey(group, parentIndex, i), selected: i === selectedExcl }));
      if (excl.length) out.push({ group, parentIndex, parentLabel: parent.name_en, parentActive: active, alwaysActive: !!parent.alwaysActive, exclusive: true, items: excl });
      // Emit the non-exclusive (toggle) sub-group, if any.
      const toggles = children
        .map((opt, i) => ({ opt, i }))
        .filter(({ opt }) => !opt.exclusive)
        .map(({ opt, i }) => ({ i, opt, key: subOptKey(group, parentIndex, i), selected: hasSubOpt(entry, group, parentIndex, i) }));
      if (toggles.length) out.push({ group, parentIndex, parentLabel: parent.name_en, parentActive: active, alwaysActive: !!parent.alwaysActive, exclusive: false, items: toggles });
    });
  }
  return out;
}

// Pure toggle for a non-exclusive nested sub-option: returns the new opts with it flipped on/off.
// Clears any legacy mount key for the same slot so the new key is authoritative.
export function toggleSubOption(entry: ListEntry, group: keyof OwbUnit, parentIndex: number, childIndex: number): string[] {
  const key = subOptKey(group, parentIndex, childIndex);
  const on = hasSubOpt(entry, group, parentIndex, childIndex);
  const cleared = entry.opts.filter((k) => k !== key && k !== legacyMountKey(parentIndex, childIndex));
  return on ? cleared : [...cleared, key];
}

// Pure radio set for an exclusive nested sub-option: returns the new opts with this child selected,
// dropping any sibling exclusive pick under the same parent (new + legacy keys).
export function setExclusiveSubOption(unit: OwbUnit, entry: ListEntry, group: keyof OwbUnit, parentIndex: number, childIndex: number): string[] {
  const parent = groupItems(unit, group)[parentIndex];
  const children = (Array.isArray(parent?.options) ? parent!.options! : []);
  const siblingKeys = new Set<string>();
  children.forEach((c, i) => { if (c.exclusive) { siblingKeys.add(subOptKey(group, parentIndex, i)); siblingKeys.add(legacyMountKey(parentIndex, i)); } });
  const rest = entry.opts.filter((k) => !siblingKeys.has(k));
  return [...rest, subOptKey(group, parentIndex, childIndex)];
}

// ---- Mount sub-options (legacy shim over the general engine) ----------------------------------
// The mount index currently selected in the `mounts` radio group (resolves the `active` default).
export function selectedMountIndex(unit: OwbUnit, entry: ListEntry): number {
  const sel = radioSelected(unit, entry, 'mounts'); // "mounts/<i>"
  const i = Number(sel.split('/')[1]);
  return Number.isFinite(i) ? i : 0;
}

// A mount sub-option ready for the editor: its index, the option, its stored key and whether it's on.
export interface MountSubOption { i: number; opt: OwbOption; key: string; selected: boolean }

// The nested sub-options of the CURRENTLY-selected mount, each with its index + selected state.
// Empty when the selected mount has no nested options (the common case). Reimplemented on top of
// the general engine; kept for back-compat with existing callers.
export function mountSubOptions(unit: OwbUnit, entry: ListEntry): MountSubOption[] {
  const mIndex = selectedMountIndex(unit, entry);
  return subOptionGroups(unit, entry)
    .filter((g) => g.group === 'mounts' && g.parentIndex === mIndex && !g.exclusive)
    .flatMap((g) => g.items.map(({ i, opt, key, selected }) => ({ i, opt, key, selected })));
}

// Pure toggle: returns the new opts array with the given mount sub-option flipped on/off.
// Writes the new `subopt/mounts/...` key (and clears the legacy key) via the general helper.
export function toggleMountSubOption(entry: ListEntry, mountIndex: number, optIndex: number): string[] {
  return toggleSubOption(entry, 'mounts', mountIndex, optIndex);
}

// Short labels of the chosen non-default upgrades, for a roster row's one-line summary.
// Pass `itemsData` (the parsed magic-items.json) to also list chosen magic items.
export function summaryLabels(unit: OwbUnit, entry: ListEntry, itemsData?: MagicItemsData): string[] {
  const labels = selectedOptions(unit, entry)
    .filter(({ opt }) => !opt.active)
    // A stackable option carries HOW MANY models take it, and the roster line is the only place that
    // shows a loadout without opening the unit — "Great weapon" alone would hide whether one model
    // or the whole unit has it, which is most of what the choice was.
    .map(({ opt, key }) => (opt.stackable ? `${opt.name_en} ×${stackTaken(unit, entry, key, opt)}` : opt.name_en));
  // Nested sub-options of active parents: toggles when on; exclusive picks unless they are the
  // free `active` default (e.g. show "Level 4 Wizard" / "Venomous tail", not "Level 3 Wizard").
  for (const g of subOptionGroups(unit, entry)) {
    for (const it of g.items) {
      if (!it.selected) continue;
      if (g.exclusive && it.opt.active) continue; // the implicit default — don't list it
      labels.push(it.opt.name_en);
    }
  }
  if (itemsData) for (const it of selectedMagicItems(unit, entry, itemsData)) labels.push(it.item.name_en);
  return labels;
}

// The FULL effective loadout of an entry — active base equipment + chosen upgrades + active sub-
// options + magic items — with comma-bundled catalogue labels split into individual wargear names.
// Unlike `summaryLabels` (which lists only non-default upgrades for a roster row), this mirrors what
// an OWB export lists, so the game can resolve each weapon's profile — including a unit's FREE base
// weapon (e.g. a Reaper Bolt Thrower's "Repeater bolt thrower", which is the `active` default and so
// is omitted by summaryLabels, leaving the game with no shooting profile).
export function loadoutLabels(unit: OwbUnit, entry: ListEntry, itemsData?: MagicItemsData): string[] {
  const labels: string[] = [];
  const add = (name?: string) => {
    if (!name) return;
    for (const part of name.split(',').map((s) => s.trim()).filter(Boolean)) if (!labels.includes(part)) labels.push(part);
  };
  for (const b of unitBlocks(unit)) {
    if (b.radio) {
      // single-choice group: the stored pick, else the free `active` default.
      const i = Number(radioSelected(unit, entry, b.key).split('/')[1]);
      add(b.items.find((it) => it.i === i)?.opt.name_en);
    } else {
      // toggles: every `active` base option plus any the player switched on.
      for (const { i, opt } of b.items) {
        const key = `${String(b.key)}/${i}`;
        if (!opt.active && !entry.opts.includes(key)) continue;
        // A stackable option is a number of models, and the roster line is where a loadout is read
        // without opening the unit — "Great weapon" alone would not say whether that is one model or
        // all of them. Appended whole rather than via `add`, which splits a label on its commas.
        if (opt.stackable) {
          const n = stackTaken(unit, entry, key, opt);
          const label = `${opt.name_en} ×${n}`;
          if (n > 0 && !labels.includes(label)) labels.push(label);
          continue;
        }
        add(opt.name_en);
      }
    }
  }
  for (const g of subOptionGroups(unit, entry)) for (const it of g.items) {
    if (!it.selected) continue;
    if (g.exclusive && it.opt.active) continue; // the implicit default — already covered by its parent
    add(it.opt.name_en);
  }
  if (itemsData) for (const it of selectedMagicItems(unit, entry, itemsData)) add(it.item.name_en);
  return labels;
}

// One chosen entry in the list. `opts` holds selected option keys "group/index".
// `lores`/`spells` (Wizards only) are the lore + spell choices made in the builder, carried into a
// game Army by builderListToArmy (so the in-game spell card is pre-filled).
export interface ListEntry { uid: string; cat: Category; unitId: string; count: number; opts: string[]; optCounts?: Record<string, number>; lores?: string[]; spells?: string[]; customName?: string }  // customName: campagne — named unit (veteranen-identiteit in De Grensvorsten)
// `optCounts` — how many models take each `stackable` option, keyed by its "<group>/<index>" opts key.
// Optional and absent by default, so every list saved before it existed reads back unchanged.
export interface BuilderList { composition: string; rule: string; points: number; entries: ListEntry[] }

/** Stabiele CAMPAGNE-sleutel van één lijst-entry ("De Grensvorsten" hangt hier de veteranen-XP,
 *  abilities en battle scars aan op). OWC en de campagne MOETEN exact dezelfde afleiding gebruiken,
 *  anders landt de XP nergens — daarom staat de afleiding hier, op één plek:
 *    1. `uid` — de builder-uid van de entry: stabiel bij hernoemen én uniek per entry (twee naamloze
 *       units van hetzelfde type vallen dus niet meer samen). Dit is de normale route.
 *    2. anders de oude slug van `customName` (lijsten van vóór de uid-wissel, zonder uid).
 *    3. anders het type-id (`unitId`), 4. anders 'unit'.
 *  Zie ook `ArmyUnit.campaignId` (builderToArmy) en `VetUnit.unitId` (campaignBattle). */
export function campaignUnitId(entry: { uid?: string; customName?: string; unitId?: string }): string {
  const uid = (entry.uid ?? '').trim();
  if (uid) return uid;
  const naam = (entry.customName ?? '').trim();
  if (naam) return naam.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  return (entry.unitId ?? '').trim() || 'unit';
}

// Composition category percentage limits — ported from OWB src/utils/rules.js "grand-army".
// (The lords/heroes 25%/25% sub-split needs a lord/hero flag the catalogue doesn't carry, so we
// validate the combined Characters ≤50% for now.)
export interface CatLimit { minPercent?: number; maxPercent?: number }
export const GRAND_ARMY: Record<Category, CatLimit> = {
  characters: { maxPercent: 50 },
  core: { minPercent: 25 },
  special: { maxPercent: 50 },
  rare: { maxPercent: 25 },
  mercenaries: { maxPercent: 20 },
  allies: { maxPercent: 25 },
};

// The "Army composition rule" axis. Open War uses the Grand Army limits as-is; Grand Melee tightens
// every category to 25% (OWB validation.js). Others fall back to the baseline for this PoC.
export const COMPOSITION_RULES: { id: string; name: string }[] = [
  { id: 'open-war', name: 'Open War' },
  { id: 'combined-arms', name: 'Combined Arms' },
  { id: 'grand-melee', name: 'Grand Melee' },
  { id: 'combined-arms-grand-melee', name: 'Combined Arms + Grand Melee' },
  { id: 'battle-march', name: 'Battle March' },
];

// The slugs whose rulebook text explains each composition (the info eye opens these). The combined
// option shows BOTH rule pages, since its restrictions are the union of the two.
export const COMPOSITION_RULE_SLUGS: Record<string, string[]> = {
  'open-war': ['open-war'],
  'combined-arms': ['combined-arms'],
  'grand-melee': ['grand-melee'],
  'combined-arms-grand-melee': ['combined-arms', 'grand-melee'],
  // The `battle-march` rule page is just a stub; the list-building requirements live in "Mustering".
  'battle-march': ['mustering-a-battle-march'],
};

/** Composities waar de MERCENARIES-grens afwijkt van de gebruikelijke 20%.
 *
 *  Uitgelezen uit de legerlijsten zelf (regel: "Mercenaries — Up to N% of your army's points value
 *  may be spent on…"). De 20% stond hardgecodeerd voor iedereen, en dat klopte voor elf composities
 *  niet — vooral de armies of infamy, die er ruimer in zitten. Alles wat hier niet staat is 20%. */
export const MERCENARY_PERCENT: Record<string, number> = {
  'jade-fleet': 33,
  'renegade-crowns': 33,
  'bretonnian-exiles': 25,
  'nomadic-waaagh': 25,
  'city-state-of-nuln': 25,
  'royal-clan': 25,
  'wolves-of-the-sea': 25,
  'errantry-crusades': 25,
  'heralds-of-darkness': 25,
  'expeditionary-force': 25,
  'troll-horde': 25,
};

export function limitsFor(_rule: string, composition?: string): Record<Category, CatLimit> {
  // The category percentage limits come from the Grand Army composition list and are the same under
  // every composition rule. The rule-specific restrictions (Grand Melee's 25%-per-single-unit and
  // wizard-level caps, Combined Arms' per-unit counts, Battle March's caps) are applied in validate().
  //
  // Eén uitzondering, en die hangt aan de ARMY COMPOSITION, niet aan de regel: sommige lijsten mogen
  // meer aan huurlingen uitgeven dan de gebruikelijke 20%.
  const merc = composition ? MERCENARY_PERCENT[composition] : undefined;
  if (merc == null) return GRAND_ARMY;
  return { ...GRAND_ARMY, mercenaries: { maxPercent: merc } };
}

/** The renderable options of one group, in the SAME order `entry.opts` indexes them by. Exported so
 *  anything that has to re-key an entry (the promotion re-map) reads the identical list rather than
 *  keeping its own copy of the filter. */
export const groupItems = (unit: OwbUnit, group: keyof OwbUnit): OwbOption[] =>
  (Array.isArray(unit[group]) ? (unit[group] as OwbOption[]) : []).filter((o) => o && o.name_en);

/** The raw stored count for a `stackable` option — 0 when nothing was ever recorded. Prefer
 *  `stackTaken`, which also reads the older lists that have no counts. */
export function stackCount(entry: ListEntry, key: string): number {
  const n = entry.optCounts?.[key];
  return typeof n === 'number' && n > 0 ? Math.floor(n) : 0;
}

/** The most models that may take a `stackable` option: the option's own cap when the data sets one
 *  (Nasty Skulkers, max 3), otherwise the unit's size — "any model in the unit may take one of the
 *  following", so at most every model. `maximum: 0` appears in the data for options that have NO cap,
 *  so it is read as absent rather than as "none allowed". */
export function stackMax(unit: OwbUnit, entry: ListEntry, opt: OwbOption): number {
  void unit;
  const cap = opt.maximum ?? 0;
  return cap > 0 ? Math.min(cap, entry.count) : entry.count;
}

/** How many models actually take a `stackable` option, for pricing and for the stepper.
 *
 *  A list saved before counts existed has the option's key in `opts` and no count at all. Read
 *  literally that is zero models, which would silently drop points from a list the player already
 *  had. It is also not what the tick meant: it was the only way to say "this unit has additional
 *  hand weapons", so the whole unit is the honest reading — and the reading that makes those lists
 *  cost what the army list says they cost. The count is capped either way. */
export function stackTaken(unit: OwbUnit, entry: ListEntry, key: string, opt: OwbOption): number {
  const max = stackMax(unit, entry, opt);
  const stored = entry.optCounts?.[key];
  if (typeof stored === 'number') return Math.max(0, Math.min(Math.floor(stored), max));
  return entry.opts.includes(key) ? max : 0;
}

/** Set how many models take a `stackable` option, clamped to [0, stackMax]. Keeps `opts` in step:
 *  the key is present exactly while the count is above zero, so every existing "is this option on?"
 *  check keeps working without knowing about counts. Returns the new entry (no mutation). */
export function setStackCount(unit: OwbUnit, entry: ListEntry, key: string, opt: OwbOption, n: number): ListEntry {
  const clamped = Math.max(0, Math.min(Math.floor(n), stackMax(unit, entry, opt)));
  const counts = { ...(entry.optCounts ?? {}) };
  if (clamped > 0) counts[key] = clamped;
  else delete counts[key];
  const opts = clamped > 0
    ? (entry.opts.includes(key) ? entry.opts : [...entry.opts, key])
    : entry.opts.filter((k) => k !== key);
  return { ...entry, opts, optCounts: counts };
}

/** Selected options for an entry, as {group, option} pairs. `key` rides along so a caller can look up
 *  a stackable option's count without rebuilding the key it just parsed. */
export function selectedOptions(unit: OwbUnit, entry: ListEntry): { group: keyof OwbUnit; opt: OwbOption; key: string }[] {
  const out: { group: keyof OwbUnit; opt: OwbOption; key: string }[] = [];
  for (const key of entry.opts) {
    const [g, iStr] = key.split('/');
    const list = groupItems(unit, g as keyof OwbUnit);
    let opt = list[Number(iStr)];
    if (opt?.hidden && OPTION_GROUPS.some((group) => group.key === g && group.radio)) {
      const effective = Number(radioSelected(unit, entry, g as keyof OwbUnit).split('/')[1]);
      opt = list[effective];
    }
    if (opt?.hidden) continue;
    if (opt) out.push({ group: g as keyof OwbUnit, opt, key });
  }
  return out;
}

/** Points for one list entry: base (per model × count) + each selected option (× count if perModel)
 *  + selected sub-options of the current mount + selected magic items (both per-unit, not per-model).
 *  Pass `itemsData` (parsed magic-items.json) to include magic-item points; omit it and they count 0
 *  (keeps the older 2-arg call sites working until the magic-items UI supplies the data). */
export function entryPoints(unit: OwbUnit, entry: ListEntry, itemsData?: MagicItemsData): number {
  let pts = (unit.points ?? 0) * entry.count;
  for (const { opt, key } of selectedOptions(unit, entry)) {
    // A stackable option is priced by HOW MANY models take it; `perModel` by the whole unit; the
    // rest once. Charging a stackable option once was the bug: a 5-strong Wardancer unit taking
    // additional hand weapons paid 1 point, not 5.
    const times = opt.stackable ? stackTaken(unit, entry, key, opt) : opt.perModel ? entry.count : 1;
    pts += (opt.points ?? 0) * times;
  }
  // Nested sub-options of active parents (mount toggles, wizard levels, …). The free `active`
  // exclusive default is implicit/free; only a non-default exclusive pick (or any on toggle) costs.
  for (const g of subOptionGroups(unit, entry)) {
    for (const it of g.items) {
      if (!it.selected) continue;
      if (g.exclusive && it.opt.active) continue; // free default — don't charge it
      pts += (it.opt.points ?? 0) * (it.opt.perModel ? entry.count : 1);
    }
  }
  // Magic items (only characters can carry them; per-unit, never per-model).
  if (itemsData) pts += magicItemsPoints(unit, entry, itemsData);
  return pts;
}

/** The Wizard level of an entry (0 = not a Wizard), read from its effective loadout — base options,
 *  radio picks/defaults and nested level sub-options (e.g. the "Level 4 Wizard" upgrade). Used by the
 *  Grand Melee wizard restrictions. */
export function wizardLevelOf(unit: OwbUnit, entry: ListEntry): number {
  let lvl = 0;
  const scan = (name?: string) => { const m = name && name.match(/Level\s*(\d)\s*Wizard/i); if (m) lvl = Math.max(lvl, Number(m[1])); };
  for (const b of unitBlocks(unit)) {
    if (b.radio) { const i = Number(radioSelected(unit, entry, b.key).split('/')[1]); scan(b.items.find((it) => it.i === i)?.opt.name_en); }
    else for (const { i, opt } of b.items) if (opt.active || entry.opts.includes(`${String(b.key)}/${i}`)) scan(opt.name_en);
  }
  for (const g of subOptionGroups(unit, entry)) for (const it of g.items) if (it.selected) scan(it.opt.name_en);
  return lvl;
}

export interface CategoryTally { points: number; limit: CatLimit; cap: number | null; floor: number | null; over: boolean; under: boolean }
export interface Validation {
  total: number;
  byCategory: Record<Category, CategoryTally>;
  warnings: string[];
  /**
   * The subset of `warnings` that is about ONE specific entry, carrying that entry's uid.
   *
   * `warnings` is a flat `string[]`, which is fine for a band that lists problems but loses the one
   * thing a ROSTER needs: which unit each problem belongs to. So a list could report "Sorceress over the
   * 25% single-character cap" while the Sorceress' own row showed nothing to look at.
   *
   * Every message here is ALSO in `warnings`, verbatim and in the same order — this adds identity, it
   * does not replace or reword anything, so existing callers and the band's de-duplication are
   * untouched.
   */
  entryWarnings: { uid: string; message: string }[];
}

// Tally points per category and check them against the composition's limits (percent of the points
// target) plus each unit's min/max model count. Pass `itemsData` (parsed magic-items.json) to fold
// magic-item points into the total/category tallies; omit it and they count 0.
export function validate(
  list: BuilderList,
  getUnit: (cat: Category, id: string) => OwbUnit | undefined,
  itemsData?: MagicItemsData,
  // Campagne-modifiers (Isle of Celedon). Weglaten ⇒ identiek aan de niet-campagne-validatie.
  // `pointsCap` vervangt de puntenbasis (fase-cap i.p.v. de vrij gekozen list.points).
  // `groei` is het groeiplafond per bestaande unit — zie de GROEI-blok hieronder.
  // 02-08: de NAAM-EIS is eruit. Die stamde uit de tijd dat de campagne veteranen op een slug van de
  // unit-naam matchte; sinds de uid-sleutel (towc_unit_sleutel) hangt de identiteit aan `entry.uid`
  // en is een eigen naam puur smaak. Een lijst tegenhouden om iets cosmetisch is dan niet uit te leggen.
  campaignMods?: {
    pointsCap?: number;
    /** Per unit-uid het maximum dat die unit deze Act mag kosten, plus waar dat vandaan komt.
     *  Alleen units die in een eerdere Act zijn ingediend staan erin; nieuwe units kennen geen
     *  plafond (die passen alleen binnen de gewone puntencap). Komt uit de campagne-server. */
    groei?: Record<string, { max: number; basis: number; introFase: number; staffel: number; minModellen?: number | null; laatsteFase?: number | null }>;
  },
): Validation {
  const limits = limitsFor(list.rule, list.composition);
  const target = campaignMods?.pointsCap ?? (list.points || 0);
  const byCategory = {} as Record<Category, CategoryTally>;
  for (const c of CATEGORIES) byCategory[c] = { points: 0, limit: limits[c], cap: null, floor: null, over: false, under: false };

  const warnings: string[] = [];
  /** Records a warning that belongs to ONE entry, into both lists at once. Same string in `warnings`,
   *  so nothing downstream sees a change; the uid is the addition. */
  const entryWarnings: Validation['entryWarnings'] = [];
  const warnEntry = (uid: string, message: string) => {
    warnings.push(message);
    entryWarnings.push({ uid, message });
  };
  let total = 0;
  // A unit's category for limits depends on the chosen army composition (army-of-infamy lists can
  // move it), so tally by its EFFECTIVE category, not the catalogue array it was added from.
  const rows: { e: ListEntry; unit: OwbUnit; p: number; level: number; cat: Category }[] = [];
  for (const e of list.entries) {
    const unit = getUnit(e.cat, e.unitId);
    if (!unit) continue;
    const p = entryPoints(unit, e, itemsData);
    const effCat = unitCategoryFor(unit, list.composition, e.cat);
    total += p;
    byCategory[effCat].points += p;
    rows.push({ e, unit, p, level: wizardLevelOf(unit, e), cat: effCat });
    const min = unit.minimum ?? 1;
    const max = unit.maximum ?? 0; // 0 = no max
    if (e.count < min) warnEntry(e.uid, `${unit.name_en}: below minimum size (${min})`);
    if (max > 0 && e.count > max) warnEntry(e.uid, `${unit.name_en}: above maximum size (${max})`);
    if (!unitAllowedIn(unit, list.composition)) warnEntry(e.uid, `${unit.name_en}: not allowed in this army composition`);
    // GROEI — een unit die al eerder is ingediend mag maar een beetje duurder worden per Act,
    // gemeten tegen de kosten waarmee 'ie debuteerde (niet tegen de vorige Act). Zo gaan de +250
    // punten per Act naar NIEUWE units in plaats van naar het oppompen van één blok. De server
    // rekent exact hetzelfde na bij het indienen; dit is de versie die je tijdens het bouwen ziet.
    const g = campaignMods?.groei?.[e.uid];
    if (g && p > g.max) {
      warnEntry(e.uid, `${unit.name_en} is ${p} pts; joined in Act ${g.introFase} at ${g.basis}, so the ceiling here is ${g.max} (+${g.staffel} per Act)`);
    }
    // Een unit mag groeien maar nooit KRIMPEN — anders speel je punten vrij door een regiment uit te
    // kleden, en dat omzeilt het plafond hierboven volledig.
    if (g?.minModellen != null && e.count < g.minModellen) {
      warnEntry(e.uid, `${unit.name_en} has ${e.count} models; it had ${g.minModellen} in Act ${g.laatsteFase ?? g.introFase} and may never shrink`);
    }
  }

  for (const c of CATEGORIES) {
    const t = byCategory[c];
    if (t.limit.maxPercent != null) {
      t.cap = Math.floor((t.limit.maxPercent / 100) * target);
      if (t.points > t.cap) { t.over = true; warnings.push(`${cap(c)} over its ${t.limit.maxPercent}% cap (${t.points}/${t.cap} pts)`); }
    }
    if (t.limit.minPercent != null) {
      t.floor = Math.ceil((t.limit.minPercent / 100) * target);
      if (t.points < t.floor) { t.under = true; warnings.push(`${cap(c)} below its ${t.limit.minPercent}% minimum (${t.points}/${t.floor} pts)`); }
    }
  }

  // ---- Composition-rule-specific restrictions (beyond the category % limits above) --------------
  const rule = list.rule;
  const hasGrandMelee = rule === 'grand-melee' || rule === 'combined-arms-grand-melee';
  const hasCombinedArms = rule === 'combined-arms' || rule === 'combined-arms-grand-melee';
  const isBattleMarch = rule === 'battle-march';

  // Grand Melee: a single character or unit may not exceed 25% of the army's points.
  if (hasGrandMelee && target > 0) {
    const cap25 = Math.floor(0.25 * target);
    for (const r of rows) if (r.p > cap25) warnEntry(r.e.uid, `${r.unit.name_en} over the 25% single-unit cap (${r.p}/${cap25} pts)`);
  }

  // Grand Melee: 0-1 Level 3 Wizard per 1,000 pts; 0-1 Level 4 Wizard per 2,000 pts (named characters
  // are exempt, but the catalogue doesn't flag those, so this counts every Wizard of that level).
  if (hasGrandMelee && target > 0) {
    const l3 = rows.filter((r) => r.level === 3).reduce((n, r) => n + r.e.count, 0);
    const l4 = rows.filter((r) => r.level === 4).reduce((n, r) => n + r.e.count, 0);
    const maxL3 = Math.floor(target / 1000);
    const maxL4 = Math.floor(target / 2000);
    if (l3 > maxL3) warnings.push(`Level 3 Wizards: ${l3} taken, ${maxL3} allowed (0-1 per 1,000 pts)`);
    if (l4 > maxL4) warnings.push(`Level 4 Wizards: ${l4} taken, ${maxL4} allowed (0-1 per 2,000 pts)`);
  }

  // Combined Arms: a cap on how many of each unit type you may field (per datasheet) — 0-3 Characters,
  // 0-4 Core, 0-3 Special, 0-2 Rare/Mercenary, +1 per full 1,000 pts above 2,000. (Detachments and
  // named characters are exempt in the rules; we don't track those, so this counts every entry.)
  if (hasCombinedArms) {
    const extra = target > 2000 ? Math.floor((target - 2000) / 1000) : 0;
    const baseCap: Partial<Record<Category, number>> = { characters: 3, core: 4, special: 3, rare: 2, mercenaries: 2 };
    const perUnit = new Map<string, { unit: OwbUnit; cat: Category; n: number }>();
    for (const r of rows) {
      const key = `${r.e.cat}/${r.e.unitId}`;
      const cur = perUnit.get(key);
      if (cur) cur.n += 1; else perUnit.set(key, { unit: r.unit, cat: r.cat, n: 1 });
    }
    for (const { unit, cat, n } of perUnit.values()) {
      const base = baseCap[cat];
      if (base == null) continue;
      const capN = base + extra;
      if (n > capN) warnings.push(`${unit.name_en}: ${n} taken, Combined Arms allows 0-${capN} of this unit`);
    }
  }

  // Battle March (500-750 pts): at least two non-character units, and single-unit point caps.
  if (isBattleMarch) {
    const nonCharUnits = rows.filter((r) => r.cat !== 'characters').length;
    if (nonCharUnits < 2) warnings.push(`Battle March needs at least 2 non-character units (have ${nonCharUnits})`);
    if (target > 0) {
      const capPct: Partial<Record<Category, number>> = { characters: 25, core: 35, special: 30, rare: 25, mercenaries: 25 };
      for (const r of rows) {
        const pct = capPct[r.cat];
        if (pct == null) continue;
        const capPts = Math.floor((pct / 100) * target);
        if (r.p > capPts) warnEntry(r.e.uid, `${r.unit.name_en} over the ${pct}% single-${r.cat === 'characters' ? 'character' : 'unit'} cap (${r.p}/${capPts} pts)`);
      }
    }
  }

  // ---- Restriction notes ("0-1 per 1000 points") ------------------------------------------------
  // The catalogue's own per-entry restrictions, which the builder showed but never checked. Names in
  // a note are resolved against the units ACTUALLY IN THE LIST: an entry that is not in the list
  // contributes nothing to the count anyway, so there is no reason to scan the whole catalogue — and a
  // name that resolves to nothing simply counts zero, which can only ever LOSE a warning, never invent
  // one.
  {
    const byName = new Map<string, string>();
    for (const r of rows) byName.set(plainName(r.unit.name_en).toLowerCase(), r.unit.id);
    const resolveName = (name: string): string | undefined => {
      const key = plainName(name).toLowerCase();
      const exact = byName.get(key);
      if (exact) return exact;
      // A few notes qualify the name where the catalogue does not ("High Elf Noble" vs "Noble").
      // Allowed only when EXACTLY ONE list unit's name is a whole-word tail of the note's name —
      // otherwise "Black Orc Warboss" would happily bind to "Orc Warboss".
      const tails = [...byName.entries()].filter(([n]) => key.endsWith(` ${n}`));
      return tails.length === 1 ? tails[0][1] : undefined;
    };

    const seen = new Set<string>();
    for (const r of rows) {
      for (const lim of parseCompNote(unitNote(r.unit, list.composition)).limits) {
        // A "per N points" limit says nothing without a points target — and floor(0 / 1000) = 0 would
        // otherwise flag every restricted entry in a list that has no target set.
        if (lim.perPoints != null && (target <= 0 || lim.perPoints <= 0)) continue;
        const ids = lim.names
          ? [...new Set(lim.names.map(resolveName).filter((id): id is string => !!id))]
          : [r.unit.id];
        if (ids.length === 0) continue;
        const allowed = lim.perPoints != null ? lim.max * Math.floor(target / lim.perPoints) : lim.max;
        // Entries that share one slot carry the SAME note (all three Orc bosses say "0-1 Black Orc
        // Warboss, Orc Warboss or Orc Weirdnob per 1000 points"), so the rule is checked once.
        // Overlapping but DIFFERENT rules are all reported: a Dreadlord and a Supreme Sorceress in a
        // 500-point list each break something of their own, and hiding either would be hiding a
        // problem the player still has to fix.
        const key = `${[...ids].sort().join('|')}@${allowed}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const involved = rows.filter((x) => ids.includes(x.unit.id));
        const taken = involved.reduce((n, x) => n + x.e.count, 0);
        if (taken <= allowed) continue;
        const names = [...new Set(involved.map((x) => plainName(x.unit.name_en)))];
        const label = names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0];
        const message = `${label}: ${taken} taken, ${allowed} allowed (${lim.text})`;
        // Recorded once in `warnings` but attached to EVERY entry in the shared slot: the rule is
        // about the group, so each row lights up while the band still says it once.
        warnings.push(message);
        for (const x of involved) entryWarnings.push({ uid: x.e.uid, message });
      }
    }
  }

  if (total > target) warnings.push(`Over the points limit by ${total - target}`);

  return { total, byCategory, warnings, entryWarnings };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ============================================================================================
// Magic items (Feature 2) — DATA SHAPE + PURE ENGINE
// ============================================================================================
// The catalogue lives in public/owb/magic-items.json: one object keyed by item-list id
// ("general", "dark-elves", "gifts-of-khaine", "forbidden-poisons", …), each value an array of
// MagicItem. An army's metadata (the-old-world.json) lists which item-lists it may use in its
// `items` array; a UNIT's `items[]` sections then filter those by item `type` and cap each
// section with `maxPoints`. We keep this engine PURE: the UI fetches the JSON and passes the
// parsed data in (mirroring how `army`/`statsFor` are passed in) — we never fetch here.

/** One magic item as stored in magic-items.json. `name` is OWB's stable slug-ish id; `type` is the
 *  category (weapon/armor/talisman/enchanted-item/arcane-item/banner/gift-of-khaine/…). */
export interface MagicItem {
  name_en: string; name?: string; points?: number; type: string;
  onePerArmy?: boolean; stackable?: boolean; maximum?: number;
  /** "Common" = a MULTI-TAKEABLE item: one that more than one model may carry (OWB prints these with
   *  a '*'; in the data they carry `stackable: true`). Any number of common items may be taken in a
   *  category, alongside one unique (one-per-army) item. NOT "from the general list" — most general
   *  items (e.g. Lore Familiar, Ogre Blade) are unique, not common. Set by itemPool. */
  common?: boolean;
}
/** Parsed magic-items.json: list-id → items. (Other locale name_* fields are ignored here.) */
export type MagicItemsData = Record<string, MagicItem[]>;

// Default per-character magic-item budget when neither the data nor the caller supplies one.
// TOW's real allowance is the unit's section `maxPoints` (present in the catalogue) — prefer that;
// this constant is only the last-resort fallback the UI/list can override.
export const DEFAULT_MAGIC_BUDGET = 50;

const MAGIC_PREFIX = 'magic';
// Stable id for an item within its category: prefer OWB's `name` slug, else slugify name_en.
const slug = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const magicItemId = (item: MagicItem): string => slug(item.name || item.name_en);
const magicKey = (categoryId: string, itemId: string) => `${MAGIC_PREFIX}/${categoryId}/${itemId}`;

/** Only characters carry magic items (keep it simple, per the spec). */
export function isCharacter(cat: Category): boolean { return cat === 'characters'; }

// Friendly labels per magic-item `type`, so the list mirrors the rulebook's categories
// (Magic Weapons / Magic Armour / Talismans / …). Unknown types fall back to a title-cased slug.
const MAGIC_TYPE_LABEL: Record<string, string> = {
  weapon: 'Magic Weapons', armor: 'Magic Armour', 'armor-mages': 'Magic Armour',
  talisman: 'Talismans', 'enchanted-item': 'Enchanted Items', 'arcane-item': 'Arcane Items',
  banner: 'Magic Standards', 'gift-of-khaine': 'Gifts of Khaine', 'forbidden-poison': 'Forbidden Poisons',
  'weapon-runes': 'Weapon Runes', 'armor-runes': 'Armour Runes', 'talismanic-runes': 'Talismanic Runes',
  'banner-runes': 'Standard Runes', 'engineering-runes': 'Engineering Runes',
  'ranged-weapon-runes': 'Ranged Weapon Runes', 'runic-tattoos': 'Runic Tattoos',
};
export const magicTypeLabel = (type: string): string =>
  MAGIC_TYPE_LABEL[type] ?? type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// A magic-item category the UI renders as one collapsible group. A unit's "Magic Items" section is
// split into one category PER item type (Magic Weapons, Magic Armour, …) so the player may take one
// of each within the SHARED section budget (`budgetGroup`); a Rune section stays a single multi-pick
// category; and a Standard-bearer's magic-standard allowance becomes its own option-gated category.
export interface MagicCategory {
  id: string;            // stable id used in the `magic/<id>/<itemId>` key (the item type, usually)
  label: string;         // this group's heading, e.g. "Magic Weapons" / "Runes"
  groupLabel: string;    // the parent section's name (e.g. "Magic Items") — groups share one budget
  budgetGroup: string;   // categories sharing this id pool into one points budget
  types: string[];       // item `type`s this category accepts
  maxPoints: number | null; // the shared budget for this category's `budgetGroup`
  maxItems: number;      // how many items this category may hold (Infinity = points-limited multi-pick; Dwarf Runes = 3; a BSB banner = 1)
  items: MagicItem[];    // the items selectable in this category
}

// Flatten every item-list this army may use into a single pool (army.items → magic-items.json).
// `armyItemLists` is the army metadata's `items` array (e.g. ["general","dark-elves",…]).
// "Common" is decided PER ITEM, not per list: an item is common when it is multi-takeable — i.e. more
// than one model may carry it (OWB marks these with a '*'; the data flags them `stackable: true`).
// Unique items (one per army / one per category) are NOT common, even when they sit in the universal
// "general" list (e.g. Lore Familiar, Ogre Blade, Wand of Jet are all one-per-army, not common).
function itemPool(armyItemLists: string[], itemsData: MagicItemsData): MagicItem[] {
  const pool: MagicItem[] = [];
  for (const listId of armyItemLists) {
    for (const it of (itemsData[listId] ?? [])) if (it && it.type) pool.push({ ...it, common: !!it.stackable });
  }
  return pool;
}

/** The magic-item categories available to a unit, ready to render as collapsible groups.
 *  - Each `unit.items[]` section that allows several types is split into one category per type
 *    (Magic Weapons / Armour / Talismans / …), all sharing the section's points budget so the player
 *    may take one of each up to the total. A section with a per-section item cap (Dwarf Runes) stays
 *    a single multi-pick category.
 *  - Plus any option-unlocked allowance (e.g. a chosen Standard bearer's magic standard) — included
 *    only when `entry` is given AND that option is currently active. */
export function magicCategories(unit: OwbUnit, armyItemLists: string[], itemsData: MagicItemsData, entry?: ListEntry): MagicCategory[] {
  const pool = itemPool(armyItemLists, itemsData);
  const out: MagicCategory[] = [];
  const sections = Array.isArray(unit.items) ? unit.items : [];
  sections.forEach((sec, si) => {
    const types = Array.isArray(sec.types) ? sec.types : [];
    // OWB encodes "no points limit" as maxPoints 0 — e.g. the Ogre "Big Name" section: a character
    // may take a single Big Name of ANY value, with no shared points pool. Treat 0 as unlimited
    // (Infinity), NOT a 0-point budget that shows "0/0" and disables every item. Mirrors the
    // option-unlocked (magic-standard) branch below, which already does this.
    const rawMaxPoints = typeof sec.maxPoints === 'number' ? sec.maxPoints : null;
    const maxPoints = rawMaxPoints === 0 ? Infinity : rawMaxPoints;
    const group = `sec:${si}`;
    const capped = typeof sec.maxItemsPerCategory === 'number' && sec.maxItemsPerCategory > 0;
    if (capped) {
      // Runes etc. — one category, multi-pick up to the section cap, items across all its types.
      const items = pool.filter((it) => types.includes(it.type));
      if (items.length) out.push({ id: types[0] ?? slug(sec.name_en), label: sec.name_en, groupLabel: sec.name_en, budgetGroup: group, types, maxPoints, maxItems: sec.maxItemsPerCategory!, items });
      return;
    }
    // Normal magic items — one category per type, sharing the section's points budget. Each category
    // is a multi-pick (maxItems Infinity): you may take more than one item of the SAME type, limited
    // only by the shared points allowance — the OWB data only caps a section by points, not "one of
    // each type", so we don't either.
    for (const type of types) {
      const items = pool.filter((it) => it.type === type);
      if (!items.length) continue;
      // A "Big Name" is a pick-ONE titled upgrade (a character may take a single Big Name), so render
      // it single-select (radio). Normal magic-item types stay multi-pick (one unique + any commons),
      // limited only by the shared points budget — see magicWouldExceed.
      const maxItems = type === 'big-name' ? 1 : Infinity;
      out.push({ id: type, label: magicTypeLabel(type), groupLabel: sec.name_en, budgetGroup: group, types: [type], maxPoints, maxItems, items });
    }
  });
  // Option-unlocked allowances (magic standards from a Standard bearer, …) — active options only.
  if (entry) {
    // The army's "magic standard" item type(s) — usually "banner", but Dwarfs inscribe runes on the
    // standard ("banner-runes"/Standard Runes). Used to fill in a Battle Standard Bearer's allowance
    // for army books whose BSB option is missing the explicit `magic` field in the data.
    const bannerTypes = [...new Set(pool.map((it) => it.type).filter((t) => /banner/i.test(t)))];
    for (const { key: g } of OPTION_GROUPS) {
      groupItems(unit, g).forEach((opt, idx) => {
        // Use the option's declared magic allowance; otherwise, a Battle Standard Bearer (a CHARACTER
        // upgrade — the only model that may carry a magic standard) always gets one, even when the
        // catalogue omits the field. Plain unit "Standard bearer"s without a field are NOT granted one.
        let magic = opt.magic;
        if ((!magic || !magic.types?.length) && /battle standard bearer/i.test(opt.name_en || '') && bannerTypes.length) {
          magic = { types: bannerTypes, maxPoints: 0 }; // 0 = no points limit
        }
        if (!magic || !Array.isArray(magic.types) || !magic.types.length) return;
        if (!parentActive(unit, entry, g, opt, idx)) return;
        const items = pool.filter((it) => magic!.types.includes(it.type));
        if (!items.length) return;
        // OWB encodes "no points limit" as maxPoints 0 (a BSB may take a magic standard of ANY value)
        // — treat that as unlimited (Infinity), not a 0 budget that would disable every option.
        const mp = magic.maxPoints;
        const cap = magic.maxItemsPerCategory; // e.g. a Dwarf BSB standard may bear up to 3 runes
        out.push({ id: magic.types[0], label: magicTypeLabel(magic.types[0]), groupLabel: magicTypeLabel(magic.types[0]), budgetGroup: `opt:${String(g)}:${idx}`, types: magic.types, maxPoints: typeof mp === 'number' && mp > 0 ? mp : Infinity, maxItems: typeof cap === 'number' && cap > 0 ? cap : 1, items });
      });
    }
  }
  return out;
}

// Internal: every magic-item key stored on the entry, parsed into {categoryId, itemId}.
function parsedMagicKeys(entry: ListEntry): { categoryId: string; itemId: string; key: string }[] {
  const out: { categoryId: string; itemId: string; key: string }[] = [];
  for (const key of entry.opts) {
    if (!key.startsWith(`${MAGIC_PREFIX}/`)) continue;
    const [, categoryId, itemId] = key.split('/');
    if (categoryId && itemId) out.push({ categoryId, itemId, key });
  }
  return out;
}

/** Resolve the entry's selected magic items against the data: {category section, item, key}.
 *  Only resolves keys whose category + item still exist for this unit (stale/foreign keys ignored). */
export function selectedMagicItems(unit: OwbUnit, entry: ListEntry, itemsData: MagicItemsData, armyItemLists?: string[]):
  { category: MagicCategory; item: MagicItem; key: string }[] {
  // We can resolve items from the raw pool even without armyItemLists by scanning all lists, but
  // prefer the army-scoped categories when provided for correct labels/budgets.
  const cats = magicCategories(unit, armyItemLists ?? Object.keys(itemsData), itemsData, entry);
  if (cats.length === 0) return [];
  const out: { category: MagicCategory; item: MagicItem; key: string }[] = [];
  for (const { categoryId, itemId, key } of parsedMagicKeys(entry)) {
    // Prefer the category named in the key; else ANY category holding the item — so keys written
    // before the per-type split (stored under a section's first type) still resolve by item id.
    const category =
      cats.find((c) => c.id === categoryId && c.items.some((it) => magicItemId(it) === itemId)) ??
      cats.find((c) => c.items.some((it) => magicItemId(it) === itemId));
    if (!category) continue;
    const item = category.items.find((it) => magicItemId(it) === itemId)!;
    out.push({ category, item, key });
  }
  return out;
}

/** Points spent within a category's shared budget group — all per-type categories of one section
 *  (Magic Weapons + Armour + Talismans …) pool into a single allowance. */
export function magicGroupSpent(unit: OwbUnit, entry: ListEntry, budgetGroup: string, itemsData: MagicItemsData, armyItemLists?: string[]): number {
  return selectedMagicItems(unit, entry, itemsData, armyItemLists)
    .filter(({ category }) => category.budgetGroup === budgetGroup)
    .reduce((n, { item }) => n + (item.points ?? 0), 0);
}

/** Total points spent on magic items by this entry (per-unit, never per-model). */
export function magicItemsPoints(unit: OwbUnit, entry: ListEntry, itemsData: MagicItemsData, armyItemLists?: string[]): number {
  return selectedMagicItems(unit, entry, itemsData, armyItemLists).reduce((n, { item }) => n + (item.points ?? 0), 0);
}

/** Points spent within a single category (for that category's budget meter). */
export function magicSpent(unit: OwbUnit, entry: ListEntry, categoryId: string, itemsData: MagicItemsData, armyItemLists?: string[]): number {
  return selectedMagicItems(unit, entry, itemsData, armyItemLists)
    .filter(({ category }) => category.id === categoryId)
    .reduce((n, { item }) => n + (item.points ?? 0), 0);
}

/** The currently-selected item key in a category, or undefined (the FIRST pick in the category). */
export function selectedMagicItem(entry: ListEntry, categoryId: string): string | undefined {
  return parsedMagicKeys(entry).find((p) => p.categoryId === categoryId)?.key;
}

/** Every magic-item key stored on the entry in this category (multi-select aware, e.g. Dwarf Runes). */
export function selectedMagicKeys(entry: ListEntry, categoryId: string): string[] {
  return entry.opts.filter((k) => k.startsWith(`${MAGIC_PREFIX}/${categoryId}/`));
}

/** Pure toggle for a magic item. With `maxItems <= 1` (the default) the category is single-select:
 *  picking an item replaces any previous pick in that same category; picking the already-selected
 *  item clears it. With `maxItems > 1` (e.g. Dwarf Runes, up to 3) it is an additive toggle of THIS
 *  specific key only — present → removed, absent → appended — leaving the category's other picks
 *  untouched. Returns the new opts array (no mutation, mirroring the radio/toggle helpers). */
export function toggleMagicItem(entry: ListEntry, categoryId: string, item: MagicItem, maxItems = 1): string[] {
  const key = magicKey(categoryId, magicItemId(item));
  if (maxItems > 1) {
    return entry.opts.includes(key) ? entry.opts.filter((k) => k !== key) : [...entry.opts, key];
  }
  const already = selectedMagicItem(entry, categoryId);
  // Single-select: drop any existing pick in this category, then add the new one unless it was selected.
  const rest = entry.opts.filter((k) => !k.startsWith(`${MAGIC_PREFIX}/${categoryId}/`));
  return already === key ? rest : [...rest, key];
}

/** Would picking `item` in `categoryId` exceed the category's allowance? (For disabling options in
 *  the UI.) Returns true when adding the item would blow EITHER the points budget OR the per-category
 *  item-count cap (`maxItems`). Budget precedence: explicit `budget` arg → the category's data
 *  `maxPoints` → DEFAULT_MAGIC_BUDGET. Re-picking an already-selected item is never "over" (it's a
 *  no-op / deselect). For single-item categories `maxItems` is 1, matching the prior single-select. */
export function magicWouldExceed(
  unit: OwbUnit, entry: ListEntry, categoryId: string, item: MagicItem, itemsData: MagicItemsData,
  opts?: { budget?: number; armyItemLists?: string[] },
): boolean {
  const armyItemLists = opts?.armyItemLists;
  const cats = magicCategories(unit, armyItemLists ?? Object.keys(itemsData), itemsData, entry);
  const category = cats.find((c) => c.id === categoryId);
  const budget = opts?.budget ?? category?.maxPoints ?? DEFAULT_MAGIC_BUDGET;
  const maxItems = category?.maxItems ?? 1;
  const key = magicKey(categoryId, magicItemId(item));
  const selected = selectedMagicKeys(entry, categoryId);
  if (selected.includes(key)) return false; // re-pick = deselect (always allowed)
  // Per-category limit. Runes/banners use a plain count cap (finite maxItems). The normal magic-item
  // categories (maxItems Infinity) allow only ONE unique (one-per-army) item — but ANY number of
  // common (multi-takeable) items alongside it. So a fresh unique item is blocked once a unique item
  // is already chosen; common items are limited only by the shared points budget below.
  if (isFinite(maxItems)) {
    if (selected.length >= maxItems) return true;
  } else if (!item.common) {
    const hasArmyItem = selected.some((k) => {
      const id = k.split('/')[2];
      const it = category?.items.find((x) => magicItemId(x) === id);
      return !!it && !it.common;
    });
    if (hasArmyItem) return true;
  }
  // Points budget is SHARED across the category's budget group (all per-type categories of a section).
  const spent = category ? magicGroupSpent(unit, entry, category.budgetGroup, itemsData, armyItemLists) : 0;
  return spent + (item.points ?? 0) > budget;
}
