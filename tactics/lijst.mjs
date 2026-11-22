// Stap 1: alle video's per eerste-ronde-kanaal ophalen (id, titel, duur, playlists).
// Cache: tactics/cache/videos-<kanaalId>.json. Een bestaande cache wordt niet opnieuw opgehaald,
// tenzij `--refresh` (alle kanalen) of `--refresh=<kanaalId>`.
//   node tactics/lijst.mjs [--refresh[=id]] [--only=id]
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, leesJson, rondeEenKanalen, schrijfJson, slaap, ytdlp } from './lib.mjs';

const arg = (n) => process.argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
const refresh = arg('refresh');
const only = arg('only')?.split('=')[1];

function flat(url) {
  const out = ytdlp(['--flat-playlist', '-J', url], { allowFail: true });
  if (!out.trim()) return null;
  try { return JSON.parse(out); } catch { return null; }
}

for (const k of rondeEenKanalen()) {
  if (only && k.id !== only) continue;
  const p = path.join(CACHE, `videos-${k.id}.json`);
  const moetVernieuwen = refresh && (refresh === '--refresh' || refresh.endsWith(`=${k.id}`));
  if (fs.existsSync(p) && !moetVernieuwen) { console.log(`${k.id}: cache, overgeslagen`); continue; }

  const videos = new Map();
  for (const tab of ['videos', 'streams']) {
    const d = flat(`${k.url}/${tab}`);
    const entries = d?.entries ?? [];
    for (const e of entries) {
      if (!e?.id || videos.has(e.id)) continue;
      videos.set(e.id, { id: e.id, titel: e.title ?? '', duurSec: e.duration ?? null, tab, playlists: [] });
    }
    console.log(`${k.id}/${tab}: ${entries.length}`);
    await slaap(1500);
  }

  // Playlists: per playlist de video-id's. Goedkoop (flat) en geeft goede hints voor de soort.
  const pl = flat(`${k.url}/playlists`);
  const lijsten = (pl?.entries ?? []).filter((e) => e?.id);
  for (const l of lijsten) {
    await slaap(1500);
    const d = flat(`https://www.youtube.com/playlist?list=${l.id}`);
    for (const e of d?.entries ?? []) {
      const v = videos.get(e?.id);
      if (v && !v.playlists.includes(l.title)) v.playlists.push(l.title);
    }
  }
  console.log(`${k.id}: ${videos.size} video's, ${lijsten.length} playlists`);
  schrijfJson(p, {
    kanaalId: k.id, url: k.url, opgehaald: new Date().toISOString().slice(0, 10),
    playlists: lijsten.map((l) => ({ id: l.id, titel: l.title })),
    videos: [...videos.values()],
  });
  await slaap(3000);
}

// Kort overzicht
for (const k of rondeEenKanalen()) {
  const d = leesJson(path.join(CACHE, `videos-${k.id}.json`));
  if (d) console.log(`${k.id}: ${d.videos.length}`);
}
