// Build public/mount-details.json — per mount the datasheet facts that public/owb/mount-text.json
// does not carry: armour value, base size, the equipment of each model in it, and the special rules
// WITH their per-model note ("Armour Bane (1, Cold One only)").
//
// WHY A SEPARATE FILE (22-11-2026). Joost, about a Cold One Chariot as a mount: "ik mis toch wel wat
// info zoals armour save en de equipment van crew en Cold Ones". mount-text.json lives in public/owb/
// and is rewritten by the catalogue sync; it keeps only rule names, and its tidy() drops the "Cold One
// only" note. That file is left alone. This one is additive and the app merges it on top
// (mount-text < mount-details < Renegade overlay), so a Renegade profile still wins.
//
// Everything is taken VERBATIM from the mount's own page on tow.whfb.app — no own wording.
//   node scripts/sync-mount-details.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://tow.whfb.app';
const UA = 'tow-companion-scraper/1.0 (personal study app)';

// Same key shape as scripts/sync-mount-text.mjs, so both files describe the same mounts.
const normRule = (s) => (s || '').toLowerCase().replace(/ *\([^)]*\) */g, '').replace(/[{}[\]*]/g, '').replace(/^[0-9]x /g, '').replace(/[“”]/g, '"').trim();
const ri = JSON.parse(readFileSync(join(ROOT, 'public/owb/rules-index.json'), 'utf8'));
function lookup(name) {
  const k = normRule(name);
  let e = ri[k];
  if (!e) { const w = k.split(' '); const last = w[w.length - 1]; if (/s$/.test(last)) e = ri[[...w.slice(0, -1), last.replace(/s$/, '')].join(' ')]; }
  return e;
}

// Rich text → paragraphs of tokens: plain text, or a linked rule (the embedded entry's name) with the
// words the page shows for it ("[Cavalry Spear]cavalry spears" → { rule: 'Cavalry Spear', text: 'cavalry spears' }).
function paragraphs(doc) {
  const out = [];
  const walk = (node, cur) => {
    if (!node) return;
    if (node.nodeType === 'paragraph' || node.nodeType === 'list-item') {
      const p = [];
      for (const c of node.content ?? []) walk(c, p);
      if (p.length) out.push(p);
      return;
    }
    const f = node.data?.target?.fields;
    if (f?.name && cur) cur.push({ rule: String(f.name) });
    if (node.nodeType === 'text' && node.value && cur) cur.push({ text: node.value });
    for (const c of node.content ?? []) walk(c, cur);
  };
  walk(doc, null);
  return out;
}

/** One equipment paragraph → its verbatim line plus the linked words in it. */
function equipmentLine(tokens) {
  let line = '';
  const links = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.rule) {
      const next = tokens[i + 1];
      if (next && next.text) {
        // The link's own words are the start of the next text node ("hand weapons" in "hand weapons, ").
        const words = next.text.split(/,| and |\)|\(| or /)[0].trim();
        if (words) links.push({ text: words, rule: t.rule });
      }
      continue;
    }
    line += t.text;
  }
  return { line: line.replace(/\s+/g, ' ').trim(), links };
}

/** Special rules with their per-unit value and note, exactly as the page writes them. The rule
 *  entries sit as BLOCKS between the text, so this walks the whole document as one flat sequence —
 *  the same pairing scripts/sync-mount-text.mjs uses — but keeps the note it trims off. */
function specialRules(doc) {
  const seq = [];
  const walk = (node) => {
    if (!node) return;
    if (node.nodeType === 'text' && node.value && node.value.trim()) seq.push({ text: node.value.replace(/\s+/g, ' ').trim() });
    const fl = node.data?.target?.fields;
    if (fl?.name) seq.push({ rule: String(fl.name) });
    for (const c of node.content ?? []) walk(c);
  };
  walk(doc);
  const out = [];
  for (let i = 0; i < seq.length; i++) {
    if (!seq[i].rule) continue;
    const generic = seq[i].rule.replace(/\s*\(-?X\)\s*$/, '').trim();
    const next = seq[i + 1];
    const shown = next && next.text && next.text.toLowerCase().startsWith(generic.toLowerCase())
      ? next.text.replace(/,$/, '')
      : generic;
    if (shown && shown.length < 70 && !out.includes(shown)) out.push(shown);
  }
  return out;
}

async function fetchUnit(path) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${SITE}/${path.replace(/^\//, '')}`, { headers: { 'User-Agent': UA } });
      const m = (await res.text()).match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      return m ? JSON.parse(m[1])?.props?.pageProps?.entry?.fields ?? null : null;
    } catch { await new Promise((r) => setTimeout(r, 500 * attempt)); }
  }
  return null;
}

const idx = JSON.parse(readFileSync(join(ROOT, 'public/owb/index.json'), 'utf8'));
const mounts = new Set();
for (const a of idx.armies || []) {
  try {
    const army = JSON.parse(readFileSync(join(ROOT, `public/owb/${a.slug}.json`), 'utf8'));
    for (const c of ['characters', 'core', 'special', 'rare', 'mercenaries', 'allies'])
      for (const u of (army[c] || [])) for (const m of (u.mounts || [])) if (m.name_en && !/on foot/i.test(m.name_en)) mounts.add(m.name_en);
  } catch { /* skip */ }
}

const result = {};
const missed = [];
const list = [...mounts];
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < list.length) {
    const name = list[next++];
    const e = lookup(name);
    if (!e?.url) { missed.push(`${name} (no page)`); continue; }
    const f = await fetchUnit(e.url);
    if (!f) { missed.push(`${name} (fetch failed)`); continue; }
    // A page that resolved to a different entry must not donate its facts.
    if (f.slug && !e.url.endsWith(`/${f.slug}`)) { missed.push(`${name} (page is ${f.slug})`); continue; }
    const rec = {};
    if (f.armourValue) rec.armourValue = String(f.armourValue).trim();
    if (f.baseSize) rec.baseSize = String(f.baseSize).trim();
    if (f.equipment) {
      const lines = paragraphs(f.equipment).map(equipmentLine).filter((l) => l.line);
      if (lines.length) { rec.equipment = lines.map((l) => l.line); rec.equipmentLinks = lines.map((l) => l.links); }
    }
    if (f.specialRules) { const sr = specialRules(f.specialRules); if (sr.length) rec.specialRules = sr; }
    if (Object.keys(rec).length) result[normRule(name)] = rec;
  }
}));

const sorted = Object.fromEntries(Object.keys(result).sort().map((k) => [k, result[k]]));
writeFileSync(join(ROOT, 'public/mount-details.json'), JSON.stringify({ source: SITE, scrapedAt: new Date().toISOString(), mounts: sorted }));
console.log(`Done — ${Object.keys(sorted).length}/${list.length} mounts. Missed: ${missed.length}`);
if (missed.length) console.log(missed.join('\n'));
console.log('cold one chariot →', JSON.stringify(sorted['cold one chariot'], null, 1));
