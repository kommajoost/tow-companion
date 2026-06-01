// Adds an "In Detail" tab (collapsible deeper rules) to the sub-phases where the wiki's
// deeper sections apply during play: Movement in Detail (split across the Movement
// sub-phases) and The Psychology of War (at the Shooting panic step).
// Rules are referenced by slug and rendered verbatim as collapsible accordions.
// Idempotent: re-running replaces any existing "detail" tab. Run:
//   node scripts/add-detail-tabs.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cPath = join(ROOT, 'public', 'companion.json');
const c = JSON.parse(await readFile(cPath, 'utf8'));
const d = JSON.parse(await readFile(join(ROOT, 'public', 'rules.json'), 'utf8'));
const R = d.rules;

// phase id → sub-phase name → ordered detail slugs to surface there.
const PLACEMENT = {
  movement: {
    'Declare Charges': [
      'redirecting-a-charge', 'charging-a-fleeing-enemy',
      'multiple-charging-units', 'multiple-charge-targets',
    ],
    'Charge Moves': [
      'the-charge-move', 'manoeuvring-during-a-charge', 'aligning-to-the-enemy',
      'flank-and-rear-charges', 'resolving-uncertainties', 'unusual-situations-charging',
      'unable-to-align', 'disordered-charge', 'charging-through-terrain',
      'running-down-the-foe', 'accidental-contact',
      'accidental-contact-when-running-down-the-foe', 'accidental-contact-during-a-charge',
      'halting-a-charge', 'continuing-ahead',
    ],
    'Compulsory Moves': [
      'flee', 'direction-of-flight', 'fleeing-from-an-enemy-unit',
      'fleeing-as-a-compulsory-move', 'the-flee-move', 'destruction-of-a-fleeing-unit',
      'fleeing-through-friendly-units', 'fleeing-through-enemy-units',
      'fleeing-through-terrain', 'the-greater-the-danger', 'the-limits-of-endurance',
      'give-ground-and-fall-back-in-good-order', 'give-ground', 'fall-back-in-good-order',
    ],
    'Remaining Moves': [
      'basic-movement', 'marching', 'enemy-sighted', 'manoeuvres', 'wheel', 'turn',
      'move-backwards', 'move-sideways', 'redress-the-ranks', 'reform', 'pivoting',
      'the-ends-of-the-world', 'lone-models', 'different-formations',
      'moving-off-the-battlefield', 'reinforcements', 'conveyance-spells',
      'oddball-stuff-movement', 'terrain-and-movement', 'open-ground-and-hills-movement',
      'difficult-terrain-movement', 'low-linear-obstacles-movement',
      'dangerous-terrain-movement', 'impassable-terrain-movement',
      'high-linear-obstacles-movement', 'woods-movement', 'battlefield-decoration-movement',
    ],
  },
  shooting: {
    // The Psychology of War — panic is tested here.
    'Remove Casualties & Panic': [
      'panic-tests', 'no-need-for-hysterics-psychology', 'common-causes-of-panic',
      'heavy-casualties', 'nearby-friend-destroyed', 'nearby-friend-flees-combat',
      'fled-through',
    ],
  },
};

let added = 0;
let blocks = 0;
const missing = [];
for (const phase of c.phases) {
  const map = PLACEMENT[phase.id];
  if (!map) continue;
  for (const sub of phase.subs) {
    const slugs = map[sub.name];
    if (!slugs) continue;
    const valid = slugs.filter((s) => {
      if (!R[s]) { missing.push(`${phase.id}/${sub.name} -> ${s}`); return false; }
      return true;
    });
    sub.tabs = sub.tabs.filter((t) => t.id !== 'detail');
    sub.tabs.push({
      id: 'detail',
      label: 'In Detail',
      blocks: valid.map((slug) => ({ type: 'detail', slug })),
    });
    added++;
    blocks += valid.length;
  }
}

await writeFile(cPath, JSON.stringify(c, null, 2) + '\n');
console.log(`Added/updated "In Detail" tab on ${added} sub-phases (${blocks} rules).`);
console.log(missing.length ? `MISSING slugs:\n  ${missing.join('\n  ')}` : 'All detail slugs valid.');
