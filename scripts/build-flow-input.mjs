// Deterministic extraction step for the "flow" enrichment.
//
// Reads public/rules.json and, for every turn step, gathers its body text plus each
// related rule (crossRefs + inline refs) with name + text + hint flags. The output
// (flow-input.json) is the input an AI pass classifies into flow blocks.
//
// Run with: node scripts/build-flow-input.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const STEP_TEXT_MAX = 1600;
const REL_TEXT_MAX = 700;

const NAV_SLUGS = new Set([
  'quick-reference',
  'the-turn-sequence',
  'overview-of-the-game',
]);
const isNav = (slug) =>
  NAV_SLUGS.has(slug) || slug.endsWith('-sequence') || slug.endsWith('-at-a-glance');

const clip = (s, n) => {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};

const db = JSON.parse(await readFile(join(ROOT, 'public', 'rules.json'), 'utf8'));
const R = db.rules;

// Build the list of phases for the walkthrough: the turn phases + Magic.
const phases = [...db.turn.phases.map((p) => ({ slug: p.slug, name: p.name, stepSlugs: p.stepSlugs }))];
if (db.turn.magicSlug && R[db.turn.magicSlug]) {
  const m = R[db.turn.magicSlug];
  phases.push({ slug: m.slug, name: m.name, stepSlugs: m.childSlugs.filter((s) => R[s]) });
}

const out = { source: db.source, phases: [] };

for (const phase of phases) {
  const siblingSet = new Set(phase.stepSlugs);
  const steps = [];
  for (const slug of phase.stepSlugs) {
    const r = R[slug];
    if (!r) continue;
    const relSlugs = [...new Set([...(r.crossRefSlugs || []), ...(r.refSlugs || [])])].filter(
      (x) => x !== slug && R[x],
    );
    const related = relSlugs.map((x) => ({
      slug: x,
      name: R[x].name,
      text: clip(R[x].bodyIndex, REL_TEXT_MAX),
      isSiblingStep: siblingSet.has(x),
      isNav: isNav(x),
    }));
    steps.push({
      slug,
      name: r.name,
      text: clip(r.bodyIndex, STEP_TEXT_MAX),
      related,
    });
  }
  out.phases.push({ slug: phase.slug, name: phase.name, steps });
}

await writeFile(join(ROOT, 'flow-input.json'), JSON.stringify(out, null, 2));
const totalSteps = out.phases.reduce((n, p) => n + p.steps.length, 0);
const totalRel = out.phases.reduce(
  (n, p) => n + p.steps.reduce((m, s) => m + s.related.length, 0),
  0,
);
console.log(
  `flow-input.json written: ${out.phases.length} phases, ${totalSteps} steps, ${totalRel} related links`,
);
for (const p of out.phases) console.log(`  ${p.name}: ${p.steps.length} steps`);
