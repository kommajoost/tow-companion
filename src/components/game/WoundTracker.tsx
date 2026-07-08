import { TOW, towFont, engraved } from '../../design/tow';
import { unitSize, woundsPerModel, unitTotalStrength } from '../../lib/armyRules';
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

// Per-unit strength / casualty tracker.
//
// Joost wil per unit twee dingen los kunnen zetten i.p.v. één ruwe `lost`-teller:
//   • aantal modellen dood            → elke stap = ±W wonden (W = woundsPerModel)
//   • wonden op het huidige (voorste) model → ±1 wond, binnen [0, W-1]
// Beide tellers zijn ONAFHANKELIJK; ze reduceren samen naar de canonieke totale `lost`:
//   lost = modellenDood × W + wondenOpVoorste
// en worden voor weergave terug afgeleid uit `lost`:
//   modellenDood    = clamp(floor(lost / W), 0..start)
//   wondenOpVoorste = lost % W
//
// Randgevallen / keuzes (gedocumenteerd):
//   • single-model units (start === 1): de "Models"-rij vervalt; alleen de wonden-rij telt.
//   • W === 1: de "Wounds on front model"-rij vervalt (elke wond = een heel model); alleen "Models".
//     Bij een single-model 1W-unit (start===1 && W===1) blijft alleen een simpele 0/1-wonden-rij over.
//   • De som `lost` wordt altijd geclampt in [0, totaal]; geen teller kan die grens doorbreken.
//
// Verder: een gekleurde strength-bar + "Destroyed" bij 0, en twee toggles: Fleeing (bestaand) en
// Removed (nieuw → destroyed / van tafel → 100% VP).
export function WoundTracker({
  unit,
  lost,
  onSetLost,
  fleeing,
  onFlee,
  weg,
  onRemoved,
  editable = true,
}: {
  unit: ArmyUnit;
  /** Canonieke totale verloren wonden (0..unitTotalStrength). */
  lost: number;
  /** Absolute setter: schrijf de nieuwe totale `lost` (de twee tellers rekenen hiernaar). */
  onSetLost: (lost: number) => void;
  fleeing: boolean;
  onFlee: () => void;
  /** Unit vernietigd of van tafel (Removed) → 100% VP voor de vijand. */
  weg: boolean;
  onRemoved: () => void;
  editable?: boolean;
}) {
  const start = unitSize(unit); // aantal modellen bij aanvang (single = 1)
  const wpm = woundsPerModel(unit); // wonden per model
  const total = unitTotalStrength(unit); // = start × wpm
  const clampedLost = Math.min(total, Math.max(0, lost));
  const remaining = Math.max(0, total - clampedLost);
  const dead = remaining <= 0;

  // Afleiding terug uit de canonieke `lost`.
  const modellenDood = Math.min(start, Math.max(0, Math.floor(clampedLost / wpm)));
  const wondenOpVoorste = clampedLost % wpm; // 0..wpm-1
  const modellenLevend = Math.max(0, start - modellenDood);

  const showModels = start > 1; // models-rij alleen bij multi-model units
  // "Wonden op het voorste model" (0..W-1) alleen bij MULTI-model multi-wound: pas dan is er een
  // "volgend model" waar de wonden op vallen. Bij een single model (character/monster) telt de
  // hele-unit-wonden-rij hieronder (0..W). Dat was de bug: een W3-held toonde eerder cap W-1 = 2.
  const showFrontWounds = start > 1 && wpm > 1;
  // Single-model unit (óók multi-wound) → één wonden-rij van 0..total (= W).
  const showSingleWound = start === 1;

  const pct = total ? remaining / total : 0;
  const barColor = dead ? TOW.blood : pct > 0.5 ? TOW.goldDeep : pct > 0.25 ? '#a8842f' : TOW.blood;

  // Zet het aantal dode modellen (elke stap = ±W wonden), wonden-op-voorste blijft behouden.
  const setDood = (nieuwDood: number) => {
    const d = Math.min(start, Math.max(0, nieuwDood));
    // Behoud de wonden op het voorste model, tenzij het laatste model sneuvelt (dan is de unit leeg).
    const front = d >= start ? 0 : wondenOpVoorste;
    onSetLost(Math.min(total, Math.max(0, d * wpm + front)));
  };
  // Zet de wonden op het voorste model (±1, binnen [0, wpm-1]); dode modellen blijven ongemoeid.
  const setFront = (nieuwFront: number) => {
    const f = Math.min(wpm - 1, Math.max(0, nieuwFront));
    onSetLost(Math.min(total, Math.max(0, modellenDood * wpm + f)));
  };
  // Single-model 1W-unit: 0/1 wond ⇒ lost 0 of 1.
  const setSingleWound = (v: number) => onSetLost(Math.min(total, Math.max(0, v)));

  const StepBtn = ({ dir, onClick, disabled }: { dir: number; onClick: () => void; disabled: boolean }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir < 0 ? 'Minus' : 'Plus'}
      style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, cursor: disabled ? 'default' : 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: disabled ? 'rgba(134,116,83,0.4)' : TOW.parchDim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {dir < 0 ? <Minus c="currentColor" /> : <Plus c="currentColor" />}
    </button>
  );

  // Eén compacte teller-rij: label · [-] waarde/cap · [+].
  const CounterRow = ({
    label,
    value,
    cap,
    onDec,
    onInc,
    decDisabled,
    incDisabled,
  }: {
    label: string;
    value: number;
    cap: number;
    onDec: () => void;
    onInc: () => void;
    decDisabled: boolean;
    incDisabled: boolean;
  }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ flex: 1, minWidth: 0, ...eb, fontSize: 8, color: TOW.muted }}>{label}</span>
      <StepBtn dir={-1} onClick={onDec} disabled={!editable || decDisabled} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 52, justifyContent: 'center' }}>
        <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 17, color: TOW.ink }}>{value}</span>
        <span style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.muted }}>/ {cap}</span>
      </div>
      <StepBtn dir={1} onClick={onInc} disabled={!editable || incDisabled} />
    </div>
  );

  const toggle = (on: boolean, onClick: () => void, onLabel: string, offLabel: string, strong = false) => (
    <button
      onClick={onClick}
      disabled={!editable}
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: editable ? 'pointer' : 'default', padding: '6px 8px', borderRadius: 99, border: `1px solid ${on ? TOW.blood : TOW.lineStrong}`, background: on ? (strong ? 'rgba(124,43,34,0.18)' : 'rgba(124,43,34,0.10)') : 'transparent', color: on ? TOW.blood : TOW.muted, fontWeight: on && strong ? 700 : 400 }}
    >
      {strong ? <Skull c="currentColor" /> : <Flag c="currentColor" />}
      <span style={{ ...eb, fontSize: 8 }}>{on ? onLabel : offLabel}</span>
    </button>
  );

  return (
    <div style={{ marginTop: 11, paddingTop: 11, borderTop: `1px solid ${TOW.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <span style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>Strength tracker</span>
        {(dead || weg) ? (
          <span style={{ marginLeft: 'auto', ...eb, fontSize: 8, color: TOW.blood, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Skull c={TOW.blood} />{weg ? 'Removed' : 'Destroyed'}
          </span>
        ) : (
          clampedLost > 0 && <span style={{ marginLeft: 'auto', ...eb, fontSize: 8, color: TOW.muted }}>{clampedLost} lost</span>
        )}
      </div>

      {/* Tellers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {showModels && (
          <CounterRow
            label="Models"
            value={modellenLevend}
            cap={start}
            onDec={() => setDood(modellenDood + 1)}
            onInc={() => setDood(modellenDood - 1)}
            decDisabled={modellenDood >= start}
            incDisabled={modellenDood <= 0}
          />
        )}
        {showFrontWounds && (
          <CounterRow
            label={showModels ? 'Wounds on front model' : 'Wounds'}
            value={wondenOpVoorste}
            cap={wpm - 1}
            onDec={() => setFront(wondenOpVoorste - 1)}
            onInc={() => setFront(wondenOpVoorste + 1)}
            decDisabled={wondenOpVoorste <= 0}
            incDisabled={wondenOpVoorste >= wpm - 1}
          />
        )}
        {showSingleWound && (
          <CounterRow
            label="Wounds"
            value={clampedLost}
            cap={total}
            onDec={() => setSingleWound(clampedLost - 1)}
            onInc={() => setSingleWound(clampedLost + 1)}
            decDisabled={clampedLost <= 0}
            incDisabled={clampedLost >= total}
          />
        )}
      </div>

      {/* Strength-bar + resterend totaal */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '10px 0 5px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 15, color: dead ? TOW.blood : TOW.ink }}>{remaining}</span>
          <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted }}>/ {total} {total === 1 ? 'wound' : 'wounds'} left</span>
        </div>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'rgba(74,55,22,0.12)', overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 99, background: barColor, transition: 'width .25s ease' }} />
      </div>

      {/* Toggles: Fleeing + Removed */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        {toggle(fleeing, onFlee, 'Fleeing', 'Flee')}
        {toggle(weg, onRemoved, 'Removed', 'Remove', true)}
      </div>
    </div>
  );
}
