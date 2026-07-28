// Turn the current Google Docs HTML exports for the Renegade V2 drafts into a complete,
// machine-readable audit source.
//
// Usage:
//   node scripts/import-renegade-reference.mjs <directory-with-google-doc-exports>
//
// Expected files:
//   dark-elves.html, skaven.html, ogre-kingdoms.html, chaos-dwarfs.html,
//   daemons-of-chaos.html and lizardmen.html
//
// Google Docs marks every difference from the official Legacy PDF in BLUE, every change
// since the previous Renegade draft in MAGENTA, and unfinished work in YELLOW. We retain
// the complete normalized document and annotate every text segment with that meaning.
// This deliberately does not try to guess how a sentence maps onto the OWB catalogue:
// the reference is the lossless input for that later implementation step.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceDir = process.argv[2];
if (!sourceDir) {
  console.error('usage: node scripts/import-renegade-reference.mjs <source-directory>');
  process.exit(1);
}

const PACKS = [
  {
    slug: 'dark-elves',
    comp: 'de-renegade-v2',
    label: 'Dark Elves',
    docId: '1DxVMfxgaDnemxkmqxatHZwGNv0i1rRoekbsmVKgmRmA',
  },
  {
    slug: 'skaven',
    comp: 'sk-renegade-v2',
    label: 'Skaven',
    docId: '1QAt19do6rdvZgE8E6wLxUBkxfLBwdWYncAiof01vFHQ',
  },
  {
    slug: 'ogre-kingdoms',
    comp: 'ok-renegade-v2',
    label: 'Ogre Kingdoms',
    docId: '1MaoPo4ytwOQLUdWPopfVpfBt7_qC_UZD6EX7xO6Ysag',
  },
  {
    slug: 'chaos-dwarfs',
    comp: 'cd-renegade-v2',
    label: 'Chaos Dwarfs',
    docId: '1ffg5nPSrhOhMSmX2vTs6_WXOCEwmxA5Hjwy8MdPFXS0',
  },
  {
    slug: 'daemons-of-chaos',
    comp: 'doc-renegade-v2',
    label: 'Daemons of Chaos',
    docId: '1PqK0inmbov-jpfeOoUq563v1IjsVNRShfnH_WM9mpYk',
  },
  {
    slug: 'lizardmen',
    comp: 'lm-renegade-v2',
    label: 'Lizardmen',
    docId: '10JbMnZzdadz5bT8WrTIcFzWilhbRWy-chHc6XLf9w4o',
  },
];

const OUTPUT_DIR = new URL('../public/renegade/', import.meta.url);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr']);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const BLOCK = new Set(['p', 'table', 'ul', 'ol', ...HEADING_TAGS]);
const CHANGE_COLORS = new Map([
  ['#0000ff', 'changed'],
  ['blue', 'changed'],
  ['#ff00ff', 'new'],
  ['magenta', 'new'],
]);
const TODO_COLORS = new Map([
  ['#ffff00', 'todo'],
  ['yellow', 'todo'],
]);

function decodeHtml(value) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    hellip: '…',
    ldquo: '“',
    lsquo: '‘',
    lt: '<',
    mdash: '—',
    nbsp: ' ',
    ndash: '–',
    quot: '"',
    rdquo: '”',
    rsquo: '’',
    times: '×',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? all;
    const hex = entity[1].toLowerCase() === 'x';
    const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : all;
  });
}

