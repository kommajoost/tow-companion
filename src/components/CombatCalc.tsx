import { useState } from 'react';
import { TOW, towFont, engraved } from '../design/tow';

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

// The Old World quick-reference charts, verbatim from rules.json (to-hit-chart / to-wound-chart).
// grid[attacker − 1][defender − 1] → required roll (number; 0 = cannot wound).
const HIT: number[][] = [
  [4, 4, 5, 5, 5, 5, 5, 5, 5, 5],
  [3, 4, 4, 4, 5, 5, 5, 5, 5, 5],
  [2, 3, 4, 4, 4, 4, 5, 5, 5, 5],
  [2, 3, 3, 4, 4, 4, 4, 4, 5, 5],
  [2, 2, 3, 3, 4, 4, 4, 4, 4, 4],
  [2, 2, 3, 3, 3, 4, 4, 4, 4, 4],
  [2, 2, 2, 3, 3, 3, 4, 4, 4, 4],
  [2, 2, 2, 3, 3, 3, 3, 4, 4, 4],
  [2, 2, 2, 2, 3, 3, 3, 3, 4, 4],
  [2, 2, 2, 2, 3, 3, 3, 3, 3, 4],
];
const WOUND: number[][] = [
  [4, 5, 6, 6, 6, 6, 0, 0, 0, 0],
  [3, 4, 5, 6, 6, 6, 6, 0, 0, 0],
  [2, 3, 4, 5, 6, 6, 6, 6, 0, 0],
  [2, 2, 3, 4, 5, 6, 6, 6, 6, 0],
  [2, 2, 2, 3, 4, 5, 6, 6, 6, 6],
  [2, 2, 2, 2, 3, 4, 5, 6, 6, 6],
  [2, 2, 2, 2, 2, 3, 4, 5, 6, 6],
  [2, 2, 2, 2, 2, 2, 3, 4, 5, 6],
  [2, 2, 2, 2, 2, 2, 2, 3, 4, 5],
  [2, 2, 2, 2, 2, 2, 2, 2, 3, 4],
];

const clamp = (n: number) => Math.max(1, Math.min(10, n));

const Die = ({ c, size = 22 }: { c: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke={c} strokeWidth="1.7" />
    <circle cx="8.5" cy="8.5" r="1.4" fill={c} />
    <circle cx="15.5" cy="8.5" r="1.4" fill={c} />
    <circle cx="12" cy="12" r="1.4" fill={c} />
    <circle cx="8.5" cy="15.5" r="1.4" fill={c} />
    <circle cx="15.5" cy="15.5" r="1.4" fill={c} />
  </svg>
);

// One labelled −/value/+ stat dial.
function Dial({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const btn = (dir: number) => (
    <button
      onClick={() => onChange(clamp(value + dir))}
      aria-label={dir < 0 ? 'less' : 'more'}
      style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.parchDim, fontFamily: towFont.display, fontWeight: 700, fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {dir < 0 ? '–' : '+'}
    </button>
  );
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5, textAlign: 'center' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {btn(-1)}
        <div style={{ flex: 1, textAlign: 'center', fontFamily: towFont.display, fontWeight: 700, fontSize: 22, color: TOW.ink }}>{value}</div>
        {btn(1)}
      </div>
    </div>
  );
}

// A small floating tool to look up the To Hit / To Wound roll without leaving the screen.
// `bottom` lifts it above the phone bottom-nav (no rail) vs sitting low on wide screens.
export function CombatCalc({ bottom = 84 }: { bottom?: number }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'hit' | 'wound'>('hit');
  const [a, setA] = useState(4);
  const [b, setB] = useState(4);

  const val = (mode === 'hit' ? HIT : WOUND)[clamp(a) - 1][clamp(b) - 1];
  const cantWound = mode === 'wound' && val === 0;
  const labels = mode === 'hit' ? ['Your WS', 'Enemy WS'] : ['Strength', 'Toughness'];

  return (
    <>
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 54, background: 'transparent' }} />}

      {open && (
        <div
          style={{
            position: 'fixed',
            right: 14,
            bottom: bottom + 64,
            zIndex: 56,
            width: 300,
            maxWidth: 'calc(100vw - 28px)',
            background: TOW.panel2,
            border: `1px solid ${TOW.lineStrong}`,
            borderRadius: 16,
            boxShadow: '0 12px 40px rgba(40,24,8,0.28)',
            padding: 14,
            color: TOW.ink,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ ...eb, fontSize: 9, color: TOW.goldDeep }}>Quick roll</span>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: TOW.muted, padding: '0 2px' }}>×</button>
          </div>

          {/* To Hit / To Wound toggle */}
          <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 11, background: 'rgba(74,55,22,0.07)', border: `1px solid ${TOW.line}`, marginBottom: 12 }}>
            {(['hit', 'wound'] as const).map((m) => {
              const on = m === mode;
              return (
                <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', border: 'none', fontFamily: towFont.display, fontWeight: 600, fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase', background: on ? goldGrad : 'transparent', color: on ? '#241803' : TOW.muted }}>
                  {m === 'hit' ? 'To Hit' : 'To Wound'}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
            <Dial label={labels[0]} value={a} onChange={setA} />
            <span style={{ fontFamily: towFont.serif, fontSize: 13, color: TOW.faint, paddingBottom: 6 }}>vs</span>
            <Dial label={labels[1]} value={b} onChange={setB} />
          </div>

          {/* Result */}
          <div style={{ borderRadius: 12, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, lineHeight: 1.3 }}>
              {mode === 'hit' ? 'Roll to hit' : 'Roll to wound'}
            </div>
            <div style={{ marginLeft: 'auto', fontFamily: towFont.display, fontWeight: 700, fontSize: 30, color: cantWound ? TOW.blood : TOW.goldDeep, lineHeight: 1 }}>
              {cantWound ? '—' : `${val}+`}
            </div>
          </div>
          {cantWound && (
            <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 12, color: TOW.blood, marginTop: 6, textAlign: 'right' }}>
              Strength too low to wound.
            </div>
          )}
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Quick roll calculator"
        style={{
          position: 'fixed',
          right: 14,
          bottom,
          zIndex: 56,
          width: 52,
          height: 52,
          borderRadius: 16,
          cursor: 'pointer',
          border: 'none',
          background: goldGrad,
          boxShadow: '0 6px 18px rgba(122,93,36,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {open ? <span style={{ fontSize: 26, color: '#2a1a0a', lineHeight: 1 }}>×</span> : <Die c="#2a1a0a" size={24} />}
      </button>
    </>
  );
}
