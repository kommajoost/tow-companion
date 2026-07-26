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

import { useCallback, useMemo, useState } from 'react';
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
}: BuilderFlowProps): React.JSX.Element {
  const [screen, setScreen] = useState<BuilderScreen>({ kind: 'roster' });
  const [resolveOpen, setResolveOpen] = useState(false);
  /** The row to flash after an edit returns to the roster — the spec's "briefly highlighted". */
  const [highlightUid, setHighlightUid] = useState<string | undefined>(undefined);

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

  // ── Render ────────────────────────────────────────────────────────────────────────────────────
  // Desktop (≥1180px) is a separate shell; it is wired in a follow-up step. Until then every width
  // gets the phone flow, which is complete and self-contained.
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
    <div style={{ height: '100%', minHeight: 0 }} data-list-name={name}>
      {shell}
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
