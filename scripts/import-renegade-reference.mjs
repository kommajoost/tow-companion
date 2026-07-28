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
const BLOCK = new Set(['p', 'table', 'ul', 'ol']);
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

function makeParagraph(node, styles) {
  const segments = cleanSegments(rawSegments(node, styles));
  return { type: 'paragraph', text: flattenText(segments), segments, changeKinds: changeKinds(segments) };
}

function makeList(node, styles) {
  const items = findDescendants(node, new Set(['li'])).map((item) => {
    const segments = cleanSegments(rawSegments(item, styles));
    return { text: flattenText(segments), segments, changeKinds: changeKinds(segments) };
  }).filter((item) => item.text);
  const segments = items.flatMap((item) => item.segments);
  return { type: 'list', ordered: node.tag === 'ol', items, text: items.map((item) => item.text).join(' • '), changeKinds: changeKinds(segments) };
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
  return {
    type: 'table',
    rows,
    text: rows.map((row) => row.map((cell) => cell.text).join(' | ')).join('\n'),
    changeKinds: changeKinds(segments),
  };
}

function collectBlocks(root, styles) {
  const blocks = [];
  const visit = (node) => {
    if (node.type !== 'element') return;
    if (BLOCK.has(node.tag)) {
      const block = node.tag === 'table' ? makeTable(node, styles) : node.tag === 'ul' || node.tag === 'ol' ? makeList(node, styles) : makeParagraph(node, styles);
      if (block.text) blocks.push(block);
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return blocks;
}

function isProfileTable(block) {
  if (block.type !== 'table' || block.rows.length < 2) return false;
  return block.rows.some((row) => {
    const labels = row.map((cell) => cell.text.trim());
    return labels.includes('M') && labels.includes('WS') && labels.includes('T') && labels.includes('Points');
  });
}

function profileName(block) {
  if (!isProfileTable(block)) return null;
  const first = block.rows[0]?.map((cell) => cell.text).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return first && first.length <= 100 ? first : null;
}

function paragraphIsBold(block) {
  const meaningful = block.segments.filter((segment) => segment.text.trim());
  return meaningful.length > 0 && meaningful.every((segment) => segment.bold);
}

function majorHeading(text, armyLabel) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (/Grand Army Composition List/i.test(normalized)) return 'Grand Army Composition List';
  // Contents entries carry a page number ("Lore of Naggaroth 26") and are not the actual heading.
  if (/\s\d+$/.test(normalized)) return null;
  if (new RegExp(`${armyLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} Special Rules`, 'i').test(normalized)) return `${armyLabel} Special Rules`;
  if (/^(Magic Items|Magic Weapons|Magic Armour|Talismans|Enchanted Items|Arcane Items|Magic Standards)$/i.test(normalized)) return normalized;
  if (/^(The )?Lore of\b/i.test(normalized)) return normalized;
  if (/\b(Profile|Profiles|FAQ|Army List)\b/i.test(normalized) && normalized.length < 90) return normalized;
  return null;
}

function decorateContexts(blocks, armyLabel) {
  let section = 'Front matter / change log';
  let heading = null;
  let profile = null;
  let grandArmySeen = 0;
  let mainStarted = false;

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const foundMajor = block.type === 'paragraph' ? majorHeading(block.text, armyLabel) : null;
    if (foundMajor === 'Grand Army Composition List') {
      grandArmySeen++;
      // The first occurrence is normally the contents/overview; the last is the actual army list.
      if (grandArmySeen >= 2) mainStarted = true;
    }
    if (foundMajor) {
      section = foundMajor;
      heading = null;
      profile = null;
    }

    const foundProfile = profileName(block);
    if (foundProfile) profile = foundProfile;

    if (block.type === 'paragraph' && block.text.length <= 100 && paragraphIsBold(block)) {
      heading = block.text;
    }

    block.id = `b${String(index + 1).padStart(4, '0')}`;
    block.scope = mainStarted ? 'army-list' : 'front-matter';
    block.context = { section, heading, profile };
  }
}

function countChangedSegments(blocks) {
  const result = { changed: 0, new: 0, todo: 0 };
  const count = (segments) => {
    for (const segment of segments) if (segment.change) result[segment.change]++;
  };
  for (const block of blocks) {
    if (block.type === 'paragraph') count(block.segments);
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
  decorateContexts(blocks, pack.label);

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
    },
    stats: {
      totalBlocks: blocks.length,
      changedBlocks: changedBlockIds.length,
      armyListChangedBlocks: armyListChangedBlockIds.length,
      changedSegments: segments.changed,
      newSegments: segments.new,
      todoSegments: segments.todo,
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
