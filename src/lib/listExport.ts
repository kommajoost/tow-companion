// Een army list als tekst — in de vorm die je op dat moment nodig hebt.
//
// PUUR. Deze module rekent NIETS uit: hij krijgt de rijen die de builder al op het scherm zet
// (`RosterRow`, met punten uit `entryPoints` en de loadout uit `optionSummary`) en zet die om in
// tekst. Zou hij zelf tellen, dan kon de export iets anders zeggen dan de builder — precies de
// soort stille afwijking die in dit project al eerder geld heeft gekost.
//
// De vormen volgen Old World Builder, omdat spelers die al kennen en lijsten tussen apps heen en
// weer plakken (hun `get-list-as-text.js` heeft dezelfde assen): een FORMAAT plus een paar
// SCHAKELAARS. Wat OWB `isShowList` noemt heet hier 'opponent': dezelfde lijst zonder punten, om aan
// je tegenstander te geven.

import type { Category, OwbUnit } from './owbBuilder';

/** De vier vormen. */
export type ExportFormat =
  /** Alles: kopregel, per categorie, loadout per unit, punten, totaal. */
  | 'full'
  /** Eén regel per unit, geen loadout-detail. Voor een snelle blik of een chatbericht. */
  | 'compact'
  /** Zoals `full`, maar met Markdown-opmaak — voor Discord en forums. */
  | 'markdown'
  /** Zoals `full` zonder punten: wat je tegenstander mag zien. */
  | 'opponent';

export interface ExportRow {
  name: string;
  /** De eigen naam die de speler deze unit gaf (campagne), als die er is. */
  bijnaam?: string;
  category: Category;
  count: number;
  points: number;
  /** De gekozen opties, al samengevat door de builder (" · "-gescheiden). */
  whisper: string;
  unit: OwbUnit;
}

export interface ExportMeta {
  listName: string;
  faction: string;
  composition: string;
  rule: string;
  /** De puntenlimiet waarop de lijst is gemaakt. */
  cap: number;
  total: number;
}

export interface ExportOptions {
  format: ExportFormat;
  /** De special rules van elke unit eronder zetten. */
  specialRules?: boolean;
  /** De statline eronder zetten. Vereist `statsFor`; zonder dat wordt de schakelaar genegeerd. */
  stats?: boolean;
  /** Statlines opzoeken op unitnaam (dezelfde lookup die de builder gebruikt). */
  statsFor?: (unitName: string) => { Name: string; M: string; WS: string; BS: string; S: string; T: string; W: string; I: string; A: string; Ld: string }[];
}

const CAT_LABEL: Record<Category, string> = {
  characters: 'Characters', core: 'Core', special: 'Special', rare: 'Rare',
  mercenaries: 'Mercenaries', allies: 'Allies',
};
const CAT_ORDER: Category[] = ['characters', 'core', 'special', 'rare', 'mercenaries', 'allies'];

/** De catalogus zet bookkeeping-tekens in namen ("{renegade}", "*"); die horen niet in een export.
 *  De laatste stap ruimt de spatie op die overblijft waar een tag vóór een komma stond — anders leest
 *  een special-rules-regel als "Murderous , Strike First". */
