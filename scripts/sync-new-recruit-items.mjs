// Build public/extra-items.json + public/extra-item-text.json + docs/items/new-recruit-diff.md:
// the magic items that New Recruit (newrecruit.eu, the community army builder) has for Warhammer:
// The Old World and our Old World Builder catalogue (public/owb/magic-items.json) does not.
//
// WHY (24-11-2026). A player wanted "The Briar-bow" on his champion: it is in New Recruit, not in
// ours. Joost: "ja, en er zijn nog een paar van dat soort items. zoek ook naar andere items in new
// recruit die wij niet hebben".
//
// WHERE THE DATA COMES FROM. New Recruit does not publish its TOW data as a repository (BSData has no
// TOW repo). Its public wiki renders the BattleScribe-format data server-side and embeds it in each
// page as a Nuxt payload (`<script id="__NUXT_DATA__">`). We read that payload — the same data the page
// shows — from:
//   /wiki/tow/warhammer-the-old-world/magic-items           the shared "Magic Items" catalogue
//   …/magic-items/<id>/<group>                               one page per item type (tree of entries)
//   …/magic-items/<id>/<item>                                one page per item: points, constraints,
//                                                            profiles (rule text), visibility modifiers
// Requests are sequential with a pause between them, with the same User-Agent as our other scrapers.
//
// WHAT IS WRITTEN. Only items NOT in our catalogue (OWB + Renegade overlays), and only when NR's data
// makes their army availability unambiguous:
//   - visible by default and no modifiers      → `general` (NR lists no restriction: a common item)
//   - hidden unless "ancestor is Faction: X"   → that army's own list
//   - anything else                            → NOT written; listed under "Unclear" in the diff doc
// Text is NR's own text, verbatim (only the markdown bold markers `**` are removed). NR gives no
// flavour text and no publication/page on these pages; that is recorded as such.
// public/owb/ and public/renegade/ are only READ, never written.
//
//   node scripts/sync-new-recruit-items.mjs [--repo <dir>] [--out <dir>] [--cache <dir>] [--delay 700]
//   --repo   where public/owb + public/renegade are read from   (default: this repo)
//   --out    where public/extra-*.json and docs/items/ are written (default: this repo)
//   --cache  optional folder for decoded NR pages, so a rerun does not refetch everything

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const REPO = arg('--repo', ROOT);
const OUT = arg('--out', ROOT);
const CACHE = arg('--cache', null);
const DELAY = Number(arg('--delay', 700));
const TODAY = arg('--date', new Date().toISOString().slice(0, 10));

const SITE = 'https://www.newrecruit.eu';
const CATALOGUE = '/wiki/tow/warhammer-the-old-world/magic-items';
const UA = 'tow-companion-scraper/1.0 (personal study app)';

// NR item-type group → our `type`. The aggregate group "Magic Items" repeats these six, so it is skipped.
const TYPE_BY_GROUP = {
  'Magic Weapons': 'weapon',
  'Magic Armour': 'armor',
  'Magic Standards': 'banner',
  'Talismans': 'talisman',
  'Enchanted Items': 'enchanted-item',
  'Arcane Items': 'arcane-item',
};
// Our types that count as the same category (OWB has a separate armour list for Beastmen wizards).
const SAME_TYPE = { armor: ['armor', 'armor-mages'] };
// Items whose type in OUR builder must follow upstream Old World Builder rather than New Recruit's group.
// The Armour of Jet: NR files it under Magic Armour, but its text says a Wizard wears it, and upstream OWB
// types it 'armor-mages' (the wizard armour slot). As plain 'armor' a Wizard could not pick it at all,
// because wizards only have the 'armor-mages' slot (Joost, 24-11-2026).
const TYPE_OVERRIDE = { 'the armour of jet': 'armor-mages' };

// ---------------------------------------------------------------------------------------------------
// Fetching + decoding the Nuxt payload
// ---------------------------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeNuxt(html) {
  const m = html.match(/id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no __NUXT_DATA__ payload');
  const arr = JSON.parse(m[1]);
  const memo = new Map();
  const rev = (i) => {
    if (typeof i !== 'number') return i;
    if (i < 0) return undefined;
    if (memo.has(i)) return memo.get(i);
    const v = arr[i];
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string' && ['ShallowReactive', 'Reactive', 'Ref', 'ShallowRef'].includes(v[0])) {
        const r = rev(v[1]); memo.set(i, r); return r;
      }
      if (v[0] === 'Set') return v.slice(1).map(rev);
      const out = []; memo.set(i, out);
      for (const x of v) out.push(rev(x));
      return out;
    }
    if (v && typeof v === 'object') {
      const out = {}; memo.set(i, out);
      for (const [k, x] of Object.entries(v)) out[k] = rev(x);
      return out;
    }
    return v;
  };
  const root = rev(0);
  const data = root?.data?.stats ?? root?.data;
  if (!data?.resolved) throw new Error('payload without resolved data');
  return data.resolved;
}

