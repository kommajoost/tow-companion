// Dumps the full wiki table of contents as source material for deciding which sections
// belong in which turn phase. For every nav section, lists its (deduped) child rules with
// a one-line excerpt. Sequence/overview/chart duplicates are dropped.
// Run: node scripts/dump-toc.mjs > toc.txt

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const d = JSON.parse(await readFile(join(ROOT, 'public', 'rules.json'), 'utf8'));
const R = d.rules;

function plain(node) {
  if (!node) return '';
  if (node.nodeType === 'text') return node.value || '';
  const inner = (node.content || []).map(plain).join('');
  if (/^(paragraph|heading|list-item|table-row|table-cell|table-header-cell|blockquote)/.test(node.nodeType))
    return inner + ' ';
  return inner;
}
const firstSentence = (r) => {
  const t = plain(r.body).replace(/\s+/g, ' ').trim();
  const m = t.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : t).slice(0, 130).trim();
};
const isNoise = (s) =>
  s.endsWith('-sequence') || s.endsWith('-chart') ||
  ['the-turn-sequence', 'quick-reference'].includes(s);

const nav = d.nav;
for (const sec of nav) {
  const kids = sec.childSlugs.filter((x) => x !== sec.slug && !isNoise(x));
  console.log(`\n\n############ ${sec.name} [${sec.slug}] — ${kids.length} ############`);
  for (const s of kids) {
    const r = R[s];
    if (!r) continue;
    console.log(`  • [${s}] ${r.name}`);
    console.log(`      ${firstSentence(r)}`);
  }
}
