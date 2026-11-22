// Stap 2c: public/tactics/bronnen.json bijwerken met de volledige relevante lijsten van de
// eerste-ronde-YouTubekanalen. Bronnen van andere kanalen blijven onaangeroerd. Status, aantal
// lessen en verwerktOp van bestaande bronnen blijven bewaard.
//   node tactics/bronnen.mjs
import path from 'node:path';
import { CACHE, PAGINA_SOORTEN, PUB, TDIR, leesJson, rondeEenKanalen, schrijfJsonRegels } from './lib.mjs';

const bronnenPad = path.join(PUB, 'bronnen.json');
const data = leesJson(bronnenPad);
const sel = leesJson(path.join(TDIR, 'selectie.json')).videos;
const meta = leesJson(path.join(CACHE, 'meta.json'), {});

// Merk- en rubrieknamen die in YouTube-titels achter een | staan; voegen op de pagina niets toe.
const MERK = /^(warhammer:? ?(the )?old world.*|warhammer:? the old world|the old world|warhammer|old world|warhammer old world strateg(y|ies)|old world legends show|square based( show)?|square based old world|old world tactics|old world moments|warhammer the old world lore|games? (rules )?& (rules )?review|beginner guide( - p\d+)?|arcane journal|meta analysis|game meta|meta|news & updates|news|tournament meta|spirit of the game|deep dive|long format|event review|interview|community exclusive|legacy supplement|list building|hobby journey|grand tournament|warhammer the old world)$/i;

export function netteTitel(t) {
  const delen = t.split(/\s+(?:\||\/\/)\s+|\s+\|(?=\S)|(?<=\S)\|\s+/).map((d) => d.trim()).filter(Boolean);
  let goed = delen.filter((d) => !MERK.test(d));
  if (goed.length === 0) goed = delen.slice(0, 1);
  let s = goed.join(' · ');
  s = s
    .replace(/\s*[-–]\s*warhammer:?\s*(the\s+)?old\s+world\.?$/i, '')
    .replace(/\s+(?:(?:in|for|from)\s+)?warhammer:?\s*(?:the\s+)?old\s+world([.?!]*)$/i, '$1')
    .replace(/([?!.])\s+warhammer\.?$/i, '$1')
    .replace(/\s+/g, ' ').trim();
  return s;
}

const ronde = new Set(rondeEenKanalen().map((k) => k.id));
const vorige = new Map(data.bronnen.map((b) => [b.id, b]));
const nieuw = [];
const telling = {};

for (const k of rondeEenKanalen()) {
  const cache = leesJson(path.join(CACHE, `videos-${k.id}.json`));
  if (!cache) continue;
  const duur = new Map(cache.videos.map((v) => [v.id, v.duurSec]));
  const lijst = [];
  for (const v of cache.videos) {
    const s = sel[v.id];
    const id = `yt-${v.id}`;
    const oud = vorige.get(id);
    const opPagina = s?.relevant && PAGINA_SOORTEN.includes(s.soort);
    // Een eerder met de hand gekozen bron blijft staan, ook als de regels hem nu anders zien.
    if (!opPagina && !oud) continue;
    const sec = meta[v.id]?.duurSec ?? duur.get(v.id);
    lijst.push({
      id,
      kanaalId: k.id,
      titel: netteTitel(v.titel),
      url: `https://www.youtube.com/watch?v=${v.id}`,
      datum: meta[v.id]?.datum ?? oud?.datum ?? null,
      duurMin: sec ? Math.max(1, Math.round(sec / 60)) : null,
      soort: s?.soort ?? 'other',
      onderwerp: s?.onderwerp ?? oud?.onderwerp ?? 'general',
      status: oud?.status ?? 'candidate',
      lessen: oud?.lessen ?? 0,
      ...(oud?.verwerktOp ? { verwerktOp: oud.verwerktOp } : {}),
    });
  }
  lijst.sort((a, b) => (b.datum ?? '0000').localeCompare(a.datum ?? '0000'));
  telling[k.id] = lijst.length;
  nieuw.push(...lijst);
}

const overig = data.bronnen.filter((b) => !ronde.has(b.kanaalId) || !leesJson(path.join(CACHE, `videos-${b.kanaalId}.json`)));
data.bronnen = [...nieuw, ...overig];
schrijfJsonRegels(bronnenPad, data);
console.log('Op de pagina per kanaal:', telling, `\nTotaal bronnen: ${data.bronnen.length}`);
