import { useLayoutEffect, useEffect, useRef, useState, Fragment } from 'react';
import { useData } from '../../data';
import { usePersistentState } from '../../store';
import { TOW, towFont, engraved } from '../../design/tow';
import { PhaseGlyph, Ornament } from '../../design/glyphs';
import { LogoMark } from '../LogoMark';
import { Block } from './blocks';

const eb = engraved as React.CSSProperties;

// The responsive turn companion (Claude Design v2 — light parchment).
//   compact (< 720px)  → single column: slim header + label-free stepper + bottom bar
//   wide    (>= 720px) → two panes: sub-phase nav rail | parchment content
export function CompanionView({ onHome }: { onHome?: () => void } = {}) {
  const { companion } = useData();
  const phases = companion?.phases ?? [];

  const [phaseIdx, setPhaseIdx] = usePersistentState('tow:c:phase', 0);
  const [sub, setSub] = usePersistentState('tow:c:sub', 0);
  const [tab, setTab] = useState('quick');
  const [hoverSub, setHoverSub] = useState<number | null>(null);
  // Phase hover popup: track index + the chip's on-screen position so the popup can be
  // rendered as a fixed element that escapes the strip's overflow:auto clipping.
  const [phaseTip, setPhaseTip] = useState<{ i: number; x: number; y: number } | null>(null);
  const [w, setW] = useState(900);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // Keep the active step chip centred on the (scrollable) phone stepper.
  useEffect(() => {
    const el = stepRef.current?.querySelector('[data-active="1"]') as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [phaseIdx, sub, w]);

  if (!phases.length) {
    return (
      <div ref={rootRef} style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: TOW.parchDim, fontFamily: towFont.serif }}>
        Loading companion…
      </div>
    );
  }

  const pIdx = Math.min(phaseIdx, phases.length - 1);
  const phase = phases[pIdx];
  const subCount = phase.subs.length;
  const sIdx = Math.min(sub, subCount - 1);
  const S = phase.subs[sIdx];
  const tabs = S.tabs;
  const activeTab = tabs.find((t) => t.id === tab) || tabs[0];

  const wide = w >= 720;

  const resetScroll = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };
  const goSub = (i: number) => {
    const j = Math.max(0, Math.min(subCount - 1, i));
    setSub(j);
    setTab(phase.subs[j].tabs[0].id);
    resetScroll();
  };
  const goPhase = (i: number) => {
    setPhaseIdx(i);
    setSub(0);
    setTab(phases[i].subs[0].tabs[0].id);
    resetScroll();
  };
  const goTab = (id: string) => {
    setTab(id);
    resetScroll();
  };

  // Advance: next sub-phase, or roll into the next phase.
  const lastSub = sIdx >= subCount - 1;
  const lastPhase = pIdx >= phases.length - 1;
  const advanceLabel = !lastSub
    ? phase.subs[sIdx + 1].name
    : !lastPhase
      ? `${phases[pIdx + 1].name} Phase`
      : `${phases[0].name} · next round`;
  const advanceKicker = !lastSub ? 'Advance to' : !lastPhase ? 'Next phase' : 'New round';
  const advance = () => {
    if (!lastSub) goSub(sIdx + 1);
    else if (!lastPhase) goPhase(pIdx + 1);
    else goPhase(0);
  };
  const back = () => {
    if (sIdx > 0) goSub(sIdx - 1);
    else if (pIdx > 0) {
      const prev = phases[pIdx - 1];
      setPhaseIdx(pIdx - 1);
      setSub(prev.subs.length - 1);
      setTab(prev.subs[prev.subs.length - 1].tabs[0].id);
      resetScroll();
    }
  };
  const canBack = sIdx > 0 || pIdx > 0;

  // ── shared sub-components ──
  const TabStrip = ({ style }: { style?: React.CSSProperties }) => {
    if (tabs.length <= 1) return null;
    return (
      <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 11, background: 'rgba(0,0,0,0.04)', border: `1px solid ${TOW.line}`, ...style }}>
        {tabs.map((t) => {
          const on = t.id === activeTab.id;
          return (
            <button
              key={t.id}
              onClick={() => goTab(t.id)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', border: 'none',
                fontFamily: towFont.display, fontWeight: 600, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase',
                background: on ? `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 60%, ${TOW.goldDeep})` : 'transparent',
                color: on ? '#241803' : TOW.muted, boxShadow: on ? '0 3px 10px rgba(140,100,30,0.25)' : 'none',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    );
  };

  const AdvanceBtn = () => (
    <button
      onClick={advance}
      style={{
        flex: 1, borderRadius: 13, border: 'none', padding: '11px 18px', cursor: 'pointer',
        background: `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        boxShadow: '0 8px 22px rgba(140,100,30,0.22)',
      }}
    >
      <div style={{ textAlign: 'left', minWidth: 0 }}>
        <div style={{ ...eb, fontSize: 8, color: 'rgba(43,28,8,0.6)' }}>{advanceKicker}</div>
        <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 15, color: '#241803', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{advanceLabel}</div>
      </div>
      <svg width="20" height="16" viewBox="0 0 20 16" style={{ flexShrink: 0 }}><path d="M2 8h15M12 2l6 6-6 6" fill="none" stroke="#241803" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );

  const BackBtn = () => (
    <button
      onClick={back}
      disabled={!canBack}
      style={{ width: 50, flexShrink: 0, borderRadius: 13, background: 'transparent', border: `1px solid ${TOW.lineStrong}`, color: TOW.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canBack ? 'pointer' : 'default', opacity: canBack ? 1 : 0.4 }}
    >
      <svg width="9" height="16" viewBox="0 0 9 16"><path d="M7 1L2 8l5 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );

  // compact row of phase chips for direct jumping. An instant hover/focus popup (rendered
  // separately as a fixed element via `phaseTip`) shows the phase name immediately, instead
  // of the slow native `title` tooltip.
  const showTip = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPhaseTip({ i, x: r.left + r.width / 2, y: r.bottom });
  };
  const hideTip = (i: number) => setPhaseTip((t) => (t && t.i === i ? null : t));

  // Tap any phase to jump straight to it. `labeled` spells out the phase name on each chip
  // (used on phone, where the hover popup can't fire on touch); otherwise it's glyph + numeral
  // with an instant hover popup (desktop sidebar).
  const PhaseStrip = ({ style, labeled }: { style?: React.CSSProperties; labeled?: boolean }) => (
    <div className="no-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', ...style }}>
      {phases.map((p, i) => {
        const on = i === pIdx;
        return (
          <button
            key={p.id}
            onClick={() => goPhase(i)}
            onMouseEnter={labeled ? undefined : (e) => showTip(i, e.currentTarget)}
            onMouseLeave={labeled ? undefined : () => hideTip(i)}
            onFocus={labeled ? undefined : (e) => showTip(i, e.currentTarget)}
            onBlur={labeled ? undefined : () => hideTip(i)}
            aria-label={`${p.name} phase`}
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: labeled ? '6px 11px' : '6px 10px', borderRadius: 9, cursor: 'pointer',
              background: on ? '#fff7e9' : 'transparent',
              border: `1px solid ${on ? TOW.lineStrong : TOW.line}`,
              color: on ? TOW.goldDeep : TOW.muted,
            }}
          >
            {!labeled && <PhaseGlyph id={p.glyph} size={15} color={on ? TOW.goldDeep : TOW.muted} sw={1.5} />}
            {labeled ? (
              <span style={{ fontFamily: towFont.display, fontWeight: on ? 700 : 600, fontSize: 11, letterSpacing: '0.01em', color: on ? TOW.goldDeep : TOW.parchDim }}>{p.name}</span>
            ) : (
              <span style={{ ...eb, fontSize: 9.5 }}>{p.num}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  // The single fixed-position phase-name popup. Sits below the hovered chip and escapes any
  // overflow:auto clipping because it's fixed to the viewport.
  const PhaseTip = () => {
    if (phaseTip == null) return null;
    const p = phases[phaseTip.i];
    if (!p) return null;
    return (
      <div
        style={{
          position: 'fixed',
          left: phaseTip.x,
          top: phaseTip.y + 6,
          transform: 'translateX(-50%)',
          zIndex: 60,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%) translateY(4px) rotate(45deg)',
            width: 8,
            height: 8,
            background: '#fff7e9',
            borderLeft: `1px solid ${TOW.lineStrong}`,
            borderTop: `1px solid ${TOW.lineStrong}`,
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: towFont.display,
            fontWeight: 600,
            fontSize: 11.5,
            letterSpacing: '0.04em',
            color: TOW.ink,
            padding: '5px 10px',
            borderRadius: 7,
            background: '#fff7e9',
            border: `1px solid ${TOW.lineStrong}`,
            boxShadow: '0 6px 18px rgba(80,55,20,0.25)',
          }}
        >
          <span style={{ color: TOW.goldDeep }}>{p.num}</span>
          {p.name}
        </div>
      </div>
    );
  };

  const Content = () => <>{activeTab.blocks.map((b, i) => <Block key={i} b={b} />)}</>;

  // ════════════════ WIDE (tablet / laptop) ════════════════
  if (wide) {
    return (
      <div ref={rootRef} style={{ width: '100%', height: '100%', boxSizing: 'border-box', background: TOW.bg, color: TOW.parch, display: 'flex', overflow: 'hidden', paddingTop: 'env(safe-area-inset-top)' }}>
        <div style={{ width: 300, flexShrink: 0, borderRight: `1px solid ${TOW.line}`, display: 'flex', flexDirection: 'column', background: TOW.panel }}>
          <button
            onClick={onHome}
            aria-label="Home"
            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '20px 22px 0', width: '100%', background: 'none', border: 'none', cursor: onHome ? 'pointer' : 'default', textAlign: 'left' }}
          >
            <LogoMark size={26} radius={6} />
            <div style={{ ...eb, fontSize: 9.5, color: TOW.muted, flex: 1 }}>Old&nbsp;World · Companion</div>
          </button>
          <div style={{ padding: '16px 22px 6px' }}>
            <div style={{ ...eb, fontSize: 9.5, color: TOW.muted, marginBottom: 8 }}>{companion?.round ?? 'Round III'} · Your&nbsp;Turn</div>
            {PhaseStrip({ style: { marginBottom: 12 } })}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <PhaseGlyph id={phase.glyph} size={22} color={TOW.goldDeep} sw={1.4} />
              <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 21, color: TOW.ink, letterSpacing: '0.02em' }}>{phase.name}</div>
            </div>
            <Ornament w={190} color={TOW.goldDeep} style={{ display: 'block', marginTop: 12, opacity: 0.6 }} />
          </div>
          <div style={{ padding: '10px 12px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {phase.subs.map((s, i) => {
              const active = i === sIdx, done = i < sIdx;
              return (
                <button
                  key={i}
                  onClick={() => goSub(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', cursor: 'pointer',
                    padding: '10px 12px', marginBottom: 3, borderRadius: 10,
                    background: active ? '#fff7e9' : 'transparent',
                    border: `1px solid ${active ? TOW.lineStrong : 'transparent'}`,
                    borderLeft: active ? `3px solid ${TOW.gold}` : '3px solid transparent',
                  }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: 99, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: towFont.display, fontWeight: 700, fontSize: 11,
                    background: done ? TOW.goldDeep : active ? TOW.gold : 'transparent',
                    border: done || active ? 'none' : `1.2px solid ${TOW.faint}`, color: done || active ? '#241803' : TOW.muted,
                  }}>{done ? '✓' : i + 1}</div>
                  <span style={{ flex: 1, minWidth: 0, fontFamily: towFont.serif, fontSize: 14.5, fontWeight: active ? 600 : 500, color: active ? TOW.ink : TOW.parchDim }}>{s.name}</span>
                </button>
              );
            })}
          </div>
          <div style={{ padding: '14px 18px 20px', borderTop: `1px solid ${TOW.line}`, display: 'flex', gap: 9 }}>
            {BackBtn()}{AdvanceBtn()}
          </div>
        </div>

        <div ref={scrollRef} style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: TOW.bg }}>
          <div style={{ maxWidth: 660, margin: '0 auto', padding: '34px 40px 56px' }}>
            <div style={{ ...eb, fontSize: 9.5, color: TOW.goldDeep, marginBottom: 5 }}>Sub-phase {sIdx + 1} of {subCount}</div>
            <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 30, color: TOW.ink, letterSpacing: '0.02em', lineHeight: 1.05 }}>{S.name}</div>
            <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 15.5, color: TOW.parchDim, lineHeight: 1.45, margin: '10px 0 18px', maxWidth: 560 }}>{S.intro}</div>
            {TabStrip({ style: { maxWidth: 440, marginBottom: 22 } })}
            {Content()}
          </div>
        </div>
        {PhaseTip()}
      </div>
    );
  }

  // ════════════════ COMPACT (phone) ════════════════
  return (
    <div ref={rootRef} style={{ width: '100%', height: '100%', boxSizing: 'border-box', position: 'relative', background: TOW.bg, display: 'flex', flexDirection: 'column', color: TOW.parch, overflow: 'hidden', paddingTop: 'env(safe-area-inset-top)' }}>
      {/* slim app bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px 10px', flexShrink: 0, background: TOW.panel, borderBottom: `1px solid ${TOW.line}` }}>
        <button
          onClick={onHome}
          aria-label="Home"
          style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: onHome ? 'pointer' : 'default', textAlign: 'left' }}
        >
          <LogoMark size={24} radius={6} />
          <div style={{ ...eb, fontSize: 9, color: TOW.muted }}>Old&nbsp;World · Companion</div>
        </button>
        <div style={{ ...eb, fontSize: 9, color: TOW.goldDeep }}>{companion?.round ?? 'Round III'}</div>
      </div>

      {/* phase chips + label-free sub-phase stepper */}
      <div style={{ flexShrink: 0, padding: '9px 12px 10px', background: TOW.panel, borderBottom: `1px solid ${TOW.line}` }}>
        {PhaseStrip({ labeled: true, style: { justifyContent: 'center', marginBottom: 9 } })}
        <div ref={stepRef} className="no-scrollbar" style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: subCount <= 6 ? 'center' : 'flex-start', width: subCount <= 6 ? 'auto' : 'max-content', minWidth: '100%' }}>
            {phase.subs.map((s, i) => {
              const active = i === sIdx, done = i < sIdx, hovered = hoverSub === i;
              return (
                <Fragment key={i}>
                  {i > 0 && <div style={{ flex: '0 0 14px', height: 1.5, background: done || active ? TOW.goldDeep : TOW.faint }} />}
                  <div data-active={active ? '1' : '0'} style={{ position: 'relative', flexShrink: 0 }}>
                    {hovered && (
                      <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%) translateY(-4px)', zIndex: 40, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                        <div style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 11, letterSpacing: '0.03em', color: TOW.ink, padding: '4px 9px', borderRadius: 7, background: '#fff7e9', border: `1px solid ${TOW.lineStrong}`, boxShadow: '0 6px 16px rgba(80,55,20,0.25)' }}>
                          <span style={{ color: TOW.goldDeep, marginRight: 6 }}>{i + 1}</span>{s.name}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => goSub(i)} onMouseEnter={() => setHoverSub(i)} onMouseLeave={() => setHoverSub((h) => (h === i ? null : h))}
                      aria-label={`Sub-phase ${i + 1}: ${s.name}`}
                      style={{
                        width: 28, height: 28, borderRadius: 99, flexShrink: 0, cursor: 'pointer', padding: 0,
                        fontFamily: towFont.display, fontWeight: 700, fontSize: 12.5,
                        background: active ? `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 60%, ${TOW.goldDeep})` : done ? 'rgba(184,134,47,0.18)' : 'transparent',
                        border: `1px solid ${active ? TOW.gold : done ? TOW.lineStrong : TOW.faint}`,
                        color: active ? '#241803' : done ? TOW.goldDeep : TOW.muted,
                      }}
                    >{done ? '✓' : i + 1}</button>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* title */}
      <div style={{ padding: '13px 16px 8px', flexShrink: 0 }}>
        <div style={{ ...eb, fontSize: 9, color: TOW.goldDeep }}>Sub-phase {sIdx + 1} of {subCount}</div>
        <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 21, color: TOW.ink, letterSpacing: '0.02em', lineHeight: 1.1, marginTop: 3 }}>{S.name}</div>
      </div>

      {TabStrip({ style: { margin: '0 16px 10px', flexShrink: 0 } })}

      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 16px 12px' }}>
        {Content()}
      </div>

      <div style={{ flexShrink: 0, padding: '10px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', display: 'flex', gap: 10, borderTop: `1px solid ${TOW.line}`, background: TOW.panel }}>
        {BackBtn()}{AdvanceBtn()}
      </div>
      {PhaseTip()}
    </div>
  );
}
