// Laatste Old World-upload per kanaal via de kanaalfeed (laatste 15 uploads), één kanaal tegelijk.
import fs from 'node:fs';
import path from 'node:path';
const { CACHE, leesJson, slaap } = await import('file:///D:/CLAUDE%20CODE/tow-companion/tactics/lib.mjs');
const { OW } = await import('./regels3.mjs');
const HIER = path.dirname((await import('node:url')).fileURLToPath(import.meta.url));
const kanalenPad = path.join(HIER, 'kanalen3.json');
const kanalen = JSON.parse(fs.readFileSync(kanalenPad, 'utf8'));
for (const k of kanalen) {
  const d = leesJson(path.join(CACHE, `videos-${k.id}.json`));
  if (!d?.channelId) { console.log(k.id, 'geen channelId'); continue; }
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${d.channelId}`);
  const xml = await r.text();
  const items = [...xml.matchAll(/<entry>[\s\S]*?<title>([^<]*)<\/title>[\s\S]*?<published>([^<]*)<\/published>/g)].map((m) => ({ titel: m[1], datum: m[2].slice(0, 10) }));
  const ow = items.find((i) => OW.test(i.titel) || (k.modus === 'ow' && !/40k|kill team|mordheim|necromunda/i.test(i.titel)));
  k.laatsteUpload = ow?.datum ?? null;
  k.laatsteUploadAlles = items[0]?.datum ?? null;
  if (!ow) k.laatsteUploadOpmerking = 'no Old World title among the last 15 uploads';
  console.log(k.id, r.status, items.length, 'OW:', k.laatsteUpload, 'alles:', k.laatsteUploadAlles, ow?.titel?.slice(0, 60) ?? '');
  await slaap(1500);
}
fs.writeFileSync(kanalenPad, JSON.stringify(kanalen, null, 1));
