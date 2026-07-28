// Reprice UNIT OPTIONS in a composition overlay from the colour-marked reference extraction.
//
//   node scripts/import-renegade-options.mjs           # all six packs
//   node scripts/import-renegade-options.mjs de        # one pack
//
// Unit points come from import-renegade-units.mjs; this handles the money spent on top of a unit —
// command upgrades, weapons, armour, mounts, special-rule buys. Those are points, so a wrong one is a
// wrong list total.
//
// ATTRIBUTION is by DOCUMENT ORDER, not by headingPath. headingPath is authoritative for statline
// TABLES (it is what separates Bloodletters of Khorne from Bloodcrushers), but on option blocks it is
// often stale or a lead-in line: the Lizardmen character options carry
// ["Lore Of Lustria","Monsoon","Palanquin","Options:"] for what the text itself calls a Saurus Oldblood.
// So the current unit is whichever statline table most recently resolved against the catalogue — which
// is how a reader attributes them, and it is present everywhere.
//
// THREE THINGS ARE REFUSED RATHER THAN GUESSED. Each would silently corrupt a list total:
//
//  1. A DIFFERENT BASIS. The packs state "per model" / "per unit" and the catalogue carries the same
//     distinction as `perModel`. "6 per model" against "12 per unit" is not a price cut, and comparing
//     them produced three false changes before this guard existed.
//
//  2. EXCLUSIVE (radio) OPTIONS. The packs price tiers INCREMENTALLY while the catalogue prices them
//     ABSOLUTELY. The Herald of Nurgle is already a Level 1 Wizard and the pack offers
//     "Level 1 Wizard +30 · Level 2 Wizard +30" — a further 30 on top — where the catalogue says
//     Level 1 = 30, Level 2 = 60. Both describe the same cost. Importing the 30 would have made every
//     Level 2 Herald 30 points too cheap.
//
//  3. AMBIGUOUS LABELS. If a pack label matches more than one of the unit's options, nothing is written.
//
// Everything refused is printed, so the gap is visible rather than implied.
import { readFileSync, writeFileSync } from 'node:fs';

const PACKS = {
  ok: 'ogre-kingdoms', de: 'dark-elves', sk: 'skaven',
  cd: 'chaos-dwarfs', doc: 'daemons-of-chaos', lm: 'lizardmen',
};
const only = process.argv[2];
const REN = new URL('../public/renegade/', import.meta.url);
const OWB = new URL('../public/owb/', import.meta.url);

const norm = (s) => String(s).toLowerCase().replace(/\{[^}]*\}/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const plurals = (w) => {
  const o = new Set([w, `${w}s`, `${w}es`]);
  if (/man$/.test(w)) o.add(w.replace(/man$/, 'men'));
  if (/fe$/.test(w)) o.add(w.replace(/fe$/, 'ves'));
  else if (/f$/.test(w)) o.add(w.replace(/f$/, 'ves'));
  if (/[^aeiou]y$/.test(w)) o.add(w.replace(/y$/, 'ies'));
  if (/ies$/.test(w)) o.add(w.replace(/ies$/, 'y'));
  if (/ves$/.test(w)) { o.add(w.replace(/ves$/, 'f')); o.add(w.replace(/ves$/, 'fe')); }
  if (/men$/.test(w)) o.add(w.replace(/men$/, 'man'));
  if (/es$/.test(w)) o.add(w.replace(/es$/, ''));
  if (/[^s]s$/.test(w)) o.add(w.replace(/s$/, ''));
  return [...o];
};
const variants = (n) => {
  const w = n.split(' ');
  const out = new Set([n]);
  for (const p of plurals(w[w.length - 1])) out.add([...w.slice(0, -1), p].join(' '));
  if (w.length > 1) for (const p of plurals(w[0])) out.add([p, ...w.slice(1)].join(' '));
  return [...out];
};
const subseq = (hay, words) => {
  const h = hay.split(' ');
  let i = 0;
  for (const w of words) { const at = h.indexOf(w, i); if (at < 0) return false; i = at + 1; }
  return true;
};

const GROUPS = ['equipment', 'armor', 'options', 'command', 'mounts'];

/** Drop repeats of the same source line for the same unit.
 *
 *  Keyed on the unit NAME, not its id: a unit that sits in two catalogue categories has a DIFFERENT id
 *  per entry (`flesh-hounds-of-khorne` and `flesh-hounds-of-khorne-core`), so an id-based key does not
 *  collapse them and every option line of such a unit appears twice. It is one line in the source and
 *  belongs on screen once. */
