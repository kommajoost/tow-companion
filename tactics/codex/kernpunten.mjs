// Codex-route: kernpunten per subthema (Codex CLI, ChatGPT-abonnement).
//   npm run tactics:keypoints                    alle subthema's zonder antwoord in tactics/codex/kernpunten/,
//                                                daarna samenstellen naar public/tactics/kernpunten.json
//   npm run tactics:keypoints -- --subthema reading-the-enemy,screens   alleen deze subthema's (ook opnieuw)
//   npm run tactics:keypoints -- --opnieuw       alle subthema's opnieuw vragen
//   npm run tactics:keypoints -- --max 2         hooguit 2 Codex-runs
//   npm run tactics:keypoints -- --droog [thema] alleen de prompt (en het schema) van een thema bouwen
//   npm run tactics:keypoints -- --samenstellen  geen Codex: alleen public/tactics/kernpunten.json maken
//   --model <naam> (standaard gpt-6.1-sol of $TACTICS_CODEX_MODEL), --effort (standaard high of
//   $TACTICS_KEYPOINTS_EFFORT)
//
// Een kernpunt is een advies dat meerdere lessen in EEN subthema (een sectie op de pagina) geven: titel
// (een claim), een zin uitleg en de lessen. Per thema een Codex-run met de subthema's die nog geen
// antwoord hebben; per subthema komen de lessen en de principes die er minstens 2 lessen hebben mee.
// Codex draait in een lege tijdelijke map, sandbox read-only, met een JSON Schema per subthema (de
// les-ids van dat subthema als enum). Elk antwoord gaat per subthema naar
// tactics/codex/kernpunten/<subthema>.json, dus een onderbroken run gaat verder waar hij was. Stoppen
// bij een gebruikslimiet, loginfout of onbekend model, en na 3 mislukte runs op rij. Nooit twee
// Codex-runs tegelijk.
//
// Samenstellen (deterministisch, geen Codex), per subthema:
//   1. de kandidaten uit de cache; lessen die niet (meer) in het subthema zitten vallen weg;
//   2. dubbelen samenvoegen: minstens 60% van de lessen van de kleinste zit ook in de andere;
//   3. handcorrecties uit tactics/codex/kernpunten/hand.json (wint altijd, blijft bij een herhaling);
//   4. principe koppelen: gaf Codex een principe op en zit minstens 60% van de lessen van het kernpunt in
//      dat principe, of zit (zonder opgave) in beide richtingen minstens 60% overlap, dan krijgt het
//      kernpunt principeId, de titel van het principe (en de tekst als die een zin is) en de lessen van
//      het principe in dit subthema erbij;
//   5. tellen (lessen en VERSCHILLENDE kanalen), rangorde (kanalen, dan lessen) en kiezen
//      (kernpunten-lib.mjs: eerst die met 2+ kanalen, een kanaal alleen als er anders te weinig zijn).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PUB, leesJson, schrijfJson, slaap } from '../lib.mjs';
import { tel } from '../principes-lib.mjs';
import { MIN_SECTIE, controleerKernpunten, kies, maxVoor, telKernpunten } from '../kernpunten-lib.mjs';
import { STANDAARD_MODEL, draaiCodex, draaiTerug, momentopname, verschillen } from './cli.mjs';
import { CDIR, laadContext, rel, vandaag } from './gedeeld.mjs';

const MAP = path.join(CDIR, 'kernpunten');
const HAND = path.join(MAP, 'hand.json');
const VERSLAG = path.join(MAP, 'samengesteld.json');
const UITVOER = path.join(PUB, 'kernpunten.json');
const PAUZE_MS = 4000;
const TIMEOUT_MS = 30 * 60 * 1000;
const OVERLAP = 0.6;

