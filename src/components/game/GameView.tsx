import { useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { parseArmyList } from '../../lib/armyParser';
import { UnitCard } from './UnitCard';
import { OwbInstructions } from './OwbInstructions';
import type { Army, ArmyUnit } from '../../types';

const eb = engraved as React.CSSProperties;

// Active game: a code badge, a You / Opponent toggle, and the selected army's units.
// In solo mode you can paste the opponent army here too.
export function GameView() {
  const { code, seat, myArmy, myName, opponentArmy, opponentName, setMyArmy, setOpponentArmy, leaveGame } = useGame();
  const [side, setSide] = useState<'me' | 'opp'>('me');

  const army: Army | null = side === 'me' ? myArmy : opponentArmy;
  const label = side === 'me' ? myName || 'You' : opponentName || 'Opponent';

  // Both armies are editable (you can track spells for yourself and your opponent). Edits to
  // a column sync to the other player in an online game.
  const editable = true;
  const applyArmy = side === 'me' ? setMyArmy : setOpponentArmy;
  const onUnitChange = (unitId: string, patch: Partial<ArmyUnit>) => {
    if (!army) return;
    applyArmy({ ...army, units: army.units.map((u) => (u.id === unitId ? { ...u, ...patch } : u)) });
  };

  const groups: { category: string; units: ArmyUnit[] }[] = [];
  if (army) {
    for (const u of army.units) {
      let g = groups.find((x) => x.category === u.category);
      if (!g) { g = { category: u.category, units: [] }; groups.push(g); }
      g.units.push(u);
    }
  }

  return (
    <div className="tow-field" style={{ height: '100%', display: 'flex', flexDirection: 'column', color: TOW.ink }}>
      <div className="tow-leather" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${TOW.lineStrong}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>Game</div>
          {code ? (
            <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 18, color: TOW.goldDeep, letterSpacing: '0.18em' }}>{code}</div>
          ) : (
            <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 16, color: TOW.ink }}>Local game</div>
          )}
        </div>
        {code && seat === 'host' && !opponentArmy && (
          <span style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.muted }}>waiting for opponent…</span>
        )}
        <button onClick={leaveGame} style={{ border: `1px solid ${TOW.lineStrong}`, borderRadius: 9, background: 'transparent', color: TOW.muted, cursor: 'pointer', padding: '6px 12px', fontFamily: towFont.display, fontSize: 12 }}>Leave</button>
      </div>

      <div style={{ flexShrink: 0, display: 'flex', gap: 4, padding: 10 }}>
        {(['me', 'opp'] as const).map((s) => {
          const on = s === side;
          const txt = s === 'me' ? myName || 'You' : opponentName || 'Opponent';
          return (
            <button key={s} onClick={() => setSide(s)} style={{ flex: 1, padding: '9px 0', borderRadius: 9, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'linear-gradient(180deg,#fff7e6,#f1e6c9)' : 'transparent', color: on ? TOW.ink : TOW.muted, fontFamily: towFont.display, fontWeight: 600, fontSize: 14, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{txt}</button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 12px 28px', maxWidth: 620, width: '100%', margin: '0 auto' }}>
        {army ? (
          <>
            <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14, color: TOW.parchDim, margin: '4px 2px 12px' }}>
              {label} — {army.faction || army.name}{army.points != null ? ` · ${army.points} pts` : ''}
            </div>
            {groups.map((g) => (
              <div key={g.category} style={{ marginBottom: 8 }}>
                <div style={{ ...eb, fontSize: 9, color: TOW.goldDeep, margin: '10px 2px 8px' }}>{g.category}</div>
                {g.units.map((u) => (
                  <UnitCard key={u.id} unit={u} editable={editable} onChange={(patch) => onUnitChange(u.id, patch)} />
                ))}
              </div>
            ))}
          </>
        ) : side === 'opp' && seat === 'solo' ? (
          <ArmyPaste title="Opponent army list" cta="Add opponent army" onSet={setOpponentArmy} />
        ) : side === 'opp' ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', fontFamily: towFont.serif, fontStyle: 'italic', color: TOW.muted }}>
            Waiting for your opponent to join and add their army…
          </div>
        ) : (
          <ArmyPaste title="Your army list" cta="Add your army" onSet={setMyArmy} />
        )}
      </div>
    </div>
  );
}

function ArmyPaste({ title, cta, onSet }: { title: string; cta: string; onSet: (a: Army) => void }) {
  const [paste, setPaste] = useState('');
  const army = paste.trim() ? parseArmyList(paste) : null;
  return (
    <div style={{ padding: '12px 2px' }}>
      <div style={{ ...eb, fontSize: 9, color: TOW.muted, marginBottom: 6 }}>{title}</div>
      <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste the Old World Builder export…" rows={7} style={{ width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: '#fffdf6', color: TOW.ink, padding: '10px 12px', fontFamily: towFont.serif, fontSize: 13, lineHeight: 1.4, boxSizing: 'border-box', resize: 'vertical' }} />
      <OwbInstructions defaultOpen={!paste.trim()} />
      <button onClick={() => army && onSet(army)} disabled={!army} style={{ marginTop: 10, border: 'none', borderRadius: 11, cursor: 'pointer', padding: '11px 18px', width: '100%', background: `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`, color: '#2a1a0a', fontFamily: towFont.display, fontWeight: 700, fontSize: 14, opacity: army ? 1 : 0.5 }}>{cta}</button>
    </div>
  );
}
