// Build public/unit-details.json: per unit the equipment of EACH MODEL in it, verbatim from the unit's
// own page on tow.whfb.app.
//
// WHY (22-11-2026). A unit's options are one flat list ("Wicked claws; Serrated maws; Fiery breath; Hand
// weapons; Whips") over several profile rows ("War Hydra", "Beastmaster Handlers (x2)"), so the app did
// not know which model carries which weapon. Joost: "Nu lijkt het alsof de Beast handlers ook met de
// claws vechten". The wiki writes it per model:
//   "War Hydra: Wicked claws, serrated maws and fiery breath"
//   "Beastmaster Handlers: Hand weapons and whips"
//
// Keyed like the statlines: the rules-index.json key of the unit's datasheet (see src/lib/statSleutel.ts).
// Only units where it adds information are kept: at least one line with a "Model:" prefix.
// Same fetch, User-Agent, rich-text walk and 8-way concurrency as scripts/sync-mount-details.mjs.
// Everything is VERBATIM — no own wording. public/owb/ is only read, never written.
//   node scripts/sync-unit-details.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://tow.whfb.app';
const UA = 'tow-companion-scraper/1.0 (personal study app)';

// Rich text → paragraphs of plain text (one paragraph per model on a unit page).
function paragraphs(doc) {
  const out = [];
  const walk = (node, cur) => {
    if (!node) return;
    if (node.nodeType === 'paragraph' || node.nodeType === 'list-item') {
      const p = [];
      for (const c of node.content ?? []) walk(c, p);
      const line = p.join('').replace(/\s+/g, ' ').trim();
      if (line) out.push(line);
      return;
    }
    if (node.nodeType === 'text' && node.value && cur) cur.push(node.value);
    for (const c of node.content ?? []) walk(c, cur);
  };
  walk(doc, null);
  return out;
}

// Same split as ListBuilder's mount equipment: "Cold Ones: Claws and teeth (…)" → model + rest.
const MODEL_PREFIX = /^([^:()]{2,40}):\s*(.+)$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** → { fields } | { geen: 'no entry' } | { fout: string } */
async function fetchUnit(path) {
  let laatste = 'fetch failed';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${SITE}/${path.replace(/^\//, '')}`, { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status >= 500) { laatste = `HTTP ${res.status}`; await sleep(1000 * 2 ** attempt); continue; }
      const html = await res.text();
      const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!m) return { fout: `no page data (HTTP ${res.status})` };
      const fields = JSON.parse(m[1])?.props?.pageProps?.entry?.fields;
      return fields ? { fields } : { geen: 'no entry' };
    } catch (e) {
      laatste = String(e?.message || e);
      await sleep(1000 * 2 ** attempt);
    }
  }
  return { fout: laatste };
}

const ri = JSON.parse(readFileSync(join(ROOT, 'public/owb/rules-index.json'), 'utf8'));
// One fetch per page; every rules-index key that points at it gets the result.
const keysPerUrl = new Map();
for (const [k, v] of Object.entries(ri)) {
  const url = String(v?.url ?? '');
  if (!url.startsWith('unit/')) continue;
  if (!keysPerUrl.has(url)) keysPerUrl.set(url, []);
  keysPerUrl.get(url).push(k);
}

const units = {};
const geenEntry = [];
const mislukt = [];
const anderePagina = [];
const zonderEquipment = [];
const zonderModel = [];
const urls = [...keysPerUrl.keys()];
let next = 0;
let klaar = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < urls.length) {
    const url = urls[next++];
    const r = await fetchUnit(url);
    klaar++;
    if (klaar % 50 === 0) console.log(`  ${klaar}/${urls.length}`);
    if (r.geen) { geenEntry.push(url); continue; }
    if (r.fout) { mislukt.push(`${url} (${r.fout})`); continue; }
    const f = r.fields;
    // A page that resolved to a different entry must not donate its facts.
    if (f.slug && !url.endsWith(`/${f.slug}`)) { anderePagina.push(`${url} (page is ${f.slug})`); continue; }
    if (!f.equipment) { zonderEquipment.push(url); continue; }
    const equipment = paragraphs(f.equipment).map((line) => {
      const m = line.match(MODEL_PREFIX);
      return m ? { model: m[1].trim(), line: m[2].trim() } : { model: null, line };
    });
    if (!equipment.some((e) => e.model)) { zonderModel.push(url); continue; }
    for (const k of keysPerUrl.get(url)) units[k] = { equipment };
  }
}));

const sorted = Object.fromEntries(Object.keys(units).sort().map((k) => [k, units[k]]));
writeFileSync(join(ROOT, 'public/unit-details.json'), JSON.stringify({ source: SITE, scrapedAt: new Date().toISOString(), units: sorted }));
console.log(`Done: ${Object.keys(sorted).length} unit keys with per-model equipment, from ${urls.length} unit pages.`);
console.log(`Skipped: ${zonderModel.length} pages with equipment but no "Model:" line, ${zonderEquipment.length} without equipment.`);
console.log(`Missed: ${geenEntry.length} without entry (fallback page), ${anderePagina.length} resolved to another page, ${mislukt.length} failed.`);
if (geenEntry.length) console.log('No entry:\n  ' + geenEntry.join('\n  '));
if (anderePagina.length) console.log('Other page:\n  ' + anderePagina.join('\n  '));
if (mislukt.length) console.log('Failed:\n  ' + mislukt.join('\n  '));
for (const k of ['war hydra', 'cold one knights', 'dark riders']) console.log(k, '→', JSON.stringify(sorted[k]));
