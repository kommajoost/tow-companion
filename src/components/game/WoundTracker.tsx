import { TOW, towFont, engraved } from '../../design/tow';
import { unitSize, woundsPerModel } from '../../lib/armyRules';
import type { ArmyUnit } from '../../types';

const eb = engraved as React.CSSProperties;

const Minus = ({ c }: { c: string }) => (
  <svg width="18" height="18" viewBox="0 0 18 18"><path d="M4 9h10" stroke={c} strokeWidth="2" strokeLinecap="round" /></svg>
);
const Plus = ({ c }: { c: string }) => (
  <svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 4v10M4 9h10" stroke={c} strokeWidth="2" strokeLinecap="round" /></svg>
);
const Flag = ({ c }: { c: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><g stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.2v17.6" /><path d="M6 4.4h12l-2.8 3.6L18 11.6H6" /></g></svg>
);
const Skull = ({ c }: { c: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><g stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5c-4 0-6.5 2.7-6.5 6.3 0 2 1 3.4 2 4.2v2.3c0 .8.6 1.4 1.4 1.4h6.2c.8 0 1.4-.6 1.4-1.4v-2.3c1-.8 2-2.2 2-4.2 0-3.6-2.5-6.3-6.5-6.3z" /><circle cx="9.3" cy="10.2" r="1.3" fill={c} stroke="none" /><circle cx="14.7" cy="10.2" r="1.3" fill={c} stroke="none" /></g></svg>
);

// Per-unit strength / casualty tracker. Records wounds lost, shows models- or wounds-left
// with a colour-coded bar, auto-marks "Destroyed" at 0, plus a Flee/Fleeing toggle.
export function WoundTracker({
  unit,
  lost,
  onCasualty,
  fleeing,
  onFlee,
  editable = true,
}: {
  unit: ArmyUnit;
  lost: number;
  onCasualty: (dir: number) => void;
  fleeing: boolean;
  onFlee: () => void;
  editable?: boolean;
}) {
  const size = unitSize(unit);
  const wpm = woundsPerModel(unit);
  const total = size * wpm;
  const remaining = Math.max(0, total - lost);
  const dead = remaining === 0;
  const pct = total ? remaining / total : 0;
  const showModels = size > 1;
  const big = showModels ? Math.ceil(remaining / wpm) : remaining;
  const cap = showModels ? size : total;
  const unitLbl = showModels ? (size === 1 ? 'model' : 'models') : total === 1 ? 'wound' : 'wounds';
  const barColor = dead ? TOW.blood : pct > 0.5 ? TOW.goldDeep : pct > 0.25 ? '#a8842f' : TOW.blood;

  const Btn = ({ dir }: { dir: number }) => {
    const disabled = !editable || (dir < 0 ? dead : lost === 0);
    return (
      <button
        onClick={() => onCasualty(dir)}
        disabled={disabled}
        aria-label={dir < 0 ? 'Casualty' : 'Restore'}
        style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, cursor: disabled ? 'default' : 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: disabled ? 'rgba(134,116,83,0.4)' : TOW.parchDim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {dir < 0 ? <Minus c="currentColor" /> : <Plus c="currentColor" />}
      </button>
    );
  };

  return (
    <div style={{ marginTop: 11, paddingTop: 11, borderTop: `1px solid ${TOW.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>Strength tracker</span>
        <button
          onClick={onFlee}
          disabled={!editable}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, cursor: editable ? 'pointer' : 'default', padding: '4px 10px', borderRadius: 99, border: `1px solid ${fleeing ? TOW.blood : TOW.lineStrong}`, background: fleeing ? 'rgba(124,43,34,0.10)' : 'transparent', color: fleeing ? TOW.blood : TOW.muted }}
        >
          <Flag c="currentColor" />
          <span style={{ ...eb, fontSize: 8 }}>{fleeing ? 'Fleeing' : 'Flee'}</span>
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <Btn dir={-1} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 18, color: dead ? TOW.blood : TOW.ink }}>{big}</span>
              <span style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted }}>/ {cap} {unitLbl}</span>
            </div>
            {dead ? (
              <span style={{ ...eb, fontSize: 8, color: TOW.blood, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Skull c={TOW.blood} />Destroyed
              </span>
            ) : (
              lost > 0 && <span style={{ ...eb, fontSize: 8, color: TOW.muted }}>{lost} lost</span>
            )}
          </div>
          <div style={{ height: 6, borderRadius: 99, background: 'rgba(74,55,22,0.12)', overflow: 'hidden' }}>
            <div style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 99, background: barColor, transition: 'width .25s ease' }} />
          </div>
        </div>
        <Btn dir={1} />
      </div>
    </div>
  );
}
