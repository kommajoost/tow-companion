// DEEL een army list: kies een vorm, zie meteen wat eruit komt, en neem hem mee.
//
// Drie uitgangen, omdat ze verschillende dingen zijn:
//   • Klembord — voor een chatbericht of een forumpost. Wat je 95% van de tijd wil.
//   • .txt      — als je hem wilt bewaren of mailen.
//   • Print/PDF — via het printvenster van de browser ("Bestemming: Opslaan als PDF"). Geen
//                 PDF-bibliotheek: die weegt honderden kB in een app die offline moet werken, en het
//                 printvenster kan het al — inclusief papierformaat en marges, die per printer
//                 verschillen en die ik dus beter niet namaak.
//
// De tekst komt volledig uit `listToText`. Dit component rekent niets uit en kent geen regels; het
// kiest alleen wát er geëxporteerd wordt en waarheen.
//
// TWEE WEERGAVEN. De sheet begint op DEEL (klembord/txt) en schakelt om naar PRINT zodra je een blad
// wilt maken. Ze staan niet naast elkaar in één scherm omdat het twee verschillende vragen zijn:
// delen gaat over de VORM van de tekst, printen over WELKE REGELS er mee moeten. Samen in één paneel
// werd het een muur van vijftien vinkjes waarvan de helft niets deed voor wat je aan het doen was.

import { useMemo, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useBackClose } from '../../lib/backStack';
import { exportFilename, listToPrintHtml, listToText, type ExportMeta, type ExportOptions, type ExportRow, type Formatting, type ListType } from '../../lib/listExport';
import { armyToPrintHtml, DEFAULT_PRINT_OPTIONS, type PrintInput } from '../../lib/printArmy';

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

export function ExportSheet({
  rows, meta, statsFor, printInput = null, onClose,
}: {
  rows: ExportRow[];
  meta: ExportMeta;
  statsFor?: ExportOptions['statsFor'];
  /** Het spelmodel van deze lijst, als de aanroeper het kan bouwen. `null` = niet beschikbaar; dan
   *  blijft de knop het OUDE printblad maken (`listToPrintHtml`), dat alleen de roster-rijen nodig
   *  heeft. Liever een soberder blad dan een knop die niets doet. */
  printInput?: PrintInput | null;
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


  // Back sluit de sheet. Er is nog maar één laag: het print-tussenscherm is weg, PDF opent
  // meteen het printvenster.
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

  /** Het printblad, in de vorm die bij de beschikbare gegevens hoort. Met een spelmodel is dat het
   *  volledige blad (statlines, wapens, regelteksten, spreuken); zonder is het het oude, sobere. */
  const printHtml = useMemo(
    () => (printInput ? armyToPrintHtml(printInput, DEFAULT_PRINT_OPTIONS) : listToPrintHtml(rows, meta, opts)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [printInput, rows, meta, listType, formatting, hidePoints, detailKan, specialRules, stats, customNotes, statsFor],
  );

  /** PDF = het printvenster van de browser, met een OPGEMAAKT blad erin.
   *
   *  In een nieuw venster, niet met een print-stylesheet over de app heen: die heeft een vaste dock en
   *  scrollende panelen, en één vergeten `position: fixed` levert een half afgesneden blad. Geen
   *  PDF-bibliotheek: het printvenster kent papierformaat en marges al, en die verschillen per
   *  printer — dus beter niet namaken. */
  const openPrintVenster = () => {
    const w = window.open('', '_blank');
    if (!w) return; // pop-up geblokkeerd — de andere twee uitgangen werken nog
    w.document.write(printHtml);
    w.document.close();
    w.focus();
    // Wachten tot de stylesheet is toegepast: print() op een net-geschreven document pakt in Safari
    // en oudere webviews soms nog de ongestileerde staat.
    w.setTimeout(() => w.print(), 150);
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
          display: 'flex', flexDirection: 'column',
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
              {/* DE PDF-KNOP IS DE HOOFDUITGANG. Voor Joost is exporteren = een PDF; de andere twee
                  zijn de uitzondering. Dus deze gevuld goud, met het download-pijltje, en zonder
                  tussenscherm: hij opent meteen het printvenster met de standaardinstellingen
                  ("laat dat extra menu maar achterwege", 09-09). */}
              <button
                type="button"
                onClick={openPrintVenster}
                style={{
                  ...knop, border: "none", color: TOW.onGrad, fontWeight: 700,
                  background: `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`,
                  display: "inline-flex", alignItems: "center", gap: 7,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 4v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
                </svg>
                Save as PDF / print
              </button>
            </div>
          </>
      </div>
    </div>
  );
}
