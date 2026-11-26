// Ronde 3: YouTube-zoekopdrachten via yt-dlp (flat), één tegelijk. Cache: tactics/cache/ronde3-zoek.json
import path from 'node:path';
const { CACHE, leesJson, schrijfJson, slaap, ytdlp } = await import('file:///D:/CLAUDE%20CODE/tow-companion/tactics/lib.mjs');
const p = path.join(CACHE, 'ronde3-zoek.json');
const cache = leesJson(p, {});
const LEGERS = ['Dark Elves', 'Wood Elves', 'High Elves', 'Empire', 'Bretonnia', 'Orcs and Goblins', 'Dwarfs', 'Tomb Kings',
  'Beastmen', 'Warriors of Chaos', 'Vampire Counts', 'Skaven', 'Lizardmen', 'Grand Cathay', 'Daemons of Chaos', 'Chaos Dwarfs',
  'Ogre Kingdoms', 'Renegade Crowns'];
const Q = [
  ['"old world" tactics', 50], ['warhammer the old world tactica', 50], ['warhammer old world tactics', 50],
  ['warhammer the old world how to play', 50], ['warhammer old world tips', 50], ['warhammer old world strategy guide', 50],
  ['old world warhammer deployment tips', 30], ['old world warhammer charging tips', 30], ['old world warhammer magic tips', 30],
  ['old world warhammer flanking', 30], ['old world warhammer chaff', 30], ['warhammer old world beginner tactics', 30],
  ['warhammer old world movement phase guide', 30], ['warhammer old world combat tips', 30], ['warhammer old world tactics explained', 30],
  ...LEGERS.map((l) => [`${l.toLowerCase()} old world tactics`, 30]),
  ...LEGERS.map((l) => [`how to play ${l.toLowerCase()} warhammer the old world`, 20]),
];
let n = 0;
for (const [q, k] of Q) {
  if (cache[q]) continue;
  const out = ytdlp(['--flat-playlist', '-J', `ytsearch${k}:${q}`], { allowFail: true });
  let d = null; try { d = JSON.parse(out); } catch {}
  cache[q] = (d?.entries ?? []).filter((e) => e?.id).map((e) => ({ id: e.id, titel: e.title, duurSec: e.duration ?? null,
    kanaal: e.channel ?? e.uploader ?? null, channelId: e.channel_id ?? null, kanaalUrl: e.channel_url ?? e.uploader_url ?? null }));
  schrijfJson(p, cache);
  console.log(`${q}: ${cache[q].length}`);
  n++;
  await slaap(3000);
}
console.log('klaar', n, 'zoekopdrachten');
