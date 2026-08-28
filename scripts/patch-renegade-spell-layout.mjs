// Spreukpagina's opmaken: naam-velden in een tabel in plaats van als losse alinea's.
//
//   node scripts/patch-renegade-spell-layout.mjs [--droog]
//
// "Deze lore magic is niet opgemaakt" (Joost, 17-08). De LORE-pagina's zijn bij de bron aangepakt
// (compile-renegade-lores), maar elke spreuk heeft óók een eigen regelpagina, en daar stonden
// "Type: Hex", "Casting Value: 9+" en "Range: 12"" nog als drie losse alinea's onder elkaar. Het
// rulebook zet die velden in een tabel.
//
// Dit is een NABEWERKING en geen wijziging in compile-renegade-v2, met opzet: die compiler raakt
// alle zeven packs tegelijk en heeft eerder ongerelateerde dingen verschoven. Dit script leest wat
// er staat, verandert alleen de VORM, en laat elke letter tekst intact.
//
// Idempotent: al omgezette delen zijn objecten en worden overgeslagen.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const REN = new URL('../public/renegade/', import.meta.url);
const droog = process.argv.includes('--droog');

const LABELS = ['Type', 'Casting Value', 'Range', 'Arcane Configuration', 'Duration'];
const EEN_VELD = new RegExp(`^(${LABELS.join('|')})\s*:\s*(.+)$`, 'i');
// Meerdere velden op één regel: "Type: Assailment Casting Value: 8+ Range: Combat". De bron zet ze
// soms zo, en dan zou een naïeve split de hele staart als waarde van het eerste veld nemen.
const VOLGEND = new RegExp(`\s+(?=(?:${LABELS.join('|')})\s*:)`, 'i');

/** Een regel -> nul of meer [label, waarde]-paren. Geen veld? Dan null, en blijft het een alinea. */
const velden = (regel) => {
  const stukken = String(regel).trim().split(VOLGEND);
  const uit = [];
  for (const stuk of stukken) {
    const m = EEN_VELD.exec(stuk.trim());
    if (!m) return null;             // één niet-veld erbij: hele regel met rust laten
    uit.push([m[1], m[2].trim()]);
  }
  return uit.length ? uit : null;
};

let regels = 0;
let bestanden = 0;
for (const bestand of readdirSync(REN).filter((n) => n.endsWith('-renegade-v2.json'))) {
  const url = new URL(bestand, REN);
  const overlay = JSON.parse(readFileSync(url, 'utf8'));
  let schreef = false;

  for (const [slug, regel] of Object.entries(overlay.rules ?? {})) {
    if (!Array.isArray(regel.body)) continue;
    const uit = [];
    let rijen = [];
    let veranderd = false;
    const spoel = () => { if (rijen.length) { uit.push({ tabel: { headers: [], rows: rijen } }); rijen = []; } };

    for (const deel of regel.body) {
      if (typeof deel !== 'string') { spoel(); uit.push(deel); continue; }
      const v = velden(deel);
      if (v) { rijen.push(...v); veranderd = true; continue; }
      spoel();
      uit.push(deel);
    }
    spoel();
    if (!veranderd) continue;
    console.log(`${bestand.split('-')[0]}/${slug}: ${uit.filter((d) => typeof d === 'object' && d.tabel).length} veldtabel(len)`);
    regels++;
    overlay.rules[slug] = { ...regel, body: uit };
    schreef = true;
  }
  if (schreef && !droog) { writeFileSync(url, `${JSON.stringify(overlay, null, 2)}\n`); bestanden++; }
}
console.log(`${regels} regelpagina's opgemaakt in ${bestanden} packs${droog ? ' (droog)' : ''}`);
