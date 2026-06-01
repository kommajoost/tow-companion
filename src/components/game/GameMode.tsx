import { useGame } from '../../game';
import { GameSetup } from './GameSetup';
import { GameView } from './GameView';

// Game tab: setup screen until a game (host/guest/solo) is active, then the army view.
export function GameMode() {
  const { seat } = useGame();
  return seat ? <GameView /> : <GameSetup />;
}
