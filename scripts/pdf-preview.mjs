// Het PDF-printblad renderen ZONDER browser: node scripts/pdf-preview.mjs <fixture.json> <uit.pdf>
//
// WAAROM. Het blad in de app controleren kost elke keer: app starten, lijst openen, exportvenster,
// knop, downloadmap, viewer. En wat je dan ziet hangt af van de browser. Dit script rendert exact
// dezelfde documentdefinitie (`armyToPdfDoc`) met de Node-kant van pdfmake, zodat een layoutwijziging
// in één commando te bekijken is — en in een review als bestand te delen.
//
// HOE DE TS-MODULE HIER DRAAIT. `armyToPdfDoc` is met opzet puur (geen DOM, geen pdfmake-runtime),
// maar het is wél TypeScript dat uit een `src/`-boom importeert. In plaats van een aparte build draait
// hier Vite's eigen SSR-runner: die transpileert en resolvet precies zoals de app dat doet, dus wat
// hier gerenderd wordt is gegarandeerd dezelfde code als in de browser.
//
// WAT DE FIXTURE BEVAT. Precies wat `window.__towPrintInput` in DEV oplevert: `army`, `meta`,
// `faction` en optioneel `magicText`/`mountText`. De twee zware velden — `rules` en `lores` — zitten
// er bewust NIET in (dat is public/rules.json, ~14 MB) en worden hieronder aangevuld, zodat een
// fixture die je uit de draaiende app kopieert klein blijft en niet veroudert met de regeldata.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import pdfMake from 'pdfmake';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

const [, , fixturePad, uitPad] = process.argv;
if (!fixturePad || !uitPad) {
  console.error('gebruik: node scripts/pdf-preview.mjs <fixture.json> <uit.pdf>');
  process.exit(1);
}

// ── De regeldata erbij ──────────────────────────────────────────────────────────────────────────
const data = JSON.parse(readFileSync(resolve(WORTEL, 'public/rules.json'), 'utf8'));
const fixture = JSON.parse(readFileSync(resolve(process.cwd(), fixturePad), 'utf8'));
const input = { ...fixture, rules: data.rules, lores: data.lores ?? {} };

// ── armyToPdfDoc uit de TS-bron ─────────────────────────────────────────────────────────────────
const server = await createServer({
  root: WORTEL,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let doc;
try {
  const { armyToPdfDoc } = await server.ssrLoadModule('/src/lib/armyPdf.ts');
  const { DEFAULT_PRINT_OPTIONS } = await server.ssrLoadModule('/src/lib/printArmy.ts');
  // Optieoverschrijvingen vanaf de commandoregel: --no-points, --compact, --inline …
  const vlaggen = process.argv.slice(4);
  const opts = { ...DEFAULT_PRINT_OPTIONS };
  if (vlaggen.includes('--no-points')) opts.points = false;
  if (vlaggen.includes('--compact')) opts.compact = true;
  if (vlaggen.includes('--inline')) opts.rulesMode = 'inline';
  if (vlaggen.includes('--no-chapter-pages')) opts.chapterPages = false;
  doc = armyToPdfDoc(input, opts);
} finally {
  await server.close();
}

// ── Renderen ────────────────────────────────────────────────────────────────────────────────────
// Dezelfde acht bestanden als in de browser, maar als LOKAAL PAD: in Node hoeft pdfmake ze niet via
// de URL-resolver op te halen. Zie pdfDownload.ts voor waarom SemiBold (600) de `bold`-sleuf vult.
const font = (bestand) => resolve(WORTEL, 'public/pdf-fonts', bestand);
pdfMake.setFonts({
  Alegreya: {
    normal: font('Alegreya-Regular.ttf'),
    bold: font('Alegreya-Bold.ttf'),
    italics: font('Alegreya-RegularItalic.ttf'),
    bolditalics: font('Alegreya-BoldItalic.ttf'),
  },
  SourceSans: {
    normal: font('SourceSans3-Regular.ttf'),
    bold: font('SourceSans3-SemiBold.ttf'),
    italics: font('SourceSans3-RegularItalic.ttf'),
    bolditalics: font('SourceSans3-SemiBoldItalic.ttf'),
  },
});
// Zonder deze twee waarschuwt pdfmake 0.3 bij elke run over ontbrekend toegangsbeleid. Dit script
// draait op eigen bestanden, dus alles mag; in de browser is de URL-resolver de enige weg naar buiten.
pdfMake.setLocalAccessPolicy(() => true);
pdfMake.setUrlAccessPolicy(() => true);

const uit = resolve(process.cwd(), uitPad);
await pdfMake.createPdf(doc).write(uit);
console.log(`geschreven: ${uit}`);
