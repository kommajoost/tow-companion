// Overzicht per kanaal: aandeel OW-titels en regel-soorten. node overzicht.mjs [kanaal] [--alle|--soort=x]
import fs from 'node:fs';
import path from 'node:path';
const { CACHE, leesJson } = await import('file:///D:/CLAUDE%20CODE/tow-companion/tactics/lib.mjs');
const { regel, OW } = await import('./regels3.mjs');
const bekend = new Set(['2pluspodcast', 'square-based', 'old-world-legends', 'hammerhobby', 'zen-fox-games', 'facehammer-tv']);
const args = process.argv.slice(2);
const alleen = args.find((a) => !a.startsWith('--'));
const soortF = args.find((a) => a.startsWith('--soort='))?.split('=')[1];
const modusF = args.find((a) => a.startsWith('--modus='))?.split('=')[1];
for (const f of fs.readdirSync(CACHE).filter((f) => f.startsWith('videos-'))) {
  const d = leesJson(path.join(CACHE, f));
  if (bekend.has(d.kanaalId) || (alleen && d.kanaalId !== alleen)) continue;
  const ow = d.videos.filter((v) => OW.test(v.titel + ' ' + v.playlists.join(' '))).length;
  const modus = modusF ?? 'gemengd';
  const tel = {};
  for (const v of d.videos) { const r = regel(modus, v); const k = r.relevant ? r.soort : 'NOT'; tel[k] = (tel[k] ?? 0) + 1; v._r = r; }
  console.log(`${d.kanaalId}: ${d.videos.length} video's, ${ow} OW-titel, playlists: ${d.playlists.map((p) => p.titel).join(' / ').slice(0, 300)}`);
  console.log('  ', JSON.stringify(tel));
  if (alleen) for (const v of d.videos) {
    const k = v._r.relevant ? v._r.soort : 'NOT';
    if (soortF && k !== soortF) continue;
    if (args.includes('--kort') && (['NOT', 'meta', 'battle-report'].includes(k) || (v.duurSec ?? 999) < 180)) continue;
    const afk = { tactics: 'T', 'army-review': 'A', other: 'o', 'rules-explained': 'R', 'list-building': 'L', meta: 'M', 'battle-report': 'B', NOT: 'x' }[k];
    console.log(`${v.id} ${afk} ${Math.round((v.duurSec ?? 0) / 60)}m ${v.titel.slice(0, 110)}${args.includes('--pl') && v.playlists.length ? ' [' + v.playlists.join('; ').slice(0, 60) + ']' : ''}`);
  }
}
