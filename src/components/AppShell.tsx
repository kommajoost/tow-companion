import { useCallback, useEffect, useRef, useState } from 'react';
import { IS_TEST_DB } from '../lib/supabase';
import { koppelViaCodeTestOnly } from '../lib/campaign';
import { usePersistentState, setPersisted } from '../store';
import { TOW } from '../design/tow';
import { useAuth } from '../lib/auth';
import { HomeCover } from './HomeCover';
import { CompanionView } from './companion/CompanionView';
import { BrowseMode } from './BrowseMode';
import { GameMode } from './game/GameMode';
import { ListBuilder } from './game/ListBuilder';
import { SettingsMode } from './SettingsMode';
import { NavRail } from './NavRail';
import { CeledonTour } from './CeledonTour';
import { CeledonLoginDialog } from './CeledonLoginDialog';
import { TestAccountSwitcher } from './TestAccountSwitcher';
import { TowIcon, type IconId } from '../design/icons';
import { useBackClose } from '../lib/backStack';
import { TEST_TOOLS_KEY } from '../lib/testBattle';

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
  const { session, loading: authLoading } = useAuth();
  const [celedonEntry, setCeledonEntry] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).has('celedon');
  });
  const celedonTourStarted = useRef(false);
  const wide = useWide();

  // Deep-link: /?koppel=<code> — ALLEEN op een testbuild (26-08-2026). Zet de campagne-context uit
  // een koppelcode in de cache, zodat de battle-brug weet welke kant je speelt. Op de echte app
  // gebeurt dat door in te loggen; daar is deze parameter dood (koppelViaCodeTestOnly weigert).
  // Moet VOOR de ?battle=-hook staan in leesorde, maar de battle-panel leest de cache pas bij het
  // renderen, dus de volgorde van de effecten zelf maakt niet uit.
  useEffect(() => {
    if (typeof window === 'undefined' || !IS_TEST_DB) return;
    const url = new URL(window.location.href);
    const code = (url.searchParams.get('koppel') || '').trim().toUpperCase();
    if (!code) return;
    void koppelViaCodeTestOnly(code).finally(() => {
      url.searchParams.delete('koppel');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      // De battle-brug leest de cache synchroon bij het renderen, dus één nudge is nodig zodra de
      // context binnen is. setScreen zet 'app' toch al; dit dwingt een re-render af.
      setScreen('app');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link: /?battle=<code> opens a campaign battle (mirrors the campaign app's ?campaign=<code>).
  // Deep-link: /?testtools=1 zet het testgereedschap AAN op dit apparaat, /?testtools=0 weer uit.
  // Daarmee staat de testbattle alleen op het scherm van wie hem zelf heeft aangezet, in plaats van
  // bij elke speler in de campagne. Zelfde vorm als ?battle= hieronder: lezen, opslaan, opruimen.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = new URLSearchParams(window.location.search).get('testtools');
    if (raw === null) return;
    setPersisted(TEST_TOOLS_KEY, raw !== '0' && raw.toLowerCase() !== 'false');
    const url = new URL(window.location.href);
    url.searchParams.delete('testtools');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Alleen de battle-parameter weghalen: ?koppel= wordt door de hook hierboven zelf opgeruimd, en
    // die kan nog aan het werk zijn. window.location.pathname zou hem stilletjes wissen.
    const url = new URL(window.location.href);
    url.searchParams.delete('battle');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link: /?army=1 — "Open Companion" vanaf de Army-hub van de campagne. Alleen ROUTEREN naar
  // de lijstbouwer, zonder de rondleiding: die knop is voor een speler die elke Act z'n lijst komt
  // bijwerken, en die moet niet telkens de 35-staps tour krijgen. Zonder param herstelde OWC gewoon
  // je laatste tab — voor wie ooit een campagne-battle opende was dat de Game-tab met een dode code,
  // en dan landde je op "Could not load this battle" i.p.v. op je leger (Joost 02-08).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.get('army')) return;
    setScreen('app');
    setTab('army');
    url.searchParams.delete('army');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link: /?celedon=1 — arriving from the campaign app's "Open Old World Companion" button.
  // Land straight on Army, then wait for OWC's own auth session. Signed out players see the account
  // dialog first; signed in players go straight into the guided Army-list tour.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.get('celedon')) return;
    setPersisted('tow:celedon-tour', 'waiting-login');
    setScreen('app');
    setTab('army');
    url.searchParams.delete('celedon');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every explicit hand-off from Preparation starts the Army-list tutorial, even when this device
  // completed it before. A successful login updates the auth store and follows this same path.
  useEffect(() => {
    if (!celedonEntry || authLoading || !session || celedonTourStarted.current) return;
    celedonTourStarted.current = true;
    setPersisted('tow:celedon-tour', 'pending');
    setCeledonEntry(false);
  }, [authLoading, celedonEntry, session]);

  const cancelCeledonEntry = useCallback(() => {
    setPersisted('tow:celedon-tour', 'done');
    setCeledonEntry(false);
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

  // TESTBUILD-MARKERING (26-08-2026): een bundel die op de TESTdatabase praat mag er nooit uitzien
  // als de echte app -- dan rapporteer je een potje in de verkeerde wereld. Op een productiebundel
  // is IS_TEST_DB false en rendert dit niets.
  const testMerk = IS_TEST_DB ? (
    <div
      aria-hidden
      style={{
        position: 'fixed', top: 0, left: 0, zIndex: 9999, pointerEvents: 'none',
        background: '#7f1d1d', color: '#fff', font: '700 10px/1 system-ui, sans-serif',
        letterSpacing: '.12em', padding: '4px 8px', borderBottomRightRadius: 6,
      }}
    >
      TESTDATABASE
    </div>
  ) : null;

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
        {testMerk}
        {tabBackLayers}
        <NavRail tab={tab} onTab={navTab} onHome={() => setScreen('home')} />
        {content}
        <CeledonTour />
        <CeledonLoginDialog
          open={celedonEntry && !authLoading && !session}
          onCancel={cancelCeledonEntry}
        />
      </div>
    );
  }

  // ── Phone: content + bottom tab bar ──
  return (
    <div className="flex h-full flex-col">
      {testMerk}
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
        {/* Testaccount-switcher: alleen zichtbaar zodra er testaccounts geconfigureerd zijn. */}
        <TestAccountSwitcher placement="tabbar" />
      </nav>
      <CeledonTour />
      <CeledonLoginDialog
        open={celedonEntry && !authLoading && !session}
        onCancel={cancelCeledonEntry}
      />
    </div>
  );
}
