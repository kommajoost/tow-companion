// Codex-route: principes boven de lessen (Codex CLI, ChatGPT-abonnement).
//   npm run tactics:principles                  alle porties zonder antwoord in tactics/codex/principes/,
//                                               daarna samenstellen naar public/tactics/principes.json
//   npm run tactics:principles -- --scope thema-chaff,leger-skaven   alleen deze porties (ook opnieuw)
//   npm run tactics:principles -- --opnieuw     alle porties opnieuw vragen
//   npm run tactics:principles -- --max 2       hooguit 2 Codex-runs
//   npm run tactics:principles -- --droog [scope]  alleen de prompt (en het schema) bouwen
//   npm run tactics:principles -- --samenstellen   geen Codex: alleen public/tactics/principes.json maken
//   --model <naam> (standaard gpt-6.1-sol of $TACTICS_CODEX_MODEL), --effort (standaard high of
//   $TACTICS_PRINCIPLES_EFFORT)
//
// Porties: per thema (alle lessen met dat thema, ook legerlessen) en per leger (de lessen van dat
// leger, alleen als het leger de drempel kan halen). Codex clustert lessen die HETZELFDE advies geven
// en schrijft per cluster een principe (of een debat als spelers het oneens zijn). Hij draait in een
// lege tijdelijke map, sandbox read-only, met een JSON Schema voor het antwoord (les-ids als enum).
// Elk antwoord wordt meteen weggeschreven naar tactics/codex/principes/<scope>.json, dus een
// onderbroken run gaat verder waar hij was. Stoppen bij een gebruikslimiet, loginfout of onbekend
// model, en na 3 mislukte porties op rij. Nooit twee Codex-runs tegelijk.
//
// Samenstellen (deterministisch, geen Codex):
//   1. alle principes uit de porties; dubbele ids krijgen de portie erachter;
//   2. dubbelen samenvoegen: zelfde leger (of beide algemeen), beide soort principe, en minstens 60%
//      van de lessen van het kleinste principe zit ook in het andere -> een principe (het grootste
//      blijft, lessen samen), onder het thema waar de meeste van zijn lessen hun hoofdthema hebben;
//   3. handcorrecties uit tactics/codex/principes/hand.json (wint altijd, blijft bij een herhaling);
//   4. tellen per principe: lessen en VERSCHILLENDE kanalen (les -> bronnen -> bronnen.json kanaalId);
//      onder de drempel (3 lessen uit 2 kanalen) valt het af;
//   5. rangorde: meeste kanalen, dan meeste lessen. top10 = de algemene principes bovenaan, perThema
//      = hooguit 5 per thema, perLeger = alle principes van dat leger, debat = de algemene debatten.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PUB, leesJson, schrijfJson, slaap } from '../lib.mjs';
import { DREMPEL, controleerPrincipes, haaltDrempel, rangschik, tel } from '../principes-lib.mjs';
import { STANDAARD_MODEL, draaiCodex, draaiTerug, momentopname, verschillen } from './cli.mjs';
import { CDIR, laadContext, rel, vandaag } from './gedeeld.mjs';

const MAP = path.join(CDIR, 'principes');
const HAND = path.join(MAP, 'hand.json');
const VERSLAG = path.join(MAP, 'samengesteld.json');
const UITVOER = path.join(PUB, 'principes.json');
const PAUZE_MS = 4000;
const TIMEOUT_MS = 30 * 60 * 1000;
const OVERLAP = 0.6;

// ── Argumenten ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opties = {
  scopes: null, opnieuw: false, max: Infinity, droog: false, droogScope: null, samenstellen: false,
  model: process.env.TACTICS_CODEX_MODEL || STANDAARD_MODEL, effort: process.env.TACTICS_PRINCIPLES_EFFORT || 'high',
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--opnieuw') opties.opnieuw = true;
  else if (a === '--samenstellen') opties.samenstellen = true;
  else if (a === '--droog') { opties.droog = true; if (argv[i + 1] && !argv[i + 1].startsWith('--')) opties.droogScope = argv[++i]; }
  else if (a === '--scope') opties.scopes = String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  else if (a === '--max') opties.max = Number(argv[++i]);
  else if (a === '--model') opties.model = argv[++i];
  else if (a === '--effort') opties.effort = argv[++i];
  else { console.error(`Onbekende optie ${a}`); process.exit(1); }
}

