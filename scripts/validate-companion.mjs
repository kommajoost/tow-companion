import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const c = JSON.parse(await readFile(join(ROOT, 'public', 'companion.json'), 'utf8'));
const d = JSON.parse(await readFile(join(ROOT, 'public', 'rules.json'), 'utf8'));
const R = d.rules;

const used = new Set();
const missing = [];
for (const p of c.phases)
  for (const s of p.subs)
    for (const t of s.tabs)
      for (const b of t.blocks)
        if (b.type === 'rule') {
          used.add(b.slug);
          if (!R[b.slug]) missing.push(`${p.id}/${s.name} -> ${b.slug}`);
        }

console.log(`rule blocks: ${used.size}`);
console.log(`missing slugs: ${missing.length ? '\n  ' + missing.join('\n  ') : 'none'}`);

const map = {
  strategy: 'the-strategy-phase',
  movement: 'the-movement-phase',
  shooting: 'the-shooting-phase',
  combat: 'the-combat-phase',
};
for (const [pid, pslug] of Object.entries(map)) {
  const kids = R[pslug].childSlugs.filter((s) => !s.endsWith('-sequence'));
  const notCovered = kids.filter((s) => !used.has(s));
  console.log(
    `[${pid}] ${kids.length} wiki steps · not covered: ${notCovered.length ? notCovered.join(', ') : 'none OK'}`,
  );
}
