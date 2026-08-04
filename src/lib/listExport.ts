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

/** Bestandsnaam voor een download: de lijstnaam, veilig gemaakt. */
export function exportFilename(listName: string, ext: string): string {
  const basis = (listName || 'army-list').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase();
  return `${basis || 'army-list'}.${ext}`;
}