const dedupe = (rows) => {
  const seen = new Set();
  return rows.filter((r) => {
    const k = `${r.unit}|${r.label ?? r.option}|${r.points}|${r.reason ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
/** "+6 points per unit" · "+1 point per model" · "+30 points" */
const PRICE = /^(.*?)\s*\+\s*(\d{1,3})\s*points?(\s*(?:per|\/)\s*(model|unit))?\s*\.?$/i;
/** The verbiage the packs put in front of the thing being bought. */
const LEAD = /^(any unit may|a [a-z' ]+ may|the [a-z' ]+ may|may be mounted on|may be|may take|may have|may purchase|take|have|be equipped with|be|upgrade one model to|upgrade one)\b\s*/i;

let G = { changed: 0, refusedBasis: 0, refusedExclusive: 0, refusedAmbiguous: 0, unmatched: 0, todo: 0 };
for (const [key, army] of Object.entries(PACKS)) {
  if (only && only !== key) continue;
  const overlayPath = new URL(`${key}-renegade-v2.json`, REN);
  const ref = JSON.parse(readFileSync(new URL(`${key}-renegade-v2-reference.json`, REN), 'utf8'));
  const cat = JSON.parse(readFileSync(new URL(`${army}.json`, OWB), 'utf8'));
  const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));

  const byName = new Map();
  for (const [category, arr] of Object.entries(cat)) {
    if (!Array.isArray(arr)) continue;
    for (const u of arr) {
      const k = norm(u.name_en);
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push({ ...u, category });
    }
  }
  const resolveUnit = (name) => {
    const n = norm(name);
    if (!n) return null;
    const vs = variants(n);
    for (const v of vs) { const hit = byName.get(v); if (hit) return hit; }
    const hits = [];
    for (const [k, list] of byName) if (vs.some((v) => subseq(k, v.split(' ')))) hits.push(...list);
    return new Set(hits.map((h) => norm(h.name_en))).size === 1 ? hits : null;
  };
  /** A unit's priceable options, including one level of nesting, carrying the flags the guards need. */
  const optionsOf = (u) => {
    const out = [];
    for (const g of GROUPS) {
      (u[g] || []).forEach((o, i) => {
        out.push({ group: g, name: o.name_en, points: o.points, perModel: !!o.perModel, exclusive: !!o.exclusive });
        (o.options || []).forEach((s) => out.push({
          group: g, name: s.name_en, points: s.points, perModel: !!s.perModel, exclusive: !!s.exclusive,
        }));
      });
    }
    return out;
  };

  const patches = new Map();     // unitId → Map(optionName → patch)
  const refused = [];
  const unmatched = [];
  // Machine-readable audit of everything NOT applied, written to a separate review file for
  // /check/renegade.html. Deliberately not folded into the overlay: the app fetches that on every
  // Renegade list and has no use for diagnostics.
  const review = { applied: [], refused: [], unmatched: [] };
  let cur = null;
  let todo = 0;

  for (const b of ref.blocks) {
    if (b.tableType === 'statline' && Array.isArray(b.statlineRows)) {
      // A statline table means a new unit entry starts here. If its heading does NOT resolve against the
      // catalogue, the anchor is CLEARED rather than left on the previous unit: carrying it over silently
      // files the new unit's options under the old one. That is what put the Saurus Oldblood's
      // "Additional hand weapon +3" on the Slann Mage-Priest, which has no such option at all.
      cur = resolveUnit((b.headingPath || []).slice(-1)[0] || '');
      continue;
    }
    // Yellow is the pack flagging its own unfinished work.
    if ((b.changeKinds || []).includes('todo')) { todo++; continue; }

    const texts = [];
    if (b.type === 'list' && Array.isArray(b.items)) {
      for (const it of b.items) texts.push(typeof it === 'string' ? it : it.text || '');
    } else if (b.type === 'paragraph') texts.push(b.text || '');

    for (const raw of texts) {
      const line = raw.replace(/\s+/g, ' ').trim();
      const m = PRICE.exec(line);
      if (!m || !cur) continue;
      // Strip the lead-in REPEATEDLY: the packs stack it ("Any unit may upgrade one model to a
      // Pyroclaster"), and one pass leaves "upgrade one model to a Pyroclaster", which matches nothing.
      let label = m[1];
      for (let n = 0; n < 4; n++) {
        const next = label.replace(LEAD, '').replace(/^(a|an|the)\s+/i, '');
        if (next === label) break;
        label = next;
      }
      label = label.replace(/\(.*?\)/g, '').trim();
      if (!label) continue;
      const points = Number(m[2]);
      // null = the line states no basis at all. That is NOT an assertion of "per unit": most character
      // options simply say "+4 points" because the entry is a single model and the distinction is moot.
      // Treating absence as per-unit produced a wave of bogus refusals where both sides read the same
      // number ("Additional hand weapon: pack 3/unit vs base 3/model").
      const packBasis = m[4] ? (/model/i.test(m[4]) ? 'model' : 'unit') : null;

      for (const u of cur) {
        const opts = optionsOf(u);
        let hit = opts.find((o) => norm(o.name) === norm(label));
        if (!hit) {
          const loose = opts.filter((o) => norm(o.name) && subseq(norm(o.name), norm(label).split(' ')));
          const names = new Set(loose.map((o) => norm(o.name)));
          if (names.size > 1) {
            refused.push(`${u.name_en} · "${label}" is ambiguous (${[...names].join(' / ')})`);
            review.refused.push({ unitId: u.id, unit: u.name_en, label, points, basis: packBasis, raw: line, reason: 'ambiguous', candidates: [...names] });
            G.refusedAmbiguous++;
            continue;
          }
          if (loose.length === 1) [hit] = loose;
        }
        if (!hit || typeof hit.points !== 'number') {
          unmatched.push(`${u.name_en} · ${label} +${points}`);
          review.unmatched.push({ unitId: u.id, unit: u.name_en, label, points, basis: packBasis, raw: line });
          continue;
        }
        // Only an EXPLICIT, conflicting basis blocks the comparison.
        if (packBasis && (packBasis === 'model') !== hit.perModel) {
          refused.push(`${u.name_en} · ${hit.name}: pack ${points}/${packBasis} vs base ${hit.points}/${hit.perModel ? 'model' : 'unit'} — different basis`);
          review.refused.push({ unitId: u.id, unit: u.name_en, label, option: hit.name, group: hit.group, points, basePoints: hit.points, basis: packBasis, baseBasis: hit.perModel ? 'model' : 'unit', raw: line, reason: 'basis' });
          G.refusedBasis++;
          continue;
        }
        if (hit.points === points) continue;                    // agrees with the catalogue
        if (hit.exclusive) {
          refused.push(`${u.name_en} · ${hit.name}: pack ${points} vs base ${hit.points} — exclusive tier, pack prices these incrementally`);
          review.refused.push({ unitId: u.id, unit: u.name_en, label, option: hit.name, group: hit.group, points, basePoints: hit.points, raw: line, reason: 'exclusive-tier' });
          G.refusedExclusive++;
          continue;
        }
        if (!patches.has(u.id)) patches.set(u.id, new Map());
        patches.get(u.id).set(hit.name, { group: hit.group, name_en: hit.name, points, _was: hit.points });
        review.applied.push({ unitId: u.id, unit: u.name_en, option: hit.name, group: hit.group, points, basePoints: hit.points, raw: line });
      }
    }
  }

  // ── merge into the overlay ─────────────────────────────────────────────────────────────────────
  // Written by NAME, not by the `<group>/<index>` key the engine uses at runtime. Indices shift
  // whenever `npm run sync-owb` regenerates the catalogue, and a shifted index would reprice a
  // different option silently; a name that no longer exists simply does not apply.
  const units = { ...overlay.units };
  let changed = 0;
  for (const [id, byOpt] of patches) {
    const list = [...byOpt.values()];
    if (!list.length) continue;
    const prev = units[id] ?? {};
    units[id] = { ...prev, options: list, _changed: [...new Set([...(prev._changed ?? []), 'options'])] };
    changed += list.length;
  }
  overlay.units = units;
  overlay.scope = 'points-and-rules';
  writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);

  // The review file. Its whole purpose is that the option lines the importer could NOT act on are
  // readable next to the source instead of living only in this script's stderr — so they can be checked
  // and the extraction improved. Written per pack, read only by /check/renegade.html.
  writeFileSync(new URL(`${key}-renegade-v2-review.json`, REN), `${JSON.stringify({
    id: `${key}-renegade-v2-review`,
    army,
    generatedFrom: `${key}-renegade-v2-reference.json`,
    what: 'Option price lines found in the pack, and what happened to each. `unmatched` = no option of '
      + 'that name on the unit, so it is either worded differently in the OWB catalogue or the pack adds '
      + 'a new option. `refused` = matched but deliberately not applied, with the reason.',
    stats: {
      applied: review.applied.length,
      refused: review.refused.length,
      unmatched: review.unmatched.length,
      todoBlocksSkipped: todo,
    },
    // Deduplicated: a unit that sits in two catalogue categories (War Hydra is Special AND Rare) is
    // resolved to both, so the same source line would otherwise be listed twice.
    applied: dedupe(review.applied),
    refused: dedupe(review.refused),
    unmatched: dedupe(review.unmatched),
  }, null, 2)}\n`);

  G.changed += changed; G.unmatched += unmatched.length; G.todo += todo;
  console.error(`\n${key} — ${army}`);
  console.error(`  option prices changed : ${changed} across ${patches.size} units`);
  for (const [id, byOpt] of patches) {
    for (const p of byOpt.values()) console.error(`    ${id} · ${p.name_en} ${p._was} -> ${p.points}${p.group ? ` (${p.group})` : ''}`);
  }
  if (refused.length) {
    console.error(`  REFUSED (${refused.length}):`);
    for (const r of refused) console.error(`    ${r}`);
  }
  console.error(`  no catalogue option   : ${unmatched.length}${unmatched.length ? ` -> ${unmatched.slice(0, 4).join(' | ')}${unmatched.length > 4 ? ' …' : ''}` : ''}`);
}
console.error(`\ntotal: ${G.changed} option prices changed · refused ${G.refusedBasis} basis, ${G.refusedExclusive} exclusive, ${G.refusedAmbiguous} ambiguous · ${G.unmatched} without a catalogue option · ${G.todo} todo blocks skipped`);
