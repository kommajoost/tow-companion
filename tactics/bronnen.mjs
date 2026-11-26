// Stap 2c: public/tactics/bronnen.json bijwerken met de volledige relevante lijsten van de
// eerste-ronde-YouTubekanalen, plus de kanalen en tactiekvideo's van ronde 3 (tactics/ronde3/lijst.json
// en kanalen.json, zie onderaan). Bronnen van andere kanalen blijven onaangeroerd. Status, aantal
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

// ── Ronde 3 (tactics/ronde3/) ──────────────────────────────────────────────
// lijst.json = de tactiekvideo's van ronde 3 (met de hand gekozen), kanalen.json = de nagekeken
// kanalen met waardering, voorstel, omschrijving en laatste upload. Kanalen met een video in de lijst
// krijgen die gegevens en ronde 3; een waarderingsvoorstel (waarderingVoorstel) wordt overgenomen,
// ook bij kanalen zonder video. Video's van eerste-ronde-kanalen (The 2+ Podcast) staan al in
// bronnen.json; hun soort komt uit selectie.json (handmatig.json), hier niet opnieuw beslist.
// Status, aantal lessen en verwerktOp van bestaande bronnen blijven bewaard.
const R3 = path.join(TDIR, 'ronde3');
const r3Lijst = leesJson(path.join(R3, 'lijst.json'), []);
const r3Kanalen = leesJson(path.join(R3, 'kanalen.json'), []);
const r3Telling = {};
if (r3Lijst.length) {
  const metVideo = new Set(r3Lijst.map((v) => v.kanaalId));
  for (const c of r3Kanalen) {
    const waardering = c.waarderingVoorstel ?? c.waardering;
    const bestaand = data.kanalen.find((k) => k.id === c.id);
    if (bestaand?.ronde === 1) continue; // eerste ronde blijft eerste ronde
    if (!metVideo.has(c.id)) {
      if (bestaand && c.waarderingVoorstel) bestaand.waardering = waardering;
      continue;
    }
    const velden = { naam: c.naam, url: c.url, type: 'youtube', waardering, omschrijving: c.omschrijving, laatsteUpload: c.laatsteUpload, ronde: 3 };
    if (bestaand) Object.assign(bestaand, velden);
    else {
      // Nieuw kanaal: achter het laatste YouTube-kanaal (de geschreven bronnen blijven onderaan).
      const na = data.kanalen.map((k) => k.type).lastIndexOf('youtube');
      data.kanalen.splice(na + 1, 0, { id: c.id, ...velden });
    }
  }
  const perId = new Map(data.bronnen.map((b) => [b.id, b]));
  const r3Nieuw = [];
  const kanaalVolgorde = r3Kanalen.map((c) => c.id);
  for (const v of r3Lijst) {
    const id = `yt-${v.videoId}`;
    const oud = perId.get(id);
    r3Telling[v.kanaalId] = (r3Telling[v.kanaalId] ?? 0) + 1;
    if (oud && ronde.has(oud.kanaalId)) {
      // Eerste-ronde-kanaal: soort uit selectie.json (handmatig.json wint daar).
      if (sel[v.videoId]?.soort) oud.soort = sel[v.videoId].soort;
      continue;
    }
    const bron = {
      id,
      kanaalId: v.kanaalId,
      titel: oud?.titel ?? netteTitel(v.titel),
      url: v.url ?? `https://www.youtube.com/watch?v=${v.videoId}`,
      datum: v.datum ?? oud?.datum ?? null,
      duurMin: v.duurMin ?? oud?.duurMin ?? null,
      soort: v.soort ?? 'tactics',
      onderwerp: v.leger ?? 'general',
      status: oud?.status ?? 'candidate',
      lessen: oud?.lessen ?? 0,
      ...(oud?.verwerktOp ? { verwerktOp: oud.verwerktOp } : {}),
    };
    if (oud) Object.keys(oud).forEach((k) => delete oud[k]);
    if (oud) Object.assign(oud, bron);
    else r3Nieuw.push(bron);
  }
  r3Nieuw.sort((a, b) => kanaalVolgorde.indexOf(a.kanaalId) - kanaalVolgorde.indexOf(b.kanaalId) || (b.datum ?? '0000').localeCompare(a.datum ?? '0000'));
  data.bronnen.push(...r3Nieuw);
}

schrijfJsonRegels(bronnenPad, data);
console.log('Op de pagina per kanaal:', telling, '\nRonde 3 per kanaal:', r3Telling, `\nTotaal bronnen: ${data.bronnen.length}`);
