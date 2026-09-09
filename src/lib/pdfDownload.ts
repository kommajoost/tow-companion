// De PDF-knop: army list → echt PDF-bestand op de schijf.
//
// WAAROM DIT BESTAND APART STAAT VAN armyPdf.ts. Daar staat de PUUR berekende documentdefinitie;
// hier staat alles wat alleen in een browser kan: de pdfmake-runtime binnenhalen, de fonts
// registreren, de bytes maken en een download starten. Die scheiding is niet cosmetisch —
// `armyToPdfDoc` draait daardoor ook in Node (scripts/pdf-preview.mjs), zodat een blad te
// controleren is zonder browser.
//
// DE IMPORT IS DYNAMISCH, EN DAT IS DE HELE TRUC. `pdfmake.min.js` is ongeveer een megabyte. In de
// hoofdbundel zou iedereen die de app opent hem downloaden, ook de negen van de tien die nooit op
// PDF drukken. Met `await import(...)` maakt Vite er een eigen chunk van die pas over de lijn komt
// als deze functie voor het eerst wordt aangeroepen.
//
// FONTS VIA EEN URL, NIET VIA vfs_fonts. pdfmake levert een `vfs_fonts.js` met Roboto erin —
// nog eens ~850 kB base64 die we niet gebruiken (het blad is Alegreya + Source Sans). pdfmake 0.3 kan een
// font ook van een URL halen: `URLResolver.resolve()` doet dat voor elke fontverwijzing die met
// `http://` of `https://` begint. Een pad als `/pdf-fonts/x.ttf` valt daar dus BUITEN en wordt
// stilzwijgend niet opgehaald — vandaar dat elk pad hieronder met `new URL(pad, location.href)`
// absoluut gemaakt wordt. De service worker cachet `.ttf` (zie vite.config.ts), dus na één keer
// werkt het ook offline.
//
// TERUGVAL. Faalt de dynamische import of het ophalen van een font (offline en de chunk zit nog niet
// in de cache, een geblokkeerd CDN, een oude browser), dan wordt er GEEN foutmelding getoond maar
// valt de knop terug op het bestaande printvenster: hetzelfde blad als HTML, met `print()` erachter.
// Dat is precies wat de knop hiervóór deed, dus de gebruiker verliest niets. Alleen als ook dát
// onmogelijk is (pop-up geblokkeerd) gooit deze functie.

import { armyToPdfDoc } from './armyPdf';
import { exportFilename } from './listExport';
import { armyToPrintHtml, DEFAULT_PRINT_OPTIONS, type PrintInput, type PrintOptions } from './printArmy';

/** De twee families van het blad: Alegreya (serif — titels, unitnamen, punten, spreuknamen) en
 *  Source Sans (al het overige). Alle vier de sleuven zijn gevuld: pdfmake breekt hard af op een
 *  ontbrekende sleuf in plaats van terug te vallen.
 *
 *  SEMIBOLD ALS `bold`, geen 700. Het ontwerp gebruikt gewicht 600 voor vet en 700 alleen voor de
 *  kleine kapitaal-labels; bij 6,4 pt is dat verschil onzichtbaar, dus scheelt het een fontbestand
 *  over de lijn (`SourceSans3-Bold.ttf` is daarom uit `public/pdf-fonts/` verwijderd). */
const FONTBESTANDEN = {
  Alegreya: {
    normal: 'Alegreya-Regular.ttf',
    bold: 'Alegreya-Bold.ttf',
    italics: 'Alegreya-RegularItalic.ttf',
    bolditalics: 'Alegreya-BoldItalic.ttf',
  },
  SourceSans: {
    normal: 'SourceSans3-Regular.ttf',
    bold: 'SourceSans3-SemiBold.ttf',
    italics: 'SourceSans3-RegularItalic.ttf',
    bolditalics: 'SourceSans3-SemiBoldItalic.ttf',
  },
} as const;

/** Absolute URL van een fontbestand in `public/pdf-fonts/`. Zie de kop: pdfmake haalt alléén iets op
 *  dat met http(s):// begint. */
