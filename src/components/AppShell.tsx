import { usePersistentState } from '../store';
import { TOW } from '../design/tow';
import { HomeCover } from './HomeCover';
import { CompanionView } from './companion/CompanionView';
import { BrowseMode } from './BrowseMode';
import { FavoritesMode } from './FavoritesMode';
import { GameMode } from './game/GameMode';
import { SettingsMode } from './SettingsMode';

type Tab = 'play' | 'browse' | 'game' | 'favorites' | 'settings';
type Screen = 'home' | 'app';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'play', label: 'Turns', icon: '⚔' },
  { id: 'browse', label: 'Rulebook', icon: '📖' },
  { id: 'game', label: 'Armies', icon: '🛡' },
  { id: 'favorites', label: 'Pinned', icon: '★' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export function AppShell() {
  const [screen, setScreen] = usePersistentState<Screen>('tow:screen', 'home');
  const [tab, setTab] = usePersistentState<Tab>('tow:tab', 'play');

  // The ceremonial cover is the entry point; it has no bottom navigation.
  if (screen === 'home') {
    return (
      <HomeCover
        onBegin={() => {
          setTab('play');
          setScreen('app');
        }}
        onRulebook={() => {
          setTab('browse');
          setScreen('app');
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <main className="relative min-h-0 flex-1 overflow-hidden">
        {/* Play is the full-width responsive companion; other tabs are centred + readable. */}
        {tab === 'play' ? (
          <CompanionView onHome={() => setScreen('home')} />
        ) : tab === 'game' ? (
          <GameMode />
        ) : tab === 'settings' ? (
          <SettingsMode />
        ) : (
          <div className="mx-auto h-full max-w-2xl pt-safe">
            {tab === 'browse' && <BrowseMode />}
            {tab === 'favorites' && <FavoritesMode />}
          </div>
        )}
      </main>

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
