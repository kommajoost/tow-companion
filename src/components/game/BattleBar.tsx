import { useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import type { GameWeer } from '../../types';

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

const Minus = ({ c }: { c: string }) => (
  <svg width="16" height="16" viewBox="0 0 18 18"><path d="M4 9h10" stroke={c} strokeWidth="2" strokeLinecap="round" /></svg>
);
const Plus = ({ c }: { c: string }) => (
  <svg width="16" height="16" viewBox="0 0 18 18"><path d="M9 4v10M4 9h10" stroke={c} strokeWidth="2" strokeLinecap="round" /></svg>
);

// Shared battle state: Battle Round (1–6, or 1–5 in a Battle March) and Victory Points per side,
// plus the Disruptive Weather of this battle when there is any.
export function BattleBar({
  round,
  maxRound = 6,
  onRound,
  vpMe,
  vpOpp,
  myName,
  opponentName,
  editable = true,
  vertical = false,
  leader = null,
  weer = null,
}: {
  round: number;
  /** Game length: 6 for Warhammer Battles, 5 for a Battle March (General's Companion p.27). */
  maxRound?: number;
  onRound: (dir: number) => void;
  vpMe: number;
  vpOpp: number;
  myName: string;
  opponentName: string;
  editable?: boolean;
  /** Stack Round above VP (for a narrow sidebar) instead of side by side. */
  vertical?: boolean;
  /** Welke kant leidt (voor highlight); null bij gelijkspel. */
  leader?: 'me' | 'opp' | null;
  /** Het Disruptive Weather van deze battle, of null → dan tonen we niets. */
  weer?: GameWeer | null;
}) {
  // Het weer-effect staat dicht: aan tafel wil je de NAAM zien staan, en de volledige regel alleen op
  // het moment dat je 'm nodig hebt. Vóór 21-08 stond het weer alleen op het battle-scherm vóór de
  // start, dus zodra het potje liep was de regel uit beeld terwijl 'ie de hele game geldt.
  const [weerOpen, setWeerOpen] = useState(false);
  const laatsteRound = round >= maxRound;
  const card: React.CSSProperties = {
    padding: '10px 12px',
    borderRadius: 11,
    background: TOW.cardLt,
    border: `1px solid ${TOW.line}`,
    boxSizing: 'border-box',
  };
  const stepBtn = (gold: boolean): React.CSSProperties => ({
    width: 30,
    height: 30,
    borderRadius: 8,
    cursor: editable ? 'pointer' : 'default',
    border: gold ? 'none' : `1px solid ${TOW.lineStrong}`,
    background: gold ? goldGrad : 'transparent',
    color: gold ? TOW.onGrad : TOW.parchDim,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  return (
    // Kolom: de bestaande Round+VP-rij, met de weer-regel eronder.
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={vertical ? { display: 'flex', flexDirection: 'column', gap: 8 } : { display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: 8 }}>
        {/* Battle Round */}
        <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={{ ...eb, fontSize: 7.5, color: TOW.muted }}>
              Battle Round{laatsteRound ? ' · last' : ''}
            </div>
            <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 19, color: TOW.ink }}>
              {round}
              <span style={{ fontSize: 11, color: TOW.muted, fontWeight: 600 }}> / {maxRound}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <button onClick={() => editable && onRound(-1)} disabled={!editable} aria-label="Previous round" style={stepBtn(false)}>
              <Minus c="currentColor" />
            </button>
            <button onClick={() => editable && onRound(1)} disabled={!editable} aria-label="Next round" style={stepBtn(true)}>
              <Plus c="currentColor" />
            </button>
          </div>
        </div>

        {/* Victory Points — read-only; waarde komt uit de engine (leader stuurt de highlight). */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
            <span style={{ ...eb, fontSize: 7.5, color: TOW.muted }}>Victory Points</span>
            <span style={{ ...eb, fontSize: 7, color: TOW.faint }}>auto</span>
          </div>
          {(['me', 'opp'] as const).map((s, i) => {
            const isMe = s === 'me';
            const leads = leader === s;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: i ? 7 : 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: leads ? TOW.goldDeep : TOW.muted, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontFamily: towFont.serif, fontSize: 12.5, color: leader && !leads ? TOW.muted : TOW.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {isMe ? myName : opponentName}
                </span>
                <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 15, color: leads ? TOW.goldDeep : leader ? TOW.muted : TOW.ink, minWidth: 15, textAlign: 'right' }}>
                  {isMe ? vpMe : vpOpp}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* DISRUPTIVE WEATHER — geldt de HELE game (rolled before deployment), dus 'ie hoort in beeld te
          blijven zolang het potje loopt. Naam altijd zichtbaar, effect één tik weg. */}
      {weer && (
        <button
          onClick={() => setWeerOpen((o) => !o)}
          style={{ ...card, width: '100%', textAlign: 'left', cursor: weer.effect ? 'pointer' : 'default', border: `1px solid ${TOW.line}` }}
          aria-expanded={weerOpen}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...eb, fontSize: 7.5, color: TOW.muted }}>
                Weather{weer.worp ? ` · roll ${weer.worp}` : ''}
              </div>
              <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 14, color: TOW.goldDeep, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {weer.naam}
              </div>
            </div>
            {weer.effect && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TOW.muted} strokeWidth="2.6" style={{ flexShrink: 0, transform: weerOpen ? 'rotate(90deg)' : 'none', transition: 'transform .18s ease' }} aria-hidden>
                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          {weerOpen && weer.effect && (
            <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.parchDim, lineHeight: 1.45, marginTop: 6 }}>
              {weer.effect}
              <div style={{ ...eb, fontSize: 7, color: TOW.faint, marginTop: 5 }}>In play for the whole game</div>
            </div>
          )}
        </button>
      )}
    </div>
  );
}
