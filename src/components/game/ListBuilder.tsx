import { useEffect, useMemo, useState } from 'react';
import { usePersistentState } from '../../store';
import { TOW, towFont, engraved } from '../../design/tow';
import { validate, type Category, type OwbArmy, type OwbUnit, type BuilderList, type MagicItemsData } from '../../lib/owbBuilder';
import { listTotal } from '../../lib/builderToArmy';
import { compName } from '../../lib/armies';
import { BuilderWorkspace } from './BuilderWorkspace';
import { BuilderFlow } from '../builder/BuilderFlow';
import { NewListSetup, type NewListValues } from './NewListSetup';
import { useBackClose } from '../../lib/backStack';
import { useData } from '../../data';
import { getRuleIndex, resolveOptionSlug, resolveRuleSlug } from '../../lib/armyRules';
import { useUI } from '../../state';
import { applyOverlay, applyOverlayItems, hasOverlay, isOverlay, overlayCompsFor, OVERLAY_FILES, type CompositionOverlay } from '../../lib/overlays';

const BASE = import.meta.env.BASE_URL;
const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

// Multi-army list builder. This file owns the army registry (index.json), each army's composition +
// item-list metadata (the-old-world.json), an on-demand per-army catalogue cache, and the "My lists"
// collection (saved locally). The open list is edited in the responsive <BuilderWorkspace> (Claude
// Design's PC-columns / mobile-sheets builder on our OWB data); each list carries its own army.
const FALLBACK_ARMY = 'dark-elves';

interface SavedList extends BuilderList {
  id: string; name: string; army: string; createdAt: number; updatedAt: number; groupId?: string | null;
  // Campagne-koppeling (De Grensvorsten) — optioneel, zodat bestaande opgeslagen lijsten geldig blijven
  // en de list-sync (jsonb) deze velden vanzelf meeneemt.
  campaign?: boolean; campaignSpeler?: string; campaignNaam?: string; campaignFase?: number;
  /** Campagne: de BEREKENDE puntensom van deze lijst (incl. magic items). `points` is alleen het
   *  DOEL (de fase-cap waarop de lijst is aangemaakt); de campagne heeft de echte som nodig om te
   *  toetsen of de lijst binnen 500 + 250×(Act−1) blijft. Alleen gezet voor campagne-lijsten, en
   *  alleen als de som betrouwbaar te berekenen is (zie het effect in ListBuilder). */
  computedPoints?: number;
}
const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

// OWB's normalizeRuleName (rules index is keyed by this) + a final-word singular fallback.
const normRule = (s: string) => (s || '').toLowerCase().replace(/ *\([^)]*\) */g, '').replace(/[{}[\]*]/g, '').replace(/^[0-9]x /g, '').replace(/[“”]/g, '"').trim();
interface StatRow { Name: string; M: string; WS: string; BS: string; S: string; T: string; W: string; I: string; A: string; Ld: string }
let statIndexCache: Record<string, { stats?: StatRow[] }> | null = null;

// Per-army metadata from the-old-world.json: which compositions it offers + which magic-item lists.
interface ArmyMeta { comps: string[]; items: string[] }

