import { useLayoutEffect, useRef, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { Ornament } from '../../design/glyphs';
import { useGame } from '../../game';
import { parseArmyList } from '../../lib/armyParser';
import { unitTotalStrength } from '../../lib/armyRules';
import { UnitCard } from './UnitCard';
import { BattleBar } from './BattleBar';
import { OwbInstructions } from './OwbInstructions';
import { ArmyListPicker } from './ArmyListPicker';
import type { Army, ArmyUnit } from '../../types';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;

const Shield = ({ c, size = 22 }: { c: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 3.5l7 2.4v5.2c0 4.2-2.9 7.3-7 8.9-4.1-1.6-7-4.7-7-8.9V5.9z" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// Active game roster + the shared battle tracker. Phone: a stacked header + scrolling roster.
// Wide: a "This game" sidebar (code, You/Opponent, round, VP) beside a roster reading pane.
export function GameView() {
  const { code, seat, myArmy, myName, opponentArmy, opponentName, setMyArmy, setOpponentArmy, tracker, setTracker, leaveGame } = useGame();
  const [side, setSide] = useState<'me' | 'opp'>('me');
  const rootRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(420);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  const wide = w >= 700; // pane is window−76 when the global rail is shown

  const army: Army | null = side === 'me' ? myArmy : opponentArmy;

  // Both armies are editable (you track spells and casualties for both sides).
  const editable = true;
  const applyArmy = side === 'me' ? setMyArmy : setOpponentArmy;
  const onUnitChange = (unitId: string, patch: Partial<ArmyUnit>) => {
    if (!army) return;
    applyArmy({ ...army, units: army.units.map((u) => (u.id === unitId ? { ...u, ...patch } : u)) });
  };

  // ── shared battle tracker (absolute seat keys so both players agree) ──
  const absSeat = (s: 'me' | 'opp'): string =>
    seat === 'solo' ? s : s === 'me' ? seat ?? 'host' : seat === 'host' ? 'guest' : 'host';
  const unitKey = (s: 'me' | 'opp', unitId: string) => `${absSeat(s)}:${unitId}`;
  const meKey = absSeat('me');
  const oppKey = absSeat('opp');

  const adjCasualty = (unitId: string, dir: number) => {
    const u = army?.units.find((x) => x.id === unitId);
    if (!u) return;
    const total = unitTotalStrength(u);
    const key = unitKey(side, unitId);
    const prev = tracker.units[key] ?? { lost: 0, fleeing: false };
    const lost = Math.min(total, Math.max(0, prev.lost + (dir < 0 ? 1 : -1)));
    setTracker({ ...tracker, units: { ...tracker.units, [key]: { ...prev, lost } } });
  };
  const toggleFlee = (unitId: string) => {
    const key = unitKey(side, unitId);
    const prev = tracker.units[key] ?? { lost: 0, fleeing: false };
    setTracker({ ...tracker, units: { ...tracker.units, [key]: { ...prev, fleeing: !prev.fleeing } } });
  };
  const adjRound = (dir: number) => setTracker({ ...tracker, round: Math.min(6, Math.max(1, tracker.round + dir)) });
  const adjVp = (which: 'me' | 'opp', dir: number) => {
    const key = which === 'me' ? meKey : oppKey;
    setTracker({ ...tracker, vp: { ...tracker.vp, [key]: Math.max(0, (tracker.vp[key] ?? 0) + dir) } });
  };

  const afield = army
    ? army.units.filter((u) => unitTotalStrength(u) - (tracker.units[unitKey(side, u.id)]?.lost ?? 0) > 0).length
    : 0;

  const groups: { category: string; units: ArmyUnit[] }[] = [];
  if (army) {
    for (const u of army.units) {
      let g = groups.find((x) => x.category === u.category);
      if (!g) { g = { category: u.category, units: [] }; groups.push(g); }
      g.units.push(u);
    }
  }

  // ── shared bits ──
  const sideToggle = (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['me', 'opp'] as const).map((s) => {
        const on = s === side;
        const txt = s === 'me' ? myName || 'You' : opponentName || 'Opponent';
        return (
          <button key={s} onClick={() => setSide(s)} style={{ flex: 1, padding: '9px 6px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? TOW.cardLt : 'transparent', color: on ? TOW.ink : TOW.muted, fontFamily: display, fontWeight: 600, fontSize: 13.5, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{txt}</button>
        );
      })}
    </div>
  );

  const battleBar = army && (
    <BattleBar round={tracker.round} onRound={adjRound} vpMe={tracker.vp[meKey] ?? 0} vpOpp={tracker.vp[oppKey] ?? 0} onVp={adjVp} myName={myName || 'You'} opponentName={opponentName || 'Opponent'} editable={editable} vertical={wide} />
  );

  const rosterBody = army ? (
    groups.map((g) => (
      <div key={g.category} style={{ marginBottom: 8 }}>
        <div style={{ ...eb, fontSize: 9, color: TOW.goldDeep, margin: '12px 2px 8px' }}>{g.category}</div>
        {g.units.map((u) => {
          const t = tracker.units[unitKey(side, u.id)];
          return (
            <UnitCard key={u.id} unit={u} editable={editable} onChange={(patch) => onUnitChange(u.id, patch)} lost={t?.lost ?? 0} fleeing={t?.fleeing ?? false} onCasualty={(dir) => adjCasualty(u.id, dir)} onFlee={() => toggleFlee(u.id)} />
          );
        })}
      </div>
    ))
  ) : side === 'opp' && seat === 'solo' ? (
    <ArmyPaste title="Opponent army list" cta="Add opponent army" onSet={setOpponentArmy} />
  ) : side === 'opp' ? (
    <div style={{ textAlign: 'center', padding: '50px 20px', fontFamily: serif, fontStyle: 'italic', color: TOW.muted }}>Waiting for your opponent to join and add their army…</div>
  ) : (
    <ArmyPaste title="Your army list" cta="Add your army" onSet={setMyArmy} />
  );

  // ════════════════ WIDE — "This game" sidebar + roster pane ════════════════
  if (wide) {
    return (
      <div ref={rootRef} className="tow-field" style={{ height: '100%', display: 'flex', flexDirection: 'row', color: TOW.ink }}>
        <div style={{ width: 284, flexShrink: 0, borderRight: `1px solid ${TOW.lineStrong}`, background: TOW.panel, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 18px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Shield c={TOW.goldDeep} />
              <div style={{ fontFamily: display, fontWeight: 700, fontSize: 21, color: TOW.ink }}>Armies</div>
            </div>
            <Ornament w={180} color={TOW.goldDeep} style={{ display: 'block', marginTop: 12, opacity: 0.6 }} />
          </div>
          <div style={{ margin: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 9, overflowY: 'auto', flex: 1, minHeight: 0, paddingBottom: 18 }}>
            <div style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>This game</div>
            <CodeBadge code={code} onLeave={leaveGame} waiting={!!(code && seat === 'host' && !opponentArmy)} />
            {sideToggle}
            {battleBar}
          </div>
        </div>

        <div className="tow-field" style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '26px 32px 52px' }}>
            {army && (
              <>
                <div style={{ ...eb, fontSize: 9.5, color: TOW.goldDeep, marginBottom: 5 }}>{side === 'me' ? 'Your army' : "Opponent's army"} · {afield}/{army.units.length} afield</div>
                <div style={{ fontFamily: display, fontWeight: 700, fontSize: 27, color: TOW.ink, lineHeight: 1.05 }}>{army.name}</div>
                <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 15, color: TOW.parchDim, marginTop: 4 }}>{army.faction || ''}{army.points != null ? ` · ${army.points} pts` : ''}</div>
                <Ornament w={150} color={TOW.goldDeep} style={{ display: 'block', margin: '14px 0 2px', opacity: 0.5 }} />
              </>
            )}
            {rosterBody}
          </div>
        </div>
      </div>
    );
  }

  // ════════════════ PHONE — stacked ════════════════
  return (
    <div ref={rootRef} className="tow-field" style={{ height: '100%', display: 'flex', flexDirection: 'column', color: TOW.ink }}>
      <div className="tow-leather" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${TOW.lineStrong}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>Game</div>
          {code ? (
            <div style={{ fontFamily: display, fontWeight: 700, fontSize: 18, color: TOW.goldDeep, letterSpacing: '0.18em' }}>{code}</div>
          ) : (
            <div style={{ fontFamily: display, fontWeight: 700, fontSize: 16, color: TOW.ink }}>Local game</div>
          )}
        </div>
        {code && seat === 'host' && !opponentArmy && (
          <span style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.muted }}>waiting for opponent…</span>
        )}
        <button onClick={leaveGame} style={{ border: `1px solid ${TOW.lineStrong}`, borderRadius: 9, background: 'transparent', color: TOW.muted, cursor: 'pointer', padding: '6px 12px', fontFamily: display, fontSize: 12 }}>Leave</button>
      </div>

      <div style={{ flexShrink: 0, padding: 10 }}>{sideToggle}</div>

      {battleBar && (
        <div style={{ flexShrink: 0, padding: '0 10px 8px', maxWidth: 620, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>{battleBar}</div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 12px 28px', maxWidth: 620, width: '100%', margin: '0 auto' }}>
        {army && (
          <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 14, color: TOW.parchDim, margin: '4px 2px 12px' }}>
            {side === 'me' ? myName || 'You' : opponentName || 'Opponent'} — {army.faction || army.name}{army.points != null ? ` · ${army.points} pts` : ''} · {afield}/{army.units.length} afield
          </div>
        )}
        {rosterBody}
      </div>
    </div>
  );
}

function CodeBadge({ code, onLeave, waiting }: { code: string | null; onLeave: () => void; waiting: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 11, background: TOW.cardLt, border: `1px solid ${TOW.line}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...eb, fontSize: 7.5, color: TOW.muted }}>{waiting ? 'Waiting for opponent' : code ? 'Shared game' : 'Local game'}</div>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 17, color: code ? TOW.goldDeep : TOW.ink, letterSpacing: code ? '0.2em' : 0 }}>{code || 'Solo'}</div>
      </div>
      <button onClick={onLeave} style={{ ...eb, fontSize: 8, color: TOW.muted, border: `1px solid ${TOW.lineStrong}`, borderRadius: 8, background: 'transparent', cursor: 'pointer', padding: '7px 11px' }}>Leave</button>
    </div>
  );
}

function ArmyPaste({ title, cta, onSet }: { title: string; cta: string; onSet: (a: Army) => void }) {
  const [paste, setPaste] = useState('');
  const army = paste.trim() ? parseArmyList(paste) : null;
  return (
    <div style={{ padding: '12px 2px' }}>
      <div style={{ ...eb, fontSize: 9, color: TOW.muted, marginBottom: 6 }}>{title}</div>
      <ArmyListPicker onPick={onSet} />
      <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste the Old World Builder export…" rows={7} style={{ width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, padding: '10px 12px', fontFamily: serif, fontSize: 13, lineHeight: 1.4, boxSizing: 'border-box', resize: 'vertical' }} />
      <OwbInstructions defaultOpen={!paste.trim()} />
      <button onClick={() => army && onSet(army)} disabled={!army} style={{ marginTop: 10, border: 'none', borderRadius: 11, cursor: 'pointer', padding: '11px 18px', width: '100%', background: `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`, color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: 14, opacity: army ? 1 : 0.5 }}>{cta}</button>
    </div>
  );
}
