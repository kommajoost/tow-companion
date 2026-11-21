// Adds the wiki's own curated "Related:" list to public/rules.json as `relatedSlugs`.
//
// WHY THIS IS A SEPARATE SCRIPT: the app showed `crossRefSlugs` as "Related rules", but that is the
// wiki's "Cross-Reference Links" (every rule that links to this one — for Musicians that includes
// Grail Reliquae, which only mentions the word). The wiki's real "Related:" list is a separate
// Contentful field, `entry.fields.relatedLinks`, and it was never scraped.
//
// This script is ADDITIVE: it only sets `relatedSlugs` on rules that already exist in rules.json.
// It never changes a rule's text, order, or any other field, and it never adds or removes a rule —
// so it cannot pull in wording changes the way a full `npm run scrape` would.
//
//   node scripts/add-related.mjs            → dry run: fetch, report, write nothing
//   node scripts/add-related.mjs --write    → write public/rules.json

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', 'public', 'rules.json');
const BASE = 'https://tow.whfb.app';
const CONCURRENCY = 8;
const DELAY_MS = 80;
const UA = 'tow-companion-scraper/1.0 (personal study app)';
const WRITE = process.argv.includes('--write');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

async function getPage(path, attempt = 1) {
  try {
    const res = await fetch(`${BASE}/${path}`, { headers: { 'User-Agent': UA } });
    if (res.status === 404) return { status: 404, data: null };
    if (!res.ok) {
      if (attempt < 4) { await sleep(600 * attempt); return getPage(path, attempt + 1); }
      return { status: res.status, data: null };
    }
    return { status: 200, data: extractNextData(await res.text()) };
  } catch (err) {
    if (attempt < 4) { await sleep(600 * attempt); return getPage(path, attempt + 1); }
    return { status: 0, data: null, error: String(err) };
  }
}

const bundle = JSON.parse(await readFile(FILE, 'utf8'));
const rules = bundle.rules;
const sectionSlugs = new Set((bundle.nav || []).map((s) => s.slug));

// Only rules that have their own wiki page: a section (/<slug>) or a rule under one
// (/<section>/<slug>). Spells (`spell-…`), harvested charts and profiles have no such page.
const jobs = [];
for (const r of Object.values(rules)) {
  if (r.parentSlug && rules[r.parentSlug]) jobs.push({ slug: r.slug, path: `${r.parentSlug}/${r.slug}` });
  else if (sectionSlugs.has(r.slug)) jobs.push({ slug: r.slug, path: r.slug });
}
console.log(`${jobs.length} of ${Object.keys(rules).length} rules have a wiki page`);

const found = {};        // slug -> string[]
const failed = [];       // { slug, why }
const unknown = new Set(); // related slugs that are not a rule in the bundle
let done = 0;

for (let i = 0; i < jobs.length; i += CONCURRENCY) {
  const chunk = jobs.slice(i, i + CONCURRENCY);
  await Promise.all(chunk.map(async ({ slug, path }) => {
    const { status, data } = await getPage(path);
    const entry = data && data.props && data.props.pageProps && data.props.pageProps.entry;
    if (!entry || !entry.fields) { failed.push({ slug, why: `status ${status}` }); return; }
    // A page that resolved to a different entry (a fallback) must not donate its links.
    if (entry.fields.slug !== slug) { failed.push({ slug, why: `page is "${entry.fields.slug}"` }); return; }
    const links = Array.isArray(entry.fields.relatedLinks) ? entry.fields.relatedLinks : [];
    const slugs = [];
    for (const l of links) {
      const s = l && l.fields && l.fields.slug;
      if (!s || s === slug || slugs.includes(s)) continue;
      if (!rules[s]) unknown.add(s);
      slugs.push(s);
    }
    found[slug] = slugs;
  }));
  done += chunk.length;
  process.stdout.write(`\r  ${done}/${jobs.length}   `);
  await sleep(DELAY_MS);
}
process.stdout.write('\n');

const withLinks = Object.values(found).filter((a) => a.length).length;
console.log(`fetched ${Object.keys(found).length}, with a Related list: ${withLinks}, failed: ${failed.length}`);
if (failed.length) console.log('failed:', failed.slice(0, 40).map((f) => `${f.slug} (${f.why})`).join(', '));
if (unknown.size) console.log(`related slugs that are not in the bundle (${unknown.size}):`, [...unknown].slice(0, 40).join(', '));
console.log('musicians →', found.musicians);

if (!WRITE) { console.log('dry run — nothing written (pass --write)'); process.exit(0); }

// A failed fetch leaves the rule as it was: no `relatedSlugs` key, so the app falls back to the
// cross-reference list instead of claiming the rule has nothing related.
let changed = 0;
for (const [slug, slugs] of Object.entries(found)) {
  const before = JSON.stringify(rules[slug].relatedSlugs ?? null);
  rules[slug].relatedSlugs = slugs;
  if (JSON.stringify(slugs) !== before) changed++;
}
bundle.relatedAt = new Date().toISOString();
await writeFile(FILE, JSON.stringify(bundle));
console.log(`wrote ${FILE} — relatedSlugs set on ${Object.keys(found).length} rules (${changed} changed)`);
