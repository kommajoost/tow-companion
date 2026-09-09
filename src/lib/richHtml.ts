// Een Contentful rich-text document als HTML-STRING, voor het printvenster.
//
// WAAROM NAAST RichText.tsx. `RichText` rendert dezelfde nodes als React, maar dat helpt niet in een
// print: `armyToPrintHtml` bouwt één zelfstandig HTML-document dat via `document.write` in een leeg
// venster belandt. Daar draait geen React, en er is ook geen app-CSS. Vandaar een tweede, kleine
// renderer die exact dezelfde nodes kent maar platte HTML teruggeeft.
//
// BEWUST GEEN REACT-IMPORT in dit bestand: het draait in het print-pad en wordt ook door de
// live-preview (een iframe met `srcDoc`) gebruikt. Alles wat hier binnenkomt is tekst uit de
// wiki-data en wordt ONVOORWAARDELIJK ge-escaped — geen enkele node levert rauwe HTML.
//
// Drie dingen zijn met opzet anders dan op het scherm:
//   • Een `hyperlink` wordt alleen zijn tekst. Een blauwe onderstreepte link op papier is een dode
//     letter; het adres erachter kun je toch niet aantikken.
//   • Een `embedded-entry-block` met een chart of een lore-spreukenlijst wordt alleen de NAAM. Een
//     Miscast-tabel hoort in het rulebook, niet vier keer in je legerlijst — en de spreuken van een
//     lore drukt `printArmy` zelf al af, volledig en op de juiste plek.
//   • Koppen worden klein: op een A4 vol units is een `h2` uit de wiki net zo groot als de lijstnaam.

import type { RichNode } from '../types';

const esc = (s: string): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** De marks van een text-node, in dezelfde volgorde als `applyMarks` in RichText.tsx. */
function applyMarks(value: string, marks?: { type: string }[]): string {
  let html = esc(value);
  if (!marks) return html;
  for (const m of marks) {
    switch (m.type) {
      case 'bold': html = `<strong>${html}</strong>`; break;
      case 'italic': html = `<em>${html}</em>`; break;
      case 'underline': html = `<u>${html}</u>`; break;
      case 'code': html = `<code>${html}</code>`; break;
      case 'superscript': html = `<sup>${html}</sup>`; break;
      case 'subscript': html = `<sub>${html}</sub>`; break;
      default: break;
    }
  }
  return html;
}

const kinderen = (nodes: RichNode[] | undefined): string =>
  (nodes ?? []).map((n) => richToHtml(n)).join('');

/** De zichtbare tekst van een node-boom, zonder opmaak. Voor een titel of een `title=`-attribuut. */
export function richToPlain(node: RichNode | null | undefined): string {
  if (!node) return '';
  if (node.nodeType === 'text') return node.value ?? '';
  return (node.content ?? []).map(richToPlain).join('');
}

/** Eén rich-text node (meestal het hele `document`) als veilige HTML-string. */
export function richToHtml(node: RichNode | null | undefined): string {
  if (!node) return '';
  switch (node.nodeType) {
    case 'document':
      return kinderen(node.content);

    case 'paragraph':
      return `<p>${kinderen(node.content)}</p>`;

    // Alle kopniveaus worden één klein kopje. Zie de kop van dit bestand: de wiki-hierarchie zegt
    // niets over de plek waar de tekst hier terechtkomt (onder een unit, of in de appendix).
    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
    case 'heading-4':
    case 'heading-5':
    case 'heading-6':
      return `<h4 class="rh-kop">${kinderen(node.content)}</h4>`;

    case 'unordered-list':
      return `<ul>${kinderen(node.content)}</ul>`;
    case 'ordered-list':
      return `<ol>${kinderen(node.content)}</ol>`;
    case 'list-item':
      return `<li>${kinderen(node.content)}</li>`;

    case 'blockquote':
      return `<blockquote>${kinderen(node.content)}</blockquote>`;

    case 'hr':
      return '<hr>';

    // Tabellen komen in regelteksten wél voor (een To-Hit-tabel binnen een regel) en zijn daar de
    // regel zelf — platgeslagen tot een reeks woorden zou de tekst onbruikbaar maken. Vandaar een
    // echte tabel, met de print-CSS uit `printArmy`.
    case 'table':
      return `<table class="rh-tab"><tbody>${kinderen(node.content)}</tbody></table>`;
    case 'table-row':
      return `<tr>${kinderen(node.content)}</tr>`;
    case 'table-header-cell':
      return `<th>${kinderen(node.content)}</th>`;
    case 'table-cell':
      return `<td>${kinderen(node.content)}</td>`;

    case 'text':
      return applyMarks(node.value ?? '', node.marks);

    // Papier heeft geen links: alleen de tekst.
    case 'hyperlink':
      return kinderen(node.content);

    // Een verwijzing naar een andere regel: cursief, zodat je ziet dat het een term is, maar zonder
    // de suggestie dat je erop kunt tikken.
    case 'entry-hyperlink':
    case 'embedded-entry-inline': {
      const zichtbaar = kinderen(node.content);
      const naam = node.data?.target?.fields?.name;
      if (zichtbaar.trim()) return `<em>${zichtbaar}</em>`;
      return naam ? `<em>${esc(naam)}</em>` : '';
    }

    // Een ingesloten blok: een chart, een lore-spreukenlijst, een wapenprofiel of een gewone
    // regelpagina. Op papier wordt het altijd alleen de naam — zie de kop van dit bestand.
    case 'embedded-entry-block': {
      const target = node.data?.target;
      const slug = target?.fields?.slug;
      const naam = target?.fields?.name ?? slug;
      if (!naam) return '';
      return `<p class="rh-verwijzing"><em>${esc(naam)}</em></p>`;
    }

    default:
      // Onbekend nodetype: de kinderen doorlopen, en anders de eigen tekstwaarde.
      if (node.content) return kinderen(node.content);
      return node.value ? esc(node.value) : '';
  }
}