function parseAttributes(raw) {
  const attributes = {};
  for (const match of raw.matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

// A small, tolerant HTML tree builder. Google Docs exports static, balanced HTML and do not
// need a browser-sized parser; keeping this importer dependency-free makes weekly reruns cheap.
function parseHtml(html) {
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const body = bodyMatch ? bodyMatch[1] : html;
  const root = { type: 'element', tag: 'root', attrs: {}, children: [] };
  const stack = [root];
  const tokens = body.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[^>]+>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<!')) continue;
    if (!token.startsWith('<')) {
      stack.at(-1).children.push({ type: 'text', value: decodeHtml(token) });
      continue;
    }
    if (/^<\//.test(token)) {
      const closing = (token.match(/^<\/\s*([^\s>]+)/) ?? [])[1]?.toLowerCase();
      while (stack.length > 1) {
        const node = stack.pop();
        if (node.tag === closing) break;
      }
      continue;
    }
    const open = /^<\s*([^\s/>]+)([\s\S]*?)\/?>$/.exec(token);
    if (!open) continue;
    const tag = open[1].toLowerCase();
    const node = { type: 'element', tag, attrs: parseAttributes(open[2]), children: [] };
    stack.at(-1).children.push(node);
    if (!VOID.has(tag) && !/\/>$/.test(token)) stack.push(node);
  }
  return root;
}

function cssClassStyles(html) {
  const styles = new Map();
  const styleText = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  for (const rule of styleText.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
    const declarations = {};
    for (const declaration of rule[2].split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0) continue;
      declarations[declaration.slice(0, colon).trim().toLowerCase()] = declaration.slice(colon + 1).trim().toLowerCase();
    }
    styles.set(rule[1], declarations);
  }
  return styles;
}

function nodeStyle(node, styles) {
  const merged = {};
  for (const className of String(node.attrs?.class ?? '').split(/\s+/).filter(Boolean)) {
    Object.assign(merged, styles.get(className) ?? {});
  }
  for (const declaration of String(node.attrs?.style ?? '').split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    merged[declaration.slice(0, colon).trim().toLowerCase()] = declaration.slice(colon + 1).trim().toLowerCase();
  }
  return merged;
}

function inheritedFormat(node, styles, parent) {
  const style = nodeStyle(node, styles);
  const color = style.color?.replace(/\s*!important$/, '');
  const background = style['background-color']?.replace(/\s*!important$/, '');
  const change = CHANGE_COLORS.get(color) ?? TODO_COLORS.get(background) ?? parent.change ?? null;
  const bold = node.tag === 'b' || node.tag === 'strong' || Number.parseInt(style['font-weight'], 10) >= 600 || parent.bold;
  const italic = node.tag === 'i' || node.tag === 'em' || style['font-style'] === 'italic' || parent.italic;
  return { change, bold: Boolean(bold), italic: Boolean(italic) };
}

function rawSegments(node, styles, inherited = { change: null, bold: false, italic: false }, result = []) {
  if (node.type === 'text') {
    result.push({ text: node.value, ...inherited });
    return result;
  }
  const own = inheritedFormat(node, styles, inherited);
  if (node.tag === 'br') {
    result.push({ text: '\n', ...own });
    return result;
  }
  for (const child of node.children ?? []) rawSegments(child, styles, own, result);
  if (['p', 'li'].includes(node.tag)) result.push({ text: '\n', ...own });
  return result;
}

function cleanSegments(input) {
  const output = [];
  for (const segment of input) {
    const text = segment.text
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t\r\f\v]+/g, ' ')
      .replace(/ *\n+ */g, '\n');
    if (!text) continue;
    const previous = output.at(-1);
    if (previous && previous.change === segment.change && previous.bold === segment.bold && previous.italic === segment.italic) {
      previous.text += text;
    } else {
      output.push({ text, change: segment.change, bold: segment.bold, italic: segment.italic });
    }
  }
  if (!output.length) return [];
  output[0].text = output[0].text.replace(/^[\s\n]+/, '');
  output.at(-1).text = output.at(-1).text.replace(/[\s\n]+$/, '');
  return output.filter((segment) => segment.text);
}

const flattenText = (segments) => segments.map((segment) => segment.text).join('').replace(/\s+/g, ' ').trim();
const changeKinds = (segments) => [...new Set(segments.map((segment) => segment.change).filter(Boolean))];

function findDescendants(node, tags, result = []) {
  if (node.type !== 'element') return result;
  if (tags.has(node.tag)) result.push(node);
  for (const child of node.children ?? []) findDescendants(child, tags, result);
  return result;
}

function pointsMentions(text) {
  const mentions = [];
  for (const match of text.matchAll(/(?<![\d,])([+-]?\d+)\s*points?(?:\s*per\s*(model|unit))?/gi)) {
    mentions.push({
      raw: match[0],
      value: Number.parseInt(match[1], 10),
      modifier: /^[+-]/.test(match[1]),
      basis: match[2] ? `per-${match[2].toLowerCase()}` : 'fixed',
    });
  }
  return mentions;
}

