import { useEffect, useState } from 'react';
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

// The calculator itself: To Hit / To Wound toggle, two −/+ dials, instant required roll.
// Pure UI — owns only its own dial state, no positioning.
function QuickRollPanel() {
  const [mode, setMode] = useState<'hit' | 'wound'>('hit');
  const [a, setA] = useState(4);
  const [b, setB] = useState(4);

  const val = (mode === 'hit' ? HIT : WOUND)[clamp(a) - 1][clamp(b) - 1];
  const cantWound = mode === 'wound' && val === 0;
  const labels = mode === 'hit' ? ['Your WS', 'Enemy WS'] : ['Strength', 'Toughness'];

  return (
    <>
      {/* To Hit / To Wound toggle */}
      <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 11, background: 'rgba(74,55,22,0.07)', border: `1px solid ${TOW.line}`, marginBottom: 12 }}>
        {(['hit', 'wound'] as const).map((m) => {
          const on = m === mode;
          return (
            <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', border: 'none', fontFamily: towFont.display, fontWeight: 600, fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase', background: on ? goldGrad : 'transparent', color: on ? TOW.onGrad : TOW.muted }}>
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
    </>
  );
}

// A compact launcher pill (die glyph + "Quick roll") that lives in the Rulebook header.
export function QuickRollButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Quick roll calculator"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        flexShrink: 0,
        padding: '7px 12px 7px 10px',
        borderRadius: 11,
        cursor: 'pointer',
        border: `1px solid ${TOW.lineStrong}`,
        background: TOW.cardLt,
        color: TOW.goldDeep,
        fontFamily: towFont.display,
        fontWeight: 600,
        fontSize: 12.5,
        letterSpacing: '0.02em',
        lineHeight: 1,
      }}
    >
      <Die c={TOW.goldDeep} size={18} />
      Quick roll
    </button>
  );
}

// The quick-roll calculator as a dismissible bottom sheet (mirrors RuleSheet), opened from
// the Rulebook header. Anchored to the bottom with a tap-away backdrop — never overlays
// content while you read.
export function QuickRollSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(1px)' }} />
      <div
        style={{
          position: 'relative',
          margin: '0 auto',
          width: '100%',
          maxWidth: 420,
          background: TOW.panel2,
          borderTop: `1px solid ${TOW.lineStrong}`,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: '0 -12px 40px rgba(40,24,8,0.28)',
          padding: '14px 16px max(20px, env(safe-area-inset-bottom))',
          color: TOW.ink,
          animation: 'sheet-up 0.22s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ ...eb, fontSize: 9.5, color: TOW.goldDeep }}>Quick roll</span>
          <div style={{ margin: '0 auto', height: 4, width: 40, borderRadius: 99, background: TOW.line }} />
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: TOW.muted, padding: '0 2px' }}>×</button>
        </div>
        <QuickRollPanel />
      </div>
      <style>{`@keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}