// ── Argumenten ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opties = {
  subs: null, opnieuw: false, max: Infinity, droog: false, droogThema: null, samenstellen: false,
  model: process.env.TACTICS_CODEX_MODEL || STANDAARD_MODEL, effort: process.env.TACTICS_KEYPOINTS_EFFORT || 'high',
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--opnieuw') opties.opnieuw = true;
  else if (a === '--samenstellen') opties.samenstellen = true;
  else if (a === '--droog') { opties.droog = true; if (argv[i + 1] && !argv[i + 1].startsWith('--')) opties.droogThema = argv[++i]; }
  else if (a === '--subthema') opties.subs = String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  else if (a === '--max') opties.max = Number(argv[++i]);
  else if (a === '--model') opties.model = argv[++i];
  else if (a === '--effort') opties.effort = argv[++i];
  else { console.error(`Onbekende optie ${a}`); process.exit(1); }
}

const ctx = laadContext();
const lessen = ctx.lessen.lessen;
const lesIndex = new Map(lessen.map((l) => [l.id, l]));
const principesBestand = leesJson(path.join(PUB, 'principes.json'), { principes: [] });
const principes = principesBestand.principes ?? [];
const principeIndex = new Map(principes.map((p) => [p.id, p]));
/** Handcorrecties op de principes: lessen die daar bewust van een principe zijn gehaald. */
const principesHand = leesJson(path.join(CDIR, 'principes', 'hand.json'), {});
const themaVolgorde = [...ctx.vocab.themas].sort((a, b) => a.volgorde - b.volgorde);
const kanaalNaam = (id) => ctx.kanaalIndex.get(id)?.naam ?? id;
const lesKanaalNamen = (l) => tel([l.id], lesIndex, ctx.bronIndex).kanalen.map(kanaalNaam);
const faseVolgorde = new Map(ctx.vocab.fases.map((f) => [f.id, f.volgorde]));

// ── Secties ────────────────────────────────────────────────────────────────
// Alle subthema's op volgorde, met hun lessen (op fase, dan leger) en de principes die er minstens 2
// lessen hebben.
const secties = [];
for (const t of themaVolgorde) {
  for (const s of [...(t.subthemas ?? [])].sort((a, b) => a.volgorde - b.volgorde)) {
    const ls = lessen.filter((l) => (l.subthemas ?? []).includes(s.id))
      .sort((a, b) => (faseVolgorde.get(a.fase) ?? 99) - (faseVolgorde.get(b.fase) ?? 99) || (a.leger ?? '').localeCompare(b.leger ?? ''));
    const ids = new Set(ls.map((l) => l.id));
    const pr = principes
      .map((p) => ({ p, hier: p.lessen.filter((id) => ids.has(id)) }))
      .filter((x) => x.hier.length >= 2)
      .sort((a, b) => b.hier.length - a.hier.length);
    secties.push({ sub: s.id, naam: s.naam, omschrijving: s.omschrijving, thema: t.id, themaNaam: t.naam, lessen: ls, principes: pr });
  }
}
const sectieIndex = new Map(secties.map((s) => [s.sub, s]));
const metKernpunten = secties.filter((s) => s.lessen.length >= MIN_SECTIE);
const invoerHash = (s) => crypto.createHash('sha1').update(s.lessen.map((l) => l.id).join(',') + '|' + s.principes.map((x) => `${x.p.id}:${x.hier.join(',')}`).join(';')).digest('hex').slice(0, 12);
const cachePad = (sub) => path.join(MAP, `${sub}.json`);

// ── Prompt en schema ───────────────────────────────────────────────────────
const kort = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n - 3) + '...' : s ?? null);

const lesRegel = (l) => JSON.stringify({
  id: l.id, titel: l.titel, tekst: l.tekst, waarom: kort(l.waarom, 380), wanneerNiet: kort(l.wanneerNiet, 220),
  tags: l.tags, leger: l.leger, kanalen: lesKanaalNamen(l),
});