const clean = (s: string): string =>
  (s || '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;.])/g, '$1')
    .trim();

const STAT_COLS = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld'] as const;

export function listToText(rows: ExportRow[], meta: ExportMeta, opts: ExportOptions): string {
  const md = opts.format === 'markdown';
  const puntenTonen = opts.format !== 'opponent';
  const uit: string[] = [];

  // ── Kop ──────────────────────────────────────────────────────────────────────────────────────
  uit.push(md ? `## ${meta.listName}` : meta.listName);
  uit.push(`${meta.faction} · ${meta.composition} · ${meta.rule}`);
  // Bij 'opponent' staat het totaal er wél: dat is afgesproken vóór het spel en juist wat de ander
  // wil weten. Alleen de opbouw per unit blijft weg.
  uit.push(`${meta.total} / ${meta.cap} points`);
  uit.push('');

  for (const cat of CAT_ORDER) {
    const inCat = rows.filter((r) => r.category === cat);
    if (!inCat.length) continue;
    const catPunten = inCat.reduce((n, r) => n + r.points, 0);
    const kop = puntenTonen ? `${CAT_LABEL[cat]} — ${catPunten} points` : CAT_LABEL[cat];
    uit.push(md ? `### ${kop}` : kop.toUpperCase());

    for (const r of inCat) {
      const naam = clean(r.name);
      const aantal = r.count > 1 ? `${r.count}× ` : '';
      const prijs = puntenTonen ? ` — ${r.points} pts` : '';
      const regel = `${aantal}${naam}${prijs}`;

      if (opts.format === 'compact') {
        // Compact: alles op één regel, inclusief de loadout, want dat is nog steeds het meeste van
        // wat je wil weten — alleen niet uitgevouwen.
        const opties = r.whisper ? ` (${clean(r.whisper)})` : '';
        uit.push(`${regel}${opties}`);
        continue;
      }

      uit.push(md ? `- **${regel}**` : regel);
      if (r.bijnaam) uit.push(md ? `  - *“${r.bijnaam}”*` : `    “${r.bijnaam}”`);
      if (r.whisper) uit.push(md ? `  - ${clean(r.whisper)}` : `    ${clean(r.whisper)}`);

      if (opts.stats && opts.statsFor) {
        for (const row of opts.statsFor(naam)) {
          const waarden = STAT_COLS.map((k) => `${k} ${row[k] ?? '-'}`).join(' ');
          const label = row.Name && row.Name !== naam ? `${row.Name}: ` : '';
          uit.push(md ? `  - \`${label}${waarden}\`` : `    ${label}${waarden}`);
        }
      }

      if (opts.specialRules) {
        const sr = clean(r.unit.specialRules?.name_en ?? '');
        if (sr) uit.push(md ? `  - *${sr}*` : `    ${sr}`);
      }
    }
    uit.push('');
  }

  // Eén afsluitende regel, zodat een geplakte lijst niet met een lege regel eindigt.
  return uit.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// PDF / print
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Een opgemaakt blad, niet de platte tekst door een printer gehaald (Joost 04-08). Opgebouwd uit
// DEZELFDE rijen als de tekst-export, dus de twee kunnen niet uiteenlopen.
//
// Keuzes, en waarom:
//  • Systeem-serif, geen ingesloten webfont. De app z'n eigen fonts bestaan niet in een leeg venster
//    en meesturen betekent ze base64 in de HTML plakken — honderden kB per blad, voor een document
//    dat een halve seconde bestaat.
//  • Zwart op wit met één grijstint. Een donker thema print als een blad vol toner, en een gekleurd
//    kader is het eerste dat een zwart-witprinter tot vuile vlek maakt.
//  • De punten in een eigen rechtsuitgelijnde kolom met tabular-nums, zodat je een kolom cijfers kunt
//    aflopen zonder ze te lezen.
//  • `break-inside: avoid` per unit én per categorie-kop: een unit die over de paginarand valt kost je
//    op de speelavond precies de regel die je zoekt.

const escHtml = (s: string): string =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Het volledige, zelfstandige HTML-document voor het printvenster. */
export function listToPrintHtml(rows: ExportRow[], meta: ExportMeta, opts: ExportOptions): string {
  const puntenTonen = opts.format !== 'opponent';
  const e = escHtml;

  const secties = CAT_ORDER.map((cat) => {
    const inCat = rows.filter((r) => r.category === cat);
    if (!inCat.length) return '';
    const catPunten = inCat.reduce((n, r) => n + r.points, 0);

    const units = inCat.map((r) => {
      const naam = clean(r.name);
      const aantal = r.count > 1 ? `<span class="n">${r.count}×</span> ` : '';
      const prijs = puntenTonen ? `<div class="pts">${r.points}</div>` : '';
      const regels: string[] = [];
      if (r.bijnaam) regels.push(`<div class="bij">“${e(r.bijnaam)}”</div>`);
      if (r.whisper) regels.push(`<div class="load">${e(clean(r.whisper))}</div>`);

      if (opts.stats && opts.statsFor) {
        for (const row of opts.statsFor(naam)) {
          const kop = STAT_COLS.map((k) => `<th>${k}</th>`).join('');
          const cel = STAT_COLS.map((k) => `<td>${e(row[k] ?? '-')}</td>`).join('');
          const label = row.Name && row.Name !== naam ? `<caption>${e(row.Name)}</caption>` : '';
          regels.push(`<table class="stat">${label}<thead><tr>${kop}</tr></thead><tbody><tr>${cel}</tr></tbody></table>`);
        }
      }
      if (opts.specialRules) {
        const sr = clean(r.unit.specialRules?.name_en ?? '');
        if (sr) regels.push(`<div class="sr">${e(sr)}</div>`);
      }

      return `<div class="unit"><div class="hoofd"><div class="naam">${aantal}${e(naam)}</div>${prijs}</div>${regels.join('')}</div>`;
    }).join('');

    const kop = puntenTonen
      ? `<h2>${CAT_LABEL[cat]}<span class="sub">${catPunten} pts</span></h2>`
      : `<h2>${CAT_LABEL[cat]}</h2>`;
    return `<section>${kop}${units}</section>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${e(meta.listName)}</title>
<style>
  @page { size: A4; margin: 15mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #14100a; background: #fff;
         font: 10.5pt/1.45 Georgia, "Iowan Old Style", "Palatino Linotype", serif;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  header { border-bottom: 1.5pt solid #14100a; padding-bottom: 3mm; margin-bottom: 5mm; }
  h1 { margin: 0; font-size: 20pt; line-height: 1.15; letter-spacing: .01em; }
  .meta { margin-top: 1.5mm; font-size: 9pt; color: #5c5342; }
  .totaal { float: right; text-align: right; font-size: 15pt; font-variant-numeric: tabular-nums; }
  .totaal small { display: block; font-size: 8pt; color: #5c5342; letter-spacing: .12em; text-transform: uppercase; }

  section { margin-bottom: 4mm; break-inside: auto; }
  h2 { font-size: 8.5pt; letter-spacing: .18em; text-transform: uppercase; color: #6b5c3a;
       margin: 0 0 1.5mm; padding-bottom: 1mm; border-bottom: .5pt solid #cfc6b0;
       display: flex; justify-content: space-between; break-after: avoid; }
  h2 .sub { font-variant-numeric: tabular-nums; letter-spacing: 0; }

  /* Een unit blijft bij elkaar — een afgesneden loadout is precies de regel die je op de avond zoekt. */
  .unit { break-inside: avoid; padding: 1.2mm 0; border-bottom: .25pt dotted #ddd6c4; }
  .unit:last-child { border-bottom: 0; }
  .hoofd { display: flex; align-items: baseline; gap: 3mm; }
  .naam { flex: 1; font-weight: 700; font-size: 11pt; }
  .naam .n { font-weight: 400; color: #5c5342; }
  .pts { font-variant-numeric: tabular-nums; font-size: 10.5pt; white-space: nowrap; }
  .bij  { font-style: italic; color: #5c5342; font-size: 9.5pt; }
  .load { color: #3d372c; font-size: 9.5pt; }
  .sr   { color: #5c5342; font-size: 9pt; font-style: italic; }

  table.stat { border-collapse: collapse; margin: 1mm 0 .5mm; font-size: 8pt;
               font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; }
  table.stat caption { caption-side: top; text-align: left; font-family: Georgia, serif;
                       font-size: 8.5pt; font-style: italic; color: #5c5342; padding-bottom: .5mm; }
  table.stat th, table.stat td { border: .25pt solid #cfc6b0; padding: .4mm 1.6mm; text-align: center; min-width: 6mm; }
  table.stat th { color: #6b5c3a; font-weight: 400; letter-spacing: .06em; }

  footer { margin-top: 6mm; padding-top: 2mm; border-top: .5pt solid #cfc6b0;
           font-size: 7.5pt; color: #6b5c3a; display: flex; justify-content: space-between; gap: 4mm; }
</style></head><body>
<header>
  <div class="totaal">${meta.total}<small>of ${meta.cap} pts</small></div>
  <h1>${e(meta.listName)}</h1>
  <div class="meta">${e(`${meta.faction} · ${meta.composition} · ${meta.rule}`)}</div>
</header>
${secties}
<footer>
  <span>Old World Companion</span>
  <span>Catalogue from Old World Builder (CC BY 4.0) · Warhammer: The Old World © Games Workshop</span>
</footer>
</body></html>`;
}

/** Bestandsnaam voor een download: de lijstnaam, veilig gemaakt. */
export function exportFilename(listName: string, ext: string): string {
  const basis = (listName || 'army-list').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase();
  return `${basis || 'army-list'}.${ext}`;
}
