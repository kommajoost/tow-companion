import type { CSSProperties } from 'react';
import { TOW } from './tow';

// Old World emblems & line icons — ported from the design kit (tow-kit.jsx).

// Twin-tailed comet — neutral Old World emblem.
export function Comet({
  size = 24,
  color = TOW.gold,
  style = {},
}: {
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={style}>
      <g stroke={color} strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.9">
        <path d="M21 11 L7 27" />
        <path d="M21 11 L13 28" />
      </g>
      <g fill={color}>
        <path d="M21 4 L22.7 9.3 L28 11 L22.7 12.7 L21 18 L19.3 12.7 L14 11 L19.3 9.3 Z" />
      </g>
    </svg>
  );
}

export type PhaseId = 'strategy' | 'movement' | 'shooting' | 'combat' | 'magic';

// Phase glyphs (line icons, inherit color).
export function PhaseGlyph({
  id,
  size = 22,
  color = 'currentColor',
  sw = 1.5,
}: {
  id: PhaseId | string;
  size?: number;
  color?: string;
  sw?: number;
}) {
  const p = {
    fill: 'none',
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const wrap = (kids: React.ReactNode) => (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {kids}
    </svg>
  );
  switch (id) {
    case 'strategy': // war banner on a pole
      return wrap(
        <g {...p}>
          <path d="M7 3.2v17.6" />
          <path d="M7 4.4h11l-2.6 3.4L18 11.4H7" />
          <circle cx="7" cy="2.6" r="0.9" fill={color} stroke="none" />
        </g>,
      );
    case 'movement': // forward chevrons
      return wrap(
        <g {...p}>
          <path d="M5.5 5.5 12 12l-6.5 6.5" />
          <path d="M12.5 5.5 19 12l-6.5 6.5" />
        </g>,
      );
    case 'shooting': // arrow loosed
      return wrap(
        <g {...p}>
          <path d="M4 20 19 5" />
          <path d="M13 5h6v6" />
          <path d="M4 20l0-3.4M4 20l3.4 0" />
        </g>,
      );
    case 'combat': // crossed swords
      return wrap(
        <g {...p}>
          <path d="M5.5 18.5 16 8" />
          <path d="M14 6l4-1-1 4" />
          <path d="M18.5 18.5 8 8" />
          <path d="M10 6 6 5l1 4" />
          <path d="M4.5 19.5l2-2M19.5 19.5l-2-2" />
        </g>,
      );
    case 'magic': // arcane star
      return wrap(
        <g {...p}>
          <path d="M12 3v18M3 12h18M5.5 5.5l13 13M18.5 5.5l-13 13" />
        </g>,
      );
    default:
      return wrap(<circle cx="12" cy="12" r="6" {...p} />);
  }
}

// Small ornamental divider.
export function Ornament({
  w = 120,
  color = TOW.goldDeep,
  style = {},
}: {
  w?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={w}
      height="10"
      viewBox="0 0 120 10"
      fill="none"
      style={style}
      preserveAspectRatio="none"
    >
      <path d="M0 5h44" stroke={color} strokeWidth="1" />
      <path d="M120 5H76" stroke={color} strokeWidth="1" />
      <path d="M60 1.5l3.4 3.5L60 8.5 56.6 5z" fill={color} />
      <circle cx="49" cy="5" r="1.2" fill={color} />
      <circle cx="71" cy="5" r="1.2" fill={color} />
    </svg>
  );
}
