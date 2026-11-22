// Stap 2b: uploaddatum (en een korte beschrijving) per video, alleen voor de video's die op de
// pagina komen of die met de hand bekeken moeten worden. Eén video tegelijk, met pauzes.
// Cache: tactics/cache/meta.json ({ id: { datum, duurSec, beschrijving } }), wordt na elke video
// weggeschreven zodat afbreken niets kost.
//   node tactics/datums.mjs            alle pagina-video's zonder datum
//   node tactics/datums.mjs <id> ...   alleen deze
import path from 'node:path';
import { CACHE, PAGINA_SOORTEN, TDIR, leesJson, schrijfJson, slaap, ytdlp } from './lib.mjs';

const metaPad = path.join(CACHE, 'meta.json');
const meta = leesJson(metaPad, {});
const sel = leesJson(path.join(TDIR, 'selectie.json'), { videos: {} }).videos;

let ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (ids.length === 0) {
  ids = Object.entries(sel).filter(([, v]) => v.relevant && PAGINA_SOORTEN.includes(v.soort)).map(([id]) => id);
}
const todo = ids.filter((id) => !meta[id]?.datum);
console.log(`${todo.length} video's zonder datum (van ${ids.length})`);

let n = 0;
for (const id of todo) {
  const out = ytdlp(['--skip-download', '--print', '%(upload_date)s|%(duration)s|%(description).400s', `https://www.youtube.com/watch?v=${id}`], { allowFail: true });
  const regel = out.trim().split('\n').join(' ');
  const [d, dur, ...rest] = regel.split('|');
  const datum = /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null;
  meta[id] = { datum, duurSec: Number(dur) || null, beschrijving: rest.join('|').slice(0, 400) };
  schrijfJson(metaPad, meta);
  n++;
  if (n % 20 === 0) console.log(`${n}/${todo.length}`);
  await slaap(2000);
}
console.log(`klaar: ${n} opgehaald`);
