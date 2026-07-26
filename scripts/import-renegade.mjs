// Generate a composition OVERLAY from a Renegade Legacy Pack document.
//
//   node scripts/import-renegade.mjs <pack.txt> <compId> <baseArmySlug> > public/renegade/<compId>.json
//
// The Renegade Legacy Pack (squarebased.com, by Square Based) rebalances the Legacy factions. Its own
// terms: "free to use in whole, use them in part, use them as inspiration". We apply it as a patch on
// top of the OWB catalogue rather than as a second catalogue, so a pack update never has to be merged
// by hand and the diff stays inspectable.
//
// SCOPE, on purpose: POINTS ONLY — unit points and magic-item points. Points are unambiguous in the
// source, checkable against the base catalogue, and the thing a list builder must not get wrong. Stat
// lines, rules text and option changes are NOT taken from here: the source is a Google-Docs text export
// in which prose and tables are interleaved, and a wrong statline is worse than an absent one. What
// that leaves out is printed to stderr so the gap is visible rather than implied.
import { readFileSync } from 'node:fs';

const [src, compId, baseSlug] = process.argv.slice(2);
if (!src || !compId || !baseSlug) {
  console.error('usage: node scripts/import-renegade.mjs <pack.txt> <compId> <baseArmySlug>');
  process.exit(1);
}
const BASE_DIR = new URL('../public/owb/', import.meta.url);
const army = JSON.parse(readFileSync(new URL(`${baseSlug}.json`, BASE_DIR), 'utf8'));
const items = JSON.parse(readFileSync(new URL('magic-items.json', BASE_DIR), 'utf8'));
const lines = readFileSync(src, 'utf8').split('\n').map((l) => l.replace(/\r$/, ''));

