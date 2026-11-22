// Stap 5: public/tactics/bronnen.json en lessen.json controleren en de tellingen herberekenen.
//   node tactics/bouw.mjs          controleren + tellingen/status bijwerken
//   node tactics/bouw.mjs --check  alleen controleren (schrijft niets)
// Verwerkte video's staan in tactics/verwerkt.json ({ videoId: 'YYYY-MM-DD' }).
// Als het transcript lokaal in tactics/ruw/ staat, wordt ook nagekeken dat elk citaat daar letterlijk
// in voorkomt, binnen een minuut van het opgegeven tijdstip.
// Thema's en fases komen uit tactics/themas.json; de bouw schrijft er een kopie van naar
// public/tactics/themas.json en toont per thema en per fase het aantal lessen.
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, PUB, ROOT, RUW, TDIR, leesJson, schrijfJson, schrijfJsonRegels } from './lib.mjs';

const alleenCheck = process.argv.includes('--check');
const bronnenPad = path.join(PUB, 'bronnen.json');
const lessenPad = path.join(PUB, 'lessen.json');
const bronnen = leesJson(bronnenPad);
const lessen = leesJson(lessenPad);
const verwerkt = leesJson(path.join(TDIR, 'verwerkt.json'), {});
const meta = leesJson(path.join(CACHE, 'meta.json'), {});
const index = leesJson(path.join(ROOT, 'public', 'owb', 'rules-index.json'), {});
const legers = new Set(fs.readdirSync(path.join(ROOT, 'public', 'owb')).filter((f) => {
  const d = leesJson(path.join(ROOT, 'public', 'owb', f));
  return d && Array.isArray(d.characters);
}).map((f) => f.replace(/\.json$/, '')));

const MARKERINGEN = ['verouderd', 'renegade-afwijking', 'regel-afwijking'];
const fouten = [];
const fout = (m) => fouten.push(m);
const waarschuwingen = [];

// ── Thema's en fases ───────────────────────────────────────────────────────
// Het vaste vocabulaire staat in tactics/themas.json; de bouw zet een kopie in public/tactics/ zodat
// de pagina en het AI-hulpje dezelfde lijst lezen.
const themasBronPad = path.join(TDIR, 'themas.json');
const themasPubPad = path.join(PUB, 'themas.json');
const vocab = leesJson(themasBronPad);
if (!vocab || !Array.isArray(vocab.themas) || !Array.isArray(vocab.fases)) {
  console.error('tactics/themas.json ontbreekt of heeft geen themas/fases.');
  process.exit(1);
}
const THEMAS = new Map();
for (const t of vocab.themas) {
  if (!t.id || !t.naam || !t.omschrijving || typeof t.volgorde !== 'number') fout(`thema ${JSON.stringify(t)}: id, naam, omschrijving en volgorde zijn verplicht`);
  if (THEMAS.has(t.id)) fout(`thema ${t.id}: dubbel id`);
  THEMAS.set(t.id, t);
}
const FASES = new Map();
for (const f of vocab.fases) {
  if (!f.id || !f.naam || typeof f.volgorde !== 'number') fout(`fase ${JSON.stringify(f)}: id, naam en volgorde zijn verplicht`);
  if (FASES.has(f.id)) fout(`fase ${f.id}: dubbel id`);
  FASES.set(f.id, f);
}

