// Reprice units in a composition overlay from the colour-marked reference extraction.
//
//   node scripts/import-renegade-units.mjs            # all six packs
//   node scripts/import-renegade-units.mjs de         # one pack
//
// WHY THIS REPLACES THE STATLINE HALF OF import-renegade.mjs. That script reads a Google-Docs TEXT
// export and identifies a profile as "a name line followed by ten numbers". It works, but it can only
// see what a model is CALLED, and the packs reuse model names: "Bloodletter" is the rank-and-file row of
// both Bloodletters of Khorne (13/model) and Bloodcrushers of Khorne (65/model). The reference carries
// `headingPath`, so a table's unit is the heading it sits under — which is the only thing that tells
// those two apart.
//
// It MERGES into the overlay: entries already present that this importer cannot see are kept, and a
// conflict (both sources claiming a different price for the same unit) is reported and NOT applied,
// because silently picking one would hide a real disagreement about points.
import { readFileSync, writeFileSync } from 'node:fs';

const PACKS = {
  ok: 'ogre-kingdoms', de: 'dark-elves', sk: 'skaven',
  cd: 'chaos-dwarfs', doc: 'daemons-of-chaos', lm: 'lizardmen',
};
const only = process.argv[2];
const REN = new URL('../public/renegade/', import.meta.url);
const OWB = new URL('../public/owb/', import.meta.url);

const norm = (s) => String(s).toLowerCase().replace(/\{[^}]*\}/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** English-irregular-aware plurals: the packs head a statblock with the SINGULAR model name while the
 *  catalogue names the unit in the plural, and the cases that matter are not "+s"
 *  (Crossbowman→Crossbowmen, Witch Elf→Witch Elves, Harpy→Harpies). */
const plurals = (w) => {
  const o = new Set([w, `${w}s`, `${w}es`]);
  if (/man$/.test(w)) o.add(w.replace(/man$/, 'men'));
  if (/fe$/.test(w)) o.add(w.replace(/fe$/, 'ves'));
  else if (/f$/.test(w)) o.add(w.replace(/f$/, 'ves'));
  if (/[^aeiou]y$/.test(w)) o.add(w.replace(/y$/, 'ies'));
  return [...o];
};
const variants = (n) => {
  const w = n.split(' ');
  const out = new Set([n]);
  for (const p of plurals(w[w.length - 1])) out.add([...w.slice(0, -1), p].join(' '));
  if (w.length > 1) for (const p of plurals(w[0])) out.add([p, ...w.slice(1)].join(' '));
  return [...out];
};
/** Whole-word subsequence, so the catalogue may carry qualifiers the pack drops
 *  ("Bloodletter" ↔ "Bloodletters of Khorne"). */
const subseq = (hay, words) => {
  const h = hay.split(' ');
  let i = 0;
  for (const w of words) { const at = h.indexOf(w, i); if (at < 0) return false; i = at + 1; }
  return true;
};

