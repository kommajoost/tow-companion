// Exporteer een army list: kies een vorm, zie meteen wat eruit komt, en neem hem mee.
//
// Drie uitgangen, omdat ze verschillende dingen zijn:
//   • Klembord — voor een chatbericht of een forumpost. Wat je 95% van de tijd wil.
//   • .txt      — als je hem wilt bewaren of mailen.
//   • PDF       — via het printvenster van de browser ("Bestemming: Opslaan als PDF"). Geen
//                 PDF-bibliotheek: die weegt honderden kB in een app die offline moet werken, en het
//                 printvenster kan het al — inclusief papierformaat en marges, die per printer
//                 verschillen en die ik dus beter niet namaak.
//
// De tekst komt volledig uit `listToText`. Dit component rekent niets uit en kent geen regels; het
// kiest alleen wát er geëxporteerd wordt en waarheen.

import { useMemo, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useBackClose } from '../../lib/backStack';
import { exportFilename, listToText, type ExportFormat, type ExportMeta, type ExportOptions, type ExportRow } from '../../lib/listExport';

const eb = engraved as React.CSSProperties;

const VORMEN: { id: ExportFormat; label: string; uitleg: string }[] = [
  { id: 'full', label: 'Full', uitleg: 'Every unit with its loadout and points.' },
  { id: 'compact', label: 'Compact', uitleg: 'One line per unit — loadout in brackets.' },
  { id: 'markdown', label: 'Markdown', uitleg: 'Formatted for Discord and forums.' },
  { id: 'opponent', label: 'For your opponent', uitleg: 'The same list without per-unit points.' },
];

export function ExportSheet({
  rows, meta, statsFor, onClose,
}: {
  rows: ExportRow[];
  meta: ExportMeta;
  statsFor?: ExportOptions['statsFor'];
  onClose: () => void;
}): React.JSX.Element {
  const [format, setFormat] = useState<ExportFormat>('full');
  const [specialRules, setSpecialRules] = useState(false);
  const [stats, setStats] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);

  // Compact laat per unit maar één regel toe, dus daar hebben de twee schakelaars geen plek. Ze
  // blijven staan (je keuze wordt onthouden als je terugschakelt) maar doen niets, en dat staat er.
  const detailKan = format !== 'compact';
  const tekst = useMemo(
    () => listToText(rows, meta, {
      format,
      specialRules: detailKan && specialRules,
      stats: detailKan && stats,
      statsFor,
    }),
    [rows, meta, format, detailKan, specialRules, stats, statsFor],
  );

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

  /** PDF = het printvenster van de browser op een eigen, schone pagina.
   *
   *  Bewust in een nieuw venster en niet met een print-stylesheet over de app heen: dit scherm zit in
   *  een app met een vaste dock, panelen die scrollen en een donker thema. Dat allemaal
   *  wegprinten kost meer regels CSS dan het simpelweg opnieuw opschrijven, en één vergeten
   *  `position: fixed` levert een half afgesneden pagina. Zwart op wit, want een donkere achtergrond
   *  print als een blad vol toner. */
  const bewaarPdf = () => {
    const w = window.open('', '_blank');
    if (!w) return; // pop-up geblokkeerd — de andere twee uitgangen werken nog
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(meta.listName)}</title>
<style>
  @page { margin: 16mm; }
  body { font: 12px/1.5 ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; color: #111; background: #fff; white-space: pre-wrap; }
  h1 { font: 700 18px/1.3 Georgia, serif; margin: 0 0 2mm; }
  .meta { font: 12px/1.4 Georgia, serif; color: #555; margin: 0 0 6mm; }
</style></head><body>
<h1>${esc(meta.listName)}</h1>
<div class="meta">${esc(`${meta.faction} · ${meta.composition} · ${meta.rule} — ${meta.total} / ${meta.cap} points`)}</div>
${esc(tekst.split('\n').slice(3).join('\n'))}
</body></html>`);
    w.document.close();
    w.focus();
    w.print();
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
          width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          background: TOW.panel2, border: `1px solid ${TOW.lineStrong}`, borderRadius: 16, padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...eb, fontSize: 8.5, color: TOW.gold }}>Export</div>
            <h2 style={{ margin: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 17, color: TOW.ink }}>{meta.listName}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: TOW.muted, padding: '0 4px' }}>×</button>
        </div>

        {/* Vorm */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(126px, 1fr))', gap: 6, marginBottom: 10 }}>
          {VORMEN.map((v) => {
            const aan = format === v.id;
            return (
              <button
                key={v.id} type="button" onClick={() => setFormat(v.id)} title={v.uitleg}
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
             ['Statlines', stats, setStats, !!statsFor]] as const).map(([label, aan, zet, kan]) => (
            <label key={label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, cursor: detailKan && kan ? 'pointer' : 'default',
              fontFamily: towFont.serif, fontSize: 13, color: detailKan && kan ? TOW.ink : TOW.faint,
            }}>
              <input type="checkbox" checked={aan} disabled={!detailKan || !kan} onChange={(e) => zet(e.target.checked)} />
              {label}
            </label>
          ))}
          {!detailKan && (
            <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted }}>
              Compact keeps one line per unit, so these are off.
            </span>
          )}
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
          <button type="button" onClick={bewaarPdf} style={knop}>Save as PDF</button>
        </div>
      </div>
    </div>
  );
}
