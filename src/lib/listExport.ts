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

/** De drie lijstvormen van Old World Builder, met hun namen.
 *
 *  `regular` — elke optie op een eigen regel na de unit.
 *  `compact` — dezelfde inhoud, maar de opties tussen haakjes achter de unit.
 *  `simple`  — één regel per unit, alleen de opties die ertoe doen (hand weapons eruit, een compleet
 *              commando samengevat als "Full Command"), zonder kopregels per categorie.
 */
export type ListType = 'regular' | 'compact' | 'simple';
/** Platte tekst of Markdown — voor Discord en forums. */
export type Formatting = 'text' | 'markdown';

export interface ExportRow {
  name: string;
  /** De eigen naam die de speler deze unit gaf (campagne), als die er is. */
  bijnaam?: string;
  category: Category;
  count: number;
  points: number;
  /** De VOLLEDIGE loadout, zoals de builder hem kent (base wargear + keuzes + magic items). */
  loadout: string[];
  /** De ontruiste samenvatting die de roster onder de unit toont. Dit is wat `simple` gebruikt. */
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
  listType: ListType;
  formatting: Formatting;
  /** OWB's `isShowList`: geen punten — de lijst die je je tegenstander geeft. */
  hidePoints?: boolean;
  /** De special rules van elke unit eronder zetten. */
  specialRules?: boolean;
  /** De statline eronder zetten. Vereist `statsFor`; zonder dat wordt de schakelaar genegeerd. */
  stats?: boolean;
  /** De eigen naam van een unit meenemen (OWB's custom note). */
  customNotes?: boolean;
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

/** Twee labels die ALLEEN in onze catalogus bestaan, niet in die van OWB — dus drukt OWB ze ook niet
 *  af en zou onze tekst zonder deze filter afwijken voor dezelfde lijst:
 *   • "On foot" is bij ons een echte mount-optie (index 0); bij OWB is geen mount simpelweg géén
 *     regel in `mounts`, en hun export drukt alleen een mount af die `active` is.
 *   • "Wizard" is de kale `alwaysActive` kop boven de Level-keuze. OWB neemt een alwaysActive optie
 *     alleen mee als die aan een compositie hangt, dus zo'n kop valt daar weg. "Level 2 Wizard" is
 *     wél een echte keuze en blijft staan. */
const PLAATSHOUDERS = [/^on foot$/i, /^wizard$/i];

const STAT_COLS = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld'] as const;
/** OWB zet de statline met NBSP's aan elkaar, zodat een geplakte regel niet halverwege afbreekt. */
const NB = String.fromCharCode(160); // NBSP, expliciet: onzichtbaar in de bron is onleesbaar

/** Eén unitregel, in OWB's vorm: "10 Dark Elf Warriors [80 pts]".
 *  De telling staat er alleen als de unit er meer dan één is — precies zoals `unit.strength`. */
const unitKop = (r: ExportRow, punten: boolean): string =>
  `${r.count > 1 ? `${r.count} ` : ''}${clean(r.name)}${punten ? ` [${r.points} pts]` : ''}`;

/** De statline-regel van OWB: `[Naam] M(4) WS(3) …`, met NBSP's tussen de velden. */
function statRegels(r: ExportRow, opts: ExportOptions, md: boolean): string[] {
  if (!opts.stats || !opts.statsFor) return [];
  return opts.statsFor(clean(r.name)).map((row) => {
    const velden = STAT_COLS.map((k) => `${k}(${row[k] ?? NB})`).join(NB);
    const naam = row.Name ? `[${row.Name.replace(/ /g, NB)}]${NB}` : '';
    return `${md ? ' - ' : ''}${naam}${velden}`;
  });
}

/**
 * Een army list als tekst, in de opbouw van Old World Builder.
 *
 * PUUR. Deze module rekent NIETS uit: hij krijgt de rijen die de builder al op het scherm zet
 * (punten uit `entryPoints`, loadout uit `loadoutLabels`) en zet die om in tekst. Zou hij zelf
 * tellen, dan kon de export iets anders zeggen dan de builder — precies de soort stille afwijking
 * die in dit project al eerder geld heeft gekost.
 *
 * WAAROM PRECIES OWB'S VORM. Spelers plakken lijsten tussen apps, forums en Discord heen en weer, en
 * die vorm is daar de gewoonte geworden: `===`-kop, `++ Categorie [punten] ++`, opties als streepjes,
 * `---` en een bronregel onderaan. Overgenomen uit hun `get-list-as-text.js` (CC BY 4.0), inclusief
 * de NBSP's in de statline. Eén ding is bewust anders: de bronregel noemt DEZE app, want de lijst is
 * hier gemaakt — "Created with Old World Builder" eronder zetten zou simpelweg niet waar zijn.
 */
export function listToText(rows: ExportRow[], meta: ExportMeta, opts: ExportOptions): string {
  const md = opts.formatting === 'markdown';
  const compact = opts.listType === 'compact';
  const punten = !opts.hidePoints;
  const kopRegel = `${meta.faction}, ${meta.composition}, ${meta.rule}`;
  const bron = 'Created with "Old World Companion"';
  const url = 'https://oldworldcompanion.vercel.app';

  // ── SIMPLE: geen categorieën, één regel per unit ──────────────────────────────────────────────
  if (opts.listType === 'simple') {
    const regels = rows.map((r) => {
      const opties = clean(r.whisper).split(' · ').filter(Boolean).join(', ');
      return `${r.count > 1 ? `${r.count} ` : ''}${clean(r.name)}${opties ? `, ${opties}` : ''}${punten ? ` - ${r.points}` : ''}`;
    });
    return [
      `${meta.listName}${punten ? ` [${meta.total} pts]` : ''}`,
      kopRegel,
      '',
      ...regels,
      '',
      '---',
      bron,
      '',
      `[${url}]`,
    ].join('\n');
  }

  const uit: string[] = [];

  // ── Kop ───────────────────────────────────────────────────────────────────────────────────────
  // OWB laat de kop weg bij `compact` in platte tekst, en zet 'm als `##` in Markdown.
  if (md) {
    uit.push(`## ${meta.listName}${punten ? ` [${meta.total} pts]` : ''}`, kopRegel, '');
  } else if (!compact) {
    uit.push('===', `${meta.listName}${punten ? ` [${meta.total} pts]` : ''}`, kopRegel, '===', '');
  }

  for (const cat of CAT_ORDER) {
    const inCat = rows.filter((r) => r.category === cat);
    if (!inCat.length) continue;
    const catPunten = inCat.reduce((n, r) => n + r.points, 0);
    const kop = `${CAT_LABEL[cat]}${punten ? ` [${catPunten} pts]` : ''}`;
    uit.push(md ? `### ${kop}` : `++ ${kop} ++`);
    if (!compact && !md) uit.push('');

    for (const r of inCat) {
      uit.push(`${md ? '- ' : ''}${unitKop(r, punten)}`);

      // De opties: als lijstje eronder (regular) of tussen haakjes (compact/markdown).
      const loadout = r.loadout.map(clean).filter((o) => o && !PLAATSHOUDERS.some((re) => re.test(o)));
      if (loadout.length) {
        if (compact || md) uit.push(`${md ? ' -# ' : ''}(${loadout.join(', ')})`);
        else uit.push(...loadout.map((o) => `- ${o}`));
      }
      if (opts.specialRules) {
        const sr = clean(r.unit.specialRules?.name_en ?? '');
        if (sr) uit.push(md ? ` - __Special Rules:__ *${sr}*` : `Special Rules: ${sr}`);
      }
      if (opts.customNotes && r.bijnaam) {
        uit.push(md ? ` - __Note:__ *${r.bijnaam}*` : `Note: ${r.bijnaam}`);
      }
      const stats = statRegels(r, opts, md);
      if (stats.length) {
        if (!compact && !md) uit.push('');
        uit.push(...stats);
      }
      if (!md) uit.push('');
    }
  }

  uit.push(md ? `*${bron}* - ${url}` : `---\n${bron}\n\n[${url}]`);

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
  const puntenTonen = !opts.hidePoints;
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
