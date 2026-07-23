import { usePersistentState } from '../../store';
import { useGame } from '../../game';
import { GameSetup } from './GameSetup';
import { GameView } from './GameView';
import { CampaignBattlePanel } from './CampaignBattlePanel';

// The "Game" tab: set up (host/join) a live battle, then track it turn by turn. Army building and
// the unit catalogue moved to the separate "Army" tab.
export function GameMode() {
  const { seat, code } = useGame();
  // A pending campaign-battle code (from the ?battle= deep-link, or set elsewhere) takes over the
  // setup screen with the campaign-battle flow — until the user is seated in a game or dismisses it.
  // Normal (no-code) game setup is unchanged.
  const [pendingBattle, setPendingBattle] = usePersistentState<string | null>('tow:campaign-battle', null);
  // A pending battle whose code we're NOT already seated in wins over a stale persisted game.
  // Without this, a left-over game (a `seat`/`code` from a previous session) shadowed the battle
  // link: the player would land back in their OLD game and never join the shared code, so both
  // players sat alone (opponent stayed empty). Opening the panel seats them on the shared code and
  // replaces the stale game. If we're already seated in the pending code, keep playing (GameView).
  const pending = pendingBattle ? pendingBattle.trim().toUpperCase() : null;
  const seatedInPending = !!pending && !!code && code.trim().toUpperCase() === pending;
  const showBattlePanel = !!pending && !seatedInPending;
  return (
    <div style={{ height: '100%', minHeight: 0 }}>
      {showBattlePanel ? (
        <CampaignBattlePanel code={pending as string} onDismiss={() => setPendingBattle(null)} />
      ) : seat ? (
        <GameView />
      ) : (
        <GameSetup />
      )}
    </div>
  );
}
