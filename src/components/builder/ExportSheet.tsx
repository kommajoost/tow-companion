// DEEL een army list: kies een vorm, zie meteen wat eruit komt, en neem hem mee.
//
// Drie uitgangen, omdat ze verschillende dingen zijn:
//   • Deel-code — een link of zes tekens waarmee iemand anders je lijst IN COMPANION bekijkt, met
//                 de echte punten en de echte units. Alleen kijken, niet aanpassen (Joost, 12-09).
//                 Staat bovenaan: het is de enige uitgang die de lijst levend houdt bij de ander;
//                 de twee eronder zijn een afdruk op een moment.
//   • Klembord — voor een chatbericht of een forumpost. Wat je 95% van de tijd wil.
//   • .txt      — als je hem wilt bewaren of mailen.
//
// GEEN PDF MEER HIER. De PDF heeft z'n eigen knop in de app (topbar op desktop, header op de
// telefoon) en dóet ook meteen wat hij belooft: het bestand downloadt, in plaats van dat er een
// printvenster opent dat je zelf nog naar PDF moet sturen (Joost, 09-09). Delen en een PDF maken
// zijn twee verschillende handelingen; ze achter één knop verstoppen maakte de belangrijkste van de
// twee het moeilijkst te vinden.
//
// De tekst komt volledig uit `listToText`. Dit component rekent niets uit en kent geen regels; het
// kiest alleen wát er geëxporteerd wordt en waarheen.

import { useEffect, useMemo, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useBackClose } from '../../lib/backStack';
import { exportFilename, listToText, type ExportMeta, type ExportOptions, type ExportRow, type Formatting, type ListType } from '../../lib/listExport';
import { deelLijst, deelLink, deelStatus, stopDelen, type DeelbareLijst, type DeelStatus } from '../../lib/listShare';

const eb = engraved as React.CSSProperties;

// De drie vormen en de twee opmaken van Old World Builder, met dezelfde betekenis — spelers die
// lijsten tussen apps heen en weer plakken herkennen ze zo terug.
const VORMEN: { id: ListType; label: string; uitleg: string }[] = [
  { id: 'regular', label: 'Regular', uitleg: 'Every option on its own line.' },
  { id: 'compact', label: 'Compact', uitleg: 'Options in brackets behind the unit.' },
  { id: 'simple', label: 'Simple', uitleg: 'One line per unit, only what matters.' },
];
const OPMAAK: { id: Formatting; label: string }[] = [
  { id: 'text', label: 'Plain text' },
  { id: 'markdown', label: 'Markdown' },
];

/** Een datum kort en leesbaar: "12 Sep". Een lege of onleesbare stempel levert niets op, en dan
 *  laat de aanroeper die regel gewoon weg — een "Invalid Date" in beeld is erger dan geen datum. */
