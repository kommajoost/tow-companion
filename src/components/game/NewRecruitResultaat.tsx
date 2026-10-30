import { useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { compName } from '../../lib/armies';
import type { NewRecruitPlak } from '../../lib/lijstNaarLeger';

// Compact verslag onder een geplakte New Recruit-lijst (30-10-2026): welk leger en welke compositie
// we lazen, hoeveel units er op de catalogus vielen, welke niet, en of de punten kloppen met wat New
// Recruit zegt. Herkennen we het leger of de compositie niet, dan kies je ze hier zelf — liever dat dan
// een fout, want vlak voor een toernooi-battle wil je gewoon verder.

const eb = engraved as React.CSSProperties;

export function NewRecruitResultaat({ plak }: { plak: NewRecruitPlak }) {
  const [wijzig, setWijzig] = useState(false);
  if (!plak.isNR) return null;
  const r = plak.resultaat;
  // De kiezers blijven staan zolang de kop niet volledig herkend werd: dan is de keuze van de speler.
  const kiezen = wijzig || !plak.herkend.leger || !plak.herkend.compositie || !plak.leger || !plak.compositie;
  const veld: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 8, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 13, color: TOW.ink };
  const tekst: React.CSSProperties = { fontFamily: towFont.serif, fontSize: 12.5, color: TOW.parchDim, lineHeight: 1.45 };
  const klein: React.CSSProperties = { fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.muted, marginTop: 4, lineHeight: 1.5 };
  const kopTekst = plak.kop ? [plak.kop.faction, plak.kop.composition].filter(Boolean).join(' - ') : '';
  const allesGevonden = !!r && r.matched === r.total;

  return (
    <div style={{ marginTop: 9, padding: '9px 11px', borderRadius: 9, border: `1px solid ${r && !allesGevonden ? 'rgba(124,43,34,0.4)' : TOW.line}`, background: 'rgba(74,55,22,0.05)' }}>
      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 4 }}>New Recruit list</div>

      {(!plak.leger || !plak.compositie) && !plak.bezig && (
        <div style={{ ...tekst, color: TOW.blood, marginBottom: 6 }}>
          {!plak.leger
            ? `Army not recognised${kopTekst ? `: “${kopTekst}”` : ''}. Choose it below.`
            : `Composition not recognised${plak.kop?.composition ? `: “${plak.kop.composition}”` : ''}. Choose it below.`}
        </div>
      )}

      {kiezen && plak.legers.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <select value={plak.leger} onChange={(e) => plak.kies(e.target.value)} aria-label="Army" style={{ ...veld, flex: 1.2 }}>
            <option value="">Choose army…</option>
            {plak.legers.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </select>
          <select value={plak.compositie} disabled={!plak.leger} onChange={(e) => plak.kies(plak.leger, e.target.value)} aria-label="Army composition" style={{ ...veld, flex: 1 }}>
            {!plak.compositie && <option value="">Composition…</option>}
            {plak.compsVoor(plak.leger).map((c) => <option key={c} value={c}>{compName(c, plak.leger)}</option>)}
          </select>
        </div>
      )}

      {plak.bezig && <div style={tekst}>Reading the list…</div>}
      {plak.fout && <div style={{ ...tekst, color: TOW.blood }}>{plak.fout}</div>}

      {r && !plak.bezig && (
        <>
          <div style={tekst}>
            <strong style={{ color: TOW.ink }}>{r.legerNaam} · {r.compNaam}{r.nrPunten != null ? ` · ${r.nrPunten} pts` : ''}</strong>
            {' — '}matched <strong>{r.matched}</strong> of {r.total} unit{r.total === 1 ? '' : 's'}
            {!kiezen && (
              <button onClick={() => setWijzig(true)} style={{ marginLeft: 8, padding: 0, border: 'none', background: 'none', cursor: 'pointer', color: TOW.goldDeep, fontFamily: towFont.serif, fontSize: 12, textDecoration: 'underline' }}>change</button>
            )}
          </div>
          {r.unmatched.length > 0 && (
            <div style={klein}>Not in the {r.legerNaam} catalogue (skipped): {r.unmatched.join(', ')}</div>
          )}
          {r.nrPunten != null && r.owcPunten != null && r.nrPunten !== r.owcPunten && (
            <div style={{ ...klein, color: TOW.blood, fontStyle: 'normal' }}>New Recruit: {r.nrPunten} pts · Companion: {r.owcPunten} pts</div>
          )}
        </>
      )}
    </div>
  );
}
