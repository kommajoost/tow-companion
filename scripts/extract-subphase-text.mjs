// Dumps, per sub-phase in companion.json, the verbatim rule text (bodyIndex) of every
// rule it references. This is the source material for authoring the "Quick" summaries.
// Run: node scripts/extract-subphase-text.mjs > subphase-text.txt

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const c = JSON.parse(await readFile(join(ROOT, 'public', 'companion.json'), 'utf8'));
const d = JSON.parse(await readFile(join(ROOT, 'public', 'rules.json'), 'utf8'));
const R = d.rules;

// Flatten a Contentful rich-text node to plain text. The `bodyIndex` field is empty
// for many rules, so we always derive text from the real `body`.
function plain(node) {
  if (!node) return '';
  if (node.nodeType === 'text') return node.value || '';
  const inner = (node.content || []).map(plain).join('');
  // Add spacing after block-level nodes so words don't run together.
  if (/^(paragraph|heading|list-item|table-row|table-cell|table-header-cell|blockquote)/.test(node.nodeType))
    return inner + ' ';
  return inner;
}
const ruleText = (r) => plain(r.body).replace(/\s+/g, ' ').trim();

for (const p of c.phases) {
  console.log(`\n\n#################### PHASE: ${p.name} [${p.id}] ####################`);
  p.subs.forEach((s, si) => {
    console.log(`\n======== SUB ${si + 1}: ${s.name} ========`);
    console.log(`INTRO: ${s.intro}`);
    const rulesTab = s.tabs.find((t) => t.id === 'rules') || s.tabs[s.tabs.length - 1];
    for (const b of rulesTab.blocks) {
      if (b.type !== 'rule') continue;
      const r = R[b.slug];
      if (!r) { console.log(`  [MISSING ${b.slug}]`); continue; }
      console.log(`\n  --- ${r.name} [${b.slug}] ---`);
      console.log(`  ${ruleText(r)}`);
    }
  });
}