function regels(thema, n) {
  return `# Key points per section of the tactics library

You are an isolated, non-interactive batch job for a Warhammer: The Old World companion app. The app
holds hundreds of short tactics lessons, each taken from a player's video (one channel = one
creator). Lessons are grouped in themes ("${thema.naam}") and, inside a theme, in sections. A player
who opens a section should learn its few main points without reading all its lessons. Everything you
need is in this prompt: do not run commands, do not read or write files, do not use tools. Reply with
the JSON answer only.

## Task

Below are ${n} section(s) of the theme "${thema.naam}", each with its lessons. For EACH section, find
the advice that several of its lessons give and write one key point per piece of advice.

A key point:

- is advice that at least 2 lessons of THIS section give. Same advice, not just the same topic:
  "screen your hammer with chaff" and "chaff can block march moves" are both about chaff but are
  different advice. Lessons from the same channel are usually the same speaker; different channels
  are independent players (the channels are listed per lesson). Advice from 2 or more channels is what
  we are after; a point from one channel only is a fallback and is used only when a section has too
  few others.
- titel: one short claim a player can act on, at most about 10 words ("Screen your hammers until
  they charge"). Not a question, not a label like "Chaff tips".
- tekst: exactly ONE short sentence: what to do and the reason the lessons give.
- must be faithful: say only what its lessons say. No new claims, no rules knowledge, numbers, units
  or examples of your own. Every part of titel and tekst must be backed by at least two of its
  lessons. If the lessons only agree on a narrower point, write the narrower point.
- must not be vaguer than needed: write the most specific advice the lessons share. "Think about
  deployment" is useless; "Deploy your fast units last so you can react" is useful.
- lessen: the ids of ALL lessons of this section that really give this advice, and only those. A
  lesson may support more than one key point. Lessons that fit no key point are fine; do not force
  them in.
- key points of one section must be different advice from each other (no two phrasings of one point).
- principe: some sections list existing principles (advice already summarised across the whole
  library) with the lessons of this section they cover. When a key point gives the SAME advice as one
  of them, set principe to its id and use its titel word for word as your titel (do not invent a
  second phrasing). Otherwise principe is null.
- An army section (a matchup, or lessons with a \`leger\`) is fine: the key points are then about that
  army or matchup.

How many: give the best 3 to 6 candidate key points per section, best supported first (more
different channels, then more lessons). A section of fewer than 10 lessons: 2 to 4. Return an empty
list for a section only if no two lessons give the same advice.

Style: plain English, short sentences, talk to the player ("you"). No em dashes or en dashes, no hype
words, no "always" or "never" unless the lessons say so.

Answer: a JSON object \`{ "secties": { "<section id>": [ { "titel", "tekst", "lessen": [], "principe": null | "<principle id>" } ] } }\` with every section id below as a key.`;
}

function sectieTekst(s) {
  const kop = `## Section ${s.sub} (${s.naam}): ${s.omschrijving} ${s.lessen.length} lessons.`;
  const pr = s.principes.length
    ? `Existing principles covering lessons of this section:\n${s.principes.map((x) => JSON.stringify({ id: x.p.id, titel: x.p.titel, tekst: x.p.tekst, leger: x.p.leger, lessenHier: x.hier })).join('\n')}`
    : 'Existing principles covering lessons of this section: none.';
  return [kop, pr, `Lessons (one JSON object per line):\n${s.lessen.map(lesRegel).join('\n')}`].join('\n\n');
}

function bouwPrompt(portie) {
  return [regels(portie.thema, portie.secties.length), ...portie.secties.map(sectieTekst)].join('\n\n') + '\n';
}

function bouwSchema(portie) {
  const props = {};
  for (const s of portie.secties) {
    props[s.sub] = {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['titel', 'tekst', 'lessen', 'principe'],
        properties: {
          titel: { type: 'string' },
          tekst: { type: 'string' },
          lessen: { type: 'array', items: { type: 'string', enum: s.lessen.map((l) => l.id) } },
          principe: { type: ['string', 'null'], enum: [...s.principes.map((x) => x.p.id), null] },
        },
      },
    };
  }
  return {
    type: 'object', additionalProperties: false, required: ['secties'],
    properties: { secties: { type: 'object', additionalProperties: false, required: portie.secties.map((s) => s.sub), properties: props } },
  };
}

// ── Antwoord nakijken ──────────────────────────────────────────────────────
const STREEP = /\s*[—–]\s*/g;
const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');

