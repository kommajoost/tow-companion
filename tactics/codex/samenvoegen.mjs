// Codex-route, stap 2: de gecontroleerde uitvoer in tactics/codex/uit/*.json samenvoegen.
//   npm run tactics:merge             samenvoegen, daarna tactics:build en tactics:check
//   npm run tactics:merge -- --droog  alleen tonen wat er zou gebeuren
// - Nieuwe lessen komen achteraan in public/tactics/lessen.json (unieke ids).
// - Een aanvulling voegt de video als extra bron toe aan de bestaande les; waarom/voorbeeld/
//   wanneerNiet alleen als dat veld van de les nog null is. Hooguit 3 citaten per les: eerst gaan de
//   extra citaten van de nieuwe bron eraf, daarna die van eerdere bronnen; een les met al 3 bronnen
//   krijgt geen bron meer bij (gelogd).
// - De video's komen in tactics/verwerkt.json; tactics/codex/samengevoegd.json houdt bij welke
//   bestanden al zijn samengevoegd, zodat twee keer draaien niets dubbel doet.
// - Faalt tactics:build of tactics:check, dan worden lessen.json, bronnen.json, verwerkt.json en
//   samengevoegd.json teruggezet zoals ze waren.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PUB, ROOT, TDIR, leesJson, schrijfJson } from '../lib.mjs';
import { MAX_CITATEN, SAMENGEVOEGD, VELDEN_TEKST, aantalCitaten, leesUitBestanden, rel, vandaag } from './gedeeld.mjs';

const droog = process.argv.includes('--droog');
const lessenPad = path.join(PUB, 'lessen.json');
const bronnenPad = path.join(PUB, 'bronnen.json');
const verwerktPad = path.join(TDIR, 'verwerkt.json');

const lessen = leesJson(lessenPad);
const bronnen = leesJson(bronnenPad);
const verwerkt = leesJson(verwerktPad, {});
const samen = leesJson(SAMENGEVOEGD, {});
const bronDatum = new Map(bronnen.bronnen.map((b) => [b.id, b.datum ?? null]));

const bestanden = leesUitBestanden().filter((x) => !samen[x.data.videoId]);
if (!bestanden.length) {
  console.log('Niets samen te voegen: alle bestanden in tactics/codex/uit/ staan al in samengevoegd.json.');
  process.exit(0);
}

const perLes = new Map(lessen.lessen.map((l) => [l.id, l]));
const verslag = new Map(bestanden.map(({ data }) => [data.videoId, { nieuw: [], aanvullingen: [], opmerkingen: [] }]));
const kloon = (x) => JSON.parse(JSON.stringify(x));

// Ronde 1: nieuwe lessen (eerst alle, zodat een aanvulling op een les uit een ander bestand van deze
// ronde ook werkt).
for (const { data } of bestanden) {
  const v = verslag.get(data.videoId);
  for (const les of data.nieuw) {
    const bestaand = perLes.get(les.id);
    if (bestaand && bestaand.bronnen.some((b) => b.bronId === data.bronId)) {
      v.opmerkingen.push(`les ${les.id} staat er al met deze bron, overgeslagen`);
      continue;
    }
    const nieuw = kloon(les);
    if (bestaand) {
      let n = 2;
      while (perLes.has(`${les.id}-${n}`)) n++;
      nieuw.id = `${les.id}-${n}`;
      v.opmerkingen.push(`id ${les.id} bestond al, wordt ${nieuw.id}`);
    }
    lessen.lessen.push(nieuw);
    perLes.set(nieuw.id, nieuw);
    v.nieuw.push(nieuw.id);
  }
}

