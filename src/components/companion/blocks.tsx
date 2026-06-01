import { useState } from 'react';
import { useData } from '../../data';
import { useUI } from '../../state';
import { RichText } from '../../lib/RichText';
import { TOW, towFont, engraved } from '../../design/tow';
import type { CompanionBlock } from '../../types';

// Content-block renderers ported from the Claude Design handoff (variant-responsive.jsx),
// plus a `rule` block that renders a verbatim wiki rule body via RichText.

const eb = engraved as React.CSSProperties;

// charge-reaction glyphs
function RxGlyph({ g, c }: { g: string; c: string }) {
  const p = {
    fill: 'none',
    stroke: c,
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const ww = (k: React.ReactNode) => (
    <svg width="20" height="20" viewBox="0 0 22 22">
      {k}
    </svg>
  );
  if (g === 'hold') return ww(<g {...p}><path d="M11 2.5l6.5 2.2v5.3c0 4-2.8 7-6.5 8.5-3.7-1.5-6.5-4.5-6.5-8.5V4.7z" /></g>);
  if (g === 'flee') return ww(<g {...p}><path d="M16 6H5l3-3M5 6l3 3" /><path d="M6 16h11l-3-3M17 16l-3 3" /></g>);
  if (g === 'shoot') return ww(<g {...p}><path d="M4 18 16 6" /><path d="M11 6h6v6" /><path d="M4 18v-3M4 18h3" /></g>);
  return ww(<g {...p}><path d="M6 16 16 6" /><path d="M14 4l4-1-1 4" /><path d="M5 19l2-2" /></g>);
}

function Pip({ n }: { n: number }) {
  const dots: Record<number, number[][]> = {
    1: [[13.5, 13.5]],
    2: [[8, 8], [19, 19]],
    3: [[8, 8], [13.5, 13.5], [19, 19]],
    4: [[8, 8], [19, 8], [8, 19], [19, 19]],
    5: [[8, 8], [19, 8], [13.5, 13.5], [8, 19], [19, 19]],
    6: [[8, 7], [19, 7], [8, 13.5], [19, 13.5], [8, 20], [19, 20]],
  };
  return (
    <div
      style={{
        width: 27,
        height: 27,
        borderRadius: 6,
        background: TOW.ink,
        border: `1px solid ${TOW.lineStrong}`,
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {(dots[n] || dots[1]).map((d, i) => (
        <div
          key={i}
          style={{ position: 'absolute', width: 4, height: 4, borderRadius: 9, background: TOW.gold, left: d[0] - 2, top: d[1] - 2 }}
        />
      ))}
    </div>
  );
}

// A pin/favourite star toggle for a rule or chart.
function FavStar({ slug }: { slug: string }) {
  const { isFavorite, toggleFavorite } = useUI();
  const on = isFavorite(slug);
  return (
    <button
      aria-label={on ? 'Remove favourite' : 'Pin to favourites'}
      onClick={() => toggleFavorite(slug)}
      style={{
        flexShrink: 0,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: 18,
        lineHeight: 1,
        padding: '0 2px',
        color: on ? TOW.gold : TOW.faint,
      }}
    >
      {on ? '★' : '☆'}
    </button>
  );
}

// A verbatim rule, rendered with its name as a gold heading.
function RuleBlock({ slug }: { slug: string }) {
  const { getRule } = useData();
  const rule = getRule(slug);
  if (!rule) return null;
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 17, color: TOW.goldDeep, letterSpacing: '0.01em', flex: 1, minWidth: 0 }}>
          {rule.name}
        </h3>
        {rule.pageReference != null && (
          <span style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>p.{rule.pageReference}</span>
        )}
        <FavStar slug={slug} />
      </div>
      <RichText doc={rule.body} />
    </section>
  );
}

// A reference chart (e.g. To Hit / To Wound), rendered as a titled card for fast access.
function ChartBlock({ slug }: { slug: string }) {
  const { getRule } = useData();
  const rule = getRule(slug);
  if (!rule?.body) return null;
  const title = rule.name.replace(/\s*\(chart\)\s*$/i, '').trim();
  return (
    <section
      style={{
        marginBottom: 16,
        borderRadius: 12,
        border: `1px solid ${TOW.lineStrong}`,
        background: 'rgba(184,134,47,0.06)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px 8px 14px',
          borderBottom: `1px solid ${TOW.line}`,
        }}
      >
        <span style={{ ...eb, fontSize: 10, color: TOW.goldDeep, flex: 1, minWidth: 0 }}>{title}</span>
        <FavStar slug={slug} />
      </div>
      <div style={{ padding: '4px 14px 12px' }}>
        <RichText doc={rule.body} />
      </div>
    </section>
  );
}

