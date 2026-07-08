import { usePersistentState } from '../../store';
import { useGame } from '../../game';
import { GameSetup } from './GameSetup';
import { GameView } from './GameView';
import { CampaignBattlePanel } from './CampaignBattlePanel';

// The "Game" tab: set up (host/join) a live battle, then track it turn by turn. Army building and
// the unit catalogue moved to the separate "Army" tab.
export function GameMode() {
  const { seat } = useGame();
  // A pending campaign-battle code (from the ?battle= deep-link, or set elsewhere) takes over the
  // setup screen with the campaign-battle flow — until the user is seated in a game or dismisses it.
  // Normal (no-code) game setup is unchanged.
  const [pendingBattle, setPendingBattle] = usePersistentState<string | null>('tow:campaign-battle', null);
  return (
    <div style={{ height: '100%', minHeight: 0 }}>
      {seat ? (
        <GameView />
      ) : pendingBattle ? (
        <CampaignBattlePanel code={pendingBattle} onDismiss={() => setPendingBattle(null)} />
      ) : (
        <GameSetup />
      )}
    </div>
  );
}
