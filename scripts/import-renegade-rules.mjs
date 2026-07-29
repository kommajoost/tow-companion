// Import the SPECIAL RULES PROSE from a Renegade Legacy Pack into an existing composition overlay.
//
//   # one-off: fetch the pack as PDF and render it with the column layout preserved
//   curl -L "https://docs.google.com/document/d/<id>/export?format=pdf" -o pack.pdf
//   pdftotext -layout pack.pdf pack.txt
//
//   node scripts/import-renegade-rules.mjs pack.txt public/renegade/ok-renegade-v2.json
//
// WHY A SECOND SCRIPT, AND A SECOND SOURCE FORMAT. `import-renegade.mjs` reads the Google-Docs TEXT
// export, because there a paid option is one line ("<label>  +N points") and points are checkable
// against the base catalogue. That same export destroys the rules pages: the packs set them in TWO
// COLUMNS, and a text export interleaves the columns line by line into nonsense. The PDF keeps the
// columns, so the prose is recoverable from it — hence points from the text export, prose from the PDF.
// Neither format is good at both.
//
// The script MERGES into the overlay and never rewrites the rest of it: `units` and `magicItems` come
// from the other importer and must survive untouched.
//
// WHAT IS DELIBERATELY LEFT OUT — the item TABLES (Daemonic Gifts/Icons, magic weapons). They do not
// survive linear extraction: entries come out attached to their neighbours' names ("Skull Totem"
// carrying Spell Eater's text). Points for those already come from the text export, so cutting them
// loses nothing and keeps demonstrably wrong rules text out of the app.
import { readFileSync, writeFileSync } from 'node:fs';

// ── SUPERSEDED — will not run without --force ────────────────────────────────────────────────────
// The canonical pipeline is now: import-renegade-reference → compile-renegade-v2 → validate-renegade-v2.
// This script predates it and writes overlay.rules WHOLESALE, so re-running it would drop the fuller rule set
// that the compiler now maintains. It is kept because it is where that data originally came from
// (compile-renegade-v2 preserves points, option prices and prose rules it finds in the overlay), not
// because it should be run again.
if (!process.argv.includes('--force')) {
  console.error('superseded by compile-renegade-v2; pass --force only if you mean to overwrite');
  process.exit(1);
}


const [src, overlayPath] = process.argv.slice(2);
if (!src || !overlayPath) {
  console.error('usage: node scripts/import-renegade-rules.mjs <pack-pdf.txt> <overlay.json>');
  process.exit(1);
}

const rawLines = readFileSync(src, 'utf8').split('\n').map((l) => l.replace(/\r$/, ''));
// The DRAFT watermark bleeds into the text layer. \f is kept until the page split below.
const clean = (s) => s.replace(/DRAFT/g, ' ').replace(/\s+/g, ' ').trim();
/** Sentinel for a column/page boundary — prose may not flow across one. */
const BREAK = '\u0000';
const isBreak = (l) => l.includes('\f');
const noBreak = (l) => l.replace(/\f/g, '');