function fontSizePt(value) {
  const match = /^([\d.]+)(pt|px)?$/i.exec(String(value ?? '').trim());
  if (!match) return null;
  const numeric = Number.parseFloat(match[1]);
  return match[2]?.toLowerCase() === 'px' ? numeric * 0.75 : numeric;
}

function maximumFontSize(node, styles) {
  if (node.type !== 'element') return 0;
  const own = fontSizePt(nodeStyle(node, styles)['font-size']) ?? 0;
  return Math.max(own, ...(node.children ?? []).map((child) => maximumFontSize(child, styles)), 0);
}

function visualHeadingLevel(node, styles, segments) {
  if (node.tag !== 'p') return null;
  const meaningful = segments.filter((segment) => segment.text.trim());
  if (!meaningful.length || !meaningful.every((segment) => segment.bold)) return null;
  const text = flattenText(segments);
  if (!text || text.length > 120) return null;
  // These are entry fields, not document headings. Treating them as headings made the active path
  // jump to "Options:" or an entire Special Rules sentence and detached the following blocks from
  // their unit.
  if (/^(unit size|troop type|base size|armour value|equipment|options|special rules|notes?|character mount)\s*:/i.test(text)) {
    return null;
  }
  const size = maximumFontSize(node, styles);
  if (size < 10) return null;
  if (size >= 18) return 1;
  if (size >= 12) return 2;
  return 3;
}

function makeParagraph(node, styles) {
  const segments = cleanSegments(rawSegments(node, styles));
  const text = flattenText(segments);
  return {
    type: 'paragraph',
    text,
    segments,
    changeKinds: changeKinds(segments),
    pointsMentions: pointsMentions(text),
    visualHeadingLevel: visualHeadingLevel(node, styles, segments),
  };
}

function makeHeading(node, styles) {
  const segments = cleanSegments(rawSegments(node, styles));
  const text = flattenText(segments);
  return {
    type: 'heading',
    level: Number.parseInt(node.tag.slice(1), 10),
    text,
    segments,
    changeKinds: changeKinds(segments),
    pointsMentions: pointsMentions(text),
  };
}

function makeList(node, styles) {
  const items = findDescendants(node, new Set(['li'])).map((item) => {
    const segments = cleanSegments(rawSegments(item, styles));
    const text = flattenText(segments);
    return { text, segments, changeKinds: changeKinds(segments), pointsMentions: pointsMentions(text) };
  }).filter((item) => item.text);
  const segments = items.flatMap((item) => item.segments);
  const text = items.map((item) => item.text).join(' • ');
  return {
    type: 'list',
    ordered: node.tag === 'ol',
    items,
    text,
    changeKinds: changeKinds(segments),
    pointsMentions: items.flatMap((item) => item.pointsMentions),
  };
}

function headerTokens(row) {
  return new Set(row.flatMap((cell) => cell.text.match(/[A-Za-z]+/g) ?? []).map((token) => token.toUpperCase()));
}

function classifyTable(rows) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const tokens = headerTokens(rows[rowIndex]);
    if (['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'LD', 'POINTS'].every((token) => tokens.has(token))) {
      return { tableType: 'statline', headerRowIndex: rowIndex };
    }
    if (['R', 'S', 'AP', 'SPECIAL', 'RULES'].every((token) => tokens.has(token))) {
      return { tableType: 'weapon-profile', headerRowIndex: rowIndex };
    }
  }
  return { tableType: 'other', headerRowIndex: null };
}

