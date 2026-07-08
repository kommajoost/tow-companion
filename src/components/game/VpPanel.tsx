import { useMemo, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { berekenVictory, type VpBonus } from '../../lib/victoryPoints';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;

const Minus = ({ c }: { c: string }) => (
  <svg width="16" height="16" viewBox="0 0 18 18"><path d="M4 9h10" stroke={c} strokeWidth="2" strokeLinecap="round" /></svg>
);
const Plus = ({ c }: { c: string }) => (
  <svg width="16" height="16" viewBox="0 0 18 18"><path d="M9 4v10M4 9h10" stroke={c} strokeWidth="2" strokeLinecap="round" /></svg>
);

// Menselijke labels voor de uitslag.
const UITSLAG_LABEL: Record<'draw' | 'victory' | 'crushing', string> = {
  draw: 'Draw',
  victory: 'Victory',
  crushing: 'Crushing Victory',
};

// Het VP / Result-paneel. Leest ALTIJD absoluut (host/guest), onafhankelijk van welke seat kijkt,
// zodat beide spelers exact dezelfde stand zien. Gebruikt zelf useGame() (net als
// CampaignResultReporter), dus de plaatsing in GameView is enkel <VpPanel /> — geen prop-doorgifte.
//
// `compact` = variant voor de smalle wide-sidebar: kleinere headline + iets strakkere spacing.
// De phone-variant laat 'm weg (ruimere weergave).
export function VpPanel({ compact = false }: { compact?: boolean }) {
  const { game, tracker, setTracker } = useGame();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [bonusOpen, setBonusOpen] = useState(false);

  const hostName = game?.host_name || 'Host';
  const guestName = game?.guest_name || 'Guest';

  const res = useMemo(
    () => berekenVictory(game?.host_army ?? null, game?.guest_army ?? null, tracker, tracker.bonus?.host, tracker.bonus?.guest),
    [game?.host_army, game?.guest_army, tracker],
  );

  // Muteer één bonus-kant en sync via setTracker (last-write-wins, net als de rest van de tracker).
  const setBonus = (side: 'host' | 'guest', patch: Partial<VpBonus>) => {
    setTracker({
      ...tracker,
      bonus: { ...tracker.bonus, [side]: { ...tracker.bonus?.[side], ...patch } },
    });
  };

  // Uitslag-tekst: "Victory · +180 VP" (winnaar-naam ervoor), of gewoon "Draw" bij gelijkspel.
  const winnerName = res.winnaar === 'host' ? hostName : res.winnaar === 'guest' ? guestName : null;
  const uitslagLabel = UITSLAG_LABEL[res.uitslag];

  const box: React.CSSProperties = { border: `1px solid ${TOW.goldDeep}`, borderRadius: 12, background: 'rgba(184,134,47,0.08)', padding: compact ? '12px 13px' : '14px 15px' };

  return (
    <div style={box}>
      <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 9 }}>Victory Points</div>

      {/* Live VP-stand per kant */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginBottom: 10 }}>
        <ScoreCell name={hostName} vp={res.hostVp} leads={res.winnaar === 'host'} compact={compact} />
        <ScoreCell name={guestName} vp={res.guestVp} leads={res.winnaar === 'guest'} compact={compact} />
      </div>

      {/* Uitslag-badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, background: res.uitslag === 'draw' ? 'transparent' : 'rgba(184,134,47,0.12)', border: `1px solid ${res.uitslag === 'draw' ? TOW.line : TOW.goldDeep}`, marginBottom: 12 }}>
        <span style={{ fontFamily: display, fontWeight: 700, fontSize: compact ? 14 : 15, color: res.uitslag === 'draw' ? TOW.muted : TOW.goldDeep, textAlign: 'center' }}>
          {winnerName ? `${winnerName} — ${uitslagLabel}` : uitslagLabel}
        </span>
        {res.verschil > 0 && (
          <span style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim, whiteSpace: 'nowrap' }}>+{res.verschil} VP</span>
        )}
      </div>

      {/* Bonus-invoer per kant (wat DIE kant scoort tegen de vijand) — inklapbaar zodat het paneel
          compact blijft (belangrijk op mobiel, waar dit boven de roster staat). */}
      <button
        onClick={() => setBonusOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', textAlign: 'left' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TOW.muted} strokeWidth="2.6" style={{ flexShrink: 0, transform: bonusOpen ? 'rotate(90deg)' : 'none', transition: 'transform .18s ease' }} aria-hidden><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>Bonuses &amp; objectives (General, standards, scenario)</span>
      </button>
      {bonusOpen && (
        <div style={{ marginTop: 8 }}>
          <BonusEditor name={hostName} bonus={tracker.bonus?.host} onSet={(p) => setBonus('host', p)} compact={compact} />
          <div style={{ height: 10 }} />
          <BonusEditor name={guestName} bonus={tracker.bonus?.guest} onSet={(p) => setBonus('guest', p)} compact={compact} />
        </div>
      )}

      {/* Uitklapbare regel-referentie (ingeklapt by default). */}
      <button
        onClick={() => setRulesOpen((o) => !o)}
        style={{ marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', textAlign: 'left' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TOW.muted} strokeWidth="2.6" style={{ flexShrink: 0, transform: rulesOpen ? 'rotate(90deg)' : 'none', transition: 'transform .18s ease' }} aria-hidden><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>Victory Points — how scoring works</span>
      </button>
      {rulesOpen && <RuleReference />}
    </div>
  );
}

function ScoreCell({ name, vp, leads, compact }: { name: string; vp: number; leads: boolean; compact: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: compact ? '8px 10px' : '9px 12px', borderRadius: 9, background: TOW.cardLt, border: `1px solid ${leads ? TOW.goldDeep : TOW.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: leads ? TOW.goldDeep : TOW.muted, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontFamily: serif, fontSize: 12, color: leads ? TOW.ink : TOW.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      </div>
      <div style={{ fontFamily: display, fontWeight: 700, fontSize: compact ? 22 : 26, color: leads ? TOW.goldDeep : TOW.ink, lineHeight: 1 }}>{vp}</div>
    </div>
  );
}

// Per-kant handmatige bonussen (dat wat DEZE kant scoort tegen de vijandelijke General/BSB/standards
// + scenario-VP). De namen zeggen "Enemy …" want de bonus telt tegen de tegenstander.
function BonusEditor({
  name,
  bonus,
  onSet,
  compact,
}: {
  name: string;
  bonus: VpBonus | undefined;
  onSet: (patch: Partial<VpBonus>) => void;
  compact: boolean;
}) {
  const generalDown = bonus?.generalDown ?? false;
  const bsbDown = bonus?.bsbDown ?? false;
  const standaards = Math.max(0, bonus?.standaards ?? 0);
  const objectiveVp = bonus?.objectiveVp ?? 0;

  const toggle = (on: boolean, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '7px 9px', borderRadius: 8, border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'rgba(184,134,47,0.12)' : 'transparent', textAlign: 'left' }}
    >
      <span style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, border: `1px solid ${on ? TOW.goldDeep : TOW.lineStrong}`, background: on ? TOW.goldDeep : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {on && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2l2.2 2.3 4.8-5" stroke={TOW.onGrad} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontFamily: serif, fontSize: 12.5, color: on ? TOW.ink : TOW.parchDim }}>{label}</span>
    </button>
  );

  const stepBtn: React.CSSProperties = { width: 26, height: 26, flexShrink: 0, borderRadius: 7, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: 'transparent', color: TOW.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' };

  return (
    <div style={{ border: `1px solid ${TOW.line}`, borderRadius: 10, padding: compact ? '9px 10px' : '10px 12px', background: 'rgba(0,0,0,0.02)' }}>
      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 7, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{name} scores</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {toggle(generalDown, 'Enemy General down (+100)', () => onSet({ generalDown: !generalDown }))}
        {toggle(bsbDown, 'Enemy BSB down (+50)', () => onSet({ bsbDown: !bsbDown }))}

        {/* Buitgemaakte standaards (×50) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 1px' }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>Enemy standards captured (×50)</span>
          <button onClick={() => onSet({ standaards: Math.max(0, standaards - 1) })} disabled={standaards <= 0} aria-label="Fewer standards" style={{ ...stepBtn, cursor: standaards <= 0 ? 'default' : 'pointer', opacity: standaards <= 0 ? 0.4 : 1 }}><Minus c="currentColor" /></button>
          <span style={{ fontFamily: display, fontWeight: 700, fontSize: 15, color: TOW.ink, minWidth: 16, textAlign: 'center' }}>{standaards}</span>
          <button onClick={() => onSet({ standaards: standaards + 1 })} aria-label="More standards" style={stepBtn}><Plus c="currentColor" /></button>
        </div>

        {/* Scenario / objective VP (vrij veld) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 1px' }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>Objective / scenario VP (+)</span>
          <input
            type="number"
            inputMode="numeric"
            value={objectiveVp === 0 ? '' : objectiveVp}
            placeholder="0"
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              onSet({ objectiveVp: Number.isFinite(n) ? Math.max(0, n) : 0 });
            }}
            style={{ width: 64, textAlign: 'right', borderRadius: 8, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, padding: '5px 8px', fontFamily: display, fontWeight: 700, fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>
      </div>
    </div>
  );
}

// De TOW-VP-regels, letterlijk uit de engine-comments / tow.whfb.app. Ingeklapt tot de gebruiker 'm
// opent. Bron-URL's als klein grijs onderschrift.
function RuleReference() {
  const item = (title: string, body: string) => (
    <div style={{ marginBottom: 9 }}>
      <div style={{ fontFamily: display, fontWeight: 700, fontSize: 12.5, color: TOW.ink, marginBottom: 2 }}>{title}</div>
      <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
  return (
    <div style={{ marginTop: 9, paddingTop: 10, borderTop: `1px solid ${TOW.line}` }}>
      {item('Dead or Fled', 'An enemy unit destroyed or fled off the table is worth 100% of its points. A unit still fleeing at game end, or reduced to 25% or less of its starting Unit Strength (or Wounds), is worth 50% (rounded up).')}
      {item('The King is Dead', 'The enemy General slain or fled scores an extra +100 VP.')}
      {item('Trophies of War', 'Each captured enemy standard scores +50 VP. The enemy Battle Standard Bearer slain or fled scores +50 VP.')}
      {item('Scenario Objectives / Special Features', 'Defined per scenario — enter any objective VP scored manually.')}
      {item('Result', 'A VP difference below 100 is a Draw. 100 or more is a Victory. If the winner has at least twice the loser’s VP, it is a Crushing Victory.')}
      <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 10.5, color: TOW.muted, marginTop: 4 }}>Source: tow.whfb.app · Warhammer Battles</div>
    </div>
  );
}