const fontUrl = (bestand: string): string =>
  new URL(`${import.meta.env.BASE_URL}pdf-fonts/${bestand}`, window.location.href).href;

interface PdfMakeRuntime {
  setFonts(fonts: Record<string, Record<string, string>>): void;
  createPdf(doc: unknown): { getBlob(): Promise<Blob> };
}

/** De geladen runtime, één keer per sessie. De fonts worden bij het laden geregistreerd; pdfmake
 *  bewaart de opgehaalde bytes daarna zelf in zijn virtuele bestandssysteem, dus een tweede PDF in
 *  dezelfde sessie kost geen netwerk meer. */
let runtime: Promise<PdfMakeRuntime> | null = null;

function laadPdfMake(): Promise<PdfMakeRuntime> {
  if (runtime) return runtime;
  runtime = import('pdfmake/build/pdfmake.min.js')
    .then((mod) => {
      const pdfMake = ((mod as { default?: unknown }).default ?? mod) as PdfMakeRuntime;
      pdfMake.setFonts({
        Alegreya: Object.fromEntries(Object.entries(FONTBESTANDEN.Alegreya).map(([k, v]) => [k, fontUrl(v)])),
        SourceSans: Object.fromEntries(Object.entries(FONTBESTANDEN.SourceSans).map(([k, v]) => [k, fontUrl(v)])),
      });
      return pdfMake;
    })
    .catch((e) => {
      runtime = null; // een volgende poging mag het opnieuw proberen (de chunk kan intussen binnen zijn)
      throw e;
    });
  return runtime;
}

/** Het oude gedrag: het HTML-blad in een nieuw venster met de printdialoog erachter. Exact dezelfde
 *  stappen als de PDF-knop hiervóór deed (ExportSheet), inclusief de 150 ms wachttijd — `print()` op
 *  een net geschreven document pakt in Safari en oudere webviews soms nog de ongestileerde staat. */
function printVensterTerugval(input: PrintInput, opts: PrintOptions): void {
  const w = window.open('', '_blank');
  if (!w) throw new Error('Could not create the PDF, and the print window was blocked by the browser.');
  w.document.write(armyToPrintHtml(input, opts));
  w.document.close();
  w.focus();
  w.setTimeout(() => w.print(), 150);
}

/**
 * Maakt de PDF van een army list en start de download.
 *
 * Resolve't zodra de download gestart is — of, als de PDF-weg niet begaanbaar bleek, zodra het
 * printvenster openstaat (zie de kop van dit bestand). Gooit alleen een Error met een leesbare
 * `message` als ook die terugval onmogelijk is.
 */
export async function downloadArmyPdf(input: PrintInput, opts?: Partial<PrintOptions>): Promise<void> {
  const opties: PrintOptions = { ...DEFAULT_PRINT_OPTIONS, ...opts };

  // ALLEEN IN DEV: de invoer van dit blad in het venster hangen, zodat je in de draaiende app een
  // echte lijst kunt kopiëren (`copy(window.__towPrintInput)`) en als fixture voor
  // `scripts/pdf-preview.mjs` kunt bewaren. `rules` en `lores` gaan er bewust UIT: dat is de hele
  // rules.json (~14 MB) en het preview-script vult ze zelf weer aan uit public/rules.json.
  if (import.meta.env.DEV) {
    (window as unknown as { __towPrintInput?: unknown }).__towPrintInput = {
      ...input,
      rules: undefined,
      lores: undefined,
    };
  }

  try {
    const pdfMake = await laadPdfMake();
    const blob = await pdfMake.createPdf(armyToPdfDoc(input, opties)).getBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename(input.meta.listName, 'pdf');
    a.click();
    // Pas vrijgeven nadat de browser de klik verwerkt heeft; direct revoken breekt de download in
    // Firefox.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (e) {
    // Geen exceptie naar buiten: de gebruiker krijgt het blad alsnog, langs de oude weg.
    console.warn('[pdf] PDF-generatie mislukt, terugval op het printvenster:', e);
    printVensterTerugval(input, opties);
  }
}
