import { useMemo } from 'react';
import { TOW, towFont } from '../../design/tow';
import { useGame } from '../../game';
import {
  gedeeldeTellers, isGedeeldeTeller, klemInvoer, klemStand, postenVoor, postVp, potStand, ruimteVoor,
  type BonusPost, type ScenarioBonus, type ScenarioStand, type Zijde,
} from '../../lib/scenarioBonus';
import { effectieveStanden, knopLabel, postUitUnits, puntDetail, REKENREGEL, tikUnit, uitsluitingTekst } from '../../lib/scenarioUnits';
import { unitToon } from '../../lib/unitNaam';
import type { Army } from '../../types';

const display = towFont.display;
const serif = towFont.serif;

const Min = () => (
  <svg width="16" height="16" viewBox="0 0 18 18"><path d="M4 9h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);
const Plus = () => (
  <svg width="16" height="16" viewBox="0 0 18 18"><path d="M9 4v10M4 9h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);

/** De legers per stoel (host = aanvaller), los van wie er kijkt. Solo bedient beide kanten en zit op host. */
export function useLegersPerStoel(): { host: Army | null; guest: Army | null } {
  const { seat, myArmy, opponentArmy } = useGame();
  return seat === 'guest' ? { host: opponentArmy, guest: myArmy } : { host: myArmy, guest: opponentArmy };
}

/** De stand van beide stoelen zoals de VP-engine hem leest (24-10-2026): een puntwaarde-post (Breakthrough)
 *  is de som van de aangetikte units, niet het ruwe getal op de tracker. Eén afleiding voor de teller, het
 *  VP-paneel en berekenVictory, anders tonen twee schermen een ander bedrag. */
export function useEffectieveStanden(def: ScenarioBonus | null): { host: ScenarioStand | undefined; guest: ScenarioStand | undefined } {
  const { tracker } = useGame();
  const legers = useLegersPerStoel();
  return useMemo(
    () => effectieveStanden(def, tracker.bonus?.host, tracker.bonus?.guest, legers.host, legers.guest, tracker),
    [def, tracker, legers.host, legers.guest],
  );
}

/** De scenario-VP die deze stoel nu heeft (voor een totaal in een kop). Geef de EFFECTIEVE standen mee
 *  (useEffectieveStanden), niet de ruwe van de tracker. */
export function scenarioTotaal(def: ScenarioBonus | null, zijde: Zijde, host: ScenarioStand | undefined, guest: ScenarioStand | undefined): number {
  if (!def) return 0;
  return postenVoor(def, zijde).reduce((s, p) => s + postVp(def, p, zijde, host, guest), 0);
}

/**
 * DE SCENARIO-POSTEN VAN ÉÉN KANT (22-10-2026), invoer en uitkomst.
 *
 * Eén component voor beide plekken waar je scoort: de objectives-teller tijdens de rondes en het
 * VP-paneel in het eindscherm. Twee kopieën van deze invoer is hoe twee schermen het oneens worden.
 *
 *  · 'eind'        aan/uit. Een post die BEIDE kanten kunnen scoren (de feature van Command & Control)
 *                  hoort aan het eind bij hoogstens één kant: aanzetten bij de een zet hem bij de ander uit.
 *  · 'per-stuk' /
 *    'per-beurt'   een teller, begrensd door `max`. Kunnen BEIDE kanten hem scoren (24-10-2026, Command &
 *                  Control per spelerbeurt), dan heeft elke kant hier zijn eigen teller, en samen niet meer
 *                  dan `max`: de plus gaat uit zodra de twee samen vol zijn (weigeren, niet de ander
 *                  terugzetten: wat de ander tikte is zijn invoer). De stand van de ander staat eronder.
 *  · 'pot'         geen invoer: begint op de startwaarde en zakt vanzelf per score van de gekoppelde post
 *                  (de plunderingen van de aanvaller), nooit onder 0.
 *  · 'puntwaarde'  Breakthrough: aanvallende units helemaal in de zone. Sinds 24-10-2026 tik je die units
 *                  aan op hun kaart (knopje "Breakthrough") en is de post de som van hun puntwaarde van NU;
 *                  hier staat welke units meetellen en voor hoeveel. Typen alleen nog als terugval (die kant
 *                  heeft geen leger in het potje, of er stond al een getypt getal), zie scenarioUnits.ts.
 *
 * De ruwe stand staat op de tracker (`bonus[host|guest].scenario`), dus hij synct naar de tegenstander
 * en loopt via de VP mee in de rapport-sig. Host = aanvaller, guest = verdediger.
 */
export function ScenarioPosten({ def, zijde, editable = true, compact = false }: {
  def: ScenarioBonus | null;
  zijde: Zijde;
  editable?: boolean;
  compact?: boolean;
}) {
  const { tracker, setTracker } = useGame();
  const legers = useLegersPerStoel();
  const eff = useEffectieveStanden(def);
  if (!def) return null;
  const posten = postenVoor(def, zijde);
  if (!posten.length) return null;

  // De VP rekenen op de effectieve stand (puntwaarde uit de units); de invoer leest de ruwe.
  const host = eff.host;
  const guest = eff.guest;
  const mijn = (zijde === 'host' ? tracker.bonus?.host?.scenario : tracker.bonus?.guest?.scenario) ?? {};
  const ander: Zijde = zijde === 'host' ? 'guest' : 'host';

  const zet = (p: BonusPost, n: number) => {
    // De RUWE standen van de tracker: een gedeelde teller mag niet verder dan wat de ander overlaat.
    const waarde = klemInvoer(p, zijde, n, tracker.bonus?.host?.scenario, tracker.bonus?.guest?.scenario);
    const bonus = { ...(tracker.bonus ?? {}) };
    bonus[zijde] = { ...(bonus[zijde] ?? {}), scenario: { ...(bonus[zijde]?.scenario ?? {}), [p.id]: waarde } };
    // Een eind-post van beide kanten: aan het eind kan maar één kant hem hebben.
    if (p.soort === 'eind' && p.kant === 'beide' && waarde > 0 && (bonus[ander]?.scenario?.[p.id] ?? 0) > 0) {
      bonus[ander] = { ...(bonus[ander] ?? {}), scenario: { ...(bonus[ander]?.scenario ?? {}), [p.id]: 0 } };
    }
    setTracker({ ...tracker, bonus });
  };

  const stap: React.CSSProperties = {
    width: compact ? 26 : 30, height: compact ? 26 : 30, borderRadius: 8, border: `1px solid ${TOW.lineStrong}`,
    background: 'transparent', color: TOW.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
  };
  const uitlegStijl: React.CSSProperties = { fontFamily: serif, fontStyle: 'italic', fontSize: 10.5, color: TOW.muted, lineHeight: 1.35, margin: '1px 0 3px 2px' };
  const vpStijl: React.CSSProperties = { fontFamily: serif, fontSize: 11, color: TOW.muted, minWidth: 46, textAlign: 'right', flexShrink: 0 };
  const label: React.CSSProperties = { flex: 1, minWidth: 0, fontFamily: serif, fontSize: 12.5, color: TOW.parchDim };

  return (
    <div data-testid={`scenario-posten-${zijde}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {posten.map((p) => {
        const vp = postVp(def, p, zijde, host, guest);
        const uitleg = p.uitleg ? <div style={uitlegStijl}>{p.uitleg}</div> : null;

        if (p.soort === 'pot') {
          const pot = potStand(def, p, host, guest);
          const k = p.potKoppeling ? def.posten.find((x) => x.id === p.potKoppeling) : undefined;
          return (
            <div key={p.id} data-post={p.id} style={{ padding: '3px 0' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={label}>
                  {p.label}
                  <span style={{ display: 'block', fontSize: 11.5, color: TOW.muted }}>
                    {pot.start}{pot.aftrek ? ` − ${pot.aftrek} × ${pot.keer}` : ''} = {pot.vp} VP
                    {k ? ` · goes down by itself with each "${k.label}"` : ''}
                  </span>
                </span>
                <span style={{ ...vpStijl, color: pot.vp > 0 ? TOW.goldDeep : TOW.muted, fontWeight: 700 }}>+{pot.vp} VP</span>
              </div>
              {uitleg}
            </div>
          );
        }

        if (p.soort === 'eind') {
          const aan = (mijn[p.id] ?? 0) > 0;
          return (
            <div key={p.id} data-post={p.id} style={{ padding: '3px 0' }}>
              <button
                type="button"
                disabled={!editable}
                aria-pressed={aan}
                onClick={() => zet(p, aan ? 0 : 1)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', border: 'none', background: 'none', padding: '3px 1px', cursor: editable ? 'pointer' : 'default', textAlign: 'left' }}
              >
                <span style={{ width: 15, height: 15, flexShrink: 0, borderRadius: 4, boxSizing: 'border-box', border: `1px solid ${aan ? TOW.gold : TOW.lineStrong}`, background: aan ? TOW.gold : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {aan && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2l2.2 2.3 4.8-5" stroke={TOW.onGrad} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                <span style={label}>{p.label} (+{p.vp}){p.kant === 'beide' ? <span style={{ color: TOW.muted }}> · either side</span> : null}</span>
                <span style={vpStijl}>+{vp} VP</span>
              </button>
              {uitleg}
            </div>
          );
        }

        if (p.soort === 'puntwaarde' && postUitUnits(p)) {
          const detail = puntDetail(p, zijde, tracker.bonus?.[zijde], legers[zijde], tracker);
          if (detail.bron === 'units') {
            const knop = knopLabel(p);
            const tik = (unitId: string) => setTracker({
              ...tracker,
              bonus: { ...(tracker.bonus ?? {}), [zijde]: tikUnit(tracker.bonus?.[zijde], p.id, unitId, false) },
            });
            return (
              <div key={p.id} data-post={p.id} data-testid={`post-units-${p.id}`} style={{ padding: '3px 0' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={label}>{p.label}{p.vp !== 1 ? ` (×${p.vp})` : ''}</span>
                  <span data-testid={`post-som-${p.id}`} style={{ ...vpStijl, color: vp > 0 ? TOW.goldDeep : TOW.muted, fontWeight: 700 }}>+{vp} VP</span>
                </div>
                {detail.regels.length === 0 ? (
                  <div style={{ ...uitlegStijl, fontStyle: 'normal' }}>
                    No units yet. Tap “{knop}” on each attacking unit that ends wholly inside the defender’s zone.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '3px 0 2px' }}>
                    {detail.regels.map((r) => {
                      const naam = unitToon(r.unit).primair || r.unit.name;
                      return (
                        <div key={r.id} data-unit={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: serif, fontSize: 12, color: r.uitgesloten ? TOW.muted : TOW.parchDim }}>
                          {/* Naam boven, de stand eronder: in het smalle VP-paneel kortte de stand de naam anders af. */}
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: r.uitgesloten ? 'line-through' : 'none' }}>
                              {r.unit.count ? `${r.unit.count}× ` : ''}{naam}
                            </span>
                            <span style={{ display: 'block', fontSize: 10.5, color: r.uitgesloten ? TOW.blood : TOW.muted }}>
                              {r.uitgesloten ? `Not counted: ${uitsluitingTekst(r.uitgesloten)}` : r.nu < r.punten ? `${r.rest} · ${r.nu} of ${r.punten} pts` : `full strength · ${r.punten} pts`}
                            </span>
                          </span>
                          <span style={{ flexShrink: 0, minWidth: 34, textAlign: 'right', fontFamily: display, fontWeight: 700, fontSize: 12.5, color: r.nu > 0 ? TOW.ink : TOW.muted }}>{r.nu}</span>
                          {editable && (
                            <button type="button" onClick={() => tik(r.id)} aria-label={`Remove ${naam} from ${knop}`} title={`Remove from ${knop}`} style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.muted, cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div title={REKENREGEL} style={uitlegStijl}>{REKENREGEL}</div>
                {uitleg}
              </div>
            );
          }
        }

        if (p.soort === 'puntwaarde') {
          const punten = Math.max(0, mijn[p.id] ?? 0);
          return (
            <div key={p.id} data-post={p.id} style={{ padding: '3px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={label}>{p.label}{p.vp !== 1 ? ` (×${p.vp})` : ''}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  disabled={!editable}
                  aria-label={`${p.label}: points`}
                  value={punten === 0 ? '' : punten}
                  placeholder="0"
                  onChange={(e) => { const n = parseInt(e.target.value, 10); zet(p, Number.isFinite(n) ? n : 0); }}
                  style={{ width: 72, textAlign: 'right', borderRadius: 8, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, padding: '5px 8px', fontFamily: display, fontWeight: 700, fontSize: 14, boxSizing: 'border-box' }}
                />
                <span style={vpStijl}>+{vp} VP</span>
              </div>
              {/* Terugval met een leger in het potje: er stond al een getypt getal (van vóór 24-10). */}
              {postUitUnits(p) && (legers[zijde]?.units.length ?? 0) > 0 && (
                <div style={{ ...uitlegStijl, fontStyle: 'normal' }}>Entered by hand. Tap “{knopLabel(p)}” on the units instead and they count at their value as they stand now.</div>
              )}
              {uitleg}
            </div>
          );
        }

        // per-stuk / per-beurt: een begrensde teller. Gedeeld (beide kanten): elk een eigen teller, samen ≤ max.
        const gedeeld = isGedeeldeTeller(p);
        const ruwHost = tracker.bonus?.host?.scenario;
        const ruwGuest = tracker.bonus?.guest?.scenario;
        const paar = gedeeld ? gedeeldeTellers(p, ruwHost, ruwGuest) : null;
        const n = paar ? (zijde === 'host' ? paar.ruwHost : paar.ruwGuest) : klemStand(p, mijn[p.id] ?? 0);
        const vol = ruimteVoor(p, zijde, ruwHost, ruwGuest) <= 0;
        const anderN = paar ? (ander === 'host' ? paar.ruwHost : paar.ruwGuest) : 0;
        return (
          <div key={p.id} data-post={p.id} data-testid={gedeeld ? `post-teller-${p.id}-${zijde}` : undefined} style={{ padding: '3px 0' }}>
            {/* Te smal (het VP-paneel in het eindscherm): het label op een eigen regel en de teller eronder,
                anders wordt een lang label als "Command & Control: special feature held …" een kolom van één
                woord breed. In de bredere objectives-teller past alles nog op één regel. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span style={{ ...label, flex: '1 1 120px' }}>
                {p.label} (×{p.vp}{p.soort === 'per-beurt' ? ' per turn' : ''})
                {gedeeld ? <span style={{ color: TOW.muted }}> · either side</span> : null}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button type="button" disabled={!editable || n <= 0} onClick={() => zet(p, n - 1)} aria-label={`Fewer: ${p.label}`} style={{ ...stap, cursor: (!editable || n <= 0) ? 'default' : 'pointer', opacity: n <= 0 ? 0.4 : 1 }}><Min /></button>
              <span style={{ fontFamily: display, fontWeight: 700, fontSize: 16, color: TOW.ink, minWidth: 34, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                {n}{p.max != null ? <span style={{ fontSize: 11, color: TOW.muted }}>/{p.max}</span> : null}
              </span>
              <button type="button" disabled={!editable || vol} onClick={() => zet(p, n + 1)} aria-label={`More: ${p.label}`} style={{ ...stap, cursor: (!editable || vol) ? 'default' : 'pointer', opacity: vol ? 0.4 : 1 }}><Plus /></button>
              <span data-testid={gedeeld ? `post-vp-${p.id}-${zijde}` : undefined} style={vpStijl}>+{vp} VP</span>
              </span>
            </div>
            {paar && p.max != null && (
              <div data-testid={`post-samen-${p.id}-${zijde}`} style={{ ...uitlegStijl, fontStyle: 'normal', color: paar.teVeel ? TOW.blood : TOW.muted }}>
                {paar.teVeel
                  ? `This side ${n}, the other side ${anderN}: more than ${p.max} together. Correct one of them; until then each counts at most ${p.max} minus the other.`
                  : `This side ${n}, the other side ${anderN} · ${n + anderN} of ${p.max} together${n + anderN >= p.max ? ' (full)' : ''}`}
              </div>
            )}
            {uitleg}
          </div>
        );
      })}
    </div>
  );
}
