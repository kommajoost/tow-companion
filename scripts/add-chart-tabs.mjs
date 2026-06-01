// Adds a "Charts" tab (quick-reference tables) to the sub-phases where the game's
// reference charts belong. Idempotent: re-running replaces any existing charts tab.
// Run: node scripts/add-chart-tabs.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cPath = join(ROOT, 'public', 'companion.json');
const c = JSON.parse(await readFile(cPath, 'utf8'));
const d = JSON.parse(await readFile(join(ROOT, 'public', 'rules.json'), 'utf8'));
const R = d.rules;

// phase id → sub-phase name → ordered chart slugs to surface there.
const PLACEMENT = {
  strategy: {
    'Conjuration': ['miscast-table-chart'],
  },
  shooting: {
    'Roll To Hit': ['to-hit-chart', 'to-hit-modifiers-chart', 'bs-of-6-or-higher-chart', '7-to-hit-chart'],
    'Roll To Wound & Saves': ['to-wound-chart', 'common-armour-types-chart'],
  },
  combat: {
    'Roll To Hit': ['to-hit-chart'],
    'Roll To Wound & Saves': ['to-wound-chart', 'common-armour-types-chart'],
    'Combat Result': ['combat-result-table-chart'],
  },
};

let added = 0;
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
    // Drop any pre-existing charts tab, then append a fresh one after the others.
    sub.tabs = sub.tabs.filter((t) => t.id !== 'charts');
    sub.tabs.push({
      id: 'charts',
      label: 'Charts',
      blocks: valid.map((slug) => ({ type: 'chart', slug })),
    });
    added++;
  }
}

await writeFile(cPath, JSON.stringify(c, null, 2) + '\n');
console.log(`Added/updated Charts tab on ${added} sub-phases.`);
console.log(missing.length ? `Missing chart slugs:\n  ${missing.join('\n  ')}` : 'All chart slugs valid.');
