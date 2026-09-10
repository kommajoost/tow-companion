// De army-list-PDF: een raster van UNIT-KAARTEN, plus een naslagpagina met lore en special rules.
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
// DEZELFDE INHOUD ALS printArmy.ts, EEN ANDERE OPMAAK. Alle inhoudelijke keuzes zijn ongewijzigd
// overgenomen: dezelfde opties, dezelfde categorie-volgorde, dezelfde regelresolutie via
// resolveRuleSlug/resolveOptionSlug, dezelfde appendix- en lore-verzameling, dezelfde
// magic-weapon-profielen uit magicText. Alleen de LAYOUT is nieuw (ontwerp Joost, 09-09): niet meer
// een doorlopende kolom met hoofdstukken, maar zes gelijke unit-kaarten per A4 en achterin één
// naslagpagina. Wijzigt er iets aan de inhoudelijke logica in printArmy.ts, dan hoort het hier mee
// te wijzigen.
//
// DE KLEINE PRIVATE HELPERS UIT printArmy.ts (clean, PLAATSHOUDERS, MARKERING, schoonEffect,
// groepeer, wapenS, wapenExtras, CAT_ORDER) zijn hier GEDUPLICEERD, niet geïmporteerd. printArmy.ts
// is niet van deze module om te verbouwen, en er iets extra's uit exporteren zou dat bestand
// veranderen.
//
// MATEN. Het ontwerp is een HTML-mock van 794 × 1123 px — dat is A4 op 96 dpi. Eén px is dus exact
// 0,75 pt, en `p()` hieronder rekent elke maat uit de mock om. Overal waar je een getal ziet staat
// het aantal PIXELS uit het ontwerp, zodat een wijziging in de mock hier één-op-één te volgen is.
//
// TYPOGRAFIE. Twee families: `Alegreya` (serif) voor titels, unitnamen, punten en spreuknamen, en
// `SourceSans` voor al het overige. Het ontwerp gebruikt gewicht 600 én 700 voor sans-vet; wij
// registreren alleen de SemiBold (600) als `bold` — bij 6,4 pt kleinkapitaal is het verschil met 700
// onzichtbaar en het scheelt een fontbestand over de lijn. Source Sans heeft lining-cijfers als
// standaard, maar `fontFeatures: ['lnum','tnum']` blijft staan: het maakt de statline-kolommen
// gegarandeerd tabulair en kan geen kwaad.