// A verbatim rule rendered as a collapsible accordion — used in the "In Detail" tab,
// where many deeper rules are listed and most stay collapsed for scannability.
function DetailBlock({ slug }: { slug: string }) {
  const { getRule } = useData();
  const [open, setOpen] = useState(false);
  const rule = getRule(slug);
  if (!rule) return null;
  return (
    <section
      style={{
        marginBottom: 8,
        border: `1px solid ${TOW.line}`,
        borderRadius: 10,
        background: open ? TOW.panel2 : 'transparent',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen((o: boolean) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '11px 12px',
        }}
      >
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            color: TOW.goldDeep,
            fontSize: 13,
            transition: 'transform 0.12s',
            transform: open ? 'rotate(90deg)' : 'none',
          }}
        >
          ▸
        </span>
        <span style={{ flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 600, fontSize: 15, color: TOW.ink }}>
          {rule.name}
        </span>
        {rule.pageReference != null && (
          <span style={{ fontSize: 11, color: TOW.muted, flexShrink: 0 }}>p.{rule.pageReference}</span>
        )}
      </button>
      {open && (
        <div style={{ padding: '0 14px 12px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
            <FavStar slug={slug} />
          </div>
          <RichText doc={rule.body} />
        </div>
      )}
    </section>
  );
}

export function Block({ b }: { b: CompanionBlock }) {
  if (b.type === 'rule' && b.slug) return <RuleBlock slug={b.slug} />;
  if (b.type === 'chart' && b.slug) return <ChartBlock slug={b.slug} />;
  if (b.type === 'detail' && b.slug) return <DetailBlock slug={b.slug} />;

  if (b.type === 'steps') {
    const items = (b.items as string[]) || [];
    return (
      <div>
        {items.map((t, i, a) => (
          <div
            key={i}
            style={{ position: 'relative', paddingLeft: 28, marginBottom: i === a.length - 1 ? 0 : 13, fontFamily: towFont.serif, fontSize: 16, lineHeight: 1.45, color: TOW.parch }}
          >
            <span
              style={{ position: 'absolute', left: 0, top: 2, width: 18, height: 18, borderRadius: 99, background: TOW.gold, color: '#241803', fontFamily: towFont.display, fontWeight: 700, fontSize: 10.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {i + 1}
            </span>
            {t}
          </div>
        ))}
      </div>
    );
  }

  if (b.type === 'dice') {
    const d = b.d || [];
    return (
      <div style={{ marginTop: 16, padding: '13px 14px', borderRadius: 11, background: 'rgba(184,134,47,0.08)', border: `1px solid ${TOW.lineStrong}` }}>
        <div style={{ ...eb, fontSize: 9.5, color: TOW.goldDeep, marginBottom: 9 }}>Charge distance</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 13, color: '#f0e3c4', padding: '4px 9px', borderRadius: 7, background: TOW.goldDeep }}>
            M&nbsp;{b.m}
          </div>
          <span style={{ color: TOW.muted, fontSize: 16 }}>+</span>
          {d.map((n, i) => <Pip key={i} n={n} />)}
          <span style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 13.5, color: TOW.parchDim, whiteSpace: 'nowrap' }}>
            =&nbsp;<b style={{ color: TOW.goldDeep, fontStyle: 'normal' }}>{b.total}</b>
          </span>
        </div>
        {b.note && (
          <div style={{ fontFamily: towFont.serif, fontSize: 13, color: TOW.muted, lineHeight: 1.35, marginTop: 9 }}>{b.note}</div>
        )}
      </div>
    );
  }

  if (b.type === 'prose') {
    const items = (b.items as { h: string; p: string }[]) || [];
    return (
      <div>
        {items.map((s, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ ...eb, fontSize: 11, color: TOW.goldDeep, marginBottom: 5 }}>{s.h}</div>
            <div style={{ fontFamily: towFont.serif, fontSize: 15.5, lineHeight: 1.5, color: TOW.parch }}>{s.p}</div>
          </div>
        ))}
      </div>
    );
  }

  if (b.type === 'callouts') {
    const items = (b.items as { kind: string; h: string; t: string }[]) || [];
    return (
      <div>
        {items.map((c, i) => {
          const tone = c.kind === 'warn' ? TOW.blood : c.kind === 'eg' ? '#4e6b54' : TOW.goldDeep;
          const label = c.kind === 'warn' ? '#9c3329' : c.kind === 'eg' ? '#3f5a47' : TOW.goldDeep;
          return (
            <div key={i} style={{ position: 'relative', padding: '11px 13px 12px 16px', borderRadius: 9, marginBottom: 11, background: 'rgba(0,0,0,0.025)', border: `1px solid ${TOW.line}` }}>
              <div style={{ position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, borderRadius: 3, background: tone }} />
              <div style={{ ...eb, fontSize: 9.5, color: label, marginBottom: 4 }}>{c.h}</div>
              <div style={{ fontFamily: towFont.serif, fontSize: 14.5, lineHeight: 1.45, color: TOW.parchDim }}>{c.t}</div>
            </div>
          );
        })}
      </div>
    );
  }

  if (b.type === 'reactions') {
    const items = (b.items as { g: string; name: string; desc: string }[]) || [];
    return (
      <div>
        {items.map((r, i) => (
          <div key={i} style={{ position: 'relative', paddingLeft: 44, minHeight: 32, marginBottom: 16 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TOW.goldDeep, background: 'rgba(184,134,47,0.12)', border: `1px solid ${TOW.lineStrong}` }}>
              <RxGlyph g={r.g} c={TOW.goldDeep} />
            </div>
            <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 15, color: TOW.goldDeep, letterSpacing: '0.02em', paddingTop: 1 }}>{r.name}</div>
            <div style={{ fontFamily: towFont.serif, fontSize: 14.5, lineHeight: 1.4, color: TOW.parchDim, marginTop: 1 }}>{r.desc}</div>
          </div>
        ))}
      </div>
    );
  }

  if (b.type === 'defs') {
    const items = (b.items as { name: string; desc: string }[]) || [];
    return (
      <div>
        {items.map((it, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 15, color: TOW.goldDeep }}>{it.name}</div>
            <div style={{ fontFamily: towFont.serif, fontSize: 14.5, lineHeight: 1.4, color: TOW.parchDim, marginTop: 1 }}>{it.desc}</div>
          </div>
        ))}
      </div>
    );
  }

  // note / fallback
  return (
    <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 15, lineHeight: 1.45, color: TOW.parchDim, marginBottom: 14 }}>
      {b.text}
    </div>
  );
}
