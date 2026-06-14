import { TOW, towFont } from '../design/tow';
import { LogoMark } from './LogoMark';

// Global icon rail shown on wide screens (replaces the bottom tab bar on laptop/tablet).
// A slim deeper-parchment column: emblem → Home at the top, the four main sections, and
// Settings pinned at the bottom. The contextual sidebar (per screen) sits to its right.

export type NavTab = 'play' | 'browse' | 'game' | 'army' | 'settings';

const RAIL_BG = TOW.leatherDark; // a touch deeper than the content parchment (theme-aware)
const mutedIcon = TOW.muted; // inactive icon colour — flips with the theme

const I = ({ d, size = 21, c, sw = 1.6 }: { d: React.ReactNode; size?: number; c: string; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
    <g fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</g>
  </svg>
);
const Swords = (c: string) => <I c={c} sw={1.7} d={<g><path d="M14.5 4H20v5.5L9.5 20 4 14.5z" /><path d="M14.5 9.5 20 4" /><path d="M4 4h5.5L20 14.5 14.5 20 4 9.5z" /><path d="M9.5 14.5 4 20" /></g>} />;
const Book = (c: string) => <I c={c} sw={1.7} d={<g><path d="M12 6.5C10.5 5 8 4.5 4 4.7v12.6c4-.2 6.5.3 8 1.7" /><path d="M12 6.5C13.5 5 16 4.5 20 4.7v12.6c-4-.2-6.5.3-8 1.7" /><path d="M12 6.5V19" /></g>} />;
const Shield = (c: string) => <I c={c} sw={1.6} d={<path d="M12 3.5l7 2.4v5.2c0 4.2-2.9 7.3-7 8.9-4.1-1.6-7-4.7-7-8.9V5.9z" />} />;
const Dice = (c: string) => <I c={c} sw={1.6} d={<g><rect x="4" y="4" width="16" height="16" rx="3.5" /><circle cx="9" cy="9" r="1.1" fill={c} stroke="none" /><circle cx="15" cy="9" r="1.1" fill={c} stroke="none" /><circle cx="12" cy="12" r="1.1" fill={c} stroke="none" /><circle cx="9" cy="15" r="1.1" fill={c} stroke="none" /><circle cx="15" cy="15" r="1.1" fill={c} stroke="none" /></g>} />;
const Gear = (c: string) => <I c={c} sw={1.5} d={<g><circle cx="12" cy="12" r="3" /><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4z" /></g>} />;

const SECTIONS: { id: NavTab; label: string; icon: (active: boolean) => React.ReactNode }[] = [
  { id: 'play', label: 'Turns', icon: (a) => Swords(a ? TOW.goldDeep : mutedIcon) },
  { id: 'browse', label: 'Rulebook', icon: (a) => Book(a ? TOW.goldDeep : mutedIcon) },
  { id: 'game', label: 'Game', icon: (a) => Dice(a ? TOW.goldDeep : mutedIcon) },
  { id: 'army', label: 'Army', icon: (a) => Shield(a ? TOW.goldDeep : mutedIcon) },
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
