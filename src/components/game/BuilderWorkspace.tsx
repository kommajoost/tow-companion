import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../data';
import { useUI } from '../../state';
import { TOW, towFont, engraved } from '../../design/tow';
import { getRuleIndex, resolveRuleSlug, resolveOptionSlug } from '../../lib/armyRules';
import {
  CATEGORIES, COMPOSITION_RULES, validate, entryPoints, unitBlocks, radioSelected, summaryLabels,
  type Category, type OwbArmy, type OwbUnit, type BuilderList, type ListEntry, type Validation,
} from '../../lib/owbBuilder';

// Responsive Army Builder workspace (Claude Design "Army Builder" PC + mobile, ported onto our
// real OWB data). Wide screens get a three-column builder (catalogue · muster · unit detail);
// phones get the header + roster + add-bar + bottom-sheet flow. Option rows carry an "eye" that
// opens the rule in our pop-up. Magic-items / layered character sections are a later step.

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;
const fmt = (n: number) => n.toLocaleString('en-US');
const cleanLabel = (s: string) => (s || '').replace(/\{[^}]*\}/g, ' ').replace(/\*/g, '').replace(/\s+/g, ' ').trim();

const CAT_LABEL: Record<Category, string> = { characters: 'Characters', core: 'Core', special: 'Special', rare: 'Rare', mercenaries: 'Mercenaries', allies: 'Allies' };
const COMP_NAMES: Record<string, string> = { 'dark-elves': 'Grand Army', 'de-renegade': 'Renegade Crowns' };
const POINT_PRESETS = [1000, 1500, 2000, 2500];
const STAT_COLS = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld'] as const;
type StatRow = { Name: string } & Record<(typeof STAT_COLS)[number], string>;

const newUid = () => 'e' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

// ─────────────────────────── shared atoms ───────────────────────────
function Stepper({ value, min, max, onChange, sm }: { value: number; min: number; max: number; onChange: (v: number) => void; sm?: boolean }) {
  const d = sm ? 26 : 30;
  const btn = (off: boolean): React.CSSProperties => ({ width: d, height: d, flexShrink: 0, borderRadius: 8, cursor: off ? 'default' : 'pointer', border: `1px solid ${TOW.lineStrong}`, background: off ? 'transparent' : TOW.cardLt, color: off ? TOW.faint : TOW.parchDim, fontFamily: towFont.display, fontWeight: 700, fontSize: sm ? 15 : 17, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <button disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Fewer" style={btn(value <= min)}>–</button>
      <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: sm ? 14 : 16, color: TOW.ink, minWidth: 22, textAlign: 'center' }}>{value}</span>
      <button disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="More" style={btn(value >= max)}>+</button>
    </div>
  );
}

