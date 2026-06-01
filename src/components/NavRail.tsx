import { TOW, towFont } from '../design/tow';
import { LogoMark } from './LogoMark';

// Global icon rail shown on wide screens (replaces the bottom tab bar on laptop/tablet).
// A slim deeper-parchment column: emblem → Home at the top, the four main sections, and
// Settings pinned at the bottom. The contextual sidebar (per screen) sits to its right.

export type NavTab = 'play' | 'browse' | 'game' | 'favorites' | 'settings';

const RAIL_BG = '#d9caa3'; // a touch deeper than the content parchment
const mutedIcon = 'rgba(134,116,83,0.85)';

const I = ({ d, size = 21, c, sw = 1.6 }: { d: React.ReactNode; size?: number; c: string; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
    <g fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</g>
  </svg>
);
const Swords = (c: string) => <I c={c} sw={1.7} d={<g><path d="M14.5 4H20v5.5L9.5 20 4 14.5z" /><path d="M14.5 9.5 20 4" /><path d="M4 4h5.5L20 14.5 14.5 20 4 9.5z" /><path d="M9.5 14.5 4 20" /></g>} />;
const Book = (c: string) => <I c={c} sw={1.7} d={<g><path d="M12 6.5C10.5 5 8 4.5 4 4.7v12.6c4-.2 6.5.3 8 1.7" /><path d="M12 6.5C13.5 5 16 4.5 20 4.7v12.6c-4-.2-6.5.3-8 1.7" /><path d="M12 6.5V19" /></g>} />;
const Shield = (c: string) => <I c={c} sw={1.6} d={<path d="M12 3.5l7 2.4v5.2c0 4.2-2.9 7.3-7 8.9-4.1-1.6-7-4.7-7-8.9V5.9z" />} />;
const Mark = (c: string, filled: boolean) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? c : 'none'} style={{ display: 'block' }}>
    <path d="M6.5 4h11a1 1 0 0 1 1 1v15.4l-6.5-4.4L5.5 20.4V5a1 1 0 0 1 1-1z" stroke={c} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);
const Gear = (c: string) => <I c={c} sw={1.6} d={<g><circle cx="12" cy="12" r="3.2" /><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5M18.4 18.4l-1.5-1.5M7.1 7.1 5.6 5.6" /></g>} />;

const SECTIONS: { id: NavTab; label: string; icon: (active: boolean) => React.ReactNode }[] = [
  { id: 'play', label: 'Turns', icon: (a) => Swords(a ? TOW.goldDeep : mutedIcon) },
  { id: 'browse', label: 'Rulebook', icon: (a) => Book(a ? TOW.goldDeep : mutedIcon) },
  { id: 'game', label: 'Armies', icon: (a) => Shield(a ? TOW.goldDeep : mutedIcon) },
  { id: 'favorites', label: 'Pinned', icon: (a) => Mark(a ? TOW.goldDeep : mutedIcon, a) },
];

function RailItem({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        width: 60,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '9px 0',
        borderRadius: 12,
        cursor: 'pointer',
        border: 'none',
        background: active ? 'rgba(138,108,48,0.13)' : 'transparent',
        color: active ? TOW.goldDeep : TOW.muted,
      }}
    >
      {active && <span style={{ position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, borderRadius: 99, background: TOW.goldDeep }} />}
      {icon}
      <span style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 8.5, letterSpacing: '0.04em' }}>{label}</span>
    </button>
  );
}

export function NavRail({ tab, onTab, onHome }: { tab: NavTab; onTab: (t: NavTab) => void; onHome: () => void }) {
  return (
    <div
      style={{
        width: 76,
        flexShrink: 0,
        height: '100%',
        boxSizing: 'border-box',
        background: RAIL_BG,
        borderRight: `1px solid ${TOW.lineStrong}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '14px 0 12px',
        paddingTop: 'max(14px, env(safe-area-inset-top))',
        gap: 6,
      }}
    >
      <button onClick={onHome} aria-label="Home" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, marginBottom: 8 }}>
        <LogoMark size={38} radius={10} />
      </button>

      {SECTIONS.map((s) => (
        <RailItem key={s.id} active={tab === s.id} label={s.label} icon={s.icon(tab === s.id)} onClick={() => onTab(s.id)} />
      ))}

      <div style={{ marginTop: 'auto', width: 40, height: 1, background: TOW.line, margin: 'auto auto 8px' }} />
      <RailItem active={tab === 'settings'} label="Settings" icon={Gear(tab === 'settings' ? TOW.goldDeep : mutedIcon)} onClick={() => onTab('settings')} />
    </div>
  );
}
