// Hetzelfde printblad als `armyToPrintHtml`, maar als PDF-documentdefinitie (pdfmake).
//
// WAAROM NAAST printArmy.ts. Het printvenster van de browser is geen PDF: je krijgt de dialoog van
// het besturingssysteem, op mobiel soms helemaal niets, en het blad ziet er per browser anders uit
// omdat de printer marges en papierformaat mag overrulen. Een échte PDF is één bestand dat overal
// hetzelfde oogt en dat je kunt bewaren en doorsturen. Vandaar deze tweede renderer.
//
// PUUR, EN DAT IS EEN EIS. Dit bestand importeert van pdfmake ALLEEN types. Daardoor draait het ook
// in Node (zie scripts/pdf-preview.mjs), zodat een blad te controleren is zonder browser en zonder
// dat er ~1 MB bundel meelift in de app-chunk. De echte pdfmake-import gebeurt pas in
// `pdfDownload.ts`, dynamisch, op het moment dat iemand op de knop drukt.
//
// SPIEGEL VAN printArmy.ts, met opzet regel voor regel. Dezelfde opties, dezelfde categorie-volgorde,
// dezelfde regelresolutie, dezelfde appendix- en lore-verzameling. Zou dit bestand zijn eigen
// interpretatie hebben, dan zeggen het printvenster en de PDF iets anders over dezelfde lijst —
// precies de stille afwijking die dit project eerder al geld heeft gekost.
//
// DE KLEINE PRIVATE HELPERS UIT printArmy.ts (clean, PLAATSHOUDERS, MARKERING, schoonEffect,
// groepeer, wapenS, wapenExtras, CAT_ORDER) zijn hier GEDUPLICEERD, niet geïmporteerd. printArmy.ts
// is niet van deze module om te verbouwen, en er iets extra's uit exporteren zou dat bestand
// veranderen. De duplicaten staan hieronder met een verwijzing naar hun origineel; wijzigt daar iets,
// dan hoort het hier mee te wijzigen.
//
// TYPOGRAFIE. Broodtekst EB Garamond (de serif van de app), koppen Cinzel (alleen hoofdletters, dus
// alleen voor de lijstnaam en de hoofdstukkoppen, in uppercase). EB Garamond heeft OLDSTYLE-cijfers
// als standaard — een "3" die onder de regel duikt en een "1" ter grootte van een x-hoogte. In een
// statlinetabel is dat onleesbaar, dus staat `fontFeatures: ['lnum','tnum']` (lining + tabular) in de
// `defaultStyle`; pdfmake erft die via de style-stack door naar elke tekstnode.

