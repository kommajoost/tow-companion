import { useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import type { VpBonus } from '../../lib/victoryPoints';
import { useObjectives } from './useObjectives';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;

const Min = () => (
  <svg width="16" height="16" viewBox="0 0 18 18"><path d="M4 9h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);
const Plus = () => (
  <svg width="16" height="16" viewBox="0 0 18 18"><path d="M9 4v10M4 9h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);

/** Objective-VP bijhouden TIJDENS het spel, bij de ronde.
 *
 *  Treasure troves en strategic landmarks scoren PER SPELER-TURN (+10 per trove, +25 per landmark).
 *  Dat is geen eindstand die je achteraf reconstrueert maar een teller die je elke beurt bijwerkt —
 *  en tot nu toe stond de enige plek om dat in te vullen in het eindscherm, dus moest je aan het
 *  eind terugrekenen hoeveel beurten je wat had vastgehouden (Joost, 29-08).
 *
 *  De VP-bedragen komen uit objectiveVp.ts, letterlijk van tow.whfb.app. Dit paneel telt alleen; het
 *  beslist niets over wie wat hield — dat leest de speler van de tafel af.
 *
 *  Zonder objectives (een gewoon potje buiten een campagne) rendert dit niets. */
export function ObjectivesTracker({ zijde, naam, editable = true, round }: {
  /** Voor wie je scoort — de kant die het roster nu toont. */
  zijde: 'host' | 'guest';
  naam: string;
  editable?: boolean;
  round: number;
}) {
  const { tracker, setTracker } = useGame();
  const objectives = useObjectives();
  const [open, setOpen] = useState(true);
  if (!objectives.length) return null;

  const bonus: VpBonus = tracker.bonus?.[zijde] ?? {};
  const zet = (patch: Partial<VpBonus>) => setTracker({
    ...tracker,
    bonus: { ...(tracker.bonus ?? {}), [zijde]: { ...bonus, ...patch } },
  });
  const zetObj = (key: string, vp: number) => zet({
    objectives: { ...(bonus.objectives ?? {}), [key]: Math.max(0, Math.round(vp)) },
  });

  const totaal = objectives.reduce((som, o) => som + Math.max(0, bonus.objectives?.[o.key] ?? 0), 0);
  const stap: React.CSSProperties = {
    width: 30, height: 30, borderRadius: 8, border: `1px solid ${TOW.lineStrong}`,
    background: 'transparent', color: TOW.ink, display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: 0, flexShrink: 0,
  };

  return (
    <section style={{ border: `1px solid ${TOW.line}`, borderRadius: 12, background: TOW.panel2, padding: '10px 12px', marginBottom: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, flex: 1, minWidth: 0 }}>
          Objectives · {naam}
        </span>
        <span style={{ fontFamily: display, fontWeight: 700, fontSize: 14, color: totaal > 0 ? TOW.goldDeep : TOW.muted }}>
          {totaal > 0 ? `+${totaal} VP` : '—'}
        </span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={TOW.muted} strokeWidth="2.6" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s ease' }}>
          <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          {/* De ronde erbij, want dat is waar deze tellers voor bestaan: aan het eind van elke
              speler-turn tik je aan wat je die beurt vasthield. */}
          <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.muted, margin: '0 0 6px' }}>
            Round {round} — tally what this side held at the end of each of its turns.
          </div>

          {objectives.map((o) => {
            const nu = Math.max(0, bonus.objectives?.[o.key] ?? 0);
            if (o.kind === 'toggle') {
              const aan = nu >= o.vp;
              return (
                <div key={o.key} style={{ padding: '3px 0' }}>
                  <button
                    type="button"
                    disabled={!editable}
                    onClick={() => zetObj(o.key, aan ? 0 : o.vp)}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', border: 'none', background: 'none', padding: '3px 1px', cursor: editable ? 'pointer' : 'default', textAlign: 'left' }}
                  >
                    <span style={{
                      width: 15, height: 15, flexShrink: 0, borderRadius: 4, boxSizing: 'border-box',
                      border: `1px solid ${aan ? TOW.gold : TOW.lineStrong}`, background: aan ? TOW.gold : 'transparent',
                    }} />
                    <span style={{ flex: 1, minWidth: 0, fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>
                      {o.label} (+{o.vp})
                    </span>
                  </button>
                  <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 10.5, color: TOW.muted, lineHeight: 1.35, margin: '1px 0 3px 26px' }}>{o.rule}</div>
                </div>
              );
            }
            const aantal = o.vp ? Math.round(nu / o.vp) : 0;
            return (
              <div key={o.key} style={{ padding: '3px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>
                    {o.label}{o.countLabel ? ` (${o.countLabel} ×${o.vp})` : ` (×${o.vp})`}
                  </span>
                  <button type="button" disabled={!editable || aantal <= 0} onClick={() => zetObj(o.key, (aantal - 1) * o.vp)} aria-label={`Fewer ${o.label}`} style={{ ...stap, cursor: (!editable || aantal <= 0) ? 'default' : 'pointer', opacity: aantal <= 0 ? 0.4 : 1 }}><Min /></button>
                  <span style={{ fontFamily: display, fontWeight: 700, fontSize: 16, color: TOW.ink, minWidth: 20, textAlign: 'center' }}>{aantal}</span>
                  <button type="button" disabled={!editable} onClick={() => zetObj(o.key, (aantal + 1) * o.vp)} aria-label={`More ${o.label}`} style={{ ...stap, cursor: editable ? 'pointer' : 'default' }}><Plus /></button>
                  <span style={{ fontFamily: serif, fontSize: 11, color: TOW.muted, minWidth: 46, textAlign: 'right' }}>+{nu} VP</span>
                </div>
                <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 10.5, color: TOW.muted, lineHeight: 1.35, margin: '1px 0 3px 2px' }}>{o.rule}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
