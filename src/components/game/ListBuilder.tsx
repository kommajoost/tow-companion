import { useEffect, useMemo, useState } from 'react';
import { usePersistentState } from '../../store';
import { TOW, towFont, engraved } from '../../design/tow';
import {
  CATEGORIES, OPTION_GROUPS, COMPOSITION_RULES,
  entryPoints, validate,
  type Category, type OwbArmy, type OwbUnit, type OwbOption, type BuilderList, type ListEntry,
} from '../../lib/owbBuilder';

const BASE = import.meta.env.BASE_URL;
const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

// PoC list-builder for ONE army (Dark Elves). Multiple lists are saved locally (localStorage) so
// you can keep several and continue later; cross-device sync comes later.
const ARMY_SLUG = 'dark-elves';
const COMP_NAMES: Record<string, string> = { 'dark-elves': 'Grand Army', 'de-renegade': 'Renegade Crowns' };
const CAT_LABEL: Record<Category, string> = { characters: 'Characters', core: 'Core', special: 'Special', rare: 'Rare', mercenaries: 'Mercenaries', allies: 'Allies' };
const POINT_PRESETS = [1000, 1500, 2000, 2500];

/** A saved army list (a BuilderList plus identity + timestamps), stored in `tow:lists`. */
interface SavedList extends BuilderList { id: string; name: string; army: string; createdAt: number; updatedAt: number }

