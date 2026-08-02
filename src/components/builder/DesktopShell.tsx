// Army-builder REDESIGN — the DESKTOP SHELL (reference viewport 1440 × 900).
//
// This file is CHROME AND GEOMETRY ONLY. It owns:
//   • the three-band grid (56px top bar · body · 30px status bar) and the three body columns
//     (rail 236 · roster fluid · inspector 392) at FIXED widths. The columns were once drag-resizable
//     with per-device persistence; the handles are gone, because each was an invisible 9px strip at
//     zIndex 3 sitting exactly on a column boundary, and the inspector's checkboxes are flush against
//     that boundary — aiming at a checkbox grabbed the divider. The columns still respond to the
//     available width through the breakpoint tiers and each column's floor;
//   • the left rail's four blocks (Armies · Army · Composition · footer tallies);
//   • the status bar in BOTH of its states (legal line ↔ violation band) at a FIXED 30px, so the
//     layout can never jump when a list goes illegal;
//   • the keyboard model (⌘K, ↑↓, ⌥↑↓, +/−, ⌘D, ⌫, Esc) and its text-field/modal guards.
//
// It owns NOTHING about the list: every mutation is a callback the container supplies. `ctx.update`
// is deliberately never called here, no entry `uid` is ever regenerated (the campaign veteran key —
// REBUILD-CONSTRAINTS §2), and `entry.opts` is never read, pruned or rewritten, so the window in
// which `ctx.itemsData` is still `undefined` (REBUILD-CONSTRAINTS §"catalogus laadt asynchroon") is a
// non-event: the two places that want item data render a placeholder instead.
//
// It also renders nothing of its own for the roster table, the catalogue or the option editor:
//   • `props.rosterTable`   — built by the container (RosterTable.tsx)
//   • `props.cataloguePane` — built by the container (CataloguePane.tsx)
//   • the inspector         — the EXISTING `<UnitOptions>` screen, unchanged
//
// BACK STACK — this component registers NO `useBackClose` layer. `UnitOptions` already registers one
// while it is mounted; a second layer here would make one hardware Back press skip two levels
// (REBUILD-CONSTRAINTS §5).

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { ArmyIcon } from '../../design/icons';
import { magicItemsPoints, type Category } from '../../lib/owbBuilder';
import type { CategoryTotal } from '../../lib/builderDerived';
import {
  BudgetBar, BUILDER, CompactRow, fmt, HAIRLINE, SectionHeader, type BudgetSegment,
} from './primitives';
import { UnitOptions } from './UnitOptions';
import type { BuilderCtx, RosterRow } from './types';

const eb = engraved as React.CSSProperties; // Cinzel 600 · uppercase · letterSpacing .22em

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// geometry constants — the spec's numbers, in one place
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const TOPBAR_H = 56;
const STATUSBAR_H = 30;      // ← IDENTICAL in the legal and the violation state (criterion 5)

const RAIL_DEFAULT = 236;
const INSPECTOR_DEFAULT = 392;
const RAIL_MIN = 200;
const ROSTER_MIN = 480;
const INSPECTOR_MIN = 320;
/** Upper bounds on the two draggable panes. Not in the spec; they exist so a stored width can never
 *  be dragged (or restored from a corrupted `tow:builder-panes`) into a state with no roster left. */

/** Below this the desktop shell renders NOTHING — see the `null` return. */
const MIN_DESKTOP = 1180;
/** The reference layout's lower bound; under it the inspector drops to `INSPECTOR_COMPACT`. */
const REF_W = 1440;
/** At and above this the surplus goes to the roster only, capped and centred. */
const WIDE_W = 1600;
const REF_H = 900;
/** Under this height the rail's Composition block collapses to one stacked bar. */
const SHORT_H = 800;

const INSPECTOR_COMPACT = 340;
const ROSTER_CAP = 900;
/** The catalogue is exactly 100px wider than the rail it replaces — which is the same statement as
 *  the spec's "de rosterkolom wordt 100px smaller", so one constant expresses both. */
const CATALOGUE_EXTRA = 100;
/** The rail's collapsed icon-only width, used at 1180–1440 while the catalogue is open. */
const ICON_RAIL = 56;

const BUDGET_MAX_W = 620;    // top bar: bar + total together


/** The four categories with a budget segment, in the spec's fixed order. Typed as the narrow
 *  `BudgetSegment['key']` union so `<BudgetBar>` takes them without a cast. */
const SPEC_KEYS: readonly BudgetSegment['key'][] = ['characters', 'core', 'special', 'rare'];
const CAT_LABEL: Record<Category, string> = {
  characters: 'Characters', core: 'Core', special: 'Special', rare: 'Rare',
  mercenaries: 'Mercenaries', allies: 'Allies',
};
/** The abbreviations the spec prints in dense chrome ("Chr 460 / Core 638 / Spec 560 / Rare 340") —
 *  mixed case, so they deliberately skip `engraved`'s uppercase. Same set as the phone roster's
 *  footer chips, duplicated rather than imported because `RosterScreen` does not export it. */
const SHORT_LABEL: Record<BudgetSegment['key'], string> = {
  characters: 'Chr', core: 'Core', special: 'Spec', rare: 'Rare',
};

// The spec's focus ring: "2px TOW.gold at 40%, outside the element". There is no 40%-alpha accent
// token and the brief forbids adding one, so the alpha is mixed at use time. Hardcoding
// `rgba(156,43,43,.4)` was the alternative and it is the exact bug `primitives.tsx` documents: an
// Ivory literal that silently ignores the Slate-Night switch. `color-mix` keeps the ring on the live
// token in both skins. It is the first use of `color-mix` in this codebase (src/index.css notes it as
// unused); support is universal in every browser that can run this React 19 / Vite 8 PWA.
const FOCUS_RING = `0 0 0 2px color-mix(in srgb, ${TOW.gold} 40%, transparent)`;

type Zone = 'rail' | 'roster' | 'inspector';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// small helpers
// ═══════════════════════════════════════════════════════════════════════════════════════════════
/** 'dark-elves' → 'Dark Elves'. Only used for SAVED lists other than the open one: `ctx.labels`
 *  carries the authoritative faction name for the OPEN list, and the shell has no army-name index
 *  for the rest. A faction whose display name is not just its title-cased slug therefore reads
 *  slightly differently in the Armies block than in the header — the same documented approximation
 *  `builderDerived.loreLabel` makes. */