import type { ArmyUnit, Lore, RichNode, Rule, UnitProfile } from '../types';
import type { Column, Content, ContentTable, CustomTableLayout, Style, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { PrintInput, PrintOptions } from './printArmy';
import type { MagicText } from './builderToArmy';
import { allowedLores, getRuleIndex, resolveOptionSlug, resolveRuleSlug, splitCompoundLabel } from './armyRules';
import { unitWeapons, type WeaponProfile } from './weaponStats';
import { magicItemIdFromName } from './owbBuilder';
import { richToPlain } from './richHtml';

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Maten en kleuren
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** A4 staand, in punten. */
const A4 = { breedte: 595.28, hoogte: 841.89 };

/** Eén ontwerp-pixel in punten (de mock is A4 op 96 dpi). */
const PX = 0.75;

// De kleuren van het ontwerp, ONTDAAN VAN HUN WARME TINT. Het ontwerp werkt met een warm grijs
// (#1c1916 / #6b6152) en een goudaccent (#8a6d3b, lijnen #c9b58a); op papier las dat als "er zit
// kleur in" (Joost, 10-09: "er zitten nog gekleurde lijnen in, maak het gewoon zwart wit/grijs").
// Dit is dezelfde toonladder — inkt, grijs, tekst, lijn, haarlijn — maar volledig neutraal, zodat
// het blad ook op een zwart-witprinter en in grijstinten precies zo overkomt als op het scherm.
const INK = '#1a1a1a';
const GRIJS = '#6e6e6e';
const TEKST = '#454545';
/** Waar het ontwerp goud gebruikt (het kopregeltje, "Total", de voettekst). Neutraal is dat gewoon
 *  de inkt zelf: kleiner en met letterspatiëring gezet blijft de hiërarchie overeind. */
const ACCENT = INK;
/** De lijn die in het ontwerp goud is: onder de kop, boven elke statline-rij, boven de voettekst. */
const LIJN = '#c2c2c2';
const HAARLIJN = '#e4e4e4';

/** Alle afgeleide maten van één blad. `compact` krimpt ze allemaal met 10% — inclusief de
 *  paginamarges, zodat de verhoudingen kloppen en er simpelweg meer op past. */
interface Maten {
  /** Ontwerp-px → punten. */
  p(n: number): number;
  marge: number;
  voet: number;
  bladBreedte: number;
  bladHoogte: number;
  gap: number;
  kopHoogte: number;
  kaartBreedte: number;
  /** Binnenwerk van een kaart: buitenbreedte min de rand en de 12 px zijpadding. */
  kaartBinnen: number;
  /** Binnenwerk van een kaart over de VOLLE bladbreedte (naslag zonder lore-kaart). */
  breedBinnen: number;
}

function maten(compact: boolean): Maten {
  const f = compact ? 0.9 : 1;
  const p = (n: number): number => n * PX * f;
  const marge = p(38);
  // Voethoogte = de goudlijn + 8 px lucht + één regel van 11,5 px op regelafstand 1,35.
  const voet = p(1 + 8 + 11.5 * 1.35);
  const bladBreedte = A4.breedte - 2 * marge;
  const bladHoogte = A4.hoogte - marge - (marge + voet);
  const gap = p(12);
  // Kop van pagina 1: labelregel (9 px × 1,35) + 5 px + titel (35 px, regelafstand 1) + 12 px lucht.
  const kopHoogte = p(9) * 1.35 + p(5) + p(35) + p(12);
  const kaartBreedte = (bladBreedte - gap) / 2;
  const rand = p(1);
  return {
    p,
    marge,
    voet,
    bladBreedte,
    bladHoogte,
    gap,
    kopHoogte,
    kaartBreedte,
    kaartBinnen: kaartBreedte - 2 * rand - 2 * p(12),
    breedBinnen: bladBreedte - 2 * rand - 2 * p(12),
  };
}

const marge = (l: number, t: number, r: number, b: number): [number, number, number, number] => [l, t, r, b];

/** CSS `line-height` → pdfmake `lineHeight`.
 *
 *  WAAROM DEZE OMREKENING. In CSS is `line-height: 1.35` exact 1,35 × de lettergrootte. pdfmake
 *  vermenigvuldigt zijn `lineHeight` met de NATUURLIJKE regelhoogte van het font (ascender −
 *  descender + lineGap). Voor Alegreya is dat 1,361 em en voor Source Sans 3 zelfs 1,424 em, dus
 *  `lineHeight: 1` levert daar een regel van 1,36 respectievelijk 1,42 keer de lettergrootte op.
 *  Zonder deze deling wordt elke kaart een centimeter te hoog en passen er geen zes op een A4.
 *  (Gemeten met fontkit op de bestanden in `public/pdf-fonts/`.) */
const EM_SERIF = 1.361;
const EM_SANS = 1.424;
const lhSerif = (css: number): number => css / EM_SERIF;
const lhSans = (css: number): number => css / EM_SANS;

/** De ascender van beide families, in em. pdfmake zet de basislijn van een regel exact `ascender ×
 *  lettergrootte` onder de bovenkant van het blok — óók als `lineHeight` de regel korter maakt.
 *  Daarmee is het verschil tussen twee basislijnen naast elkaar exact uit te rekenen; nodig omdat
 *  pdfmake kolommen op hun BOVENkant uitlijnt en het ontwerp op de basislijn. (GEMETEN 09-09 tegen de
 *  gerenderde PDF.) */
const ASC_SERIF = 1.016;
const ASC_SANS = 1.024;

/** Een horizontale lijn over de volle beschikbare breedte.
 *
 *  WAAROM GEEN `canvas`. Een canvas-lijn eist een expliciete lengte in punten, en die is hier
 *  onbekend: hetzelfde lijntje staat zowel over de volle bladbreedte als binnen een kaartkolom.
 *  Een tabel met één lege rij en alleen een bovenrand rekt wél mee met zijn kolom. */
function lijn(dikte: number, kleur: string, boven = 0, onder = 0): Content {
  return {
    // De cel is leeg maar zou als tekstnode een VOLLE regel hoog worden; met lettergrootte 1 blijft er
    // een streep van een punt over in plaats van tien punten lucht onder elke lijn.
    table: { widths: ['*'], body: [[{ text: '', fontSize: 1, lineHeight: 1 }]] },
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

/** Zie `isGeneral` in CampaignResultReporter.tsx — de generaal is een OPTIE die met "General" begint. */
const isGeneral = (u: ArmyUnit): boolean =>
  (u.options ?? []).some((o) => /^general\b/i.test(o.replace(/\{[^}]*\}/g, '').trim()));

/** Waar een regel vandaan komt als er geen paginanummer is ("Renegade V2", "Ravening Hordes"). */
const bronLabel = (r: Rule): string =>
  r.pageReference ? `p.${r.pageReference}` : strip(r.association?.[r.association.length - 1] ?? '');

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Tekstbreedte — nodig omdat pdfmake geen wrappende rij omkaderde "chips" kent
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** De advance widths van SourceSans3-SemiBold voor teken 32…126, in duizendsten van een em
 *  (uitgelezen met fontkit uit `public/pdf-fonts/SourceSans3-SemiBold.ttf`).
 *
 *  WAAROM EEN TABEL EN GEEN METING. De chips onderaan een kaart zijn omkaderde blokjes die moeten
 *  WRAPPEN binnen de kaartbreedte. pdfmake heeft geen inline-block met rand, dus we verdelen ze zelf
 *  over regels — en daarvoor moet dit bestand weten hoe breed een label wordt. Meten kan hier niet:
 *  de module is puur en heeft geen font geladen. Vandaar deze constante; wijzigt het chip-font, dan
 *  hoort deze tabel mee te wijzigen. */
const CHAR_W = [
  200, 315, 482, 513, 513, 841, 639, 275, 324, 324, 438, 513, 275, 322, 275, 344,
  513, 513, 513, 513, 513, 513, 513, 513, 513, 513, 275, 275, 513, 513, 513, 444,
  875, 558, 597, 576, 625, 538, 510, 628, 663, 282, 494, 597, 502, 745, 657, 674,
  582, 674, 592, 545, 546, 655, 536, 800, 541, 501, 540, 324, 344, 324, 513, 500,
  549, 516, 563, 462, 564, 507, 317, 520, 558, 262, 263, 522, 271, 843, 560, 549,
  564, 564, 373, 431, 361, 556, 495, 748, 481, 495, 443, 324, 255, 324, 513,
];

/** Breedte van een stukje tekst in SourceSans SemiBold, in punten. Onbekende tekens (accenten,
 *  gedachtestreepjes) krijgen een ruime schatting: overschatten kost hooguit een chip minder op een
 *  regel, onderschatten laat een chip over de kaartrand lopen. */
function tekstBreedte(s: string, grootte: number): number {
  let n = 0;
  for (const teken of s) {
    const c = teken.codePointAt(0) ?? 32;
    n += c >= 32 && c <= 126 ? CHAR_W[c - 32] : 560;
  }
  return (n / 1000) * grootte;
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
        // `code` wordt gewone tekst: een monospace-run in een alinea leest als een fout, en er is in
        // dit blad geen derde font ingesloten.
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
 *  en alle kopniveaus worden één klein kopje.
 *
 *  De maten hier zijn NIET geschaald met `compact`: deze functie is ook los geëxporteerd en heeft
 *  geen blad-context. Het verschil is een fractie van een punt op een regelafstand. */
export function richToPdf(node: RichNode | null | undefined): Content[] {
  if (!node) return [];
  switch (node.nodeType) {
    case 'document':
      return blokken(node.content);

    case 'paragraph': {
      const runs = inlineRuns(node.content);
      return runs.length ? [{ text: runs, margin: marge(0, 1, 0, 1) }] : [];
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
        fontSize: 6.4,
        characterSpacing: 0.5,
        bold: true,
        color: GRIJS,
        margin: marge(0, 2.5, 0, 0.8),
      }];
    }

    case 'unordered-list':
      return [{ ul: lijstItems(node), margin: marge(6, 1, 0, 1) }];
    case 'ordered-list':
      return [{ ol: lijstItems(node), margin: marge(6, 1, 0, 1) }];
    case 'list-item':
      return blokken(node.content);

    case 'blockquote':
      return [{
        stack: blokken(node.content),
        italics: true,
        color: GRIJS,
        margin: marge(8, 2, 0, 2),
      }];

    case 'hr':
      return [lijn(0.5, HAARLIJN, 3, 3)];

    // Een tabel in een regeltekst (een To Hit-chart, een Miscast-worp) IS de regel. Platgeslagen tot
    // een reeks woorden wordt hij onbruikbaar, dus komt hij als echte tabel op het blad.
    case 'table':
      return [richTabel(node)];

    case 'embedded-entry-block': {
      const naam = node.data?.target?.fields?.name ?? node.data?.target?.fields?.slug;
      if (!naam) return [];
      return [{ text: strip(naam), italics: true, color: GRIJS, margin: marge(0, 1, 0, 1) }];
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

/** Dunne haarlijnen voor een tabel BINNEN een regeltekst. */
const RICH_TABEL_LAGEN: CustomTableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => LIJN,
  vLineColor: () => LIJN,
  paddingLeft: () => 3,
  paddingRight: () => 3,
  paddingTop: () => 1,
  paddingBottom: () => 1,
};

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
          cellen.push(inhoud.length ? { stack: inhoud, ...(kop ? { color: GRIJS } : {}) } : { text: '' });
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
    fontSize: 6.6,
    margin: marge(0, 2, 0, 2),
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
  /** Magic items die ergens in het leger voorkomen, ontdubbeld op naam — hun tekst staat alleen op de
   *  naslagpagina (op de kaart staat de naam in de loadout-regel). */
  items: Map<string, { naam: string; flavour?: string; effect: string; profiel: string[] }>;
  opts: PrintOptions;
  m: Maten;
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
      // Eerst als regelNAAM, dan pas als wargear-label: die tweede route kent aliassen en mag nooit
      // een goed antwoord van de eerste overrulen.
      const slug = resolveRuleSlug(label, ctx.idx, ctx.faction) ?? resolveOptionSlug(label, ctx.idx, ctx.faction);
      const rule = slug ? ctx.rules[slug] : undefined;
      uit.push({ label, rule });
    }
  }
  return uit;
}

