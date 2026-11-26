// Zoekresultaten per kanaal samenvatten: welke kanalen kennen we nog niet, en met welke titels.
//   node zoekanalyse.mjs [--min=2] [--kanaal=naam]
import fs from 'node:fs';
import path from 'node:path';
const { CACHE, PUB, leesJson } = await import('file:///D:/CLAUDE%20CODE/tow-companion/tactics/lib.mjs');
const { OW } = await import('./regels3.mjs');
const zoek = leesJson(path.join(CACHE, 'ronde3-zoek.json'), {});
const bronnen = leesJson(path.join(PUB, 'bronnen.json'));
const bekendNaam = new Set(bronnen.kanalen.map((k) => k.naam.toLowerCase().replace(/[^a-z0-9]/g, '')));
const bekendId = new Set();
for (const f of fs.readdirSync(CACHE).filter((f) => f.startsWith('videos-'))) { const d = leesJson(path.join(CACHE, f)); if (d.channelId) bekendId.add(d.channelId); }
const extra = ['oldworldtactics', 'dawiafterdark', 'facehammer', 'squarebasedoldworld'];
extra.forEach((x) => bekendNaam.add(x));
const min = Number(process.argv.find((a) => a.startsWith('--min='))?.split('=')[1] ?? 2);
const alleen = process.argv.find((a) => a.startsWith('--kanaal='))?.split('=')[1];
const per = new Map();
for (const [q, lijst] of Object.entries(zoek)) for (const v of lijst) {
  const naam = v.kanaal ?? '?';
  const key = v.channelId ?? naam;
  if (!per.has(key)) per.set(key, { naam, channelId: v.channelId, url: v.kanaalUrl, videos: new Map(), queries: new Set() });
  const p = per.get(key);
  p.videos.set(v.id, v); p.queries.add(q);
}
const rijen = [...per.values()].map((p) => {
  const bekend = bekendId.has(p.channelId) || bekendNaam.has(p.naam.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const vids = [...p.videos.values()];
  const ow = vids.filter((v) => OW.test(v.titel) || /warhammer/i.test(v.titel));
  return { ...p, bekend, n: vids.length, nOW: ow.length, vids };
}).filter((r) => r.nOW >= min || (alleen && r.naam.toLowerCase().includes(alleen.toLowerCase())));
rijen.sort((a, b) => b.nOW - a.nOW);
for (const r of rijen) {
  if (alleen && !r.naam.toLowerCase().includes(alleen.toLowerCase())) continue;
  console.log(`${r.bekend ? 'BEKEND' : 'NIEUW '} ${r.nOW}/${r.n} ${r.naam} ${r.url ?? ''} ${r.channelId ?? ''}`);
  if (!r.bekend || alleen) for (const v of r.vids.slice(0, alleen ? 99 : 8)) console.log(`     ${v.id} ${Math.round((v.duurSec ?? 0) / 60)}m ${v.titel.slice(0, 100)}`);
}