const prettySlug = (s: string): string =>
  (s || '').split(/[-_]/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** "Saved 14:32". Rendered only when the container actually passed a stamp — an absent `autosavedAt`
 *  prints nothing rather than claiming a save state the shell cannot know. */
const savedLabel = (ts?: number): string | null => {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return null;
  try {
    return `Saved ${new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return 'Saved';
  }
};

/**
 * True when a keystroke belongs to text entry and must NOT be treated as a shortcut.
 *
 * This is the guard the brief calls out: unguarded `+` / `−` / `⌫` would eat a character out of the
 * catalogue search field, and `⌫` would delete a UNIT instead of a letter. Checked on the event
 * target AND on `document.activeElement`, because a synthetic or retargeted event can arrive with a
 * target that is not the focused node.
 */
const isTextEntry = (node: EventTarget | null): boolean => {
  const el = node as (HTMLElement & { tagName?: string }) | null;
  if (!el || typeof el !== 'object' || !('tagName' in el)) return false;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION') return true;
  if (el.isContentEditable) return true;
  // A contenteditable host or an ARIA textbox that is not itself the focused node.
  return typeof el.closest === 'function'
    && el.closest('[contenteditable=""], [contenteditable="true"], [role="textbox"], [role="searchbox"], [role="combobox"]') !== null;
};

/** True when something modal is on screen. Standards-based rather than app-specific: the shell owns
 *  no overlays, so it can only recognise a layer that marks itself. Documented limitation — an
 *  overlay that sets neither `aria-modal` nor `role="dialog"` nor `<dialog open>` is invisible here,
 *  which is why the focus test below (`activeElement` outside this shell's own root) backs it up. */
const modalOpen = (): boolean => {
  if (typeof document === 'undefined') return false;
  return document.querySelector('[aria-modal="true"], [role="dialog"], [role="alertdialog"], dialog[open]') !== null;
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// warning-band message — deduplicated EXACTLY as RosterScreen does it
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `derived.violations` (four typed kinds, worded per the spec) and `derived.warnings` (validate()'s
// complete list, worded its own way) OVERLAP BY DESIGN — see their doc comments in
// `builderDerived.ts`. Joining both raw prints the same complaint twice ("34 points over the limit ·
// Over the points limit by 34").
//
// So the filter below is a VERBATIM copy of `RosterScreen.tsx`'s `TYPED_COUNTERPART` + its two-guard
// push: same patterns, same order (typed first, in severity order), same exact-string second guard.
// Copied rather than imported because `RosterScreen` does not export it, and kept identical on
// purpose — the phone band and the desktop status band must never word the same list differently.
// If one of these patterns ever changes, change it in BOTH files.
const TYPED_COUNTERPART: readonly RegExp[] = [
  /^Over the points limit by /,                 // ← Violation 'over-cap'
  / over its \d+% cap \(/,                      // ← Violation 'category-max'
  / below its \d+% minimum \(/,                 // ← Violation 'core-min'
  /: (?:below minimum|above maximum) size \(/,  // ← Violation 'unit-size' (identical wording, in fact)
];

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// DesktopShell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function DesktopShell(props: {
  ctx: BuilderCtx;
  rows: RosterRow[];
  /** De rostertabel (een andere agent bouwt die) — jij plaatst hem in de middenkolom. */
  rosterTable: React.ReactNode;
  /** De catalogus-pane; alleen gerenderd als `catalogueOpen`. */
  cataloguePane?: React.ReactNode;
  catalogueOpen: boolean;
  /** De geselecteerde entry-uid, of null → inspector toont de legersamenvatting. */
  selectedUid: string | null;
  autosavedAt?: number;
  /** Leave the builder for the army-lists overview. The rail lets you SWITCH lists but never leave
   *  them, so without this the desktop layout is a dead end — the phone flow has had a Back button
   *  all along, and groups / duplicate / delete only exist on the overview. */
  onBack?: () => void;
  onEditArmyField: (field: 'faction' | 'composition' | 'rule' | 'points' | 'items') => void;
  onOpenCatalogue: () => void;
  onEscape: () => void;
  onMoveSelection: (delta: -1 | 1) => void;
  onReorder: (delta: -1 | 1) => void;
  onChangeCount: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Absent -> the violation band shows the problem without offering a fix. */
  onResolve?: () => void;
  onImportOwb?: () => void;
  onExport?: () => void;
  onPrint?: () => void;
  /** Doorgegeven aan <UnitOptions> in de inspector. */
  onShowInfo?: (what: { kind: 'rule'; name: string } | { kind: 'item'; itemId: string; name: string } | { kind: 'mount'; name: string } | { kind: 'lore'; slug: string }) => void;
  /** Campagne: open de naam-dialoog voor de unit in de inspector. Absent -> geen naam-rij. */
  onNaam?: (uid: string) => void;
  /** Campagne: het puntenplafond van een unit deze Act, voor de inspector-kop. */
  groeiMaxVan?: (uid: string) => number | undefined;
  /** Campagne: de model-ondergrens van een unit (krimpen mag niet). */
  groeiMinModellenVan?: (uid: string) => number | undefined;
}): React.JSX.Element | null {
  const {
    ctx, rows, rosterTable, cataloguePane, catalogueOpen, selectedUid,
    autosavedAt, onBack, onEditArmyField, onOpenCatalogue, onEscape,
    onMoveSelection, onReorder, onChangeCount, onDuplicate, onRemove, onResolve, onImportOwb,
    onExport, onPrint, onShowInfo, onNaam, groeiMaxVan, groeiMinModellenVan,
  } = props;
  const { derived, labels, list } = ctx;

  // ── measurement ───────────────────────────────────────────────────────────────────────────────
  // A ResizeObserver on THIS component's own root, not on `window`: the shell can sit next to the
  // app's nav rail, so the window is always wider than the box the layout actually gets.
  //
  // THE INITIAL-VALUE TRAP (BuilderWorkspace.tsx:200-211 hardcodes 1024 and can flip once on the
  // first paint): `box` starts as `null` = "not measured yet" and every derived width falls back to
  // the REFERENCE viewport. That matters for more than a flicker here — a first value below
  // MIN_DESKTOP would make the component return `null`, so the root would never mount, the observer
  // would never attach and the shell could never measure its way back. `useLayoutEffect` then writes
  // the real box BEFORE the browser paints, so the reference assumption is never actually seen.
  //
  // The observer watches the root AND its parent. Once the shell has bailed out (returned `null`)
  // its own root is gone, so only the parent can still report that the available box grew back past
  // MIN_DESKTOP. The parent is the fallback only — the root wins whenever it is in the document.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const parent = el.parentElement;
    const sizes = new WeakMap<Element, { w: number; h: number }>();
    const publish = () => {
      const src = el.isConnected ? el : parent;
      const s = src ? sizes.get(src) : undefined;
      if (!s) return;
      setBox((prev) => (prev && prev.w === s.w && prev.h === s.h ? prev : s));
    };
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) sizes.set(e.target, { w: e.contentRect.width, h: e.contentRect.height });
      publish();
    });
    ro.observe(el);
    if (parent) ro.observe(parent);
    // Re-read straight from the DOM, bypassing the observer entirely. Needed because a
    // ResizeObserver is not guaranteed to deliver: in an offscreen/headless window it never fires at
    // all, and even in a normal one the first measurement can land before the surrounding chrome has
    // taken its space. A stale `w` used to mean a mis-sized layout; the roster column now flexes so
    // it can no longer overflow, but the TIER and the centred roster cap still read `w`, so it has to
    // be right.
    const remeasure = () => {
      const src = el.isConnected ? el : parent;
      if (!src) return;
      const b = src.getBoundingClientRect();
      sizes.set(src, { w: b.width, h: b.height });
      publish();
    };
    remeasure();
    window.addEventListener('resize', remeasure);
    const f1 = requestAnimationFrame(remeasure);
    const t1 = window.setTimeout(remeasure, 250);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', remeasure);
      cancelAnimationFrame(f1);
      window.clearTimeout(t1);
    };
  }, []);

  const w = box?.w ?? REF_W;
  const h = box?.h ?? REF_H;

  // ── pane widths — FIXED ───────────────────────────────────────────────────────────────────────
  // The columns used to be drag-resizable, with the widths persisted per device. The handles are gone.
  // Each one was an invisible 9px strip absolutely positioned ON the column boundary at zIndex 3, and
  // the inspector's checkboxes sit flush against exactly that boundary — so aiming at a checkbox
  // grabbed the divider instead. A resize nobody asked for is not worth a control you cannot click.
  // The responsive behaviour below is unaffected: it never depended on the stored widths, only on the
  // available width, the breakpoint tier and each column's floor.
  const railStored = RAIL_DEFAULT;
  const inspectorStored = INSPECTOR_DEFAULT;

  const tier: 'wide' | 'ref' | 'compact' = w >= WIDE_W ? 'wide' : w >= REF_W ? 'ref' : 'compact';
  const shortViewport = h > 0 && h < SHORT_H;

  const catalogue = catalogueOpen && cataloguePane != null;
  /** 1180–1440 with the catalogue open: the rail collapses to a 56px icon strip and the catalogue
   *  OVERLAPS it, so the roster keeps its width. At ≥1440 the catalogue REPLACES the rail instead. */
  const overlayCatalogue = catalogue && tier === 'compact';

  const layout = useMemo(() => {
    const inspectorTarget = tier === 'compact'
      ? Math.min(inspectorStored, INSPECTOR_COMPACT)
      : inspectorStored;
    const railTarget = !catalogue ? railStored
      : overlayCatalogue ? ICON_RAIL
        : railStored + CATALOGUE_EXTRA;
    const railFloor = overlayCatalogue ? ICON_RAIL : catalogue ? RAIL_MIN + CATALOGUE_EXTRA : RAIL_MIN;

    let rail = railTarget;
    let inspector = inspectorTarget;
    // Give the roster its floor back, taking from the rail first and the inspector second — the
    // roster is the document, the other two are chrome.
    let roster = w - rail - inspector;
    if (roster < ROSTER_MIN) {
      rail -= Math.min(ROSTER_MIN - roster, Math.max(0, rail - railFloor));
      roster = w - rail - inspector;
    }
    if (roster < ROSTER_MIN) {
      inspector -= Math.min(ROSTER_MIN - roster, Math.max(0, inspector - INSPECTOR_MIN));
      roster = w - rail - inspector;
    }
    return { rail, inspector, roster: Math.max(0, roster) };
  }, [w, tier, catalogue, overlayCatalogue, railStored, inspectorStored]);

  const { rail: railW, inspector: inspectorW, roster: rosterW } = layout;
  /** ≥1600: the surplus is the roster's, but the table itself stops at 900 and centres — a 1 100px
   *  wide table of 30px rows is unreadable, and the spec says so. */
  const rosterInnerW = tier === 'wide' ? Math.min(rosterW, ROSTER_CAP) : rosterW;
  /** The top bar's left block is flush with whatever occupies the left column. It never goes under
   *  RAIL_MIN, so the army name still has room while the icon rail is up. */
  const headerLeftW = Math.max(RAIL_MIN, railW);

  // ── focus zones ───────────────────────────────────────────────────────────────────────────────
  const [ringZone, setRingZone] = useState<Zone | null>(null);
  const inspectorRef = useRef<HTMLDivElement | null>(null);
  const zoneProps = (z: Zone, label: string) => ({
    tabIndex: 0,
    'aria-label': label,
    // focusin/focusout bubble in React, so the ring is drawn only when the PANEL itself is the
    // focused node — not when a button inside it is.
    onFocus: (e: React.FocusEvent) => { if (e.target === e.currentTarget) setRingZone(z); },
    onBlur: (e: React.FocusEvent) => { if (e.target === e.currentTarget) setRingZone((p) => (p === z ? null : p)); },
  });
  const ringOf = (z: Zone): string | undefined => (ringZone === z ? FOCUS_RING : undefined);

  // ── keyboard model ────────────────────────────────────────────────────────────────────────────
  // Callbacks are read through a ref so the listener is installed exactly once: re-binding a
  // document listener on every render of a component this size is pure churn, and a stale closure
  // here would fire a delete against the previous selection.
  const handlers = useRef({
    onOpenCatalogue, onEscape, onMoveSelection, onReorder, onChangeCount, onDuplicate, onRemove,
  });
  handlers.current = {
    onOpenCatalogue, onEscape, onMoveSelection, onReorder, onChangeCount, onDuplicate, onRemove,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const H = handlers.current;
      const active = typeof document !== 'undefined' ? document.activeElement : null;

      // ── GUARD 0: the shell is not on screen. Under MIN_DESKTOP this component renders `null` while
      // staying MOUNTED (so it can measure its way back), which leaves this listener attached. An
      // invisible shell that still swallows ↑/↓ and deletes units out from under the phone layout is
      // exactly the kind of ghost input this guard exists to stop. The root's ref is nulled by React
      // the moment it unmounts, so it doubles as the "am I rendered?" flag.
      if (!rootRef.current || !rootRef.current.isConnected) return;

      // ── GUARD 1: text entry. Checked on BOTH the event target and the focused node. Without this
      // `+`, `−` and `⌫` would edit someone's army list while they are typing a search term.
      if (isTextEntry(e.target) || isTextEntry(active)) return;
      // ── GUARD 2: a modal layer is on screen; its own handlers own the keyboard.
      if (modalOpen()) return;
      // ── GUARD 3: focus sits OUTSIDE this shell's root — i.e. in an overlay the container stacked
      // above us (the Resolve sheet, a rule panel) that did not mark itself as modal. `<body>` /
      // `<html>` / nothing focused is the normal desktop resting state and passes.
      const root = rootRef.current;
      if (root && active && active !== document.body && active !== document.documentElement
        && !root.contains(active)) return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key;

      // ⌘K / Ctrl+K — always available, catalogue or not.
      if (mod && !e.altKey && (key === 'k' || key === 'K')) { e.preventDefault(); H.onOpenCatalogue(); return; }
      // Esc — always available. No preventDefault: another layer may also want to close.
      if (key === 'Escape') { H.onEscape(); return; }

      // Everything below acts on the ROSTER SELECTION, so it is suppressed while focus is inside the
      // inspector column. `onMoveSelection` carries no zone argument, so the shell cannot tell the
      // container "in the inspector" — and swapping the unit under an open option editor while the
      // user arrows through its controls is the one outcome worth ruling out.
      if (inspectorRef.current && active && inspectorRef.current.contains(active)) return;

      if (key === 'ArrowUp' || key === 'ArrowDown') {
        const delta = key === 'ArrowUp' ? -1 : 1;
        e.preventDefault();                                    // never scroll the column as well
        if (e.altKey) H.onReorder(delta); else H.onMoveSelection(delta);
        return;
      }
      // `=` is the unshifted face of the `+` key on a US layout and `Add`/`Subtract` are the numpad
      // names — accepted so the spec's `+` / `−` work without hunting for a shifted glyph.
      if (key === '+' || key === '=' || key === 'Add') { e.preventDefault(); H.onChangeCount(1); return; }
      if (key === '-' || key === 'Subtract') { e.preventDefault(); H.onChangeCount(-1); return; }
      // `e.repeat` is allowed above (holding an arrow or `+` is the point) and blocked below: a held
      // ⌫ would delete unit after unit, and a held ⌘D would fill the list with copies.
      if (mod && !e.altKey && (key === 'd' || key === 'D')) {
        if (e.repeat) return;
        e.preventDefault(); H.onDuplicate(); return;
      }
      if (key === 'Backspace' || key === 'Delete') {
        if (e.repeat) return;
        e.preventDefault(); H.onRemove(); return;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── derived display values (all READ, nothing computed twice) ──────────────────────────────────
  const cap = list?.points ?? 0;
  const totalFor = useMemo(
    () => new Map((derived.categoryTotals ?? []).map((t) => [t.key, t] as const)),
    [derived.categoryTotals],
  );
  const segments = useMemo<BudgetSegment[]>(
    () => SPEC_KEYS.map((key) => ({ key, points: totalFor.get(key)?.points ?? 0 })),
    [totalFor],
  );

  const bandMessages = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (m: string) => {
      const s = (m ?? '').trim();
      if (!s || seen.has(s)) return;   // ← second guard: exact duplicates, whatever their origin
      seen.add(s);
      out.push(s);
    };
    for (const v of derived.violations ?? []) push(v.message);       // typed first (severity order)
    for (const wn of derived.warnings ?? []) {
      if (TYPED_COUNTERPART.some((re) => re.test(wn))) continue;     // already said above
      push(wn);
    }
    return out;
  }, [derived.violations, derived.warnings]);

  const characterCount = useMemo(
    () => (rows ?? []).filter((r) => r.category === 'characters').length,
    [rows],
  );
  /** How many units carry magic items. Read off the container's already-resolved `row.magic` flag
   *  rather than by scanning `entry.opts` for `magic/` keys — the shell never inspects the storage
   *  format (REBUILD-CONSTRAINTS §1). */
  const magicUnitCount = useMemo(() => (rows ?? []).filter((r) => r.magic).length, [rows]);

  /** Total points this list spends on magic items. Read through the engine's own
   *  `magicItemsPoints()` per entry — no reimplementation, and NOT a fourth list-total calculation
   *  (REBUILD-CONSTRAINTS §7): it is a per-entry read of a figure `validate()` already folded into
   *  `derived.totalPoints`. `null` while `ctx.itemsData` has not landed, because a "0" there would
   *  read as "this army carries no magic items". */
  const magicSpend = useMemo<number | null>(() => {
    const data = ctx.itemsData;
    if (!data) return null;
    let n = 0;
    for (const e of list?.entries ?? []) {
      const unit = ctx.getUnit(e.cat, e.unitId);
      if (!unit) continue;
      n += magicItemsPoints(unit, e, data, ctx.armyItemLists ?? []);
    }
    return n;
  }, [ctx, list?.entries]);

  // ── the < 1180 bail-out ───────────────────────────────────────────────────────────────────────
  // AFTER every hook, so the hook order is stable in both states. `box === null` (not yet measured)
  // deliberately does NOT bail: the root has to mount once for the observer to attach.
  if (box !== null && box.w < MIN_DESKTOP) return null;

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // chrome pieces
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  const bandActive = bandMessages.length > 0;
  const stamp = savedLabel(autosavedAt);

  // NOTE — both of these are render FUNCTIONS that are CALLED, not components that are instantiated.
  // A component declared inside the body is a new function identity on every render, so React would
  // unmount and remount its DOM node each time. For the divider that is not cosmetic: a remount
  // mid-drag drops the pointer capture and the drag dies on the first `setPanes`.

  /** A 32px top-bar button. `onClick` absent → really disabled, with a title that says why, because
   *  Export and Print do not exist in this app yet and Import OWB exists only while a list is being
   *  CREATED (REBUILD-CONSTRAINTS §"Wat de spec 'nieuw' noemt"). A button that looks live and does
   *  nothing is worse than one that is visibly unavailable. */
  const topButton = (
    key: string, label: string, onClick: (() => void) | undefined, unavailable: string, primary?: boolean,
  ): React.JSX.Element => {
    const off = !onClick;
    return (
      <button
        key={key}
        type="button"
        onClick={onClick}
        disabled={off}
        title={off ? unavailable : undefined}
        style={{
          height: 32, padding: primary ? '0 13px' : '0 11px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 5,
          boxSizing: 'border-box', borderRadius: BUILDER.radius.button,
          border: primary ? 'none' : `1px solid ${TOW.lineStrong}`,
          background: primary
            ? `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`
            : TOW.panel2,
          color: primary ? TOW.onGrad : TOW.goldDeep,
          fontFamily: towFont.display, fontWeight: primary ? 700 : 600,
          fontSize: primary ? 12.5 : 11.5, lineHeight: 1,
          cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.42 : 1,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {primary ? (
          // The spec prints a fullwidth "＋" (U+FF0B); Cinzel and its fallbacks have no such glyph
          // and a tofu box in the primary action is not a trade worth making — same resolution as
          // the phone roster's "+ Unit".
          <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>+</span>
        ) : null}
        {label}
      </button>
    );
  };

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  return (
    <div
      ref={rootRef}
      style={{
        width: '100%', height: '100%', minHeight: 0, minWidth: 0, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: TOW.bg, color: TOW.parch,
      }}
    >
      {/* ═══════════════ top bar — exactly 56px ═══════════════ */}
      <div
        style={{
          flexShrink: 0, height: TOPBAR_H, boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', overflow: 'hidden',
          background: `linear-gradient(180deg, ${TOW.paper2}, ${TOW.leatherDark})`,
          borderBottom: `1px solid ${TOW.lineStrong}`,
        }}
      >
        {/* left block — flush with the rail */}
        <div
          style={{
            width: headerLeftW, flexShrink: 0, boxSizing: 'border-box',
            padding: `0 ${BUILDER.gutter}px`, display: 'flex', alignItems: 'center', gap: 9,
            overflow: 'hidden',
          }}
        >
          {/* The way OUT of the builder. It carries a visible "‹ Lists" label rather than relying on
              the army icon alone: an icon that happens to be clickable is not a way out anyone finds,
              and this screen had no exit at all. */}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              title="All army lists"
              aria-label="Back to army lists"
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', padding: '4px 6px 4px 0', margin: 0,
                cursor: 'pointer', color: TOW.goldDeep, font: 'inherit',
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>‹</span>
              <ArmyIcon size={22} />
              <span style={{ ...eb, fontSize: 7.5, letterSpacing: '0.16em', lineHeight: 1 }}>LISTS</span>
            </button>
          ) : (
            <span style={{ flexShrink: 0, display: 'flex', color: TOW.goldDeep }}>
              <ArmyIcon size={22} />
            </span>
          )}
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontFamily: towFont.display, fontWeight: 700, fontSize: 15, lineHeight: 1.1,
                color: TOW.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {list?.name || 'Untitled list'}
            </span>
            <span
              style={{
                ...eb, fontSize: 7.5, letterSpacing: '0.18em', lineHeight: 1, marginTop: 2,
                color: TOW.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {[labels?.faction, labels?.composition, labels?.rule].filter(Boolean).join(' · ')}
            </span>
          </span>
        </div>

        {/* centre — the budget bar and the total, together inside 620px */}
        <div
          style={{
            flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center',
            padding: `0 ${BUILDER.gutter}px`, boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: '100%', maxWidth: BUDGET_MAX_W, display: 'flex', alignItems: 'center', gap: 10,
              minWidth: 0,
            }}
          >
            <span style={{ flex: 1, minWidth: 40, display: 'flex' }}>
              {/* Always the REAL total: BudgetBar draws its own hatched overage tail once
                  total > cap, so the over-budget state needs no branch here. */}
              <BudgetBar segments={segments} cap={cap} total={derived.totalPoints} height={6} />
            </span>
            <span
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 5,
                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  fontFamily: towFont.display, fontWeight: 700, fontSize: 15, lineHeight: 1,
                  color: derived.remainingPoints < 0 ? TOW.gold : TOW.ink,
                }}
              >
                {fmt(derived.totalPoints)}
              </span>
              <span
                style={{
                  fontFamily: towFont.serif, fontSize: 11, lineHeight: 1,
                  color: derived.remainingPoints < 0 ? TOW.gold : TOW.faint,
                }}
              >
                {derived.remainingPoints < 0
                  ? `${fmt(-derived.remainingPoints)} over`
                  : `of ${fmt(cap)}`}
              </span>
            </span>
          </div>
        </div>

        {/* right — 32px actions, 8px apart */}
        <div
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
            padding: `0 ${BUILDER.gutter}px`,
          }}
        >
          {topButton(
            'import', 'Import OWB', onImportOwb,
            'Importing an OWB file is only available while creating a list — not into an existing one.',
          )}
          {topButton('export', 'Export', onExport, 'Export is not built yet.')}
          {topButton('print', 'Print', onPrint, 'Print is not built yet.')}
          {topButton('add', 'Add unit', onOpenCatalogue, '', true)}
        </div>
      </div>

      {/* ═══════════════ violations — directly under the top bar, ONE PER LINE ═══════════════
          Above the body, not in the status bar at the bottom: these are the reasons the list is not
          legal, and they were the one thing on screen furthest from the roster they refer to. And one
          per line rather than joined with " · " — with two or three problems the joined run never fit
          its 30px, so the bar announced a problem and then hid what it was.

          This band DOES change the body's height when it appears, which the fixed-30px status bar was
          shaped to avoid. That trade is deliberate: the messages have to be readable, and there is no
          height at which an unknown number of them fits. */}
      {bandActive ? (
        <div
          style={{
            flexShrink: 0, boxSizing: 'border-box', padding: `6px ${BUILDER.gutter}px 7px`,
            display: 'flex', alignItems: 'flex-start', gap: 9,
            background: TOW.bandFill, borderBottom: `1px solid ${TOW.bandLine}`,
          }}
        >
          <span aria-hidden style={{ flexShrink: 0, fontSize: 9, lineHeight: 1.35, color: TOW.goldDeep }}>▲</span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {bandMessages.map((m) => (
              <span
                key={m}
                style={{
                  fontFamily: towFont.serif, fontSize: 11.5, lineHeight: 1.35, color: TOW.goldDeep,
                }}
              >
                {m}
              </span>
            ))}
          </span>
          {/* Only when a handler exists — the container passes none today, and a dead link is worse
              than none. */}
          {onResolve ? (
            <button
              type="button"
              onClick={onResolve}
              style={{
                flexShrink: 0, background: 'none', border: 'none', padding: 0, margin: 0,
                cursor: 'pointer', color: TOW.goldDeep, textDecoration: 'underline',
                ...eb, fontSize: 8.5, letterSpacing: '0.16em',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Resolve
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ═══════════════ body ═══════════════ */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* ── left column: the rail, OR the catalogue in its place ─────────────────────────────── */}
        <div
          {...zoneProps('rail', 'Army rail')}
          style={{
            width: railW, flexShrink: 0, boxSizing: 'border-box', minWidth: 0,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            background: TOW.bg, borderRight: `1px solid ${TOW.line}`,
            boxShadow: ringOf('rail'), outline: 'none',
          }}
        >
          {catalogue && !overlayCatalogue
            ? cataloguePane
            : overlayCatalogue
              ? <IconRail derived={derived} totalFor={totalFor} />
              : (
                <Rail
                  ctx={ctx}
                  onOpenCatalogue={onOpenCatalogue}
                  onEditArmyField={onEditArmyField}
                  totalFor={totalFor}
                  segments={segments}
                  magicSpend={magicSpend}
                  collapseComposition={shortViewport}
                  bandActive={bandActive}
                />
              )}
        </div>

        {/* ── the catalogue as an OVERLAY (1180–1440 only): it covers the 56px icon rail and does
               not take a millimetre from the roster ── */}
        {overlayCatalogue ? (
          <div
            style={{
              position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 4,
              width: railStored + CATALOGUE_EXTRA, boxSizing: 'border-box',
              background: TOW.bg, borderRight: `1px solid ${TOW.lineStrong}`,
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            {cataloguePane}
          </div>
        ) : null}

        {/* ── middle column: the roster — A SCROLL CONTAINER ───────────────────────────────────── */}
        <div
          {...zoneProps('roster', 'Roster')}
          style={{
            // The roster ABSORBS the row instead of taking a fixed width, so `rail + roster +
            // inspector` can never exceed the box. It used to be `width: rosterW, flexShrink: 0`
            // alongside two other unshrinkable columns, all sized from the measured `w` — and the
            // moment the real box was narrower than that measurement (the app's 76px nav rail
            // appearing after the first measure is enough) the row could not shrink, so the whole
            // shell overflowed: the rail clipped on the left, "＋ Add unit" cut off on the right,
            // and the page gained a horizontal scrollbar. Letting the document column flex makes
            // that structurally impossible rather than dependent on measurement being perfect.
            // `flexBasis: rosterW` keeps the intended proportions when the measurement IS right.
            flex: `1 1 ${rosterW}px`, boxSizing: 'border-box', minWidth: 0,
            display: 'flex', justifyContent: 'center',
            overflowY: 'auto', overflowX: 'hidden',
            background: TOW.bg, boxShadow: ringOf('roster'), outline: 'none',
          }}
        >
          {/* THE GUTTER LIVES HERE. Both `primitives` and `RosterTable` state in their own headers
              that they carry no horizontal padding and that "the screen owns the gutter" — and this
              screen then did not supply it, so the table sat flush against the divider: "CHARACTERS"
              and every "1×" started one pixel from the catalogue's edge. Two components each correctly
              deferring to the other is how a contract gap looks from the inside.
              `border-box` so the 14px comes OUT of `rosterInnerW` rather than widening the column past
              the 900px cap. */}
          <div style={{
            width: rosterInnerW, maxWidth: '100%', flexShrink: 0, minWidth: 0, boxSizing: 'border-box',
            padding: `10px ${BUILDER.gutter}px 0`,
          }}>
            {rosterTable}
          </div>
        </div>

        {/* ── right column: the inspector — the EDITING surface, hence White ───────────────────── */}
        <div
          ref={inspectorRef}
          {...zoneProps('inspector', 'Inspector')}
          style={{
            width: inspectorW, flexShrink: 0, boxSizing: 'border-box', minWidth: 0,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            background: TOW.panel, borderLeft: `1px solid ${TOW.line}`,
            boxShadow: ringOf('inspector'), outline: 'none',
          }}
        >
          {selectedUid ? (
            // The EXISTING option editor, unchanged. It scrolls its own body, registers the one
            // back-stack layer, and owns every option/magic-item/lore interaction.
            //
            // PROPS GAP, stated rather than papered over: `UnitOptions` requires `onBack` and
            // `onDone`, and the desktop shell's prop list has no "deselect" callback. Both are wired
            // to `onEscape` — the only callback whose meaning is "clear the transient state" — so
            // hardware Back at least does something coherent instead of nothing.
            <UnitOptions
              ctx={ctx}
              uid={selectedUid}
              onBack={onEscape}
              onRemove={onRemove}
              onDuplicate={onDuplicate}
              onShowInfo={onShowInfo}
              onNaam={onNaam ? () => onNaam(selectedUid) : undefined}
              groeiMax={groeiMaxVan?.(selectedUid)}
              groeiMinModellen={groeiMinModellenVan?.(selectedUid)}
              // Tighter rows here only. This is a 392px column read with a mouse while the roster stays
              // visible; at the phone's 46px rows it showed very little for its height.
              dense
            />
          ) : (
            <InspectorSummary
              ctx={ctx}
              totalFor={totalFor}
              magicSpend={magicSpend}
              characterCount={characterCount}
              magicUnitCount={magicUnitCount}
            />
          )}
        </div>

      </div>

      {/* ═══════════════ status bar — 30px in BOTH states ═══════════════
          Same element, same `height`, same `boxSizing: border-box`, and the band's 1px top rule
          replaces the legal state's 1px top rule rather than adding to it. So going illegal cannot
          move the body by a pixel (criterion 5). */}
      <div
        style={{
          flexShrink: 0, height: STATUSBAR_H, boxSizing: 'border-box',
          padding: `0 ${BUILDER.gutter}px`, display: 'flex', alignItems: 'center', gap: 10,
          overflow: 'hidden',
          background: bandActive ? TOW.bandFill : TOW.panel,
          borderTop: `1px solid ${bandActive ? TOW.bandLine : TOW.lineStrong}`,
        }}
      >
        {/* The violations moved OUT of this bar and up under the top bar — see the band above. They were
            joined with " · " into one nowrap line here, so a list with several problems showed the first
            and ellipsised the rest, at the bottom of the screen away from the roster they refer to. This
            bar is now only ever the tally line — but it must still SAY which state it is in.
            REGRESSION FIXED: when the violation text moved out, this line kept its hardcoded "✓ Legal
            list" unconditionally, so an illegal list showed a passing violation band above a bottom bar
            insisting everything was fine. `bandActive` now picks the glyph and the word. */}
        <span
          style={{
            flex: 1, minWidth: 0, fontFamily: towFont.serif, fontSize: 11.5, lineHeight: 1.2,
            color: TOW.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span style={{ color: TOW.goldDeep }}>{bandActive ? '▲' : '✓'}</span>
          {`${bandActive ? ' Not legal' : ' Legal list'} · ${derived.unitCount} unit${derived.unitCount === 1 ? '' : 's'}`}
          {` · ${derived.modelCount} model${derived.modelCount === 1 ? '' : 's'}`}
          {` · ${characterCount} character${characterCount === 1 ? '' : 's'}`}
        </span>
        {stamp ? (
          <span
            style={{
              flexShrink: 0, fontFamily: towFont.serif, fontSize: 10.5, lineHeight: 1.2,
              color: bandActive ? TOW.goldDeep : TOW.faint, whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums', opacity: bandActive ? 0.8 : 1,
            }}
          >
            {stamp}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// the left rail — four blocks
// ═══════════════════════════════════════════════════════════════════════════════════════════════
/** `derived.categoryTotals` indexed by category. Typed as the engine's own `CategoryTotal` rather
 *  than a hand-written shape, so the absolute `cap` / `floor` it forwards from `validate()` are used
 *  here instead of being recomputed from the percentage in `rule`. */
type TotalMap = Map<Category, CategoryTotal>;

function Rail({
  ctx, onOpenCatalogue, onEditArmyField, totalFor, segments,
  magicSpend, collapseComposition, bandActive,
}: {
  ctx: BuilderCtx;
  onOpenCatalogue: () => void;
  onEditArmyField: (field: 'faction' | 'composition' | 'rule' | 'points' | 'items') => void;
  totalFor: TotalMap;
  segments: BudgetSegment[];
  magicSpend: number | null;
  collapseComposition: boolean;
  bandActive: boolean;
}): React.JSX.Element {
  const { derived, labels, list } = ctx;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* ── 1 · Add unit ──────────────────────────────────────────────────────────────────────────
          The rail used to list the SAVED ARMIES here, which was wrong twice over while a list is open:
          it filled the whole left column with a list-switcher nobody needs mid-build, and it left
          "Add unit" existing only as a small button in the far top-right corner — so the one action the
          screen is FOR had no presence on the side where the eye starts. Switching or creating a list
          now lives where it belongs, on the lists overview behind "‹ LISTS" in the header. */}
      <div
        style={{
          flexShrink: 0, padding: `12px ${BUILDER.gutter}px 14px`, boxSizing: 'border-box',
        }}
      >
        <button
          data-tour="lijst-toevoegen"
          type="button"
          onClick={onOpenCatalogue}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '9px 12px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: TOW.gold, border: `1px solid ${TOW.gold}`, borderRadius: BUILDER.radius.button,
            color: TOW.leatherDark, fontFamily: towFont.display, fontWeight: 700,
            fontSize: 12, lineHeight: 1, letterSpacing: '0.03em',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>+</span>
          Add unit
        </button>
      </div>

      {/* ── 2 · Army — read-only summary; a row opens the container's editor for that field ────── */}
      <div data-tour="lijst-naam" style={{ flexShrink: 0, padding: `0 ${BUILDER.gutter}px`, boxSizing: 'border-box' }}>
        <SectionHeader label="Army" />
        {/* Zonder dit regeltje moet je maar raden dat deze rijen tapbaar zijn — ze zien eruit als een
            samenvatting, en dat waren ze tot 28-07 ook. */}
        <div style={{ ...engraved as React.CSSProperties, fontSize: 7.5, color: TOW.faint, margin: '-2px 0 4px' }}>
          Tap a row to edit
        </div>
        <CompactRow name="Faction" trailing={<RailValue text={labels?.faction || prettySlug(list?.army ?? '')} />} onClick={() => onEditArmyField('faction')} />
        <CompactRow name="Composition" trailing={<RailValue text={labels?.composition || '—'} />} onClick={() => onEditArmyField('composition')} />
        <CompactRow name="Game mode" trailing={<RailValue text={labels?.rule || '—'} />} onClick={() => onEditArmyField('rule')} />
        <CompactRow name="Points" trailing={<RailValue text={`${fmt(derived.totalPoints)} / ${fmt(list?.points ?? 0)}`} accent={derived.remainingPoints < 0} />} onClick={() => onEditArmyField('points')} />
        {/* `—` while `ctx.itemsData` is still in flight: a "0" there would read as "no magic items". */}
        <CompactRow name="Magic items" trailing={<RailValue text={magicSpend == null ? '—' : `${fmt(magicSpend)} pts`} />} onClick={() => onEditArmyField('items')} />
      </div>

      {/* ── 3 · Composition — REPLACES the phone's per-section meta ──────────────────────────────
             Under 800px tall it collapses to one stacked bar plus the four short totals, exactly so
             the rail keeps fitting without a second scroller. */}
      <div data-tour="lijst-punten" style={{ flexShrink: 0, padding: `0 ${BUILDER.gutter}px`, boxSizing: 'border-box' }}>
        <SectionHeader label="Composition" />
        {collapseComposition ? (
          <div style={{ padding: '2px 0 10px' }}>
            <BudgetBar segments={segments} cap={list?.points ?? 0} total={derived.totalPoints} height={6} />
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 5 }}>
              {SPEC_KEYS.map((key) => {
                const t = totalFor.get(key);
                return (
                  <span
                    key={key}
                    style={{
                      fontFamily: towFont.display, fontWeight: 600, fontSize: 9, lineHeight: 1,
                      letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap', color: t && !t.ok ? TOW.gold : TOW.muted,
                    }}
                  >
                    {SHORT_LABEL[key]} {fmt(t?.points ?? 0)}
                  </span>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ paddingBottom: 6 }}>
            {SPEC_KEYS.map((key) => (
              <CompositionRow key={key} label={CAT_LABEL[key]} total={totalFor.get(key)} />
            ))}
          </div>
        )}
      </div>

      {/* Absorbs the leftover height. The Armies block used to be the rail's `flex: 1 1 auto` element;
          with it gone something has to take the slack, or the blocks stretch and the footer floats. */}
      <div style={{ flex: '1 1 auto', minHeight: 0 }} />

      {/* ── 4 · footer — the tallies, with a status dot ──────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0, boxSizing: 'border-box', height: 34,
          padding: `0 ${BUILDER.gutter}px`, display: 'flex', alignItems: 'center', gap: 7,
          borderTop: `1px solid ${TOW.line}`, background: TOW.panel2,
        }}
      >
        <span
          aria-hidden
          style={{
            flexShrink: 0, width: 8, height: 8, borderRadius: BUILDER.radius.pill,
            background: bandActive ? TOW.gold : TOW.faint,
          }}
        />
        <span
          style={{
            flex: 1, minWidth: 0, fontFamily: towFont.serif, fontSize: 10.5, lineHeight: 1.2,
            color: TOW.muted, fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {derived.unitCount} unit{derived.unitCount === 1 ? '' : 's'} · {derived.modelCount} model{derived.modelCount === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

/** The right-hand value of a rail summary row — `CompactRow`'s `trailing` slot. */
function RailValue({ text, accent }: { text: string; accent?: boolean }): React.JSX.Element {
  return (
    <span
      style={{
        maxWidth: 120, fontFamily: towFont.serif, fontSize: 11.5, lineHeight: 1.2,
        color: accent ? TOW.gold : TOW.muted, fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {text}
    </span>
  );
}

/** One Composition row: name · points · a 3px progress track · the rule ("23% / max 25%").
 *
 *  The track's denominator is the category's OWN threshold in POINTS — `cap` for a capped category,
 *  `floor` for Core's minimum — taken straight off `CategoryTotal`, which forwards `validate()`'s own
 *  figures. So a full track means "at the limit", not "at 100% of the army", and the bar can never
 *  disagree with the verdict next to it. No threshold (or no points target) → an empty track rather
 *  than a made-up denominator. A breached category takes the accent at full strength (the spec's "the
 *  track of a violated category becomes TOW.gold") over a tinted bed; a healthy one draws the same
 *  accent at half weight, so the two read as one material. */
function CompositionRow({ label, total }: {
  label: string; total?: CategoryTotal;
}): React.JSX.Element {
  const pct = total?.pct ?? 0;
  const ok = total?.ok !== false;
  const basis = total?.cap ?? total?.floor ?? 0;
  const fill = basis > 0 ? Math.min(100, Math.max(0, ((total?.points ?? 0) / basis) * 100)) : 0;
  const rulePart = total?.rule ? ` / ${total.rule}` : '';

  return (
    <div style={{ padding: '5px 0 6px', borderBottom: `1px solid ${HAIRLINE}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          style={{
            flex: 1, minWidth: 0, fontFamily: towFont.serif, fontSize: 11.5, lineHeight: 1.2,
            color: TOW.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {label}
        </span>
        <span
          style={{
            flexShrink: 0, fontFamily: towFont.serif, fontSize: 11.5, lineHeight: 1.2,
            color: ok ? TOW.muted : TOW.gold, fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmt(total?.points ?? 0)}
        </span>
      </div>
      <div
        style={{
          marginTop: 4, height: 3, borderRadius: 1.5, overflow: 'hidden',
          background: ok ? TOW.line : TOW.bandFill,
        }}
      >
        <div style={{ width: `${fill}%`, height: '100%', background: TOW.gold, opacity: ok ? 0.5 : 1 }} />
      </div>
      <div
        style={{
          marginTop: 3, fontFamily: towFont.serif, fontSize: 10, lineHeight: 1.2,
          color: ok ? TOW.faint : TOW.gold, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        }}
      >
        {ok ? '' : '▲ '}{Math.round(pct)}%{rulePart}
      </div>
    </div>
  );
}

/** The 56px icon rail (1180–1440, catalogue open). Not a menu — the rail's INFORMATION, reduced to
 *  what fits: the app glyph, a violation pip per category and the unit tally. Everything actionable
 *  is a click away in the catalogue that is covering it. */
function IconRail({ derived, totalFor }: {
  derived: BuilderCtx['derived']; totalFor: TotalMap;
}): React.JSX.Element {
  return (
    <div
      style={{
        height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '12px 0', gap: 14, boxSizing: 'border-box', overflow: 'hidden',
      }}
    >
      <span style={{ color: TOW.goldDeep, display: 'flex' }}><ArmyIcon size={22} /></span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'center' }}>
        {SPEC_KEYS.map((key) => {
          const t = totalFor.get(key);
          return (
            <span
              key={key}
              title={`${CAT_LABEL[key]} ${fmt(t?.points ?? 0)}`}
              aria-label={`${CAT_LABEL[key]} ${fmt(t?.points ?? 0)}`}
              style={{
                width: 6, height: 6, borderRadius: BUILDER.radius.pill,
                background: t && !t.ok ? TOW.gold : TOW.lineStrong,
              }}
            />
          );
        })}
      </div>
      <span style={{ flex: 1 }} />
      <span
        style={{
          ...eb, fontSize: 7, letterSpacing: '0.1em', color: TOW.faint,
          writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap',
        }}
      >
        {derived.unitCount} units
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// inspector — the empty state
// ═══════════════════════════════════════════════════════════════════════════════════════════════
/**
 * Nothing selected → the army summary: points per category, the character allowance, magic-item
 * spending.
 *
 * DELIBERATELY OMITTED: the spec also asks for "the last five edits". No edit history exists
 * anywhere in this app — not in `BuilderList`, not in `tow:lists`, not in `listSync` — and inventing
 * one would mean either fabricating entries or adding a journal to the storage format that other
 * devices would overwrite (REBUILD-CONSTRAINTS §1, last-write-wins). So it is left out rather than
 * faked, and reported.
 */
function InspectorSummary({ ctx, totalFor, magicSpend, characterCount, magicUnitCount }: {
  ctx: BuilderCtx;
  totalFor: TotalMap;
  magicSpend: number | null;
  characterCount: number;
  magicUnitCount: number;
}): React.JSX.Element {
  const { derived, labels, list } = ctx;
  const chars = totalFor.get('characters');

  return (
    <div
      style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
        padding: `0 ${BUILDER.gutter}px 18px`, boxSizing: 'border-box',
        fontFamily: towFont.serif, color: TOW.ink,
      }}
    >
      <div style={{ padding: '16px 0 2px' }}>
        <div style={{ ...eb, fontSize: 7.5, color: TOW.muted, marginBottom: 3 }}>
          {[labels?.faction, labels?.composition, labels?.rule].filter(Boolean).join(' · ')}
        </div>
        <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 17, lineHeight: 1.15, color: TOW.ink }}>
          {list?.name || 'Untitled list'}
        </div>
        <div style={{ marginTop: 3, fontSize: 11.5, color: TOW.faint }}>
          Select a unit to edit it.
        </div>
      </div>

      <SectionHeader label="Points" meta={`${fmt(derived.totalPoints)} of ${fmt(list?.points ?? 0)}`} violated={derived.remainingPoints < 0} />
      {SPEC_KEYS.map((key) => {
        const t = totalFor.get(key);
        return (
          <CompactRow
            key={key}
            name={CAT_LABEL[key]}
            trailing={
              <span
                style={{
                  fontFamily: towFont.serif, fontSize: 11.5,
                  color: t && !t.ok ? TOW.gold : TOW.muted, fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                {fmt(t?.points ?? 0)}
                <span style={{ color: TOW.faint }}>
                  {`  ${Math.round(t?.pct ?? 0)}%${t?.rule ? ` / ${t.rule}` : ''}`}
                </span>
              </span>
            }
          />
        );
      })}

      <SectionHeader label="Characters" meta={chars?.rule || undefined} violated={chars ? !chars.ok : false} />
      <CompactRow name="In the list" trailing={<RailValue text={`${characterCount}`} />} />
      {/* The ceiling in points comes from `CategoryTotal.cap` — `validate()`'s own
          `floor(pct × target)`, forwarded rather than recomputed. Re-deriving it here would be a second
          opinion about a limit that already has an owner (REBUILD-CONSTRAINTS §7), and a rounding
          difference would print an allowance the user cannot reconcile with the verdict. With no
          points target there is no ceiling, so the row falls back to the percentage reading. */}
      <CompactRow
        name="Allowance"
        trailing={
          <RailValue
            accent={chars ? !chars.ok : false}
            text={chars?.cap != null
              ? `${fmt(chars.points)} of ${fmt(chars.cap)}`
              : `${fmt(chars?.points ?? 0)} · ${Math.round(chars?.pct ?? 0)}%`}
          />
        }
      />

      <SectionHeader label="Magic items" />
      <CompactRow
        name="Spent"
        trailing={<RailValue text={magicSpend == null ? 'loading…' : `${fmt(magicSpend)} pts`} />}
      />
      <CompactRow
        name="Units carrying items"
        trailing={<RailValue text={`${magicUnitCount}`} />}
      />
    </div>
  );
}