const ctx = laadContext();
const lessen = ctx.lessen.lessen;
const lesIndex = new Map(lessen.map((l) => [l.id, l]));
const themaVolgorde = [...ctx.vocab.themas].sort((a, b) => a.volgorde - b.volgorde).map((t) => t.id);
const kanaalNaam = (id) => ctx.kanaalIndex.get(id)?.naam ?? id;
const lesKanaalNamen = (l) => tel([l.id], lesIndex, ctx.bronIndex).kanalen.map(kanaalNaam);

// ── Porties ────────────────────────────────────────────────────────────────
function allePorties() {
  const uit = [];
  for (const thema of themaVolgorde) {
    const t = ctx.themas.get(thema);
    const subVolgorde = new Map([...(ctx.vocab.themas.find((x) => x.id === thema).subthemas ?? [])].map((s) => [s.id, s.volgorde]));
    const sub = (l) => l.subthemas?.[l.themas.indexOf(thema)];
    const ls = lessen.filter((l) => l.themas.includes(thema))
      .sort((a, b) => (subVolgorde.get(sub(a)) ?? 99) - (subVolgorde.get(sub(b)) ?? 99) || (a.leger ?? '').localeCompare(b.leger ?? ''));
    uit.push({ scope: `thema-${thema}`, soort: 'thema', sleutel: thema, naam: t.naam, lessen: ls });
  }
  const legers = [...new Set(lessen.map((l) => l.leger).filter(Boolean))].sort();
  for (const leger of legers) {
    const ls = lessen.filter((l) => l.leger === leger)
      .sort((a, b) => themaVolgorde.indexOf(a.themas[0]) - themaVolgorde.indexOf(b.themas[0]));
    const t = tel(ls.map((l) => l.id), lesIndex, ctx.bronIndex);
    if (t.aantalLessen < DREMPEL.lessen || t.aantalKanalen < DREMPEL.kanalen) continue; // kan de drempel nooit halen
    uit.push({ scope: `leger-${leger}`, soort: 'leger', sleutel: leger, naam: leger, lessen: ls });
  }
  return uit;
}
const porties = allePorties();
const invoerHash = (p) => crypto.createHash('sha1').update(p.lessen.map((l) => l.id).join(',')).digest('hex').slice(0, 12);
const cachePad = (scope) => path.join(MAP, `${scope}.json`);

// ── Prompt en schema ───────────────────────────────────────────────────────
const kort = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n - 3) + '...' : s ?? null);

function lesRegel(l, portie) {
  const i = portie.soort === 'thema' ? l.themas.indexOf(portie.sleutel) : 0;
  return JSON.stringify({
    id: l.id, titel: l.titel, tekst: l.tekst, waarom: kort(l.waarom, 380), wanneerNiet: kort(l.wanneerNiet, 220),
    ...(portie.soort === 'thema' ? { subthema: l.subthemas?.[i] ?? null } : { themas: l.themas }),
    tags: l.tags, leger: l.leger, kanalen: lesKanaalNamen(l),
  });
}

