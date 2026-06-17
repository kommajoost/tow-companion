// Clean, mostly-monochrome line icons for the terrain types and the difficult/dangerous traits.
// Each is drawn in a 0 0 24 24 viewBox with no fill, so it inherits stroke colour from its parent
// (currentColor). Used both in the setup list (HTML <svg>) and on the board (nested SVG per piece).

import type { ReactNode } from 'react';

// The inner paths for each terrain type — render inside an <svg viewBox="0 0 24 24"> wrapper.
export const terrainIconNode = (type: string): ReactNode => {
  switch (type) {
    case 'hill':
      return <><path d="M2 19h20" /><path d="M3 19l5-7 4 5 4-6 5 8" /></>;
    case 'wood':
      return <><path d="M12 3l6 10H6z" /><path d="M12 13v7" /></>;
    case 'building':
      return <><path d="M4 21V10l8-6 8 6v11Z" /><path d="M10 21v-6h4v6" /></>;
    case 'ruins':
      return <><path d="M4 21V11l3 1V8l4 2V7l3 2 3-1v10Z" /><path d="M4 21h16" /></>;
    case 'marsh':
      return <><path d="M3 10q3-3 6 0t6 0 6 0" /><path d="M3 15q3-3 6 0t6 0 6 0" /></>;
    case 'obstacle':
      return <><path d="M6 4v16M12 4v16M18 4v16" /><path d="M3 9h18M3 15h18" /></>;
    case 'field':
      return <><path d="M12 21V7" /><path d="M12 9l3-2M12 9 9 7M12 13l3-2M12 13 9 11M12 17l3-2M12 17 9 15" /></>;
    default:
      return <rect x="5" y="5" width="14" height="14" rx="2" />;
  }
};

// Small trait markers.
export const traitIconNode = (trait: 'difficult' | 'dangerous'): ReactNode =>
  trait === 'dangerous'
    ? <><path d="M12 4l9 16H3Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>
    : <path d="M3 14l4-4 4 4 4-4 4 4" />;

// Convenience wrapper for HTML contexts (the setup list).
export function TerrainIcon({ type, size = 18, color = 'currentColor', strokeWidth = 1.7 }: { type: string; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {terrainIconNode(type)}
    </svg>
  );
}

export function TraitIcon({ trait, size = 14, color = 'currentColor', strokeWidth = 1.8 }: { trait: 'difficult' | 'dangerous'; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {traitIconNode(trait)}
    </svg>
  );
}
