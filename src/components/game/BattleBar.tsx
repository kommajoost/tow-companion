import { TOW, towFont, engraved } from '../../design/tow';

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

const Minus = ({ c }: { c: string }) => (
  <svg width="14" height="14" viewBox="0 0 18 18"><path d="M4 9h10" stroke={c} strokeWidth="2" strokeLinecap="round" /></svg>
);
const Plus = ({ c }: { c: string }) => (
  <svg width="14" height="14" viewBox="0 0 18 18"><path d="M9 4v10M4 9h10" stroke={c} strokeWidth="2" strokeLinecap="round" /></svg>
);

/**
 * Gedeelde battle-stand: de Battle Round (1–6, of 1–5 bij een Battle March) en de Victory Points per kant.
 *
 * COMPACT (Joost 05-10-2026): "die balk met battle round en victory points kan wel een stuk compacter,
 * zodat het eronder past" — "het" is de reminder-balk met het weer, die er nu vast onder staat. Op de
 * telefoon was dit twee kaarten van elk ruim 100px hoog, terwijl er maar drie getallen in staan. Nu is
 * het één rij van 40px: de ronde met z'n − en + links, beide VP-standen rechts. Het weer stond hier tot
 * vandaag als derde kaart onder; dat is verhuisd naar `ReminderStrip`, samen met de campagne-reminders.
 */
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
}) {
  const laatsteRound = round >= maxRound;
  const card: React.CSSProperties = {
    height: 40,
    padding: '0 8px',
    borderRadius: 10,
    background: TOW.cardLt,
    border: `1px solid ${TOW.line}`,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
  };
  const stepBtn = (gold: boolean): React.CSSProperties => ({
    width: 28,
    height: 28,
    flexShrink: 0,
    borderRadius: 7,
    cursor: editable ? 'pointer' : 'default',
    border: gold ? 'none' : `1px solid ${TOW.lineStrong}`,
    background: gold ? goldGrad : 'transparent',
    color: gold ? TOW.onGrad : TOW.parchDim,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  });

  /** Eén VP-stand: naam (kort af als het moet) en het getal. De leider krijgt goud. */
  const vp = (s: 'me' | 'opp') => {
    const leads = leader === s;
    const kleur = leads ? TOW.goldDeep : leader ? TOW.muted : TOW.ink;
    return (
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0, flex: 1, justifyContent: s === 'me' ? 'flex-start' : 'flex-end' }}>
        {s === 'opp' && (
          <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 16, color: kleur, flexShrink: 0 }}>{vpOpp}</span>
        )}
        <span style={{ minWidth: 0, fontFamily: towFont.serif, fontSize: 12, color: leader && !leads ? TOW.muted : TOW.parchDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {s === 'me' ? myName : opponentName}
        </span>
        {s === 'me' && (
          <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 16, color: kleur, flexShrink: 0 }}>{vpMe}</span>
        )}
      </span>
    );
  };

  return (
    <div style={vertical ? { display: 'flex', flexDirection: 'column', gap: 6 } : { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 6 }}>
      {/* Battle Round: − [ROUND 1/5] + */}
      <div style={{ ...card, gap: 7, justifyContent: 'space-between' }}>
        <button onClick={() => editable && onRound(-1)} disabled={!editable} aria-label="Previous round" style={stepBtn(false)}>
          <Minus c="currentColor" />
        </button>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}>
          <span style={{ ...eb, fontSize: 7.5, color: TOW.muted }}>{laatsteRound ? 'Last round' : 'Round'}</span>
          <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 17, color: TOW.ink }}>
            {round}
            <span style={{ fontSize: 11, color: TOW.muted, fontWeight: 600 }}>/{maxRound}</span>
          </span>
        </span>
        <button onClick={() => editable && onRound(1)} disabled={!editable} aria-label="Next round" style={stepBtn(true)}>
          <Plus c="currentColor" />
        </button>
      </div>

      {/* Victory Points — read-only; de waarde komt uit de engine (leader stuurt de highlight).
          minWidth 0 + minmax(0, 1fr) hierboven: zonder die twee rekende het grid met de VOLLE breedte
          van beide namen, en bij "Proef — Vampire Counts" schoof de VP van de tegenstander rechts van
          het scherm af. Nu krimpt de kaart en korten de namen af; de getallen blijven altijd staan. */}
      <div style={{ ...card, gap: 8, minWidth: 0, overflow: 'hidden' }} aria-label="Victory points">
        <span style={{ ...eb, fontSize: 7.5, color: TOW.muted, flexShrink: 0 }}>VP</span>
        {vp('me')}
        <span style={{ color: TOW.faint, fontFamily: towFont.serif, fontSize: 12, flexShrink: 0 }}>·</span>
        {vp('opp')}
      </div>
    </div>
  );
}