function MiniProfile({ rows }: { rows: StatRow[] }) {
  if (!rows.length) return null;
  const multi = rows.length > 1;
  const th: React.CSSProperties = { ...eb, fontSize: 7.5, color: TOW.gold, padding: '3px 0 2px', background: 'rgba(138,108,48,0.09)', borderBottom: `1px solid ${TOW.line}`, textAlign: 'center' };
  const td = (v: string): React.CSSProperties => ({ fontFamily: towFont.display, fontWeight: 700, fontSize: 12, color: v === '0' || v === '-' ? TOW.faint : TOW.ink, padding: '4px 0', textAlign: 'center' });
  return (
    <div className="no-scrollbar" style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: multi ? 300 : 0, border: `1px solid ${TOW.line}`, borderRadius: 7, background: TOW.cardLt, tableLayout: 'fixed' }}>
        <thead><tr>
          {multi && <th style={{ ...th, width: 78, textAlign: 'left', paddingLeft: 6 }}>Model</th>}
          {STAT_COLS.map((k) => <th key={k} style={th}>{k}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} style={{ borderTop: ri ? `1px solid ${TOW.line}` : 'none' }}>
              {multi && <td style={{ fontFamily: towFont.serif, fontSize: 11, color: TOW.parchDim, padding: '4px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.Name}</td>}
              {STAT_COLS.map((k) => <td key={k} style={td(r[k] ?? '-')}>{(r[k] ?? '-') === '0' ? '–' : r[k] ?? '–'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompBar({ c, compact }: { c: ComplianceRow; compact?: boolean }) {
  const denom = c.kind === 'min' ? Math.max(c.limit, c.value, 1) : Math.max(c.limit, 1);
  const pct = Math.min(100, (c.value / denom) * 100);
  return (
    <div style={{ marginBottom: compact ? 7 : 9 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: towFont.serif, fontSize: compact ? 11.5 : 12.5, color: c.ok ? TOW.parchDim : TOW.blood }}>{c.label}</span>
        <span style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: compact ? 10 : 11, color: c.ok ? TOW.muted : TOW.blood }}>
          {fmt(c.value)} <span style={{ color: TOW.faint }}>{c.kind === 'min' ? '≥' : '≤'} {fmt(c.limit)}</span>
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'rgba(74,55,22,0.12)', overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', borderRadius: 99, background: c.ok ? goldGrad : TOW.blood, transition: 'width .25s ease' }} />
      </div>
    </div>
  );
}

const Eye = ({ onClick }: { onClick: () => void }) => (
  <button onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label="Rule" title="Show rule" style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 7, border: `1px solid ${TOW.line}`, background: 'transparent', cursor: 'pointer', color: TOW.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="2.6" /></svg>
  </button>
);

interface ComplianceRow { cat: Category; label: string; kind: 'min' | 'max'; value: number; limit: number; ok: boolean }
function complianceRows(v: Validation): ComplianceRow[] {
  const out: ComplianceRow[] = [];
  for (const c of CATEGORIES) {
    const t = v.byCategory[c];
    const hasLimit = t.limit.minPercent != null || t.limit.maxPercent != null;
    if (!hasLimit) continue;
    const primary = c === 'characters' || c === 'core' || c === 'special' || c === 'rare';
    if (!primary && t.points === 0) continue;
    out.push({ cat: c, label: CAT_LABEL[c], kind: t.limit.minPercent != null ? 'min' : 'max', value: t.points, limit: t.floor ?? t.cap ?? 0, ok: !(t.over || t.under) });
  }
  return out;
}

export function BuilderWorkspace({ list, name, onUpdate, onSetName, onBack, army, statsFor, comps }: {
  list: BuilderList; name: string;
  onUpdate: (fn: (l: BuilderList) => Partial<BuilderList>) => void;
  onSetName: (n: string) => void;
  onBack: () => void;
  army: OwbArmy;
  statsFor: (name: string) => StatRow[];
  comps: string[];
}) {
  const { rules } = useData();
  const { openRule } = useUI();
  const ruleIdx = useMemo(() => getRuleIndex(rules), [rules]);
  const getUnit = (cat: Category, id: string): OwbUnit | undefined => army[cat]?.find((u) => u.id === id);

  const v = useMemo(() => validate(list, getUnit), [list, army]); // eslint-disable-line react-hooks/exhaustive-deps
  const comp = useMemo(() => complianceRows(v), [v]);
  const compByCat: Partial<Record<Category, ComplianceRow>> = {};
  comp.forEach((c) => { compByCat[c.cat] = c; });
  const overBudget = v.total > list.points;

  const rootRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1024);
  useLayoutEffect(() => {
    const el = rootRef.current; if (!el) return;
    const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
    ro.observe(el); setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  const wide = w >= 860;

  const [selUid, setSelUid] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'pick' | { edit: string } | null>(null);
  const [tab, setTab] = useState<Category>('characters');
  const [q, setQ] = useState('');
  const [settings, setSettings] = useState(false);
  const [info, setInfo] = useState<{ title: string; rows: StatRow[] } | null>(null); // mount/unit profile popup

  // ── entry operations ──
  const add = (cat: Category, u: OwbUnit) => {
    const uid = newUid();
    onUpdate((l) => ({ entries: [...l.entries, { uid, cat, unitId: u.id, count: Math.max(1, u.minimum ?? 1), opts: [] }] }));
    return uid;
  };
  const removeE = (uid: string) => { onUpdate((l) => ({ entries: l.entries.filter((e) => e.uid !== uid) })); if (selUid === uid) setSelUid(null); };
  const setCount = (uid: string, c: number) => onUpdate((l) => ({ entries: l.entries.map((e) => {
    if (e.uid !== uid) return e; const u = getUnit(e.cat, e.unitId); const min = u?.minimum ?? 1; const max = (u?.maximum ?? 0) === 0 ? 9999 : (u?.maximum ?? 1);
    return { ...e, count: Math.max(min, Math.min(max, c)) };
  }) }));
  const toggleOpt = (uid: string, key: string) => onUpdate((l) => ({ entries: l.entries.map((e) => (e.uid !== uid ? e : { ...e, opts: e.opts.includes(key) ? e.opts.filter((k) => k !== key) : [...e.opts, key] })) }));
  const setRadio = (uid: string, group: string, i: number) => onUpdate((l) => ({ entries: l.entries.map((e) => {
    if (e.uid !== uid) return e; const kept = e.opts.filter((k) => !k.startsWith(group + '/')); return { ...e, opts: [...kept, `${group}/${i}`] };
  }) }));
  const dup = (uid: string) => {
    const id = newUid();
    onUpdate((l) => { const src = l.entries.find((e) => e.uid === uid); if (!src) return {}; const i = l.entries.findIndex((e) => e.uid === uid); const copy: ListEntry = { ...src, uid: id, opts: [...src.opts] }; return { entries: [...l.entries.slice(0, i + 1), copy, ...l.entries.slice(i + 1)] }; });
    return id;
  };

  const openOptionRule = (label: string) => { const s = resolveOptionSlug(cleanLabel(label), ruleIdx); if (s) openRule(s); };
  const openRuleByName = (label: string) => { const s = resolveRuleSlug(cleanLabel(label), ruleIdx); if (s) openRule(s); };

  const needle = q.trim().toLowerCase();
  const catalogUnits = needle ? CATEGORIES.flatMap((c) => (army[c] ?? [])).filter((u) => u.name_en.toLowerCase().includes(needle)) : (army[tab] ?? []);
  const countInList = (id: string) => list.entries.filter((e) => e.unitId === id).length;
  const grouped = CATEGORIES.map((c) => ({ c, items: list.entries.filter((e) => e.cat === c) })).filter((g) => g.items.length);

  // ── shared sub-renders ──
  const rules_ = (rs: string[]) => rs.length === 0 ? null : (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {rs.map((r, i) => {
        const slug = resolveRuleSlug(cleanLabel(r), ruleIdx);
        return slug
          ? <button key={i} onClick={() => openRuleByName(r)} style={{ fontFamily: towFont.serif, fontSize: 11.5, padding: '2px 9px', borderRadius: 99, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(138,108,48,0.10)', color: TOW.goldDeep, cursor: 'pointer' }}>{r}</button>
          : <span key={i} style={{ fontFamily: towFont.serif, fontSize: 11.5, padding: '2px 9px', borderRadius: 99, border: `1px solid ${TOW.line}`, background: 'rgba(138,108,48,0.06)', color: TOW.muted }}>{r}</span>;
      })}
    </div>
  );

  const optionEditor = (entry: ListEntry, u: OwbUnit) => {
    const blocks = unitBlocks(u);
    if (!blocks.length) return <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 13, color: TOW.muted }}>No upgrades for this unit.</div>;
    return blocks.map((b) => {
      const radioKey = b.radio ? radioSelected(u, entry, b.key) : '';
      return (
        <div key={String(b.key)} style={{ marginBottom: 12 }}>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 7 }}>{b.label}</div>
          {b.items.map(({ i, opt }) => {
            const key = `${String(b.key)}/${i}`;
            const on = b.radio ? radioKey === key : entry.opts.includes(key);
            const cost = opt.points ? `+${opt.points}${opt.perModel ? '/model' : ''}` : 'free';
            const hasRule = !!resolveOptionSlug(cleanLabel(opt.name_en), ruleIdx);
            const profileRows = hasRule ? [] : statsFor(opt.name_en); // mounts/units → show their profile
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <button onClick={() => (b.radio ? setRadio(entry.uid, String(b.key), i) : toggleOpt(entry.uid, key))}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'rgba(138,108,48,0.10)' : TOW.cardLt }}>
                  <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: b.radio ? 99 : 5, border: `1.5px solid ${on ? TOW.goldDeep : TOW.lineStrong}`, background: on ? TOW.goldDeep : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {on && <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2.5 6.4l2.2 2.2 4.8-5" stroke="#f4eedb" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </span>
                  <span style={{ flex: 1, fontFamily: towFont.serif, fontSize: 13.5, color: TOW.ink }}>{opt.name_en}</span>
                  <span style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 11, color: opt.points ? TOW.gold : TOW.faint }}>{cost}</span>
                </button>
                {(hasRule || profileRows.length > 0) && <Eye onClick={() => (hasRule ? openOptionRule(opt.name_en) : setInfo({ title: cleanLabel(opt.name_en), rows: profileRows }))} />}
              </div>
            );
          })}
        </div>
      );
    });
  };

  const rosterRow = (e: ListEntry, u: OwbUnit, selected: boolean, onClick: () => void) => {
    const sum = summaryLabels(u, e);
    const multi = (u.maximum ?? 1) !== 1 || (u.minimum ?? 1) > 1;
    return (
      <div key={e.uid} onClick={onClick} style={{ cursor: 'pointer', padding: '11px 13px', borderRadius: 11, marginBottom: 7, border: `1px solid ${selected ? TOW.goldDeep : TOW.line}`, background: selected ? TOW.cardLt : TOW.cardLt, boxShadow: selected ? '0 2px 12px rgba(122,93,36,0.14)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ flex: 1, fontFamily: towFont.display, fontWeight: 600, fontSize: 15, color: TOW.ink }}>
            {multi ? <span style={{ color: TOW.gold }}>{e.count}× </span> : null}{u.name_en}
          </span>
          <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 13, color: TOW.parchDim }}>{fmt(entryPoints(u, e))}</span>
        </div>
        {sum.length > 0
          ? <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted, marginTop: 3, lineHeight: 1.4 }}>{sum.join(' · ')}</div>
          : <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 12, color: TOW.faint, marginTop: 3 }}>Tap to equip</div>}
      </div>
    );
  };

  const picker = (onPick: (u: OwbUnit, cat: Category) => void, withSearch: boolean) => (
    <div>
      <div style={{ position: 'sticky', top: 0, background: TOW.panel, paddingBottom: 10, zIndex: 1 }}>
        {withSearch && (
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search units…" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 14, color: TOW.ink, outline: 'none', marginBottom: 10 }} />
        )}
        {!needle && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {CATEGORIES.filter((c) => (army[c] ?? []).length).map((c) => {
              const on = tab === c;
              return <button key={c} onClick={() => setTab(c)} style={{ flex: 1, minWidth: 60, padding: '7px 2px', borderRadius: 8, border: 'none', cursor: 'pointer', ...eb, fontSize: 7.5, background: on ? 'rgba(138,108,48,0.16)' : 'rgba(74,55,22,0.05)', color: on ? TOW.gold : TOW.muted }}>{CAT_LABEL[c]}</button>;
            })}
          </div>
        )}
      </div>
      {needle && <div style={{ ...eb, fontSize: 8, color: TOW.muted, margin: '0 2px 8px' }}>{catalogUnits.length} result{catalogUnits.length === 1 ? '' : 's'}</div>}
      {catalogUnits.map((u) => {
        const cat = (CATEGORIES.find((c) => (army[c] ?? []).includes(u)) ?? tab) as Category;
        const n = countInList(u.id);
        return (
          <button key={u.id} onClick={() => onPick(u, cat)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px', borderRadius: 11, marginBottom: 7, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 14.5, color: TOW.ink }}>{u.name_en}</span>
                {n > 0 && <span style={{ ...eb, fontSize: 7, color: TOW.gold, background: 'rgba(138,108,48,0.16)', borderRadius: 99, padding: '2px 6px' }}>{n}</span>}
              </div>
              <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, marginTop: 1 }}>{(u.maximum ?? 1) !== 1 ? `${u.points} pts/model` : `${u.points} pts`}</div>
            </div>
            <span style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 8, background: goldGrad, color: '#241803', fontFamily: towFont.display, fontWeight: 700, fontSize: 11, letterSpacing: '0.06em' }}>ADD</span>
          </button>
        );
      })}
    </div>
  );

  const ruleName = COMPOSITION_RULES.find((r) => r.id === list.rule)?.name ?? list.rule;
  const headerMeta = `${COMP_NAMES[list.composition] ?? list.composition} · ${ruleName} · Dark Elves`;

  // ════════════════════ WIDE — three columns ════════════════════
  if (wide) {
    const selEntry = list.entries.find((e) => e.uid === selUid) || null;
    const selUnit = selEntry ? getUnit(selEntry.cat, selEntry.unitId) : null;
    return (
      <div ref={rootRef} style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: TOW.panel, color: TOW.ink, fontFamily: towFont.serif }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '11px 18px', borderBottom: `1px solid ${TOW.lineStrong}`, background: TOW.panel2 }}>
          <button onClick={onBack} aria-label="Back" style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontSize: 18, color: TOW.inkDim }}>‹</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 20, color: TOW.ink, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
            <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginTop: 3 }}>{headerMeta} · {fmt(list.points)} pts</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 24, color: overBudget ? TOW.blood : TOW.ink, lineHeight: 1 }}>{fmt(v.total)}<span style={{ fontSize: 14, color: TOW.muted, fontWeight: 600 }}> / {fmt(list.points)}</span></div>
            <div style={{ ...eb, fontSize: 8, color: v.warnings.length ? TOW.blood : '#4f6b3a', marginTop: 4 }}>{v.warnings.length ? `${v.warnings.length} to fix` : '✓ Legal list'}</div>
          </div>
          <button onClick={() => setSettings((s) => !s)} aria-label="List settings" style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 9, cursor: 'pointer', border: `1px solid ${settings ? TOW.goldDeep : TOW.lineStrong}`, background: settings ? 'rgba(138,108,48,0.12)' : TOW.cardLt, color: TOW.inkDim, fontSize: 16 }}>⚙</button>
        </div>

        {settings && (
          <>
            <div onClick={() => setSettings(false)} style={{ position: 'absolute', inset: 0, zIndex: 40 }} />
            <div style={{ position: 'absolute', top: 60, right: 16, zIndex: 41, width: 300, background: TOW.panel, borderRadius: 14, border: `1px solid ${TOW.lineStrong}`, boxShadow: '0 14px 40px rgba(40,24,8,0.26)', padding: 16 }}>
              <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 6 }}>List name</div>
              <input value={name} onChange={(e) => onSetName(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 15, color: TOW.ink, outline: 'none' }} />
              <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, margin: '16px 0 7px' }}>Points limit</div>
              <div style={{ display: 'flex', gap: 5 }}>
                {POINT_PRESETS.map((t) => { const on = list.points === t; return <button key={t} onClick={() => onUpdate(() => ({ points: t }))} style={{ flex: 1, padding: '9px 2px', borderRadius: 8, border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5, background: on ? 'rgba(138,108,48,0.14)' : TOW.cardLt, color: on ? TOW.gold : TOW.muted }}>{t}</button>; })}
              </div>
              <input type="number" inputMode="numeric" min={0} step={50} value={list.points} onChange={(e) => onUpdate(() => ({ points: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} aria-label="Custom points" style={{ width: '100%', boxSizing: 'border-box', marginTop: 7, padding: '9px 11px', borderRadius: 9, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 14, color: TOW.ink, outline: 'none' }} />
              <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, margin: '16px 0 7px' }}>Composition</div>
              <select value={list.composition} onChange={(e) => onUpdate(() => ({ composition: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: `1px solid ${TOW.line}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 14, color: TOW.ink }}>
                {comps.map((c) => <option key={c} value={c}>{COMP_NAMES[c] ?? c}</option>)}
              </select>
              <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, margin: '14px 0 7px' }}>Composition rule</div>
              <select value={list.rule} onChange={(e) => onUpdate(() => ({ rule: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: `1px solid ${TOW.line}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 14, color: TOW.ink }}>
                {COMPOSITION_RULES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </>
        )}

        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '300px 1fr 340px' }}>
          {/* catalogue */}
          <div style={{ borderRight: `1px solid ${TOW.line}`, display: 'flex', flexDirection: 'column', minHeight: 0, background: TOW.panel }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 12px 16px' }}>
              {picker((u, cat) => { const id = add(cat, u); setSelUid(id); }, true)}
            </div>
          </div>
          {/* muster */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'rgba(255,255,255,0.18)' }}>
            <div style={{ flexShrink: 0, padding: '13px 22px 12px', borderBottom: `1px solid ${TOW.line}`, background: TOW.panel }}>
              <div style={{ ...eb, fontSize: 9, color: TOW.gold, marginBottom: 9 }}>Composition · {list.entries.length} unit{list.entries.length === 1 ? '' : 's'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>{comp.map((c) => <CompBar key={c.cat} c={c} compact />)}</div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 22px 30px' }}>
              {list.entries.length === 0 && <div style={{ textAlign: 'center', padding: '70px 20px', fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 15, color: TOW.muted }}>Add units from the left to begin your muster.</div>}
              {grouped.map((g) => (
                <div key={g.c} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 2px 8px' }}>
                    <span style={{ ...eb, fontSize: 9, color: TOW.gold }}>{CAT_LABEL[g.c]}</span>
                    {compByCat[g.c] && <span style={{ ...eb, fontSize: 8.5, color: compByCat[g.c]!.ok ? TOW.muted : TOW.blood }}>{fmt(compByCat[g.c]!.value)} <span style={{ color: TOW.faint }}>{compByCat[g.c]!.kind === 'min' ? '≥' : '≤'} {fmt(compByCat[g.c]!.limit)}</span></span>}
                  </div>
                  {g.items.map((e) => { const u = getUnit(e.cat, e.unitId); return u ? rosterRow(e, u, e.uid === selUid, () => setSelUid(e.uid)) : null; })}
                </div>
              ))}
            </div>
          </div>
          {/* detail */}
          <div style={{ borderLeft: `1px solid ${TOW.line}`, display: 'flex', flexDirection: 'column', minHeight: 0, background: TOW.panel2 }}>
            {!selUnit || !selEntry ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30, textAlign: 'center', fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14, color: TOW.muted }}>Select a unit to equip it.</div>
            ) : (
              <>
                <div style={{ flexShrink: 0, padding: '14px 16px 12px', borderBottom: `1px solid ${TOW.line}` }}>
                  <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 17, color: TOW.ink, lineHeight: 1.1 }}>{selUnit.name_en}</div>
                  <div style={{ ...eb, fontSize: 8, color: TOW.muted, margin: '3px 0 11px' }}>{fmt(entryPoints(selUnit, selEntry))} pts · {CAT_LABEL[selEntry.cat]}</div>
                  <MiniProfile rows={statsFor(selUnit.name_en)} />
                  {((selUnit.maximum ?? 1) !== 1 || (selUnit.minimum ?? 1) > 1) && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, padding: '8px 11px', borderRadius: 9, background: TOW.cardLt, border: `1px solid ${TOW.line}` }}>
                      <span style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>Models · {selUnit.minimum ?? 1}{selUnit.maximum ? `–${selUnit.maximum}` : '+'}</span>
                      <Stepper value={selEntry.count} min={selUnit.minimum ?? 1} max={(selUnit.maximum ?? 0) === 0 ? 9999 : selUnit.maximum!} onChange={(c) => setCount(selEntry.uid, c)} sm />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px 20px' }}>
                  {(() => { const rs = (selUnit.specialRules?.name_en || '').split(',').map((s) => s.trim()).filter(Boolean); return rs.length ? <div style={{ marginBottom: 14 }}><div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 7 }}>Special rules</div>{rules_(rs)}</div> : null; })()}
                  {optionEditor(selEntry, selUnit)}
                </div>
                <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: '11px 16px', borderTop: `1px solid ${TOW.line}`, background: TOW.panel }}>
                  <button onClick={() => { const id = dup(selEntry.uid); setSelUid(id); }} style={{ flex: 1, padding: '10px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.inkDim, fontFamily: towFont.display, fontWeight: 600, fontSize: 12, letterSpacing: '0.04em' }}>Duplicate</button>
                  <button onClick={() => removeE(selEntry.uid)} style={{ flex: 1, padding: '10px', borderRadius: 9, cursor: 'pointer', border: `1px solid rgba(124,43,34,0.4)`, background: 'transparent', color: TOW.blood, fontFamily: towFont.display, fontWeight: 600, fontSize: 12, letterSpacing: '0.04em' }}>Remove</button>
                </div>
              </>
            )}
          </div>
        </div>
        {info && <InfoPopup info={info} onClose={() => setInfo(null)} />}
      </div>
    );
  }

  // ════════════════════ NARROW — mobile flow ════════════════════
  const editEntry = sheet && typeof sheet === 'object' ? list.entries.find((e) => e.uid === sheet.edit) || null : null;
  const editUnit = editEntry ? getUnit(editEntry.cat, editEntry.unitId) : null;
  return (
    <div ref={rootRef} style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: TOW.panel, color: TOW.ink, fontFamily: towFont.serif, overflow: 'hidden' }}>
      {/* header */}
      <div style={{ flexShrink: 0, padding: '12px 16px 12px', borderBottom: `1px solid ${TOW.lineStrong}`, background: TOW.panel2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onBack} aria-label="Back" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', fontSize: 17, color: TOW.inkDim }}>‹</button>
          <input value={name} onChange={(e) => onSetName(e.target.value)} aria-label="List name" style={{ flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 17, color: TOW.ink, background: 'transparent', border: 'none', borderBottom: `1px dashed ${TOW.line}`, padding: '2px 0' }} />
          <button onClick={() => setSettings(true)} aria-label="List settings" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', fontSize: 14, color: TOW.inkDim }}>⚙</button>
        </div>
        <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginTop: 8 }}>{headerMeta}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 3 }}>
          <div style={{ flex: 1, fontFamily: towFont.display, fontWeight: 700, fontSize: 26, color: overBudget ? TOW.blood : TOW.ink, lineHeight: 1 }}>{fmt(v.total)}<span style={{ fontSize: 13, color: TOW.muted, fontWeight: 600 }}> / {fmt(list.points)}</span></div>
          <span style={{ ...eb, fontSize: 8, color: v.warnings.length ? TOW.blood : '#4f6b3a', padding: '4px 9px', borderRadius: 99, border: `1px solid ${v.warnings.length ? 'rgba(124,43,34,0.4)' : 'rgba(79,107,58,0.4)'}` }}>{v.warnings.length ? `${v.warnings.length} to fix` : '✓ Legal'}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 11 }}>
          {comp.map((c) => {
            const denom = c.kind === 'min' ? Math.max(c.limit, c.value, 1) : Math.max(c.limit, 1);
            return (
              <div key={c.cat} style={{ flex: 1 }}>
                <div style={{ height: 4, borderRadius: 99, background: 'rgba(74,55,22,0.12)', overflow: 'hidden' }}><div style={{ width: Math.min(100, (c.value / denom) * 100) + '%', height: '100%', background: c.ok ? TOW.goldDeep : TOW.blood }} /></div>
                <div style={{ ...eb, fontSize: 6.5, color: c.ok ? TOW.muted : TOW.blood, marginTop: 4, textAlign: 'center' }}>{c.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* roster */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px 14px' }}>
        {list.entries.length === 0 && <div style={{ textAlign: 'center', padding: '54px 16px', fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14.5, color: TOW.muted }}>Tap “Add unit” to begin.</div>}
        {grouped.map((g) => (
          <div key={g.c} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 2px 7px' }}>
              <span style={{ ...eb, fontSize: 8.5, color: TOW.gold }}>{CAT_LABEL[g.c]}</span>
              {compByCat[g.c] && <span style={{ ...eb, fontSize: 8, color: compByCat[g.c]!.ok ? TOW.muted : TOW.blood }}>{fmt(compByCat[g.c]!.value)} pts</span>}
            </div>
            {g.items.map((e) => { const u = getUnit(e.cat, e.unitId); return u ? rosterRow(e, u, false, () => setSheet({ edit: e.uid })) : null; })}
          </div>
        ))}
      </div>

      {/* add bar */}
      <div style={{ flexShrink: 0, padding: '10px 14px', borderTop: `1px solid ${TOW.lineStrong}`, background: TOW.panel2 }}>
        <button onClick={() => setSheet('pick')} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', cursor: 'pointer', background: goldGrad, color: '#241803', fontFamily: towFont.display, fontWeight: 700, fontSize: 14, letterSpacing: '0.04em' }}>＋ Add unit</button>
      </div>

      {/* picker sheet */}
      {sheet === 'pick' && (
        <Sheet title="Add a unit" sub="Search or browse" onClose={() => setSheet(null)}>
          {picker((u, cat) => { const id = add(cat, u); setSheet({ edit: id }); }, true)}
        </Sheet>
      )}

      {/* editor sheet */}
      {editEntry && editUnit && (
        <Sheet title={editUnit.name_en} sub={`${fmt(entryPoints(editUnit, editEntry))} pts · ${CAT_LABEL[editEntry.cat]}`} onClose={() => setSheet(null)}
          foot={<button onClick={() => { removeE(editEntry.uid); setSheet(null); }} style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid rgba(124,43,34,0.4)`, background: 'transparent', color: TOW.blood, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 13, letterSpacing: '0.04em' }}>Remove from list</button>}>
          <div style={{ marginBottom: 14 }}><MiniProfile rows={statsFor(editUnit.name_en)} /></div>
          {((editUnit.maximum ?? 1) !== 1 || (editUnit.minimum ?? 1) > 1) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '10px 13px', borderRadius: 10, background: TOW.cardLt, border: `1px solid ${TOW.line}` }}>
              <span style={{ ...eb, fontSize: 9, color: TOW.muted }}>Models · {editUnit.minimum ?? 1}{editUnit.maximum ? `–${editUnit.maximum}` : '+'}</span>
              <Stepper value={editEntry.count} min={editUnit.minimum ?? 1} max={(editUnit.maximum ?? 0) === 0 ? 9999 : editUnit.maximum!} onChange={(c) => setCount(editEntry.uid, c)} />
            </div>
          )}
          {(() => { const rs = (editUnit.specialRules?.name_en || '').split(',').map((s) => s.trim()).filter(Boolean); return rs.length ? <div style={{ marginBottom: 16 }}><div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 7 }}>Special rules</div>{rules_(rs)}</div> : null; })()}
          {optionEditor(editEntry, editUnit)}
        </Sheet>
      )}
      {/* settings sheet (mobile) */}
      {settings && (
        <Sheet title="List settings" sub="Edit this list" onClose={() => setSettings(false)}>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 6 }}>List name</div>
          <input value={name} onChange={(e) => onSetName(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 15, color: TOW.ink, outline: 'none' }} />
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, margin: '16px 0 7px' }}>Points limit</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {POINT_PRESETS.map((t) => { const on = list.points === t; return <button key={t} onClick={() => onUpdate(() => ({ points: t }))} style={{ flex: 1, padding: '10px 2px', borderRadius: 8, border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 13, background: on ? 'rgba(138,108,48,0.14)' : TOW.cardLt, color: on ? TOW.gold : TOW.muted }}>{t}</button>; })}
          </div>
          <input type="number" inputMode="numeric" min={0} step={50} value={list.points} onChange={(e) => onUpdate(() => ({ points: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} aria-label="Custom points" style={{ width: '100%', boxSizing: 'border-box', marginTop: 7, padding: '10px 12px', borderRadius: 9, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 14, color: TOW.ink, outline: 'none' }} />
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, margin: '16px 0 7px' }}>Composition</div>
          <select value={list.composition} onChange={(e) => onUpdate(() => ({ composition: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: `1px solid ${TOW.line}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 14, color: TOW.ink }}>
            {comps.map((c) => <option key={c} value={c}>{COMP_NAMES[c] ?? c}</option>)}
          </select>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, margin: '14px 0 7px' }}>Composition rule</div>
          <select value={list.rule} onChange={(e) => onUpdate(() => ({ rule: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: `1px solid ${TOW.line}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 14, color: TOW.ink }}>
            {COMPOSITION_RULES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Sheet>
      )}
      {info && <InfoPopup info={info} onClose={() => setInfo(null)} />}
    </div>
  );
}

// A small centred popup showing a mount/unit stat profile (for options without a rule page).
function InfoPopup({ info, onClose }: { info: { title: string; rows: StatRow[] }; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(30,20,8,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: TOW.panel, borderRadius: 16, border: `1px solid ${TOW.lineStrong}`, boxShadow: '0 16px 50px rgba(40,24,8,0.34)', padding: 16, animation: 'sheet-pop .18s ease-out' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ ...eb, fontSize: 8, color: TOW.muted }}>Profile</span>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', color: TOW.muted, fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 18, color: TOW.ink, marginBottom: 10 }}>{info.title}</div>
        <MiniProfile rows={info.rows} />
      </div>
      <style>{`@keyframes sheet-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}

// bottom sheet (mobile)
function Sheet({ title, sub, onClose, foot, children }: { title: string; sub?: string; onClose: () => void; foot?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(30,20,8,0.42)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '92%', display: 'flex', flexDirection: 'column', background: TOW.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, border: `1px solid ${TOW.lineStrong}`, boxShadow: '0 -16px 50px rgba(40,24,8,0.34)', animation: 'sheet-up .26s cubic-bezier(.2,.8,.25,1) both' }}>
        <div style={{ flexShrink: 0, padding: '10px 16px 12px', borderBottom: `1px solid ${TOW.line}` }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: TOW.lineStrong, margin: '0 auto 12px', opacity: 0.7 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {sub && <div style={{ ...eb, fontSize: 8, color: TOW.muted }}>{sub}</div>}
              <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 19, color: TOW.ink, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', color: TOW.muted, fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px 18px' }}>{children}</div>
        {foot && <div style={{ flexShrink: 0, padding: '10px 16px', borderTop: `1px solid ${TOW.line}`, background: TOW.panel2 }}>{foot}</div>}
      </div>
      <style>{`@keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}
