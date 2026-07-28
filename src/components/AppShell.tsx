import { useCallback, useEffect, useState } from 'react';
import { usePersistentState, setPersisted, getPersisted } from '../store';
import { TOW } from '../design/tow';
import { HomeCover } from './HomeCover';
import { CompanionView } from './companion/CompanionView';
import { BrowseMode } from './BrowseMode';
import { GameMode } from './game/GameMode';
import { ListBuilder } from './game/ListBuilder';
import { SettingsMode } from './SettingsMode';
import { NavRail } from './NavRail';
import { CeledonTour } from './CeledonTour';
import { TowIcon, type IconId } from '../design/icons';
import { useBackClose } from '../lib/backStack';

type Tab = 'play' | 'browse' | 'game' | 'army' | 'settings';
type Screen = 'home' | 'app';

// One back-stack registrant per visited tab in the in-memory tab history, so a hardware Back
// returns to the previously-viewed tab (one level at a time) instead of leaving the app. Uses the
// SAME central LIFO stack as the overlay layers, so any open modal/sheet/builder (registered later)
// always handles Back first; only once those are closed do these tab entries take a press.
function TabBackLayer({ onBack }: { onBack: () => void }) {
  useBackClose(true, onBack);
  return null;
}

const TABS: { id: Tab; label: string; icon: IconId }[] = [
  { id: 'play', label: 'Turns', icon: 'turns' },
  { id: 'browse', label: 'Rulebook', icon: 'rulebook' },
  { id: 'game', label: 'Game', icon: 'game' },
  { id: 'army', label: 'Army', icon: 'army' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
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

  // Deep-link: /?battle=<code> opens a campaign battle (mirrors the campaign app's ?campaign=<code>).
  // Stash the code for the Game tab's campaign-battle flow, jump straight into the app on the Game
  // tab, then strip the query so a reload doesn't re-trigger it. Runs once at mount; flows WITHOUT
  // ?battle= are untouched (the effect no-ops), so existing behaviour is unchanged.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = new URLSearchParams(window.location.search).get('battle');
    const code = (raw || '').trim().toUpperCase();
    if (!code) return;
    setPersisted('tow:campaign-battle', code);
    setScreen('app');
    setTab('game');
    window.history.replaceState(null, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link: /?celedon=1 — arriving from the campaign app's "Open Old World Companion" button.
  // Land straight on Army (skipping the cover, which would be a dead end for someone who has never
  // seen this app) and arm the guided tour. The sign-in itself already happened in lib/auth.ts.
  // The tour only offers itself ONCE per device; Settings has a restart button.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.get('celedon')) return;
    if (getPersisted<string | null>('tow:celedon-tour', null) === null) {
      setPersisted('tow:celedon-tour', 'pending');
    }
    setScreen('app');
    setTab('army');
    url.searchParams.delete('celedon');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In-memory history of tabs visited this session (oldest → newest-but-one). Switching to a new
  // tab pushes the one we're leaving; a hardware Back pops it and restores it. Not persisted — on a
  // fresh load there's nowhere "back" to go, so Back from the entry tab exits the app (correct).
  const [tabHistory, setTabHistory] = useState<Tab[]>([]);

  // Switch tabs while remembering where we came from (so Back can return there). No-op for the
  // current tab so re-tapping the active tab doesn't grow history.
  const navTab = useCallback((t: Tab) => {
    setTab((cur) => {
      if (t === cur) return cur;
      setTabHistory((h) => [...h, cur]);
      return t;
    });
  }, [setTab]);

  // Back: drop the most recent history entry and return to it. Each TabBackLayer below maps to one
  // entry, so one Back press restores exactly one level.
  const goBackTab = useCallback(() => {
    setTabHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setTab(prev);
      return h.slice(0, -1);
    });
  }, [setTab]);

  // The ceremonial cover is the entry point; it has no navigation. Leaving to / returning from the
  // cover resets tab history — the shell unmounts its content, so there's no "back" across it.
  const enterApp = (t: Tab) => { setTabHistory([]); setTab(t); setScreen('app'); };
  if (screen === 'home') {
    return (
      <HomeCover
        onBegin={() => enterApp('play')}
        onArmy={() => enterApp('army')}
        onRulebook={() => enterApp('browse')}
      />
    );
  }

  // One Back-trap per remembered tab, so Back walks back through visited tabs one at a time before
  // it's allowed to leave the app. Rendered alongside the content in both layouts.
  const tabBackLayers = tabHistory.map((_, i) => <TabBackLayer key={i} onBack={goBackTab} />);

  const content = (
    <main className="relative min-h-0 flex-1 overflow-hidden">
      {/* Play is the full-width responsive companion; other tabs are centred + readable. */}
      {tab === 'play' ? (
        <CompanionView onHome={() => setScreen('home')} />
      ) : tab === 'game' ? (
        <GameMode />
      ) : tab === 'army' ? (
        <ListBuilder />
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
        {tabBackLayers}
        <NavRail tab={tab} onTab={navTab} onHome={() => setScreen('home')} />
        {content}
        <CeledonTour />
      </div>
    );
  }

  // ── Phone: content + bottom tab bar ──
  return (
    <div className="flex h-full flex-col">
      {tabBackLayers}
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
              onClick={() => navTab(t.id)}
              data-tour={`tab-${t.id}`}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px]"
              style={{ color: active ? TOW.goldDeep : TOW.muted, fontFamily: 'var(--font-display)' }}
            >
              <TowIcon id={t.icon} size={22} color={active ? TOW.goldDeep : TOW.muted} />
              {t.label}
            </button>
          );
        })}
      </nav>
      <CeledonTour />
    </div>
  );
}