/** Onthoud een regel voor de naslagpagina. Wapenprofiel-pagina's slaan we over: de profieltabel die
 *  al op de kaart staat IS die regel, en de pagina zelf bevat niets anders. */
function onthoud(ref: RegelRef, ctx: Ctx): void {
  const r = ref.rule;
  if (!r || r.slug.endsWith('-profile')) return;
  if (!ctx.appendix.has(r.slug)) ctx.appendix.set(r.slug, r);
}

/** Labels resolveren, onthouden voor de naslag, en de schoongemaakte namen teruggeven — dat is wat er
 *  als chip op de kaart komt.
 *
 *  `rulesMode: 'inline'` bestaat in deze layout NIET meer als aparte weergave. Een kaart heeft geen
 *  ruimte voor volledige regelteksten (zes stuks op een A4), dus staan de teksten altijd één keer op
 *  de naslagpagina en op de kaart alleen de naam. De optie blijft in `PrintOptions` staan omdat
 *  printArmy.ts hem wél honoreert. */
function chipLabels(labels: (string | undefined)[], ctx: Ctx): string[] {
  const refs = resolveer(labels, ctx);
  refs.forEach((r) => onthoud(r, ctx));
  return refs.map((r) => r.label);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Bouwstenen van een kaart
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** De rand van een kaart: 1 px inkt rondom, geen padding (de inhoud draagt zijn eigen marges, zodat
 *  de scheidingslijn onder de kop over de VOLLE kaartbreedte kan lopen). */
function kaartRand(m: Maten): CustomTableLayout {
  const d = m.p(1);
  return {
    hLineWidth: () => d,
    vLineWidth: () => d,
    hLineColor: () => INK,
    vLineColor: () => INK,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  };
}

/** De INHOUD van een kaart — kop, 2 px scheidingslijn, body — zonder rand eromheen.
 *
 *  De rand hoort bij de CEL waar de kaart in staat, niet bij de kaart zelf; zie `kaartRij`. */
function kaartInhoud(kop: Content[], body: Content[], m: Maten): Content {
  const zij = m.p(12);
  return {
    stack: [
      { stack: kop, margin: marge(zij, m.p(9), zij, m.p(9)) },
      lijn(m.p(2), INK),
      { stack: body, margin: marge(zij, m.p(8), zij, m.p(8)) },
    ],
  };
}

/** Een kaart die alléén staat (volle bladbreedte): dan tekent hij zijn rand zelf. */
function omrand(inhoud: Content, m: Maten): Content {
  return {
    table: { widths: ['*'], body: [[inhoud]] },
    layout: kaartRand(m),
  } as ContentTable;
}

const RAND: [boolean, boolean, boolean, boolean] = [true, true, true, true];
const GEEN_RAND: [boolean, boolean, boolean, boolean] = [false, false, false, false];

/** Twee kaarten naast elkaar, met de rand op de CEL in plaats van op de kaart.
 *
 *  WAAROM ZO. Een kaart die zijn eigen rand tekent is precies zo hoog als zijn inhoud, dus stonden
 *  twee kaarten naast elkaar bijna nooit even hoog (Joost, 10-09: "Dark Riders is net groter dan
 *  Warriors"). Dat was eerder opgevangen met een opgelegde minimumhoogte van een derde pagina, maar
 *  dat liet onder een korte kaart juist een berg wit achter ("de sorceresses hebben nu wel veel
 *  witruimte") én kostte een hele rij zodra één kaart erover groeide.
 *
 *  Een tabelCEL is per definitie zo hoog als de hoogste cel van zijn rij. Ligt de rand daar, dan
 *  lijnen twee kaarten vanzelf uit op hun eigen, natuurlijke hoogte — geen wit, geen misgelopen rij.
 *  De middelste kolom is een lege cel zonder rand: dat is de 12 px tussenruimte van het ontwerp. */
function kaartRij(links: Content, rechts: Content | null, m: Maten, ondermarge = true): Content {
  // `border` is een CEL-eigenschap, geen content-eigenschap; de typings van pdfmake kennen hem
  // alleen op tabelcellen, vandaar de omweg via `unknown`.
  const cel = (c: Content | null): Content =>
    (c ? { ...(c as object), border: RAND } : { text: '', border: GEEN_RAND }) as unknown as Content;
  return {
    table: {
      widths: [m.kaartBreedte, m.gap, m.kaartBreedte],
      body: [[cel(links), { text: '', border: GEEN_RAND }, cel(rechts)]],
      dontBreakRows: true,
    },
    layout: kaartRand(m),
    // De tussenruimte hangt ONDER elke rij behalve de laatste. Met een marge onder de laatste rij
    // loopt die marge over de onderrand van de pagina heen en zet pdfmake er een lege bladzij achter.
    margin: marge(0, 0, 0, ondermarge ? m.gap : 0),
  } as ContentTable;
}

/** Het kleine gouden/grijze kapitaalregeltje boven een kaarttitel. */
function labelRegel(tekst: string, kleur: string, m: Maten): Content {
  return {
    text: strip(tekst).toUpperCase(),
    fontSize: m.p(9),
    characterSpacing: m.p(9) * 0.16,
    bold: true,
    color: kleur,
  };
}

/** De kop van een kaart: klein label + serif-titel, met optioneel een getal rechts. */
function kaartKop(label: string, titel: Content[], rechts: Column | null, m: Maten): Content[] {
  const links: Content = {
    stack: [
      labelRegel(label, GRIJS, m),
      { text: titel, font: 'Alegreya', fontSize: m.p(22), lineHeight: lhSerif(1), margin: marge(0, m.p(2), 0, 0) },
    ],
  };
  if (!rechts) return [links];
  return [{ columns: [links, rechts], columnGap: m.p(8) }];
}

// ── Statlines ────────────────────────────────────────────────────────────────────────────────

/** De statline-tabel: geen celranden, alleen een gouden bovenlijn per profielrij. Alle profielen van
 *  de unit ÉN van zijn mounts staan in DEZELFDE tabel — zo lees je "Cold One Knight / Dread Knight /
 *  Cold One" als één blok, precies zoals het ontwerp het toont. */
function statTabel(profielen: UnitProfile[], breedte: number, m: Maten): Content[] {
  const rijen = profielen.filter((p) => p.stats?.length);
  if (!rijen.length) return [];
  const kolommen = rijen[0].stats.map((s) => strip(s.k));
  const eerste = breedte * 0.38;
  const rest = (breedte - eerste) / kolommen.length;

  const kop: Content[] = [
    { text: '' },
    ...kolommen.map((k) => ({
      text: k,
      fontSize: m.p(8.5),
      characterSpacing: m.p(8.5) * 0.06,
      bold: true,
      color: GRIJS,
      alignment: 'center' as const,
    })),
  ];
  const body: Content[][] = [kop];
  for (const p of rijen) {
    const cel = new Map(p.stats.map((s) => [strip(s.k), strip(s.v || '')]));
    body.push([
      { text: clean(p.label || ''), fontSize: m.p(10.5), color: TEKST, noWrap: true },
      ...kolommen.map((k) => ({
        text: cel.get(k) || '–',
        fontSize: m.p(10.5),
        bold: true,
        color: INK,
        alignment: 'center' as const,
      })),
    ]);
  }

  return [{
    table: { widths: [eerste, ...kolommen.map(() => rest)], body },
    layout: {
      // Rij 0 is de kop; die heeft geen bovenlijn. Elke profielrij krijgt er wél een, in goud.
      hLineWidth: (i: number) => (i === 0 || i > body.length - 1 ? 0 : m.p(1)),
      vLineWidth: () => 0,
      hLineColor: () => LIJN,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: (i: number) => (i === 0 ? 0 : m.p(3)),
      paddingBottom: (i: number) => (i === 0 ? m.p(2) : m.p(3)),
    },
  } as ContentTable];
}

// ── Wapens ───────────────────────────────────────────────────────────────────────────────────

const WAPEN_KOPPEN = ['Weapon', 'Range', 'S', 'AP', 'Rules'];

/** Eén rij van de wapentabel. Naam en rules links, de getallen gecentreerd. */
function wapenRij(naam: string, range: string, s: string, ap: string, regels: string, m: Maten): Content[] {
  const g = m.p(10);
  return [
    { text: strip(naam), fontSize: g, color: INK, noWrap: true },
    { text: strip(range || '–'), fontSize: g, color: TEKST, alignment: 'center', noWrap: true },
    { text: strip(s || '–'), fontSize: g, color: TEKST, alignment: 'center', noWrap: true },
    { text: strip(ap || '–'), fontSize: g, color: TEKST, alignment: 'center', noWrap: true },
    { text: strip(regels || '–'), fontSize: g, color: TEKST },
  ];
}

function wapenTabel(rijen: Content[][], m: Maten): Content {
  const kop: Content[] = WAPEN_KOPPEN.map((k, i) => ({
    text: k,
    fontSize: m.p(8),
    characterSpacing: m.p(8) * 0.06,
    bold: true,
    color: GRIJS,
    alignment: (i === 0 || i === 4 ? 'left' : 'center') as 'left' | 'center',
  }));
  const body = [kop, ...rijen];
  return {
    table: { widths: ['*', 'auto', 'auto', 'auto', '*'], body },
    layout: {
      hLineWidth: (i: number) => (i === 0 || i > body.length - 1 ? 0 : m.p(1)),
      vLineWidth: () => 0,
      hLineColor: () => LIJN,
      paddingLeft: () => 0,
      paddingRight: (i: number, node: unknown) => {
        const kolommen = (node as { table: { widths: unknown[] } }).table.widths.length;
        return i === kolommen - 1 ? 0 : m.p(4);
      },
      paddingTop: (i: number) => (i === 0 ? 0 : m.p(2)),
      paddingBottom: (i: number) => (i === 0 ? m.p(2) : m.p(2)),
    },
  } as ContentTable;
}

/** Het wapenprofiel van een magic item als één regel tekst, voor de naslagpagina. */
function itemProfielRegel(profiel: NonNullable<MagicText[string]['profiel']>): string[] {
  return profiel.map((p) => [p.range, p.strength ? (/^S/i.test(p.strength) ? p.strength : `S ${p.strength}`) : '', p.ap ? `AP ${p.ap}` : '', p.specialRules]
    .map((x) => clean(x || ''))
    .filter(Boolean)
    .join(' · '));
}

// ── Chips ────────────────────────────────────────────────────────────────────────────────────

/** De special rules onderaan een kaart, als omkaderde blokjes die over meerdere regels wrappen.
 *
 *  WAAROM ZELF METEN. pdfmake kent geen inline-block met een rand: `columns` legt naast elkaar en
 *  wrapt niet, `text` wrapt maar kan geen kader per woordgroep. Dus schatten we de breedte van elk
 *  label (zie `tekstBreedte`), verdelen ze zelf over regels die binnen de kaart passen, en zetten
 *  elke regel als `columns` van kleine één-cels-tabellen met eigen rand.
 *
 *  IN HET ONTWERP STAAN ZE ONDERAAN DE KAART (`margin-top:auto`). Dat kan pdfmake niet: er is geen
 *  manier om content naar de onderkant van een geforceerde rijhoogte te duwen. Ze staan hier dus
 *  direct onder de loadout-regel. */
function chips(labels: string[], breedte: number, m: Maten): Content[] {
  if (!labels.length) return [];
  const g = m.p(10);
  const padH = m.p(5);
  // ZACHTER DAN HET ONTWERP. Daar staat elke chip in een zwarte kader van een hele pixel met vette
  // letters; op een kaart met tien regels wordt dat een blok streepjescode dat harder roept dan de
  // statline erboven ("ik vind de vormgeving van de rules wat te heftig" — Joost, 10-09). Dus een
  // dunnere lijn in het lichte grijs en gewone letters: de kaders ordenen nog steeds, maar ze
  // schreeuwen niet meer.
  const rand = m.p(0.6);
  const gap = m.p(4);

  const blokje = (label: string): Content => ({
    table: { widths: ['auto'], body: [[{ text: label, fontSize: g, color: INK, lineHeight: lhSans(1.15), noWrap: true }]] },
    layout: {
      hLineWidth: () => rand,
      vLineWidth: () => rand,
      hLineColor: () => LIJN,
      vLineColor: () => LIJN,
      paddingLeft: () => padH,
      paddingRight: () => padH,
      paddingTop: () => m.p(1),
      paddingBottom: () => m.p(1),
    },
    width: 'auto',
  } as unknown as Content);

  const regels: Content[] = [];
  let huidig: string[] = [];
  let op = 0;
  const spoel = (): void => {
    if (!huidig.length) return;
    regels.push({
      columns: [...huidig.map(blokje), { text: '', width: '*' }],
      columnGap: gap,
      margin: marge(0, 0, 0, m.p(3)),
    });
    huidig = [];
    op = 0;
  };
  for (const label of labels) {
    // +1 pt speling: de randen en de afronding van pdfmake's eigen meting.
    const w = tekstBreedte(label, g) + 2 * padH + 2 * rand + 1;
    if (huidig.length && op + gap + w > breedte) spoel();
    op += (huidig.length ? gap : 0) + w;
    huidig.push(label);
  }
  spoel();
  return regels;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Hoogteschatting — voor de tweekoloms-verdeling van de naslag
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

/** Een RUWE hoogteschatting van een stuk content, in punten. Bewust grof: hij dient alleen om de
 *  naslag in pagina-grote brokken te knippen en die over twee kolommen te verdelen.
 *
 *  HIJ ERFT DE LETTERGROOTTE DOOR (`fontSize` op een node overschrijft `basis` voor alles eronder).
 *  Zonder dat telde elke haarlijn — een tabel met één lege cel — voor een volle tekstregel mee, en
 *  schatte de naslag zich anderhalf keer te hoog. */
/* Geëxporteerd voor ijking; de app zelf gebruikt hem alleen hier. */
export function schatHoogte(c: Content | undefined, breedte: number, basis: number): number {
  if (c == null) return 0;
  const regels = (len: number, grootte: number): number =>
    grootte * 1.42 * Math.max(1, Math.ceil(len / Math.max(8, breedte / (grootte * 0.47))));
  if (typeof c === 'string' || typeof c === 'number') return regels(String(c).length, basis);
  if (Array.isArray(c)) return c.reduce((n: number, x) => n + schatHoogte(x, breedte, basis), 0);
  const o = c as unknown as Record<string, unknown>;
  const eigen = typeof o.fontSize === 'number' && o.fontSize > 0 ? o.fontSize : basis;
  const m = Array.isArray(o.margin) ? ((o.margin[1] as number) ?? 0) + ((o.margin[3] as number) ?? 0) : 0;
  if (o.stack) return m + schatHoogte(o.stack as Content, breedte, eigen);
  if (o.columns) {
    const kols = o.columns as Content[];
    const deel = breedte / Math.max(1, kols.length);
    return m + kols.reduce((n: number, k) => Math.max(n, schatHoogte(k, deel, eigen)), 0);
  }
  if (o.table) {
    const t = o.table as { body?: Content[][]; widths?: unknown[] };
    const rijen = t.body ?? [];
    const deel = breedte / Math.max(1, t.widths?.length ?? rijen[0]?.length ?? 1);
    return m + rijen.reduce(
      (n, rij) => n + Math.max(2, ...rij.map((cel) => schatHoogte(cel as Content, deel, eigen))) + 1.7,
      0,
    );
  }
  if (o.ul || o.ol) return m + schatHoogte((o.ul ?? o.ol) as Content, breedte, eigen);
  if (o.text != null) return m + regels(tekstLengte(o.text as Content), eigen);
  return m + eigen * 1.42;
}

/** Veiligheidsmarge op `schatHoogte`. GEMETEN (09-09): echt/geschat ligt tussen 0,77 en 1,12. */
const SCHATFACTOR = 1.15;

/** Een reeks blokjes over twee EVEN LANGE kolommen, verdeeld op geschatte hoogte.
 *
 *  WAAROM NIET `snakingColumns` (dat pdfmake 0.3 wél kent). Snaking laat de linkerkolom vollopen tot
 *  de PAGINARAND en gaat dan bovenaan de rechter verder — prima voor een doorlopend blad, maar hier
 *  staan de kolommen in een tabelcel (de kaartrand), en dáár klapt snaking de cel in tot de halve
 *  breedte en loopt de tekst onder de rand door. GEMETEN 09-09. De naslag wordt daarom hierbóven al
 *  in pagina-grote brokken geknipt (zie `referentieKaarten`), zodat elke kaart op één pagina past en
 *  deze functie alleen nog hoeft te balanceren. */
function tweeKolommen(items: Content[], gap: number, breedte: number, basis: number): Content {
  if (items.length < 2) return { columns: [{ stack: items }, { text: '' }], columnGap: gap };
  const kolBreedte = (breedte - gap) / 2;
  const hoogtes = items.map((i) => schatHoogte(i, kolBreedte, basis) * SCHATFACTOR);
  const totaal = hoogtes.reduce((a, b) => a + b, 0);
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
// De unit-kaart
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Eén unit als kaart. Volgt het ontwerp: kop (categorie · troop type · mount, naam, punten),
 *  scheidingslijn, statlines, wapens, loadout, chips. */
function unitKaart(unit: ArmyUnit, categorie: string, input: PrintInput, ctx: Ctx): Content {
  const o = ctx.opts;
  const m = ctx.m;
  const b = m.kaartBinnen;
  const datasheet = clean(unit.datasheet || unit.name);
  const eigen = clean(unit.name);

  // ── Kop ─────────────────────────────────────────────────────────────────────────────────────
  const labelDelen = [categorie, clean(unit.troopType || '')].filter(Boolean);
  for (const mount of unit.mounts ?? []) {
    if (o.mounts) labelDelen.push(`on ${clean(mount.name)}`);
  }
  const titelRuns: Content[] = [
    { text: unit.count && unit.count > 1 ? `${unit.count}× ${datasheet}` : datasheet },
  ];
  if (isGeneral(unit)) {
    titelRuns.push({
      text: '  GENERAL',
      font: 'SourceSans',
      fontSize: m.p(11.5),
      characterSpacing: m.p(11.5) * 0.1,
      color: INK,
    });
  }
  const rechts: Column | null = o.points && unit.points != null
    ? {
        text: String(unit.points),
        width: 'auto',
        alignment: 'right',
        font: 'Alegreya',
        fontSize: m.p(17),
        lineHeight: lhSerif(1),
        color: GRIJS,
        // pdfmake lijnt kolommen op hun BOVENkant uit, het ontwerp op de BASISLIJN van de labelregel
        // ernaast. Het verschil tussen de twee basislijnen is precies deze (negatieve) bovenmarge.
        margin: marge(0, m.p(9) * ASC_SANS - m.p(17) * ASC_SERIF, 0, 0),
      }
    : null;

  const kop = kaartKop(labelDelen.join(' · '), titelRuns, rechts, m);
  if (o.unitNames && eigen && eigen !== datasheet) {
    kop.push({
      text: `“${eigen}”`,
      italics: true,
      fontSize: m.p(11.5),
      color: GRIJS,
      margin: marge(0, m.p(2), 0, 0),
    });
  }

  // ── Body ────────────────────────────────────────────────────────────────────────────────────
  const body: Content[] = [];
  const naGap = (c: Content[]): void => {
    for (const [i, item] of c.entries()) {
      if (i === 0 && body.length) {
        const rec = item as unknown as Record<string, unknown>;
        rec.margin = marge(0, m.p(6), 0, 0);
      }
      body.push(item);
    }
  };

  // Statlines: unit-profielen én mount-profielen in één tabel.
  if (o.statlines) {
    const profielen: UnitProfile[] = [...(unit.profiles ?? [])];
    if (o.mounts) for (const mount of unit.mounts ?? []) profielen.push(...(mount.profiles ?? []));
    naGap(statTabel(profielen, b, m));
  }

  // Wapens.
  const wapenRegels: string[] = [];
  if (o.weapons) {
    const { melee, ranged } = unitWeapons(unit, input.rules);
    const alle = [...melee, ...ranged];
    const rijen: Content[][] = [];
    for (const w of alle) {
      // Een MAGIC WEAPON komt uit `unitWeapons` als kaal basisprofiel; het echte profiel (S+1,
      // AP −1, Magical Attacks) staat in magic-item-text.json. Zie printArmy.ts.
      const magisch = w.slug.startsWith('magic-weapon:')
        ? input.magicText?.[magicItemIdFromName(clean(w.name))]?.profiel
        : undefined;
      if (magisch?.length) {
        for (const p of magisch) {
          const naam = clean(p.naam || w.name).replace(/\s*\(profile\)\s*$/i, '') || clean(w.name);
          rijen.push(wapenRij(naam, p.range || w.range || '', p.strength || '', p.ap || '', p.specialRules || '', m));
          if (p.specialRules) wapenRegels.push(...p.specialRules.split(',').map((s) => s.trim()));
        }
        continue;
      }
      rijen.push(wapenRij(clean(w.name), w.range, wapenS(w), w.ap ? String(w.ap) : '', wapenExtras(w).join(', '), m));
      wapenRegels.push(...w.specialRules);
      // Een Rapid Fire-wapen schiet in zijn meervoudige stand een ANDER, zwakker profiel.
      if (w.multiProfile) {
        const mp = w.multiProfile;
        rijen.push(wapenRij(`${clean(w.name)} (rapid fire)`, mp.range, wapenS(mp), mp.ap ? String(mp.ap) : '', wapenExtras(mp).join(', '), m));
        wapenRegels.push(...mp.specialRules);
      }
    }
    if (rijen.length) naGap([wapenTabel(rijen, m)]);
  }

  // Magic items: op de kaart alleen de naam (die staat al in `options`); de tekst gaat naar de naslag.
  if (o.magicItems) {
    for (const item of unit.magicItems ?? []) {
      const naam = clean(item.name);
      if (!naam || ctx.items.has(naam.toLowerCase())) continue;
      const tekst = input.magicText?.[magicItemIdFromName(naam)];
      const effect = schoonEffect(tekst?.body) || (item.specialRules ?? []).filter((r) => !isMarkering(r)).join(', ');
      ctx.items.set(naam.toLowerCase(), {
        naam,
        flavour: clean(tekst?.description ?? item.flavour ?? '') || undefined,
        effect,
        profiel: tekst?.profiel?.length ? itemProfielRegel(tekst.profiel) : [],
      });
    }
    // De special rules die een item verleent hebben elk hun eigen pagina — die horen in de naslag.
    resolveer((unit.magicItems ?? []).flatMap((i) => i.specialRules ?? []), ctx).forEach((r) => onthoud(r, ctx));
  }

  // Loadout: opties gescheiden door " · ", met bij een wizard het level en de lore VET erachter.
  if (o.loadout) {
    const opties = (unit.options ?? []).map(clean).filter((x) => x && !PLAATSHOUDERS.some((re) => re.test(x)));
    // "Level 2 Wizard" hoort niet twee keer op de regel: hij verhuist naar het vette staartje.
    const niveauIdx = opties.findIndex((x) => /^level\s+\d/i.test(x));
    const niveau = niveauIdx >= 0 ? (opties[niveauIdx].match(/^level\s+\d+/i)?.[0] ?? '') : '';
    if (niveauIdx >= 0) opties.splice(niveauIdx, 1);
    const loreNamen = o.lores ? loreVerwijzing(unit, input, ctx) : [];
    const staart = [niveau, ...loreNamen].filter(Boolean).join(' · ');
    if (opties.length || staart) {
      const runs: Content[] = [];
      if (opties.length) runs.push({ text: opties.join(' · '), color: TEKST });
      if (staart) runs.push({ text: `${opties.length ? ' · ' : ''}${staart}`, bold: true, color: INK });
      naGap([{ text: runs, fontSize: m.p(10.5) }]);
    }
  } else if (o.lores) {
    loreVerwijzing(unit, input, ctx);
  }

  // Chips: alle special rules van de unit, zijn profielen, zijn mounts en zijn wapens.
  const chipInvoer: string[] = [];
  if (o.unitRules) {
    chipInvoer.push(...chipLabels(unit.specialRules ?? [], ctx));
    for (const p of unit.profiles ?? []) chipInvoer.push(...chipLabels(p.info?.specialRules ?? [], ctx));
  }
  if (o.mounts) for (const mount of unit.mounts ?? []) chipInvoer.push(...chipLabels(mount.specialRules ?? [], ctx));
  if (o.weapons && o.weaponRules) chipInvoer.push(...chipLabels(wapenRegels, ctx));
  const gezien = new Set<string>();
  const chipLijst = chipInvoer
    .filter((l) => l && !gezien.has(l.toLowerCase()) && gezien.add(l.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  const chipRegels = chips(chipLijst, b, m);
  if (chipRegels.length) {
    (chipRegels[0] as unknown as Record<string, unknown>).margin = marge(0, m.p(8), 0, m.p(3));
    body.push(...chipRegels);
  }

  return kaartInhoud(kop, body, m);
}

/** Noteer de lores van deze wizard voor de naslagpagina en geef de namen terug voor de loadout-regel.
 *  Zie `loreVerwijzing` in printArmy.ts. */
function loreVerwijzing(unit: ArmyUnit, input: PrintInput, ctx: Ctx): string[] {
  const slugs = allowedLores(unit, input.lores);
  if (!slugs.length) return [];
  const gekozenVanDezeWizard = new Set(unit.spells ?? []);
  const namen: string[] = [];
  for (const slug of slugs) {
    const lore = input.lores[slug];
    if (!lore?.spells?.length) continue;
    namen.push(strip(lore.name));
    const bestaand = ctx.lores.get(slug);
    const bak = bestaand ?? { lore, gekozen: new Set<string>(), wizards: [] };
    for (const sp of gekozenVanDezeWizard) bak.gekozen.add(sp);
    const wie = clean(unit.datasheet || '') || clean(unit.name);
    if (wie && !bak.wizards.includes(wie)) bak.wizards.push(wie);
    ctx.lores.set(slug, bak);
  }
  return namen;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// De naslagpagina
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Type / Casting Value / Range van een spreuk staan in de wiki als TABEL in de body. Op de kaart
 *  horen ze als één grijze regel rechts naast de spreuknaam, dus halen we ze eruit en laten we de
 *  tabel uit de body weg. Vindt hij niets, dan blijft de body ongewijzigd en is er geen rechterregel. */
function spreukSplits(body: RichNode | null): { meta: string[]; rest: RichNode } {
  const leeg = { meta: [] as string[], rest: (body ?? { nodeType: 'document', content: [] }) as RichNode };
  if (!body?.content?.length) return leeg;
  const idx = body.content.findIndex((n) => n.nodeType === 'table'
    && (n.content ?? []).some((rij) => /^(type|casting value|range)$/i.test(richToPlain(rij.content?.[0]).trim())));
  if (idx < 0) return leeg;

  const waarden = new Map<string, string>();
  for (const rij of body.content[idx].content ?? []) {
    const cellen = rij.content ?? [];
    if (cellen.length < 2) continue;
    waarden.set(richToPlain(cellen[0]).trim().toLowerCase(), clean(richToPlain(cellen[1])));
  }
  const meta = ['type', 'casting value', 'range'].map((k) => waarden.get(k) ?? '').filter(Boolean);
  return {
    meta,
    rest: { nodeType: 'document', content: body.content.filter((_, i) => i !== idx) },
  };
}

/** De lore-kaart: alle (of alleen de gekozen) spreuken van één lore. */
function loreKaart(
  lore: Lore,
  gekozen: Set<string>,
  wizards: string[],
  input: PrintInput,
  ctx: Ctx,
): Content | null {
  const m = ctx.m;
  const filteren = ctx.opts.spellsOnlyChosen && gekozen.size > 0;
  const spreuken = [...lore.spells]
    .sort((a, b) => (a.signature === b.signature ? (a.number ?? 0) - (b.number ?? 0) : a.signature ? -1 : 1))
    .filter((s) => !filteren || gekozen.has(s.slug));
  if (!spreuken.length) return null;

  const body: Content[] = spreuken.map((s, i) => {
    const rule = input.rules[s.slug];
    const { meta, rest } = spreukSplits(rule?.body ?? null);
    const merk = s.signature ? 'Sig' : String(s.number ?? '');
    const naamRuns: Content[] = [
      { text: `${merk}  `, font: 'SourceSans', fontSize: m.p(11.5), color: INK },
      { text: strip(s.name) },
    ];
    const regel: Column[] = [{ text: naamRuns, font: 'Alegreya', fontSize: m.p(15), lineHeight: lhSerif(1.15) }];
    if (meta.length) {
      regel.push({
        text: meta.join(' · '),
        width: 'auto',
        alignment: 'right',
        font: 'SourceSans',
        fontSize: m.p(10.5),
        bold: true,
        color: GRIJS,
        noWrap: true,
        margin: marge(0, m.p(2), 0, 0),
      });
    }
    const tekst = rule
      ? (richToPlain(rest).trim() ? richToPdf(rest) : regelBody(rule))
      : [];
    return {
      stack: [
        lijn(m.p(1), LIJN, 0, m.p(5)),
        { columns: regel, columnGap: m.p(6) },
        ...(tekst.length
          ? [{ stack: tekst, fontSize: m.p(10.5), color: TEKST, margin: marge(0, m.p(2), 0, 0) } as Content]
          : []),
      ],
      margin: marge(0, i === 0 ? 0 : m.p(8), 0, 0),
      unbreakable: true,
    } as Content;
  });

  const wie = wizards.length ? ` · ${wizards.join(', ')}` : '';
  return kaartInhoud(
    kaartKop(`Lore of magic${wie}`, [{ text: strip(lore.name) }], null, m),
    body,
    m,
  );
}

/** De naslag: elke special rule uit dit leger één keer, plus de magic items, in twee kolommen.
 *
 *  GEEFT MEERDERE KAARTEN TERUG. Een kaart is een tabelcel met een rand, en pdfmake tekent die rand
 *  op een vervolgpagina niet netjes om de inhoud heen: de kolommen breken los van elkaar en de laatste
 *  alinea valt buiten het kader (GEMETEN 09-09). Daarom knippen we de naslag hier zelf in brokken die
 *  elk op één pagina passen; elke brok wordt een eigen kaart en de volgende begint op een nieuw blad.
 *  `eersteBreedte` is smaller dan de rest wanneer de eerste kaart naast de lore-kaart staat. */
function referentieKaarten(ctx: Ctx, eersteBreedte: number, ruimte: number): Content[] {
  const m = ctx.m;
  type Item = { naam: string; bron: string; inhoud: Content[] };
  const items: Item[] = [];

  for (const r of ctx.appendix.values()) {
    items.push({ naam: strip(r.name), bron: bronLabel(r), inhoud: regelBody(r) });
  }
  for (const it of ctx.items.values()) {
    const inhoud: Content[] = [];
    if (it.flavour) inhoud.push({ text: it.flavour, italics: true, color: GRIJS });
    if (it.effect) inhoud.push({ text: it.effect });
    for (const p of it.profiel) inhoud.push({ text: p });
    if (!inhoud.length) continue;
    items.push({ naam: it.naam, bron: 'magic item', inhoud });
  }
  if (!items.length) return [];
  items.sort((a, b) => a.naam.localeCompare(b.naam));

  const blokjes: Content[] = items.map((it) => ({
    stack: [
      {
        stack: [
          {
            text: [
              { text: it.naam, bold: true, color: INK },
              ...(it.bron ? [{ text: `  ${it.bron}`, fontSize: m.p(9), color: GRIJS } as Content] : []),
            ],
            fontSize: m.p(10.5),
          },
          { stack: it.inhoud, fontSize: m.p(10.5), color: TEKST },
        ],
        margin: marge(0, m.p(4), 0, m.p(4)),
      },
      lijn(m.p(1), HAARLIJN),
    ],
    unbreakable: true,
  } as Content));

  const gap = m.p(14);
  const uit: Content[] = [];
  let rest = blokjes;
  let breedte = eersteBreedte;
  while (rest.length) {
    const kolBreedte = (breedte - gap) / 2;
    // 1,15: `schatHoogte` overschat een naslagblokje structureel met ruim tien procent (GEMETEN
    // 09-09 tegen de gerenderde pagina), dus mag het budget daar iets overheen. Wat overblijft is
    // ongeveer een tiende pagina lucht — goedkoper dan een kaart die over de paginarand valt.
    const budget = ruimte * 2 * 1.15;
    let op = 0;
    let n = 0;
    while (n < rest.length) {
      const h = schatHoogte(rest[n], kolBreedte, ctx.basis) * SCHATFACTOR;
      if (n > 0 && op + h > budget) break;
      op += h;
      n++;
    }
    uit.push(kaartInhoud(
      kaartKop(
        uit.length ? 'Special rules in this army · continued' : 'Special rules in this army',
        [{ text: 'Rules reference' }],
        null,
        m,
      ),
      [tweeKolommen(rest.slice(0, n), gap, breedte, ctx.basis)],
      m,
    ));
    rest = rest.slice(n);
    breedte = m.breedBinnen;
  }
  return uit;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Het document
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** De volledige PDF-documentdefinitie van een army list.
 *
 *  PUUR: geen pdfmake-runtime, geen DOM, geen fetch. Wie deze functie aanroept levert zelf de data en
 *  rendert zelf (in de browser `pdfDownload.ts`, in Node `scripts/pdf-preview.mjs`). */
export function armyToPdfDoc(input: PrintInput, opts: PrintOptions): TDocumentDefinitions {
  const m = maten(opts.compact);
  const basis = m.p(10.5);
  const ctx: Ctx = {
    rules: input.rules,
    idx: getRuleIndex(input.rules),
    faction: input.faction,
    appendix: new Map(),
    lores: new Map(),
    items: new Map(),
    opts,
    m,
    basis,
  };

  // ── Kop van pagina 1 ─────────────────────────────────────────────────────────────────────────
  const groepen = groepeer(input.army.units);
  const titel: Content = {
    stack: [
      labelRegel(`${input.meta.faction} · ${input.meta.composition} · ${input.meta.rule}`, ACCENT, m),
      {
        text: strip(input.meta.listName),
        font: 'Alegreya',
        fontSize: m.p(35),
        lineHeight: lhSerif(1),
        color: INK,
        margin: marge(0, m.p(5), 0, 0),
      },
    ],
  };

  const kopKolommen: Column[] = [titel];
  if (opts.points) {
    // De cijferkolommen worden BODEM-uitgelijnd in het ontwerp; pdfmake lijnt bovenaan uit, dus krijgt
    // elke kolom een berekende bovenmarge die hem op dezelfde onderlijn zet als de lijstnaam.
    const linksHoogte = m.p(9) * 1.35 + m.p(5) + m.p(35);
    const subHoogte = m.p(9) * 1.35 + m.p(18);
    const totHoogte = m.p(9) * 1.35 + m.p(28);
    for (const g of groepen) {
      const subtotaal = g.units.reduce((n, u) => n + (u.points ?? 0), 0);
      kopKolommen.push({
        width: 'auto',
        alignment: 'right',
        margin: marge(0, linksHoogte - subHoogte, 0, 0),
        stack: [
          labelRegel(g.label, GRIJS, m),
          { text: String(subtotaal), font: 'Alegreya', fontSize: m.p(18), lineHeight: lhSerif(1), color: INK },
        ],
      });
    }
    kopKolommen.push({
      width: 'auto',
      margin: marge(0, linksHoogte - totHoogte, 0, 0),
      table: {
        widths: ['auto'],
        body: [[{
          alignment: 'right',
          stack: [
            labelRegel('Total', ACCENT, m),
            {
              text: [
                { text: String(input.meta.total) },
                { text: `/${input.meta.cap}`, fontSize: m.p(13), color: GRIJS },
              ],
              font: 'Alegreya',
              fontSize: m.p(28),
              lineHeight: lhSerif(1),
              color: INK,
            },
          ],
        }]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i: number) => (i === 0 ? m.p(1) : 0),
        vLineColor: () => LIJN,
        paddingLeft: () => m.p(16),
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
    } as unknown as Column);
  }

  const content: Content[] = [{ columns: kopKolommen, columnGap: m.p(16), margin: marge(0, 0, 0, m.p(12)) }];

  // ── Het raster van unit-kaarten ──────────────────────────────────────────────────────────────
  // `opts.chapterPages` heeft in deze layout GEEN betekenis: er zijn geen hoofdstukkoppen meer (de
  // categorie staat op de kaart zelf), dus valt er ook niets per hoofdstuk af te breken. De optie
  // blijft in `PrintOptions` omdat printArmy.ts hem wél gebruikt.
  const kaarten: Content[] = [];
  for (const { label, units } of groepen) {
    for (const u of units) kaarten.push(unitKaart(u, label, input, ctx));
  }

  // ÉÉN TABEL PER RIJ, niet één tabel voor het hele raster. Zo bepaalt elke rij zijn eigen hoogte
  // (twee kaarten naast elkaar zijn even hoog, maar de rij eronder mag korter zijn) en verhuist een
  // rij die niet meer past in zijn geheel naar de volgende pagina.
  for (let i = 0; i < kaarten.length; i += 2) {
    content.push(kaartRij(kaarten[i], kaarten[i + 1] ?? null, m, i + 2 < kaarten.length));
  }

  // ── Naslagpagina: lore links, rules reference rechts ─────────────────────────────────────────
  const loreKaarten: Content[] = [];
  if (opts.lores) {
    const gesorteerd = [...ctx.lores.values()].sort((a, b) => a.lore.name.localeCompare(b.lore.name));
    for (const { lore, gekozen, wizards } of gesorteerd) {
      const k = loreKaart(lore, gekozen, wizards, input, ctx);
      if (k) loreKaarten.push(loreKaarten.length ? { ...(k as object), margin: marge(0, m.p(12), 0, 0) } as Content : k);
    }
  }
  // De naslagkaarten PAS hier bouwen: `ctx.appendix` en `ctx.items` zijn gevuld door de unit-kaarten
  // hierboven, en `loreKaart` voegt daar niets meer aan toe.
  // `ruimte` = wat er van een verse pagina overblijft onder de kaartkop, per kolom.
  const ruimte = m.bladHoogte - (m.p(9) * 1.35 + m.p(22) + m.p(9) * 2 + m.p(8) * 2 + m.p(2));
  const naslag = referentieKaarten(ctx, loreKaarten.length ? m.kaartBinnen : m.breedBinnen, ruimte);

  if (loreKaarten.length && naslag.length) {
    // Eén lore → hij vult de linkerkolom en krijgt de rand van de cel, dus even hoog als de naslag
    // ernaast. Meer lores → ze worden een stapeltje losse kaarten in die kolom, elk met een eigen
    // rand; ze zijn dan niet meer even hoog als de naslag, maar wél als los blok te lezen.
    const links: Content = loreKaarten.length === 1
      ? loreKaarten[0]
      : {
        stack: loreKaarten.map((k, i) => ({
          ...(omrand(k, m) as object),
          ...(i ? { margin: marge(0, m.gap, 0, 0) } : {}),
        }) as Content),
      };
    const rij = kaartRij(links, naslag[0], m) as ContentTable & { table: { dontBreakRows?: boolean } };
    // Deze rij MAG breken: de naslagbrok is op een volle pagina gemeten, dus hem in zijn geheel naar
    // de volgende pagina duwen zou een lege bladzij opleveren.
    rij.table.dontBreakRows = false;
    if (loreKaarten.length > 1) (rij.table.body[0][0] as { border?: unknown }).border = GEEN_RAND;
    content.push({ ...(rij as object), pageBreak: 'before' } as Content);
    // Elke vervolgbrok krijgt de VOLLE bladbreedte op een eigen pagina.
    for (const extra of naslag.slice(1)) {
      content.push({ ...(omrand(extra, m) as object), pageBreak: 'before' } as Content);
    }
  } else {
    // Geen wizard (of geen regels): de overgebleven kaarten krijgen de volle bladbreedte — de naslag
    // heeft daarbinnen zelf al twee kolommen, dus er gaat geen leesbaarheid verloren.
    const alles = [...loreKaarten, ...naslag];
    for (const k of alles) content.push({ ...(omrand(k, m) as object), pageBreak: 'before' } as Content);
  }

  const voetLinks = opts.points
    ? `${strip(input.meta.listName)} · ${input.meta.total} / ${input.meta.cap} pts`
    : strip(input.meta.listName);

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [m.marge, m.marge, m.marge, m.marge + m.voet],
    info: { title: strip(input.meta.listName), creator: 'Old World Companion' },
    defaultStyle: {
      font: 'SourceSans',
      fontSize: basis,
      lineHeight: lhSans(1.35),
      color: INK,
      // Lining + tabular cijfers: in de statline-kolommen moeten de getallen onder elkaar staan.
      fontFeatures: ['lnum', 'tnum'],
    },
    content,
    footer: (huidige: number, totaal: number): Content => ({
      margin: marge(m.marge, 0, m.marge, 0),
      stack: [
        lijn(m.p(1), LIJN, 0, m.p(8)),
        {
          columns: [
            {
              text: voetLinks.toUpperCase(),
              width: 'auto',
              fontSize: m.p(10),
              characterSpacing: m.p(10) * 0.08,
              bold: true,
              color: GRIJS,
              noWrap: true,
            },
            {
              text: 'Old World Companion',
              alignment: 'center',
              font: 'Alegreya',
              fontSize: m.p(11.5),
              lineHeight: lhSerif(1.35),
              characterSpacing: m.p(11.5) * 0.22,
              // Zacht: in het ontwerp is dit het goudaccent, dus neutraal hoort het grijs te zijn
              // en niet zwart — anders trekt de voettekst meer aandacht dan de lijst erboven.
              color: GRIJS,
            },
            {
              text: `${huidige} / ${totaal}`,
              width: 'auto',
              alignment: 'right',
              fontSize: m.p(10),
              characterSpacing: m.p(10) * 0.08,
              bold: true,
              color: GRIJS,
              noWrap: true,
            },
          ],
          columnGap: m.p(12),
        },
      ],
    }),
  };
}