const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export function ListBuilder() {
  const [army, setArmy] = useState<OwbArmy | null>(null);
  const [comps, setComps] = useState<string[]>(['dark-elves']);
  const [lists, setLists] = usePersistentState<SavedList[]>('tow:lists', []);
  const [activeId, setActiveId] = usePersistentState<string | null>('tow:builder-active', null);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addCat, setAddCat] = useState<Category>('characters');

  useEffect(() => {
    fetch(`${BASE}owb/${ARMY_SLUG}.json`).then((r) => r.json()).then(setArmy).catch(() => setArmy(null));
    fetch(`${BASE}owb/the-old-world.json`).then((r) => r.json()).then((m) => {
      const a = m.armies?.find((x: { id: string }) => x.id === ARMY_SLUG);
      if (a?.armyComposition?.length) setComps(a.armyComposition);
    }).catch(() => {});
  }, []);

  // One-time migration: fold an earlier single saved list (`tow:builder-de`) into the new collection.
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
  const active = lists.find((l) => l.id === activeId) || null;

  const updateActive = (p: Partial<BuilderList> | ((l: SavedList) => Partial<BuilderList>)) =>
    setLists((ls) => ls.map((l) => (l.id === activeId ? { ...l, ...(typeof p === 'function' ? p(l) : p), updatedAt: Date.now() } : l)));
  const setName = (name: string) => setLists((ls) => ls.map((l) => (l.id === activeId ? { ...l, name, updatedAt: Date.now() } : l)));

  const createList = () => {
    const id = newId('l');
    setLists((ls) => [{ id, name: `New list ${ls.length + 1}`, army: ARMY_SLUG, composition: comps[0] || 'dark-elves', rule: 'open-war', points: 2000, entries: [], createdAt: Date.now(), updatedAt: Date.now() }, ...ls]);
    setActiveId(id);
    setAdding(true);
  };
  const duplicateList = (l: SavedList) => {
    const id = newId('l');
    setLists((ls) => [{ ...l, id, name: `${l.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() }, ...ls]);
  };
  const deleteList = (id: string) => {
    setLists((ls) => ls.filter((l) => l.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const sel = { fontFamily: towFont.serif, fontSize: 14, color: TOW.ink, background: '#fffdf6', border: `1px solid ${TOW.lineStrong}`, borderRadius: 9, padding: '8px 10px', width: '100%', boxSizing: 'border-box' as const };
  const card: React.CSSProperties = { border: `1px solid ${TOW.line}`, borderRadius: 12, background: TOW.panel2 };
  const label = { ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 4, display: 'block' };

  if (!army) return <div style={{ padding: 24, fontFamily: towFont.serif, color: TOW.muted }}>Loading the catalogue…</div>;

  // ─────────────── My lists screen ───────────────
  if (!active) {
    const sorted = [...lists].sort((a, b) => b.updatedAt - a.updatedAt);
    return (
      <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '14px 14px 48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <h1 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 22, color: TOW.ink, margin: 0 }}>My lists</h1>
            <button onClick={createList} style={{ marginLeft: 'auto', fontFamily: towFont.display, fontWeight: 700, fontSize: 13, padding: '7px 14px', borderRadius: 9, cursor: 'pointer', border: 'none', background: goldGrad, color: '#2a1a0a' }}>＋ New list</button>
          </div>
          {sorted.length === 0 ? (
            <p style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14, color: TOW.muted }}>No saved lists yet — tap “New list” to start building.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sorted.map((l) => {
                const total = validate(l, getUnit).total;
                return (
                  <div key={l.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px' }}>
                    <button onClick={() => { setActiveId(l.id); setAdding(l.entries.length === 0); }} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
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
      </div>
    );
  }

  // ─────────────── Builder for the active list ───────────────
  const list = active;
  const v = validate(list, getUnit);
  const overTarget = v.total > list.points;
  const addUnit = (cat: Category, u: OwbUnit) => {
    const entry: ListEntry = { uid: newId('e'), cat, unitId: u.id, count: Math.max(1, u.minimum ?? 1), opts: [] };
    updateActive((l) => ({ entries: [...l.entries, entry] }));
    setOpenEntry(entry.uid);
  };
  const updateEntry = (id: string, p: Partial<ListEntry>) => updateActive((l) => ({ entries: l.entries.map((e) => (e.uid === id ? { ...e, ...p } : e)) }));
  const removeEntry = (id: string) => updateActive((l) => ({ entries: l.entries.filter((e) => e.uid !== id) }));
  const toggleOpt = (id: string, key: string) => updateActive((l) => ({ entries: l.entries.map((e) => (e.uid === id ? { ...e, opts: e.opts.includes(key) ? e.opts.filter((k) => k !== key) : [...e.opts, key] } : e)) }));

  return (
    <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '12px 14px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <button onClick={() => setActiveId(null)} style={{ borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: towFont.serif, fontSize: 14, color: TOW.goldDeep, padding: '4px 4px 4px 0' }}>‹ Lists</button>
          <input value={list.name} onChange={(e) => setName(e.target.value)} aria-label="List name"
            style={{ flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 18, color: TOW.ink, background: 'transparent', border: 'none', borderBottom: `1px dashed ${TOW.line}`, padding: '2px 0' }} />
        </div>

        {/* Setup */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '6px 0' }}>
          <div>
            <span style={label}>Army composition</span>
            <select value={list.composition} onChange={(e) => updateActive({ composition: e.target.value })} style={sel}>
              {comps.map((c) => <option key={c} value={c}>{COMP_NAMES[c] ?? c}</option>)}
            </select>
          </div>
          <div>
            <span style={label}>Composition rule</span>
            <select value={list.rule} onChange={(e) => updateActive({ rule: e.target.value })} style={sel}>
              {COMPOSITION_RULES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <span style={label}>Points</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="number" value={list.points} onChange={(e) => updateActive({ points: parseInt(e.target.value, 10) || 0 })} style={{ ...sel, width: 110 }} />
            {POINT_PRESETS.map((p) => (
              <button key={p} onClick={() => updateActive({ points: p })} style={{ fontFamily: towFont.serif, fontSize: 12.5, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${list.points === p ? TOW.goldDeep : TOW.line}`, background: list.points === p ? 'rgba(184,134,47,0.14)' : 'transparent', color: list.points === p ? TOW.goldDeep : TOW.muted }}>{p}</button>
            ))}
          </div>
        </div>

        {/* Summary + validation */}
        <div style={{ ...card, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 22, color: overTarget ? TOW.blood : TOW.goldDeep }}>{v.total}</span>
            <span style={{ fontFamily: towFont.serif, fontSize: 14, color: TOW.parchDim }}>/ {list.points} pts</span>
            <span style={{ marginLeft: 'auto', ...eb, fontSize: 8.5, color: v.warnings.length ? TOW.blood : TOW.muted }}>{v.warnings.length ? `${v.warnings.length} to fix` : 'valid ✓'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {CATEGORIES.filter((c) => v.byCategory[c].points > 0 || v.byCategory[c].limit.minPercent != null).map((c) => {
              const t = v.byCategory[c];
              const denom = (t.cap ?? t.floor ?? list.points) || 1;
              const frac = Math.min(1, t.points / (denom || 1));
              const bad = t.over || t.under;
              const limTxt = t.limit.maxPercent != null ? `≤${t.limit.maxPercent}%` : t.limit.minPercent != null ? `≥${t.limit.minPercent}%` : '';
              return (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.parchDim, width: 92, flexShrink: 0 }}>{CAT_LABEL[c]}</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(74,55,22,0.10)', overflow: 'hidden' }}>
                    <div style={{ width: `${frac * 100}%`, height: '100%', background: bad ? TOW.blood : goldGrad }} />
                  </div>
                  <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: bad ? TOW.blood : TOW.muted, width: 96, flexShrink: 0, textAlign: 'right' }}>
                    {t.points} {limTxt && <span style={{ color: TOW.faint }}>({limTxt})</span>}
                  </span>
                </div>
              );
            })}
          </div>
          {v.warnings.length > 0 && (
            <ul style={{ margin: '10px 0 0', padding: '0 0 0 16px' }}>
              {v.warnings.map((w, i) => <li key={i} style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.blood, lineHeight: 1.5 }}>{w}</li>)}
            </ul>
          )}
        </div>

        {/* Your list */}
        {list.entries.length === 0 ? (
          <p style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14, color: TOW.muted, margin: '4px 0 12px' }}>No units yet — add some below.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {list.entries.map((e) => {
              const u = getUnit(e.cat, e.unitId);
              if (!u) return null;
              const isOpen = openEntry === e.uid;
              const min = u.minimum ?? 1; const max = u.maximum ?? 0;
              const pts = entryPoints(u, e);
              const single = max === 1 || (min <= 1 && max === 0 && e.cat === 'characters');
              return (
                <div key={e.uid} style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px' }}>
                    {!single && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => updateEntry(e.uid, { count: Math.max(1, e.count - 1) })} style={stepBtn}>–</button>
                        <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 14, color: TOW.ink, minWidth: 18, textAlign: 'center' }}>{e.count}</span>
                        <button onClick={() => updateEntry(e.uid, { count: e.count + 1 })} style={stepBtn}>+</button>
                      </div>
                    )}
                    <button onClick={() => setOpenEntry(isOpen ? null : e.uid)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 14.5, color: TOW.ink }}>{u.name_en}</span>
                      <span style={{ ...eb, fontSize: 8, color: TOW.muted, marginLeft: 8 }}>{CAT_LABEL[e.cat]}</span>
                    </button>
                    <span style={{ ...eb, fontSize: 9, color: TOW.goldDeep, whiteSpace: 'nowrap' }}>{pts} pts</span>
                    <button onClick={() => removeEntry(e.uid)} aria-label="Remove" style={{ border: 'none', background: 'none', cursor: 'pointer', color: TOW.muted, fontSize: 18, lineHeight: 1, padding: '0 2px' }}>×</button>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '0 11px 11px', borderTop: `1px solid ${TOW.line}` }}>
                      {OPTION_GROUPS.map(({ key, label: glabel }) => {
                        const items = (Array.isArray(u[key]) ? (u[key] as OwbOption[]) : []).filter((o) => o.name_en);
                        if (!items.length) return null;
                        return (
                          <div key={key} style={{ marginTop: 8 }}>
                            <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>{glabel}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {items.map((o, i) => {
                                const k = `${key}/${i}`;
                                const on = e.opts.includes(k);
                                return (
                                  <button key={i} onClick={() => toggleOpt(e.uid, k)} style={{ fontFamily: towFont.serif, fontSize: 12, padding: '3px 9px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'rgba(184,134,47,0.14)' : 'transparent', color: on ? TOW.goldDeep : TOW.parchDim }}>
                                    {on ? '✓ ' : ''}{o.name_en}{o.points ? ` (${o.points})` : ''}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add units */}
        <button onClick={() => setAdding((a) => !a)} style={{ width: '100%', ...card, cursor: 'pointer', padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: adding ? 8 : 0 }}>
          <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 14, color: TOW.goldDeep }}>＋ Add units</span>
          <span style={{ marginLeft: 'auto', color: TOW.faint, transform: adding ? 'rotate(90deg)' : 'none' }}>›</span>
        </button>
        {adding && (
          <div style={{ ...card, padding: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {CATEGORIES.filter((c) => (army[c] ?? []).length).map((c) => {
                const on = c === addCat;
                return (
                  <button key={c} onClick={() => setAddCat(c)} style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', border: 'none', background: on ? goldGrad : 'transparent', color: on ? '#2a1a0a' : TOW.muted }}>{CAT_LABEL[c]}</button>
                );
              })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(army[addCat] ?? []).map((u) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${TOW.line}`, borderRadius: 9, padding: '7px 10px', background: 'rgba(255,253,246,0.4)' }}>
                  <span style={{ flex: 1, minWidth: 0, fontFamily: towFont.serif, fontSize: 13.5, color: TOW.ink }}>{u.name_en}</span>
                  <span style={{ ...eb, fontSize: 8, color: TOW.muted, whiteSpace: 'nowrap' }}>{u.points} pts</span>
                  <button onClick={() => addUnit(addCat, u)} style={{ flexShrink: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 13, padding: '5px 12px', borderRadius: 8, cursor: 'pointer', border: 'none', background: goldGrad, color: '#2a1a0a' }}>Add</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p style={{ fontFamily: towFont.serif, fontSize: 11, color: TOW.faint, marginTop: 18, textAlign: 'center', lineHeight: 1.6 }}>
          Beta — points + composition % validation. Saved on this device. Lords/Heroes split, exclusive
          options and per-unit caps not yet enforced. Catalogue from
          <a href="https://github.com/nthiebes/old-world-builder" target="_blank" rel="noreferrer" className="underline"> Old World Builder</a> (CC BY 4.0).
        </p>
      </div>
    </div>
  );
}

const stepBtn: React.CSSProperties = { width: 24, height: 24, borderRadius: 7, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.parchDim, fontFamily: towFont.display, fontWeight: 700, fontSize: 14, lineHeight: 1 };