/** Codex-kernpunten van een sectie opschonen. Geeft { kernpunten, correcties }. */
function beoordeel(s, ruw) {
  const ids = new Set(s.lessen.map((l) => l.id));
  const prIds = new Set(s.principes.map((x) => x.p.id));
  const correcties = [];
  const kernpunten = [];
  const gezien = new Set();
  for (const [i, x] of (Array.isArray(ruw) ? ruw : []).entries()) {
    const w = `kernpunt ${i + 1}`;
    if (!x || typeof x !== 'object') { correcties.push(`${w}: geen object, weggelaten`); continue; }
    const schoon = (v, veld) => {
      let t = String(v ?? '').trim();
      if (STREEP.test(t)) { correcties.push(`${w}: gedachtestreepje in ${veld} vervangen`); t = t.replace(STREEP, ', '); }
      STREEP.lastIndex = 0;
      return t;
    };
    const titel = schoon(x.titel, 'titel').replace(/\.$/, '');
    const tekst = schoon(x.tekst, 'tekst');
    if (!titel || !tekst) { correcties.push(`${w}: titel of tekst ontbreekt, weggelaten`); continue; }
    const lesIds = [];
    for (const id of Array.isArray(x.lessen) ? x.lessen : []) {
      if (!ids.has(id)) { correcties.push(`${w}: les ${id} hoort niet bij de sectie, weggelaten`); continue; }
      if (!lesIds.includes(id)) lesIds.push(id);
    }
    if (lesIds.length < 2) { correcties.push(`${w} (${titel}): minder dan 2 lessen, weggelaten`); continue; }
    let principe = x.principe ?? null;
    if (principe != null && !prIds.has(principe)) { correcties.push(`${w}: onbekend principe ${principe} weggelaten`); principe = null; }
    let id = slug(titel);
    while (gezien.has(id)) id = `${id}-2`;
    gezien.add(id);
    kernpunten.push({ id, titel, tekst, lessen: lesIds, principe });
  }
  return { kernpunten, correcties };
}

// ── Een Codex-run ──────────────────────────────────────────────────────────
// Bewaakt: tactics/ en public/ behalve de eigen uitvoermap. Codex draait in een lege tijdelijke map en
// zou de repo niet moeten zien; raakt hij toch iets aan, dan gaat het terug.
const bewaakt = (p) => (p.startsWith('tactics/') || p.startsWith('public/'))
  && !p.startsWith('tactics/codex/kernpunten/') && !p.startsWith('tactics/codex/teruggedraaid/')
  && !p.startsWith('tactics/ruw/') && !p.startsWith('tactics/cache/')
  && p !== 'tactics/ophalen-log.json' && p !== 'tactics/garbled.json';

function vraag(portie) {
  const werkmap = fs.mkdtempSync(path.join(os.tmpdir(), 'tactics-kernpunten-'));
  const laatste = path.join(os.tmpdir(), `tactics-kernpunten-${process.pid}-${Date.now()}.txt`);
  const schemaPad = path.join(os.tmpdir(), `tactics-kernpunten-schema-${process.pid}.json`);
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
  if (!ruw || typeof ruw.secties !== 'object' || ruw.secties === null) return { ...basis, status: 'mislukt', reden: 'antwoord heeft geen secties' };
  const ontbreekt = portie.secties.filter((s) => !Array.isArray(ruw.secties[s.sub])).map((s) => s.sub);
  if (ontbreekt.length) return { ...basis, status: 'mislukt', reden: `antwoord mist sectie(s) ${ontbreekt.join(', ')}` };
  return { ...basis, status: 'ok', secties: ruw.secties };
}

// ── Codex-runs: per thema de subthema's die een antwoord nodig hebben ──────
function porties() {
  let teDoen;
  if (opties.subs) {
    const onbekend = opties.subs.filter((s) => !sectieIndex.has(s));
    if (onbekend.length) { console.error(`Onbekend subthema: ${onbekend.join(', ')}`); process.exit(1); }
    const klein = opties.subs.filter((s) => sectieIndex.get(s).lessen.length < MIN_SECTIE);
    if (klein.length) console.warn(`Minder dan ${MIN_SECTIE} lessen, overgeslagen: ${klein.join(', ')}`);
    teDoen = metKernpunten.filter((s) => opties.subs.includes(s.sub));
  } else {
    teDoen = metKernpunten.filter((s) => opties.opnieuw || !fs.existsSync(cachePad(s.sub)));
  }
  const uit = [];
  for (const t of themaVolgorde) {
    const ss = teDoen.filter((s) => s.thema === t.id);
    if (ss.length) uit.push({ thema: t, secties: ss });
  }
  return uit;
}

