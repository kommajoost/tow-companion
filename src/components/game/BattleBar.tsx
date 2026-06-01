import { TOW, towFont, engraved } from '../../design/tow';

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

const Minus = ({ c }: { c: string }) => (
  <svg width="16" height="16" viewBox="0 0 18 18"><path d="M4 9h10" stroke={c} strokeWidth="2" strokeLinecap="round" /></svg>
);
const Plus = ({ c }: { c: string }) => (
  <svg width="16" height="16" viewBox="0 0 18 18"><path d="M9 4v10M4 9h10" stroke={c} strokeWidth="2" strokeLinecap="round" /></svg>
);

// Shared battle state: Battle Round (1–6) and Victory Points per side.
export function BattleBar({
  round,
  onRound,
  vpMe,
  vpOpp,
  onVp,
  myName,
  opponentName,
  editable = true,
}: {
  round: number;
  onRound: (dir: number) => void;
  vpMe: number;
  vpOpp: number;
  onVp: (which: 'me' | 'opp', dir: number) => void;
  myName: string;
  opponentName: string;
  editable?: boolean;
}) {
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
    color: gold ? '#241803' : TOW.parchDim,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: 8 }}>
      {/* Battle Round */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ ...eb, fontSize: 7.5, color: TOW.muted }}>Battle Round</div>
          <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 19, color: TOW.ink }}>
            {round}
            <span style={{ fontSize: 11, color: TOW.muted, fontWeight: 600 }}> / 6</span>
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

      {/* Victory Points */}
      <div style={card}>
        <div style={{ ...eb, fontSize: 7.5, color: TOW.muted, marginBottom: 7 }}>Victory Points</div>
        {(['me', 'opp'] as const).map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: i ? 7 : 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: i ? TOW.muted : TOW.goldDeep, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontFamily: towFont.serif, fontSize: 12.5, color: i ? TOW.muted : TOW.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {i ? opponentName : myName}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => editable && onVp(s, -1)} disabled={!editable} aria-label="Less" style={{ width: 23, height: 23, borderRadius: 7, cursor: editable ? 'pointer' : 'default', border: `1px solid ${TOW.lineStrong}`, background: 'transparent', color: TOW.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Minus c="currentColor" />
              </button>
              <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 15, color: TOW.ink, minWidth: 15, textAlign: 'center' }}>{i ? vpOpp : vpMe}</span>
              <button onClick={() => editable && onVp(s, 1)} disabled={!editable} aria-label="More" style={{ width: 23, height: 23, borderRadius: 7, cursor: editable ? 'pointer' : 'default', border: `1px solid ${TOW.lineStrong}`, background: 'transparent', color: TOW.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Plus c="currentColor" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