const kortDatum = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export function ExportSheet({
  rows, meta, statsFor, lijst, onClose,
}: {
  rows: ExportRow[];
  meta: ExportMeta;
  statsFor?: ExportOptions['statsFor'];
  /** De OPGESLAGEN lijst, met haar id — de sheet deelt hem zelf via `lib/listShare`. Ontbreekt hij
   *  (bv. een lijst die nog niet is opgeslagen), dan verdwijnt het deel-blok en blijven klembord en
   *  .txt gewoon werken. */
  lijst?: DeelbareLijst;
  onClose: () => void;
}): React.JSX.Element {
  const [listType, setListType] = useState<ListType>('regular');
  const [formatting, setFormatting] = useState<Formatting>('text');
  const [hidePoints, setHidePoints] = useState(false);
  const [specialRules, setSpecialRules] = useState(false);
  const [stats, setStats] = useState(false);
  const [customNotes, setCustomNotes] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);

  // `simple` is één regel per unit — daar past geen statline of regelset onder. De schakelaars
  // blijven staan (je keuze wordt onthouden als je terugschakelt) maar doen niets, en dat staat er.
  const detailKan = listType !== 'simple';
  const opts: ExportOptions = {
    listType,
    formatting,
    hidePoints,
    specialRules: detailKan && specialRules,
    stats: detailKan && stats,
    customNotes: detailKan && customNotes,
    statsFor,
  };
  const tekst = useMemo(
    () => listToText(rows, meta, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, meta, listType, formatting, hidePoints, detailKan, specialRules, stats, customNotes, statsFor],
  );


  // ── Deel-code ────────────────────────────────────────────────────────────────────────────────
  // Alle staat van het deel-blok. `status` is wat de SERVER van deze lijst weet: null = niet
  // gedeeld. Geen van deze knoppen raakt de lokale lijst aan — delen is een kopie de deur uit, geen
  // bewerking (Joost, 12-09).
  const lijstId = lijst?.id ?? null;
  const [status, setStatus] = useState<DeelStatus | null>(null);
  const [deelLaden, setDeelLaden] = useState(!!lijstId);
  const [deelFout, setDeelFout] = useState<string | null>(null);
  const [deelBezig, setDeelBezig] = useState(false);
  /** Welke knop net iets bevestigd heeft; verdwijnt vanzelf. */
  const [melding, setMelding] = useState<'link' | 'code' | 'updated' | null>(null);

  // Bij het OPENEN van de sheet ophalen wat er al gedeeld is. Dat moet van de server komen en niet
  // uit de lijst zelf: een share kan op een ander apparaat zijn gemaakt of ingetrokken, en het
  // aantal keer bekeken weet alleen de server.
  useEffect(() => {
    if (!lijstId) { setDeelLaden(false); return; }
    let afgebroken = false;
    setDeelLaden(true);
    setDeelFout(null);
    deelStatus()
      .then((m) => { if (!afgebroken) setStatus(m.get(lijstId) ?? null); })
      .catch((e: unknown) => { if (!afgebroken) setDeelFout(e instanceof Error ? e.message : 'Could not load your shared lists.'); })
      .finally(() => { if (!afgebroken) setDeelLaden(false); });
    return () => { afgebroken = true; };
  }, [lijstId]);

  const meldKort = (wat: 'link' | 'code' | 'updated') => {
    setMelding(wat);
    window.setTimeout(() => setMelding((m) => (m === wat ? null : m)), 1800);
  };

  /** Naar het klembord, met dezelfde terugval-gedachte als `kopieer` hieronder: mislukt het, dan
   *  zeggen we dát in plaats van niets te doen. */
  const kopieerTekst = async (tekstje: string, wat: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(tekstje);
      meldKort(wat);
    } catch {
      setDeelFout('Could not copy — select the code and copy it by hand.');
    }
  };

  /** Aanmaken én bijwerken zijn dezelfde server-aanroep: dezelfde lijst levert altijd dezelfde
   *  code, dus een update verandert niets aan de link die al rondgestuurd is. */
  const deel = async (isUpdate: boolean) => {
    if (!lijst || deelBezig) return;
    setDeelBezig(true);
    setDeelFout(null);
    try {
      setStatus(await deelLijst(lijst));
      if (isUpdate) meldKort('updated');
    } catch (e) {
      setDeelFout(e instanceof Error ? e.message : 'Could not share this list.');
    } finally {
      setDeelBezig(false);
    }
  };

  const stop = async () => {
    if (!lijstId || deelBezig) return;
    setDeelBezig(true);
    setDeelFout(null);
    try {
      await stopDelen(lijstId);
      setStatus(null);
    } catch (e) {
      setDeelFout(e instanceof Error ? e.message : 'Could not stop sharing.');
    } finally {
      setDeelBezig(false);
    }
  };

  // Back sluit de sheet. Er is maar één laag: de sheet heeft geen tussenschermen meer.
  useBackClose(true, onClose);

  const kopieer = async () => {
    try {
      await navigator.clipboard.writeText(tekst);
      setGekopieerd(true);
      window.setTimeout(() => setGekopieerd(false), 1800);
    } catch {
      // Clipboard kan geweigerd worden (geen https, of geen gebruikersgebaar in een webview). Dan de
      // tekst selecteren zodat kopiëren met de hand nog kan — beter dan een stille mislukking.
      const el = document.getElementById('tow-export-tekst') as HTMLTextAreaElement | null;
      el?.select();
    }
  };

  const bewaarTxt = () => {
    const blob = new Blob([tekst], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename(meta.listName, 'txt');
    a.click();
    URL.revokeObjectURL(url);
  };

  const knop: React.CSSProperties = {
    padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
    fontFamily: towFont.display, fontWeight: 600, fontSize: 13.5,
    border: `1px solid ${TOW.line}`, background: TOW.panel, color: TOW.ink,
  };
  const knopPrimair: React.CSSProperties = { ...knop, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)' };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(30,20,8,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '88vh',
          // Scrollt zelf sinds het deel-blok erbij kwam: op een telefoon passen drie uitgangen plus
          // de voorbeeldtekst niet altijd binnen 88vh, en dan is afsnijden erger dan scrollen.
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
          background: TOW.panel2, border: `1px solid ${TOW.lineStrong}`, borderRadius: 16, padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...eb, fontSize: 8.5, color: TOW.gold }}>Share</div>
            <h2 style={{ margin: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 17, color: TOW.ink }}>{meta.listName}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: TOW.muted, padding: '0 4px' }}>×</button>
        </div>

        {/* ── Deel-code ──────────────────────────────────────────────────────────────────────────
            Bovenaan, in een eigen omlijst blok: dit is een ANDER soort delen dan de twee eronder.
            Klembord en .txt leveren tekst op een moment; hier geef je iemand toegang tot de lijst
            zoals Companion hem toont — met de juiste punten, ook voor een Renegade-compositie. */}
        {lijst && (
          <div style={{
            border: `1px solid ${TOW.goldDeep}`, borderRadius: 12, padding: '11px 13px',
            background: 'rgba(138,108,48,0.06)', marginBottom: 12, flexShrink: 0,
          }}>
            <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 6 }}>Share a view-only link</div>

            {deelLaden ? (
              <p style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted, margin: 0 }}>Checking…</p>
            ) : status ? (
              <>
                <div style={{
                  fontFamily: towFont.display, fontWeight: 700, fontSize: 26, letterSpacing: '0.22em',
                  color: TOW.ink, lineHeight: 1.15, userSelect: 'all',
                }}>{status.code}</div>
                {/* De server houdt één tijdstempel bij, dat van de laatste push. Voor een verse share
                    is dat de deeldatum; na "Update shared copy" is het de datum van die update — en
                    dat is precies wat je wilt weten ("wat ziet hij nu?"). */}
                {kortDatum(status.bijgewerktOp) && (
                  <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.faint, marginTop: 2 }}>
                    Shared on {kortDatum(status.bijgewerktOp)}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, margin: '9px 0 0' }}>
                  <button type="button" onClick={() => void kopieerTekst(deelLink(status.code), 'link')} style={{ ...knopPrimair, padding: '8px 12px', fontSize: 12.5 }}>
                    {melding === 'link' ? 'Copied' : 'Copy link'}
                  </button>
                  <button type="button" onClick={() => void kopieerTekst(status.code, 'code')} style={{ ...knop, padding: '8px 12px', fontSize: 12.5 }}>
                    {melding === 'code' ? 'Copied' : 'Copy code'}
                  </button>
                  <button type="button" onClick={() => void deel(true)} disabled={deelBezig} style={{ ...knop, padding: '8px 12px', fontSize: 12.5, opacity: deelBezig ? 0.6 : 1 }}>
                    {melding === 'updated' ? 'Updated' : deelBezig ? 'Working…' : 'Update shared copy'}
                  </button>
                  <button type="button" onClick={() => void stop()} disabled={deelBezig} style={{ ...knop, padding: '8px 12px', fontSize: 12.5, color: TOW.blood, opacity: deelBezig ? 0.6 : 1 }}>
                    Stop sharing
                  </button>
                </div>
                <p style={{ fontFamily: towFont.serif, fontSize: 11.5, lineHeight: 1.5, color: TOW.inkDim, margin: '9px 0 0' }}>
                  Anyone with this code can view this list — they cannot change it.
                </p>
                {status.keerBekeken > 0 && (
                  <p style={{ fontFamily: towFont.serif, fontSize: 11, color: TOW.faint, margin: '3px 0 0' }}>
                    Viewed {status.keerBekeken} {status.keerBekeken === 1 ? 'time' : 'times'}
                  </p>
                )}
              </>
            ) : (
              <>
                <p style={{ fontFamily: towFont.serif, fontSize: 12.5, lineHeight: 1.5, color: TOW.inkDim, margin: '0 0 9px' }}>
                  Get a six-character code that lets someone open this list in Companion. They can look, not touch.
                </p>
                <button type="button" onClick={() => void deel(false)} disabled={deelBezig} style={{ ...knopPrimair, opacity: deelBezig ? 0.6 : 1 }}>
                  {deelBezig ? 'Working…' : 'Create share code'}
                </button>
              </>
            )}

            {deelFout && (
              <p style={{ fontFamily: towFont.serif, fontSize: 11.5, lineHeight: 1.5, color: TOW.blood, margin: '8px 0 0' }}>{deelFout}</p>
            )}
          </div>
        )}

          <>
            {/* Vorm */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(126px, 1fr))', gap: 6, marginBottom: 10 }}>
              {VORMEN.map((v) => {
                const aan = listType === v.id;
                return (
                  <button
                    key={v.id} type="button" onClick={() => setListType(v.id)} title={v.uitleg}
                    style={{
                      ...knop, textAlign: 'left', padding: '8px 10px',
                      border: `1px solid ${aan ? TOW.goldDeep : TOW.line}`,
                      background: aan ? 'rgba(184,134,47,0.12)' : TOW.panel,
                      display: 'flex', flexDirection: 'column', gap: 1,
                    }}
                  >
                    <span>{v.label}</span>
                    <span style={{ fontFamily: towFont.serif, fontWeight: 400, fontSize: 11, lineHeight: 1.35, color: TOW.inkDim }}>{v.uitleg}</span>
                  </button>
                );
              })}
            </div>

            {/* Detail-schakelaars */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 10 }}>
              {([['Special rules', specialRules, setSpecialRules, true],
                 ['Statlines', stats, setStats, !!statsFor],
                 ['Unit names', customNotes, setCustomNotes, true]] as const).map(([label, aan, zet, kan]) => (
                <label key={label} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, cursor: detailKan && kan ? 'pointer' : 'default',
                  fontFamily: towFont.serif, fontSize: 13, color: detailKan && kan ? TOW.ink : TOW.faint,
                }}>
                  <input type="checkbox" checked={aan} disabled={!detailKan || !kan} onChange={(e) => zet(e.target.checked)} />
                  {label}
                </label>
              ))}
              {/* Los van de detail-schakelaars: dit verandert WAT je deelt, niet hoeveel detail. */}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontFamily: towFont.serif, fontSize: 13, color: TOW.ink }}>
                <input type="checkbox" checked={hidePoints} onChange={(e) => setHidePoints(e.target.checked)} />
                Hide points
              </label>
              {!detailKan && (
                <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted }}>
                  Simple keeps one line per unit, so these are off.
                </span>
              )}
            </div>

            {/* Opmaak — platte tekst of Markdown, net als in Old World Builder. */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {OPMAAK.map((o) => (
                <button
                  key={o.id} type="button" onClick={() => setFormatting(o.id)}
                  style={{
                    ...knop, padding: '6px 12px', fontSize: 12.5,
                    border: `1px solid ${formatting === o.id ? TOW.goldDeep : TOW.line}`,
                    background: formatting === o.id ? 'rgba(184,134,47,0.12)' : TOW.panel,
                  }}
                >{o.label}</button>
              ))}
            </div>

            {/* Wat er precies uit komt — geen verrassingen na het plakken. */}
            <textarea
              id="tow-export-tekst"
              readOnly
              value={tekst}
              spellCheck={false}
              style={{
                flex: 1, minHeight: 180, resize: 'none', width: '100%', boxSizing: 'border-box',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12, lineHeight: 1.5,
                color: TOW.ink, background: TOW.panel, border: `1px solid ${TOW.line}`, borderRadius: 10, padding: 10,
                marginBottom: 12,
              }}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" onClick={kopieer} style={knopPrimair}>{gekopieerd ? 'Copied' : 'Copy to clipboard'}</button>
              <button type="button" onClick={bewaarTxt} style={knop}>Save .txt</button>
            </div>
          </>
      </div>
    </div>
  );
}