let fetched = 0;
async function page(path) {
  const key = path.replace(/[^a-z0-9]+/gi, '_').slice(-180);
  if (CACHE) {
    const f = join(CACHE, `${key}.json`);
    if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  }
  if (fetched++) await sleep(DELAY);
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // NR's own links are already partly escaped ("bigger%2C-choppier-axe"): encode the rest only.
      const r = await fetch(SITE + encodeURI(path).replace(/%25([0-9A-F]{2})/gi, '%$1'), { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`${r.status} ${path}`);
      const data = decodeNuxt(await r.text());
      if (CACHE) { mkdirSync(CACHE, { recursive: true }); writeFileSync(join(CACHE, `${key}.json`), JSON.stringify(data)); }
      return data;
    } catch (e) { lastErr = e; await sleep(2000 * (attempt + 1)); }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------------------------------
// 1. NR: every item in the Magic Items catalogue
// ---------------------------------------------------------------------------------------------------
async function crawlNr() {
  const cat = await page(CATALOGUE);
  const leaves = [];
  for (const g of cat.options ?? []) {
    const type = TYPE_BY_GROUP[g.name];
    if (!type) continue;
    const grp = await page(g.url);
    const walk = (opts, path) => {
      for (const o of opts ?? []) {
        if (o.group) walk(o.options, [...path, o.name]);
        else leaves.push({ name: o.name, url: o.url, group: g.name, subgroup: path.join(' > ') || null, type: TYPE_OVERRIDE[String(o.name).toLowerCase()] ?? type });
      }
    };
    walk(grp.options, []);
  }
  const seen = new Set();
  const items = [];
  let n = 0;
  for (const l of leaves) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    n += 1;
    if (n % 50 === 0) console.log(`  … ${n}/${leaves.length} item pages`);
    const e = await page(l.url);
    items.push(parseEntry(l, e));
  }
  return items;
}

const clean = (s) => String(s ?? '').replace(/\*\*/g, '').replace(/[ \t]+$/gm, '').trim();
const stripTags = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();

function parseEntry(leaf, e) {
  const constraints = Object.fromEntries((e.constraints ?? []).map((c) => [c.name, c.value]));
  const pts = (e.costs ?? []).find((c) => c.name === 'pts');
  const fields = e.fields ?? {};
  // Anything beyond Type/EntryId/Hidden would be a publication or page; NR shows none today.
  const extraFields = Object.fromEntries(Object.entries(fields).filter(([k]) => !['Type', 'EntryId', 'Hidden'].includes(k)));
  const pub = extraFields.Publication ?? extraFields.publication ?? null;
  const pageNr = extraFields.Page ?? extraFields.page ?? null;
  const profiles = (e.profiles ?? []).map((p) => ({
    typeName: p.typeName,
    name: p.name,
    chars: Object.fromEntries((p.characteristics ?? []).map((c) => [c.name, c.$text == null ? null : String(c.$text)])),
  }));
  const modifiers = (e.modifiers ?? []).map((m) => ({
    type: m.type, field: m.field, value: m.value, html: stripTags(m.html),
    groups: (m.conditionGroups ?? []).map((g) => ({ type: g.type, conditions: (g.conditions ?? []).map((c) => stripTags(c.html)) })),
    conditions: (m.conditions ?? []).map((c) => stripTags(c.html)),
  }));
  return {
    ...leaf,
    entryId: fields.EntryId ?? null,
    hidden: fields.Hidden === true || fields.Hidden === 'true',
    points: pts ? Number(pts.value) : null,
    constraints,
    profiles,
    modifiers,
    publication: pub ? [pub, pageNr ? `p. ${pageNr}` : null].filter(Boolean).join(', ') : null,
    extraFields,
  };
}