function makeTable(node, styles) {
  const rows = findDescendants(node, new Set(['tr'])).map((row) =>
    (row.children ?? []).filter((child) => child.type === 'element' && ['td', 'th'].includes(child.tag)).map((cell) => {
      const segments = cleanSegments(rawSegments(cell, styles));
      return {
        text: flattenText(segments),
        segments,
        changeKinds: changeKinds(segments),
        colspan: Number.parseInt(cell.attrs.colspan ?? '1', 10),
        rowspan: Number.parseInt(cell.attrs.rowspan ?? '1', 10),
      };
    }),
  ).filter((row) => row.length);
  const segments = rows.flatMap((row) => row.flatMap((cell) => cell.segments));
  const classification = classifyTable(rows);
  return {
    type: 'table',
    rows,
    text: rows.map((row) => row.map((cell) => cell.text).join(' | ')).join('\n'),
    changeKinds: changeKinds(segments),
    ...classification,
  };
}

function collectBlocks(root, styles) {
  const blocks = [];
  const visit = (node) => {
    if (node.type !== 'element') return;
    if (BLOCK.has(node.tag)) {
      const block = HEADING_TAGS.has(node.tag)
        ? makeHeading(node, styles)
        : node.tag === 'table'
          ? makeTable(node, styles)
          : node.tag === 'ul' || node.tag === 'ol'
            ? makeList(node, styles)
            : makeParagraph(node, styles);
      if (block.text) blocks.push(block);
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return blocks;
}

function decorateContexts(blocks) {
  let headings = [];
  let mainStarted = false;
  let blockIndex = 0;
  let headingIndex = 0;

  for (const block of blocks) {
    const level = block.type === 'heading' ? block.level : block.visualHeadingLevel;
    if (level) {
      headings = headings.filter((entry) => entry.level < level);
      headings.push({ level, text: block.text, source: block.type === 'heading' ? 'docs-heading' : 'visual-heading' });
      if (/^Grand Army Composition List$/i.test(block.text)) mainStarted = true;
    }

    if (block.type === 'heading') {
      headingIndex++;
      block.id = `h${String(headingIndex).padStart(4, '0')}`;
    } else {
      blockIndex++;
      block.id = `b${String(blockIndex).padStart(4, '0')}`;
    }
    block.scope = mainStarted ? 'army-list' : 'front-matter';
    block.headingPath = headings.map((entry) => entry.text);
    block.headingPathDetail = headings.map((entry) => ({ ...entry }));
    const h1 = [...headings].reverse().find((entry) => entry.level === 1)?.text ?? 'Front matter / change log';
    const h2 = [...headings].reverse().find((entry) => entry.level === 2)?.text ?? null;
    const deepest = headings.at(-1)?.text ?? null;
    block.context = {
      section: h1,
      heading: deepest,
      profile: h2,
    };
  }
}

function parseUnitSize(text) {
  const match = /^Unit Size:\s*(\d+)(\+)?/i.exec(text);
  if (!match) return null;
  return { raw: match[0].replace(/^Unit Size:\s*/i, ''), minimum: Number.parseInt(match[1], 10), openEnded: Boolean(match[2]) };
}

function annotateStatlineTables(blocks) {
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const table = blocks[blockIndex];
    if (table.type !== 'table' || table.tableType !== 'statline') continue;

    let unitSize = null;
    for (let nextIndex = blockIndex + 1; nextIndex < blocks.length; nextIndex++) {
      const next = blocks[nextIndex];
      const nextHeadingLevel = next.type === 'heading' ? next.level : next.visualHeadingLevel;
      if (nextHeadingLevel && nextHeadingLevel <= 2) break;
      if (next.type === 'paragraph' || next.type === 'heading') {
        unitSize = parseUnitSize(next.text);
        if (unitSize) break;
      }
    }
    table.unitSize = unitSize;
    const multiModelUnit = Boolean(unitSize?.openEnded || (unitSize?.minimum ?? 0) > 1);
    table.pointsBasis = unitSize && !multiModelUnit ? 'per-unit' : 'per-model';

    if (table.headerRowIndex > 0) {
      const title = table.rows
        .slice(0, table.headerRowIndex)
        .flatMap((row) => row.map((cell) => cell.text).filter(Boolean))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (title && title.length <= 120) {
        table.tableHeading = title;
        const rootHeading = table.headingPathDetail.find((entry) => entry.level === 1);
        table.headingPath = [rootHeading?.text, title].filter(Boolean);
        table.headingPathDetail = [
          ...(rootHeading ? [rootHeading] : []),
          { level: 2, text: title, source: 'table-title' },
        ];
        table.context = {
          section: rootHeading?.text ?? table.context.section,
          heading: title,
          profile: title,
        };
      }
    }

    const statlineRows = [];
    let hasBasePoints = false;
    for (let rowIndex = table.headerRowIndex; rowIndex < table.rows.length; rowIndex++) {
      const row = table.rows[rowIndex];
      const name = row[0]?.text.trim() ?? '';
      const pointsCellText = [...row].reverse().find((cell) => cell.text.trim())?.text.trim() ?? '';
      const raw = (pointsCellText.match(/(?:^|\s)(\+\d+|\d+|-)$/) ?? [])[1] ?? '';
      if (!name || /^(model|name)$/i.test(name) || !(raw === '-' || /^[-+]?\d+$/.test(raw))) continue;

      let role;
      let basis;
      if (/^\+\d+$/.test(raw)) {
        role = hasBasePoints ? 'champion' : 'mount';
        basis = hasBasePoints ? 'per-unit' : 'per-model';
      } else if (raw === '-') {
        role = 'crew-or-mount';
        basis = 'included';
      } else {
        role = multiModelUnit ? (hasBasePoints ? 'alternate-profile' : 'rank-and-file') : 'base-model';
        basis = table.pointsBasis;
        hasBasePoints = true;
      }

      statlineRows.push({
        rowIndex,
        name,
        role,
        points: {
          raw,
          value: raw === '-' ? null : Number.parseInt(raw.replace(/^\+/, ''), 10),
          modifier: raw.startsWith('+'),
          basis,
        },
      });
    }
    table.statlineRows = statlineRows;
  }
}

function entryKind(block) {
  if (block.tableType === 'statline') return 'statline';
  if (block.tableType === 'weapon-profile') return 'weapon-profile';
  if (/^Unit Size:/i.test(block.text)) return 'unit-size';
  if (/^Troop Type:/i.test(block.text)) return 'troop-type';
  if (/^Base Size:/i.test(block.text)) return 'base-size';
  if (/^Armour Value:/i.test(block.text)) return 'armour-value';
  if (/^Equipment:/i.test(block.text)) return 'equipment';
  if (/^Special Rules(?:\s*\([^)]*\))?:/i.test(block.text)) return 'special-rules';
  if (/\+\s*\d+\s*points?/i.test(block.text)) return 'option';
  return block.type;
}

