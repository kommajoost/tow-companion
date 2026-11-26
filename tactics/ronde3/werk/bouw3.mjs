// Ronde 3: kandidaten.json, kanalen.json, twijfel.json uit de kanaal-caches + regels + handbeslissingen.
//   node bouw3.mjs            schrijft de uitvoer
//   node bouw3.mjs --datums   haalt eerst ontbrekende uploaddatums op (één video tegelijk)
import path from 'node:path';
import fs from 'node:fs';
const { CACHE, PUB, ROOT, leesJson, schrijfJson, slaap, ytdlp } = await import('file:///D:/CLAUDE%20CODE/tow-companion/tactics/lib.mjs');
const HIER = path.dirname((await import('node:url')).fileURLToPath(import.meta.url));
const { regel, legerVan } = await import('./regels3.mjs');
const UIT = path.join(ROOT, 'tactics', 'ronde3');
const kanalen = leesJson(path.join(HIER, 'kanalen3.json'));
// Handbeslissingen per kanaal (hand/<kanaal>.json). Elke titel die de regels 'tactics' noemen is met de
// hand nagekeken; alleen wat hier als tactics staat blijft over (de rest: afgewezen na lezen van de titel).
const hand = {};
for (const f of fs.readdirSync(path.join(HIER, 'hand'))) Object.assign(hand, leesJson(path.join(HIER, 'hand', f)));
const metaPad = path.join(CACHE, 'ronde3-meta.json');
const meta = leesJson(metaPad, {});
const bronnen = leesJson(path.join(PUB, 'bronnen.json'));
const alBekend = new Set(bronnen.bronnen.map((b) => b.url?.match(/v=([\w-]{11})/)?.[1]).filter(Boolean));
const verwerkt = new Set(Object.keys(leesJson(path.join(ROOT, 'tactics', 'selectie.json')).videos));

const kandidaten = [];
const twijfel = [];
const telling = {};
const gezien = new Set();
for (const k of kanalen) {
  const d = leesJson(path.join(CACHE, `videos-${k.id}.json`));
  if (!d) { console.log(`${k.id}: geen cache`); continue; }
  const t = (telling[k.id] = { alle: d.videos.length, ow: 0, tactics: 0, twijfel: 0, dubbel: 0, kort: 0 });
  for (const v of d.videos) {
    const h = hand[v.id];
    const r = h ? { relevant: h.soort !== 'not-ow', soort: h.soort, reden: h.reden, leger: h.leger } : regel(k.modus, v);
    if (r.relevant) t.ow++;
    if (!h && r.soort === 'tactics') { t.regelAfgewezen = (t.regelAfgewezen ?? 0) + 1; continue; }
    const isTwijfel = r.soort === 'unclear';
    if (r.soort !== 'tactics' && !isTwijfel) continue;
    if (alBekend.has(v.id) || verwerkt.has(v.id) || gezien.has(v.id)) { t.dubbel++; continue; }
    const sec = meta[v.id]?.duurSec ?? v.duurSec;
    if (sec != null && sec < 180) { t.kort++; continue; }
    gezien.add(v.id);
    const legers = legerVan(v.titel);
    const item = {
      videoId: v.id, kanaalId: k.id, kanaal: k.naam, titel: v.titel, url: `https://www.youtube.com/watch?v=${v.id}`,
      datum: meta[v.id]?.datum ?? null, duurMin: sec ? Math.max(1, Math.round(sec / 60)) : null,
    };
    if (isTwijfel) { t.twijfel++; twijfel.push({ ...item, reden: r.reden }); continue; }
    t.tactics++;
    kandidaten.push({ ...item, soort: 'tactics', leger: h && 'leger' in h ? h.leger : (legers.length === 1 ? legers[0] : null), reden: r.reden });
  }
}

if (process.argv.includes('--datums')) {
  const todo = [...kandidaten, ...twijfel].filter((x) => !meta[x.videoId]);
  console.log(`${todo.length} datums ophalen`);
  for (const x of todo) {
    const out = ytdlp(['--skip-download', '--print', '%(upload_date)s|%(duration)s|%(description).600s', x.url], { allowFail: true });
    const [dd, dur, ...rest] = out.trim().split('\n').join(' ').split('|');
    meta[x.videoId] = { datum: /^\d{8}$/.test(dd) ? `${dd.slice(0, 4)}-${dd.slice(4, 6)}-${dd.slice(6, 8)}` : null, duurSec: Number(dur) || null, beschrijving: rest.join('|').slice(0, 600) };
    schrijfJson(metaPad, meta);
    await slaap(2000);
  }
  console.log('datums klaar; opnieuw draaien zonder --datums');
  process.exit(0);
}

const opDatum = (a, b) => (b.datum ?? '0000').localeCompare(a.datum ?? '0000');
kandidaten.sort(opDatum); twijfel.sort(opDatum);
fs.mkdirSync(UIT, { recursive: true });
schrijfJson(path.join(UIT, 'kandidaten.json'), kandidaten);
schrijfJson(path.join(UIT, 'twijfel.json'), twijfel);
schrijfJson(path.join(UIT, 'kanalen.json'), kanalen.map((k) => ({
  id: k.id, naam: k.naam, url: k.url, waardering: k.waardering,
  ...(k.waarderingVoorstel ? { waarderingVoorstel: k.waarderingVoorstel } : {}),
  ...(k.waarderingReden ? { waarderingReden: k.waarderingReden } : {}), omschrijving: k.omschrijving,
  laatsteUpload: k.laatsteUpload ?? null,
  ...(k.laatsteUploadOpmerking ? { laatsteUploadOpmerking: `${k.laatsteUploadOpmerking} (latest upload of any kind: ${k.laatsteUploadAlles})` } : {}),
  nieuw: !!k.nieuw, aantalTactics: telling[k.id]?.tactics ?? 0, aantalTwijfel: telling[k.id]?.twijfel ?? 0,
  videosTotaal: telling[k.id]?.alle ?? 0,
})));
console.table(telling);
const min = kandidaten.reduce((s, x) => s + (x.duurMin ?? 0), 0);
console.log(`tactics: ${kandidaten.length}, ${min} min; twijfel: ${twijfel.length}; zonder datum: ${kandidaten.filter((x) => !x.datum).length}`);
schrijfJson(path.join(HIER, 'telling3.json'), { telling, totaal: kandidaten.length, minuten: min, twijfel: twijfel.length });