async function draaiPorties() {
  const alle = porties();
  const uitvoeren = alle.slice(0, opties.max);
  const n = alle.reduce((a, p) => a + p.secties.length, 0);
  console.log(`${metKernpunten.length} subthema's met ${MIN_SECTIE}+ lessen, ${n} te doen in ${alle.length} run(s)${uitvoeren.length < alle.length ? `, nu ${uitvoeren.length}` : ''}; model ${opties.model}, effort ${opties.effort}.`);
  let opRij = 0;
  for (let i = 0; i < uitvoeren.length; i++) {
    const portie = uitvoeren[i];
    console.log(`\n[${i + 1}/${uitvoeren.length}] ${portie.thema.id}: ${portie.secties.map((s) => `${s.sub} (${s.lessen.length})`).join(', ')}`);
    const runs = [];
    let res = vraag(portie);
    if (res.status === 'mislukt') {
      console.log(`  mislukt (${res.reden}); een herkansing...`);
      runs.push({ poging: 1, ...res, secties: undefined });
      await slaap(PAUZE_MS);
      res = vraag(portie);
    }
    runs.push({ poging: runs.length + 1, ...res, secties: undefined });
    if (res.status === 'gestopt') return `Codex meldt een gebruikslimiet, loginfout of onbekend model: ${res.reden}`;
    if (res.status !== 'ok') {
      console.log(`  MISLUKT: ${res.reden}`);
      for (const t of res.teruggedraaid ?? []) console.log(`    teruggedraaid: ${t.pad} (${t.actie})`);
      if (++opRij >= 3) return `3 runs op rij mislukt; laatste reden: ${res.reden}`;
      continue;
    }
    opRij = 0;
    const tok = res.usage ? `, ${res.usage.input_tokens} in / ${res.usage.output_tokens} uit` : '';
    console.log(`  ok in ${res.sec}s${tok}`);
    for (const s of portie.secties) {
      const b = beoordeel(s, res.secties[s.sub]);
      schrijfJson(cachePad(s.sub), {
        subthema: s.sub, thema: s.thema, gemaaktOp: new Date().toISOString(), model: opties.model, effort: opties.effort,
        portie: `${portie.thema.id}: ${portie.secties.map((x) => x.sub).join(',')}`,
        invoerHash: invoerHash(s), invoer: s.lessen.map((l) => l.id),
        kernpunten: b.kernpunten, correcties: b.correcties, runs,
      });
      console.log(`  ${s.sub}: ${b.kernpunten.length} kandidaat(en), ${b.correcties.length} correctie(s)`);
      for (const c of b.correcties) console.log(`    ${c}`);
    }
    if (i < uitvoeren.length - 1) await slaap(PAUZE_MS);
  }
  return null;
}

// ── Samenstellen ───────────────────────────────────────────────────────────
function overlap(a, b) {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  return a.filter((id) => sb.has(id)).length / Math.min(a.length, b.length);
}
const deel = (a, b) => { const sb = new Set(b); return a.filter((id) => sb.has(id)).length; };
const eenZin = (s) => String(s ?? '').split(/(?<=[.!?])\s+/).filter(Boolean).length === 1;