const val = (l) => l.replace(/^\t/, '').trim();
const norm = (s) => String(s).toLowerCase().replace(/\{[^}]*\}/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const LABELS = /^(M|T|W|I|A|Ld|Points|WS|BS|S|Troop Type|Base Size|Unit Size|Equipment|Options|Special Rules|Notes)\b/i;
const isName = (s) => /^[A-Z][A-Za-z'’ ()-]{2,40}$/.test(s) && !LABELS.test(s);

// ── unit profiles ────────────────────────────────────────────────────────────────────────────────
// A profile is a name line followed by TEN numbers (M WS BS S T W I A Ld, then Points). How those ten
// split across lines varies per table — Google Docs merges cells inconsistently, so the Tyrant block
// arrives as 4+6 and the Hunter block as 3+7. Consume numbers until there are ten; the last is points.
const STATS = 10;
const profiles = [];
for (let i = 0; i < lines.length - 2; i++) {
  const name = val(lines[i]);
  if (!isName(name)) continue;
  const nums = [];
  for (let k = i + 1; k < lines.length && nums.length < STATS; k++) {
    const v = val(lines[k]);
    if (v === '') continue;
    const parts = v.split(/\s+/);
    if (!parts.every((x) => /^\d{1,3}$/.test(x))) break;
    for (const x of parts) nums.push(Number(x));
  }
  if (nums.length === STATS) profiles.push({ name, points: nums[STATS - 1] });
}

const baseUnits = [];
for (const [cat, arr] of Object.entries(army)) {
  if (Array.isArray(arr)) for (const u of arr) baseUnits.push({ cat, id: u.id, name: String(u.name_en || ''), points: u.points });
}
const byName = new Map(baseUnits.map((u) => [norm(u.name), u]));

/** Plural forms of a word, English-irregular-aware. The packs head a multi-model unit's statblock with
 *  the SINGULAR model name while the catalogue names the unit in the plural, and the interesting cases
 *  are not "+s": Crossbowman→Crossbowmen, Witch Elf→Witch Elves, Harpy→Harpies. */
const plurals = (w) => {
  const out = new Set([w, `${w}s`, `${w}es`]);
  if (/man$/.test(w)) out.add(w.replace(/man$/, 'men'));
  if (/fe$/.test(w)) out.add(w.replace(/fe$/, 'ves'));
  else if (/f$/.test(w)) out.add(w.replace(/f$/, 'ves'));
  if (/[^aeiou]y$/.test(w)) out.add(w.replace(/y$/, 'ies'));
  return [...out];
};

/** Every plural variant of a profile name — the last word pluralised, and (for "Sister of Slaughter"
 *  ↔ "Sisters of Slaughter") the first word too. */
const nameVariants = (n) => {
  const w = n.split(' ');
  const out = new Set([n]);
  for (const p of plurals(w[w.length - 1])) out.add([...w.slice(0, -1), p].join(' '));
  if (w.length > 1) for (const p of plurals(w[0])) out.add([p, ...w.slice(1)].join(' '));
  return [...out];
};

/** Are `words` present in `hay` in order, as whole words? Lets the catalogue carry extra words the pack
 *  omits — the packs drop qualifiers the catalogue keeps ("Corsair" ↔ "Black Ark Corsairs",
 *  "Bloodletter" ↔ "Bloodletters of Khorne", "Herald of Khorne" ↔ "Daemonic Herald of Khorne"). */
const subsequence = (hay, words) => {
  const h = hay.split(' ');
  let i = 0;
  for (const w of words) {
    const at = h.indexOf(w, i);
    if (at < 0) return false;
    i = at + 1;
  }
  return true;
};

/**
 * Pack profile name → base units (plural: a name can legitimately appear in more than one category).
 *
 * Exact/plural first, then a word-subsequence match against every plural variant. AMBIGUITY IS REFUSED:
 * if the variants resolve to more than one distinct base NAME the profile is skipped, because a wrong
 * match silently reprices the wrong unit — worse than leaving it at base points. "Skink 5" is the
 * honest casualty of that rule: it could be Skink Priest, Skink Chief, Skink Skirmishers or Chameleon
 * Skinks, so it stays unmatched rather than repricing one of them at random.
 */
const matchBase = (packName) => {
  const n = norm(packName);
  const variants = nameVariants(n);
  for (const v of variants) {
    const exact = baseUnits.filter((u) => norm(u.name) === v);
    if (exact.length) return exact;
  }
  const words = n.split(' ');
  const hits = baseUnits.filter((u) => variants.some((v) => subsequence(norm(u.name), v.split(' '))) || subsequence(norm(u.name), words));
  const names = new Set(hits.map((u) => norm(u.name)));
  return names.size === 1 ? hits : null;
};

const units = {};
let repriced = 0, unchanged = 0;
const unmatched = [];
for (const p of profiles) {
  const hits = matchBase(p.name);
  if (!hits || hits.length === 0) { unmatched.push(p); continue; }
  // One name can appear in several categories (the packs' own variants sit beside the base entry), so
  // patch every unit carrying that name — patching only the first would leave a stale price behind.
  let touched = false;
  for (const b of hits) {
    if (b.points === p.points) continue;
    units[b.id] = { points: p.points, _was: b.points, _changed: ['points'] };
    touched = true;
  }
  if (touched) repriced++; else unchanged++;
}

// ── magic items ──────────────────────────────────────────────────────────────────────────────────
// Only the Big Names table: it is delimited by its own heading and every entry is "<Name> <NN> points".
// The other item categories are not extracted — their sections interleave with rules prose and the
// heading boundaries are not reliable enough to trust silently.
const bnStart = lines.findIndex((l) => /^Big Names\s*$/.test(l.trim()));
const packItems = [];
if (bnStart >= 0) {
  const baseNames = new Set((items['big-names'] || []).map((b) => norm(b.name_en)));
  const ITEM = new RegExp('^([A-Z][A-Za-z’\' -]{2,28}?)[ \\t]{2,}(\\d{1,3})[ \\t]*[Pp]oints?[ \\t]*$');
  // Stop as soon as a non-Big-Name category heading appears, so magic weapons cannot leak in.
  for (let i = bnStart + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^(Magic Items|Magic Weapons|Magic Armour|Talismans|Enchanted Items|Arcane Items|Magic Standards)\s*$/i.test(t)) break;
    const m = ITEM.exec(t);
    if (m) packItems.push({ name: m[1].trim(), points: Number(m[2]) });
  }
  // A pack entry is either a REPRICE of a base Big Name or a NEW one; both belong in the overlay.
  for (const it of packItems) {
    const b = (items['big-names'] || []).find((x) => norm(x.name_en) === norm(it.name));
    if (b && b.points === it.points) continue;
    packItems.isNew = !b;
    void baseNames;
  }
}
const bigNames = [];
for (const it of packItems) {
  const b = (items['big-names'] || []).find((x) => norm(x.name_en) === norm(it.name));
  if (b && b.points === it.points) continue;
  bigNames.push({
    name_en: it.name,
    name: it.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    points: it.points,
    type: 'big-name',
    onePerArmy: false,
    ...(b ? { _was: b.points } : {}),
  });
}

const overlay = {
  id: compId,
  label: 'Renegade V2',
  baseArmy: baseSlug,
  packVersion: (lines.slice(0, 40).join('\n').match(/DRAFT\s+V([\d.]+)/i) || [])[1] ?? null,
  source: {
    name: 'Renegade Legacy Pack',
    author: 'Square Based',
    url: 'https://squarebased.com/',
    official: false,
    terms: 'Free to use in whole or in part (squarebased.com)',
  },
  status: 'draft',
  scope: 'points-only',
  units,
  magicItems: bigNames.length ? { 'big-names': bigNames } : {},
};

console.error(`${src}`);
console.error(`  profiles parsed:   ${profiles.length}`);
console.error(`  matched to base:   ${repriced + unchanged}  (repriced ${repriced}, unchanged ${unchanged})`);
console.error(`  UNMATCHED:         ${unmatched.length}${unmatched.length ? ' -> ' + unmatched.map((u) => `${u.name} ${u.points}`).join(', ') : ''}`);
console.error(`  base units total:  ${baseUnits.length}  (so ${baseUnits.length - repriced - unchanged} have NO pack profile and keep base points)`);
console.error(`  big names changed: ${bigNames.length}${bigNames.length ? ' -> ' + bigNames.map((b) => `${b.name_en} ${b.points}`).join(', ') : ''}`);
console.error('  NOT extracted:     stat lines, option/equipment changes, rules text, other magic-item categories');

process.stdout.write(`${JSON.stringify(overlay, null, 2)}\n`);