import type { ArmyUnit, Lore, RichNode, Rule, UnitProfile } from '../types';
import type { Column, Content, ContentTable, CustomTableLayout, Style, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { PrintInput, PrintOptions } from './printArmy';
import type { MagicText } from './builderToArmy';
import { allowedLores, getRuleIndex, resolveOptionSlug, resolveRuleSlug, splitCompoundLabel } from './armyRules';
import { unitWeapons, type WeaponProfile } from './weaponStats';
import { magicItemIdFromName } from './owbBuilder';
import { richToPlain } from './richHtml';

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Maten, kleuren, lagen
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** PDF rekent in punten; het blad is in millimeters ontworpen (net als de @page-regels in de HTML). */
const mm = (n: number): number => n * 2.835;

/** A4 staand, in punten. Nodig om te schatten of een unit-blok nog op één pagina past. */
const A4 = { breedte: 595.28, hoogte: 841.89 };

// Exact de kleuren van het HTML-blad.
const INK = '#14100a';
const GEDEMPT = '#5c5342';
const LABEL = '#6b5c3a';
const TEKST = '#3d372c';
const TEKST2 = '#241f16';
const LIJN = '#cfc6b0';
const STIP = '#ddd6c4';

/** De inspringing van een regel- of itemblok: even breed als het LABEL-kolommetje ernaast, zodat
 *  namen en teksten onder elkaar uitkomen (`.rl { min-width: 21mm }` in de HTML).
 *
 *  BREDER DAN DE 21 mm VAN DE HTML, en dat moet: in HTML is `min-width` een ONDERgrens waar een lang
 *  label ("SPECIAL RULES") gewoon overheen loopt, terwijl een pdfmake-kolom een VASTE breedte heeft
 *  en de tekst er binnen afbreekt. 21 mm gaf dus een label van twee regels naast een tekst van een. */
const LABELKOL = mm(26);
/** Letterspatiëring van die labels (0.1em bij 7.6 pt). */
const LABELSPATIE = 0.6;

const marge = (l: number, t: number, r: number, b: number): [number, number, number, number] => [l, t, r, b];

/** Dunne tabellijnen (.25 pt, #cfc6b0) met de krappe cel-padding van het printblad. */
const TABEL_LAGEN: CustomTableLayout = {
  hLineWidth: () => 0.25,
  vLineWidth: () => 0.25,
  hLineColor: () => LIJN,
  vLineColor: () => LIJN,
  paddingLeft: () => mm(1.5),
  paddingRight: () => mm(1.5),
  paddingTop: () => mm(0.3),
  paddingBottom: () => mm(0.3),
};

/** Dezelfde lijnen, maar voor een tabel BINNEN een regeltekst (een To Hit-chart in een regelbody). */
const RICH_TABEL_LAGEN: CustomTableLayout = {
  ...TABEL_LAGEN,
  paddingLeft: () => mm(1.4),
  paddingRight: () => mm(1.4),
};

/** Een horizontale lijn over de volle beschikbare breedte.
 *
 *  WAAROM GEEN `canvas`. Een canvas-lijn eist een expliciete lengte in punten, en die is hier
 *  onbekend: hetzelfde blokje staat zowel over de volle bladbreedte als binnen een halve kolom.
 *  Een tabel met één lege rij en alleen een bovenrand rekt wél mee met zijn kolom. */
function lijn(dikte: number, kleur = INK, boven = 0, onder = 0): Content {
  return {
    table: { widths: ['*'], body: [[{ text: '' }]] },
    layout: {
      hLineWidth: (i: number) => (i === 0 ? dikte : 0),
      vLineWidth: () => 0,
      hLineColor: () => kleur,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: marge(0, boven, 0, onder),
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Kleine helpers — duplicaten van de private helpers in printArmy.ts (zie de kop van dit bestand)
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Stuurtekens uit wiki-tekst. In pdfmake valt er niets te escapen (er is geen markup), maar een los
 *  stuurteken uit een slecht geconverteerde bron laat pdfkit een leeg glyph tekenen. Tab, newline en
 *  carriage return blijven staan: die betekenen iets in een effecttekst. */
function strip(s: string): string {
  let uit = '';
  for (const teken of String(s ?? '')) {
    const code = teken.codePointAt(0) ?? 0;
    if (code >= 32 || code === 9 || code === 10 || code === 13) uit += teken;
  }
  return uit;
}

/** Zie `clean` in printArmy.ts. */
const clean = (s: string): string =>
  strip(s || '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;.])/g, '$1')
    .trim();

/** Zie `PLAATSHOUDERS` in printArmy.ts. */
const PLAATSHOUDERS = [/^on foot$/i, /^wizard$/i];

/** Zie `MARKERING` / `isMarkering` in printArmy.ts. */
const MARKERING = /^\*?\s*(extremely\s+)?common\s*$/i;
const isMarkering = (s: string): boolean => MARKERING.test((s || '').trim());

/** Zie `schoonEffect` in printArmy.ts. */
const schoonEffect = (body?: string): string =>
  strip(body || '')
    .split(/\r?\n/)
    .filter((r) => r.trim() && !isMarkering(r))
    .join('\n')
    .trim();

/** Zie `CAT_ORDER` in printArmy.ts. */
const CAT_ORDER = ['Characters', 'Core', 'Special', 'Rare', 'Mercenaries', 'Allies'];

/** Zie `groepeer` in printArmy.ts. */
function groepeer(units: ArmyUnit[]): { label: string; units: ArmyUnit[] }[] {
  const groepen = new Map<string, ArmyUnit[]>();
  for (const u of units) {
    const rauw = (u.category || '').trim();
    const bekend = CAT_ORDER.find((c) => new RegExp(`^${c}\\b`, 'i').test(rauw));
    const key = bekend ?? (rauw || 'Units');
    const lijst = groepen.get(key);
    if (lijst) lijst.push(u);
    else groepen.set(key, [u]);
  }
  const uit = [...groepen.entries()].map(([label, us]) => ({ label, units: us }));
  const rang = (l: string) => {
    const i = CAT_ORDER.indexOf(l);
    return i < 0 ? CAT_ORDER.length : i;
  };
  return uit.sort((a, b) => rang(a.label) - rang(b.label));
}

/** Zie `wapenS` in printArmy.ts. */
const wapenS = (w: WeaponProfile): string =>
  w.sAbs != null ? String(w.sAbs) : (w.sMod ? `S${w.sMod > 0 ? '+' : ''}${w.sMod}` : 'S');

/** Zie `wapenExtras` in printArmy.ts. */
function wapenExtras(w: WeaponProfile): string[] {
  const uit = w.specialRules.filter((r) => !isMarkering(r));
  if (w.aMod > 0) uit.push(`+${w.aMod} A`);
  if (w.multiShots && !w.specialRules.some((r) => /multiple shots/i.test(r))) {
    uit.push(`Multiple Shots (${w.multiShots})`);
  }
  if (w.shots > 1) uit.push(`${w.shots} shots`);
  return uit;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Rich text → pdfmake
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** De inline-runs van een reeks nodes (tekst met marks, links, verwijzingen). */
function inlineRuns(nodes: RichNode[] | undefined): Content[] {
  const uit: Content[] = [];
  for (const n of nodes ?? []) uit.push(...inlineNode(n));
  return uit;
}

function inlineNode(node: RichNode): Content[] {
  switch (node.nodeType) {
    case 'text': {
      const waarde = strip(node.value ?? '');
      if (!waarde) return [];
      const run: Style & { text: string } = { text: waarde };
      for (const m of node.marks ?? []) {
        if (m.type === 'bold') run.bold = true;
        else if (m.type === 'italic') run.italics = true;
        else if (m.type === 'underline') run.decoration = 'underline';
        // `code` wordt gewone tekst: een monospace-run in een serif-alinea leest als een fout,
        // en er is in dit blad geen derde font ingesloten.
      }
      return [run];
    }

    // Papier heeft geen links: alleen de tekst (zelfde keuze als richHtml.ts).
    case 'hyperlink':
      return inlineRuns(node.content);

    case 'entry-hyperlink':
    case 'embedded-entry-inline': {
      const kinderen = inlineRuns(node.content);
      if (kinderen.length) return [{ text: kinderen, italics: true }];
      const naam = node.data?.target?.fields?.name;
      return naam ? [{ text: strip(naam), italics: true }] : [];
    }

    default:
      return inlineRuns(node.content);
  }
}

const blokken = (nodes: RichNode[] | undefined): Content[] =>
  (nodes ?? []).flatMap((n) => richToPdf(n));

/** Eén rich-text node (meestal het hele `document`) als pdfmake-content.
 *
 *  Zelfde vertaalkeuzes als `richToHtml`: links worden platte tekst, een `embedded-entry-block`
 *  wordt alleen de naam (een Miscast-tabel hoort in het rulebook, niet vier keer in je legerlijst),
 *  en alle kopniveaus worden één klein kopje — een wiki-`h2` is op een A4 vol units net zo groot als
 *  de lijstnaam. */
export function richToPdf(node: RichNode | null | undefined): Content[] {
  if (!node) return [];
  switch (node.nodeType) {
    case 'document':
      return blokken(node.content);

    case 'paragraph': {
      const runs = inlineRuns(node.content);
      return runs.length ? [{ text: runs, margin: marge(0, mm(0.4), 0, mm(0.4)) }] : [];
    }

    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
    case 'heading-4':
    case 'heading-5':
    case 'heading-6': {
      const tekst = strip(richToPlain(node)).trim();
      if (!tekst) return [];
      return [{
        text: tekst.toUpperCase(),
        fontSize: 8.4,
        characterSpacing: 0.67,
        color: LABEL,
        margin: marge(0, mm(0.8), 0, mm(0.2)),
      }];
    }

    case 'unordered-list':
      return [{ ul: lijstItems(node), margin: marge(mm(2), mm(0.4), 0, mm(0.4)) }];
    case 'ordered-list':
      return [{ ol: lijstItems(node), margin: marge(mm(2), mm(0.4), 0, mm(0.4)) }];
    case 'list-item':
      return blokken(node.content);

    case 'blockquote':
      return [{
        stack: blokken(node.content),
        italics: true,
        color: GEDEMPT,
        margin: marge(mm(3), mm(0.6), 0, mm(0.6)),
      }];

    case 'hr':
      return [lijn(0.25, LIJN, mm(1), mm(1))];

    // Een tabel in een regeltekst (een To Hit-chart, een Miscast-worp) IS de regel. Platgeslagen tot
    // een reeks woorden wordt hij onbruikbaar, dus komt hij als echte tabel op het blad.
    case 'table':
      return [richTabel(node)];

    case 'embedded-entry-block': {
      const naam = node.data?.target?.fields?.name ?? node.data?.target?.fields?.slug;
      if (!naam) return [];
      return [{ text: strip(naam), italics: true, color: GEDEMPT, margin: marge(0, mm(0.4), 0, mm(0.4)) }];
    }

    case 'text':
    case 'hyperlink':
    case 'entry-hyperlink':
    case 'embedded-entry-inline': {
      const runs = inlineNode(node);
      return runs.length ? [{ text: runs }] : [];
    }

    default:
      return blokken(node.content);
  }
}

function lijstItems(node: RichNode): Content[] {
  return (node.content ?? []).map((li) => {
    const inhoud = blokken(li.content);
    if (!inhoud.length) return { text: '' };
    return inhoud.length === 1 ? inhoud[0] : { stack: inhoud };
  });
}

/** Een rich-text-tabel als pdfmake-tabel. pdfmake eist dat elke rij ÉVEN VEEL cellen heeft — de wiki
 *  levert soms een rij met een samengevoegde cel minder — dus worden korte rijen aangevuld. */
function richTabel(node: RichNode): Content {
  const rijen: Content[][] = [];
  const loop = (n: RichNode | undefined): void => {
    if (!n) return;
    if (n.nodeType === 'table-row') {
      const cellen: Content[] = [];
      for (const c of n.content ?? []) {
        if (c.nodeType === 'table-cell' || c.nodeType === 'table-header-cell') {
          const inhoud = blokken(c.content);
          const kop = c.nodeType === 'table-header-cell';
          cellen.push(inhoud.length ? { stack: inhoud, ...(kop ? { color: LABEL } : {}) } : { text: '' });
        }
      }
      rijen.push(cellen);
      return;
    }
    (n.content ?? []).forEach(loop);
  };
  loop(node);

  const kolommen = rijen.reduce((n, r) => Math.max(n, r.length), 0);
  if (!kolommen) return { text: '' };
  for (const r of rijen) while (r.length < kolommen) r.push({ text: '' });

  return {
    table: { widths: Array.from({ length: kolommen }, () => '*'), body: rijen },
    layout: RICH_TABEL_LAGEN,
    fontSize: 7.8,
    margin: marge(0, mm(0.8), 0, mm(0.8)),
  } as ContentTable;
}

/** Eén regelbody. `body` is de rich-text; `bodyIndex` is de platte terugval voor een data-bundel die
 *  de body kwijt is (zelfde terugval als `regelBody` in printArmy.ts). */
function regelBody(rule: Rule): Content[] {
  const inhoud = richToPdf(rule.body);
  if (richToPlain(rule.body).trim()) return inhoud;
  const plat = strip(rule.bodyIndex || '').trim();
  return plat ? [{ text: plat }] : [];
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Regelresolutie — identiek aan printArmy.ts
// ══════════════════════════════════════════════════════════════════════════════════════════════

interface RegelRef { label: string; rule?: Rule }

interface Ctx {
  rules: Record<string, Rule>;
  idx: Map<string, string>;
  faction: string;
  appendix: Map<string, Rule>;
  lores: Map<string, { lore: Lore; gekozen: Set<string>; wizards: string[] }>;
  opts: PrintOptions;
  /** Basis-lettergrootte van het blad; bepaalt ook de schatting van de blokhoogtes. */
  basis: number;
}

function resolveer(labels: (string | undefined)[], ctx: Ctx): RegelRef[] {
  const uit: RegelRef[] = [];
  const gezien = new Set<string>();
  for (const rauw of labels) {
    const heel = clean(rauw ?? '');
    if (!heel) continue;
    for (const deel of splitCompoundLabel(heel)) {
      const label = deel.trim();
      if (!label || PLAATSHOUDERS.some((re) => re.test(label)) || isMarkering(label)) continue;
      const k = label.toLowerCase();
      if (gezien.has(k)) continue;
      gezien.add(k);
      const slug = resolveRuleSlug(label, ctx.idx, ctx.faction) ?? resolveOptionSlug(label, ctx.idx, ctx.faction);
      const rule = slug ? ctx.rules[slug] : undefined;
      uit.push({ label, rule });
    }
  }
  return uit;
}

function onthoud(ref: RegelRef, ctx: Ctx): void {
  const r = ref.rule;
  if (!r || r.slug.endsWith('-profile')) return;
  if (!ctx.appendix.has(r.slug)) ctx.appendix.set(r.slug, r);
}

/** Een rij "LABEL   naam · naam", met het label in een vaste kolom zodat alle rijen uitlijnen. */
function regelRij(titel: string, namen: string): Content {
  return {
    columns: [
      { text: titel.toUpperCase(), width: LABELKOL, fontSize: 7.6, characterSpacing: LABELSPATIE, color: LABEL },
      { text: namen, color: TEKST },
    ],
    fontSize: 8.8,
    margin: marge(0, mm(0.8), 0, 0),
  };
}

/** Een groepje regels onder een unit: altijd de namen, in `inline`-modus ook de teksten; in
 *  `appendix`-modus worden de gevonden regels onthouden voor achterin. */
function regelBlok(titel: string, refs: RegelRef[], ctx: Ctx): Content[] {
  if (!refs.length) return [];
  const kop = regelRij(titel, refs.map((r) => r.label).join(' · '));
  if (ctx.opts.rulesMode === 'appendix') {
    refs.forEach((r) => onthoud(r, ctx));
    return [kop];
  }
  const teksten: Content[] = refs
    .filter((r) => r.rule)
    .map((r) => ({
      stack: [regelKop(r.label, (r.rule as Rule).pageReference), ...regelBody(r.rule as Rule)],
      margin: marge(LABELKOL, mm(1), 0, 0),
      unbreakable: true,
    }));
  return [kop, ...teksten];
}

/** De vetgedrukte naam van een regel, met de paginaverwijzing er gedempt achter. */
function regelKop(naam: string, pagina: number | null | undefined): Content {
  const runs: Content[] = [{ text: strip(naam), bold: true }];
  if (pagina) runs.push({ text: `   p. ${pagina}`, bold: false, fontSize: 7.4, color: LABEL });
  return { text: runs, fontSize: 8.8 };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Tabellen
// ══════════════════════════════════════════════════════════════════════════════════════════════

function statTabel(profiel: UnitProfile, caption?: string): Content[] {
  if (!profiel.stats?.length) return [];
  const uit: Content[] = [];
  if (caption) {
    uit.push({
      text: clean(caption),
      fontSize: 8.2,
      italics: true,
      color: GEDEMPT,
      margin: marge(0, mm(1), 0, mm(0.4)),
    });
  }
  uit.push({
    table: {
      widths: profiel.stats.map(() => '*'),
      body: [
        profiel.stats.map((s) => ({ text: strip(s.k), color: LABEL, characterSpacing: 0.47 })),
        profiel.stats.map((s) => ({ text: strip(s.v || '-') })),
      ],
    },
    layout: TABEL_LAGEN,
    fontSize: 7.8,
    alignment: 'center',
    margin: marge(0, caption ? 0 : mm(1), 0, mm(0.5)),
  } as ContentTable);
  return uit;
}

const WAPEN_KOPPEN = ['Weapon', 'Range', 'S', 'AP', 'Special rules'];

/** Eén rij van de wapentabel. Naam en special rules links, de getallen gecentreerd. */
function wapenRij(naam: string, range: string, s: string, ap: string, regels: string): Content[] {
  return [
    { text: strip(naam), alignment: 'left' },
    { text: strip(range || '-') },
    { text: strip(s || '-') },
    { text: strip(ap || '-') },
    { text: strip(regels || '-'), alignment: 'left', color: TEKST },
  ];
}

function wapenTabel(rijen: Content[][]): Content {
  return {
    table: {
      widths: ['*', 'auto', 'auto', 'auto', '*'],
      body: [
        WAPEN_KOPPEN.map((k, i) => ({
          text: k.toUpperCase(),
          color: LABEL,
          fontSize: 7.4,
          characterSpacing: 0.44,
          alignment: (i === 0 || i === 4 ? 'left' : 'center') as 'left' | 'center',
        })),
        ...rijen,
      ],
    },
    layout: TABEL_LAGEN,
    fontSize: 7.9,
    alignment: 'center',
    margin: marge(0, mm(1), 0, mm(0.5)),
  } as ContentTable;
}

/** Het wapenprofiel van een magic item (magic-item-text.json), als het er een heeft. */
function itemProfielTabel(profiel: NonNullable<MagicText[string]['profiel']>): Content[] {
  const rijen = profiel.map((p) => wapenRij(p.naam || '', p.range || '', p.strength || '', p.ap || '', p.specialRules || ''));
  return rijen.length ? [wapenTabel(rijen)] : [];
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Hoogteschatting — zie `unitBlok`
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** De platte lengte van een inline-tekstwaarde, om er regels van te kunnen schatten. */
function tekstLengte(c: Content | undefined): number {
  if (c == null) return 0;
  if (typeof c === 'string') return c.length;
  if (typeof c === 'number') return String(c).length;
  if (Array.isArray(c)) return c.reduce((n: number, x) => n + tekstLengte(x), 0);
  const o = c as unknown as Record<string, unknown>;
  return o.text != null ? tekstLengte(o.text as Content) : 0;
}

/** Een RUWE hoogteschatting van een stuk content, in punten.
 *
 *  Bewust grof: hij dient alleen om te beslissen of een unit-blok `unbreakable` mag zijn (zie daar).
 *  Overschatten is veilig — dan valt de unit terug op breekbaar en verlies je hooguit de belofte dat
 *  hij bij elkaar blijft; onderschatten kost je inhoud. */
/* Geëxporteerd voor ijking (zie SCHATFACTOR); de app zelf gebruikt hem alleen hier. */
export function schatHoogte(c: Content | undefined, breedte: number, basis: number): number {
  if (c == null) return 0;
  const regelH = basis * 1.42;
  const perRegel = Math.max(8, breedte / (basis * 0.47));
  if (typeof c === 'string' || typeof c === 'number') {
    return regelH * Math.max(1, Math.ceil(String(c).length / perRegel));
  }
  if (Array.isArray(c)) return c.reduce((n: number, x) => n + schatHoogte(x, breedte, basis), 0);
  const o = c as unknown as Record<string, unknown>;
  const m = Array.isArray(o.margin) ? ((o.margin[1] as number) ?? 0) + ((o.margin[3] as number) ?? 0) : 0;
  if (o.stack) return m + schatHoogte(o.stack as Content, breedte, basis);
  if (o.columns) {
    const kols = o.columns as Content[];
    const deel = breedte / Math.max(1, kols.length);
    return m + kols.reduce((n: number, k) => Math.max(n, schatHoogte(k, deel, basis)), 0);
  }
  if (o.table) {
    const body = (o.table as { body: unknown[] }).body ?? [];
    return m + body.length * (regelH + mm(0.6));
  }
  if (o.ul || o.ol) return m + schatHoogte((o.ul ?? o.ol) as Content, breedte, basis);
  if (o.text != null) return m + regelH * Math.max(1, Math.ceil(tekstLengte(o.text as Content) / perRegel));
  return m + regelH;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// De unit
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Eén unit als blok content. Volgt `unitBlok` in printArmy.ts stap voor stap: tabellen links
 *  (statlines, wapens, mounts), tekst rechts (loadout, regels, items, lore-verwijzing). */
function unitBlok(unit: ArmyUnit, input: PrintInput, ctx: Ctx, breedte: number): Content {
  const o = ctx.opts;
  const datasheet = clean(unit.datasheet || unit.name);
  const eigen = clean(unit.name);
  const kop: Content[] = [];
  const links: Content[] = [];
  const rechts: Content[] = [];

  // ── Kop ─────────────────────────────────────────────────────────────────────────────────────
  const naamRuns: Content[] = [];
  if (unit.count && unit.count > 1) naamRuns.push({ text: `${unit.count}× `, bold: false, color: GEDEMPT });
  naamRuns.push({ text: datasheet, bold: true });
  if (o.unitNames && eigen && eigen !== datasheet) {
    naamRuns.push({ text: ` “${eigen}”`, bold: false, italics: true, color: GEDEMPT });
  }
  const kolommen: Column[] = [{ text: naamRuns }];
  if (o.points && unit.points != null) {
    kolommen.push({ text: String(unit.points), width: 'auto', alignment: 'right', bold: false });
  }
  kop.push({ columns: kolommen, columnGap: mm(3), fontSize: 11 });
  if (unit.troopType) {
    kop.push({ text: strip(unit.troopType).toUpperCase(), fontSize: 7.8, characterSpacing: 0.78, color: LABEL });
  }

  // ── Loadout ─────────────────────────────────────────────────────────────────────────────────
  if (o.loadout) {
    const opties = (unit.options ?? []).map(clean).filter((x) => x && !PLAATSHOUDERS.some((re) => re.test(x)));
    if (opties.length) {
      rechts.push({ text: opties.join(' · '), color: TEKST, fontSize: 8.8, margin: marge(0, mm(0.6), 0, 0) });
    }
  }

  // ── Statlines ───────────────────────────────────────────────────────────────────────────────
  if (o.statlines) {
    const profielen = unit.profiles ?? [];
    const meerdere = profielen.length > 1;
    for (const p of profielen) {
      const caption = meerdere || (p.label && clean(p.label) !== datasheet) ? p.label : undefined;
      links.push(...statTabel(p, caption));
    }
  }

  // ── Special rules van de unit (+ van losse profielrijen die eigen regels dragen) ─────────────
  if (o.unitRules) {
    rechts.push(...regelBlok('Special rules', resolveer(unit.specialRules ?? [], ctx), ctx));
    for (const p of unit.profiles ?? []) {
      const eigenRegels = p.info?.specialRules ?? [];
      if (!eigenRegels.length) continue;
      rechts.push(...regelBlok(clean(p.label || 'Profile'), resolveer(eigenRegels, ctx), ctx));
    }
  }

  // ── Wapens ──────────────────────────────────────────────────────────────────────────────────
  if (o.weapons) {
    const { melee, ranged } = unitWeapons(unit, input.rules);
    const alle = [...melee, ...ranged];
    if (alle.length) {
      const rijen: Content[][] = [];
      const regelLabels: string[] = [];
      for (const w of alle) {
        // Een MAGIC WEAPON komt uit `unitWeapons` als kaal basisprofiel; het echte profiel (S+1,
        // AP −1, Magical Attacks) staat in magic-item-text.json. Zie printArmy.ts.
        const magisch = w.slug.startsWith('magic-weapon:')
          ? input.magicText?.[magicItemIdFromName(clean(w.name))]?.profiel
          : undefined;
        if (magisch?.length) {
          for (const p of magisch) {
            const naam = clean(p.naam || w.name).replace(/\s*\(profile\)\s*$/i, '') || clean(w.name);
            rijen.push(wapenRij(naam, p.range || w.range || '', p.strength || '', p.ap || '', p.specialRules || ''));
            if (p.specialRules) regelLabels.push(...p.specialRules.split(',').map((s) => s.trim()));
          }
          continue;
        }
        rijen.push(wapenRij(clean(w.name), w.range, wapenS(w), w.ap ? String(w.ap) : '', wapenExtras(w).join(', ')));
        regelLabels.push(...w.specialRules);
        if (w.multiProfile) {
          const mp = w.multiProfile;
          rijen.push(wapenRij(`${clean(w.name)} (rapid fire)`, mp.range, wapenS(mp), mp.ap ? String(mp.ap) : '', wapenExtras(mp).join(', ')));
          regelLabels.push(...mp.specialRules);
        }
      }
      links.push(wapenTabel(rijen));
      if (o.weaponRules) rechts.push(...regelBlok('Weapon rules', resolveer(regelLabels, ctx), ctx));
    }
  }

  // ── Mounts ──────────────────────────────────────────────────────────────────────────────────
  if (o.mounts) {
    for (const m of unit.mounts ?? []) {
      const mkop: Content[] = [{ text: `Mount: ${clean(m.name)}`, bold: true }];
      if (m.troopType) {
        mkop.push({ text: `   ${strip(m.troopType).toUpperCase()}`, bold: false, fontSize: 7.8, characterSpacing: 0.78, color: LABEL });
      }
      links.push({ text: mkop, fontSize: 8.8, margin: marge(0, mm(1.2), 0, 0) });
      if (o.statlines) for (const p of m.profiles ?? []) links.push(...statTabel(p));
      if ((m.details ?? []).length) {
        links.push({ text: (m.details ?? []).map(strip).join(' · '), color: TEKST, fontSize: 8.8, margin: marge(0, mm(0.6), 0, 0) });
      }
      rechts.push(...regelBlok('Mount rules', resolveer(m.specialRules ?? [], ctx), ctx));
    }
  }

  // ── Magic items ─────────────────────────────────────────────────────────────────────────────
  if (o.magicItems && (unit.magicItems ?? []).length) {
    const items: Content[] = [regelRij('Magic items', '')];
    for (const item of unit.magicItems ?? []) {
      const tekst = input.magicText?.[magicItemIdFromName(clean(item.name))];
      const flavour = tekst?.description ?? item.flavour;
      const effect = schoonEffect(tekst?.body) || (item.specialRules ?? []).filter((r) => !isMarkering(r)).join(', ');
      const profiel = tekst?.profiel?.length && !o.weapons ? itemProfielTabel(tekst.profiel) : [];
      const blok: Content[] = [{ text: clean(item.name), bold: true, fontSize: 8.8 }];
      if (flavour) blok.push({ text: strip(flavour), italics: true, color: GEDEMPT, fontSize: 8.2 });
      if (effect) blok.push({ text: effect, color: TEKST2, fontSize: 8.6 });
      blok.push(...profiel);
      items.push({ stack: blok, margin: marge(LABELKOL, mm(0.6), 0, 0), unbreakable: true });
    }
    rechts.push({ stack: items, margin: marge(0, mm(1), 0, 0) });
    // De special rules die een item verleent hebben elk hun eigen pagina — die horen in de appendix.
    if (o.rulesMode === 'appendix') {
      const labels = (unit.magicItems ?? []).flatMap((i) => i.specialRules ?? []);
      resolveer(labels, ctx).forEach((r) => onthoud(r, ctx));
    }
  }

  // ── Lores & spreuken ────────────────────────────────────────────────────────────────────────
  if (o.lores) rechts.push(...loreVerwijzing(unit, input, ctx));

  // ── Twee kolommen, of de volle breedte als er maar één kant gevuld is ────────────────────────
  const body: Content = links.length && rechts.length
    ? { columns: [{ stack: links }, { stack: rechts }], columnGap: mm(6), margin: marge(0, mm(0.6), 0, 0) }
    : { stack: [...links, ...rechts], margin: marge(0, mm(0.6), 0, 0) };

  const inhoud: Content[] = [...kop, body];

  // BIJ ELKAAR HOUDEN, MAAR NIET TEN KOSTE VAN INHOUD. pdfmake kan een `unbreakable` blok dat langer
  // is dan één pagina NIET splitsen — het houdt alleen de eerste pagina-fragment over en gooit de
  // rest weg (PageElementWriter.commitUnbreakableBlock: "no support for multi-page
  // unbreakableBlocks"). Een War Hydra met dertig regels zou dus stilletjes halveren. Vandaar de
  // ruwe hoogteschatting: past het blok ruim binnen een pagina, dan blijft het bij elkaar; is het
  // groter dan ~60% van de pagina, dan mag het breken. Een unit die over de paginarand valt is
  // vervelend; een unit waarvan de helft ontbreekt is een bug.
  // Met dezelfde veiligheidsmarge als in `tweeKolommen`; hier is de prijs van een misser het hoogst
  // (een unit die stilletjes halveert), maar 0,6 pagina laat daarbovenop nog ruim lucht.
  const hoogte = schatHoogte({ stack: inhoud }, breedte, ctx.basis) * SCHATFACTOR;
  const pagina = A4.hoogte - (ctx.opts.compact ? mm(22) : mm(30));
  return {
    stack: inhoud,
    ...(hoogte < pagina * 0.6 ? { unbreakable: true } : {}),
    margin: marge(0, ctx.opts.compact ? mm(1) : mm(1.6), 0, ctx.opts.compact ? mm(1) : mm(1.6)),
  };
}

/** Noteer de lores van deze wizard voor het eigen hoofdstuk, en geef terug wat er BIJ DE WIZARD hoort
 *  te staan: welke lore hij speelt, en waar de spreuken staan. Zie `loreVerwijzing` in printArmy.ts. */
function loreVerwijzing(unit: ArmyUnit, input: PrintInput, ctx: Ctx): Content[] {
  const slugs = allowedLores(unit, input.lores);
  if (!slugs.length) return [];
  const gekozenVanDezeWizard = new Set(unit.spells ?? []);
  const namen: string[] = [];
  for (const slug of slugs) {
    const lore = input.lores[slug];
    if (!lore?.spells?.length) continue;
    namen.push(lore.name);
    const bestaand = ctx.lores.get(slug);
    const bak = bestaand ?? { lore, gekozen: new Set<string>(), wizards: [] };
    for (const sp of gekozenVanDezeWizard) bak.gekozen.add(sp);
    const wie = clean(unit.name) || clean(unit.datasheet || '');
    if (wie && !bak.wizards.includes(wie)) bak.wizards.push(wie);
    ctx.lores.set(slug, bak);
  }
  if (!namen.length) return [];
  return [{
    columns: [
      { text: 'MAGIC', width: LABELKOL, fontSize: 7.6, characterSpacing: LABELSPATIE, color: LABEL },
      {
        text: [
          { text: namen.map(strip).join(', '), color: TEKST },
          { text: '   see Magic lores', fontSize: 7.4, color: LABEL },
        ],
      },
    ],
    fontSize: 8.8,
    margin: marge(0, mm(0.8), 0, 0),
  }];
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Hoofdstukken
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Een hoofdstukkop: Cinzel in kapitalen met letterspatiëring, subtotaal rechts, lijn eronder.
 *  `nieuwePagina` zet er een paginabreuk vóór (elk hoofdstuk op een eigen blad). */
function hoofdstukKop(label: string, rechtsTekst: string | null, compact: boolean, nieuwePagina: boolean): Content[] {
  const kolommen: Column[] = [{ text: strip(label).toUpperCase(), font: 'Cinzel', characterSpacing: 1.6 }];
  if (rechtsTekst) kolommen.push({ text: rechtsTekst, width: 'auto', alignment: 'right' });
  return [
    {
      columns: kolommen,
      columnGap: mm(4),
      fontSize: 10,
      color: INK,
      margin: marge(0, compact ? mm(2) : mm(3), 0, mm(1.2)),
      ...(nieuwePagina ? { pageBreak: 'before' as const } : {}),
    },
    lijn(1, INK, 0, mm(2)),
  ];
}

/** Een naslagblok in twee kolommen — met twee verschillende technieken, en dat is geen luxe.
 *
 *  pdfmake 0.3 kent `snakingColumns`: de linkerkolom loopt vol en gaat dan bovenaan de rechter
 *  verder, net als een krant. Dat is precies goed voor een appendix die MEER dan een pagina beslaat.
 *  Maar het overloopmoment is de PAGINARAND, niet het midden: past het hele blok op één pagina, dan
 *  blijft alles in de linkerkolom staan en blijft de halve bladzij leeg — precies de verspilling die
 *  de tweekolomsopmaak moest voorkomen (te zien bij een lore met drie spreuken).
 *
 *  Vandaar de splitsing: past het blok binnen één kolomhoogte, dan verdelen we de regels ZELF over
 *  twee stapels op geschatte hoogte; is het langer, dan doet `snakingColumns` zijn werk. */
/** Veiligheidsmarge op `schatHoogte`. GEMETEN (09-09, spreuken en appendixregels van een echte lijst
 *  apart gerenderd en met pdfjs nagemeten): echt/geschat ligt tussen 0,77 en 1,12, gemiddeld 0,94.
 *  Vijftien procent marge dekt de bovenkant daarvan; meer zou de tweekoloms-verdeling onnodig vaak
 *  naar `snakingColumns` sturen (een lore van drie spreuken kreeg dan een lege rechterkolom). */
const SCHATFACTOR = 1.15;

function tweeKolommen(items: Content[], gap: number, breedte: number, basis: number, ruimte: number): Content {
  if (items.length < 2) return { columns: [{ stack: items }, { text: '' }], columnGap: gap };
  const kolBreedte = (breedte - gap) / 2;
  const hoogtes = items.map((i) => schatHoogte(i, kolBreedte, basis));
  const totaal = hoogtes.reduce((a, b) => a + b, 0);
  // De twee fouten zijn niet gelijkwaardig: ten onrechte snaken kost een halflege rechterkolom, ten
  // onrechte verdelen kost een overloop naar een nieuwe pagina met een zwevend restje. Dus verdelen
  // alléén als het met marge past — en de hoofdstukkop (~25 mm) boven dit blok telt mee.
  if (totaal * SCHATFACTOR > ruimte - mm(25)) {
    return { columns: [{ stack: items }, { text: '' }], snakingColumns: true, columnGap: gap };
  }
  // Knip waar de opgetelde hoogte over de helft gaat; het item dat de grens overschrijdt gaat naar de
  // kolom waar het het minste uitsteekt (vandaar de halve hoogte in de vergelijking).
  let op = 0;
  let knip = items.length - 1;
  for (let i = 0; i < items.length; i++) {
    if (op + hoogtes[i] / 2 >= totaal / 2) { knip = i; break; }
    op += hoogtes[i];
  }
  knip = Math.min(Math.max(knip, 1), items.length - 1);
  return {
    columns: [{ stack: items.slice(0, knip) }, { stack: items.slice(knip) }],
    columnGap: gap,
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Het document
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** De volledige PDF-documentdefinitie van een army list.
 *
 *  PUUR: geen pdfmake-runtime, geen DOM, geen fetch. Wie deze functie aanroept levert zelf de data en
 *  rendert zelf (in de browser `pdfDownload.ts`, in Node `scripts/pdf-preview.mjs`). */
export function armyToPdfDoc(input: PrintInput, opts: PrintOptions): TDocumentDefinitions {
  const basis = opts.compact ? 8.6 : 10;
  const ctx: Ctx = {
    rules: input.rules,
    idx: getRuleIndex(input.rules),
    faction: input.faction,
    appendix: new Map(),
    lores: new Map(),
    opts,
    basis,
  };

  const marges: [number, number, number, number] = opts.compact
    ? [mm(10), mm(11), mm(10), mm(11)]
    : [mm(14), mm(15), mm(14), mm(15)];
  const bladbreedte = A4.breedte - marges[0] - marges[2];
  const bladhoogte = A4.hoogte - marges[1] - marges[3];

  // ── Kop van het blad ─────────────────────────────────────────────────────────────────────────
  const titelKolom: Column[] = [{
    stack: [
      { text: strip(input.meta.listName), font: 'Cinzel', fontSize: opts.compact ? 16 : 20, lineHeight: 1.15 },
      {
        text: strip(`${input.meta.faction} · ${input.meta.composition} · ${input.meta.rule}`),
        fontSize: 8.5,
        color: GEDEMPT,
        margin: marge(0, mm(1.5), 0, 0),
      },
    ],
  }];
  if (opts.points) {
    titelKolom.push({
      width: 'auto',
      alignment: 'right',
      stack: [
        { text: String(input.meta.total), fontSize: opts.compact ? 13 : 15 },
        { text: `OF ${input.meta.cap} PTS`, fontSize: 7.5, color: GEDEMPT, characterSpacing: 0.9 },
      ],
    });
  }
  const content: Content[] = [
    { columns: titelKolom, columnGap: mm(4) },
    lijn(1.5, INK, mm(3), mm(5)),
  ];

  // ── Hoofdstukken met units ───────────────────────────────────────────────────────────────────
  // De eerste krijgt nooit een paginabreuk: dan begin je met een lege bladzij.
  let eersteHoofdstuk = true;
  const breek = () => {
    const nieuw = opts.chapterPages && !eersteHoofdstuk;
    eersteHoofdstuk = false;
    return nieuw;
  };

  for (const { label, units } of groepeer(input.army.units)) {
    const subtotaal = units.reduce((n, u) => n + (u.points ?? 0), 0);
    content.push(...hoofdstukKop(label, opts.points ? `${subtotaal} pts` : null, opts.compact, breek()));
    units.forEach((u, i) => {
      content.push(unitBlok(u, input, ctx, bladbreedte));
      if (i < units.length - 1) content.push(lijn(0.25, STIP, 0, 0));
    });
  }

  // ── Magic lores ──────────────────────────────────────────────────────────────────────────────
  // Eén keer, op een eigen hoofdstuk, in plaats van onder elke wizard: een lore van tien spreuken
  // tweemaal afdrukken kost een halve A4 en levert niets op (zie printArmy.ts).
  if (opts.lores && ctx.lores.size) {
    content.push(...hoofdstukKop('Magic lores', null, opts.compact, breek()));
    for (const { lore, gekozen, wizards } of [...ctx.lores.values()].sort((a, b) => a.lore.name.localeCompare(b.lore.name))) {
      const filteren = opts.spellsOnlyChosen && gekozen.size > 0;
      const spreuken = [...lore.spells]
        .sort((a, b) => (a.signature === b.signature ? (a.number ?? 0) - (b.number ?? 0) : a.signature ? -1 : 1))
        .filter((s) => !filteren || gekozen.has(s.slug));
      if (!spreuken.length) continue;

      const loreKop: Column[] = [{ text: strip(lore.name).toUpperCase(), fontSize: 9, characterSpacing: 1.08, color: INK }];
      if (wizards.length) {
        loreKop.push({ text: wizards.map(strip).join(', '), width: 'auto', alignment: 'right', fontSize: 7.4, color: GEDEMPT });
      }
      content.push({ columns: loreKop, columnGap: mm(4), margin: marge(0, mm(2), 0, mm(0.6)) });
      content.push(lijn(0.5, LIJN, 0, mm(1)));

      const rijen: Content[] = spreuken.map((s) => {
        const rule = input.rules[s.slug];
        const merk = s.signature ? 'SIGNATURE' : String(s.number ?? '');
        const kopRuns: Content[] = [
          { text: merk, bold: false, fontSize: 7.4, characterSpacing: 0.59, color: LABEL },
          { text: `   ${strip(s.name)}`, bold: true },
        ];
        if (rule?.pageReference) kopRuns.push({ text: `   p. ${rule.pageReference}`, bold: false, fontSize: 7.4, color: LABEL });
        return {
          stack: [{ text: kopRuns, fontSize: 8.8 }, ...(rule ? regelBody(rule) : [])],
          fontSize: 8.6,
          color: TEKST2,
          margin: marge(0, 0, 0, mm(1.6)),
          unbreakable: true,
        };
      });
      content.push(tweeKolommen(rijen, mm(6), bladbreedte, basis, bladhoogte));
    }
  }

  // ── Rules reference ──────────────────────────────────────────────────────────────────────────
  // Pas hier opgebouwd: de appendix is gevuld door het renderen van de units hierboven.
  if (opts.rulesMode === 'appendix' && ctx.appendix.size) {
    content.push(...hoofdstukKop('Rules reference', null, opts.compact, breek()));
    const rijen: Content[] = [...ctx.appendix.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({
        stack: [regelKop(r.name, r.pageReference), ...regelBody(r)],
        fontSize: 8.6,
        color: TEKST2,
        margin: marge(0, 0, 0, mm(1.2)),
        unbreakable: true,
      }));
    content.push(tweeKolommen(rijen, mm(7), bladbreedte, basis, bladhoogte));
  }

  const gedrukt = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: marges,
    info: { title: strip(input.meta.listName), creator: 'Old World Companion' },
    defaultStyle: {
      font: 'Garamond',
      fontSize: basis,
      lineHeight: opts.compact ? 1.32 : 1.42,
      color: INK,
      // EB Garamond zet standaard oldstyle-cijfers; in tabellen en puntentotalen wil je lining +
      // tabular. Erft door naar elke tekstnode via de style-stack.
      fontFeatures: ['lnum', 'tnum'],
    },
    content,
    footer: (huidige: number, totaal: number): Content => ({
      margin: marge(marges[0], mm(3), marges[2], 0),
      stack: [
        lijn(0.5, LIJN, 0, mm(1.4)),
        {
          columns: [
            { text: `Old World Companion · Printed ${gedrukt}`, width: 'auto' },
            { text: `page ${huidige} / ${totaal}`, alignment: 'center' },
            {
              text: 'Catalogue from Old World Builder (CC BY 4.0) · Warhammer: The Old World © Games Workshop',
              width: 'auto',
              alignment: 'right',
            },
          ],
          columnGap: mm(4),
        },
      ],
      fontSize: 7.2,
      color: LABEL,
    }),
  };
}