function samenstellen() {
  const verslag = { gemaaktOp: new Date().toISOString(), ontbreekt: [], verouderd: [], geenKernpunten: [], samengevoegd: [], gekoppeld: [], hand: [], afgevallen: [], eenKanaal: [] };
  const hand = leesJson(HAND, {});
  const handFout = [];
  const perSubthema = {};
  for (const s of secties) {
    if (s.lessen.length < MIN_SECTIE) { verslag.geenKernpunten.push(`${s.sub}: ${s.lessen.length} lessen (onder ${MIN_SECTIE})`); continue; }
    const data = leesJson(cachePad(s.sub));
    if (!data) { verslag.ontbreekt.push(s.sub); continue; }
    if (data.invoerHash !== invoerHash(s)) verslag.verouderd.push(s.sub);
    const inSectie = new Set(s.lessen.map((l) => l.id));
    // 1. Kandidaten, alleen lessen die nog in het subthema zitten.
    let kand = (data.kernpunten ?? []).map((k) => ({ ...k, lessen: k.lessen.filter((id) => inSectie.has(id)), samengevoegd: [] }))
      .filter((k) => k.lessen.length >= 2);

    // 2. Dubbelen samenvoegen (grootste eerst).
    const h = hand[s.sub] ?? {};
    const nietSamen = new Set((h.nietSamenvoegen ?? []).map(([a, b]) => [a, b].sort().join('|')));
    const blijft = [];
    for (const k of [...kand].sort((a, b) => b.lessen.length - a.lessen.length)) {
      const doel = blijft.find((x) => !nietSamen.has([x.id, k.id].sort().join('|')) && overlap(k.lessen, x.lessen) >= OVERLAP);
      if (!doel) { blijft.push(k); continue; }
      verslag.samengevoegd.push(`${s.sub}: ${k.id} -> ${doel.id}, overlap ${Math.round(overlap(k.lessen, doel.lessen) * 100)}%`);
      for (const id of k.lessen) if (!doel.lessen.includes(id)) doel.lessen.push(id);
      if (!doel.principe && k.principe) doel.principe = k.principe;
    }
    // Volgorde van Codex terug (stabiel voor de review).
    kand = kand.filter((k) => blijft.includes(k));

    // 3. Handcorrecties: samenvoegen, weg, wijzig, nieuw.
    const index = new Map(kand.map((k) => [k.id, k]));
    const moet = (id, waar) => { if (!index.has(id)) { handFout.push(`${s.sub} ${waar}: kernpunt ${id} bestaat niet (meer)`); return false; } return true; };
    for (const { in: naar, uit } of h.samenvoegen ?? []) {
      if (!moet(naar, 'samenvoegen')) continue;
      const doel = index.get(naar);
      for (const id of uit ?? []) {
        if (!moet(id, 'samenvoegen')) continue;
        for (const l of index.get(id).lessen) if (!doel.lessen.includes(l)) doel.lessen.push(l);
        index.delete(id);
        verslag.hand.push(`${s.sub}: samengevoegd ${id} -> ${naar}`);
      }
    }
    for (const id of h.weg ?? []) if (moet(id, 'weg')) { index.delete(id); verslag.hand.push(`${s.sub}: weg ${id}`); }
    for (const [id, w] of Object.entries(h.wijzig ?? {})) {
      if (id.startsWith('_') || !moet(id, 'wijzig')) continue;
      const k = index.get(id);
      if (typeof w.titel === 'string') k.titel = w.titel;
      if (typeof w.tekst === 'string') k.tekst = w.tekst;
      if (Array.isArray(w.lessen)) k.lessen = [...w.lessen];
      if (w.principe !== undefined) { k.principe = w.principe; k.principeHand = true; }
      for (const l of w.lessenErbij ?? []) if (!k.lessen.includes(l)) k.lessen.push(l);
      if (w.lessenEraf) k.lessen = k.lessen.filter((l) => !w.lessenEraf.includes(l));
      if (w.titel !== undefined || w.tekst !== undefined) k.tekstHand = true;
      verslag.hand.push(`${s.sub}: gewijzigd ${id} (${Object.keys(w).filter((x) => !x.startsWith('_')).join(', ')})`);
    }
    for (const k of h.nieuw ?? []) {
      if (index.has(k.id)) { handFout.push(`${s.sub} nieuw: ${k.id} bestaat al`); continue; }
      index.set(k.id, { principe: null, ...k, lessen: [...k.lessen], tekstHand: true, principeHand: k.principe !== undefined });
      verslag.hand.push(`${s.sub}: nieuw ${k.id}`);
    }
    for (const k of index.values()) {
      const vreemd = k.lessen.filter((id) => !inSectie.has(id));
      if (vreemd.length) handFout.push(`${s.sub} ${k.id}: les(sen) buiten het subthema: ${vreemd.join(', ')}`);
    }

    // 4. Principe koppelen.
    for (const k of index.values()) {
      const opgegeven = k.principe ? s.principes.find((x) => x.p.id === k.principe) ?? (principeIndex.has(k.principe) ? { p: principeIndex.get(k.principe), hier: principeIndex.get(k.principe).lessen.filter((id) => inSectie.has(id)) } : null) : null;
      let koppel = null;
      if (k.principe === null && k.principeHand) koppel = null; // hand: bewust niet koppelen
      else if (opgegeven && (k.principeHand || deel(k.lessen, opgegeven.hier) / k.lessen.length >= OVERLAP)) koppel = opgegeven;
      else {
        if (opgegeven) verslag.gekoppeld.push(`${s.sub}: ${k.id} NIET aan ${opgegeven.p.id} (Codex gaf het op, maar ${deel(k.lessen, opgegeven.hier)}/${k.lessen.length} lessen in het principe)`);
        const kandidaten = s.principes.filter((x) => { const d = deel(k.lessen, x.hier); return d / k.lessen.length >= OVERLAP && d / x.hier.length >= OVERLAP; })
          .sort((a, b) => deel(k.lessen, b.hier) - deel(k.lessen, a.hier));
        if (!k.principeHand) koppel = kandidaten[0] ?? null;
      }
      if (!koppel) { k.principeId = null; continue; }
      k.principeId = koppel.p.id;
      const erbij = koppel.hier.filter((id) => !k.lessen.includes(id));
      k.lessen.push(...erbij);
      // Lessen die bij de review van de principes van dit principe zijn gehaald, en lessen die de hand
      // hier van het kernpunt haalt, blijven eraf (ook als het principe ze in dit subthema nog had).
      const eraf = [...(principesHand.wijzig?.[koppel.p.id]?.lessenEraf ?? []), ...(h.wijzig?.[k.id]?.lessenEraf ?? [])]
        .filter((id) => k.lessen.includes(id) && !(h.wijzig?.[k.id]?.lessenErbij ?? []).includes(id));
      if (eraf.length) {
        k.lessen = k.lessen.filter((id) => !eraf.includes(id));
        verslag.gekoppeld.push(`${s.sub}: ${k.id} zonder ${eraf.join(', ')} (bij de principes-review of hier met de hand gehaald)`);
      }
      if (!k.tekstHand) {
        k.titel = koppel.p.titel;
        if (eenZin(koppel.p.tekst)) k.tekst = koppel.p.tekst;
      }
      verslag.gekoppeld.push(`${s.sub}: ${k.id} -> ${koppel.p.id}${erbij.length ? ` (+${erbij.join(', ')})` : ''}`);
    }

    // 5. Tellen, rangorde, kiezen. Twee kernpunten met hetzelfde principe: de beste blijft.
    const geteld = telKernpunten([...index.values()].map((k) => ({ id: k.id, titel: k.titel, tekst: k.tekst, lessen: k.lessen, principeId: k.principeId })),
      { lesIndex, bronIndex: ctx.bronIndex });
    const principeGezien = new Set();
    const uniek = geteld.filter((k) => {
      if (!k.principeId) return true;
      if (principeGezien.has(k.principeId)) { verslag.afgevallen.push(`${s.sub}: ${k.id} (zelfde principe ${k.principeId} als een beter kernpunt)`); return false; }
      principeGezien.add(k.principeId);
      return true;
    });
    const gekozen = kies(uniek, s.lessen.length);
    for (const k of uniek) if (!gekozen.includes(k)) verslag.afgevallen.push(`${s.sub}: ${k.id} (${k.nLessen} lessen, ${k.nKanalen} kanalen)`);
    for (const k of gekozen) if (k.nKanalen < 2) verslag.eenKanaal.push(`${s.sub}: ${k.id}`);
    if (gekozen.length) perSubthema[s.sub] = gekozen;
    else verslag.geenKernpunten.push(`${s.sub}: geen kernpunt met ${2}+ lessen`);
  }
  if (handFout.length) { console.error(`Fout(en) in ${rel(HAND)}:\n- ${handFout.join('\n- ')}`); process.exit(1); }
  if (verslag.ontbreekt.length) {
    console.error(`Nog geen antwoord voor: ${verslag.ontbreekt.join(', ')}. Draai eerst npm run tactics:keypoints.`);
    process.exit(1);
  }
  if (verslag.verouderd.length) console.warn(`Let op: de lessen of principes van ${verslag.verouderd.join(', ')} zijn veranderd sinds de Codex-run (opnieuw: -- --subthema ${verslag.verouderd.join(',')}).`);

  const bestand = { bijgewerkt: vandaag(), drempel: { lessen: 2, sectie: MIN_SECTIE }, perSubthema };
  const c = controleerKernpunten(bestand, {
    lessen, lesIndex, bronIndex: ctx.bronIndex, subthemaIds: new Set(secties.map((s) => s.sub)), principeIds: new Set(principeIndex.keys()),
  });
  if (c.fouten.length) { console.error(`${c.fouten.length} fout(en), niets geschreven:\n- ${c.fouten.join('\n- ')}`); process.exit(1); }
  schrijfJson(UITVOER, bestand);
  schrijfJson(VERSLAG, verslag);

  const aantal = Object.values(perSubthema).reduce((a, l) => a + l.length, 0);
  console.log(`\n${aantal} kernpunten in ${Object.keys(perSubthema).length} subthema's (${verslag.geenKernpunten.length} zonder), ${verslag.samengevoegd.length} samengevoegd, ${verslag.gekoppeld.filter((x) => x.includes('->')).length} aan een principe gekoppeld, ${verslag.eenKanaal.length} uit een kanaal, ${verslag.hand.length} handcorrectie(s).`);
  for (const s of secties) {
    const lijst = perSubthema[s.sub];
    if (!lijst) continue;
    console.log(`  ${s.themaNaam} › ${s.naam} (${s.lessen.length}, max ${maxVoor(s.lessen.length)}):`);
    lijst.forEach((k, i) => console.log(`    ${i + 1}. ${k.titel} · ${k.nLessen} lessons · ${k.nKanalen} ch${k.principeId ? `  [principe ${k.principeId}]` : ''}`));
  }
  console.log(`\nGeschreven: ${rel(UITVOER)}; verslag in ${rel(VERSLAG)}.`);
}