function regels(portie) {
  const isThema = portie.soort === 'thema';
  const wat = isThema ? `the theme "${portie.naam}" (${portie.sleutel})` : `the army ${portie.sleutel}`;
  return `# Key principles in tactics lessons

You are an isolated, non-interactive batch job for a Warhammer: The Old World companion app. The app
holds hundreds of short tactics lessons, each taken from a player's video (one channel = one
creator). Players should be able to start from a few overarching principles instead of reading
every lesson. Everything you need is in this prompt: do not run commands, do not read or write
files, do not use tools. Reply with the JSON answer only.

## Task

Below are the lessons of ${wat}. Find groups of lessons that give the SAME underlying advice and
write one principle per group.

A principle:

- is advice that several lessons give independently. Same advice, not just the same topic: "screen
  your hammer with chaff" and "chaff can block march moves" are both about chaff but are different
  advice. Lessons from the same channel are usually the same speaker; different channels are
  independent players (the channels are listed per lesson).
- needs at least 3 lessons. Groups backed by lessons from 2 or more different channels are what we
  are after; a group from one channel only will be discarded later, so do not stretch a group to
  reach another channel.
- titel: one short claim a player can act on, at most about 12 words ("Screen your hammers until
  the turn they charge"). Not a question, not a label like "Chaff tips".
- tekst: 1 or 2 short sentences: what to do and the reason the lessons give.
- must be faithful: say only what the supporting lessons say. No new claims, no rules knowledge,
  numbers, units or examples of your own. Every part of titel and tekst must be backed by at least
  two of the lessons in the group. If the lessons only agree on a narrower point, write the narrower
  point.
- must not be vaguer than needed: write the most specific advice the lessons share. "Think about
  deployment" is useless; "Deploy your fast units last so you can react" is useful.
- lessen: the ids of ALL lessons in this list that really give this advice, and only those. A
  lesson may support more than one principle. Most lessons will not be in any principle: that is
  fine, do not force them in.

A debate (soort "debat"): only where lessons clearly DISAGREE on the same question (one says do X,
another says do not, or prefers Y). Do not smooth it over. titel names the question neutrally
("Big or small blocks of core infantry?"), tekst says in 1 or 2 sentences what the disagreement is
about, and kanten lists every side: standpunt (one short sentence) and the lessons for that side.
lessen = all lessons of all sides. A difference in emphasis or a caveat ("wanneerNiet") is not a
debate. A principle has kanten null.

Style: plain English, short sentences, talk to the player ("you"). No em dashes or en dashes, no
hype words, no "always" or "never" unless the lessons say so.

Fields:

- id: a short kebab-case slug of the titel, unique within your answer.
- thema: ${isThema ? `always "${portie.sleutel}".` : 'the theme id that fits the principle best (theme ids: ' + themaVolgorde.join(', ') + ').'}
- leger: ${isThema
    ? `null for advice that applies to any army. Lessons with a \`leger\` come from a player of that
  army; they can support a general principle when their advice is general and the army is only the
  example. Advice that only holds for one army (playing it, or facing it) gets that army's slug,
  and the titel then names the army ("Against Tomb Kings, ..." or "With Wood Elves, ...").`
    : `always "${portie.sleutel}". These are the things players keep repeating about this army; the
  titel does not need to repeat the army name.`}

Quality over quantity: usually 3 to 12 principles for a list this size, fewer for a short list,
none if no advice is shared. Order them from best supported to least.

Answer: a JSON object \`{ "principes": [ { "id", "titel", "tekst", "soort", "thema", "leger", "lessen": [], "kanten": null | [ { "standpunt", "lessen": [] } ] } ] }\`.`;
}

function bouwPrompt(portie) {
  return [regels(portie), `## Lessons (${portie.lessen.length}, one JSON object per line)`, portie.lessen.map((l) => lesRegel(l, portie)).join('\n')].join('\n\n') + '\n';
}

function bouwSchema(portie) {
  const ids = portie.lessen.map((l) => l.id);
  const legers = portie.soort === 'thema' ? [...ctx.legers].sort() : [portie.sleutel];
  const themas = portie.soort === 'thema' ? [portie.sleutel] : themaVolgorde;
  return {
    type: 'object', additionalProperties: false, required: ['principes'],
    properties: {
      principes: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['id', 'titel', 'tekst', 'soort', 'thema', 'leger', 'lessen', 'kanten'],
          properties: {
            id: { type: 'string' },
            titel: { type: 'string' },
            tekst: { type: 'string' },
            soort: { type: 'string', enum: ['principe', 'debat'] },
            thema: { type: 'string', enum: themas },
            leger: portie.soort === 'thema' ? { type: ['string', 'null'], enum: [...legers, null] } : { type: 'string', enum: legers },
            lessen: { type: 'array', items: { type: 'string', enum: ids } },
            kanten: {
              type: ['array', 'null'],
              items: {
                type: 'object', additionalProperties: false, required: ['standpunt', 'lessen'],
                properties: { standpunt: { type: 'string' }, lessen: { type: 'array', items: { type: 'string', enum: ids } } },
              },
            },
          },
        },
      },
    },
  };
}

