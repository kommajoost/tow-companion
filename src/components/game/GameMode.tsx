import { useState } from 'react';
import { useGame } from '../../game';
import { TOW, towFont } from '../../design/tow';
import { GameSetup } from './GameSetup';
import { GameView } from './GameView';
import { ArmyBrowser } from './ArmyBrowser';

const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

// Game tab: a slim toggle between "My game" (setup until a game is active, then the army view)
// and "Browse armies" (the read-only unit catalogue, sourced from Old World Builder).
export function GameMode() {
  const { seat } = useGame();
  const [mode, setMode] = useState<'game' | 'browse'>('game');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', padding: '8px 10px 6px', borderBottom: `1px solid ${TOW.line}` }}>
        <div style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 10, background: 'rgba(74,55,22,0.07)', border: `1px solid ${TOW.line}` }}>
          {([['game', 'My game'], ['browse', 'Browse armies']] as const).map(([k, label]) => {
            const on = k === mode;
            return (
              <button key={k} onClick={() => setMode(k)}
                style={{ padding: '5px 14px', borderRadius: 7, cursor: 'pointer', border: 'none', fontFamily: towFont.display, fontWeight: 600, fontSize: 12, letterSpacing: '0.03em', background: on ? goldGrad : 'transparent', color: on ? '#2a1a0a' : TOW.muted }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === 'browse' ? <ArmyBrowser /> : seat ? <GameView /> : <GameSetup />}
      </div>
    </div>
  );
}
