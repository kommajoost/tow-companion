// Army-builder REDESIGN — the container that binds the new screens to the app's real data.
//
// This is the seam between the redesign and everything that already works. It is a DROP-IN
// alternative to `BuilderWorkspace`: same props, same responsibilities, so `ListBuilder` can render
// either one. Nothing below re-implements a rule — it assembles `BuilderCtx` once and hands it to the
// screens, which are pure presentation.
//
// WHY THE ASSEMBLY LIVES HERE (and not in each screen):
//  • `deriveList`, `optionSummary` and `entryPoints` all want the catalogue + magic-item data. Doing
//    it per screen would run the same work three times and let two screens disagree.
//  • The EFFECTIVE category (`unitCategoryFor`) differs from the STORED one (`entry.cat`). Every
//    screen must group by the effective one and every write must keep the stored one. Resolving that
//    once, here, is the only way it stays consistent.
//
// THREE THINGS THAT SILENTLY BREAK IF TOUCHED CARELESSLY — see scratchpad/REBUILD-CONSTRAINTS.md:
//  1. `entry.opts` is the save format, synced across devices last-write-wins, and unknown keys are
//     ignored rather than reported. We never rewrite it; only the engine's own toggle helpers do.
//  2. `entry.uid` is the campaign veteran key (`campaignUnitId`). Never regenerated.
//  3. `itemsData` arrives asynchronously. Every screen renders without it and NOTHING prunes `opts`
//     during that window — a "tidy up unknown keys" pass there would delete every magic item.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TOW, towFont } from '../../design/tow';
import {
  CATEGORIES, COMPOSITION_RULES, entryPoints, selectedMagicItems, unitAllowedIn, unitCategoryFor,
  unitCompNote,
  type BuilderList, type Category, type ListEntry, type MagicItemsData, type OwbArmy, type OwbUnit,
} from '../../lib/owbBuilder';
import { deriveList, optionSummary } from '../../lib/builderDerived';
import { makeTroopTypeLookup } from '../../lib/troopTypes';
import { RosterScreen } from './RosterScreen';
import { PickerScreen } from './PickerScreen';
import { UnitOptions } from './UnitOptions';
import { ResolveSheet } from './ResolveSheet';
import { DesktopShell } from './DesktopShell';
import { RosterTable, rosterTableOrder } from './RosterTable';
import { CataloguePane } from './CataloguePane';
import type { BuilderCtx, BuilderScreen, PickerEntry, RosterRow, SavedListLike } from './types';

/** Same shape `ListBuilder` already passes to `BuilderWorkspace`, so this is a drop-in swap. */
export interface BuilderFlowProps {
  list: SavedListLike;
  name: string;
  onUpdate: (p: Partial<BuilderList> | ((l: SavedListLike) => Partial<BuilderList>)) => void;
  onSetName: (name: string) => void;
  onBack: () => void;
  army: OwbArmy;
  armySlug: string;
  statsFor: (unitName: string) => { Name: string; M: string; WS: string; BS: string; S: string; T: string; W: string; I: string; A: string; Ld: string }[];
  comps: string[];
  armyName: string;
  compName: (comp: string) => string;
  itemsData?: MagicItemsData;
  armyItemLists: string[];
  /** The rules-index (`public/owb/rules-index.json`), for troop-type lookups in the picker. Optional:
   *  without it the whisper line simply omits the troop type rather than guessing one.
   *  `stats` is declared alongside `troopType` because entries carry both and callers type the index by
   *  whichever half they use — without it, TypeScript's weak-type check rejects a stats-typed index. */
  statIdx?: Record<string, { troopType?: string; stats?: unknown[] }> | null;
  /** Opens the app's rule/profile sheet. The container does not own rule resolution. */
  onShowInfo?: (what: { kind: 'rule'; name: string } | { kind: 'item'; itemId: string } | { kind: 'mount'; name: string }) => void;

  // ── Desktop-only extras ──────────────────────────────────────────────────────────────────────
  // The three-pane shell's left rail lists the OTHER saved lists, which only the screen that owns
  // `tow:lists` knows about. All optional: without them the desktop rail simply shows this list
  // alone, and the phone flow never needs any of it.
  /** Every saved list, for the rail's "Armies" block. */
  savedLists?: { id: string; name: string; points: number; army: string }[];
  /** Open another saved list. */
  onOpenList?: (id: string) => void;
  /** Start the new-list dialog. */
  onNewList?: () => void;
  /** Edit one field of the army summary inline (opens the owner's list-settings UI). */
  onEditArmyField?: (field: 'faction' | 'composition' | 'rule' | 'points' | 'items') => void;
  /** Top-bar actions. Absent → the shell renders them disabled with an explanatory title, which is
   *  honest: Export and Print do not exist in this app yet, and Import OWB only exists at creation. */
  onImportOwb?: () => void;
  onExport?: () => void;
  onPrint?: () => void;
}