// Ronde 2: aanvullingen.
for (const { data } of bestanden) {
  const v = verslag.get(data.videoId);
  for (const a of data.aanvullingen ?? []) {
    const les = perLes.get(a.lesId);
    if (!les) { v.opmerkingen.push(`aanvulling op ${a.lesId}: les bestaat niet, overgeslagen`); continue; }
    if (les.bronnen.some((b) => b.bronId === a.bron.bronId)) { v.opmerkingen.push(`aanvulling op ${a.lesId}: bron staat er al`); continue; }
    if (les.bronnen.length >= MAX_CITATEN) { v.opmerkingen.push(`aanvulling op ${a.lesId}: les heeft al ${les.bronnen.length} bronnen, overgeslagen`); continue; }
    const bron = kloon(a.bron);
    const extra = () => bron.extraCitaten?.length ?? 0;
    while (aantalCitaten(les) + 1 + extra() > MAX_CITATEN) {
      if (extra()) {
        bron.extraCitaten.pop();
        if (!bron.extraCitaten.length) delete bron.extraCitaten;
        continue;
      }
      // Ruimte maken: het laatste extra citaat van de bron met de meeste extra citaten.
      const metExtra = les.bronnen.filter((b) => b.extraCitaten?.length).sort((x, y) => y.extraCitaten.length - x.extraCitaten.length)[0];
      const weg = metExtra.extraCitaten.pop();
      if (!metExtra.extraCitaten.length) delete metExtra.extraCitaten;
      v.opmerkingen.push(`aanvulling op ${a.lesId}: extra citaat van ${metExtra.bronId} weggehaald voor de nieuwe bron ("${weg.citaat}")`);
    }
    les.bronnen.push(bron);
    const velden = [];
    for (const veld of VELDEN_TEKST) {
      if (typeof a[veld] === 'string' && a[veld].trim() && les[veld] == null) { les[veld] = a[veld].trim(); velden.push(veld); }
    }
    const data_ = les.bronnen.map((b) => bronDatum.get(b.bronId)).filter(Boolean).sort();
    les.datum = data_[0] ?? les.datum;
    v.aanvullingen.push(velden.length ? `${a.lesId} (+${velden.join(', ')})` : a.lesId);
  }
}

console.log(`${bestanden.length} bestand(en) samen te voegen:`);
for (const [videoId, v] of verslag) {
  console.log(`- ${videoId}: ${v.nieuw.length} nieuw, ${v.aanvullingen.length} aanvulling(en)`);
  for (const o of v.opmerkingen) console.log(`    ${o}`);
}
if (droog) process.exit(0);

// Wegschrijven, met een terugvaloptie als de controle faalt.
const origineel = new Map([lessenPad, bronnenPad, verwerktPad, SAMENGEVOEGD].map((p) => [p, fs.existsSync(p) ? fs.readFileSync(p) : null]));
function terugzetten() {
  for (const [p, inhoud] of origineel) {
    if (inhoud) fs.writeFileSync(p, inhoud);
    else fs.rmSync(p, { force: true });
  }
}

const op = vandaag();
lessen.bijgewerkt = op;
for (const { bestand, data } of bestanden) {
  if (!verwerkt[data.videoId]) verwerkt[data.videoId] = op;
  const v = verslag.get(data.videoId);
  samen[data.videoId] = { op, bestand: rel(bestand), nieuw: v.nieuw, aanvullingen: v.aanvullingen, opmerkingen: v.opmerkingen };
}
schrijfJson(lessenPad, lessen);
schrijfJson(verwerktPad, verwerkt);
schrijfJson(SAMENGEVOEGD, samen);

for (const [naam, args] of [['tactics:build', []], ['tactics:check', ['--check']]]) {
  console.log(`\n> ${naam}`);
  const r = spawnSync(process.execPath, [path.join(TDIR, 'bouw.mjs'), ...args], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    terugzetten();
    console.error(`\n${naam} faalde: lessen.json, bronnen.json, verwerkt.json en samengevoegd.json zijn teruggezet.`);
    process.exit(1);
  }
}
console.log(`\nSamengevoegd: ${lessen.lessen.length} lessen in public/tactics/lessen.json.`);
