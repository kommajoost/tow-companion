import { useEffect, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import type { BronSoort, KanaalType, Waardering } from '../../lib/tactics';

export const eb = engraved as React.CSSProperties;

/** Lijst links, geopend item rechts vanaf deze breedte (de Fold opengeklapt). */
export function useTacticsWide(threshold = 760) {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= threshold);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= threshold);
    window.addEventListener('resize', on);
    on();
    return () => window.removeEventListener('resize', on);
  }, [threshold]);
  return wide;
}

export const TYPE_LABEL: Record<KanaalType, string> = {
  youtube: 'YouTube',
  artikel: 'Articles',
  wiki: 'Wiki',
  data: 'Data',
};

export const WAARDERING_LABEL: Record<Waardering, string> = { A: 'Core', B: 'Useful', C: 'Marginal' };

export const SOORT_LABEL: Record<BronSoort, string> = {
  'tactics': 'Tactics',
  'list-building': 'Lists',
  'army-review': 'Army review',
  'rules-explained': 'Rules',
  'battle-report': 'Battle report',
  'meta': 'Meta',
  'other': 'Other',
};

export function legerLabel(slug: string | null): string {
  if (!slug) return 'General';
  return slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

export const meervoud = (n: number, een: string, veel: string) => `${n} ${n === 1 ? een : veel}`;

// ── Stijlen ─────────────────────────────────────────────────────────────────

export const rowCard: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 4,
  width: '100%',
  minWidth: 0,
  border: `1px solid ${TOW.line}`,
  borderRadius: 12,
  background: TOW.panel2,
  overflow: 'hidden',
};

export const rowButton: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  padding: '10px 12px',
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  color: TOW.ink,
  font: 'inherit',
};

export const titleText: React.CSSProperties = {
  fontFamily: towFont.display,
  fontWeight: 600,
  fontSize: 15,
  color: TOW.ink,
  lineHeight: 1.3,
  overflowWrap: 'anywhere',
};

export const metaText: React.CSSProperties = {
  fontFamily: towFont.serif,
  fontSize: 12.5,
  color: TOW.muted,
  lineHeight: 1.4,
  display: 'flex',
  flexWrap: 'wrap',
  columnGap: 6,
  rowGap: 0,
};

export const bodyText: React.CSSProperties = {
  fontFamily: towFont.serif,
  fontSize: 14,
  color: TOW.parchDim,
  lineHeight: 1.45,
  overflowWrap: 'anywhere',
};

export const clamp2: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

export const sectionHead: React.CSSProperties = {
  ...eb,
  fontSize: 10,
  color: TOW.goldDeep,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  margin: '18px 2px 8px',
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  minHeight: 40,
  padding: '9px 12px',
  borderRadius: 11,
  border: `1px solid ${TOW.lineStrong}`,
  background: TOW.bg,
  color: TOW.ink,
  fontFamily: towFont.serif,
  fontSize: 15,
  outline: 'none',
};

/** Meta-onderdelen gescheiden door een punt; lege delen vallen weg. */
export function Meta({ parts, style }: { parts: (React.ReactNode | null | false | undefined)[]; style?: React.CSSProperties }) {
  const vol = parts.filter((p) => p !== null && p !== false && p !== undefined && p !== '');
  if (vol.length === 0) return null;
  return (
    <span style={{ ...metaText, ...style }}>
      {vol.map((p, i) => (
        <span key={i} style={{ whiteSpace: 'nowrap' }}>
          {i > 0 && <span aria-hidden style={{ marginRight: 6, color: TOW.faint }}>·</span>}
          {p}
        </span>
      ))}
    </span>
  );
}

export function Badge({ children, tone = 'gold' }: { children: React.ReactNode; tone?: 'gold' | 'blood' | 'muted' }) {
  const kleur = tone === 'blood' ? TOW.blood : tone === 'muted' ? TOW.muted : TOW.goldDeep;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', flexShrink: 0,
        padding: '1px 7px', borderRadius: 999, border: `1px solid ${kleur}`, color: kleur,
        fontFamily: towFont.display, fontWeight: 600, fontSize: 10.5, letterSpacing: '0.04em', lineHeight: 1.5,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** Een chip in een filterrij: minstens 36 px hoog. */
export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{
        flexShrink: 0, minHeight: 36, padding: '0 13px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
        border: `1px solid ${on ? TOW.goldDeep : TOW.lineStrong}`,
        background: on ? 'rgba(138,108,48,0.14)' : 'transparent',
        color: on ? TOW.goldDeep : TOW.parchDim,
        fontFamily: towFont.display, fontWeight: 600, fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}

/** Horizontaal scrollende chiprij, zonder dat de pagina zelf breder wordt. */
export function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 0 4px', minWidth: 0, maxWidth: '100%' }}>
      {children}
    </div>
  );
}

const pijl = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
  </svg>
);

/** Vierkante knop met alleen het extern-icoon, naast een rij. */
export function ExternalIcon({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      onClick={(e) => e.stopPropagation()}
      style={{
        flexShrink: 0, width: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: TOW.goldDeep, borderLeft: `1px solid ${TOW.hairline}`, textDecoration: 'none',
      }}
    >
      {pijl}
    </a>
  );
}

/** Tekstknop die een externe pagina opent. */
export function ExternalButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 40, padding: '0 14px', borderRadius: 11,
        border: `1px solid ${TOW.lineStrong}`, color: TOW.goldDeep, textDecoration: 'none',
        fontFamily: towFont.display, fontWeight: 600, fontSize: 14, maxWidth: '100%',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
      {pijl}
    </a>
  );
}

export function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0, minHeight: 40, padding: '0 10px 0 4px', border: 'none', background: 'none', cursor: 'pointer',
        color: TOW.parchDim, fontFamily: towFont.display, fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4,
      }}
    >
      <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>‹</span>{label}
    </button>
  );
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p style={{ ...bodyText, color: TOW.muted, margin: '16px 2px' }}>{children}</p>;
}
