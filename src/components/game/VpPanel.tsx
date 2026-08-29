import { useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { vpSchaal, type VpBonus, type VpResultaat, type VpSchaal } from '../../lib/victoryPoints';
import { type ObjectiveDef } from '../../lib/objectiveVp';
import { useCampagneUitslag } from './useCampagneUitslag';
import { useObjectives } from './useObjectives';

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

// Het VP / Result-paneel. Toont de uitslag die de parent (GameView) berekent en meegeeft via `res`
// + de namen — zo zien beide spelers exact dezelfde absolute stand (host/guest), onafhankelijk van
// welke seat kijkt. Dit paneel is een slanke banner: geen dubbele grote VP-cijfers meer (die staan
// in de BattleBar en het End-battle-overzicht), alleen de uitslag-regel + inklapbare editors.
// useGame() blijft nodig voor de bonus-mutatie (tracker/setTracker) en de campagne-objective-fetch (code).
//
// `compact` = variant voor de smalle wide-sidebar: kleinere headline + iets strakkere spacing.
// De phone-variant laat 'm weg (ruimere weergave).
export function VpPanel({ compact = false, res, hostName, guestName, hideOutcome = false }: {
  compact?: boolean;
  res: VpResultaat;
  hostName: string;
  guestName: string;
  /** Verberg de uitslag-badge (bv. in het End-battle-overzicht, waar de headline de uitslag al toont). */
  hideOutcome?: boolean;
}) {
  const { tracker, setTracker } = useGame();
  const [rulesOpen, setRulesOpen] = useState(false);
  // Bonussen staan OPEN by default (Joost 15-08-2026). Dichtgeklapt scheelde ruimte, maar dit is
  // precies het deel dat je zelf moet aanvinken — de tracker kan een gevallen General of een
  // scenario-objective niet zien. Wat je moet doen hoort niet achter een klik te zitten; de
  // regel-referentie eronder (rulesOpen) blijft wél dicht, want dat is naslag.
  const [bonusOpen, setBonusOpen] = useState(true);
  // Welke objective-VP-posten gelden, komt uit useObjectives: die haalt de campagne-battle op en
  // leidt scenario + secondaries af. Gedeeld met het paneel dat tijdens de rondes meetelt, want
  // twee kopieën van deze afleiding is precies hoe twee schermen het oneens worden over WELKE
  // objectives er gelden (29-08).
  const objDefs = useObjectives();
  // De ACTIEVE VP-schaal. Battle March halveert General/BSB/standaard, dus de labels moeten die
  // bedragen tonen: een vast "(+100)" op een Battle March-tafel zou de speler voorliegen over wat de
  // engine erachter optelt.
  const schaal = vpSchaal(tracker.battleMarch);

  // Muteer één bonus-kant en sync via setTracker (last-write-wins, net als de rest van de tracker).
  const setBonus = (side: 'host' | 'guest', patch: Partial<VpBonus>) => {
    setTracker({
      ...tracker,
      bonus: { ...tracker.bonus, [side]: { ...tracker.bonus?.[side], ...patch } },
    });
  };

  // Uitslag-tekst: "Victory · +180 VP" (winnaar-naam ervoor), of gewoon "Draw" bij gelijkspel.
  // BIJ EEN CAMPAGNE-BATTLE WINT DE CAMPAGNE-TABEL (21-08-2026): de kale rulebook-regel is schaalloos
  // en riep op een 500-punts tafel al "Crushing Victory" bij 150-50. Zie useCampagneUitslag.
  const camp = useCampagneUitslag(res);
  const winnaarKant = camp ? camp.winnaar : res.winnaar;
  const winnerName = winnaarKant === 'host' ? hostName : winnaarKant === 'guest' ? guestName : null;
  const uitslagLabel = camp ? camp.label : UITSLAG_LABEL[res.uitslag];
  const isGelijk = camp ? camp.tp === 'D' : res.uitslag === 'draw';

  const box: React.CSSProperties = { border: `1px solid ${TOW.goldDeep}`, borderRadius: 12, background: 'rgba(184,134,47,0.08)', padding: compact ? '12px 13px' : '14px 15px' };

  return (
    <div style={box}>
      <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 9 }}>Victory Points</div>

      {/* Uitslag-badge — headline van de banner. In het End-battle-overzicht verborgen (hideOutcome). */}
      {!hideOutcome && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, background: isGelijk ? 'transparent' : 'rgba(184,134,47,0.12)', border: `1px solid ${isGelijk ? TOW.line : TOW.goldDeep}`, marginBottom: 12 }}>
          <span style={{ fontFamily: display, fontWeight: 700, fontSize: compact ? 14 : 15, color: isGelijk ? TOW.muted : TOW.goldDeep, textAlign: 'center' }}>
            {winnerName ? `${winnerName} — ${uitslagLabel}` : uitslagLabel}
          </span>
          {res.verschil > 0 && (
            <span style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim, whiteSpace: 'nowrap' }}>+{res.verschil} VP</span>
          )}
        </div>
      )}

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
          <BonusEditor name={hostName} bonus={tracker.bonus?.host} onSet={(p) => setBonus('host', p)} compact={compact} objectives={objDefs} schaal={schaal} />
          <div style={{ height: 10 }} />
          <BonusEditor name={guestName} bonus={tracker.bonus?.guest} onSet={(p) => setBonus('guest', p)} compact={compact} objectives={objDefs} schaal={schaal} />
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
      {rulesOpen && <RuleReference schaal={schaal} battleMarch={tracker.battleMarch === true} />}
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
  objectives,
  schaal,
}: {
  name: string;
  bonus: VpBonus | undefined;
  onSet: (patch: Partial<VpBonus>) => void;
  compact: boolean;
  objectives: ObjectiveDef[];
  /** De actieve VP-schaal (Warhammer Battles of Battle March) — bepaalt de bedragen in de labels. */
  schaal: VpSchaal;
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
        {toggle(generalDown, `Enemy General down (+${schaal.general})`, () => onSet({ generalDown: !generalDown }))}
        {toggle(bsbDown, `Enemy BSB down (+${schaal.bsb})`, () => onSet({ bsbDown: !bsbDown }))}

        {/* Buitgemaakte standaards (×50) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 1px' }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>Enemy standards captured (×{schaal.standaard})</span>
          <button onClick={() => onSet({ standaards: Math.max(0, standaards - 1) })} disabled={standaards <= 0} aria-label="Fewer standards" style={{ ...stepBtn, cursor: standaards <= 0 ? 'default' : 'pointer', opacity: standaards <= 0 ? 0.4 : 1 }}><Minus c="currentColor" /></button>
          <span style={{ fontFamily: display, fontWeight: 700, fontSize: 15, color: TOW.ink, minWidth: 16, textAlign: 'center' }}>{standaards}</span>
          <button onClick={() => onSet({ standaards: standaards + 1 })} aria-label="More standards" style={stepBtn}><Plus c="currentColor" /></button>
        </div>

        {/* Scenario/secondary objectives (optie B) — exacte VP letterlijk van tow.whfb.app */}
        {objectives.map((o) => {
          const cur = Math.max(0, bonus?.objectives?.[o.key] ?? 0);
          const setObj = (val: number) => onSet({ objectives: { ...(bonus?.objectives ?? {}), [o.key]: Math.max(0, Math.round(val)) } });
          const ruleStyle: React.CSSProperties = { fontFamily: serif, fontStyle: 'italic', fontSize: 10.5, color: TOW.muted, lineHeight: 1.35, margin: '1px 0 3px 2px' };
          if (o.kind === 'toggle') {
            const on = cur >= o.vp;
            return (
              <div key={o.key}>
                {toggle(on, `${o.label} (+${o.vp})`, () => setObj(on ? 0 : o.vp))}
                <div style={ruleStyle}>{o.rule}</div>
              </div>
            );
          }
          const count = o.vp ? Math.round(cur / o.vp) : 0;
          return (
            <div key={o.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 1px' }}>
                <span style={{ flex: 1, minWidth: 0, fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>{o.label}{o.countLabel ? ` (${o.countLabel} ×${o.vp})` : ` (×${o.vp})`}</span>
                <button onClick={() => setObj((count - 1) * o.vp)} disabled={count <= 0} aria-label="Fewer" style={{ ...stepBtn, cursor: count <= 0 ? 'default' : 'pointer', opacity: count <= 0 ? 0.4 : 1 }}><Minus c="currentColor" /></button>
                <span style={{ fontFamily: display, fontWeight: 700, fontSize: 15, color: TOW.ink, minWidth: 18, textAlign: 'center' }}>{count}</span>
                <button onClick={() => setObj((count + 1) * o.vp)} aria-label="More" style={stepBtn}><Plus c="currentColor" /></button>
                <span style={{ fontFamily: serif, fontSize: 11, color: TOW.muted, minWidth: 44, textAlign: 'right' }}>+{cur} VP</span>
              </div>
              <div style={ruleStyle}>{o.rule}</div>
            </div>
          );
        })}

        {/* Vrij veld voor overige/onbekende objective-VP (catch-all naast de bovenstaande). Het heette
            "Other objective VP" en dat was onduidelijk (Joost 21-08-2026): je zag niet WELK objectief er
            op je tafel lag, dus typte je het totaal hier maar in. De objectives hierboven staan nu bij
            naam; dit veld is expliciet het restje. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 1px', marginTop: 2 }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>
            Anything else (+)
            <span style={{ display: 'block', fontStyle: 'italic', fontSize: 10.5, color: TOW.muted, lineHeight: 1.35 }}>
              {objectives.length
                ? 'Only for VP not covered by the objectives listed above.'
                : 'Free field — use it for scenario VP this game does not list.'}
            </span>
          </span>
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
function RuleReference({ schaal, battleMarch }: { schaal: VpSchaal; battleMarch: boolean }) {
  const item = (title: string, body: string) => (
    <div style={{ marginBottom: 9 }}>
      <div style={{ fontFamily: display, fontWeight: 700, fontSize: 12.5, color: TOW.ink, marginBottom: 2 }}>{title}</div>
      <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
  return (
    <div style={{ marginTop: 9, paddingTop: 10, borderTop: `1px solid ${TOW.line}` }}>
      {item('Dead or Fled', 'An enemy unit destroyed or fled off the table is worth 100% of its points. A unit still fleeing at game end, or reduced to 25% or less of its starting Unit Strength (or Wounds), is worth 50% (rounded up).')}
      {item('The King is Dead', `The enemy General slain or fled scores an extra +${schaal.general} VP.`)}
      {item('Trophies of War', `Each captured enemy standard scores +${schaal.standaard} VP. The enemy Battle Standard Bearer slain or fled scores +${schaal.bsb} VP.`)}
      {battleMarch && item('Treasure Troves / Strategic Landmarks', 'At the end of each player’s turn you score +10 VP for each treasure trove you control, and +25 VP if you control the strategic landmark. Count the turns in the objective control above.')}
      {item('Scenario Objectives / Special Features', 'Defined per scenario — enter any objective VP scored manually.')}
      {item('Result', 'A VP difference below 100 is a Draw. 100 or more is a Victory. If the winner has at least twice the loser’s VP, it is a Crushing Victory.')}
      <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 10.5, color: TOW.muted, marginTop: 4 }}>Source: tow.whfb.app · {battleMarch ? 'Battle March (General’s Companion p.27) — Dead or Fled and the win thresholds are the same as in Warhammer Battles' : 'Warhammer Battles'}</div>
    </div>
  );
}
