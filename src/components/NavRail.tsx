import { TOW, towFont } from '../design/tow';
import { LogoMark } from './LogoMark';
import { TurnsIcon, RulebookIcon, GameIcon, ArmyIcon, SettingsIcon } from '../design/icons';

// Global icon rail shown on wide screens (replaces the bottom tab bar on laptop/tablet).
// A slim deeper-parchment column: emblem → Home at the top, the four main sections, and
// Settings pinned at the bottom. The contextual sidebar (per screen) sits to its right.

export type NavTab = 'play' | 'browse' | 'game' | 'army' | 'settings';

const RAIL_BG = TOW.leatherDark; // a touch deeper than the content parchment (theme-aware)
const mutedIcon = TOW.muted; // inactive icon colour — flips with the theme

const SECTIONS: { id: NavTab; label: string; icon: (active: boolean) => React.ReactNode }[] = [
  { id: 'play', label: 'Turns', icon: (a) => <TurnsIcon size={21} color={a ? TOW.goldDeep : mutedIcon} /> },
  { id: 'browse', label: 'Rulebook', icon: (a) => <RulebookIcon size={21} color={a ? TOW.goldDeep : mutedIcon} /> },
  { id: 'game', label: 'Game', icon: (a) => <GameIcon size={21} color={a ? TOW.goldDeep : mutedIcon} /> },
  { id: 'army', label: 'Army', icon: (a) => <ArmyIcon size={21} color={a ? TOW.goldDeep : mutedIcon} /> },
];

function RailItem({ active, label, icon, onClick, tour }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void; tour?: string }) {
  return (
    <button
      onClick={onClick}
      data-tour={tour}
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
        <RailItem key={s.id} tour={`rail-${s.id}`} active={tab === s.id} label={s.label} icon={s.icon(tab === s.id)} onClick={() => onTab(s.id)} />
      ))}

      <div style={{ marginTop: 'auto', width: 40, height: 1, background: TOW.line, margin: 'auto auto 8px' }} />
      <RailItem tour="rail-settings" active={tab === 'settings'} label="Settings" icon={<SettingsIcon size={21} color={tab === 'settings' ? TOW.goldDeep : mutedIcon} />} onClick={() => onTab('settings')} />
    </div>
  );
}