let grandTotal = { repriced: 0, unchanged: 0, kept: 0, conflicts: 0, todo: 0 };
for (const [key, army] of Object.entries(PACKS)) {
  if (only && only !== key) continue;
  const refPath = new URL(`${key}-renegade-v2-reference.json`, REN);
  const overlayPath = new URL(`${key}-renegade-v2.json`, REN);
  const ref = JSON.parse(readFileSync(refPath, 'utf8'));
  const cat = JSON.parse(readFileSync(new URL(`${army}.json`, OWB), 'utf8'));
  const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));

  // name → every catalogue occurrence; a unit can legitimately sit in two categories (War Hydra is
  // both Special and Rare) and both must be repriced or one keeps a stale price.
  const byName = new Map();
  for (const [category, arr] of Object.entries(cat)) {
    if (!Array.isArray(arr)) continue;
    for (const u of arr) {
      const k = norm(u.name_en);
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push({ id: u.id, name: u.name_en, points: u.points, category });
    }
  }
  /** AMBIGUITY IS REFUSED: if the variants reach more than one distinct catalogue NAME, return nothing.
   *  A wrong match silently reprices the wrong unit, which is worse than leaving it at base points. */
  const resolve = (name) => {
    const n = norm(name);
    if (!n) return null;
    const vs = variants(n);
    for (const v of vs) { const hit = byName.get(v); if (hit) return hit; }
    const hits = [];
    for (const [k, list] of byName) if (vs.some((v) => subseq(k, v.split(' ')))) hits.push(...list);
    return new Set(hits.map((h) => norm(h.name))).size === 1 ? hits : null;
  };

  const fromRef = new Map();
  const unresolved = [];
  let todo = 0;
  for (const b of ref.blocks) {
    if (b.tableType !== 'statline' || !Array.isArray(b.statlineRows)) continue;
    // Yellow marks the pack's OWN unfinished work. Importing work-in-progress as a settled rule is worse
    // than leaving the base value, so it is skipped and counted.
    if ((b.changeKinds || []).includes('todo')) { todo++; continue; }

    // A priced row is the rank-and-file of a multi-model unit or the base model of a single model /
    // character. Champion rows are "+7" modifiers and crew/mounts are "-" (included in the price).
    const priced = b.statlineRows.filter((r) => (r.role === 'rank-and-file' || r.role === 'base-model')
      && r.points && !r.points.modifier && typeof r.points.value === 'number');
    if (!priced.length) continue;

    const heading = (b.headingPath || []).slice(-1)[0] || '';
    const viaHeading = resolve(heading);
    if (viaHeading) {
      // The heading names the unit, so its price is the FIRST priced row; later priced rows are
      // components sold with it — "Salamander 65" then "Skink Handler x3 5" is one unit, not two.
      for (const h of viaHeading) fromRef.set(h.id, { name: h.name, points: priced[0].points.value, base: h.points });
    } else {
      // The heading is a GROUP ("Dark Elf Sorceresses"), so each priced row is a unit in its own right.
      for (const r of priced) {
        const hits = resolve(r.name);
        if (!hits) { unresolved.push(`${heading} / ${r.name} = ${r.points.value}`); continue; }
        for (const h of hits) fromRef.set(h.id, { name: h.name, points: r.points.value, base: h.points });
      }
    }
  }

  // ── merge ──────────────────────────────────────────────────────────────────────────────────────
  const units = { ...overlay.units };
  const conflicts = [];
  const added = [];
  let unchanged = 0;
  for (const [id, f] of fromRef) {
    if (f.points === f.base) { unchanged++; continue; }   // pack agrees with the catalogue
    const prev = units[id];
    if (prev && prev.points !== f.points) {
      // Two independent readings of the same document disagree about a POINTS value. Report it rather
      // than choosing: one of them is wrong and the difference has to be looked at.
      conflicts.push(`${f.name}: reference ${f.points} vs existing ${prev.points}`);
      continue;
    }
    if (!prev) added.push(`${f.name} ${f.base}->${f.points}`);
    units[id] = { points: f.points, _was: f.base, _changed: ['points'] };
  }
  const kept = Object.keys(overlay.units).filter((id) => !fromRef.has(id));

  overlay.units = units;
  writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);

  grandTotal.repriced += Object.keys(units).length;
  grandTotal.unchanged += unchanged;
  grandTotal.kept += kept.length;
  grandTotal.conflicts += conflicts.length;
  grandTotal.todo += todo;

  console.error(`\n${key} — ${army}`);
  console.error(`  repricings in overlay : ${Object.keys(units).length}  (was ${Object.keys(overlay.units).length - added.length})`);
  console.error(`  new from reference    : ${added.length}${added.length ? ' -> ' + added.join(', ') : ''}`);
  console.error(`  kept (not seen here)  : ${kept.length}${kept.length ? ' -> ' + kept.join(', ') : ''}`);
  console.error(`  pack agrees with base : ${unchanged}`);
  console.error(`  todo tables skipped   : ${todo}`);
  if (conflicts.length) console.error(`  CONFLICTS (not applied): ${conflicts.join('; ')}`);
  if (unresolved.length) console.error(`  unmatched rows (${unresolved.length}): ${unresolved.slice(0, 5).join(' | ')}`);
}
console.error(`\ntotal: ${grandTotal.repriced} repricings · ${grandTotal.kept} kept from the older importer · `
  + `${grandTotal.unchanged} confirmed identical to base · ${grandTotal.todo} todo tables skipped · ${grandTotal.conflicts} conflicts`);
