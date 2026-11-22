// Stap 5: public/tactics/bronnen.json en lessen.json controleren en de tellingen herberekenen.
//   node tactics/bouw.mjs          controleren + tellingen/status bijwerken
//   node tactics/bouw.mjs --check  alleen controleren (schrijft niets)
// Verwerkte video's staan in tactics/verwerkt.json ({ videoId: 'YYYY-MM-DD' }).
// Als het transcript lokaal in tactics/ruw/ staat, wordt ook nagekeken dat elk citaat daar letterlijk
// in voorkomt, binnen een minuut van het opgegeven tijdstip.
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

const ONDERWERPEN = ['deployment', 'movement', 'charging', 'shooting', 'combat', 'magic', 'list-building', 'scenarios', 'characters', 'psychology', 'chaff'];
const MARKERINGEN = ['verouderd', 'renegade-afwijking', 'regel-afwijking'];
const fouten = [];
const fout = (m) => fouten.push(m);

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
  if (!ONDERWERPEN.includes(l.onderwerp)) fout(`${w}: onderwerp ${l.onderwerp}`);
  if (l.leger !== null && !legers.has(l.leger)) fout(`${w}: leger ${l.leger} bestaat niet`);
  for (const u of l.units ?? []) if (!index[u.toLowerCase()]?.url?.startsWith('unit/')) fout(`${w}: unit "${u}" niet in rules-index.json`);
  for (const m of l.markeringen ?? []) if (!MARKERINGEN.includes(m.soort) || !m.tekst) fout(`${w}: markering ${JSON.stringify(m)}`);
  if (!Array.isArray(l.bronnen) || l.bronnen.length === 0) fout(`${w}: geen bron`);
  let oudste = null;
  for (const lb of l.bronnen ?? []) {
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
        const doel = norm(lb.citaat);
        // Venster rond het tijdstip: een citaat kan over een regelgrens lopen.
        const venster = regels.filter((r) => r.sec >= lb.tijd - 60 && r.sec <= lb.tijd + 60).map((r) => r.tekst).join(' ');
        if (!norm(venster).includes(doel)) fout(`${w}: citaat niet gevonden binnen 60 s van ${lb.tijd}s: "${lb.citaat}"`);
      }
    }
  }
  if (l.datum !== oudste) fout(`${w}: datum ${l.datum} hoort de datum van de oudste bron te zijn (${oudste})`);
}

for (const id of Object.keys(verwerkt)) if (!bronIndex.has(`yt-${id}`)) fout(`verwerkt.json: yt-${id} staat niet in bronnen.json`);

if (fouten.length) {
  console.error(`${fouten.length} fout(en):\n- ` + fouten.join('\n- '));
  process.exit(1);
}
console.log(`OK: ${bronnen.bronnen.length} bronnen, ${lessen.lessen.length} lessen, ${citaatGecontroleerd} citaten nagekeken in het transcript.`);

if (alleenCheck) process.exit(0);

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