// ── Antwoord nakijken ──────────────────────────────────────────────────────
const STREEP = /\s*[—–]\s*/g;
const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');

/** Codex-principes van een portie opschonen. Geeft { principes, correcties }. */
function beoordeel(portie, ruw) {
  const ids = new Set(portie.lessen.map((l) => l.id));
  const correcties = [];
  const principes = [];
  const gezien = new Set();
  for (const [i, x] of (Array.isArray(ruw) ? ruw : []).entries()) {
    const w = `principe ${i + 1} (${x?.id ?? '?'})`;
    if (!x || typeof x !== 'object') { correcties.push(`${w}: geen object, weggelaten`); continue; }
    const schoon = (s, veld) => {
      let t = String(s ?? '').trim();
      if (STREEP.test(t)) { correcties.push(`${w}: gedachtestreepje in ${veld} vervangen`); t = t.replace(STREEP, ', '); }
      STREEP.lastIndex = 0;
      return t;
    };
    const titel = schoon(x.titel, 'titel').replace(/\.$/, '');
    const tekst = schoon(x.tekst, 'tekst');
    if (!titel || !tekst) { correcties.push(`${w}: titel of tekst ontbreekt, weggelaten`); continue; }
    const filter = (lijst) => {
      const uit = [];
      for (const id of Array.isArray(lijst) ? lijst : []) {
        if (!ids.has(id)) { correcties.push(`${w}: onbekende les ${id} weggelaten`); continue; }
        if (!uit.includes(id)) uit.push(id);
      }
      return uit;
    };
    let soort = x.soort === 'debat' ? 'debat' : 'principe';
    let kanten = null;
    let lesIds = filter(x.lessen);
    if (soort === 'debat') {
      kanten = (Array.isArray(x.kanten) ? x.kanten : []).map((k) => ({ standpunt: schoon(k?.standpunt, 'standpunt'), lessen: filter(k?.lessen) }))
        .filter((k) => k.standpunt && k.lessen.length);
      if (kanten.length < 2) { correcties.push(`${w}: debat met minder dan 2 kanten wordt een principe`); soort = 'principe'; kanten = null; }
      else for (const k of kanten) for (const id of k.lessen) if (!lesIds.includes(id)) lesIds.push(id);
    }
    if (soort === 'debat') {
      const opKant = new Set(kanten.flatMap((k) => k.lessen));
      const los = lesIds.filter((id) => !opKant.has(id));
      if (los.length) { correcties.push(`${w}: ${los.join(', ')} bij geen kant, uit het debat gehaald`); lesIds = lesIds.filter((id) => opKant.has(id)); }
    }
    if (lesIds.length < 2) { correcties.push(`${w}: minder dan 2 lessen, weggelaten`); continue; }
    const thema = portie.soort === 'thema' ? portie.sleutel : (ctx.themas.has(x.thema) ? x.thema : null);
    if (!thema) { correcties.push(`${w}: onbekend thema ${x.thema}, weggelaten`); continue; }
    let leger = portie.soort === 'leger' ? portie.sleutel : (x.leger ?? null);
    if (leger != null && !ctx.legers.has(leger)) { correcties.push(`${w}: onbekend leger ${leger}, algemeen gemaakt`); leger = null; }
    let id = slug(x.id) || slug(titel);
    while (gezien.has(id)) id = `${id}-2`;
    gezien.add(id);
    principes.push({ id, titel, tekst, soort, thema, leger, lessen: lesIds, kanten });
  }
  return { principes, correcties };
}

// ── Een Codex-run ──────────────────────────────────────────────────────────
// Bewaakt: tactics/ en public/ behalve de eigen uitvoermap. Codex draait in een lege tijdelijke map en
// zou de repo niet moeten zien; raakt hij toch iets aan, dan gaat het terug.
const bewaakt = (p) => (p.startsWith('tactics/') || p.startsWith('public/'))
  && !p.startsWith('tactics/codex/principes/') && !p.startsWith('tactics/codex/teruggedraaid/')
  && !p.startsWith('tactics/ruw/') && !p.startsWith('tactics/cache/')
  && p !== 'tactics/ophalen-log.json' && p !== 'tactics/garbled.json';

