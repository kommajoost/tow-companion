import { useEffect, useMemo, useState } from 'react';
import { usePersistentState } from '../../store';
import { TOW, towFont, engraved } from '../../design/tow';
import { validate, type Category, type OwbArmy, type OwbUnit, type BuilderList } from '../../lib/owbBuilder';
import { BuilderWorkspace } from './BuilderWorkspace';
import { NewListSetup, type NewListValues } from './NewListSetup';

const BASE = import.meta.env.BASE_URL;
const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

// Army list builder for ONE army (Dark Elves PoC). This file owns the "My lists" collection
// (saved locally) + which list is open; the open list is edited in the responsive
// <BuilderWorkspace> (Claude Design's PC-columns / mobile-sheets builder on our OWB data).
const ARMY_SLUG = 'dark-elves';
const COMP_NAMES: Record<string, string> = { 'dark-elves': 'Grand Army', 'de-renegade': 'Renegade Crowns' };

interface SavedList extends BuilderList { id: string; name: string; army: string; createdAt: number; updatedAt: number }
const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

// OWB's normalizeRuleName (rules index is keyed by this) + a final-word singular fallback.
const normRule = (s: string) => (s || '').toLowerCase().replace(/ *\([^)]*\) */g, '').replace(/[{}[\]*]/g, '').replace(/^[0-9]x /g, '').replace(/[“”]/g, '"').trim();
interface StatRow { Name: string; M: string; WS: string; BS: string; S: string; T: string; W: string; I: string; A: string; Ld: string }
let statIndexCache: Record<string, { stats?: StatRow[] }> | null = null;

export function ListBuilder() {
  const [army, setArmy] = useState<OwbArmy | null>(null);
  const [comps, setComps] = useState<string[]>(['dark-elves']);
  const [statIdx, setStatIdx] = useState<Record<string, { stats?: StatRow[] }> | null>(statIndexCache);
  const [lists, setLists] = usePersistentState<SavedList[]>('tow:lists', []);
  const [activeId, setActiveId] = usePersistentState<string | null>('tow:builder-active', null);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    fetch(`${BASE}owb/${ARMY_SLUG}.json`).then((r) => r.json()).then(setArmy).catch(() => setArmy(null));
    fetch(`${BASE}owb/the-old-world.json`).then((r) => r.json()).then((m) => {
      const a = m.armies?.find((x: { id: string }) => x.id === ARMY_SLUG);
      if (a?.armyComposition?.length) setComps(a.armyComposition);
    }).catch(() => {});
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
        setLists([{ id, name: 'My list', army: ARMY_SLUG, composition: legacy.composition || 'dark-elves', rule: legacy.rule || 'open-war', points: legacy.points || 2000, entries: legacy.entries, createdAt: Date.now(), updatedAt: Date.now() }]);
        localStorage.removeItem('tow:builder-de');
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getUnit = useMemo(() => (cat: Category, id: string): OwbUnit | undefined => army?.[cat]?.find((u) => u.id === id), [army]);
  const statsFor = useMemo(() => (unitName: string): StatRow[] => {
    if (!statIdx) return [];
    const key = normRule(unitName);
    let e = statIdx[key];
    if (!e?.stats?.length) { const w = key.split(' '); const last = w[w.length - 1]; if (/s$/.test(last)) e = statIdx[[...w.slice(0, -1), last.replace(/s$/, '')].join(' ')]; }
    return e?.stats ?? [];
  }, [statIdx]);

  const active = lists.find((l) => l.id === activeId) || null;
  const updateActive = (p: Partial<BuilderList> | ((l: SavedList) => Partial<BuilderList>)) =>
    setLists((ls) => ls.map((l) => (l.id === activeId ? { ...l, ...(typeof p === 'function' ? p(l) : p), updatedAt: Date.now() } : l)));
  const setName = (name: string) => setLists((ls) => ls.map((l) => (l.id === activeId ? { ...l, name, updatedAt: Date.now() } : l)));

  const createListWith = (v: NewListValues) => {
    const id = newId('l');
    setLists((ls) => [{ id, name: v.name, army: ARMY_SLUG, composition: v.composition, rule: v.rule, points: v.points, entries: v.entries, createdAt: Date.now(), updatedAt: Date.now() }, ...ls]);
    setSetupOpen(false);
    setActiveId(id);
  };
  const duplicateList = (l: SavedList) => { const id = newId('l'); setLists((ls) => [{ ...l, id, name: `${l.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() }, ...ls]); };
  const deleteList = (id: string) => { setLists((ls) => ls.filter((l) => l.id !== id)); if (activeId === id) setActiveId(null); };

  const card: React.CSSProperties = { border: `1px solid ${TOW.line}`, borderRadius: 12, background: TOW.panel2 };

  if (!army) return <div style={{ padding: 24, fontFamily: towFont.serif, color: TOW.muted }}>Loading the catalogue…</div>;

  // ── open list → the responsive builder ──
  if (active) {
    return (
      <BuilderWorkspace
        list={active}
        name={active.name}
        onUpdate={updateActive}
        onSetName={setName}
        onBack={() => setActiveId(null)}
        army={army}
        statsFor={statsFor}
        comps={comps}
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
          <button onClick={() => setSetupOpen(true)} style={{ marginLeft: 'auto', fontFamily: towFont.display, fontWeight: 700, fontSize: 13, padding: '7px 14px', borderRadius: 9, cursor: 'pointer', border: 'none', background: goldGrad, color: '#2a1a0a' }}>＋ New list</button>
        </div>
        {sorted.length === 0 ? (
          <p style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14, color: TOW.muted }}>No saved lists yet — tap “New list” to start building.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map((l) => {
              const total = validate(l, getUnit).total;
              return (
                <div key={l.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px' }}>
                  <button onClick={() => setActiveId(l.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 15.5, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                    <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginTop: 3 }}>Dark Elves · {COMP_NAMES[l.composition] ?? l.composition} · {total}/{l.points} pts</div>
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
          comps={comps}
          compNames={COMP_NAMES}
          armyName="Dark Elves"
          defaultName={`New list ${lists.length + 1}`}
          catalogue={army}
          onCancel={() => setSetupOpen(false)}
          onCreate={createListWith}
        />
      )}
    </div>
  );
}