// ── Bronnen ────────────────────────────────────────────────────────────────
const kanaalIds = new Set(bronnen.kanalen.map((k) => k.id));
const bronIndex = new Map();
for (const b of bronnen.bronnen) {
  if (bronIndex.has(b.id)) fout(`bron ${b.id}: dubbel id`);
  bronIndex.set(b.id, b);
  if (!kanaalIds.has(b.kanaalId)) fout(`bron ${b.id}: onbekend kanaal ${b.kanaalId}`);
  if (!/^https:\/\//.test(b.url)) fout(`bron ${b.id}: url is geen https`);
  if (b.datum != null && !/^\d{4}-\d{2}-\d{2}$/.test(b.datum)) fout(`bron ${b.id}: datum ${b.datum}`);
}

// ── Lessen ─────────────────────────────────────────────────────────────────
const woorden = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const transcriptCache = new Map();
function transcript(videoId) {
  if (transcriptCache.has(videoId)) return transcriptCache.get(videoId);
  const p = path.join(RUW, `${videoId}.fixed.txt`);
  let regels = null;
  if (fs.existsSync(p)) {
    regels = fs.readFileSync(p, 'utf8').split('\n').map((r) => {
      const m = r.match(/^\[(?:(\d+):)?(\d+):(\d+)\]\s*(.*)$/);
      if (!m) return null;
      return { sec: (+(m[1] ?? 0)) * 3600 + +m[2] * 60 + +m[3], tekst: m[4] };
    }).filter(Boolean);
  }
  transcriptCache.set(videoId, regels);
  return regels;
}

/** Letterlijk in het transcript, binnen 60 s van het tijdstip (een citaat kan over een regelgrens lopen). */
function citaatInTranscript(regels, tijd, citaat) {
  const venster = regels.filter((r) => r.sec >= tijd - 60 && r.sec <= tijd + 60).map((r) => r.tekst).join(' ');
  return norm(venster).includes(norm(citaat));
}

const lesIds = new Set();
const perBron = new Map();
let citaatGecontroleerd = 0;
for (const l of lessen.lessen) {
  const w = `les ${l.id}`;
  if (lesIds.has(l.id)) fout(`${w}: dubbel id`);
  lesIds.add(l.id);
  if (!l.titel || !l.tekst) fout(`${w}: titel of tekst ontbreekt`);
  const zinnen = (l.tekst ?? '').split(/(?<=[.!?])\s+/).filter(Boolean).length;
  if (zinnen > 3) fout(`${w}: tekst heeft ${zinnen} zinnen (max 3)`);
  if (l.onderwerp !== undefined) fout(`${w}: onderwerp is vervangen door fase + themas`);
  if (!FASES.has(l.fase)) fout(`${w}: fase ${l.fase} staat niet in tactics/themas.json`);
  if (!Array.isArray(l.themas) || l.themas.length < 1 || l.themas.length > 3) fout(`${w}: themas moet 1 tot 3 ids hebben`);
  else {
    if (new Set(l.themas).size !== l.themas.length) fout(`${w}: dubbel thema`);
    for (const t of l.themas) if (!THEMAS.has(t)) fout(`${w}: thema ${t} staat niet in tactics/themas.json`);
  }
  if (l.leger !== null && !legers.has(l.leger)) fout(`${w}: leger ${l.leger} bestaat niet`);
  for (const u of l.units ?? []) if (!index[u.toLowerCase()]?.url?.startsWith('unit/')) fout(`${w}: unit "${u}" niet in rules-index.json`);
  for (const m of l.markeringen ?? []) if (!MARKERINGEN.includes(m.soort) || !m.tekst) fout(`${w}: markering ${JSON.stringify(m)}`);
  if (!Array.isArray(l.bronnen) || l.bronnen.length === 0) fout(`${w}: geen bron`);
  let oudste = null;
  let aantalCitaten = 0;
  for (const lb of l.bronnen ?? []) {
    aantalCitaten++;
    if (!/^https:\/\//.test(lb.url ?? '')) fout(`${w}: url is geen https`);
    if (!lb.citaat) fout(`${w}: citaat ontbreekt`);
    else if (woorden(lb.citaat) > 15) fout(`${w}: citaat heeft ${woorden(lb.citaat)} woorden (max 15)`);
    const b = bronIndex.get(lb.bronId);
    if (!b) { fout(`${w}: bron ${lb.bronId} bestaat niet`); continue; }
    const s = perBron.get(b.id) ?? new Set();
    s.add(l.id);
    perBron.set(b.id, s);
    if (b.datum && (!oudste || b.datum < oudste)) oudste = b.datum;
    const videoId = b.id.replace(/^yt-/, '');
    if (typeof lb.tijd === 'number') {
      const duur = meta[videoId]?.duurSec ?? (b.duurMin ? b.duurMin * 60 + 59 : null);
      if (lb.tijd < 0 || (duur && lb.tijd > duur)) fout(`${w}: tijd ${lb.tijd}s valt buiten de video (${duur}s)`);
      const t = new URL(lb.url).searchParams.get('t');
      if (t !== `${Math.max(0, lb.tijd - 3)}s` && t !== `${lb.tijd}s`) fout(`${w}: url-tijd ${t} past niet bij tijd ${lb.tijd}`);
      const regels = transcript(videoId);
      if (regels && lb.citaat) {
        citaatGecontroleerd++;
        if (!citaatInTranscript(regels, lb.tijd, lb.citaat)) fout(`${w}: citaat niet gevonden binnen 60 s van ${lb.tijd}s: "${lb.citaat}"`);
      }
      // Extra citaten bij dezelfde bron: elk met eigen tijdstip, ook letterlijk nagekeken.
      if (lb.extraCitaten != null && !Array.isArray(lb.extraCitaten)) fout(`${w}: extraCitaten is geen lijst`);
      for (const ec of lb.extraCitaten ?? []) {
        aantalCitaten++;
        if (typeof ec.tijd !== 'number' || !ec.citaat) { fout(`${w}: extra citaat zonder tijd of tekst`); continue; }
        if (woorden(ec.citaat) > 15) fout(`${w}: extra citaat heeft ${woorden(ec.citaat)} woorden (max 15)`);
        if (ec.tijd < 0 || (duur && ec.tijd > duur)) fout(`${w}: extra tijd ${ec.tijd}s valt buiten de video`);
        if (regels) {
          citaatGecontroleerd++;
          if (!citaatInTranscript(regels, ec.tijd, ec.citaat)) fout(`${w}: extra citaat niet gevonden binnen 60 s van ${ec.tijd}s: "${ec.citaat}"`);
        }
      }
    }
  }
  if (aantalCitaten > 3) fout(`${w}: ${aantalCitaten} citaten (max 3 per les)`);
  for (const veld of ['waarom', 'voorbeeld', 'wanneerNiet']) {
    const v = l[veld];
    if (v === undefined) fout(`${w}: ${veld} ontbreekt (string of null)`);
    else if (v !== null && (typeof v !== 'string' || !v.trim())) fout(`${w}: ${veld} moet tekst of null zijn`);
  }
  if (l.datum !== oudste) fout(`${w}: datum ${l.datum} hoort de datum van de oudste bron te zijn (${oudste})`);
}

for (const id of Object.keys(verwerkt)) if (!bronIndex.has(`yt-${id}`)) fout(`verwerkt.json: yt-${id} staat niet in bronnen.json`);

// Per thema en per fase tellen. Een thema met minder dan 3 lessen is een waarschuwing, geen fout:
// een nieuwe ronde mag een thema beginnen dat later groeit (of opgaat in een breder thema).
const perThema = new Map([...THEMAS.keys()].map((id) => [id, 0]));
const perFase = new Map([...FASES.keys()].map((id) => [id, 0]));
for (const l of lessen.lessen) {
  if (perFase.has(l.fase)) perFase.set(l.fase, perFase.get(l.fase) + 1);
  for (const t of Array.isArray(l.themas) ? l.themas : []) if (perThema.has(t)) perThema.set(t, perThema.get(t) + 1);
}
for (const [id, n] of perThema) if (n < 3) waarschuwingen.push(`thema ${id} heeft ${n} les(sen) (minstens 3)`);

// De gepubliceerde kopie moet gelijk zijn aan de bron.
const pubVocab = leesJson(themasPubPad);
const vocabGelijk = JSON.stringify(pubVocab) === JSON.stringify(vocab);
if (alleenCheck && !vocabGelijk) fout('public/tactics/themas.json wijkt af van tactics/themas.json (draai npm run tactics:build)');

if (fouten.length) {
  console.error(`${fouten.length} fout(en):\n- ` + fouten.join('\n- '));
  process.exit(1);
}
console.log(`OK: ${bronnen.bronnen.length} bronnen, ${lessen.lessen.length} lessen, ${citaatGecontroleerd} citaten nagekeken in het transcript.`);
const opVolgorde = (m) => [...m.values()].sort((a, b) => a.volgorde - b.volgorde);
const breedte = Math.max(...[...THEMAS.values(), ...FASES.values()].map((x) => x.naam.length));
console.log('Thema\'s:');
for (const t of opVolgorde(THEMAS)) console.log(`  ${t.naam.padEnd(breedte)}  ${perThema.get(t.id)}`);
console.log('Fases:');
for (const f of opVolgorde(FASES)) console.log(`  ${f.naam.padEnd(breedte)}  ${perFase.get(f.id)}`);
if (waarschuwingen.length) console.warn(`${waarschuwingen.length} waarschuwing(en):\n- ` + waarschuwingen.join('\n- '));

if (alleenCheck) process.exit(0);

if (!vocabGelijk) schrijfJson(themasPubPad, vocab);

// ── Tellingen en status herberekenen ───────────────────────────────────────
let gewijzigd = 0;
for (const b of bronnen.bronnen) {
  const n = perBron.get(b.id)?.size ?? 0;
  const videoId = b.id.replace(/^yt-/, '');
  const op = verwerkt[videoId];
  const nieuw = { ...b, lessen: n, status: op ? 'processed' : b.status, ...(op ? { verwerktOp: op } : {}) };
  if (JSON.stringify(nieuw) !== JSON.stringify(b)) { Object.assign(b, nieuw); gewijzigd++; }
}
schrijfJsonRegels(bronnenPad, bronnen);
schrijfJson(lessenPad, lessen);
console.log(`Tellingen bijgewerkt (${gewijzigd} bronnen gewijzigd).`);
