// Ronde 3: lijst alle video's per kanaal (videos + streams + playlists waar goedkoop).
// node lijst3.mjs <id>=<url> ...   (of zonder args: kanalen.txt)
import fs from 'node:fs';
import path from 'node:path';
const LIB = 'file:///D:/CLAUDE%20CODE/tow-companion/tactics/lib.mjs';
const { CACHE, leesJson, schrijfJson, slaap, ytdlp } = await import(LIB);

function flat(url) {
  const out = ytdlp(['--flat-playlist', '-J', url], { allowFail: true });
  if (!out.trim()) return null;
  try { return JSON.parse(out); } catch { return null; }
}
const PLRE = /old ?world|\btow\b|fantasy|whfb|tactic|strateg|guide|tips|how to|tutorial|learn|beginner|rules|warhammer(?! 40)/i;

let args = process.argv.slice(2);
const refresh = args.includes('--refresh'); args = args.filter((a) => a !== '--refresh');
for (const a of args) {
  const i = a.indexOf('=');
  const id = a.slice(0, i), url = a.slice(i + 1).replace(/\/$/, '');
  const p = path.join(CACHE, `videos-${id}.json`);
  if (fs.existsSync(p) && !refresh) { console.log(`${id}: cache`); continue; }
  const videos = new Map();
  let chan = null;
  for (const tab of ['videos', 'streams']) {
    const d = flat(`${url}/${tab}`);
    if (d && !chan) chan = { channelId: d.channel_id ?? d.id ?? null, naam: d.channel ?? d.uploader ?? d.title ?? null };
    const entries = d?.entries ?? [];
    for (const e of entries) {
      if (!e?.id || videos.has(e.id)) continue;
      videos.set(e.id, { id: e.id, titel: e.title ?? '', duurSec: e.duration ?? null, tab, playlists: [] });
    }
    console.log(`${id}/${tab}: ${entries.length}`);
    await slaap(1500);
  }
  const pl = flat(`${url}/playlists`);
  const lijsten = (pl?.entries ?? []).filter((e) => e?.id);
  const tePakken = lijsten.length <= 30 ? lijsten : lijsten.filter((l) => PLRE.test(l.title ?? ''));
  for (const l of tePakken) {
    await slaap(1500);
    const d = flat(`https://www.youtube.com/playlist?list=${l.id}`);
    for (const e of d?.entries ?? []) {
      const v = videos.get(e?.id);
      if (v && !v.playlists.includes(l.title)) v.playlists.push(l.title);
    }
  }
  console.log(`${id}: ${videos.size} video's, ${lijsten.length} playlists (${tePakken.length} gelezen), ${chan?.channelId} ${chan?.naam}`);
  schrijfJson(p, {
    kanaalId: id, url, ...chan, opgehaald: new Date().toISOString().slice(0, 10),
    playlists: lijsten.map((l) => ({ id: l.id, titel: l.title, gelezen: tePakken.includes(l) })),
    videos: [...videos.values()],
  });
  await slaap(3000);
}