function vraag(portie) {
  const werkmap = fs.mkdtempSync(path.join(os.tmpdir(), 'tactics-principes-'));
  const laatste = path.join(os.tmpdir(), `tactics-principes-${process.pid}-${Date.now()}.txt`);
  const schemaPad = path.join(os.tmpdir(), `tactics-principes-schema-${process.pid}.json`);
  fs.writeFileSync(schemaPad, JSON.stringify(bouwSchema(portie)), 'utf8');
  const prompt = bouwPrompt(portie);
  const voor = momentopname((p) => !bewaakt(p));
  const run = draaiCodex(prompt, laatste, { model: opties.model, effort: opties.effort, sandbox: 'read-only', werkmap, schema: schemaPad, timeoutMs: TIMEOUT_MS });
  const na = momentopname((p) => !bewaakt(p));
  fs.rmSync(laatste, { force: true });
  fs.rmSync(schemaPad, { force: true });
  const achtergelaten = fs.readdirSync(werkmap);
  fs.rmSync(werkmap, { recursive: true, force: true });

  const basis = { promptKB: Math.round(Buffer.byteLength(prompt) / 1024), sec: run.sec, exit: run.exit, usage: run.usage, items: run.perSoort, commandos: run.commandos };
  const vreemd = verschillen(voor, na);
  if (vreemd.length) {
    const stempel = new Date().toISOString().replace(/[:.]/g, '-');
    return { ...basis, status: 'mislukt', reden: 'Codex veranderde bestanden in de repo', teruggedraaid: vreemd.map((p) => ({ pad: p, actie: draaiTerug(p, voor, stempel) })) };
  }
  if (achtergelaten.length) return { ...basis, status: 'mislukt', reden: `Codex liet bestanden achter in de werkmap: ${achtergelaten.join(', ')}` };
  if (run.fataal) return { ...basis, status: 'gestopt', reden: run.fouten.concat(run.stderrStaart).join(' | ').slice(0, 600) };
  if (!run.bericht) return { ...basis, status: 'mislukt', reden: `geen antwoord (exit ${run.exit}${run.timeout ? ', timeout' : ''}) ${run.fouten.join(' | ')} ${run.stderrStaart}`.slice(0, 600) };
  const tekst = run.bericht.replace(/^﻿/, '').replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  let ruw;
  try { ruw = JSON.parse(tekst); } catch (e) { return { ...basis, status: 'mislukt', reden: `antwoord is geen JSON: ${e.message}` }; }
  if (!ruw || !Array.isArray(ruw.principes)) return { ...basis, status: 'mislukt', reden: 'antwoord heeft geen principes-lijst' };
  return { ...basis, status: 'ok', principes: ruw.principes };
}

