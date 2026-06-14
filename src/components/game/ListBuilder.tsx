import { useEffect, useMemo, useState } from 'react';
import { usePersistentState } from '../../store';
import { TOW, towFont, engraved } from '../../design/tow';
import { validate, type Category, type OwbArmy, type OwbUnit, type BuilderList, type MagicItemsData } from '../../lib/owbBuilder';
import { compName } from '../../lib/armies';
import { BuilderWorkspace } from './BuilderWorkspace';
import { NewListSetup, type NewListValues } from './NewListSetup';

const BASE = import.meta.env.BASE_URL;
const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

// Multi-army list builder. This file owns the army registry (index.json), each army's composition +
// item-list metadata (the-old-world.json), an on-demand per-army catalogue cache, and the "My lists"
// collection (saved locally). The open list is edited in the responsive <BuilderWorkspace> (Claude
// Design's PC-columns / mobile-sheets builder on our OWB data); each list carries its own army.
const FALLBACK_ARMY = 'dark-elves';

interface SavedList extends BuilderList { id: string; name: string; army: string; createdAt: number; updatedAt: number }
const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

// OWB's normalizeRuleName (rules index is keyed by this) + a final-word singular fallback.
const normRule = (s: string) => (s || '').toLowerCase().replace(/ *\([^)]*\) */g, '').replace(/[{}[\]*]/g, '').replace(/^[0-9]x /g, '').replace(/[“”]/g, '"').trim();
interface StatRow { Name: string; M: string; WS: string; BS: string; S: string; T: string; W: string; I: string; A: string; Ld: string }
let statIndexCache: Record<string, { stats?: StatRow[] }> | null = null;

// Per-army metadata from the-old-world.json: which compositions it offers + which magic-item lists.
interface ArmyMeta { comps: string[]; items: string[] }

export function ListBuilder() {
  const [armies, setArmies] = useState<{ slug: string; name: string }[]>([]);
  const [metaByArmy, setMetaByArmy] = useState<Record<string, ArmyMeta>>({});
  const [catalogues, setCatalogues] = useState<Record<string, OwbArmy>>({}); // slug → catalogue (on demand)
  const [itemsData, setItemsData] = useState<MagicItemsData | null>(null);
  const [statIdx, setStatIdx] = useState<Record<string, { stats?: StatRow[] }> | null>(statIndexCache);
  const [lists, setLists] = usePersistentState<SavedList[]>('tow:lists', []);
  const [activeId, setActiveId] = usePersistentState<string | null>('tow:builder-active', null);
  const [setupOpen, setSetupOpen] = useState(false);

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

  const activeCatalogue = activeArmySlug ? catalogues[activeArmySlug] ?? null : null;
  const getUnitFor = (cat: OwbArmy | null) => (c: Category, id: string): OwbUnit | undefined => cat?.[c]?.find((u) => u.id === id);
  const compsByArmy = useMemo(() => Object.fromEntries(Object.entries(metaByArmy).map(([k, v]) => [k, v.comps])), [metaByArmy]);
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
    setLists((ls) => [{ id, name: v.name, army: v.army, composition: v.composition, rule: v.rule, points: v.points, entries: v.entries, createdAt: Date.now(), updatedAt: Date.now() }, ...ls]);
    setSetupOpen(false);
    setActiveId(id);
  };
  const duplicateList = (l: SavedList) => { const id = newId('l'); setLists((ls) => [{ ...l, id, name: `${l.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() }, ...ls]); };
  const deleteList = (id: string) => { setLists((ls) => ls.filter((l) => l.id !== id)); if (activeId === id) setActiveId(null); };

  const card: React.CSSProperties = { border: `1px solid ${TOW.line}`, borderRadius: 12, background: TOW.panel2 };

  // ── open list → the responsive builder (wait for that army's catalogue to load) ──
  if (active) {
    if (!activeCatalogue) return <div style={{ padding: 24, fontFamily: towFont.serif, color: TOW.muted }}>Loading the catalogue…</div>;
    const meta = metaByArmy[active.army];
    return (
      <BuilderWorkspace
        list={active}
        name={active.name}
        onUpdate={updateActive}
        onSetName={setName}
        onBack={() => setActiveId(null)}
        army={activeCatalogue}
        statsFor={statsFor}
        comps={meta?.comps ?? compsByArmy[active.army] ?? [active.army]}
        armyName={armyName(active.army)}
        compName={(c) => compName(c, active.army)}
        itemsData={itemsData ?? undefined}
        armyItemLists={meta?.items ?? []}
      />
    );
  }

  // ── My lists ──
  const sorted = [...lists].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '14px 14px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h1 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 22, color: TOW.ink, margin: 0 }}>My lists</h1>
          <button onClick={() => setSetupOpen(true)} style={{ marginLeft: 'auto', fontFamily: towFont.display, fontWeight: 700, fontSize: 13, padding: '7px 14px', borderRadius: 9, cursor: 'pointer', border: 'none', background: goldGrad, color: TOW.onGrad }}>＋ New list</button>
        </div>
        {sorted.length === 0 ? (
          <p style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14, color: TOW.muted }}>No saved lists yet — tap “New list” to start building.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map((l) => {
              const cat = catalogues[l.army] ?? null;
              const total = cat ? validate(l, getUnitFor(cat), itemsData ?? undefined).total : null;
              return (
                <div key={l.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px' }}>
                  <button onClick={() => setActiveId(l.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 15.5, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                    <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginTop: 3 }}>{armyName(l.army)} · {compName(l.composition, l.army)} · {total ?? '…'}/{l.points} pts</div>
                  </button>
                  <button onClick={() => duplicateList(l)} aria-label="Duplicate" title="Duplicate" style={{ border: `1px solid ${TOW.line}`, background: 'transparent', borderRadius: 8, cursor: 'pointer', color: TOW.muted, fontSize: 13, padding: '5px 8px' }}>⧉</button>
                  <button onClick={() => { if (confirm(`Delete “${l.name}”?`)) deleteList(l.id); }} aria-label="Delete" title="Delete" style={{ border: `1px solid ${TOW.line}`, background: 'transparent', borderRadius: 8, cursor: 'pointer', color: TOW.muted, fontSize: 16, lineHeight: 1, padding: '4px 9px' }}>×</button>
                </div>
              );
            })}
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
        />
      )}
    </div>
  );
}
