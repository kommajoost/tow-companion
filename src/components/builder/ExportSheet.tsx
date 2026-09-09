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

import { useEffect, useMemo, useRef, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useBackClose } from '../../lib/backStack';
import { usePersistentState } from '../../store';
import { exportFilename, listToPrintHtml, listToText, type ExportMeta, type ExportOptions, type ExportRow, type Formatting, type ListType } from '../../lib/listExport';
import { armyToPrintHtml, DEFAULT_PRINT_OPTIONS, type PrintInput, type PrintOptions } from '../../lib/printArmy';

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

/** De schakelaars van het printblad, gegroepeerd zoals je ze afweegt: eerst WAT er op het blad staat,
 *  dan HOEVEEL regeltekst, dan hoe het gezet wordt. `nodig` maakt een vinkje afhankelijk van een
 *  ander: wapenregels zonder wapenprofielen is een lege keuze. */
const PRINT_GROEPEN: { titel: string; items: { key: keyof PrintOptions; label: string; nodig?: keyof PrintOptions }[] }[] = [
  {
    titel: 'Content',
    items: [
      { key: 'points', label: 'Points' },
      { key: 'unitNames', label: 'Unit names' },
      { key: 'loadout', label: 'Loadout' },
      { key: 'statlines', label: 'Statlines' },
    ],
  },
  {
    titel: 'Rules',
    items: [
      { key: 'unitRules', label: 'Unit special rules' },
      { key: 'weapons', label: 'Weapon profiles' },
      { key: 'weaponRules', label: 'Weapon rules', nodig: 'weapons' },
      { key: 'mounts', label: 'Mounts' },
      { key: 'magicItems', label: 'Magic items' },
      { key: 'lores', label: 'Magic lores & spells' },
      { key: 'spellsOnlyChosen', label: 'Only chosen spells', nodig: 'lores' },
    ],
  },
];

/** A4 op 96 dpi. De preview rendert het blad op ware grootte en schaalt het dan met een transform,
 *  zodat regelafbrekingen en paginabreedte kloppen met wat de printer straks doet. */