// ── Codex-porties draaien ──────────────────────────────────────────────────
async function draaiPorties() {
  let teDoen;
  if (opties.scopes) {
    const onbekend = opties.scopes.filter((s) => !porties.some((p) => p.scope === s));
    if (onbekend.length) { console.error(`Onbekende portie(s): ${onbekend.join(', ')}. Bekend: ${porties.map((p) => p.scope).join(', ')}`); process.exit(1); }
    teDoen = porties.filter((p) => opties.scopes.includes(p.scope));
  } else {
    teDoen = porties.filter((p) => opties.opnieuw || !fs.existsSync(cachePad(p.scope)));
  }
  const uitvoeren = teDoen.slice(0, opties.max);
  console.log(`${porties.length} porties, ${teDoen.length} te doen${uitvoeren.length < teDoen.length ? `, nu ${uitvoeren.length}` : ''}; model ${opties.model}, effort ${opties.effort}.`);
  let opRij = 0;
  for (let i = 0; i < uitvoeren.length; i++) {
    const portie = uitvoeren[i];
    console.log(`\n[${i + 1}/${uitvoeren.length}] ${portie.scope}: ${portie.lessen.length} lessen`);
    const runs = [];
    let res = vraag(portie);
    if (res.status === 'mislukt') {
      console.log(`  mislukt (${res.reden}); een herkansing...`);
      runs.push({ poging: 1, ...res, principes: undefined });
      await slaap(PAUZE_MS);
      res = vraag(portie);
    }
    runs.push({ poging: runs.length + 1, ...res, principes: undefined });
    if (res.status === 'gestopt') return `Codex meldt een gebruikslimiet, loginfout of onbekend model: ${res.reden}`;
    if (res.status !== 'ok') {
      console.log(`  MISLUKT: ${res.reden}`);
      for (const t of res.teruggedraaid ?? []) console.log(`    teruggedraaid: ${t.pad} (${t.actie})`);
      if (++opRij >= 3) return `3 porties op rij mislukt; laatste reden: ${res.reden}`;
      continue;
    }
    opRij = 0;
    const b = beoordeel(portie, res.principes);
    schrijfJson(cachePad(portie.scope), {
      scope: portie.scope, soort: portie.soort, sleutel: portie.sleutel, gemaaktOp: new Date().toISOString(),
      model: opties.model, effort: opties.effort, invoerHash: invoerHash(portie), invoer: portie.lessen.map((l) => l.id),
      principes: b.principes, correcties: b.correcties, runs,
    });
    const tok = res.usage ? `, ${res.usage.input_tokens} in / ${res.usage.output_tokens} uit` : '';
    console.log(`  ok in ${res.sec}s${tok}: ${b.principes.length} principe(s), ${b.correcties.length} correctie(s)`);
    for (const c of b.correcties) console.log(`    ${c}`);
    if (i < uitvoeren.length - 1) await slaap(PAUZE_MS);
  }
  return null;
}

// ── Samenstellen ───────────────────────────────────────────────────────────
function overlap(a, b) {
  const sb = new Set(b);
  const gedeeld = a.filter((id) => sb.has(id)).length;
  return gedeeld / Math.min(a.length, b.length);
}

/** Het thema waar de meeste lessen hun hoofdthema hebben, uit de kandidaten; gelijk -> waar de meeste
 *  lessen het thema hebben; gelijk -> het eerste kandidaat-thema. */
function besteThema(lesIds, kandidaten) {
  const score = (t) => {
    let hoofd = 0;
    let ook = 0;
    for (const id of lesIds) {
      const l = lesIndex.get(id);
      if (!l) continue;
      if (l.themas[0] === t) hoofd++;
      if (l.themas.includes(t)) ook++;
    }
    return [hoofd, ook];
  };
  let beste = kandidaten[0];
  let bs = score(beste);
  for (const t of kandidaten.slice(1)) {
    const s = score(t);
    if (s[0] > bs[0] || (s[0] === bs[0] && s[1] > bs[1])) { beste = t; bs = s; }
  }
  return beste;
}