export function ListBuilder() {
  // ── The redesigned builder is now the DEFAULT ─────────────────────────────────────────────────
  // `src/components/builder/` replaces this screen's workspace: compact roster on a phone, three-pane
  // layout on a wide screen. The old `BuilderWorkspace` is still in the bundle and still reachable by
  // setting `tow:builder-v2` to false, purely as a fallback if something turns out to be broken in
  // the field — not as an opt-in. Once the new flow has proven itself, both the flag and
  // BuilderWorkspace can go.
  const [useV2] = usePersistentState<boolean>('tow:builder-v2', true);
  const { rules, setRuleOverlay } = useData();
  const { openRule } = useUI();
  const ruleIdx = useMemo(() => getRuleIndex(rules ?? {}), [rules]);

  const [armies, setArmies] = useState<{ slug: string; name: string }[]>([]);
  const [metaByArmy, setMetaByArmy] = useState<Record<string, ArmyMeta>>({});
  const [catalogues, setCatalogues] = useState<Record<string, OwbArmy>>({}); // slug → catalogue (on demand)
  const [itemsData, setItemsData] = useState<MagicItemsData | null>(null);
  const [statIdx, setStatIdx] = useState<Record<string, { stats?: StatRow[] }> | null>(statIndexCache);
  const [lists, setLists] = usePersistentState<SavedList[]>('tow:lists', []);
  const [groups, setGroups] = usePersistentState<{ id: string; name: string }[]>('tow:list-groups', []);
  const [activeId, setActiveId] = usePersistentState<string | null>('tow:builder-active', null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null); // section id being hovered (group id, or '__ungrouped__')
  const [dragOverCard, setDragOverCard] = useState<{ id: string; before: boolean } | null>(null); // card hovered during a reorder drag (+ which edge)
  const [collapsed, setCollapsed] = usePersistentState<string[]>('tow:list-groups-collapsed', []); // collapsed section ids
  const toggleCollapse = (id: string) => setCollapsed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  // In-app Back: each navigable layer owns one history entry (deepest registers last → handled first).
  useBackClose(!!activeId, () => setActiveId(null)); // open builder → back to My lists
  useBackClose(setupOpen, () => setSetupOpen(false)); // new-list dialog

  // Army registry + per-army comps/items + the army-agnostic stat index + magic-items data.
  useEffect(() => {
    fetch(`${BASE}owb/index.json`).then((r) => r.json()).then((idx) => {
      if (Array.isArray(idx?.armies)) setArmies(idx.armies.map((a: { slug: string; name: string }) => ({ slug: a.slug, name: a.name })));
    }).catch(() => {});
    fetch(`${BASE}owb/the-old-world.json`).then((r) => r.json()).then((m) => {
      const map: Record<string, ArmyMeta> = {};
      for (const a of (m.armies ?? [])) map[a.id] = { comps: Array.isArray(a.armyComposition) ? a.armyComposition : [a.id], items: Array.isArray(a.items) ? a.items : [] };
      setMetaByArmy(map);
    }).catch(() => {});
    fetch(`${BASE}owb/magic-items.json`).then((r) => r.json()).then(setItemsData).catch(() => setItemsData(null));
    if (statIndexCache) setStatIdx(statIndexCache);
    else fetch(`${BASE}owb/rules-index.json`).then((r) => r.json()).then((idx) => { statIndexCache = idx; setStatIdx(idx); }).catch(() => {});
  }, []);

  // One-time migration: fold an earlier single saved list (`tow:builder-de`) into the collection.
  useEffect(() => {
    if (lists.length > 0) return;
    try {
      const legacy = JSON.parse(localStorage.getItem('tow:builder-de') || 'null');
      if (legacy && Array.isArray(legacy.entries) && legacy.entries.length) {
        const id = newId('l');
        setLists([{ id, name: 'My list', army: FALLBACK_ARMY, composition: legacy.composition || 'dark-elves', rule: legacy.rule || 'open-war', points: legacy.points || 2000, entries: legacy.entries, createdAt: Date.now(), updatedAt: Date.now() }]);
        localStorage.removeItem('tow:builder-de');
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Campagne: de ECHTE puntensom meeschrijven (`computedPoints`) ────────────────────────────────
  // De campagne ("De Grensvorsten") moet kunnen toetsen of een campagne-lijst binnen de fase-cap
  // valt, maar `points` is enkel het DOEL waarop de lijst is aangemaakt — niet de som. Dit scherm is
  // de meest betrouwbare plek om die som weg te schrijven: het bezit `tow:lists`, laadt de catalogus
  // van ELKE army die in de lijsten voorkomt (effect hierboven) én de magic-items-data, dus de som
  // klopt inclusief items — ook voor lijsten die je niet openslaat (bv. van een ander device
  // gesynct). En omdat ListBuilder de <BuilderWorkspace> zélf rendert, loopt elke wijziging in de
  // builder via `setLists` hier langs, dus de waarde blijft actueel (niet alleen bij aanmaken).
  // Ontbreekt de catalogus of de items-data, dan schrijven we NIETS: liever geen waarde dan een te
  // lage som — de campagne behandelt een ontbrekende `computedPoints` als waarschuwing, geen fout.
  // `updatedAt` bumpen we bewust niet (afgeleide waarde, geen gebruikers-bewerking); de list-sync
  // pikt de wijziging op via de snapshot en duwt het veld mee naar `tow_lists`.
  useEffect(() => {
    if (!itemsData) return;
    const sommen = new Map<string, number>();
    for (const l of lists) {
      if (!l.campaign) continue;
      const cat = catalogues[l.army];
      if (!cat) continue;
      const total = listTotal(l, cat, itemsData);
      if (l.computedPoints !== total) sommen.set(l.id, total);
    }
    if (sommen.size === 0) return;
    setLists((ls) => ls.map((l) => {
      const t = sommen.get(l.id);
      return t === undefined ? l : { ...l, computedPoints: t };
    }));
  }, [lists, catalogues, itemsData, setLists]);

  const active = lists.find((l) => l.id === activeId) || null;

  // Load the ACTIVE list's army catalogue on demand (cache by slug) before opening the workspace.
  const activeArmySlug = active?.army ?? null;
  useEffect(() => {
    if (!activeArmySlug || catalogues[activeArmySlug]) return;
    let cancelled = false;
    fetch(`${BASE}owb/${activeArmySlug}.json`).then((r) => r.json()).then((c) => { if (!cancelled) setCatalogues((m) => ({ ...m, [activeArmySlug]: c })); }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeArmySlug, catalogues]);

  // Load the catalogue of every distinct army among the saved lists (for the "My lists" totals).
  useEffect(() => {
    const need = Array.from(new Set(lists.map((l) => l.army))).filter((s) => s && !catalogues[s]);
    if (need.length === 0) return;
    let cancelled = false;
    Promise.all(need.map((s) => fetch(`${BASE}owb/${s}.json`).then((r) => r.json()).then((c) => [s, c] as const).catch(() => null)))
      .then((pairs) => { if (cancelled) return; const add: Record<string, OwbArmy> = {}; for (const p of pairs) if (p) add[p[0]] = p[1]; if (Object.keys(add).length) setCatalogues((m) => ({ ...m, ...add })); });
    return () => { cancelled = true; };
  }, [lists, catalogues]);

  const rawActiveCatalogue = activeArmySlug ? catalogues[activeArmySlug] ?? null : null;

  // ── Composition overlays (Renegade Legacy Pack) ────────────────────────────────────────────────
  // A pack is a POINTS patch on top of the OWB catalogue, keyed by composition id. Fetched on demand
  // and cached by id; a missing or malformed file degrades to "no overlay" so a bad deploy can never
  // leave someone unable to open their list.
  const [overlays, setOverlays] = useState<Record<string, CompositionOverlay>>({});
  const activeComp = active?.composition ?? null;
  useEffect(() => {
    if (!activeComp || !hasOverlay(activeComp) || overlays[activeComp]) return;
    let cancelled = false;
    fetch(`${BASE}renegade/${OVERLAY_FILES[activeComp]}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && isOverlay(j)) setOverlays((m) => ({ ...m, [activeComp]: j })); })
      .catch(() => { /* no overlay is a missing rebalance, never a broken list */ });
    return () => { cancelled = true; };
  }, [activeComp, overlays]);

  const activeOverlay = activeComp ? overlays[activeComp] ?? null : null;
  // Only patch when the overlay actually belongs to this army — a composition id is unique, but a
  // stale cache entry pointing at another faction would silently reprice the wrong units.
  const activeCatalogue = useMemo(() => {
    if (!rawActiveCatalogue || !activeOverlay || activeOverlay.baseArmy !== activeArmySlug) return rawActiveCatalogue;
    return applyOverlay(rawActiveCatalogue, activeOverlay);
  }, [rawActiveCatalogue, activeOverlay, activeArmySlug]);
  const activeItemsData = useMemo(() => {
    if (!itemsData || !activeOverlay || activeOverlay.baseArmy !== activeArmySlug) return itemsData;
    return applyOverlayItems(itemsData, activeOverlay);
  }, [itemsData, activeOverlay, activeArmySlug]);
  // The pack's own wording for the rules it changes, installed globally while a pack list is open. It
  // has to be global: the rule sheet renders outside this tree, so a local override would leave the
  // sheet showing the standard rule for a list the pack has already repriced.
  useEffect(() => {
    const on = activeOverlay && activeOverlay.baseArmy === activeArmySlug;
    setRuleOverlay(on ? activeOverlay : null);
    return () => setRuleOverlay(null);
  }, [activeOverlay, activeArmySlug, setRuleOverlay]);
  const getUnitFor = (cat: OwbArmy | null) => (c: Category, id: string): OwbUnit | undefined => cat?.[c]?.find((u) => u.id === id);
  // Per army: the compositions from the synced OWB metadata, PLUS our own overlay compositions. The
  // overlay ids are appended here rather than written into `the-old-world.json`, because that file is
  // regenerated by `npm run sync-owb` and would silently drop them at the next data refresh.
  const compsByArmy = useMemo(() => Object.fromEntries(
    Object.entries(metaByArmy).map(([slug, v]) => {
      const extra = overlayCompsFor(slug).filter((id) => !v.comps.includes(id));
      return [slug, extra.length ? [...v.comps, ...extra] : v.comps];
    }),
  ), [metaByArmy]);
  // Army slug → its magic-item list ids (the same `items` array BuilderWorkspace gets as armyItemLists).
  const itemListsByArmy = useMemo(() => Object.fromEntries(Object.entries(metaByArmy).map(([slug, m]) => [slug, m.items ?? []])), [metaByArmy]);
  const armyName = (slug: string) => armies.find((a) => a.slug === slug)?.name ?? slug;
  const statsFor = useMemo(() => (unitName: string): StatRow[] => {
    if (!statIdx) return [];
    const key = normRule(unitName);
    let e = statIdx[key];
    if (!e?.stats?.length) { const w = key.split(' '); const last = w[w.length - 1]; if (/s$/.test(last)) e = statIdx[[...w.slice(0, -1), last.replace(/s$/, '')].join(' ')]; }
    return e?.stats ?? [];
  }, [statIdx]);

  const updateActive = (p: Partial<BuilderList> | ((l: SavedList) => Partial<BuilderList>)) =>
    setLists((ls) => ls.map((l) => (l.id === activeId ? { ...l, ...(typeof p === 'function' ? p(l) : p), updatedAt: Date.now() } : l)));
  const setName = (name: string) => setLists((ls) => ls.map((l) => (l.id === activeId ? { ...l, name, updatedAt: Date.now() } : l)));

  const createListWith = (v: NewListValues) => {
    const id = newId('l');
    setLists((ls) => [{ id, name: v.name, army: v.army, composition: v.composition, rule: v.rule, points: v.points, entries: v.entries, createdAt: Date.now(), updatedAt: Date.now(), campaign: v.campaign, campaignSpeler: v.campaignSpeler, campaignNaam: v.campaignNaam, campaignFase: v.campaignFase }, ...ls]);
    setSetupOpen(false);
    setActiveId(id);
  };
  const duplicateList = (l: SavedList) => { const id = newId('l'); setLists((ls) => [{ ...l, id, name: `${l.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() }, ...ls]); };
  const deleteList = (id: string) => { setLists((ls) => ls.filter((l) => l.id !== id)); if (activeId === id) setActiveId(null); };

  // ── groups (folders) ──
  const addGroup = () => { const name = window.prompt('Group name'); if (name && name.trim()) setGroups((g) => [...g, { id: newId('g'), name: name.trim() }]); };
  const renameGroup = (id: string, current: string) => { const name = window.prompt('Group name', current); if (name && name.trim()) setGroups((g) => g.map((x) => (x.id === id ? { ...x, name: name.trim() } : x))); };
  const deleteGroup = (id: string, name: string) => {
    if (!window.confirm(`Delete folder “${name}”? Its lists move back to Ungrouped.`)) return;
    setGroups((g) => g.filter((x) => x.id !== id));
    setLists((ls) => ls.map((l) => (l.groupId === id ? { ...l, groupId: null } : l)));
  };
  // Reorder a list within the manual `lists` order (drag-drop). `targetId` null = append to the end of
  // `groupId`'s section; otherwise insert before/after the target card. Also adopts the target's group.
  const reorderList = (draggedId: string, targetId: string | null, before: boolean, groupId: string | null) =>
    setLists((ls) => {
      const arr = [...ls];
      const di = arr.findIndex((x) => x.id === draggedId);
      if (di < 0) return ls;
      const [moved] = arr.splice(di, 1);
      const next = { ...moved, groupId: groupId ?? null, updatedAt: Date.now() };
      if (targetId == null) { arr.push(next); }
      else {
        const ti = arr.findIndex((x) => x.id === targetId);
        if (ti < 0) { arr.push(next); }
        else { arr.splice(before ? ti : ti + 1, 0, next); }
      }
      return arr;
    });

  // A list is a HAIRLINE ROW, not a bordered card — the same primitive the redesigned roster uses, so
  // the overview and the builder read as one app. Cards put a frame around every entry and a gap
  // between them, which is a lot of furniture for "here are your lists": eight of them became eight
  // boxes. A shared separator does the same job with none of the weight.
  const card: React.CSSProperties = {
    borderBottom: `1px solid ${TOW.hairline}`, background: 'transparent',
  };
  /** A bare glyph action. Same reasoning as the option editor's eye: a column of outlined boxes down
   *  the right edge competes with the names, which are the thing you are scanning. */
  const glyphBtn: React.CSSProperties = {
    width: 34, height: 34, flexShrink: 0, border: 'none', background: 'transparent',
    borderRadius: 8, cursor: 'pointer', color: TOW.faint,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1,
  };

  // ── open list → the responsive builder (wait for that army's catalogue to load) ──
  if (active) {
    if (!activeCatalogue) return <div style={{ padding: 24, fontFamily: towFont.serif, color: TOW.muted }}>Loading the catalogue…</div>;
    const meta = metaByArmy[active.army];
    if (useV2) {
      return (
        <BuilderFlow
          list={active}
          name={active.name}
          onUpdate={updateActive}
          onSetName={setName}
          onBack={() => setActiveId(null)}
          army={activeCatalogue}
          armySlug={active.army}
          statsFor={statsFor}
          comps={compsByArmy[active.army] ?? meta?.comps ?? [active.army]}
          armyName={armyName(active.army)}
          compName={(c) => compName(c, active.army)}
          itemsData={activeItemsData ?? undefined}
          armyItemLists={meta?.items ?? []}
          statIdx={statIdx}
          // Desktop rail: the other saved lists. Only this screen owns `tow:lists`, so it supplies
          // them; the builder itself never reads the collection.
          savedLists={lists.map((l) => ({ id: l.id, name: l.name, points: l.points, army: l.army }))}
          onOpenList={(id) => setActiveId(id)}
          onNewList={() => setSetupOpen(true)}
          // The army-summary rows are click-to-edit. The list-settings UI still lives in
          // BuilderWorkspace, so until it is ported this opens nothing rather than pretending: an
          // inert row is honest, a row that opens a broken sheet is not.
          onEditArmyField={undefined}
          // Import OWB exists, but only as "create a list from a paste" — not as "import into THIS
          // list", which is what the top-bar button implies. Export and Print do not exist at all.
          // All three are left undefined so the shell disables them with an explanation.
          onImportOwb={undefined}
          // Rule resolution stays OUT of the builder: this screen owns the rules data and the app's
          // rule sheet, so it maps a label to a slug here. An unresolvable label opens nothing rather
          // than an empty sheet.
          onShowInfo={(what) => {
            if (what.kind === 'item') return; // item text lives in the builder's own popover
            const label = what.name;
            const slug = what.kind === 'mount'
              ? (resolveOptionSlug(label, ruleIdx) ?? resolveRuleSlug(label, ruleIdx))
              : (resolveRuleSlug(label, ruleIdx) ?? resolveOptionSlug(label, ruleIdx));
            if (slug) openRule(slug);
          }}
        />
      );
    }
    return (
      <BuilderWorkspace
        list={active}
        name={active.name}
        onUpdate={updateActive}
        onSetName={setName}
        onBack={() => setActiveId(null)}
        army={activeCatalogue}
        armySlug={active.army}
        statsFor={statsFor}
        comps={compsByArmy[active.army] ?? meta?.comps ?? [active.army]}
        armyName={armyName(active.army)}
        compName={(c) => compName(c, active.army)}
        itemsData={activeItemsData ?? undefined}
        armyItemLists={meta?.items ?? []}
      />
    );
  }

  // ── My lists ──
  const UNGROUPED = '__ungrouped__'; // synthetic section id for the Ungrouped drop target
  const groupIds = new Set(groups.map((g) => g.id));
  // MANUAL order = the `lists` array order (drag to reorder; new lists prepend via createListWith).
  const listsInGroup = (gid: string) => lists.filter((l) => l.groupId === gid);
  // Ungrouped = no/null groupId OR a groupId that no longer maps to an existing group.
  const ungrouped = lists.filter((l) => !l.groupId || !groupIds.has(l.groupId));

  // One saved-list card. `sectionId` is the section it currently sits in (so a drop adopts that group).
  const renderCard = (l: SavedList, sectionId: string) => {
    const cat = catalogues[l.army] ?? null;
    const total = cat ? validate(l, getUnitFor(cat), itemsData ?? undefined).total : null;
    // Group this card currently lives in (null = Ungrouped) — a drop adopts this section's group.
    const cardGroup = sectionId === UNGROUPED ? null : sectionId;
    const dropLine = dragOverCard?.id === l.id ? dragOverCard.before : null; // true=top, false=bottom, null=none
    return (
      <div
        key={l.id}
        draggable
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', l.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const r = e.currentTarget.getBoundingClientRect();
          const before = e.clientY < r.top + r.height / 2;
          setDragOverCard({ id: l.id, before });
        }}
        onDragLeave={() => setDragOverCard((d) => (d?.id === l.id ? null : d))}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation(); // don't also fire the section's append-to-end drop
          const dragged = e.dataTransfer.getData('text/plain');
          const r = e.currentTarget.getBoundingClientRect();
          const before = e.clientY < r.top + r.height / 2;
          if (dragged && dragged !== l.id) reorderList(dragged, l.id, before, cardGroup);
          setDragOverCard(null);
        }}
        style={{ ...card, position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'grab' }}
      >
        {dropLine != null && <div style={{ position: 'absolute', left: 0, right: 0, [dropLine ? 'top' : 'bottom']: -1, height: 2, background: TOW.goldDeep, borderRadius: 2, pointerEvents: 'none' }} />}
        {/* Same anatomy as the roster's UnitRow: name on one line, a faint whisper beneath, and the
            number right-aligned in tabular figures so a column of lists lines up. */}
        <button onClick={() => setActiveId(l.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontFamily: towFont.serif, fontWeight: 400, fontSize: 15.5, lineHeight: 1.25, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
          <span style={{ fontFamily: towFont.serif, fontSize: 11, lineHeight: 1.3, color: TOW.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {armyName(l.army)} · {compName(l.composition, l.army)}
          </span>
        </button>
        <span style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {total ?? '…'}/{l.points}
        </span>
        <button onClick={() => duplicateList(l)} onMouseDown={(e) => e.stopPropagation()} aria-label="Duplicate" title="Duplicate" style={{ ...glyphBtn, fontSize: 14 }}>⧉</button>
        <button onClick={() => { if (confirm(`Delete “${l.name}”?`)) deleteList(l.id); }} onMouseDown={(e) => e.stopPropagation()} aria-label="Delete" title="Delete" style={{ ...glyphBtn, fontSize: 17 }}>×</button>
      </div>
    );
  };

  // A drop target wrapping a section's cards. `targetId` is the group id, or null for Ungrouped.
  const sectionId = (targetId: string | null) => targetId ?? UNGROUPED;
  const dropProps = (targetId: string | null) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(sectionId(targetId)); },
    onDragLeave: () => setDragOver((d) => (d === sectionId(targetId) ? null : d)),
    // Dropping on a section's empty area → move the dragged list to the END of that section.
    onDrop: (e: React.DragEvent) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) reorderList(id, null, false, targetId); setDragOver(null); setDragOverCard(null); },
  });

  // A collapsible section header: a chevron + title (+ count), with optional right-aligned actions.
  // No decorative folder icon — just the chevron, which also drives the collapse.
  const sectionHeader = (key: string, title: string, count: number | null, actions?: React.ReactNode) => {
    const isCol = collapsed.includes(key);
    return (
      // Mirrors the builder's SectionHeader: engraved label in Blood dark, then a hairline rule that
      // takes the slack, then the count on the right. The chevron stays — unlike the roster's sections
      // these collapse — but the rest of the anatomy is the same, so a folder here and a category there
      // read as the same kind of divider.
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0 5px' }}>
        <button onClick={() => toggleCollapse(key)} aria-expanded={!isCol} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={TOW.goldDeep} strokeWidth="2.8" style={{ flexShrink: 0, transform: isCol ? 'none' : 'rotate(90deg)', transition: 'transform .15s ease' }} aria-hidden="true"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, whiteSpace: 'nowrap' }}>{title}</span>
        </button>
        <span style={{ flex: 1, height: 1, background: TOW.line }} />
        {count != null && <span style={{ fontFamily: towFont.serif, fontSize: 10.5, color: TOW.faint, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{count}</span>}
        {actions}
      </div>
    );
  };

  const renderSection = (targetId: string | null, title: string, sectionLists: SavedList[], actions?: React.ReactNode) => {
    const key = sectionId(targetId);
    const hovered = dragOver === key;
    const isCol = collapsed.includes(key);
    return (
      <div
        key={key}
        {...dropProps(targetId)}
        style={{ border: `1px ${hovered ? 'dashed' : 'solid'} ${hovered ? TOW.goldDeep : 'transparent'}`, borderRadius: 12, background: hovered ? 'rgba(176,141,87,0.10)' : 'transparent', padding: hovered ? '5px 5px' : '0 6px', transition: 'background 120ms' }}
      >
        {sectionHeader(key, title, targetId === null ? null : sectionLists.length, actions)}
        {!isCol && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sectionLists.length === 0
              ? <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.faint, padding: '8px 4px' }}>Drop lists here</div>
              : sectionLists.map((l) => renderCard(l, key))}
          </div>
        )}
      </div>
    );
  };

  // Folder actions as quiet glyphs, not outlined buttons. Two bordered "Rename"/"Delete" pills sat in
  // every section header and out-shouted the folder name they belonged to — a divider should not be the
  // loudest thing between two lists.
  const groupActions = (g: { id: string; name: string }) => (
    <>
      <button onClick={() => renameGroup(g.id, g.name)} aria-label={`Rename folder ${g.name}`} title="Rename folder"
        style={{ ...glyphBtn, width: 28, height: 28, fontSize: 12 }}>✎</button>
      <button onClick={() => deleteGroup(g.id, g.name)} aria-label={`Delete folder ${g.name}`} title="Delete folder"
        style={{ ...glyphBtn, width: 28, height: 28, fontSize: 15 }}>×</button>
    </>
  );

  return (
    <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '14px 14px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 22, color: TOW.ink, margin: 0 }}>My lists</h1>
          <button onClick={addGroup} style={{ marginLeft: 'auto', fontFamily: towFont.display, fontWeight: 700, fontSize: 13, padding: '7px 13px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.ink }}>＋ New group</button>
          <button onClick={() => setSetupOpen(true)} style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 13, padding: '7px 14px', borderRadius: 9, cursor: 'pointer', border: 'none', background: goldGrad, color: TOW.onGrad }}>＋ New list</button>
        </div>
        {lists.length === 0 && groups.length === 0 ? (
          <p style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14, color: TOW.muted }}>No saved lists yet — tap “New list” to start building.</p>
        ) : groups.length === 0 ? (
          // No folders yet — keep the original flat look.
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {ungrouped.map((l) => renderCard(l, UNGROUPED))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {groups.map((g) => renderSection(g.id, g.name, listsInGroup(g.id), groupActions(g)))}
            {renderSection(null, 'Ungrouped', ungrouped)}
          </div>
        )}
        <p style={{ fontFamily: towFont.serif, fontSize: 11, color: TOW.faint, marginTop: 18, textAlign: 'center', lineHeight: 1.6 }}>
          Lists are saved on this device. Catalogue from <a href="https://github.com/nthiebes/old-world-builder" target="_blank" rel="noreferrer" className="underline">Old World Builder</a> (CC BY 4.0).
        </p>
      </div>
      {setupOpen && (
        <NewListSetup
          armies={armies}
          compsByArmy={compsByArmy}
          defaultArmy={armies.find((a) => a.slug === FALLBACK_ARMY)?.slug ?? armies[0]?.slug ?? FALLBACK_ARMY}
          defaultName={`New list ${lists.length + 1}`}
          onCancel={() => setSetupOpen(false)}
          onCreate={createListWith}
          itemsData={itemsData ?? undefined}
          itemListsByArmy={itemListsByArmy}
        />
      )}
    </div>
  );
}
