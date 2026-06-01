import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const c = JSON.parse(await readFile(join(ROOT, 'public', 'companion.json'), 'utf8'));
const d = JSON.parse(await readFile(join(ROOT, 'public', 'rules.json'), 'utf8'));
const R = d.rules;

const emptyIdx = [];
const emptyBody = [];
for (const p of c.phases)
  for (const s of p.subs)
    for (const t of s.tabs)
      for (const b of t.blocks)
        if (b.type === 'rule') {
          const r = R[b.slug];
          if (!r) continue;
          if (!(r.bodyIndex || '').trim()) emptyIdx.push(`${p.id}/${b.slug}`);
          if (!r.body) emptyBody.push(b.slug);
        }

const byPhase = {};
for (const x of emptyIdx) {
  const k = x.split('/')[0];
  byPhase[k] = (byPhase[k] || 0) + 1;
}
console.log('empty bodyIndex count:', emptyIdx.length, JSON.stringify(byPhase));
console.log('empty body (displayed) count:', emptyBody.length, emptyBody.join(', ') || '(none)');
