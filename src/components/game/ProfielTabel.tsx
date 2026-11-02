import { createContext, useContext } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { BETER_KLEUR, BETER_ACHTERGROND } from '../../lib/veteraanStats';
import { Eye } from './Eye';

const eb = engraved as React.CSSProperties;

/** SMALLE KOLOM (Joost 02-11-2026, "de stats passen dan net niet" in de weergave naast elkaar op de Fold):
 *  binnen deze vlag krimpen de stattabellen tot ~250 px in plaats van horizontaal te scrollen. */
export const SmalleKolom = createContext(false);

export interface ProfielCel {
  v: string;
  /** Gewijzigd (goud): een gekozen wapen of een andere bron. */
  hl: boolean;
  title?: string;
  /** Verschil met de basis door een veteran ability (groen bij beter), of null. */
  d?: number | null;
}

export interface ProfielRij {
  label: string;
  cellen: ProfielCel[];
  /** Er is een eigen regelblad voor dit model (een mount, de crew): toont het oogje. */
  onInfo?: () => void;
}

/**
 * ÉÉN TABEL VOOR ALLE PROFIELEN (Joost 28-10-2026: "het geheel moet compacter … niet een enorm lange lijst
 * met scrollen"). Een unit met een kampioen of een mount had per model een eigen tabel met een eigen
 * kopregel; nu staan ze als rijen onder één kop, met de naam in de eerste kolom. Eén profiel (een held
 * te voet) heeft geen naamkolom nodig: de naam staat al boven de kaart.
 */
export function ProfielTabel({ koppen, rijen, minWidth = 280 }: { koppen: string[]; rijen: ProfielRij[]; minWidth?: number }) {
  const smal = useContext(SmalleKolom);
  const metNaam = rijen.length > 1;
  const th: React.CSSProperties = { ...eb, fontSize: smal ? 7.5 : 8.5, letterSpacing: smal ? '0.04em' : undefined, color: TOW.goldDeep, border: `1px solid ${TOW.line}`, padding: smal ? '2px 0' : '2px 2px', textAlign: 'center', background: 'rgba(184,134,47,0.08)' };
  const td = (c: ProfielCel): React.CSSProperties => {
    const beter = c.d != null && c.d > 0;
    return {
      textAlign: 'center', border: `1px solid ${TOW.line}`, padding: smal ? '2px 0' : '2px 2px',
      color: beter ? BETER_KLEUR : c.hl ? TOW.goldDeep : TOW.ink,
      fontWeight: c.hl ? 700 : 400,
      background: beter ? BETER_ACHTERGROND : c.hl ? 'rgba(184,134,47,0.10)' : 'transparent',
    };
  };
  return (
    <div className="no-scrollbar" style={{ overflowX: 'auto', marginBottom: 6 }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: smal ? (metNaam ? 250 : 210) : metNaam ? minWidth + 70 : minWidth, fontSize: smal ? 12 : 12.5, fontFamily: towFont.serif }}>
        <thead>
          <tr>
            {metNaam && <th style={{ ...th, width: smal ? '21%' : '24%' }} />}
            {koppen.map((k, i) => <th key={i} style={th}>{k}</th>)}
          </tr>
        </thead>
        <tbody>
          {rijen.map((r, ri) => (
            <tr key={ri}>
              {metNaam && (
                <td style={{ border: `1px solid ${TOW.line}`, padding: smal ? '2px 3px' : '2px 5px', fontSize: smal ? 10.5 : 11.5, color: TOW.parchDim, textAlign: 'left' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <span title={r.label} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                    {r.onInfo ? <Eye onClick={r.onInfo} title={`Rules for ${r.label}`} /> : null}
                  </span>
                </td>
              )}
              {r.cellen.map((c, i) => (
                <td key={i} style={td(c)} title={c.title}>
                  {c.v}{c.d != null && <sup style={{ fontSize: 8, marginLeft: 1 }}>{c.d > 0 ? `+${c.d}` : c.d}</sup>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Eén profiel: geen naamkolom, maar een eigen regelblad (de mount in een held) blijft bereikbaar. */}
      {!metNaam && rijen[0]?.onInfo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, fontSize: 11.5, color: TOW.parchDim, fontFamily: towFont.serif }}>
          {rijen[0].label}<Eye onClick={rijen[0].onInfo} title={`Rules for ${rijen[0].label}`} />
        </div>
      )}
    </div>
  );
}
