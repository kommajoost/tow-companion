import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COMPOSITION_RULES } from '../../lib/owbBuilder';
import { TOW, towFont } from '../../design/tow';

// A custom dropdown for the composition rule: the menu lists every ruleset, each row with its OWN eye
// that opens that ruleset's rules (so it's clear the explanation is per-ruleset, not one shared eye).
// The menu is portalled to <body> so it can't be clipped by the surrounding modal's overflow/transform.
export function CompositionRulePicker({ value, onChange, onInfo, fieldStyle }: {
  value: string;
  onChange: (id: string) => void;
  onInfo: (id: string) => void;
  fieldStyle: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<{ left: number; width: number; top: number; bottom: number } | null>(null);
  const current = COMPOSITION_RULES.find((r) => r.id === value);

  const toggle = () => {
    const el = ref.current;
    if (!open && el) { const r = el.getBoundingClientRect(); setRect({ left: r.left, width: r.width, top: r.top, bottom: r.bottom }); }
    setOpen((o) => !o);
  };

  // Place the menu below the trigger, but flip above when there's more room there (the picker often
  // sits low in a modal). Cap the height to the available space so it always fits + scrolls on-screen.
  const placement = rect ? (() => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 812;
    const below = vh - rect.bottom - 8;
    const above = rect.top - 8;
    const up = below < 240 && above > below;
    const maxHeight = Math.max(150, Math.min(vh * 0.6, up ? above : below));
    return { up, maxHeight, pos: up ? { bottom: vh - rect.top + 4 } : { top: rect.bottom + 4 } };
  })() : null;

  const eyeSvg = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg>
  );

  return (
    <>
      <button ref={ref} onClick={toggle} aria-haspopup="listbox" aria-expanded={open} style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.name ?? value}</span>
        <span style={{ color: TOW.muted, fontSize: 10, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && rect && placement && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 84 }} />
          <div role="listbox" style={{ position: 'fixed', left: rect.left, width: rect.width, ...placement.pos, maxHeight: placement.maxHeight, overflowY: 'auto', zIndex: 85, background: TOW.panel2, border: `1px solid ${TOW.lineStrong}`, borderRadius: 10, boxShadow: '0 12px 34px rgba(40,24,8,0.3)', padding: 4, WebkitOverflowScrolling: 'touch' }}>
            {COMPOSITION_RULES.map((r) => {
              const sel = r.id === value;
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => { onChange(r.id); setOpen(false); }} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '9px 9px', border: 'none', background: sel ? 'rgba(184,134,47,0.12)' : 'transparent', borderRadius: 7, cursor: 'pointer', textAlign: 'left', fontFamily: towFont.serif, fontSize: 14, color: sel ? TOW.goldDeep : TOW.ink, fontWeight: sel ? 600 : 400 }}>
                    <span style={{ width: 13, flexShrink: 0, color: TOW.goldDeep }}>{sel ? '✓' : ''}</span>
                    {r.name}
                  </button>
                  <button onClick={() => onInfo(r.id)} aria-label={`${r.name} rules`} title={`${r.name} rules`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, flexShrink: 0, borderRadius: 7, border: `1px solid ${TOW.line}`, background: TOW.cardLt, color: TOW.goldDeep, cursor: 'pointer', padding: 0 }}>{eyeSvg}</button>
                </div>
              );
            })}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