const newUid = () => `u${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/** A composition rule's display name from its slug ('open-war' → 'Open War'). Reads the engine's own
 *  `COMPOSITION_RULES` table first so the builder and the list-settings picker always agree; an
 *  unrecognised slug is title-cased rather than shown raw or swallowed. */
const ruleLabel = (slug: string): string =>
  COMPOSITION_RULES.find((r) => r.id === slug)?.name
  ?? (slug || '').split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

// `statsFor`, `onSetName`, `armySlug` and `comps` are part of the props ON PURPOSE even though this
// component does not read them: keeping the signature identical to `BuilderWorkspace`'s makes the swap
// in `ListBuilder` a one-line change, and the list-settings screen that needs `comps`/`onSetName` is
// still to come. `statsFor` in particular is redundant here because `UnitOptions` resolves statlines
// from the rules-index itself.
export function BuilderFlow({
  list, name, onUpdate, onBack, army, armyName, compName, itemsData, armyItemLists,
  statIdx, onShowInfo,
  savedLists, onOpenList, onNewList, onEditArmyField, onImportOwb, onExport, onPrint,
}: BuilderFlowProps): React.JSX.Element {
  const [screen, setScreen] = useState<BuilderScreen>({ kind: 'roster' });
  const [resolveOpen, setResolveOpen] = useState(false);
  /** The row to flash after an edit returns to the roster — the spec's "briefly highlighted". */
  const [highlightUid, setHighlightUid] = useState<string | undefined>(undefined);

  // ── Layout: which shell? ──────────────────────────────────────────────────────────────────────
  // Measured on THIS component's own box, not on `window`: the app's nav rail sits beside us at wide
  // widths, so the window is always wider than the space the builder actually gets. The initial value
  // is 0 so the very first paint picks the phone flow and then corrects — the other way round would
  // flash a three-pane layout onto a phone.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(el);
    setBoxW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  /** The desktop spec's own breakpoint: below this it says to use the phone layout outright. */
  const desktop = boxW >= 1180;

  // Desktop-only UI state. Deliberately NOT shared with the phone flow's `screen`: on desktop nothing
  // navigates (the roster is permanent), so a "current screen" has no meaning there.
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [catalogueOpen, setCatalogueOpen] = useState(false);

  const getUnit = useCallback(
    (cat: Category, unitId: string): OwbUnit | undefined => army?.[cat]?.find((u) => u.id === unitId),
    [army],
  );

  const derived = useMemo(() => deriveList(list, army, itemsData), [list, army, itemsData]);

  /** The single mutation path handed to every screen. Always a functional update, and it spreads the
   *  existing list so campaign/group/sync fields we know nothing about survive — dropping them would
   *  erase them on every other device (last-write-wins). */
  const update = useCallback(
    (fn: (l: SavedListLike) => Partial<SavedListLike>) => onUpdate((l) => fn(l as SavedListLike)),
    [onUpdate],
  );

  const ctx = useMemo<BuilderCtx>(() => ({
    list,
    army,
    itemsData,
    derived,
    // `list.rule` is a SLUG ('open-war'); the eyebrow needs its display name ('Open War'), or the
    // header reads "DARK ELVES · GRAND ARMY · OPEN-WAR". Unknown slugs fall back to a title-cased
    // version rather than showing nothing.
    labels: { faction: armyName, composition: compName(list.composition), rule: ruleLabel(list.rule) },
    armyItemLists,
    getUnit,
    update,
  }), [list, army, itemsData, derived, armyName, compName, armyItemLists, getUnit, update]);

  // ── Roster rows ───────────────────────────────────────────────────────────────────────────────
  // Built once for every screen that shows the army. `category` is the EFFECTIVE one; `entry.cat`
  // stays whatever was stored. A stale entry (unit no longer in the catalogue) is skipped exactly as
  // `validate()` skips it — the list still opens, it just under-reports, which is far better than a
  // crash on someone's army list.
  const rows = useMemo<RosterRow[]>(() => {
    const out: RosterRow[] = [];
    for (const entry of list.entries ?? []) {
      const unit = getUnit(entry.cat, entry.unitId);
      if (!unit) continue;
      const magic = !!itemsData && selectedMagicItems(unit, entry, itemsData, armyItemLists).length > 0;
      out.push({
        uid: entry.uid,
        entry,
        unit,
        category: unitCategoryFor(unit, list.composition, entry.cat),
        name: (entry.customName ?? '').trim() || unit.name_en,
        whisper: optionSummary(unit, entry, itemsData),
        points: entryPoints(unit, entry, itemsData),
        count: entry.count,
        magic,
        undersized: entry.count < (unit.minimum ?? 1),
      });
    }
    return out;
  }, [list.entries, list.composition, getUnit, itemsData, armyItemLists]);

  // ── Picker entries ────────────────────────────────────────────────────────────────────────────
  const troopTypeFor = useMemo(() => makeTroopTypeLookup(statIdx ?? null), [statIdx]);

  const pickerEntries = useMemo<PickerEntry[]>(() => {
    const out: PickerEntry[] = [];
    for (const cat of CATEGORIES) {
      for (const unit of army?.[cat] ?? []) {
        // A composition can drop a unit entirely; offering it would let someone build an illegal list
        // and only find out at validation.
        if (!unitAllowedIn(unit, list.composition)) continue;
        const minSize = unit.minimum ?? 1;
        // What adding it RIGHT NOW costs: a hypothetical entry at minimum size, priced by the same
        // function the totals use. No separate "points per model × count" arithmetic.
        const probe: ListEntry = { uid: '__probe__', cat, unitId: unit.id, count: minSize, opts: [] };
        const addCost = entryPoints(unit, probe, itemsData);
        const multiModel = (unit.maximum ?? 0) !== 1 && minSize > 1;
        out.push({
          unit,
          cat,
          displayCat: unitCategoryFor(unit, list.composition, cat),
          inRoster: rows.filter((r) => r.unit.id === unit.id).reduce((n, r) => n + r.count, 0),
          addCost,
          perModel: multiModel ? (unit.points ?? 0) : null,
          minSize,
          troopType: troopTypeFor(unit.name_en) ?? '',
          unaffordable: addCost > derived.remainingPoints,
          note: unitCompNote(unit, list.composition),
        });
      }
    }
    return out;
  }, [army, list.composition, itemsData, rows, derived.remainingPoints, troopTypeFor]);

  // ── Mutations ─────────────────────────────────────────────────────────────────────────────────
  // Every one of these is a functional update that spreads the list. Adding is the only place a uid
  // is created, and it is created ONCE, here — never regenerated afterwards.
  const addUnit = useCallback((unit: OwbUnit, cat: Category): string => {
    const uid = newUid();
    // The STORED category is the base one we were handed, not the effective/display one. Storing the
    // display category would move the unit the next time the composition changes.
    const entry: ListEntry = { uid, cat, unitId: unit.id, count: Math.max(1, unit.minimum ?? 1), opts: [] };
    update((l) => ({ entries: [...l.entries, entry] }));
    return uid;
  }, [update]);

  const duplicateUnit = useCallback((uid: string) => {
    update((l) => {
      const i = l.entries.findIndex((e) => e.uid === uid);
      if (i < 0) return {};
      // A copy is a NEW unit, so it gets a new uid — it must not inherit the original's campaign
      // veteran identity, or two units would claim the same XP.
      const copy: ListEntry = { ...l.entries[i], uid: newUid(), opts: [...l.entries[i].opts] };
      return { entries: [...l.entries.slice(0, i + 1), copy, ...l.entries.slice(i + 1)] };
    });
  }, [update]);

  const removeUnit = useCallback((uid: string) => {
    update((l) => ({ entries: l.entries.filter((e) => e.uid !== uid) }));
    setScreen((s) => (s.kind === 'options' && s.uid === uid ? { kind: 'roster' } : s));
  }, [update]);

  // ── Navigation ────────────────────────────────────────────────────────────────────────────────
  // NOTE ON BACK: no layer is registered here. `UnitOptions` and `ResolveSheet` register their own
  // (`useBackClose`), and `ListBuilder` already owns the "close the open list" layer. A layer here
  // would make hardware Back skip two levels at once.
  const toRoster = useCallback((flash?: string) => {
    setHighlightUid(flash);
    setScreen({ kind: 'roster' });
  }, []);

  const onAdded = useCallback((unit: OwbUnit, cat: Category) => {
    toRoster(addUnit(unit, cat));
  }, [addUnit, toRoster]);

  const onConfigure = useCallback((unit: OwbUnit, cat: Category) => {
    setScreen({ kind: 'options', uid: addUnit(unit, cat) });
  }, [addUnit]);

  // ── Desktop-only behaviour ────────────────────────────────────────────────────────────────────
  // The single "current" unit: the inspector edits one at a time even when several are selected, and
  // every keyboard action targets it. Last-selected wins, which is what a shift/⌘ selection implies.
  const currentUid = selectedUids.length > 0 ? selectedUids[selectedUids.length - 1] : null;

  /** The rows in the order the table paints them — the order arrows and Shift-ranges must follow.
   *  `rows` is in ENTRY order, which diverges the moment a composition remaps a unit to another
   *  category, so navigating over `rows` would jump around the screen. */
  const visualRows = useMemo(() => rosterTableOrder(rows), [rows]);

  const selectRow = useCallback((uid: string, mode: 'single' | 'range' | 'toggle') => {
    setSelectedUids((prev) => {
      if (mode === 'toggle') {
        return prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid];
      }
      if (mode === 'range' && prev.length > 0) {
        const order = visualRows.map((r) => r.uid);
        const a = order.indexOf(prev[prev.length - 1]);
        const b = order.indexOf(uid);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          return order.slice(lo, hi + 1);
        }
      }
      return [uid];
    });
  }, [visualRows]);

  /** Arrow-key selection: step through the VISIBLE order, clamped at both ends (no wrap — wrapping
   *  from the last row back to the first reads as a glitch, not navigation). */
  const moveSelection = useCallback((delta: -1 | 1) => {
    setSelectedUids((prev) => {
      const order = visualRows.map((r) => r.uid);
      if (order.length === 0) return prev;
      const at = prev.length ? order.indexOf(prev[prev.length - 1]) : -1;
      const next = at < 0 ? (delta > 0 ? 0 : order.length - 1) : Math.min(order.length - 1, Math.max(0, at + delta));
      return [order[next]];
    });
  }, [visualRows]);

  /** Move an entry to just before `beforeUid` (null = end of its category). Reorder is a pure
   *  permutation of `entries`: nothing is created, so no uid changes. */
  const reorderTo = useCallback((uid: string, beforeUid: string | null) => {
    update((l) => {
      const from = l.entries.findIndex((e) => e.uid === uid);
      if (from < 0) return {};
      const rest = l.entries.filter((e) => e.uid !== uid);
      const moved = l.entries[from];
      if (beforeUid === null) return { entries: [...rest, moved] };
      const to = rest.findIndex((e) => e.uid === beforeUid);
      if (to < 0) return {};
      return { entries: [...rest.slice(0, to), moved, ...rest.slice(to)] };
    });
  }, [update]);

  /** ⌥↑/⌥↓ — swap the current unit with its neighbour INSIDE its own category. Crossing a category
   *  boundary would silently change the unit's stored category, so it stops at the edge instead. */
  const reorderBy = useCallback((delta: -1 | 1) => {
    if (!currentUid) return;
    const mine = visualRows.filter((r) => r.category === visualRows.find((x) => x.uid === currentUid)?.category);
    const at = mine.findIndex((r) => r.uid === currentUid);
    if (at < 0) return;
    const target = at + delta;
    if (target < 0 || target >= mine.length) return;
    reorderTo(currentUid, delta < 0 ? mine[target].uid : (mine[target + 1]?.uid ?? null));
  }, [currentUid, visualRows, reorderTo]);

  /** +/− — model count, clamped to the unit's own minimum and maximum exactly as the stepper is. */
  const changeCount = useCallback((delta: -1 | 1) => {
    if (!currentUid) return;
    update((l) => ({
      entries: l.entries.map((e) => {
        if (e.uid !== currentUid) return e;
        const unit = getUnit(e.cat, e.unitId);
        if (!unit) return e;
        const min = unit.minimum ?? 1;
        const max = (unit.maximum ?? 0) > 0 ? unit.maximum! : 9999;
        return { ...e, count: Math.min(max, Math.max(min, e.count + delta)) };
      }),
    }));
  }, [currentUid, update, getUnit]);

  // ── Render ────────────────────────────────────────────────────────────────────────────────────
  const desktopShell = desktop ? (
    <DesktopShell
      ctx={ctx}
      rows={rows}
      catalogueOpen={catalogueOpen}
      selectedUid={currentUid}
      savedLists={savedLists ?? [{ id: list.id, name: list.name, points: list.points, army: list.army }]}
      activeListId={list.id}
      autosavedAt={(list as { updatedAt?: number }).updatedAt}
      rosterTable={(
        <RosterTable
          ctx={ctx}
          rows={rows}
          selectedUids={selectedUids}
          onSelect={selectRow}
          onDuplicate={duplicateUnit}
          onRemove={removeUnit}
          onReorder={reorderTo}
          highlightUid={highlightUid}
        />
      )}
      cataloguePane={catalogueOpen ? (
        <CataloguePane
          ctx={ctx}
          entries={pickerEntries}
          onClose={() => setCatalogueOpen(false)}
          onAdd={(unit, cat) => {
            // The pane stays open (add several units in a row); select what was just added so the
            // inspector follows along, which is the whole point of a permanent inspector.
            const uid = addUnit(unit, cat);
            setSelectedUids([uid]);
            setHighlightUid(uid);
          }}
          autoFocusSearch
        />
      ) : undefined}
      onOpenList={onOpenList ?? (() => {})}
      onNewList={onNewList ?? (() => {})}
      onEditArmyField={onEditArmyField ?? (() => {})}
      onOpenCatalogue={() => setCatalogueOpen(true)}
      // Esc: close the catalogue if it is open, otherwise clear the selection. One key, one step at a
      // time — collapsing both into a single press would make Esc feel like it skipped something.
      onEscape={() => { if (catalogueOpen) setCatalogueOpen(false); else setSelectedUids([]); }}
      onMoveSelection={moveSelection}
      onReorder={reorderBy}
      onChangeCount={changeCount}
      onDuplicate={() => { if (currentUid) duplicateUnit(currentUid); }}
      onRemove={() => { if (currentUid) { removeUnit(currentUid); setSelectedUids([]); } }}
      onResolve={() => setResolveOpen(true)}
      onImportOwb={onImportOwb}
      onExport={onExport}
      onPrint={onPrint}
      onShowInfo={onShowInfo}
    />
  ) : null;

  const shell = (() => {
    if (screen.kind === 'picker') {
      return (
        <PickerScreen
          ctx={ctx}
          entries={pickerEntries}
          initialCategory={screen.category}
          onBack={() => toRoster()}
          onAdd={onAdded}
          onConfigure={onConfigure}
        />
      );
    }
    if (screen.kind === 'options') {
      const row = rows.find((r) => r.uid === screen.uid);
      // The entry vanished under us (deleted on another device mid-edit, or a stale uid). Fall back to
      // the roster rather than rendering an editor with nothing to edit.
      if (!row) return <RosterFallback onBack={() => toRoster()} />;
      return (
        <UnitOptions
          ctx={ctx}
          uid={screen.uid}
          onBack={() => toRoster(screen.uid)}
          onDone={() => toRoster(screen.uid)}
          onRemove={() => removeUnit(screen.uid)}
          onDuplicate={() => duplicateUnit(screen.uid)}
          onShowInfo={onShowInfo}
        />
      );
    }
    return (
      <RosterScreen
        ctx={ctx}
        rows={rows}
        onBack={onBack}
        onAddUnit={(category) => setScreen({ kind: 'picker', category })}
        onSelectUnit={(uid) => setScreen({ kind: 'options', uid })}
        onDuplicate={duplicateUnit}
        onRemove={removeUnit}
        onResolve={() => setResolveOpen(true)}
        highlightUid={highlightUid}
      />
    );
  })();

  return (
    <div ref={rootRef} style={{ height: '100%', minHeight: 0 }} data-list-name={name}>
      {/* `DesktopShell` returns null below 1180px on its own, but it is also not RENDERED there, so
          its document-level keyboard listener cannot exist while the phone flow is up. Belt and
          braces on purpose: a shortcut listener surviving behind a phone layout would eat arrows and
          Backspace with no visible cause. */}
      {desktop ? desktopShell : shell}
      {resolveOpen && <ResolveSheet ctx={ctx} onClose={() => setResolveOpen(false)} />}
    </div>
  );
}

/** Shown for the one frame between "the entry I was editing disappeared" and being back on the
 *  roster. Deliberately plain: it is a recovery path, not a designed screen. */
function RosterFallback({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <div style={{ padding: 24, fontFamily: towFont.serif, color: TOW.muted }}>
      That unit is no longer in this list.{' '}
      <button
        type="button"
        onClick={onBack}
        style={{ background: 'none', border: 'none', color: TOW.gold, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
      >
        Back to the roster
      </button>
    </div>
  );
}
