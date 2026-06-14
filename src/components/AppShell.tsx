import { useEffect, useState } from 'react';
import { usePersistentState } from '../store';
import { TOW } from '../design/tow';
import { HomeCover } from './HomeCover';
import { CompanionView } from './companion/CompanionView';
import { BrowseMode } from './BrowseMode';
import { GameMode } from './game/GameMode';
import { ArmyMode } from './game/ArmyMode';
import { SettingsMode } from './SettingsMode';
import { NavRail } from './NavRail';

type Tab = 'play' | 'browse' | 'game' | 'army' | 'settings';
type Screen = 'home' | 'app';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'play', label: 'Turns', icon: '⚔' },
  { id: 'browse', label: 'Rulebook', icon: '📖' },
  { id: 'game', label: 'Game', icon: '🎲' },
  { id: 'army', label: 'Army', icon: '🛡' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

// Wide (laptop/large tablet) → a slim global icon rail on the left instead of the bottom
// tab bar, which on the Turns screen yields the design's three-column layout. Phone keeps
// the bottom bar. 800px keeps the content pane ≥ ~720px (the companion's own wide breakpoint).
function useWide(threshold = 800) {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= threshold);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= threshold);
    window.addEventListener('resize', on);
    on();
    return () => window.removeEventListener('resize', on);
  }, [threshold]);
  return wide;
}

export function AppShell() {
  const [screen, setScreen] = usePersistentState<Screen>('tow:screen', 'home');
  const [tab, setTab] = usePersistentState<Tab>('tow:tab', 'play');
  const wide = useWide();

  // The ceremonial cover is the entry point; it has no navigation.
  if (screen === 'home') {
    return (
      <HomeCover
        onBegin={() => {
          setTab('play');
          setScreen('app');
        }}
        onArmy={() => {
          setTab('army');
          setScreen('app');
        }}
        onRulebook={() => {
          setTab('browse');
          setScreen('app');
        }}
      />
    );
  }

  const content = (
    <main className="relative min-h-0 flex-1 overflow-hidden">
      {/* Play is the full-width responsive companion; other tabs are centred + readable. */}
      {tab === 'play' ? (
        <CompanionView onHome={() => setScreen('home')} />
      ) : tab === 'game' ? (
        <GameMode />
      ) : tab === 'army' ? (
        <ArmyMode />
      ) : tab === 'settings' ? (
        <SettingsMode />
      ) : (
        <div className="h-full pt-safe">
          <BrowseMode />
        </div>
      )}
    </main>
  );

  // ── Wide: global icon rail + content pane (no bottom bar) ──
  if (wide) {
    return (
      <div className="flex h-full" style={{ flexDirection: 'row' }}>
        <NavRail tab={tab} onTab={setTab} onHome={() => setScreen('home')} />
        {content}
      </div>
    );
  }

  // ── Phone: content + bottom tab bar ──
  return (
    <div className="flex h-full flex-col">
      {content}
      <nav
        className="tow-leather flex items-stretch pb-safe"
        style={{ borderTop: `1px solid ${TOW.lineStrong}` }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px]"
              style={{ color: active ? TOW.goldDeep : TOW.muted, fontFamily: 'var(--font-display)' }}
            >
              <span className="text-lg" style={{ opacity: active ? 1 : 0.7 }}>
                {t.icon}
              </span>
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
