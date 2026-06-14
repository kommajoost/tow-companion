import { useGame } from '../../game';
import { GameSetup } from './GameSetup';
import { GameView } from './GameView';

// The "Game" tab: set up (host/join) a live battle, then track it turn by turn. Army building and
// the unit catalogue moved to the separate "Army" tab.
export function GameMode() {
  const { seat } = useGame();
  return <div style={{ height: '100%', minHeight: 0 }}>{seat ? <GameView /> : <GameSetup />}</div>;
}