function samenstellen() {
  const verslag = { gemaaktOp: new Date().toISOString(), ontbreekt: [], verouderd: [], hernoemd: [], samengevoegd: [], hand: [], afgevallen: [] };
  // 1. Alle principes uit de porties.
  const alle = [];
  const ids = new Set();
  for (const portie of porties) {
    const data = leesJson(cachePad(portie.scope));
    if (!data) { verslag.ontbreekt.push(portie.scope); continue; }
    if (data.invoerHash !== invoerHash(portie)) verslag.verouderd.push(portie.scope);
    for (const p of data.principes ?? []) {
      let id = p.id;
      if (ids.has(id)) { id = `${p.id}-${portie.sleutel}`; verslag.hernoemd.push(`${p.id} (${portie.scope}) -> ${id}`); }
      let n = 2;
      while (ids.has(id)) id = `${p.id}-${portie.sleutel}-${n++}`;
      ids.add(id);
      alle.push({ ...p, id, scope: portie.scope, themaKandidaten: [p.thema], samengevoegd: [] });
    }
  }
  if (verslag.ontbreekt.length) {
    console.error(`Nog geen antwoord voor: ${verslag.ontbreekt.join(', ')}. Draai eerst npm run tactics:principles.`);
    process.exit(1);
  }
  if (verslag.verouderd.length) console.warn(`Let op: de lessen van ${verslag.verouderd.join(', ')} zijn veranderd sinds de Codex-run (opnieuw: -- --scope ${verslag.verouderd.join(',')}).`);

  // 2. Dubbelen samenvoegen (grootste eerst; alleen principe met principe, binnen hetzelfde leger).
  const hand = leesJson(HAND, {});
  const nietSamen = new Set((hand.nietSamenvoegen ?? []).map(([a, b]) => [a, b].sort().join('|')));
  const volgorde = [...alle].sort((a, b) => b.lessen.length - a.lessen.length);
  const blijft = [];
  for (const p of volgorde) {
    const doel = p.soort === 'principe'
      ? blijft.find((s) => s.soort === 'principe' && (s.leger ?? null) === (p.leger ?? null)
        && !nietSamen.has([s.id, p.id].sort().join('|')) && overlap(p.lessen, s.lessen) >= OVERLAP)
      : null;
    if (!doel) { blijft.push(p); continue; }
    verslag.samengevoegd.push(`${p.id} (${p.scope}) -> ${doel.id} (${doel.scope}), overlap ${Math.round(overlap(p.lessen, doel.lessen) * 100)}%`);
    for (const id of p.lessen) if (!doel.lessen.includes(id)) doel.lessen.push(id);
    if (!doel.themaKandidaten.includes(p.thema)) doel.themaKandidaten.push(p.thema);
    doel.samengevoegd.push(p.id);
  }
  for (const p of blijft) if (p.themaKandidaten.length > 1) p.thema = besteThema(p.lessen, p.themaKandidaten);

  // 3. Handcorrecties.
  const index = new Map(blijft.map((p) => [p.id, p]));
  const handFout = [];
  const moet = (id, waar) => { if (!index.has(id)) { handFout.push(`${waar}: principe ${id} bestaat niet (meer)`); return false; } return true; };
  for (const { in: naar, uit, thema } of hand.samenvoegen ?? []) {
    if (!moet(naar, 'samenvoegen')) continue;
    const doel = index.get(naar);
    for (const id of uit ?? []) {
      if (!moet(id, 'samenvoegen')) continue;
      for (const l of index.get(id).lessen) if (!doel.lessen.includes(l)) doel.lessen.push(l);
      index.delete(id);
      verslag.hand.push(`samengevoegd: ${id} -> ${naar}`);
    }
    if (thema) doel.thema = thema;
  }
  for (const id of hand.weg ?? []) if (moet(id, 'weg')) { index.delete(id); verslag.hand.push(`weg: ${id}`); }
  for (const [id, w] of Object.entries(hand.wijzig ?? {})) {
    if (id.startsWith('_') || !moet(id, 'wijzig')) continue;
    const p = index.get(id);
    for (const veld of ['titel', 'tekst', 'soort', 'thema', 'leger', 'lessen', 'kanten']) if (w[veld] !== undefined) p[veld] = w[veld];
    for (const l of w.lessenErbij ?? []) if (!p.lessen.includes(l)) p.lessen.push(l);
    if (w.lessenEraf) p.lessen = p.lessen.filter((l) => !w.lessenEraf.includes(l));
    if (w.lessenEraf && p.kanten) p.kanten = p.kanten.map((k) => ({ ...k, lessen: k.lessen.filter((l) => !w.lessenEraf.includes(l)) }));
    verslag.hand.push(`gewijzigd: ${id} (${Object.keys(w).filter((k) => !k.startsWith('_')).join(', ')})`);
  }
  for (const p of hand.nieuw ?? []) {
    if (index.has(p.id)) { handFout.push(`nieuw: ${p.id} bestaat al`); continue; }
    index.set(p.id, { leger: null, kanten: null, ...p });
    verslag.hand.push(`nieuw: ${p.id}`);
  }
  if (handFout.length) { console.error(`Fout(en) in ${rel(HAND)}:\n- ${handFout.join('\n- ')}`); process.exit(1); }

  // 4. Tellen en de drempel.
  const kandidaten = [...index.values()].map((p) => ({
    id: p.id, titel: p.titel, tekst: p.tekst, soort: p.soort, thema: p.thema, leger: p.leger ?? null,
    lessen: p.lessen, ...(p.soort === 'debat' ? { kanten: p.kanten } : {}),
  }));
  const eerst = rangschik(kandidaten, { lesIndex, bronIndex: ctx.bronIndex, themaVolgorde });
  const houden = new Set();
  for (const p of eerst.principes) {
    if (haaltDrempel(p)) houden.add(p.id);
    else verslag.afgevallen.push({ id: p.id, titel: p.titel, leger: p.leger, aantalLessen: p.aantalLessen, aantalKanalen: p.aantalKanalen });
  }
  const r = rangschik(kandidaten.filter((p) => houden.has(p.id)), { lesIndex, bronIndex: ctx.bronIndex, themaVolgorde });
  const bestand = { bijgewerkt: vandaag(), drempel: DREMPEL, principes: r.principes, top10: r.top10, debat: r.debat, perThema: r.perThema, perLeger: r.perLeger };

  // 5. Dezelfde controle als tactics:build.
  const c = controleerPrincipes(bestand, { lesIndex, bronIndex: ctx.bronIndex, themaVolgorde, legers: ctx.legers });
  if (c.fouten.length) { console.error(`${c.fouten.length} fout(en), niets geschreven:\n- ${c.fouten.join('\n- ')}`); process.exit(1); }
  schrijfJson(UITVOER, bestand);
  schrijfJson(VERSLAG, verslag);

  const regel = (p) => `${p.titel} · ${p.aantalLessen} lessons · ${p.aantalKanalen} channels  [${p.id}]`;
  const byId = new Map(r.principes.map((p) => [p.id, p]));
  console.log(`\n${r.principes.length} principes (${eerst.principes.length - r.principes.length} onder de drempel), ${verslag.samengevoegd.length} samengevoegd, ${verslag.hand.length} handcorrectie(s).`);
  console.log('\nTop 10:');
  r.top10.forEach((id, i) => console.log(`  ${i + 1}. ${regel(byId.get(id))}`));
  if (r.debat.length) { console.log('Debat:'); for (const id of r.debat) console.log(`  - ${regel(byId.get(id))}`); }
  console.log('Per thema:');
  for (const t of themaVolgorde) console.log(`  ${t}: ${(r.perThema[t] ?? []).length} (${r.principes.filter((p) => p.thema === t && p.leger == null).length} in totaal)`);
  console.log('Per leger:');
  for (const [l, lijst] of Object.entries(r.perLeger)) console.log(`  ${l}: ${lijst.length}`);
  console.log(`\nGeschreven: ${rel(UITVOER)}; verslag in ${rel(VERSLAG)}.`);
}

// ── Hoofdlus ───────────────────────────────────────────────────────────────
fs.mkdirSync(MAP, { recursive: true });
if (opties.droog) {
  const portie = porties.find((p) => p.scope === (opties.droogScope ?? porties[0].scope));
  if (!portie) { console.error(`Onbekende portie ${opties.droogScope}. Bekend: ${porties.map((p) => p.scope).join(', ')}`); process.exit(1); }
  const p = bouwPrompt(portie);
  const pad = path.join(os.tmpdir(), `tactics-principes-${portie.scope}.md`);
  fs.writeFileSync(pad, p, 'utf8');
  fs.writeFileSync(pad.replace(/\.md$/, '-schema.json'), JSON.stringify(bouwSchema(portie), null, 2), 'utf8');
  console.log(`${porties.length} porties: ${porties.map((x) => `${x.scope} (${x.lessen.length})`).join(', ')}`);
  console.log(`Prompt ${Math.round(Buffer.byteLength(p) / 1024)} kB -> ${pad} (schema ernaast)`);
  process.exit(0);
}
if (!opties.samenstellen) {
  const gestopt = await draaiPorties();
  if (gestopt) { console.error(`\nGESTOPT: ${gestopt}`); process.exit(2); }
}
samenstellen();
