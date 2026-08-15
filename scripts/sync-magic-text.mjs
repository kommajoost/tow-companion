// Build public/owb/magic-item-text.json — a committed snapshot of every magic item's flavour +
// rules text, keyed by slug. The OWB catalogue (magic-items.json) only carries name/points/type,
// so the builder's "eye" had nothing to show for an item's actual effect (most visibly: runes).
// The rule text lives on the upstream rules site (tow.whfb.app, a Next.js + Contentful app); we pull
// each magic item's Contentful `description` (flavour) + `body` (rules, incl. any profile table),
// flatten the rich text, and snapshot it so the app stays fast + offline. Run: node scripts/sync-magic-text.mjs
// Uses Node's global fetch — no deps.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://tow.whfb.app';

const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Flatten Contentful rich-text to plain text. Paragraphs/headings → lines; tables → " | "-joined rows.
function flatten(node) {
  if (!node) return '';
  if (node.nodeType === 'text') return node.value || '';
  const kids = node.content ?? [];
  switch (node.nodeType) {
    case 'paragraph':
    case 'heading-1': case 'heading-2': case 'heading-3':
    case 'heading-4': case 'heading-5': case 'heading-6':
    case 'list-item':
      return kids.map(flatten).join('') + '\n';
    case 'table-row':
      return kids.map((c) => flatten(c).trim()).filter(Boolean).join(' | ') + '\n';
    // EMBEDDED ENTRIES (15-08-2026). Een embedded-entry-block heeft GEEN `content`-kinderen, dus met
    // de default hieronder flatte hij naar een lege string en verdween hij spoorloos. Precies daar zit
    // bij een magic weapon het wapenprofiel in (contentType `weaponProfile`) én de special rules —
    // Sword of Sorrow hield zo alleen z'n Notes-alinea over. Het profiel halen we apart op als
    // STRUCTUUR (zie `profielen` hieronder) zodat de app er een echte tabel van kan maken; hier geven
    // we 'm dus bewust leeg terug om 'm niet dubbel te tonen. Elk ANDER embedded type valt terug op
    // zijn `bodyIndex` — Contentfuls eigen platte tekst — zodat er nooit meer stil iets wegvalt.
    case 'embedded-entry-block':
    case 'embedded-entry-inline': {
      const t = node.data?.target;
      if (!t?.fields) return '';
      if (t.sys?.contentType?.sys?.id === 'weaponProfile') return '';
      return t.fields.bodyIndex ? String(t.fields.bodyIndex) + '\n' : '';
    }
    default:
      return kids.map(flatten).join('');
  }
}
const clean = (s) => s.replace(/\n{3,}/g, '\n\n').trim();

/** Elk wapenprofiel uit een rich-text-document, als structuur. Een magic weapon draagt er meestal
 *  één ("Sword of Sorrow Profile"), maar een item met meerdere standen kan er meer hebben — dus een
 *  array. `specialRules` is zelf rich text vol entry-hyperlinks; `bodyIndex` is dezelfde regels als
 *  platte tekst en is hier de betrouwbaarste bron. */
function profielen(node, uit = []) {
  if (!node || typeof node !== 'object') return uit;
  if (node.nodeType === 'embedded-entry-block' || node.nodeType === 'embedded-entry-inline') {
    const t = node.data?.target;
    if (t?.fields && t.sys?.contentType?.sys?.id === 'weaponProfile') {
      const f = t.fields;
      const regels = f.bodyIndex ? String(f.bodyIndex).trim() : clean(flatten(f.specialRules));
      uit.push({
        naam: f.name ? String(f.name).replace(/\s*Profile$/i, '').trim() : '',
        range: f.range ? String(f.range) : '',
        strength: f.strength ? String(f.strength) : '',
        ap: f.armourPiercing != null ? String(f.armourPiercing) : '',
        specialRules: regels,
      });
    }
  }
  for (const k of node.content ?? []) profielen(k, uit);
  return uit;
}

async function getBuildId() {
  const html = await (await fetch(`${SITE}/`)).text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]).buildId : null;
}

async function fetchOne(slug, buildId) {
  // Prefer the lightweight _next/data JSON; fall back to the page's embedded __NEXT_DATA__.
  try {
    if (buildId) {
      const r = await fetch(`${SITE}/_next/data/${buildId}/magic-item/${slug}.json`);
      if (r.ok) return (await r.json())?.pageProps?.entry ?? null;
    }
  } catch { /* fall through */ }
  try {
    const html = await (await fetch(`${SITE}/magic-item/${slug}`)).text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (m) return JSON.parse(m[1])?.props?.pageProps?.entry ?? null;
  } catch { /* give up */ }
  return null;
}

const deAccent = (x) => (x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/æ/gi, 'ae');
async function fetchEntry(canonicalSlug, name, buildId) {
  // The upstream URL slug strips apostrophes/accents and spells out "&" ("Duellist's Blades" →
  // "duellists-blades", "Banner of Châlons" → "banner-of-chalons", "Crook & Flail" → "crook-and-flail")
  // while our canonical id just hyphenates. Try the variants; the snapshot KEY stays canonical.
  const n = name || '';
  const cands = [
    canonicalSlug,
    slugify(n.replace(/['’]/g, '')),
    slugify(deAccent(n)),
    slugify(deAccent(n).replace(/['’]/g, '')),
    slugify(deAccent(n).replace(/&/g, ' and ')),
    slugify(deAccent(n).replace(/&/g, '')),
  ];
  for (const s of [...new Set(cands)].filter(Boolean)) {
    const e = await fetchOne(s, buildId);
    if (e?.fields) return e;
  }
  return null;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

const magic = JSON.parse(readFileSync(join(ROOT, 'public/owb/magic-items.json'), 'utf8'));
// Distinct items by canonical slug, keeping a name for the apostrophe-aware URL fallback.
const bySlug = new Map();
for (const it of Object.values(magic).flat()) {
  const s = slugify(it.name || it.name_en);
  if (s && !bySlug.has(s)) bySlug.set(s, it.name || it.name_en);
}
const slugs = [...bySlug.keys()];
console.log(`Fetching text for ${slugs.length} magic items…`);

const buildId = await getBuildId();
console.log('buildId:', buildId);

let ok = 0;
const result = {};
await mapLimit(slugs, 10, async (slug, idx) => {
  const entry = await fetchEntry(slug, bySlug.get(slug), buildId);
  const f = entry?.fields;
  if (!f) { if (idx % 50 === 0) process.stdout.write(`. ${idx}\n`); return; }
  const description = f.description ? clean(flatten(f.description)) : '';
  // The body is often just embedded rule entries (no text) — e.g. a magic weapon's effect is
  // "Armour Bane (1), Magical Attacks, …". Flattened body is then empty, so fall back to bodyIndex
  // (Contentful's flattened index), which carries those rule names.
  let body = f.body ? clean(flatten(f.body)) : '';
  if (!body && f.bodyIndex) body = clean(String(f.bodyIndex));
  // Het wapenprofiel als structuur (Range/Strength/AP/Special Rules) — zie `profielen`.
  const prof = f.body ? profielen(f.body) : [];
  if (description || body || prof.length) {
    result[slug] = { description, body, ...(prof.length ? { profiel: prof } : {}) };
    ok++;
  }
  if (idx % 50 === 0) process.stdout.write(`. ${idx}\n`);
});

writeFileSync(join(ROOT, 'public/owb/magic-item-text.json'), JSON.stringify(result, null, 0));
console.log(`Done — ${ok}/${slugs.length} items have text. Wrote public/owb/magic-item-text.json`);
