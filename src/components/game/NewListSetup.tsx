import { useEffect, useMemo, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { COMPOSITION_RULES, type OwbArmy, type ListEntry } from '../../lib/owbBuilder';
import { importOwbText } from '../../lib/owbImport';
import { OwbInstructions } from './OwbInstructions';

// OWB-style "new list" setup, shown before the builder opens: pick a name, army composition,
// points target and composition rule. The army (faction) is fixed to Dark Elves for now; the
// values chosen here are stored on the list and stay editable later from the workspace's ⚙ panel.
// "Start from" can also import an Old World Builder text export → a ready-built, editable list.

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;
const POINT_PRESETS = [1000, 1500, 2000, 2500];

export interface NewListValues { name: string; composition: string; points: number; rule: string; entries: ListEntry[] }

export function NewListSetup({ comps, compNames, armyName, defaultName, catalogue, onCancel, onCreate }: {
  comps: string[];
  compNames: Record<string, string>;
  armyName: string;
  defaultName: string;
  catalogue: OwbArmy;
  onCancel: () => void;
  onCreate: (v: NewListValues) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [composition, setComposition] = useState(comps[0] ?? 'dark-elves');
  const [points, setPoints] = useState(2000);
  const [rule, setRule] = useState('open-war');
  const [mode, setMode] = useState<'empty' | 'import'>('empty');
  const [paste, setPaste] = useState('');

  const preview = useMemo(() => (mode === 'import' && paste.trim() ? importOwbText(paste, catalogue) : null), [mode, paste, catalogue]);
  // Adopt the export's name/points/rule into the editable fields above.
  useEffect(() => {
    if (!preview) return;
    if (preview.header.name) setName(preview.header.name);
    if (preview.header.points != null) setPoints(preview.header.points);
    if (preview.header.rule) setRule(preview.header.rule);
  }, [preview]);

  const label: React.CSSProperties = { ...eb, fontSize: 8.5, color: TOW.muted };
  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 14, color: TOW.ink, outline: 'none' };

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(30,20,8,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', background: TOW.panel, borderRadius: 16, border: `1px solid ${TOW.lineStrong}`, boxShadow: '0 16px 50px rgba(40,24,8,0.34)', padding: 18, animation: 'sheet-pop .18s ease-out' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <h2 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 20, color: TOW.ink, margin: 0 }}>New list</h2>
          <button onClick={onCancel} aria-label="Close" style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', color: TOW.muted, fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ ...label, marginBottom: 6 }}>List name</div>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus style={{ ...field, fontFamily: towFont.display, fontWeight: 600, fontSize: 15 }} />

        <div style={{ ...label, margin: '16px 0 6px' }}>Army</div>
        <div style={{ padding: '9px 11px', borderRadius: 9, border: `1px solid ${TOW.line}`, background: 'rgba(74,55,22,0.05)', fontFamily: towFont.serif, fontSize: 14, color: TOW.parchDim }}>{armyName}</div>

        <div style={{ ...label, margin: '16px 0 6px' }}>Start from</div>
        <select value={mode} onChange={(e) => setMode(e.target.value as 'empty' | 'import')} style={field}>
          <option value="empty">Empty list</option>
          <option value="import">Paste an Old World Builder list</option>
        </select>

        {mode === 'import' && (
          <div style={{ marginTop: 10 }}>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste the full Old World Builder export here…" rows={7} style={{ ...field, resize: 'vertical', fontFamily: towFont.serif, fontSize: 13, lineHeight: 1.45 }} />
            <OwbInstructions defaultOpen={!paste.trim()} />
            {preview && (
              <div style={{ marginTop: 9, padding: '9px 11px', borderRadius: 9, border: `1px solid ${preview.matched ? TOW.line : 'rgba(124,43,34,0.4)'}`, background: 'rgba(74,55,22,0.05)' }}>
                <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: preview.matched ? TOW.parchDim : TOW.blood }}>
                  Matched <strong>{preview.matched}</strong> of {preview.total} unit{preview.total === 1 ? '' : 's'}.
                </div>
                {preview.unmatched.length > 0 && (
                  <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.muted, marginTop: 4, lineHeight: 1.5 }}>
                    Not in the Dark Elves catalogue (skipped): {preview.unmatched.join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ ...label, margin: '16px 0 6px' }}>Army composition</div>
        <select value={composition} onChange={(e) => setComposition(e.target.value)} style={field}>
          {comps.map((c) => <option key={c} value={c}>{compNames[c] ?? c}</option>)}
        </select>

        <div style={{ ...label, margin: '16px 0 7px' }}>Points limit</div>
        <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
          {POINT_PRESETS.map((t) => { const on = points === t; return <button key={t} onClick={() => setPoints(t)} style={{ flex: 1, padding: '9px 2px', borderRadius: 8, border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5, background: on ? 'rgba(138,108,48,0.14)' : TOW.cardLt, color: on ? TOW.gold : TOW.muted }}>{t}</button>; })}
        </div>
        <input type="number" inputMode="numeric" min={0} step={50} value={points} onChange={(e) => setPoints(Math.max(0, Math.floor(Number(e.target.value) || 0)))} aria-label="Custom points" style={{ ...field, fontFamily: towFont.display, fontWeight: 600 }} />

        <div style={{ ...label, margin: '16px 0 6px' }}>Composition rule</div>
        <select value={rule} onChange={(e) => setRule(e.target.value)} style={field}>
          {COMPOSITION_RULES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 12, borderRadius: 10, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.inkDim, fontFamily: towFont.display, fontWeight: 600, fontSize: 13, letterSpacing: '0.03em' }}>Cancel</button>
          <button onClick={() => onCreate({ name: name.trim() || defaultName, composition, points, rule, entries: mode === 'import' ? (preview?.entries ?? []) : [] })} style={{ flex: 1.4, padding: 12, borderRadius: 10, cursor: 'pointer', border: 'none', background: goldGrad, color: TOW.onGrad, fontFamily: towFont.display, fontWeight: 700, fontSize: 13.5, letterSpacing: '0.03em' }}>{mode === 'import' ? 'Import list' : 'Create list'}</button>
        </div>
      </div>
      <style>{`@keyframes sheet-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
