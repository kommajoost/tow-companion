// Build public/owb/mount-text.json — each mount's special rules, keyed by the app's normalised
// mount name (so the builder's "eye" can show a mount's FULL info: its stat profile (already from
// rules-index) PLUS its special rules as tappable chips, not just the bare profile). The OWB
// catalogue's mount options carry only name/points; a mount's rules live on the upstream unit page
// (tow.whfb.app). Run: node scripts/sync-mount-text.mjs — uses Node's global fetch, no deps.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://tow.whfb.app';

// Same normalisation the app uses for stat lookups (statsFor/normRule) — so the snapshot keys match.
const normRule = (s) => (s || '').toLowerCase().replace(/ *\([^)]*\) */g, '').replace(/[{}[\]*]/g, '').replace(/^[0-9]x /g, '').replace(/[“”]/g, '"').trim();

const ri = JSON.parse(readFileSync(join(ROOT, 'public/owb/rules-index.json'), 'utf8'));
function lookup(name) {
  const k = normRule(name);
  let e = ri[k];
  if (!e) { const w = k.split(' '); const last = w[w.length - 1]; if (/s$/.test(last)) e = ri[[...w.slice(0, -1), last.replace(/s$/, '')].join(' ')]; }
  return e;
}

// A mount's special rules are Contentful EMBEDDED ENTRIES (the GENERIC rule, e.g. "Fly (X)") each
// IMMEDIATELY FOLLOWED by a text node carrying the PER-UNIT value (e.g. "Fly (10)", "Armour Bane (1,
// Dark Pegasus only)"). We pair each entry with that text so the snapshot keeps the real value; the
// "(X)" placeholder is the fallback when no value text follows. The app's resolveRuleSlug still strips
// the "(…)" so the chip stays tappable, while the label shows the number.
function tokenize(node, out = []) {
  if (!node) return out;
  if (node.nodeType === 'text' && node.value && node.value.trim()) out.push({ t: 'text', v: node.value.replace(/\s+/g, ' ').trim() });
  const f = node.data?.target?.fields;
  if (f && f.name) out.push({ t: 'entry', v: String(f.name) });
  for (const c of node.content ?? []) tokenize(c, out);
  return out;
}
// Tidy "(1, Dark Pegasus only)" → "(1)" but keep plain values like "(10)" / "(D3)".
const tidy = (s) => s.replace(/\(([^),]+),[^)]*\bonly\)/i, '($1)').replace(/\s+/g, ' ').trim();
function ruleNames(special) {
  const seq = tokenize(special);
  const out = [];
  for (let i = 0; i < seq.length; i++) {
    if (seq[i].t !== 'entry') continue;
    const generic = seq[i].v.replace(/\s*\(-?X\)\s*$/, '').trim();
    const next = seq[i + 1];
    out.push(next && next.t === 'text' && next.v.toLowerCase().startsWith(generic.toLowerCase()) ? tidy(next.v) : generic);
  }
  return out;
}
const dedupe = (a) => [...new Set(a.map((s) => s.trim()).filter((s) => s && s.length < 60))];

async function fetchUnit(slug) {
  try {
    const html = await (await fetch(`${SITE}/${slug.replace(/^\//, '')}`)).text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (m) return JSON.parse(m[1])?.props?.pageProps?.entry?.fields ?? null;
  } catch { /* ignore */ }
  return null;
}

async function mapLimit(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
  }));
}

const idx = JSON.parse(readFileSync(join(ROOT, 'public/owb/index.json'), 'utf8'));
const armies = (idx.armies || []).map((a) => a.slug);
const mounts = new Set();
for (const s of armies) {
  try {
    const a = JSON.parse(readFileSync(join(ROOT, `public/owb/${s}.json`), 'utf8'));
    for (const c of ['characters', 'core', 'special', 'rare', 'mercenaries', 'allies'])
      for (const u of (a[c] || [])) for (const m of (u.mounts || [])) if (m.name_en && !/on foot/i.test(m.name_en)) mounts.add(m.name_en);
  } catch { /* skip */ }
}
const list = [...mounts];
console.log(`Resolving special rules for ${list.length} mounts…`);

let ok = 0;
const result = {};
await mapLimit(list, 10, async (name, i) => {
  const e = lookup(name);
  if (!e?.url) return;
  const f = await fetchUnit(e.url);
  if (!f?.specialRules) return;
  const names = dedupe(ruleNames(f.specialRules));
  if (names.length) { result[normRule(name)] = { specialRules: names }; ok++; }
  if (i % 25 === 0) process.stdout.write(`. ${i}\n`);
});

writeFileSync(join(ROOT, 'public/owb/mount-text.json'), JSON.stringify(result, null, 0));
console.log(`Done — ${ok}/${list.length} mounts have special-rule data. Wrote public/owb/mount-text.json`);
