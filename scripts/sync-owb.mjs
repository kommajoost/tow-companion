// Sync the army catalogue + rule/stat index from the Old World Builder project into public/owb/.
//
// Source: https://github.com/nthiebes/old-world-builder  (Creative Commons Attribution 4.0).
// We reuse their community-curated army composition data (units, points, equipment/options,
// special rules) and their wiki-exported rules index (which carries the M/WS/BS… stat profiles).
// Run with:  npm run sync-owb   — then commit public/owb/.
//
// NOTE: the underlying Warhammer: The Old World data is © Games Workshop; this is an unofficial,
// personal-use aid, on the same fan-use footing as our wiki scrape.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAW = 'https://raw.githubusercontent.com/nthiebes/old-world-builder/main';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'owb');

// The Old World army files in public/games/the-old-world/ (magic-items is item data, not an army).
const ARMIES = [
  'beastmen-brayherds', 'chaos-dwarfs', 'daemons-of-chaos', 'dark-elves',
  'dwarfen-mountain-holds', 'empire-of-man', 'grand-cathay', 'high-elf-realms',
  'kingdom-of-bretonnia', 'lizardmen', 'ogre-kingdoms', 'orc-and-goblin-tribes',
  'renegade-crowns', 'skaven', 'tomb-kings-of-khemri', 'vampire-counts',
  'warriors-of-chaos', 'wood-elf-realms',
];

const LOWER = new Set(['and', 'of', 'the']);
const titleCase = (slug) =>
  slug
    .split('-')
    .map((w, i) => (i > 0 && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

async function getJson(path) {
  const res = await fetch(`${RAW}/${path}`);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

async function main() {
  await mkdir(OUT, { recursive: true });

  // The shared rules + stat-profile index (keyed by normalised name).
  const rulesIndex = await getJson('src/components/rules-index/rules-index-export.json');
  await writeFile(join(OUT, 'rules-index.json'), JSON.stringify(rulesIndex));
  console.log(`rules-index.json  (${Object.keys(rulesIndex).length} entries)`);

  // Game metadata: per-army composition options, allies and mercenaries rules.
  const meta = await getJson('src/assets/the-old-world.json');
  await writeFile(join(OUT, 'the-old-world.json'), JSON.stringify(meta));
  console.log(`the-old-world.json  (${meta.armies.length} armies)`);

  // Each army's composition catalogue.
  const index = [];
  for (const slug of ARMIES) {
    const army = await getJson(`public/games/the-old-world/${slug}.json`);
    await writeFile(join(OUT, `${slug}.json`), JSON.stringify(army));
    const count = ['characters', 'core', 'special', 'rare', 'mercenaries', 'allies']
      .reduce((n, k) => n + (Array.isArray(army[k]) ? army[k].length : 0), 0);
    index.push({ slug, name: titleCase(slug), units: count });
    console.log(`${slug}.json  (${count} units)`);
  }

  await writeFile(join(OUT, 'index.json'), JSON.stringify({ source: RAW, syncedFrom: 'nthiebes/old-world-builder', armies: index }, null, 2));
  console.log(`\nindex.json  (${index.length} armies) → public/owb/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
