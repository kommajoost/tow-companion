// Scraper for the Warhammer: The Old World rules wiki (https://tow.whfb.app).
//
// The wiki is a Next.js + Contentful site. Every page embeds a __NEXT_DATA__ JSON
// blob containing the rule text as a Contentful rich-text document. We keep the
// rich-text bodies VERBATIM (no translation, no summarising) and build a single
// public/rules.json bundled with the app for offline use.
//
// Data model of the wiki (verified):
//   * A top-level SECTION lives at  /<section>            (e.g. /the-combat-phase)
//     and exposes `pageProps.entries`: a FLAT, ordered list of all its sub-rules.
//   * Each sub-rule lives at         /<section>/<subSlug> (e.g. /the-combat-phase/base-contact)
//     and carries its own full `body`.
//
// Run with:  npm run scrape

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public');
const OUT_FILE = join(OUT_DIR, 'rules.json');

const BASE = 'https://tow.whfb.app';
const CONCURRENCY = 8;
const DELAY_MS = 80;
const UA = 'tow-companion-scraper/1.0 (personal study app)';

// Top-level sections (the wiki's table of contents). Order here is only a fallback;
// the real ordering comes from each page's `order` field.
const SECTIONS = [
  // Core rules
  'overview-of-the-game', 'general-principles', 'model-profiles', 'forming-units',
  'removing-casualties', 'model-and-unit-facing', 'troop-types-at-a-glance',
  // Magic
  'magic', 'the-lores-of-magic', 'magic-items',
  // The turn
  'the-turn-sequence', 'the-strategy-phase', 'the-movement-phase', 'movement-in-detail',
  'the-shooting-phase', 'the-combat-phase',
  // Supporting rules
  'the-psychology-of-war', 'special-rules', 'unusual-formations', 'troop-types-in-detail',
  'command-groups', 'characters', 'weapons-of-war', 'war-machines', 'battlefield-terrain',
  // Playing the game
  'warhammer-armies', 'warhammer-battles', 'campaign-battles', 'narrative-battles',
  'matched-play', 'quick-reference',
];

