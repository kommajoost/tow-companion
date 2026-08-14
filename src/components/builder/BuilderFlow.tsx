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
import { getPersisted, setPersisted, usePersistentState } from '../../store';
import {
  CATEGORIES, COMPOSITION_RULES, entryPoints, selectedMagicItems, unitAllowedIn, unitCategoryFor,
  unitBlocks, unitNote,
  type BuilderList, type Category, type ListEntry, type MagicItemsData, type OwbArmy, type OwbUnit,
} from '../../lib/owbBuilder';
import { deriveList, optionSummary } from '../../lib/builderDerived';
import { makeTroopTypeLookup } from '../../lib/troopTypes';
import { useCampagnes, groeiPlafonds, KRIMP_CAP } from '../../lib/campaign';
import { NaamDialoog } from '../game/NaamDialoog';
import { RosterScreen } from './RosterScreen';
import { PickerScreen } from './PickerScreen';
import { UnitOptions } from './UnitOptions';
import { DesktopShell } from './DesktopShell';
import { RosterTable, rosterTableOrder } from './RosterTable';
import { CataloguePane } from './CataloguePane';
import { ExportSheet } from './ExportSheet';
import type { ExportMeta, ExportRow } from '../../lib/listExport';
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
  /** De 0-X-beperkingen (public/owb/composition-rules.json), doorgegeven door ListBuilder. */
  compRules?: Parameters<typeof deriveList>[4];
  /** The rules-index (`public/owb/rules-index.json`), for troop-type lookups in the picker. Optional:
   *  without it the whisper line simply omits the troop type rather than guessing one.
   *  `stats` is declared alongside `troopType` because entries carry both and callers type the index by
   *  whichever half they use — without it, TypeScript's weak-type check rejects a stats-typed index. */
  statIdx?: Record<string, { troopType?: string; stats?: unknown[] }> | null;
  /** Opens the app's rule/profile sheet. The container does not own rule resolution. */
  onShowInfo?: (what: { kind: 'rule'; name: string } | { kind: 'item'; itemId: string; name: string } | { kind: 'mount'; name: string } | { kind: 'lore'; slug: string }) => void;

  // ── Desktop-only extras ──────────────────────────────────────────────────────────────────────
  // The rail used to carry a list-switcher here (savedLists / onOpenList / onNewList). It is gone:
  // switching or creating a list belongs on the lists overview, not in the left column of a list you
  // are in the middle of building, where it crowded out the catalogue.
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
  list, name, onUpdate, onBack, army, armyName, compName, itemsData, armyItemLists, compRules,
  statsFor, statIdx, onShowInfo,
  onEditArmyField, onImportOwb, onExport, onPrint,
}: BuilderFlowProps): React.JSX.Element {
  const [screen, setScreen] = useState<BuilderScreen>({ kind: 'roster' });
  /** Staat het export-venster open? Leeft hier: het hangt aan de hele lijst, niet aan één scherm. */
  const [exportOpen, setExportOpen] = useState(false);
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
    if (!el) return;
    const measure = () => setBoxW(el.getBoundingClientRect().width);

    // THREE measurement paths on purpose, because the layout choice must not hang on any single one.
    // A ResizeObserver alone looked sufficient until a real browser proved otherwise: in an offscreen
    // Chrome window the observer never delivers a callback at all, so a first measurement taken before
    // layout settled was never corrected and a 314px-wide box kept rendering the three-pane desktop
    // shell. That is one point of failure too many for something as visible as the whole layout.
    //  1. the observer — the precise path, catches pane drags and sibling changes;
    //  2. window resize — cheap, and works even where the observer is inert;
    //  3. two post-mount frames — covers a first measurement taken before styles/fonts settled.
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(([e]) => setBoxW(e.contentRect.width))
      : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    measure();
    const f1 = requestAnimationFrame(() => { measure(); });
    const f2 = window.setTimeout(measure, 250);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(f1);
      window.clearTimeout(f2);
    };
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

  // ── Campagne-regels (Isle of Celedon) ─────────────────────────────────────────────────────────
  // Een campagne-lijst is niet vrij: de fase-cap is de puntenbasis, en een unit die al eerder is
  // ingediend mag maar een beetje duurder worden per Act (en niet krimpen). Die gaan mee naar
  // `validate()`, zodat ze in de band ÉN
  // op de unit-rij zelf verschijnen — precies zoals een te grote unit dat al doet. Zonder dit zag je
  // ze pas bij het indienen op de campagne-site. De server rekent alles opnieuw na bij het locken.
  const { actief: campagneActief } = useCampagnes();
  const campaignCtx = (list as { campaign?: boolean }).campaign ? campagneActief : null;
  const campaignMods = useMemo(
    () => (campaignCtx
      ? {
        pointsCap: campaignCtx.puntenCap,
        groei: groeiPlafonds(campaignCtx, (uid) => list.entries.find((e) => e.uid === uid)?.cat),
        // Minor adjustments (14-08-2026): het krimp-budget over alle bestaande units samen.
        krimpCap: KRIMP_CAP,
      }
      : undefined),
    [campaignCtx, list.entries],
  );

  const derived = useMemo(() => deriveList(list, army, itemsData, campaignMods, compRules), [list, army, itemsData, campaignMods, compRules]);

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
    statIdx,
    getUnit,
    update,
  }), [list, army, itemsData, derived, armyName, compName, armyItemLists, statIdx, getUnit, update]);

  // ── Roster rows ───────────────────────────────────────────────────────────────────────────────
  // Built once for every screen that shows the army. `category` is the EFFECTIVE one; `entry.cat`
  // stays whatever was stored. A stale entry (unit no longer in the catalogue) is skipped exactly as
  // `validate()` skips it — the list still opens, it just under-reports, which is far better than a
  // crash on someone's army list.
  const rows = useMemo<RosterRow[]>(() => {
    const out: RosterRow[] = [];
    // uid → the engine's own messages for that entry. Read rather than re-derived: re-deriving is how
    // the row and the band came to disagree in the first place, and `validate()` checks entry-level
    // rules this file has no business knowing about (the Battle March and Grand Melee single-unit caps,
    // `unitAllowedIn`, the campaign's named-unit requirement).
    const issuesByUid = new Map<string, string[]>();
    for (const w of derived.entryWarnings ?? []) {
      const list0 = issuesByUid.get(w.uid);
      if (list0) list0.push(w.message);
      else issuesByUid.set(w.uid, [w.message]);
    }
    for (const entry of list.entries ?? []) {
      const unit = getUnit(entry.cat, entry.unitId);
      if (!unit) continue;
      const magic = !!itemsData && selectedMagicItems(unit, entry, itemsData, armyItemLists).length > 0;
      out.push({
        uid: entry.uid,
        entry,
        unit,
        category: unitCategoryFor(unit, list.composition, entry.cat),
        name: unit.name_en,
        bijnaam: (entry.customName ?? '').trim() || undefined,
        groeiMax: campaignMods?.groei?.[entry.uid]?.max,
        whisper: optionSummary(unit, entry, itemsData),
        points: entryPoints(unit, entry, itemsData),
        count: entry.count,
        magic,
        issues: issuesByUid.get(entry.uid) ?? [],
      });
    }
    return out;
  }, [list.entries, list.composition, getUnit, itemsData, armyItemLists, derived.entryWarnings]);

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
          note: unitNote(unit, list.composition),
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

  /** ── De prullenbak (14-08-2026) ────────────────────────────────────────────────────────────────
   *  Wat je hier weggooit gaat naar een prullenbak in plaats van meteen weg. Reden: in de campagne mag
   *  droppen meestal niet (alleen in Act 3 en 5), en die melding krijg je pas bij het verlaten van de
   *  builder — dan is de rij al weg. Terughalen via de campagne-baseline kan wel de UID redden, maar
   *  niet de naam die je de unit gaf en niet z'n uitrusting: de campagne bewaart opties als leesbare
   *  namen ("Dark Steed"), niet als de optie-ids die deze builder gebruikt.
   *
   *  De prullenbak bewaart de HELE entry, dus terugzetten is exact: dezelfde uid, dezelfde naam,
   *  dezelfde opties, hetzelfde aantal. Hij hangt aan de lijst-id en staat in localStorage, zodat hij
   *  de builder verlaten en terugkomen overleeft. */
  const [prullenbak, setPrullenbak] = usePersistentState<ListEntry[]>(`tow:prullenbak:${list.id}`, []);

  /** ── Een verwijderde campagne-unit terugzetten (14-08-2026, Joost) ────────────────────────────
   *
   *  In deze builder kun je elke unit gewoon weggooien. In de campagne mag dat meestal niet — droppen
   *  kan alleen in Act 3 en 5 — en die melding krijg je ook, maar pas bij het verlaten van de builder.
   *  Dan is de rij al weg en helpt "opnieuw toevoegen" niet: een nieuwe unit krijgt een nieuwe uid, en
   *  daarmee is ze voor de campagne een ANDER regiment — nieuwe debuutkosten, geen groeiplafond, geen
   *  XP en geen veteranen.
   *
   *  De uid is dus de identiteit, en die moet terug. De campagne levert per eerder ingediende unit haar
   *  uid, datasheet en laatste modellenaantal (towc_lijst_baseline); hiermee bouwen we de rij opnieuw op
   *  met exact díé uid.
   *
   *  De OPTIES zetten we bewust NIET terug: de campagne bewaart ze als leesbare namen ("Dark Steed"),
   *  niet als de optie-ids die de builder gebruikt. Ze gokken zou een verkeerde uitrusting stil in je
   *  lijst zetten. Het aantal modellen zetten we wél terug — krimpen mag niet, dus dat is de ondergrens. */
  const restoreUnit = useCallback((b: {
    uid: string; unitId: string; cat: string; modellen: number | null; entry?: ListEntry;
  }): void => {
    update((l) => {
      if (l.entries.some((e) => e.uid === b.uid)) return {};   // staat er al — niets te doen
      // Uit de prullenbak: de hele entry terug, inclusief naam, opties en optie-aantallen.
      const entry: ListEntry = b.entry
        ? { ...b.entry, opts: [...b.entry.opts], ...(b.entry.optCounts ? { optCounts: { ...b.entry.optCounts } } : {}) }
        : { uid: b.uid, cat: b.cat as Category, unitId: b.unitId, count: Math.max(1, b.modellen ?? 1), opts: [] };
      return { entries: [...l.entries, entry] };
    });
    setPrullenbak((bak) => bak.filter((e) => e.uid !== b.uid));
  }, [update, setPrullenbak]);

  /** Wat je kunt terugzetten, in volgorde van hoe volledig het herstel is.
   *
   *  1. DE PRULLENBAK — hier ligt de hele entry, dus terugzetten is exact: naam, opties, aantal, uid.
   *     Dit dekt het echte scenario: je gooit iets weg in de builder en wilt het terug.
   *  2. DE CAMPAGNE-BASELINE — units uit een eerdere Act die niet in de prullenbak zitten (ander
   *     apparaat, of de bak is geleegd). Daar redden we de uid en het datasheet; de uitrusting moet je
   *     opnieuw kiezen, want de campagne bewaart opties als leesbare namen en niet als optie-ids.
   *
   *  Zit een uid in allebei, dan wint de prullenbak — die is completer. */
  const terugTeHalen = useMemo(() => {
    const inLijst = new Set(list.entries.map((e) => e.uid));
    const uit: {
      uid: string; unitId: string; cat: string; modellen: number | null;
      label: string; sub: string | null; volledig: boolean; entry?: ListEntry;
    }[] = [];

    for (const e of prullenbak) {
      if (inLijst.has(e.uid)) continue;
      const naam = (e as { customName?: string }).customName;
      const ds = getUnit(e.cat as Category, e.unitId)?.name_en ?? e.unitId;
      uit.push({
        uid: e.uid, unitId: e.unitId, cat: e.cat, modellen: e.count,
        label: naam || ds, sub: naam && ds !== naam ? ds : null,
        volledig: true, entry: e,
      });
    }

    if (campaignCtx) {
      const al = new Set(uit.map((x) => x.uid));
      for (const b of campaignCtx.baseline) {
        if (inLijst.has(b.uid) || al.has(b.uid) || !b.unitId) continue;
        // Sinds 14-08 draagt de gelockte momentopname ook de echte optie-ids en de eigen naam. Staat
        // dat erin, dan is een herstel uit de campagne net zo compleet als uit de prullenbak — en dat
        // werkt óók op een ander apparaat, want dit hangt aan het account. Oudere momentopnamen (van
        // vóór die wijziging) hebben het niet; dan is het nog steeds alleen de unit zelf.
        const compleet = b.optIds.length > 0 || !!b.customName;
        uit.push({
          uid: b.uid, unitId: b.unitId, cat: b.cat, modellen: b.laatsteModellen,
          label: b.customName || b.naam || b.datasheet || b.unitId,
          sub: b.datasheet && b.naam && b.datasheet !== b.naam ? b.datasheet : null,
          volledig: compleet,
          entry: {
            uid: b.uid,
            cat: b.cat as Category,
            unitId: b.unitId,
            count: Math.max(1, b.laatsteModellen ?? 1),
            opts: [...b.optIds],
            ...(Object.keys(b.optCounts).length ? { optCounts: { ...b.optCounts } } : {}),
            ...(b.customName ? { customName: b.customName } : {}),
          } as ListEntry,
        });
      }
    }
    return uit;
  }, [campaignCtx, list.entries, prullenbak, getUnit]);

  const duplicateUnit = useCallback((uid: string) => {
    update((l) => {
      const i = l.entries.findIndex((e) => e.uid === uid);
      if (i < 0) return {};
      // A copy is a NEW unit, so it gets a new uid — it must not inherit the original's campaign
      // veteran identity, or two units would claim the same XP.
      // `opts` and `optCounts` are copied, not shared: the spread would hand both units the same
      // array and object, so editing one unit's loadout would silently edit its twin's.
      const src = l.entries[i];
      const copy: ListEntry = {
        ...src, uid: newUid(), opts: [...src.opts],
        ...(src.optCounts ? { optCounts: { ...src.optCounts } } : {}),
      };
      return { entries: [...l.entries.slice(0, i + 1), copy, ...l.entries.slice(i + 1)] };
    });
  }, [update]);

  const removeUnit = useCallback((uid: string) => {
    update((l) => {
      const weg = l.entries.find((e) => e.uid === uid);
      if (weg) {
        // Nieuwste vooraan, en nooit twee keer dezelfde uid in de bak.
        setPrullenbak((b) => [weg, ...b.filter((x) => x.uid !== uid)].slice(0, 20));
      }
      return { entries: l.entries.filter((e) => e.uid !== uid) };
    });
    setScreen((s) => (s.kind === 'options' && s.uid === uid ? { kind: 'roster' } : s));
  }, [update, setPrullenbak]);

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

  // The Celedon walk-through uses one real, legal catalogue entry so its options step is useful.
  // Remembering the uid makes the action idempotent: Back → Next reopens the same example instead of
  // quietly adding another unit. If the player deleted it, a fresh example is created.
  useEffect(() => {
    const onRoster = () => {
      setCatalogueOpen(false);
      setSelectedUids([]);
      setScreen({ kind: 'roster' });
    };

    const onExample = () => {
      const remembered = getPersisted<{ listId?: string; uid?: string } | null>('tow:celedon-tour-unit', null);
      const existing = remembered?.listId === list.id
        ? rows.find((row) => row.uid === remembered.uid)
        : undefined;

      if (existing) {
        if (desktop) {
          setSelectedUids([existing.uid]);
          setCatalogueOpen(false);
        } else {
          setScreen({ kind: 'options', uid: existing.uid });
        }
        window.dispatchEvent(new CustomEvent('tow:celedon-example-ready', { detail: { name: existing.name } }));
        return;
      }

      const candidates = pickerEntries.filter(({ unit, cat, displayCat, troopType }) =>
        cat === 'core'
        && displayCat === 'core'
        && /infantry/i.test(troopType)
        && unitBlocks(unit).length > 0,
      );
      if (candidates.length === 0) return;

      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const uid = addUnit(pick.unit, pick.cat);
      setPersisted('tow:celedon-tour-unit', { listId: list.id, uid });
      if (desktop) {
        setSelectedUids([uid]);
        setCatalogueOpen(false);
      } else {
        setScreen({ kind: 'options', uid });
      }
      window.dispatchEvent(new CustomEvent('tow:celedon-example-ready', { detail: { name: pick.unit.name_en } }));
    };

    window.addEventListener('tow:celedon-add-example', onExample);
    window.addEventListener('tow:celedon-show-roster', onRoster);
    return () => {
      window.removeEventListener('tow:celedon-add-example', onExample);
      window.removeEventListener('tow:celedon-show-roster', onRoster);
    };
  }, [addUnit, desktop, list.id, pickerEntries, rows]);

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

  // ── Campagne: de naam van een unit ────────────────────────────────────────────────────────────
  // Elke unit in een campagne-lijst MOET een eigen naam hebben — daar hangt Isle of Celedon de
  // veteranen-identiteit aan (XP, abilities, littekens volgen de naam over lijsten en battles heen).
  // Die dialoog bestond alleen in de oude BuilderWorkspace, dus in deze builder — de standaard —
  // was een naam simpelweg niet in te stellen. De dialoog leeft nu op dit niveau zodat zowel het
  // telefoon-scherm als de desktop-inspector 'm kunnen openen.
  const [naamUid, setNaamUid] = useState<string | null>(null);
  const naamEntry = naamUid ? list.entries.find((e) => e.uid === naamUid) ?? null : null;
  const naamUnit = naamEntry ? getUnit(naamEntry.cat, naamEntry.unitId) : null;
  const zetNaam = useCallback((uid: string, naam: string) => {
    update((l) => ({ entries: l.entries.map((e) => (e.uid === uid ? { ...e, customName: naam || undefined } : e)) }));
  }, [update]);
  /** Alleen voor een campagne-lijst; een gewone lijst krijgt geen naam-rij te zien. */
  const openNaam = campaignCtx ? (uid: string) => setNaamUid(uid) : undefined;

  // ── Render ────────────────────────────────────────────────────────────────────────────────────
  const desktopShell = desktop ? (
    <DesktopShell
      ctx={ctx}
      rows={rows}
      catalogueOpen={catalogueOpen}
      selectedUid={currentUid}
      onBack={onBack}
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
      onImportOwb={onImportOwb}
      // Export én Print openen hetzelfde venster: "Save as PDF" ís het printvenster van de browser,
      // dus twee ingangen naar één ding. Daarmee verdwijnen ook twee "not built yet"-knoppen. De
      // props van de container blijven bestaan voor het geval die ooit z'n eigen route wil.
      onExport={onExport ?? (() => setExportOpen(true))}
      onPrint={onPrint ?? (() => setExportOpen(true))}
      onShowInfo={onShowInfo}
      onNaam={openNaam}
      groeiMaxVan={(uid) => campaignMods?.groei?.[uid]?.max}
      groeiMinModellenVan={(uid) => campaignMods?.groei?.[uid]?.minModellen ?? undefined}
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
          terugTeHalen={terugTeHalen}
          onRestore={restoreUnit}
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
          onRemove={() => removeUnit(screen.uid)}
          onDuplicate={() => duplicateUnit(screen.uid)}
          onShowInfo={onShowInfo}
          onNaam={openNaam ? () => openNaam(screen.uid) : undefined}
          groeiMax={campaignMods?.groei?.[screen.uid]?.max}
          groeiMinModellen={campaignMods?.groei?.[screen.uid]?.minModellen ?? undefined}
        />
      );
    }
    return (
      <RosterScreen
        ctx={ctx}
        rows={rows}
        onBack={onBack}
        onEditList={onEditArmyField ? () => onEditArmyField('composition') : undefined}
        onExport={() => setExportOpen(true)}
        onAddUnit={(category) => setScreen({ kind: 'picker', category })}
        onSelectUnit={(uid) => setScreen({ kind: 'options', uid })}
        onDuplicate={duplicateUnit}
        onRemove={removeUnit}
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
      {/* Export — leest de rijen die de roster al toont, dus de export kan nooit iets anders zeggen
          dan het scherm. `statsFor` was tot nu toe een ongebruikte prop; de statline-schakelaar is
          z'n eerste echte afnemer. */}
      {exportOpen && (
        <ExportSheet
          rows={rows.map((r): ExportRow => ({
            name: r.name, bijnaam: r.bijnaam, category: r.category,
            count: r.count, points: r.points, whisper: r.whisper, unit: r.unit,
          }))}
          meta={{
            listName: name || 'Untitled list',
            faction: armyName,
            composition: compName(list.composition),
            rule: ruleLabel(list.rule),
            cap: list.points ?? 0,
            total: derived.totalPoints,
          } satisfies ExportMeta}
          statsFor={statsFor}
          onClose={() => setExportOpen(false)}
        />
      )}
      {naamEntry && naamUnit && campaignCtx ? (
        <NaamDialoog
          unitNaam={naamUnit.name_en}
          cat={naamEntry.cat}
          armySlug={list.army}
          huidig={naamEntry.customName ?? ''}
          register={(campaignCtx?.units ?? []).filter((r) => r.naam && (!r.catalogusId || r.catalogusId === naamUnit.id))}
          onBewaar={(naam) => { zetNaam(naamEntry.uid, naam); setNaamUid(null); }}
          onSluit={() => setNaamUid(null)}
        />
      ) : null}
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
