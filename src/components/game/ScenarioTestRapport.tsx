import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { collectVeteraan } from '../../lib/veteraanRapport';
import { collectKills } from './CampaignResultReporter';
import type { CampagneUitslag } from './useCampagneUitslag';
import type { VpResultaat } from '../../lib/victoryPoints';
import type { Army } from '../../types';
import { useLab } from '../lab/labContext';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;
const ORANJE = '#b45309';

/**
 * HET RAPPORT VAN DE SCENARIO-TEST, ALS VOORBEELD (23-10-2026, Scenario lab).
 *
 * Een test-battle meldt niets: de reporter praat met de server, en deze battle bestaat daar niet. Maar
 * Joost wil wél zien wat er gemeld ZOU worden: de VP per kant, de officiële trede (uit
 * `towc_vp_resultaat` op de test-DB, via useCampagneUitslag) en wat er verder in het rapport gaat
 * (verliezen, veteraan-regels, de uitslagregel). Daarom bouwt dit blok hetzelfde rapport op met dezelfde
 * functies als de reporter (collectKills, collectVeteraan), toont het, en verstuurt het NIET.
 * Host = aanvaller, guest = verdediger, net als overal.
 */
export function ScenarioTestRapport({ res, camp, hostName, guestName, hostArmy, guestArmy }: {
  res: VpResultaat;
  camp: CampagneUitslag | null;
  hostName: string;
  guestName: string;
  hostArmy: Army | null;
  guestArmy: Army | null;
}) {
  const { tracker } = useGame();
  const lab = useLab();
  const winnaarKant = camp ? camp.winnaar : res.winnaar;
  const winnaar = winnaarKant === 'host' ? 'attacker' : winnaarKant === 'guest' ? 'defender' : null;
  const kills = collectKills(tracker, hostArmy?.units, guestArmy?.units);
  const veteraan = [
    ...collectVeteraan(tracker, hostArmy, 'host', winnaarKant === 'host', guestArmy),
    ...collectVeteraan(tracker, guestArmy, 'guest', winnaarKant === 'guest', hostArmy),
  ].map((r) => r.vet);
  const uitslagRegel = camp
    ? camp.label === 'Draw'
      ? `Result: Draw (${res.verschil} VP difference) · Tournament Points ${camp.tpHost}-${camp.tpGuest}`
      : `Result: ${camp.label} for ${camp.winnaar === 'host' ? hostName : guestName} (+${res.verschil} VP) · Tournament Points ${camp.winnaar === 'host' ? camp.tpHost : camp.tpGuest}-${camp.winnaar === 'host' ? camp.tpGuest : camp.tpHost}`
    : `Result: ${res.winnaar ? `${res.winnaar === 'host' ? hostName : guestName} +${res.verschil} VP` : 'Draw'} (no official table)`;
  const payload = {
    winnaar,
    vp: { attacker: res.hostVp, defender: res.guestVp },
    resultaat: camp ? camp.tp : null,
    kills,
    veteraan,
    notities: uitslagRegel,
  };

  const rij = (label: string, waarde: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0', borderBottom: `1px dotted ${TOW.line}` }}>
      <span style={{ color: TOW.muted }}>{label}</span>
      <span style={{ color: TOW.ink, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{waarde}</span>
    </div>
  );
  const knop: React.CSSProperties = {
    flex: '1 1 140px', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: display, fontWeight: 700, fontSize: 13.5,
  };

  return (
    <div data-testid="scenario-test-uitslag" style={{ border: `1px dashed ${ORANJE}`, borderRadius: 10, padding: '10px 12px', fontFamily: serif, fontSize: 13, color: TOW.parchDim, lineHeight: 1.45 }}>
      <div style={{ ...eb, fontSize: 8, color: ORANJE, marginBottom: 4 }}>Test — nothing is submitted</div>
      <div style={{ marginBottom: 8 }}>
        {camp
          ? <>Campaign result: <strong>{camp.label === 'Draw' ? 'Draw' : `${camp.winnaar === 'host' ? hostName : guestName}: ${camp.label}`}</strong> (code {camp.tp}, {camp.cap} pt bracket, Tournament Points {camp.tpHost}-{camp.tpGuest}).</>
          : <>No campaign result: this test has no points cap, or the result table could not be reached.</>}
      </div>
      <div style={{ ...eb, fontSize: 7.5, color: TOW.muted, margin: '6px 0 3px' }}>What the report would send</div>
      {rij('Winner', winnaar ? `${winnaar === 'attacker' ? hostName : guestName} (${winnaar})` : 'none (draw)')}
      {rij(`VP · ${hostName} (attacker)`, res.hostVp)}
      {rij(`VP · ${guestName} (defender)`, res.guestVp)}
      {rij('Official result', camp ? `${camp.tp} · ${camp.label}` : '—')}
      {rij('Units with losses', kills.length)}
      {rij('Veteran lines', veteraan.length)}
      {rij('Notes line', uitslagRegel)}
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', color: TOW.muted, fontSize: 12.5 }}>Report payload (not sent)</summary>
        <pre data-testid="scenario-test-payload" style={{ margin: '6px 0 0', padding: 8, borderRadius: 8, background: TOW.cardLt, color: TOW.ink, fontSize: 11, lineHeight: 1.35, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 260, overflowY: 'auto' }}>
          {JSON.stringify(payload, null, 1)}
        </pre>
      </details>
      <div style={{ marginTop: 8 }}>Nothing is reported to the campaign.</div>
      {lab && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" onClick={lab.terug} style={{ ...knop, border: `1px solid ${TOW.lineStrong}`, background: 'transparent', color: TOW.ink }}>‹ Back to the lab</button>
          <button type="button" onClick={lab.herstart} style={{ ...knop, border: `1px solid ${ORANJE}`, background: 'rgba(180,83,9,0.12)', color: TOW.ink }}>Restart this battle</button>
        </div>
      )}
    </div>
  );
}
