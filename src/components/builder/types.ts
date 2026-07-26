// Army-builder REDESIGN — the shared contract every new builder screen is built against.
//
// Written up-front, before the screens exist, so screens developed independently compose without
// re-negotiating shapes. Types only: no logic, no React, no imports from any screen.
//
// The redesign is a PRESENTATION layer. The option/points/validation engine stays in
// `src/lib/owbBuilder.ts` — see `builderDerived.ts` for the read-only projection the screens use.
// Screens never compute points and never re-derive rules; they render `derived` and call `update`.

import type {
  BuilderList, Category, ListEntry, MagicItemsData, OwbArmy, OwbUnit,
} from '../../lib/owbBuilder';
import type { DerivedList } from '../../lib/builderDerived';

/** A saved list as it lives in `tow:lists`. Structural, so the existing `SavedList` shapes in
 *  ListBuilder.tsx / ArmyListPicker.tsx satisfy it without either being changed. Extra campaign and
 *  grouping fields are carried through untouched — a screen must never drop unknown fields when it
 *  writes, or cross-device sync will erase them (last-write-wins). */
export interface SavedListLike extends BuilderList {
  id: string;
  name: string;
  /** Army slug — which `public/owb/<slug>.json` this list is built from. */
  army: string;
}

/** Everything a builder screen needs about the open list, assembled ONCE by the container so the
 *  screens stay cheap and consistent. Treat every field as read-only; mutate only via `update`. */
export interface BuilderCtx {
  list: SavedListLike;
  /** The parsed catalogue for `list.army`. */
  army: OwbArmy;
  /** Magic-item data (`public/owb/magic-items.json`). Arrives ASYNCHRONOUSLY and may be undefined on
   *  first paint — a screen must render without it and must NOT prune or rewrite `entry.opts` while
   *  it is missing, or every magic-item pick is silently deleted. */
  itemsData?: MagicItemsData;
  /** The read-only projection of points, categories, violations and warnings. */
  derived: DerivedList;
  /** Display strings for the header eyebrow: "Dark Elves · Grand Army · Open War". */
  labels: { faction: string; composition: string; rule: string };
  /** The magic-item list ids this army may draw from (army metadata `items`). Needed by
   *  `magicCategories()`; pass through, do not invent. */
  armyItemLists: string[];
  /** Look up a catalogue unit. Returns undefined for a stale entry — never throw on that. */
  getUnit: (cat: Category, unitId: string) => OwbUnit | undefined;
  /** The ONLY mutation path. Receives the current list, returns a partial to merge. Must be a
   *  functional update (never a captured snapshot) because catalogue data lands asynchronously and
   *  two writers can race — see store.ts. */
  update: (fn: (l: SavedListLike) => Partial<SavedListLike>) => void;
}

/** One roster row, already resolved and ready to render — the shape screen 1a and the desktop table
 *  both consume, so a row looks identical in both. Built by the container, not by the row. */
export interface RosterRow {
  /** The list entry's uid. STABLE IDENTITY — it is the campaign veteran key (`campaignUnitId`), so it
   *  must be carried through, never regenerated. */
  uid: string;
  entry: ListEntry;
  unit: OwbUnit;
  /** The unit's category UNDER THE CHOSEN COMPOSITION (`unitCategoryFor`), which can differ from
   *  `entry.cat` — a composition may move a unit. Group and tally by THIS one; `entry.cat` stays the
   *  stored base category. */
  category: Category;
  /** Display name: the custom (campaign) name when set, else the unit's own name. */
  name: string;
  /** The whisper line — chosen options joined by " · " (`optionSummary`). */
  whisper: string;
  /** Points for the whole unit, including options and magic items. */
  points: number;
  /** Model count (the entry's count). */
  count: number;
  /** This unit carries magic items → the ✦ glyph after the name. */
  magic: boolean;
  /** Below the unit's minimum size → the count prefix gets the violation marker. */
  undersized: boolean;
}

/** One selectable catalogue entry in the picker (screen 2a). */
export interface PickerEntry {
  unit: OwbUnit;
  /** The category to STORE on a new entry (the base category) — not necessarily where it displays. */
  cat: Category;
  /** The category it displays under in this composition. */
  displayCat: Category;
  /** How many of this unit the roster already holds → "· 24 in roster". */
  inRoster: number;
  /** Points at minimum size — what adding it right now costs. */
  addCost: number;
  /** Points per model, or null for a single-model/flat-points unit. */
  perModel: number | null;
  /** Minimum unit size (`unit.minimum ?? 1`). */
  minSize: number;
  /** Troop type for the whisper line, e.g. "Regular Infantry". */
  troopType: string;
  /** `addCost` exceeds the remaining points → dim to 0.42 and swap the whisper for the reason.
   *  NEVER disable the row: the spec is explicit that going over is reported, not enforced. */
  unaffordable: boolean;
  /** The composition's restriction note (`unitCompNote`), when it has one. */
  note?: string;
}

/** Which screen of the phone flow is showing. The phone spec's 2c is not a screen but a STATE of
 *  1a (the warning band appears under the header), so it is deliberately absent here. */
export type BuilderScreen =
  | { kind: 'roster' }
  | { kind: 'picker'; category?: Category }
  | { kind: 'options'; uid: string };

/** A single suggested fix in the "Resolve" sheet: one concrete edit and what it changes.
 *
 *  Two kinds, because not every violation is fixed by spending less:
 *  - `reduce` frees points up (over the cap, or a category over its maximum) and CAN be applied for
 *    the user — `apply` is present.
 *  - `add-core` is the Core-minimum case, which needs points ADDED. There is no single edit that does
 *    that (the user must choose which units to add), so `apply` is absent and the sheet renders it as
 *    guidance with a shortfall instead of a button. Pretending to auto-fix this would mean inventing
 *    units into someone's army list. */
export interface ResolveFix {
  kind: 'reduce' | 'add-core';
  /** Human-readable action, e.g. "Drop 4 models from Executioners of Har Ganeth". */
  label: string;
  /** Points this frees up (`reduce`, always > 0) or that are still missing (`add-core`, always > 0). */
  saving: number;
  /** The entry this touches, so the sheet can highlight the row. Absent for `add-core`. */
  uid?: string;
  /** Apply the edit. Present only when `kind === 'reduce'`. Returns the partial for
   *  `BuilderCtx.update`; it never regenerates uids and never drops unknown fields. */
  apply?: (l: SavedListLike) => Partial<SavedListLike>;
}