// ── Hoofdlus ───────────────────────────────────────────────────────────────
fs.mkdirSync(MAP, { recursive: true });
if (opties.droog) {
  const thema = themaVolgorde.find((t) => t.id === (opties.droogThema ?? themaVolgorde[0].id));
  if (!thema) { console.error(`Onbekend thema ${opties.droogThema}. Bekend: ${themaVolgorde.map((t) => t.id).join(', ')}`); process.exit(1); }
  const portie = { thema, secties: metKernpunten.filter((s) => s.thema === thema.id) };
  const p = bouwPrompt(portie);
  const pad = path.join(os.tmpdir(), `tactics-kernpunten-${thema.id}.md`);
  fs.writeFileSync(pad, p, 'utf8');
  fs.writeFileSync(pad.replace(/\.md$/, '-schema.json'), JSON.stringify(bouwSchema(portie), null, 2), 'utf8');
  console.log(`${portie.secties.length} secties: ${portie.secties.map((s) => `${s.sub} (${s.lessen.length}, ${s.principes.length} principes)`).join(', ')}`);
  console.log(`Prompt ${Math.round(Buffer.byteLength(p) / 1024)} kB -> ${pad} (schema ernaast)`);
  process.exit(0);
}
if (!opties.samenstellen) {
  const gestopt = await draaiPorties();
  if (gestopt) { console.error(`\nGESTOPT: ${gestopt}`); process.exit(2); }
}
samenstellen();