// ── locate the rules section ─────────────────────────────────────────────────────────────────────
const startIdx = rawLines.findIndex((l) => /^[A-Z][A-Za-z' ]* Special Rules\s*$/.test(noBreak(l).trim()));
if (startIdx < 0) {
  console.error(`${src}: no "... Special Rules" heading — nothing to import`);
  process.exit(1);
}
// The end marker must be a HEADING, not the same words inside a sentence: the section intro ends
// "...used by models drawn from the X army list:", and a \b-anchored match on "Army List" truncates the
// section to nothing.
const END = /^(Magic Items|Weapons of|Lore of|Army List|Magic Weapons|Magic Armour|Talismans|Enchanted Items|Arcane Items|Magic Standards|Big Names|Chaotic Gifts|Chaotic Icons|Daemonic Gifts|Daemonic Icons|Gifts Of|Icons Of)\b[A-Za-z ]*$/i;
const endIdx = rawLines.findIndex((l, i) => i > startIdx && END.test(noBreak(l).trim()));
const section = rawLines.slice(startIdx + 1, endIdx > 0 ? endIdx : rawLines.length);

// ── de-column ────────────────────────────────────────────────────────────────────────────────────
/**
 * The page's gutter: the column just past the widest mostly-blank run in the middle band.
 *
 * Not "blank on every line" — the section intro and running header are legitimately full-width and
 * cross it. And the split point is just PAST the run, not inside it: the run is whitespace, the right
 * column starts at the first column after it.
 */
function findGutter(page) {
  const filled = page.filter((l) => l.trim().length > 0);
  const width = Math.max(...filled.map((l) => l.length), 0);
  if (width < 60 || filled.length < 6) return null;
  const blankAt = (c) => filled.filter((l) => (l[c] ?? ' ') === ' ').length / filled.length;
  const runs = [];
  for (let c = Math.floor(width * 0.25); c <= Math.ceil(width * 0.75); c++) {
    if (blankAt(c) < 0.85) continue;
    const last = runs[runs.length - 1];
    if (last && last.end === c - 1) last.end = c;
    else runs.push({ start: c, end: c });
  }
  let best = null;
  for (const r of runs) {
    if (r.end - r.start < 1) continue; // a one-column gap is noise, not a gutter
    const g = r.end + 1;
    const twoSided = filled.filter((l) => l.slice(0, g).trim() && l.slice(g).trim()).length;
    if (twoSided >= 3 && (!best || twoSided > best.twoSided)) best = { g, twoSided };
  }
  return best ? best.g : null;
}

/** Where to cut a line whose page gutter is at `g`; null means "full-width, do not cut". */
function snapSplit(l, g) {
  // Nothing left of the gutter → wholly right-column. Checked FIRST: a deeply-indented right-column
  // list item can sit far past g and would otherwise be mistaken for full-width prose.
  if (l.slice(0, g).trim() === '') return g;
  if (l.length <= g) return g; // wholly left-column
  if ((l[g] ?? ' ') === ' ') {
    // Gutter clear here: the right column starts at the next non-space, wherever that falls.
    const at = l.slice(g).search(/\S/);
    return at < 0 ? g : g + at;
  }
  // Text sits ON the gutter: either a right-column HEADING (set a few columns left of its body text) or
  // genuinely full-width prose. Walk back to the word start; a 2+ space gap means a column boundary.
  let c = g;
  while (c > 0 && l[c - 1] !== ' ') c--;
  return c >= 2 && l[c - 1] === ' ' && l[c - 2] === ' ' ? c : null;
}

/**
 * Flatten a page to one stream: the whole left column, then the whole right column.
 *
 * A genuine two-column page needs the fixed gutter, because a right-column heading sits on a line with
 * NOTHING to its left ("            Cleaving Blow"); splitting such a line on "a run of spaces" leaves
 * the heading in the left stream and silently shifts every rule's body onto the previous rule's name.
 * A mostly single-column page has no stable gutter, and forcing one slices body lines mid-word
 * ("a low linear obsta" / "cle") — so there, fall back to splitting per line on a wide interior gap.
 */
function decolumn(page) {
  const g = findGutter(page);
  const left = [];
  const right = [];
  for (const raw of page) {
    const l = raw.replace(/\s+$/, '');
    if (g != null) {
      const at = snapSplit(l, g);
      if (at == null) { left.push(l); continue; } // full-width line
      left.push(l.slice(0, at));
      right.push(l.slice(at).trim());
    } else {
      const m = /^(\S.*?\S)[ \t]{4,}(\S.*)$/.exec(l);
      if (m) { left.push(m[1]); right.push(m[2]); }
      else { left.push(l); right.push(''); }
    }
  }
  // BREAK closes the open rule: without it the right column's opening lines — a misfire TABLE on the
  // Skaven page — get appended to the last rule of the left column.
  return [...left, BREAK, ...right, BREAK];
}

const pages = [[]];
for (const l of section) {
  if (isBreak(l)) pages.push([]);
  pages[pages.length - 1].push(noBreak(l));
}
const ordered = pages.flatMap((p) => decolumn(p));

// ── parse rules ──────────────────────────────────────────────────────────────────────────────────
// Column headers of the weapon/item tables pass every shape test a rule name passes, so they must be
// named to be excluded.
const NOT_A_RULE = /^(R S AP|Weapon|Combat|Notes?|Items?|Requires Two Hands|Magical Attacks|Special Rules|Range|Strength|Points|Missile|Move|Type)\b/i;
const isHeading = (t) => {
  if (!t || t.length > 46) return false;
  if (/[.:;,!?"“”)]$/.test(t)) return false;
  if (/^(On this page|Note)/i.test(t)) return false;
  if (NOT_A_RULE.test(t)) return false;
  if (t.split(/\s+/).length > 6) return false;
  return /^[A-Z][A-Za-z'’-]*(\s+[A-Za-z'’-]+)*$/.test(t);
};

const parsed = [];
let cur = null;
const endPara = () => {
  if (!cur || !cur.para.length) return;
  const text = cur.para.join(' ');
  const prev = cur.paras[cur.paras.length - 1];
  // A blank line in one column falls wherever the OTHER column's paragraphs happen to break, so it can
  // split a sentence. If the previous paragraph does not end a sentence, this is that same paragraph.
  if (prev && !/[.!?:]$/.test(prev)) cur.paras[cur.paras.length - 1] = `${prev} ${text}`;
  else cur.paras.push(text);
  cur.para = [];
};
const closeRule = () => {
  endPara();
  if (cur && cur.paras.length) parsed.push(cur);
  cur = null;
};
for (const raw of ordered) {
  if (raw === BREAK) { closeRule(); continue; }
  const t = clean(raw);
  if (!t) { endPara(); continue; }
  if (isHeading(t)) { closeRule(); cur = { name: t, paras: [], para: [] }; }
  else if (cur) cur.para.push(t);
}
closeRule();

// A rule can surface twice — once as a column fragment, once as a full block. Keep the longest.
const bySlug = new Map();
for (const r of parsed) {
  const slug = r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const prev = bySlug.get(slug);
  const len = r.paras.join(' ').length;
  if (len < 40) continue;
  if (!prev || len > prev.paras.join(' ').length) bySlug.set(slug, r);
}
// "<Faction> Magic Items" heads the NEXT section, not a rule — it survives the section cut when the
// heading wraps across two lines ("Chaos Dwarfs Magic" / "Items").
for (const [slug, r] of [...bySlug]) if (/\b(magic items?|magic)$/i.test(r.name)) bySlug.delete(slug);

// ── classify against what the app already ships ──────────────────────────────────────────────────
// rules.json already carries the base game plus ~40 wiki-scraped "(Renegade)" rules. A pack rule whose
// wording matches the base one adds nothing and is dropped, so the overlay stays a real diff.
const shipped = JSON.parse(readFileSync(new URL('../public/rules.json', import.meta.url), 'utf8')).rules;
const norm = (s) => String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const byName = new Map();
for (const r of Object.values(shipped)) {
  const n = norm(r.name);
  if (!byName.has(n)) byName.set(n, r);
}
/** Jaccard over word sets — tolerant of the line-wrap noise that survives PDF extraction. */
const similar = (a, b) => {
  const A = new Set(norm(a).split(' ').filter(Boolean));
  const B = new Set(norm(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
};
const SAME = 0.82;

const rules = {};
const kept = [];
const dropped = [];
for (const [slug, r] of bySlug) {
  const body = r.paras;
  const flat = body.join(' ');
  const n = norm(r.name);
  const ren = byName.get(`${n} renegade`);
  const base = byName.get(n);
  const against = ren ?? base;
  const sim = against ? similar(flat, against.bodyIndex || '') : 0;
  if (against && sim >= SAME) { dropped.push(`${r.name} (matches ${against.slug})`); continue; }
  rules[slug] = {
    name_en: r.name,
    body,
    // The rules.json slug this replaces while the pack is active, or null when the pack introduces a
    // rule the app has never had. Lets the app override in place instead of showing two versions.
    overrides: against ? against.slug : null,
  };
  kept.push(`${r.name}${against ? ` (overrides ${against.slug}, sim ${sim.toFixed(2)})` : ' (new)'}`);
}

// ── merge into the overlay, preserving everything else ───────────────────────────────────────────
const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));
const before = Object.keys(overlay.rules ?? {}).length;
overlay.rules = rules;
overlay.scope = 'points-and-rules';
writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);

console.error(`${src} -> ${overlayPath}`);
console.error(`  parsed from PDF:  ${bySlug.size} rules`);
console.error(`  KEPT:             ${kept.length}${before ? ` (was ${before})` : ''}`);
for (const k of kept) console.error(`    + ${k}`);
console.error(`  dropped as identical to what the app already ships: ${dropped.length}`);
for (const d of dropped) console.error(`    - ${d}`);
console.error('  NOT extracted:    item tables (gifts/icons/magic weapons), stat lines, option prices');