// ---------------------------------------------------------------------------------------------------
// 2. Ours: OWB catalogue + Renegade overlay items (read only)
// ---------------------------------------------------------------------------------------------------
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[‘’ʼ`´]/g, "'").replace(/\{[^}]*\}/g, '').replace(/\*/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|of|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

function loadOurs() {
  const owb = JSON.parse(readFileSync(join(REPO, 'public/owb/magic-items.json'), 'utf8'));
  const meta = JSON.parse(readFileSync(join(REPO, 'public/owb/the-old-world.json'), 'utf8'));
  const text = JSON.parse(readFileSync(join(REPO, 'public/owb/magic-item-text.json'), 'utf8'));
  const all = [];
  for (const [g, arr] of Object.entries(owb)) for (const it of arr ?? []) all.push({ src: 'OWB', group: g, item: it });
  const renDir = join(REPO, 'public/renegade');
  if (existsSync(renDir)) {
    for (const f of readdirSync(renDir).filter((x) => /-renegade-v2\.json$/.test(x))) {
      const o = JSON.parse(readFileSync(join(renDir, f), 'utf8'));
      for (const [g, arr] of Object.entries(o.magicItems ?? {})) for (const it of arr ?? []) all.push({ src: `Renegade ${f}`, group: g, item: it });
    }
  }
  const byNorm = new Map();
  for (const r of all) {
    const k = norm(r.item.name_en ?? r.item.name);
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k).push(r);
  }
  return { owb, meta, text, all, byNorm };
}

// ---------------------------------------------------------------------------------------------------
// 3. Availability from NR's visibility modifiers
// ---------------------------------------------------------------------------------------------------
function factionGroup(faction, ours) {
  const groups = Object.keys(ours.owb);
  const s = slug(faction.replace(/^the\s+/i, '').replace(/&/g, 'and'));
  if (groups.includes(s)) return s;
  const byName = (ours.meta.armies ?? []).find((a) => slug(String(a.name_en ?? a.name ?? '').replace(/&/g, 'and')) === s);
  if (byName && groups.includes(byName.id)) return byName.id;
  return null;
}

function availability(it, ours) {
  if (!it.hidden && it.modifiers.length === 0) return { groups: ['general'], how: 'no restriction in NR' };
  if (!it.hidden) return { unclear: `visible by default but has modifiers: ${it.modifiers.map((m) => m.html + ' [' + m.groups.flatMap((g) => g.conditions).join('; ') + ']').join(' | ')}` };
  const unhide = it.modifiers.filter((m) => m.field === 'hidden' && m.value === false);
  const other = it.modifiers.filter((m) => !(m.field === 'hidden' && m.value === false));
  if (other.length) return { unclear: `other modifiers: ${other.map((m) => m.html).join(' | ')}` };
  const conds = unhide.flatMap((m) => [...m.conditions, ...m.groups.flatMap((g) => g.conditions)]);
  const andGroups = unhide.flatMap((m) => m.groups).filter((g) => g.type === 'and' && g.conditions.length > 1);
  if (!conds.length) return { unclear: 'hidden, no condition shown' };
  const factions = [];
  for (const c of conds) {
    const m = c.match(/^ancestor is Faction: (.+)$/);
    if (!m) return { unclear: `condition not a faction: "${c}"` };
    factions.push(m[1].trim());
  }
  if (andGroups.length) return { unclear: `several conditions that must ALL hold: ${conds.join('; ')}` };
  const groups = [];
  for (const f of factions) {
    const g = factionGroup(f, ours);
    if (!g) return { unclear: `faction "${f}" has no item list of its own in our catalogue` };
    if (!groups.includes(g)) groups.push(g);
  }
  return { groups, how: `NR: ${conds.join(' or ')}` };
}

// ---------------------------------------------------------------------------------------------------
// 4. Text, verbatim
// ---------------------------------------------------------------------------------------------------
function textFor(it) {
  const notes = [];
  const profiel = [];
  for (const p of it.profiles) {
    const c = p.chars;
    if ('R' in c || 'S' in c || 'AP' in c) {
      const row = { naam: p.name };
      if (c.R != null) row.range = clean(c.R);
      if (c.S != null) row.strength = clean(c.S);
      if (c.AP != null) row.ap = clean(c.AP);
      if (c['Special Rules'] != null) row.specialRules = clean(c['Special Rules']);
      profiel.push(row);
    }
    for (const [k, v] of Object.entries(c)) {
      if (['R', 'S', 'AP', 'Special Rules'].includes(k) || v == null || !String(v).trim()) continue;
      notes.push(clean(v));
    }
  }
  if (!notes.length && !profiel.length) return null;
  const out = {};
  // "Notes: " is the label our own catalogue puts in front of an item's rule prose (the game screen
  // then keeps it as one line instead of splitting it on commas); NR calls the field "Note"/"Description".
  if (notes.length) out.body = `Notes: ${notes.join('\n')}`;
  if (profiel.length) out.profiel = profiel;
  out.bron = 'New Recruit';
  out.bronKort = 'NR';
  out.publicatie = it.publication;
  out.nrUrl = SITE + it.url;
  return out;
}

// ---------------------------------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------------------------------
console.log(`New Recruit magic items → ${OUT}`);
const ours = loadOurs();
const nr = await crawlNr();
console.log(`NR: ${nr.length} item entries; ours: ${ours.all.length} entries`);

const matched = [];
const variants = [];
const missing = [];
const ourNorms = [...ours.byNorm.keys()];
for (const it of nr) {
  const k = norm(it.name);
  if (ours.byNorm.has(k)) { matched.push({ it, ours: ours.byNorm.get(k) }); continue; }
  const close = ourNorms.filter((o) => Math.min(o.length, k.length) >= 8 && lev(o, k) <= 2);
  if (close.length === 1) { const o = ours.byNorm.get(close[0]); variants.push({ it, ours: o }); matched.push({ it, ours: o, variant: true }); continue; }
  missing.push(it);
}

// Points / type differences (report only).
const diffs = [];
for (const { it, ours: o, variant } of matched) {
  const owbRows = o.filter((r) => r.src === 'OWB');
  const rows = owbRows.length ? owbRows : o;
  const ptsSame = rows.some((r) => r.item.points === it.points);
  const typeSame = rows.some((r) => (SAME_TYPE[it.type] ?? [it.type]).includes(r.item.type));
  if (!ptsSame || !typeSame) diffs.push({ it, rows, ptsSame, typeSame, variant });
}

// Missing → extra files.
const extraItems = {};
const extraText = {};
const added = [];
const unclear = [];
for (const it of missing) {
  const av = availability(it, ours);
  if (av.unclear) { unclear.push({ it, why: av.unclear }); continue; }
  if (it.points == null) { unclear.push({ it, why: 'no points cost' }); continue; }
  const common = /extremely common/i.test(it.subgroup ?? '');
  const item = {
    name_en: it.name,
    points: it.points,
    type: it.type,
    onePerArmy: it.constraints['max(roster)'] === '1',
    ...(common ? { stackable: true } : {}),
    ...(it.constraints.max ? { maximum: Number(it.constraints.max) } : {}),
    name: it.name.toLowerCase(),
    bron: 'New Recruit',
    publicatie: it.publication,
    toegevoegd: TODAY,
    nrUrl: SITE + it.url,
  };
  for (const g of av.groups) (extraItems[g] ??= []).push(item);
  const tx = textFor(it);
  if (tx) extraText[slug(item.name)] = tx;
  added.push({ it, item, groups: av.groups, how: av.how, hasText: !!tx });
}
for (const g of Object.keys(extraItems)) extraItems[g].sort((a, b) => a.type.localeCompare(b.type) || b.points - a.points || a.name_en.localeCompare(b.name_en));

mkdirSync(join(OUT, 'public'), { recursive: true });
writeFileSync(join(OUT, 'public/extra-items.json'), `${JSON.stringify(extraItems, null, 2)}\n`);
writeFileSync(join(OUT, 'public/extra-item-text.json'), `${JSON.stringify(extraText, null, 2)}\n`);

// ---------------------------------------------------------------------------------------------------
// 5. The diff document
// ---------------------------------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const limits = (it) => [
  it.constraints['max(roster)'] ? `max ${it.constraints['max(roster)']} per army` : null,
  it.constraints.max ? `max ${it.constraints.max} per model` : null,
  /extremely common/i.test(it.subgroup ?? '') ? 'extremely common' : null,
].filter(Boolean).join(', ') || 'none shown';
const md = [];
md.push('# New Recruit vs our magic items');
md.push('');
md.push(`Generated ${TODAY} by \`scripts/sync-new-recruit-items.mjs\` (rerun: \`npm run sync-new-recruit-items\`).`);
md.push('');
md.push(`Source: the New Recruit wiki for Warhammer: The Old World, catalogue "Magic Items" (${SITE}${CATALOGUE}),`);
md.push('read from the data each wiki page embeds (Nuxt payload). New Recruit publishes no separate data repository for TOW.');
md.push(`Compared against \`public/owb/magic-items.json\` (Old World Builder) plus the items in \`public/renegade/*-renegade-v2.json\`.`);
md.push('Names are matched after normalising case, accents, apostrophes, "&"/"and" and the words the/of/a/an; a remaining difference of at most 2 letters counts as a spelling variant.');
md.push('');
md.push(`- NR item entries read: ${nr.length}`);
md.push(`- Missing from ours: ${missing.length} (added: ${added.length}, unclear and left out: ${unclear.length})`);
md.push(`- Spelling variants (treated as the same item): ${variants.length}`);
md.push(`- Points or type differences (report only, nothing changed): ${diffs.length}`);
md.push('');
md.push('New Recruit shows no publication or page for these entries, and no flavour text; its rule text is its own summary (field "Note"/"Description"), copied verbatim.');
md.push('');
md.push('## Missing items, added to `public/extra-items.json`');
md.push('');
md.push('| Item | Our group (army) | Type | Points | Limits | Publication | Rule text | Why this group | NR page |');
md.push('|---|---|---|---|---|---|---|---|---|');
for (const a of added.sort((x, y) => x.groups[0].localeCompare(y.groups[0]) || x.it.name.localeCompare(y.it.name))) {
  md.push(`| ${esc(a.it.name)} | ${a.groups.join(', ')} | ${a.it.type} (${esc([a.it.group, a.it.subgroup].filter(Boolean).join(' > '))}) | ${a.it.points} | ${limits(a.it)} | ${a.it.publication ?? 'not shown'} | ${a.hasText ? 'yes' : 'no'} | ${esc(a.how)} | [link](${SITE}${a.it.url}) |`);
}
md.push('');
md.push('## Unclear, NOT added');
md.push('');
if (!unclear.length) md.push('None.');
else {
  md.push('| Item | NR group | Points | Limits | Why unclear | NR page |');
  md.push('|---|---|---|---|---|---|');
  for (const u of unclear) md.push(`| ${esc(u.it.name)} | ${esc([u.it.group, u.it.subgroup].filter(Boolean).join(' > '))} | ${u.it.points ?? '-'} | ${limits(u.it)} | ${esc(u.why)} | [link](${SITE}${u.it.url}) |`);
}
md.push('');
md.push('## Spelling variants (matched, nothing added)');
md.push('');
if (!variants.length) md.push('None.');
else {
  md.push('| New Recruit | Ours | Our group |');
  md.push('|---|---|---|');
  for (const v of variants) md.push(`| ${esc(v.it.name)} | ${esc(v.ours[0].item.name_en)} | ${v.ours.map((r) => r.group).join(', ')} |`);
}
md.push('');
md.push('## Points or type differences (report only, nothing changed)');
md.push('');
if (!diffs.length) md.push('None.');
else {
  md.push('| Item | NR points | Our points | NR type | Our type | Our group / source |');
  md.push('|---|---|---|---|---|---|');
  for (const d of diffs.sort((a, b) => a.it.name.localeCompare(b.it.name))) {
    md.push(`| ${esc(d.it.name)}${d.variant ? ' (variant)' : ''} | ${d.ptsSame ? d.it.points : `**${d.it.points}**`} | ${[...new Set(d.rows.map((r) => r.item.points))].join(' / ')} | ${d.typeSame ? d.it.type : `**${d.it.type}**`} | ${[...new Set(d.rows.map((r) => r.item.type))].join(' / ')} | ${[...new Set(d.rows.map((r) => `${r.group} (${r.src})`))].join(', ')} |`);
  }
}
md.push('');
mkdirSync(join(OUT, 'docs/items'), { recursive: true });
writeFileSync(join(OUT, 'docs/items/new-recruit-diff.md'), `${md.join('\n')}\n`);

console.log(`added ${added.length}, unclear ${unclear.length}, variants ${variants.length}, differences ${diffs.length}`);
for (const a of added) console.log(`  + ${a.it.name} [${a.groups.join(', ')}] ${a.it.type} ${a.it.points} pts`);
for (const u of unclear) console.log(`  ? ${u.it.name}: ${u.why}`);