/** Add semantic unit ownership without rewriting the lossless Docs heading hierarchy.
 *
 * A statline starts an army-list entry. Every following table, option paragraph and rule belongs to
 * that entry until the next statline starts. This mirrors how the pack is read and, crucially,
 * separates equal profile names used in different entries (for example Bloodletter rank-and-file
 * versus the Bloodletter profile inside a Herald entry).
 */
function annotateUnitContexts(blocks) {
  let current = null;
  for (const block of blocks) {
    if (block.scope !== 'army-list') {
      block.unitContext = null;
      block.entryKind = entryKind(block);
      continue;
    }
    if (block.tableType === 'statline') {
      const deepestHeading = [...(block.headingPath ?? [])].reverse().find(Boolean) ?? null;
      const title = block.tableHeading ?? deepestHeading;
      current = title ? {
        name: title,
        sourceBlockId: block.id,
        method: block.tableHeading ? 'table-title' : 'preceding-heading',
        confidence: block.tableHeading ? 'high' : 'medium',
        profileNames: (block.statlineRows ?? []).map((row) => row.name),
      } : null;
    }
    block.unitContext = current ? { ...current, profileNames: [...current.profileNames] } : null;
    block.unitId = null;
    block.entryKind = entryKind(block);
    block.contextConfidence = current?.confidence ?? 'none';
  }
}

function countChangedSegments(blocks) {
  const result = { changed: 0, new: 0, todo: 0 };
  const count = (segments) => {
    for (const segment of segments) if (segment.change) result[segment.change]++;
  };
  for (const block of blocks) {
    if (block.type === 'paragraph' || block.type === 'heading') count(block.segments);
    if (block.type === 'list') for (const item of block.items) count(item.segments);
    if (block.type === 'table') for (const row of block.rows) for (const cell of row) count(cell.segments);
  }
  return result;
}