// The phases that make up a single player turn, in order. Their sub-rules become the
// ordered list of steps the player walks through during a game.
const PHASE_SLUGS = [
  'the-strategy-phase',
  'the-movement-phase',
  'the-shooting-phase',
  'the-combat-phase',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractNextData(html) {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

async function getPage(path, attempt = 1) {
  try {
    const res = await fetch(`${BASE}/${path}`, { headers: { 'User-Agent': UA } });
    if (res.status === 404) return { status: 404, data: null };
    if (!res.ok) {
      if (attempt < 4) {
        await sleep(600 * attempt);
        return getPage(path, attempt + 1);
      }
      return { status: res.status, data: null };
    }
    return { status: 200, data: extractNextData(await res.text()) };
  } catch (err) {
    if (attempt < 4) {
      await sleep(600 * attempt);
      return getPage(path, attempt + 1);
    }
    return { status: 0, data: null, error: String(err) };
  }
}

// Like getPage, but also returns the raw HTML. The magic-lore pages render their spell
// list only in server HTML (the `magicLore.rule` array is circular-stripped from
// __NEXT_DATA__), so we parse the `.spell-list` markup to learn each lore's spells.
async function getPageRaw(path, attempt = 1) {
  try {
    const res = await fetch(`${BASE}/${path}`, { headers: { 'User-Agent': UA } });
    if (res.status === 404) return { status: 404, html: '', data: null };
    if (!res.ok) {
      if (attempt < 4) {
        await sleep(600 * attempt);
        return getPageRaw(path, attempt + 1);
      }
      return { status: res.status, html: '', data: null };
    }
    const html = await res.text();
    return { status: 200, html, data: extractNextData(html) };
  } catch (err) {
    if (attempt < 4) {
      await sleep(600 * attempt);
      return getPageRaw(path, attempt + 1);
    }
    return { status: 0, html: '', data: null, error: String(err) };
  }
}

// The wiki embeds the FULL body of every link target inline. Keeping those would
// bloat rules.json and duplicate content, so we slim each linked/embedded entry's
// `target` down to { sys.id, fields: { slug, name } } and resolve the full text from
// the top-level `rules` map at render time.
//
// BUT: some referenced rules (e.g. chart pages, magic lores) are only ever reached
// via links and are never crawled as their own page. To keep their pop-ups working we
// "harvest" the embedded body the first time we see it, storing it in `linkBodies`.
// Crawled pages always take precedence over harvested ones.
const linkBodies = {};
const harvested = new Set();

const contentTypeId = (t) =>
  (t.sys && t.sys.contentType && t.sys.contentType.sys && t.sys.contentType.sys.id) ||
  null;

// Convert a `chart` field ({ rows: string[][], hasHeaderRow, hasHeaderColumn }) into
// a Contentful-style rich-text table so the app renderer can show it like any table.
function chartToBody(chart) {
  const rows = Array.isArray(chart.rows) ? chart.rows : [];
  const cell = (text, header) => ({
    nodeType: header ? 'table-header-cell' : 'table-cell',
    data: {},
    content: [
      {
        nodeType: 'paragraph',
        data: {},
        content: [
          { nodeType: 'text', value: String(text ?? ''), marks: header ? [{ type: 'bold' }] : [], data: {} },
        ],
      },
    ],
  });
  return {
    nodeType: 'document',
    data: {},
    content: [
      {
        nodeType: 'table',
        data: {},
        content: rows.map((row, ri) => ({
          nodeType: 'table-row',
          data: {},
          content: row.map((c, ci) =>
            cell(c, (chart.hasHeaderRow && ri === 0) || (chart.hasHeaderColumn && ci === 0)),
          ),
        })),
      },
    ],
  };
}

// Convert a `weaponProfile` entry (range/strength/armourPiercing + a `specialRules`
// rich-text doc) into a small two-row table so it renders inline like any profile.
function weaponProfileToBody(f) {
  const headerCell = (text) => ({
    nodeType: 'table-header-cell',
    data: {},
    content: [{ nodeType: 'paragraph', data: {}, content: [{ nodeType: 'text', value: text, marks: [{ type: 'bold' }], data: {} }] }],
  });
  const cell = (content) => ({ nodeType: 'table-cell', data: {}, content });
  const textPara = (v) => [{ nodeType: 'paragraph', data: {}, content: [{ nodeType: 'text', value: String(v ?? '-'), marks: [], data: {} }] }];
  // The specialRules field is itself a rich-text document; pull its top-level content
  // (paragraphs with inline links) straight into a cell so the links stay tappable.
  const srContent =
    f.specialRules && Array.isArray(f.specialRules.content) && f.specialRules.content.length
      ? f.specialRules.content
      : textPara('-');
  return {
    nodeType: 'document',
    data: {},
    content: [
      {
        nodeType: 'table',
        data: {},
        content: [
          { nodeType: 'table-row', data: {}, content: [headerCell('R'), headerCell('S'), headerCell('AP'), headerCell('Special Rules')] },
          {
            nodeType: 'table-row',
            data: {},
            content: [cell(textPara(f.range)), cell(textPara(f.strength)), cell(textPara(f.armourPiercing)), cell(srContent)],
          },
        ],
      },
    ],
  };
}

// Charts store their data in `richText` or in a `chart` field; weapon profiles in
// dedicated stat fields; rules use `body`.
function targetDoc(t) {
  if (t.fields.body) return t.fields.body;
  if (t.fields.richText) return t.fields.richText;
  if (t.fields.chart && Array.isArray(t.fields.chart.rows)) return chartToBody(t.fields.chart);
  if (contentTypeId(t) === 'weaponProfile') return weaponProfileToBody(t.fields);
  return null;
}

function harvestTarget(t) {
  const slug = t.fields.slug;
  if (harvested.has(slug)) return;
  const doc = targetDoc(t);
  if (!doc) return;
  harvested.add(slug);
  const clone = structuredClone(doc);
  const refs = new Set();
  slimBodyAndCollectRefs(clone, refs); // also harvests deeper targets
  const chartText =
    t.fields.chart && Array.isArray(t.fields.chart.rows)
      ? t.fields.chart.rows.map((r) => r.join(' ')).join(' ')
      : '';
  linkBodies[slug] = {
    name: t.fields.name || slug,
    bodyIndex: t.fields.bodyIndex || chartText,
    body: clone,
    refs: [...refs],
  };
}

function slimBodyAndCollectRefs(node, refs) {
  if (!node || typeof node !== 'object') return;
  const t = node.data && node.data.target;
  if (t && t.fields && t.fields.slug) {
    refs.add(t.fields.slug);
    if (targetDoc(t)) harvestTarget(t);
    node.data.target = {
      sys: { id: t.sys && t.sys.id, type: 'Link', linkType: 'Entry' },
      fields: { slug: t.fields.slug, name: t.fields.name },
      // Lets the renderer show charts inline instead of as a tappable term.
      kind: contentTypeId(t),
    };
  }
  if (Array.isArray(node.content)) {
    for (const c of node.content) slimBodyAndCollectRefs(c, refs);
  }
}

function entrySlugs(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((e) => e && e.fields && e.fields.slug).filter(Boolean);
}

function crossRefSlugs(cr) {
  const rules = cr && cr.rule;
  if (!Array.isArray(rules)) return [];
  return rules.map((r) => r && r.fields && r.fields.slug).filter(Boolean);
}

const rules = {};

function record(slug, data, parentSlug) {
  const pp = data && data.props && data.props.pageProps;
  const entry = pp && pp.entry;
  if (!entry || !entry.fields || !entry.fields.slug) return null;
  const f = entry.fields;
  if (f.slug !== slug) {
    // The page resolved to a different entry (e.g. a 404 fallback); ignore.
    return null;
  }

  const refs = new Set();
  if (f.body) slimBodyAndCollectRefs(f.body, refs);

  rules[slug] = {
    slug,
    name: f.name || slug,
    order: typeof f.order === 'number' ? f.order : null,
    pageReference: typeof f.pageReference === 'number' ? f.pageReference : null,
    parentSlug: parentSlug || null,
    body: f.body || null,
    bodyIndex: f.bodyIndex || '',
    childSlugs: entrySlugs(pp.entries),
    prevSlug: pp.prev && pp.prev.fields ? pp.prev.fields.slug : null,
    nextSlug: pp.next && pp.next.fields ? pp.next.fields.slug : null,
    crossRefSlugs: crossRefSlugs(pp.crossReference),
    refSlugs: [...refs],
  };
  return rules[slug];
}

async function crawlSection(section) {
  const { status, data } = await getPage(section);
  if (!data) {
    console.warn(`  ! section ${section} -> ${status}`);
    return;
  }
  const rec = record(section, data, null);
  if (!rec) {
    console.warn(`  ! section ${section} produced no entry`);
    return;
  }
  const children = rec.childSlugs.filter((s) => s && !rules[s]);
  let done = 0;
  for (let i = 0; i < children.length; i += CONCURRENCY) {
    const chunk = children.slice(i, i + CONCURRENCY).filter((s) => !rules[s]);
    await Promise.all(
      chunk.map(async (child) => {
        const r = await getPage(`${section}/${child}`);
        if (r.data) record(child, r.data, section);
        else if (r.status !== 404) console.warn(`  ! ${section}/${child} -> ${r.status}`);
      }),
    );
    done += chunk.length;
    await sleep(DELAY_MS);
    process.stdout.write(
      `\r  ${section}: ${done}/${children.length} sub-rules   `,
    );
  }
  if (children.length) process.stdout.write('\n');
}

// ──────────────────────────── Magic lores & spells ────────────────────────────
// Each Lore of Magic lists its spells on its page (e.g. /the-lores-of-magic/battle-magic).
// A "full" lore has 7 spells (a signature + six numbered 1-6); army-specific lores list a
// couple of extra signature spells a Wizard may swap in. Every spell has its own page at
// /spell/<slug> (content-type `spell`) with a verbatim body (Type/Casting Value/Range +
// effect). We crawl those and store each as a rule keyed `spell-<slug>` (namespaced to
// avoid collisions with same-named rules, e.g. the spell "Devolve" vs the rule "Devolve"),
// plus a `lores` index mapping each lore to its ordered spell list.
const LORES_SECTION = 'the-lores-of-magic';
// Matches the spell-list header anchors on a lore page (and nothing else on the page).
const SPELL_NAME_RE = /<span class="spell__name"><a href="\/spell\/([a-z0-9-]+)">([^<]+)<\/a>/g;
const decodeEntities = (s) =>
  s
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();

const spellRuleKey = (slug) => `spell-${slug}`;

function plainText(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (typeof node.value === 'string') out.push(node.value);
  if (Array.isArray(node.content)) for (const c of node.content) plainText(c, out);
  return out;
}

// The flavour text lives in `description`; the rules table+effect in `body`. Combine them
// (flavour first) into a single rich-text document so the pop-up reads like the wiki page.
function buildSpellBody(f) {
  const desc =
    f.description && Array.isArray(f.description.content) ? structuredClone(f.description.content) : [];
  const body = f.body && Array.isArray(f.body.content) ? structuredClone(f.body.content) : [];
  return { nodeType: 'document', data: {}, content: [...desc, ...body] };
}

// Find a magicLore entry's accent colour anywhere in a parsed __NEXT_DATA__ tree.
function findMagicLoreColor(node) {
  if (!node || typeof node !== 'object') return null;
  const ct = node.sys && node.sys.contentType && node.sys.contentType.sys && node.sys.contentType.sys.id;
  if (ct === 'magicLore' && node.fields && node.fields.color) return node.fields.color;
  for (const k in node) {
    const v = node[k];
    if (v && typeof v === 'object') {
      const c = findMagicLoreColor(v);
      if (c) return c;
    }
  }
  return null;
}

async function recordSpell(slug) {
  const key = spellRuleKey(slug);
  if (rules[key]) return rules[key];
  const { data } = await getPageRaw(`spell/${slug}`);
  const entry = data && data.props && data.props.pageProps && data.props.pageProps.entry;
  if (!entry || !entry.fields || entry.fields.slug !== slug) return null;
  const f = entry.fields;
  const body = buildSpellBody(f);
  const refs = new Set();
  slimBodyAndCollectRefs(body, refs); // slim embedded targets + harvest deeper bodies
  const descText = plainText(f.description).join(' ').replace(/\s+/g, ' ').trim();
  rules[key] = {
    slug: key,
    name: f.name || slug,
    order: typeof f.order === 'number' ? f.order : null,
    pageReference: typeof f.pageReference === 'number' ? f.pageReference : null,
    parentSlug: null,
    body,
    bodyIndex: `${descText} ${f.bodyIndex || ''}`.trim(),
    childSlugs: [],
    prevSlug: null,
    nextSlug: null,
    crossRefSlugs: [],
    refSlugs: [...refs],
  };
  return rules[key];
}

async function crawlLoresAndSpells() {
  const section = rules[LORES_SECTION];
  if (!section) {
    console.warn(`  ! ${LORES_SECTION} section not crawled; skipping spells`);
    return { lores: {}, loreList: [] };
  }
  const loreSlugs = section.childSlugs.filter((s) => rules[s]);

  // Pass 1: per lore, read its ordered spell list (+ accent colour) from the rendered page.
  const loreData = {}; // loreSlug -> { list:[{slug,label}], color }
  const spellSet = new Set();
  for (let i = 0; i < loreSlugs.length; i += CONCURRENCY) {
    const chunk = loreSlugs.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (lore) => {
        const { html, data } = await getPageRaw(`${LORES_SECTION}/${lore}`);
        const list = [];
        let m;
        SPELL_NAME_RE.lastIndex = 0;
        while ((m = SPELL_NAME_RE.exec(html))) {
          list.push({ slug: m[1], label: decodeEntities(m[2]) });
          spellSet.add(m[1]);
        }
        if (list.length) loreData[lore] = { list, color: findMagicLoreColor(data) };
      }),
    );
    await sleep(DELAY_MS);
  }

  // Pass 2: crawl every unique spell page once.
  const allSpells = [...spellSet];
  let done = 0;
  for (let i = 0; i < allSpells.length; i += CONCURRENCY) {
    const chunk = allSpells.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((s) => recordSpell(s)));
    done += chunk.length;
    await sleep(DELAY_MS);
    process.stdout.write(`\r  spells: ${done}/${allSpells.length}   `);
  }
  if (allSpells.length) process.stdout.write('\n');

  // Pass 3: build the lores index (only spells we successfully fetched).
  const lores = {};
  for (const [lore, { list, color }] of Object.entries(loreData)) {
    const spells = list
      .map(({ slug, label }) => {
        const key = spellRuleKey(slug);
        const numM = label.match(/^(\d+)\./);
        return {
          slug: key,
          name: rules[key]
            ? rules[key].name
            : label.replace(/\s*\(Signature Spell\)\s*/i, '').replace(/^\d+\.\s*/, '').trim(),
          number: numM ? parseInt(numM[1], 10) : null,
          signature: /\(Signature Spell\)/i.test(label),
        };
      })
      .filter((s) => rules[s.slug]);
    lores[lore] = {
      slug: lore,
      name: rules[lore] ? rules[lore].name : lore,
      color: color || null,
      spells,
    };
  }

  // Order: "full" lores (6+ spells) first, then supplementary, each alphabetical by name.
  const loreList = Object.values(lores)
    .sort((a, b) => {
      const af = a.spells.length >= 6 ? 0 : 1;
      const bf = b.spells.length >= 6 ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.name.localeCompare(b.name);
    })
    .map((l) => l.slug);

  console.log(`  lores: ${Object.keys(lores).length}, spells: ${allSpells.length}`);
  return { lores, loreList };
}

