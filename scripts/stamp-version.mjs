// Stamp package.json `version` = <major>.<minor>.<git commit count>, using the LOCAL full git
// history. Run this before every deploy (`npm run stamp-version`), then commit + push — Vercel
// shallow-clones the repo, so it can't count commits itself; it reads the version we bake here.
// The patch therefore climbs by (at least) one on every deploy, so Settings shows a fresh number.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const url = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(url, 'utf8'));
const count = execSync('git rev-list --count HEAD').toString().trim();
const [maj = '0', min = '1'] = pkg.version.split('.');
const next = `${maj}.${min}.${count}`;

if (next === pkg.version) {
  console.log(`version unchanged (${next}) — no new commits since last stamp`);
} else {
  pkg.version = next;
  writeFileSync(url, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`version → ${next}`);
}