const A4_BREEDTE = 794;

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
  const [weergave, setWeergave] = useState<'share' | 'print'>('share');
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

  // ── Print-instellingen ────────────────────────────────────────────────────────────────────────
  // Opgeslagen als een PARTIAL en pas bij gebruik over de defaults gelegd. Zo krijgt een nieuw
  // vinkje dat later bijkomt vanzelf zijn default, in plaats van `undefined` uit een oude opslag.
  const [bewaard, setBewaard] = usePersistentState<Partial<PrintOptions>>('tow:print-options', {});
  const printOpts = useMemo<PrintOptions>(() => ({ ...DEFAULT_PRINT_OPTIONS, ...bewaard }), [bewaard]);
  const zetPrint = (patch: Partial<PrintOptions>) => setBewaard((p) => ({ ...p, ...patch }));

  // BACK GAAT ÉÉN LAAG TERUG. De sheet zelf vangt Back al af; de print-weergave duwt daar een tweede
  // laag bovenop, zodat Back vanuit print terugkeert naar delen in plaats van alles te sluiten.
  // `useBackClose` is LIFO, dus de bovenste laag wint — precies wat hier moet gebeuren.
  useBackClose(true, onClose);
  useBackClose(weergave === 'print', () => setWeergave('share'));

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
    () => (printInput ? armyToPrintHtml(printInput, printOpts) : listToPrintHtml(rows, meta, opts)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [printInput, printOpts, rows, meta, listType, formatting, hidePoints, detailKan, specialRules, stats, customNotes, statsFor],
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
          width: '100%', maxWidth: weergave === 'print' ? 860 : 560, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          background: TOW.panel2, border: `1px solid ${TOW.lineStrong}`, borderRadius: 16, padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {weergave === 'print' ? (
              <button
                type="button"
                onClick={() => setWeergave('share')}
                style={{ ...eb, fontSize: 8.5, color: TOW.gold, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                ‹ Back to share
              </button>
            ) : (
              <div style={{ ...eb, fontSize: 8.5, color: TOW.gold }}>Share</div>
            )}
            <h2 style={{ margin: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 17, color: TOW.ink }}>{meta.listName}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: TOW.muted, padding: '0 4px' }}>×</button>
        </div>

        {weergave === 'print' ? (
          <PrintWeergave
            html={printHtml}
            opts={printOpts}
            zet={zetPrint}
            volledig={!!printInput}
            knop={knop}
            knopPrimair={knopPrimair}
            onPrint={openPrintVenster}
            onTerug={() => setWeergave('share')}
          />
        ) : (
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
              <button type="button" onClick={() => setWeergave('print')} style={knop}>Print / PDF…</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// De print-weergave: instellingen links, het echte blad rechts
// ══════════════════════════════════════════════════════════════════════════════════════════════

function PrintWeergave({
  html, opts, zet, volledig, knop, knopPrimair, onPrint, onTerug,
}: {
  html: string;
  opts: PrintOptions;
  zet: (patch: Partial<PrintOptions>) => void;
  /** Is dit het volledige blad (spelmodel aanwezig) of de sobere terugval? */
  volledig: boolean;
  knop: React.CSSProperties;
  knopPrimair: React.CSSProperties;
  onPrint: () => void;
  onTerug: () => void;
}): React.JSX.Element {
  // SMAL SCHERM = ONDER ELKAAR. Twee kolommen van 380px passen niet op een telefoon, en de preview is
  // daar het minst nuttig (je print niet vanaf je telefoon terwijl je 'm instelt), dus die klapt daar
  // dicht en is met één tik uit te vouwen.
  const [smal, setSmal] = useState(() => typeof window !== 'undefined' && window.innerWidth < 720);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    const meet = () => setSmal(window.innerWidth < 720);
    window.addEventListener('resize', meet);
    meet();
    return () => window.removeEventListener('resize', meet);
  }, []);

  const vinkje = (key: keyof PrintOptions, label: string, nodig?: keyof PrintOptions) => {
    const kan = !nodig || opts[nodig] === true;
    const aan = opts[key] === true && kan;
    return (
      <label key={key} style={{
        display: 'flex', alignItems: 'center', gap: 7, cursor: kan ? 'pointer' : 'default',
        fontFamily: towFont.serif, fontSize: 13, color: kan ? TOW.ink : TOW.faint,
      }}>
        <input type="checkbox" checked={aan} disabled={!kan} onChange={(e) => zet({ [key]: e.target.checked } as Partial<PrintOptions>)} />
        {label}
      </label>
    );
  };

  const instellingen = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      {!volledig && (
        <div style={{ fontFamily: towFont.serif, fontSize: 12, lineHeight: 1.4, color: TOW.muted }}>
          The full sheet (rules, weapons, spells) needs this list’s catalogue data, which isn’t loaded
          here — printing the basic sheet instead.
        </div>
      )}
      {volledig && PRINT_GROEPEN.map((g) => (
        <div key={g.titel}>
          <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 6 }}>{g.titel}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {g.items.map((i) => vinkje(i.key, i.label, i.nodig))}
          </div>
        </div>
      ))}
      {volledig && (
        <div>
          <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 6 }}>Layout</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {([['appendix', 'Rules as appendix'], ['inline', 'Rules inline']] as const).map(([id, label]) => (
              <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontFamily: towFont.serif, fontSize: 13, color: TOW.ink }}>
                <input
                  type="radio" name="tow-print-rules" checked={opts.rulesMode === id}
                  onChange={() => zet({ rulesMode: id })}
                />
                {label}
              </label>
            ))}
            {vinkje('compact', 'Compact')}
          </div>
          <div style={{ fontFamily: towFont.serif, fontSize: 11.5, lineHeight: 1.4, color: TOW.muted, marginTop: 6 }}>
            An appendix prints each rule once, alphabetically, at the end — far fewer pages when many
            units share the same rules.
          </div>
        </div>
      )}
    </div>
  );

  const preview = <Voorbeeld html={html} />;

  return (
    <>
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        display: smal ? 'block' : 'grid', gridTemplateColumns: smal ? undefined : '250px 1fr', gap: 14,
        marginBottom: 12,
      }}>
        {instellingen}
        {smal ? (
          <div style={{ marginTop: 12 }}>
            <button
              type="button" onClick={() => setPreviewOpen((v) => !v)}
              style={{ ...knop, width: '100%', padding: '8px 12px', fontSize: 12.5 }}
            >
              {previewOpen ? 'Hide preview' : 'Show preview'}
            </button>
            {previewOpen && <div style={{ marginTop: 10, height: '48vh' }}>{preview}</div>}
          </div>
        ) : preview}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={onPrint} style={knopPrimair}>Open print preview</button>
        <button type="button" onClick={onTerug} style={knop}>Back</button>
        <span style={{ alignSelf: 'center', fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted }}>
          Choose “Save as PDF” in your browser’s print dialog. Allow pop-ups if nothing opens.
        </span>
      </div>
    </>
  );
}

/** Het blad op ware grootte in een iframe, geschaald tot het in de modal past.
 *
 *  Op ware grootte en dan pas schalen — niet het iframe smal maken — omdat het document een A4 is:
 *  een smaller venster laat de tekst ANDERS afbreken dan de printer doet, en dan liegt de preview
 *  over het aantal pagina's.
 *
 *  GESCHREVEN, NIET VIA `srcDoc`. Dat scheelde een vervelende bug: elke `srcDoc`-wijziging is een
 *  NAVIGATIE van het iframe, en die belandt in de geschiedenis van het tabblad. Eén vinkje omzetten
 *  liet er dus een history-entry achter, en daarna moest je vijf keer op Terug drukken om de sheet
 *  weer dicht te krijgen. `document.open()/write()/close()` VERVANGT het document zonder entry. Het
 *  is bovendien exact hetzelfde HTML-blad dat het printvenster krijgt, en dat bevat geen scripts —
 *  alles wat erin staat is ge-escaped door `armyToPrintHtml`. */
function Voorbeeld({ html }: { html: string }): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const meet = () => {
      const r = el.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(meet) : null;
    ro?.observe(el);
    meet();
    return () => ro?.disconnect();
  }, []);

  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  const schaal = box.w > 0 ? Math.min(1, box.w / A4_BREEDTE) : 1;

  return (
    <div
      ref={wrapRef}
      style={{
        minWidth: 0, minHeight: 220, height: '100%', overflow: 'hidden',
        border: `1px solid ${TOW.line}`, borderRadius: 10, background: '#fff',
      }}
    >
      <iframe
        ref={frameRef}
        title="Print preview"
        style={{
          width: A4_BREEDTE, height: box.h > 0 ? box.h / schaal : '100%', border: 0, display: 'block',
          transform: `scale(${schaal})`, transformOrigin: 'top left',
        }}
      />
    </div>
  );
}