function buildTurn() {
  const phases = PHASE_SLUGS.filter((s) => rules[s]).map((s) => ({
    slug: s,
    name: rules[s].name,
    stepSlugs: rules[s].childSlugs.filter((c) => rules[c]),
  }));
  return { phases, magicSlug: rules['magic'] ? 'magic' : null };
}

function buildNav() {
  return SECTIONS.filter((s) => rules[s])
    .map((s) => ({
      slug: s,
      name: rules[s].name,
      order: rules[s].order,
      childSlugs: rules[s].childSlugs.filter((c) => rules[c]),
    }))
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
}

async function main() {
  console.log('Crawling tow.whfb.app ...\n');
  for (const section of SECTIONS) {
    await crawlSection(section);
  }

  // Crawl the magic lores and every spell they list (each becomes a `spell-<slug>` rule).
  console.log('\nCrawling magic lores & spells ...');
  const magic = await crawlLoresAndSpells();

  // Fold in rules that were only ever referenced via links (charts, lores, ...).
  let harvestedAdded = 0;
  for (const [slug, lb] of Object.entries(linkBodies)) {
    if (rules[slug]) continue;
    rules[slug] = {
      slug,
      name: lb.name,
      order: null,
      pageReference: null,
      parentSlug: null,
      body: lb.body,
      bodyIndex: lb.bodyIndex,
      childSlugs: [],
      prevSlug: null,
      nextSlug: null,
      crossRefSlugs: [],
      refSlugs: lb.refs,
    };
    harvestedAdded++;
  }
  console.log(`\nHarvested ${harvestedAdded} link-only rules (charts, lores, ...)`);

  const turn = buildTurn();
  const nav = buildNav();

  const total = Object.keys(rules).length;
  const empty = Object.values(rules).filter((r) => !r.body).length;
  const missing = new Set();
  for (const r of Object.values(rules)) {
    for (const s of [...r.crossRefSlugs, ...r.refSlugs]) {
      if (!rules[s]) missing.add(s);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Rules collected : ${total}`);
  console.log(`Empty bodies    : ${empty}`);
  console.log(
    `Turn phases     : ${turn.phases
      .map((p) => `${p.name}=${p.stepSlugs.length}`)
      .join(', ')}`,
  );
  console.log(`Nav sections    : ${nav.length}`);
  console.log(
    `Unresolved refs : ${missing.size}${missing.size ? ' (e.g. ' + [...missing].slice(0, 8).join(', ') + ')' : ''}`,
  );

  console.log(`Lores           : ${magic.loreList.length}`);

  const out = {
    source: BASE,
    scrapedAt: new Date().toISOString(),
    rules,
    turn,
    nav,
    lores: magic.lores,
    loreList: magic.loreList,
  };
  await mkdir(OUT_DIR, { recursive: true });
  const json = JSON.stringify(out);
  await writeFile(OUT_FILE, json);
  console.log(`\nWrote ${OUT_FILE} (${(Buffer.byteLength(json) / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
