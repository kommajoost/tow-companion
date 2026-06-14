import { useState } from 'react';
import { TOW, towFont } from '../../design/tow';
import { ArmyBrowser } from './ArmyBrowser';
import { ListBuilder } from './ListBuilder';

const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

// The "Army" tab: build your army list (default) or browse the unit catalogue. Split out of the
// old "Armies" section so the live battle ("Game" tab) stands on its own.
export function ArmyMode() {
  const [mode, setMode] = useState<'build' | 'browse'>('build');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', padding: '8px 10px 6px', borderBottom: `1px solid ${TOW.line}` }}>
        <div style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 10, background: 'rgba(74,55,22,0.07)', border: `1px solid ${TOW.line}` }}>
          {([['build', 'Army'], ['browse', 'Browse']] as const).map(([k, label]) => {
            const on = k === mode;
            return (
              <button key={k} onClick={() => setMode(k)}
                style={{ padding: '5px 13px', borderRadius: 7, cursor: 'pointer', border: 'none', fontFamily: towFont.display, fontWeight: 600, fontSize: 12, letterSpacing: '0.03em', background: on ? goldGrad : 'transparent', color: on ? TOW.onGrad : TOW.muted }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === 'browse' ? <ArmyBrowser /> : <ListBuilder />}
      </div>
    </div>
  );
}
