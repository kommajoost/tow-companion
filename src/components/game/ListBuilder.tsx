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

// PoC list-builder for ONE army (Dark Elves): pick composition + composition rule + points, add
// units with their options, and see the points total + composition validation live.
const ARMY_SLUG = 'dark-elves';
const COMP_NAMES: Record<string, string> = { 'dark-elves': 'Grand Army', 'de-renegade': 'Renegade Crowns' };
const CAT_LABEL: Record<Category, string> = { characters: 'Characters', core: 'Core', special: 'Special', rare: 'Rare', mercenaries: 'Mercenaries', allies: 'Allies' };
const POINT_PRESETS = [1000, 1500, 2000, 2500];

const DEFAULT: BuilderList = { composition: 'dark-elves', rule: 'open-war', points: 2000, entries: [] };
const uid = () => `e${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export function ListBuilder() {
  const [army, setArmy] = useState<OwbArmy | null>(null);
  const [comps, setComps] = useState<string[]>(['dark-elves']);
  const [list, setList] = usePersistentState<BuilderList>('tow:builder-de', DEFAULT);
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

  const getUnit = useMemo(() => (cat: Category, id: string): OwbUnit | undefined =>
    army?.[cat]?.find((u) => u.id === id), [army]);

  const v = useMemo(() => validate(list, getUnit), [list, getUnit]);

  const patch = (p: Partial<BuilderList>) => setList((l) => ({ ...l, ...p }));
  const addUnit = (cat: Category, u: OwbUnit) => {
    const entry: ListEntry = { uid: uid(), cat, unitId: u.id, count: Math.max(1, u.minimum ?? 1), opts: [] };
    setList((l) => ({ ...l, entries: [...l.entries, entry] }));
    setOpenEntry(entry.uid);
  };
  const updateEntry = (id: string, p: Partial<ListEntry>) => setList((l) => ({ ...l, entries: l.entries.map((e) => (e.uid === id ? { ...e, ...p } : e)) }));
  const removeEntry = (id: string) => setList((l) => ({ ...l, entries: l.entries.filter((e) => e.uid !== id) }));
  const toggleOpt = (id: string, key: string) => setList((l) => ({
    ...l,
    entries: l.entries.map((e) => (e.uid === id ? { ...e, opts: e.opts.includes(key) ? e.opts.filter((k) => k !== key) : [...e.opts, key] } : e)),
  }));

  const sel = { fontFamily: towFont.serif, fontSize: 14, color: TOW.ink, background: '#fffdf6', border: `1px solid ${TOW.lineStrong}`, borderRadius: 9, padding: '8px 10px', width: '100%', boxSizing: 'border-box' as const };
  const card: React.CSSProperties = { border: `1px solid ${TOW.line}`, borderRadius: 12, background: TOW.panel2 };
  const label = { ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 4, display: 'block' };

  if (!army) {
    return <div style={{ padding: 24, fontFamily: towFont.serif, color: TOW.muted }}>Loading the catalogue…</div>;
  }

  const overTarget = v.total > list.points;

  return (
    <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '14px 14px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <h1 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 22, color: TOW.ink, margin: 0 }}>Dark Elves</h1>
          <span style={{ ...eb, fontSize: 8, color: TOW.muted }}>list builder · beta</span>
        </div>

        {/* Setup */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '10px 0' }}>
          <div>
            <span style={label}>Army composition</span>
            <select value={list.composition} onChange={(e) => patch({ composition: e.target.value })} style={sel}>
              {comps.map((c) => <option key={c} value={c}>{COMP_NAMES[c] ?? c}</option>)}
            </select>
          </div>
          <div>
            <span style={label}>Composition rule</span>
            <select value={list.rule} onChange={(e) => patch({ rule: e.target.value })} style={sel}>
              {COMPOSITION_RULES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <span style={label}>Points</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="number" value={list.points} onChange={(e) => patch({ points: parseInt(e.target.value, 10) || 0 })} style={{ ...sel, width: 110 }} />
            {POINT_PRESETS.map((p) => (
              <button key={p} onClick={() => patch({ points: p })} style={{ fontFamily: towFont.serif, fontSize: 12.5, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${list.points === p ? TOW.goldDeep : TOW.line}`, background: list.points === p ? 'rgba(184,134,47,0.14)' : 'transparent', color: list.points === p ? TOW.goldDeep : TOW.muted }}>{p}</button>
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
          {/* category bars */}
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
              const single = max === 1 || (min <= 1 && max === 0 && (e.cat === 'characters'));
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
          Beta — points + composition % validation (Characters ≤50%, Core ≥25%, Special ≤50%, Rare ≤25%).
          Lords/Heroes split, exclusive options and per-unit caps not yet enforced. Catalogue from
          <a href="https://github.com/nthiebes/old-world-builder" target="_blank" rel="noreferrer" className="underline"> Old World Builder</a> (CC BY 4.0).
        </p>
      </div>
    </div>
  );
}

const stepBtn: React.CSSProperties = { width: 24, height: 24, borderRadius: 7, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.parchDim, fontFamily: towFont.display, fontWeight: 700, fontSize: 14, lineHeight: 1 };
