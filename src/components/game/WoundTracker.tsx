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
// ALLE TELLERS TELLEN AF (Joost 21-08-2026: "de woundscounter gaat verkeerd om, je moet juist aftellen
// voor wound i.p.v. op"). Dat was inconsistent: de Models-rij toonde wat er nog LEEFT en telde dus af,
// maar de wonden-rij toonde de OPGELOPEN wonden en liep op. Een W4-held begon op 0/4 en was dood bij
// 4/4, terwijl de regiment-rij ernaast van 10/10 naar 0/10 liep. Aan tafel kijk je naar wat er nog
// staat, dus nu tellen ze allemaal dezelfde kant op: [-] is schade, [+] is genezen, en 0 is dood.
//
// Per unit twee dingen los te zetten:
//   • modellen nog in leven                → elke stap = ±W wonden (W = woundsPerModel)
//   • wonden over op het voorste model     → ±1 wond
// Canoniek blijft de totale `lost` (dat is wat de VP-engine leest):
//   lost = modellenDood × W + wondenOpVoorste
// en de weergave wordt daar uit afgeleid:
//   modellen levend        = start − clamp(floor(lost / W), 0..start)
//   wonden over op voorste = W − (lost mod W)
//
// DE WONDEN-RIJ CASCADEERT (nieuw): hij zet `lost` met ±1, dus valt de laatste wond van het voorste
// model, dan rolt dat automatisch door naar een dood model en staat de volgende weer vol. Daarvoor was
// die rij hard begrensd op W−1 en moest je zelf naar de Models-rij om het model af te maken — precies
// het soort boekhouden dat je aan tafel niet wil doen.
//
// Randgevallen / keuzes (gedocumenteerd):
//   • single-model units (start === 1): de "Models"-rij vervalt; alleen de wonden-rij telt.
//   • W === 1: de wonden-rij vervalt (elke wond is een heel model); alleen "Models".
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
  kills,
  onSetKills,
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
  /** Aantal vijandelijke units vernietigd + buitgemaakte trofeeën door deze unit (min 0). */
  kills: number;
  /** Absolute setter voor de kill-teller. */
  onSetKills: (kills: number) => void;
  editable?: boolean;
}) {
  const start = unitSize(unit); // aantal modellen bij aanvang (single = 1)
  const wpm = woundsPerModel(unit); // wonden per model
  const total = unitTotalStrength(unit); // = start × wpm
  const clampedLost = Math.min(total, Math.max(0, lost));
  const remaining = Math.max(0, total - clampedLost);
  const dead = remaining <= 0;
  const clampedKills = Math.max(0, Math.round(kills)); // kills zijn onbegrensd; nooit negatief



  // Afleiding terug uit de canonieke `lost`.
  const modellenDood = Math.min(start, Math.max(0, Math.floor(clampedLost / wpm)));
  const wondenOpVoorste = clampedLost % wpm; // 0..wpm-1
  const modellenLevend = Math.max(0, start - modellenDood);

  const showModels = start > 1; // models-rij alleen bij multi-model units
  // "Wonden op het voorste model" (0..W-1) alleen bij MULTI-model multi-wound: pas dan is er een
  // "volgend model" waar de wonden op vallen. Bij een single model (character/monster) telt de
  // hele-unit-wonden-rij hieronder (0..W). Dat was de bug: een W3-held toonde eerder cap W-1 = 2.
  const showFrontWounds = start > 1 && wpm > 1;
  // Wonden die het voorste model nog OVER heeft. Bij een verse unit (lost mod W === 0) is dat W; bij
  // een volledig weggevaagde unit 0 -- anders zou een dode unit een gaaf voorste model tonen.
  const frontOver = remaining <= 0 ? 0 : wpm - wondenOpVoorste;
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
  // Eén wond toebrengen of terugnemen op de UNIT als geheel. Rolt door de modellen heen: is het
  // voorste model op, dan sneuvelt het en staat het volgende weer vol. Dit is wat beide wonden-rijen
  // gebruiken, dus een held en een regiment gedragen zich identiek.
  const wond = (delta: number) => onSetLost(Math.min(total, Math.max(0, clampedLost + delta)));

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
      {/* Tellers — de enige numerieke bron (de bar hieronder is puur visueel) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {showModels && (
          <CounterRow
            label="Models left"
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
            label={showModels ? 'Wounds left on front model' : 'Wounds left'}
            value={frontOver}
            cap={wpm}
            onDec={() => wond(1)}
            onInc={() => wond(-1)}
            decDisabled={clampedLost >= total}
            incDisabled={clampedLost <= 0}
          />
        )}
        {showSingleWound && (
          <CounterRow
            label="Wounds left"
            value={remaining}
            cap={total}
            onDec={() => wond(1)}
            onInc={() => wond(-1)}
            decDisabled={clampedLost >= total}
            incDisabled={clampedLost <= 0}
          />
        )}
      </div>

      {/* Strength-bar — puur visueel; status (Destroyed/Removed) rechts. Getallen staan in de teller. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(74,55,22,0.12)', overflow: 'hidden' }}>
          <div style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 99, background: barColor, transition: 'width .25s ease' }} />
        </div>
        {(dead || weg) && (
          <span style={{ ...eb, fontSize: 8, color: TOW.blood, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <Skull c={TOW.blood} />{weg ? 'Removed' : 'Destroyed'}
          </span>
        )}
      </div>

      {/* Toggles: Fleeing + Removed */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        {toggle(fleeing, onFlee, 'Fleeing', 'Flee')}
        {toggle(weg, onRemoved, 'Removed', 'Remove', true)}
      </div>

      {/* Kills — enemy units destroyed + trophies captured by this unit (feeds campaign veteran XP). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11, paddingTop: 11, borderTop: `1px solid ${TOW.line}` }}>
        <span style={{ flex: 1, minWidth: 0, ...eb, fontSize: 8, color: TOW.muted }}>Kills</span>
        <StepBtn dir={-1} onClick={() => onSetKills(clampedKills - 1)} disabled={!editable || clampedKills <= 0} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 52, justifyContent: 'center' }}>
          <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 17, color: TOW.ink }}>{clampedKills}</span>
        </div>
        <StepBtn dir={1} onClick={() => onSetKills(clampedKills + 1)} disabled={!editable} />
      </div>
    </div>
  );
}