for (const pack of PACKS) {
  const sourcePath = resolve(sourceDir, `${pack.slug}.html`);
  const html = readFileSync(sourcePath, 'utf8');
  const styles = cssClassStyles(html);
  const root = parseHtml(html);
  const blocks = collectBlocks(root, styles);
  decorateContexts(blocks);
  annotateStatlineTables(blocks);
  annotateUnitContexts(blocks);

  const version = (flattenText(blocks.slice(0, 15).flatMap((block) =>
    block.type === 'paragraph' ? block.segments : [],
  )).match(/DRAFT\s+V([\d.]+)/i) ?? [])[1] ?? null;
  const changedBlockIds = blocks.filter((block) => block.changeKinds.length).map((block) => block.id);
  const armyListChangedBlockIds = blocks
    .filter((block) => block.scope === 'army-list' && block.changeKinds.length)
    .map((block) => block.id);
  const segments = countChangedSegments(blocks);
  const reference = {
    id: `${pack.comp}-reference`,
    schemaVersion: 3,
    army: pack.slug,
    label: pack.label,
    version,
    source: {
      name: `${pack.label} Renegade Army List`,
      url: `https://docs.google.com/document/d/${pack.docId}/edit`,
      indexUrl: 'https://docs.google.com/document/d/16kAE-p_CWbsH0XatDPuRao6TngSw-KSweUnJa81kOXE/edit',
      author: 'Square Based',
      official: false,
    },
    legend: {
      changed: 'Differs from the official Legacy PDF (blue in the source)',
      new: 'Changed since the previous Renegade draft (magenta in the source)',
      todo: 'Incomplete or in development (yellow in the source)',
      headingPath: 'Active Google Docs heading hierarchy for this block, from broadest to most specific',
      unitContext: 'Semantic army-list entry propagated from a statline table until the next statline',
      unitId: 'Intentionally null in the lossless reference; catalogue mapping belongs to the compiler manifest',
      entryKind: 'Semantic block kind such as statline, option, special-rules or weapon-profile',
      tableType: {
        statline: 'Header contains M/WS/BS/S/T/W/I/A/Ld/Points',
        'weapon-profile': 'Header contains R/S/AP/Special Rules',
        other: 'Table does not match either profile signature',
      },
      statlineRole: {
        'rank-and-file': 'Primary model in a multi-model unit',
        champion: 'Per-unit upgraded model; Points is a +N modifier',
        'base-model': 'Primary model in a single-model unit or character entry',
        'alternate-profile': 'Additional separately priced base profile in the same entry',
        mount: 'Mount profile with a +N modifier and no base model row in the table',
        'crew-or-mount': 'Included supporting profile; the source Points cell is "-"',
      },
      pointsBasis: {
        'per-model': 'Cost applies to each model',
        'per-unit': 'Cost applies once to the unit',
        included: 'No separate cost; included in another profile',
        fixed: 'Fixed cost where the source does not say per model or per unit',
      },
    },
    stats: {
      totalBlocks: blocks.length,
      changedBlocks: changedBlockIds.length,
      armyListChangedBlocks: armyListChangedBlockIds.length,
      changedSegments: segments.changed,
      newSegments: segments.new,
      todoSegments: segments.todo,
      statlineTables: blocks.filter((block) => block.tableType === 'statline').length,
      weaponProfileTables: blocks.filter((block) => block.tableType === 'weapon-profile').length,
    },
    changedBlockIds,
    armyListChangedBlockIds,
    blocks,
  };

  const outputPath = new URL(`${pack.comp}-reference.json`, OUTPUT_DIR);
  writeFileSync(outputPath, `${JSON.stringify(reference, null, 2)}\n`);
  console.error(
    `${pack.label.padEnd(18)} V${version ?? '?'}: ${blocks.length} blocks, ` +
    `${changedBlockIds.length} highlighted (${armyListChangedBlockIds.length} army-list), ` +
    `${segments.changed} blue / ${segments.new} magenta / ${segments.todo} yellow segments`,
  );
}
