import { useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { COMPOSITION_RULES } from '../../lib/owbBuilder';
import { VERSTERKING_OVERAL } from '../../lib/versterking';

// List settings: rename the list and change its army composition. Both were unreachable in the
// redesigned builder — its army-summary rows called an `onEditArmyField` the container never
// implemented, and on a phone the title was plain text — so a name typed once at creation was final.
//
// What is NOT editable here, on purpose:
//   * the FACTION — every unit in the list belongs to that army's catalogue, so switching it would
//     leave a roster of units that no longer exist. Start a new list instead.
//   * for a campaign list, the points cap and the composition rule: those come from the campaign
//     (Act cap, allowed composition) and are not the player's to set. They are shown, with a reason.

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;
const ruleName = (id: string): string => COMPOSITION_RULES.find((r) => r.id === id)?.name ?? id;

export function ListSettings({
  naam, army, armyName, composition, comps, compName, rule, points,
  campagneLabel, campagneAct, versterkingBasis = null, onVersterking = null, versterkingPunten = 0, onClose, onOpslaan,
}: {
  naam: string;
  army: string;
  armyName: string;
  composition: string;
  comps: string[];
  compName: (comp: string) => string;
  rule: string;
  points: number;
  /** Set for a campaign list: then points + rule are fixed and we say where they come from. */
  campagneLabel?: string | null;
  campagneAct?: number | null;
  /** REINFORCEMENT DETACHMENT (23-10-2026): gezet bij een versterkingslijst — de battle-grootte waarop
   *  zijn regels gelden. Dan stel je die in, en is de puntengrens de helft. */
  versterkingBasis?: number | null;
  /** Bij een gewone lijst: maak er een versterkingslijst bij (`versterkingPunten` groot). */
  onVersterking?: (() => void) | null;
  versterkingPunten?: number;
  onClose: () => void;
  onOpslaan: (v: { naam: string; composition: string; rule: string; points: number; basis?: number }) => void;
}) {
  const [n, setN] = useState(naam);
  const [comp, setComp] = useState(composition);
  const [r, setR] = useState(rule);
  const [p, setP] = useState(points);
  const rf = versterkingBasis != null;
  const [b, setB] = useState(versterkingBasis ?? 0);
  const vast = !!campagneLabel;
  const opslaan = () => onOpslaan({ naam: n.trim() || naam, composition: comp, rule: r, points: p, basis: rf ? b : undefined });

  const veld: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9,
    border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt,
    fontFamily: towFont.serif, fontSize: 14, color: TOW.ink, outline: 'none',
  };
  const label: React.CSSProperties = { ...eb, fontSize: 8.5, color: TOW.muted };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(30,20,8,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', background: TOW.panel, borderRadius: 16, border: `1px solid ${TOW.lineStrong}`, boxShadow: '0 16px 50px rgba(40,24,8,0.34)', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <h2 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 20, color: TOW.ink, margin: 0 }}>List settings</h2>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', color: TOW.muted, fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ ...label, marginBottom: 6 }}>List name</div>
        <input value={n} onChange={(e) => setN(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') opslaan(); }}
          style={{ ...veld, fontFamily: towFont.display, fontWeight: 600, fontSize: 15 }} />

        <div style={{ ...label, margin: '16px 0 6px' }}>Army composition</div>
        <select value={comps.includes(comp) ? comp : comps[0] ?? comp} onChange={(e) => setComp(e.target.value)} style={veld}>
          {comps.map((c) => <option key={c} value={c}>{compName(c)}</option>)}
        </select>
        <div style={{ ...label, marginTop: 6, color: TOW.faint }}>
          Changing this can move units between Core, Special and Rare — and a composition that doesn’t
          offer a unit you already took will flag it.
        </div>

        <div style={{ ...label, margin: '16px 0 6px' }}>Faction</div>
        <div style={{ ...veld, opacity: 0.6 }}>{armyName || army}</div>
        <div style={{ ...label, marginTop: 6, color: TOW.faint }}>
          Fixed — your units come from this army’s catalogue. Start a new list for another faction.
        </div>

        {rf ? (
          <>
            <div style={{ ...label, margin: '16px 0 6px' }}>Battle size (the rules it is built under)</div>
            <input type="number" inputMode="numeric" min={0} step={250} value={b}
              onChange={(e) => setB(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              style={{ ...veld, fontFamily: towFont.display, fontWeight: 600 }} />
            <div style={{ ...label, marginTop: 6, color: TOW.faint }}>
              A reinforcement detachment is up to half of this: {Math.floor(b / 2)} pts. Category limits, the
              Core minimum and the 0-X per 1,000 points limits count as in a {b}-point battle.
            </div>
          </>
        ) : (<>
        <div style={{ ...label, margin: '16px 0 6px' }}>Points limit</div>
        {vast ? (
          <>
            <div style={{ ...veld, opacity: 0.6, fontFamily: towFont.display, fontWeight: 600 }}>{points}</div>
            <div style={{ ...label, marginTop: 6, color: TOW.faint }}>
              Set by {campagneLabel}{campagneAct ? ` — the Act ${campagneAct} limit` : ''}.
            </div>
          </>
        ) : (
          <input type="number" inputMode="numeric" min={0} step={50} value={p}
            onChange={(e) => setP(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            style={{ ...veld, fontFamily: towFont.display, fontWeight: 600 }} />
        )}
        </>)}

        <div style={{ ...label, margin: '16px 0 6px' }}>Game mode</div>
        {vast ? (
          <>
            <div style={{ ...veld, opacity: 0.6 }}>{ruleName(r)}</div>
            <div style={{ ...label, marginTop: 6, color: TOW.faint }}>Set by {campagneLabel}.</div>
          </>
        ) : (
          <select value={r} onChange={(e) => setR(e.target.value)} style={veld}>
            {COMPOSITION_RULES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.inkDim, fontFamily: towFont.display, fontWeight: 600, fontSize: 13 }}>Cancel</button>
          <button onClick={opslaan}
            style={{ flex: 1.4, padding: 12, borderRadius: 10, cursor: 'pointer', border: 'none', background: goldGrad, color: TOW.onGrad, fontFamily: towFont.display, fontWeight: 700, fontSize: 13.5 }}>Save</button>
        </div>

        {/* REINFORCEMENT DETACHMENT (23-10-2026). Aan een teamtafel van twee tegen drie mag elke speler
            aan de kleine kant een versterking van de helft van de cap meenemen, uit zijn eigen army book.
            Die bouw je als eigen lijst; hier maak je hem aan, bij deze lijst. */}
        {/* Verborgen tot het nodig is (28-10-2026): zie VERSTERKING_OVERAL in lib/versterking.ts. */}
        {onVersterking && VERSTERKING_OVERAL && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${TOW.line}` }}>
            <div style={{ ...label, marginBottom: 6 }}>Reinforcement detachment</div>
            <div style={{ fontFamily: towFont.serif, fontSize: 12.5, lineHeight: 1.5, color: TOW.inkDim, marginBottom: 8 }}>
              Outnumbered at a team table (2 vs 3)? Each general on the smaller side may bring a reinforcement of
              half the points, from the same army book. Build it as its own list: it joins your army for that
              battle only.
            </div>
            <button data-testid="maak-versterking" onClick={onVersterking}
              style={{ width: '100%', padding: 11, borderRadius: 10, cursor: 'pointer', border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.ink, fontFamily: towFont.display, fontWeight: 700, fontSize: 13 }}>
              New reinforcement detachment · up to {versterkingPunten} pts
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
