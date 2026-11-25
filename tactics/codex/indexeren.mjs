// Codex-route: lessen indexeren met thema's, subthema's en tags (Codex CLI, ChatGPT-abonnement).
//   npm run tactics:index                    alle lessen zonder geldige index in lessen.json en zonder
//                                            antwoord in tactics/codex/index/, in porties van 40
//   npm run tactics:index -- --alles         ook lessen die al een geldige index hebben (herindexeren)
//   npm run tactics:index -- --ids a,b,c     alleen deze lessen (ook als ze al een antwoord hebben)
//   npm run tactics:index -- --max 2         hooguit 2 porties
//   npm run tactics:index -- --batch 30      portiegrootte
//   npm run tactics:index -- --opnieuw-open  ook lessen die eerder twee keer ongeldig terugkwamen
//   npm run tactics:index -- --droog         alleen de prompt van de eerste portie bouwen
//   npm run tactics:index -- --toepassen     de antwoorden (en tactics/codex/index/hand.json) in
//                                            public/tactics/lessen.json zetten
//   --model <naam> (standaard gpt-6.1-sol of $TACTICS_CODEX_MODEL), --effort (standaard medium of
//   $TACTICS_INDEX_EFFORT), --zonder-schema (geen --output-schema meegeven)
//
// Per portie, serieel: prompt = regels + vocabulaire (tactics/themas.json, tactics/tags.json) + de
// lessen (id, titel, tekst, waarom, fase, leger, units). Codex draait in een lege tijdelijke map met
// sandbox read-only en een JSON Schema voor het antwoord; hij leest en schrijft geen bestanden. Daarna:
//   1. het antwoord is geldige JSON met per les { id, themas: [{ thema, subthema }], tags: [] };
//   2. elk antwoord wordt nagekeken tegen het vocabulaire (normaliseerIndex in gedeeld.mjs); een
//      ongeldige of ontbrekende les gaat een keer opnieuw naar Codex, met de reden erbij; is hij dan
//      nog ongeldig, dan staat hij onder `open` in het portiebestand: met de hand invullen in
//      tactics/codex/index/hand.json ({ "<id>": { "themas": [...], "tags": [...] } }, wint altijd);
//   3. de tijdelijke map is nog leeg en `git status` toont in tactics/ en public/ geen nieuwe
//      wijzigingen (anders terugdraaien met een kopie in tactics/codex/teruggedraaid/, portie mislukt).
// Elk portiebestand (tactics/codex/index/batch-NNN.json) wordt meteen weggeschreven, dus een
// onderbroken run gaat de volgende keer verder waar hij was. Stoppen bij een gebruikslimiet,
// loginfout of onbekend model, en na 3 mislukte porties op rij. Nooit twee Codex-runs tegelijk.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PUB, leesJson, schrijfJson, slaap } from '../lib.mjs';
import { STANDAARD_MODEL, draaiCodex, draaiTerug, momentopname, verschillen } from './cli.mjs';
import {
  CDIR, MAX_TAGS, MAX_THEMAS, MIN_TAGS, indelingVelden, laadContext, lesIndeling, normaliseerIndex, rel, vocabTekst,
} from './gedeeld.mjs';

const INDEX = path.join(CDIR, 'index');
const HAND = path.join(INDEX, 'hand.json');
const LESSEN = path.join(PUB, 'lessen.json');
const PAUZE_MS = 4000;
const TIMEOUT_MS = 20 * 60 * 1000;

// ── Argumenten ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opties = {
  batch: 40, max: Infinity, alles: false, ids: null, opnieuwOpen: false, droog: false, toepassen: false, schema: true,
  model: process.env.TACTICS_CODEX_MODEL || STANDAARD_MODEL, effort: process.env.TACTICS_INDEX_EFFORT || 'medium',
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--alles') opties.alles = true;
  else if (a === '--opnieuw-open') opties.opnieuwOpen = true;
  else if (a === '--droog') opties.droog = true;
  else if (a === '--toepassen') opties.toepassen = true;
  else if (a === '--zonder-schema') opties.schema = false;
  else if (a === '--batch') opties.batch = Number(argv[++i]);
  else if (a === '--max') opties.max = Number(argv[++i]);
  else if (a === '--ids') opties.ids = String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  else if (a === '--model') opties.model = argv[++i];
  else if (a === '--effort') opties.effort = argv[++i];
  else { console.error(`Onbekende optie ${a}`); process.exit(1); }
}
if (!(opties.batch >= 1)) { console.error('--batch moet minstens 1 zijn'); process.exit(1); }

const ctx = laadContext();
const lessen = ctx.lessen.lessen;
const lesIndex = new Map(lessen.map((l) => [l.id, l]));

// ── Wat er al is ───────────────────────────────────────────────────────────
function portieBestanden() {
  if (!fs.existsSync(INDEX)) return [];
  return fs.readdirSync(INDEX).filter((f) => /^batch-\d+\.json$/.test(f)).sort()
    .map((f) => ({ pad: path.join(INDEX, f), data: leesJson(path.join(INDEX, f)) })).filter((x) => x.data);
}

/** id -> { themas, tags, bron }: hand.json wint, daarna de nieuwste portie. */
function antwoorden() {
  const uit = new Map();
  const open = new Map();
  for (const { pad, data } of portieBestanden()) {
    for (const [id, r] of Object.entries(data.resultaten ?? {})) { uit.set(id, { ...r, bron: rel(pad) }); open.delete(id); }
    for (const [id, reden] of Object.entries(data.open ?? {})) if (!uit.has(id)) open.set(id, reden);
  }
  for (const [id, r] of Object.entries(leesJson(HAND, {}))) {
    if (id.startsWith('_')) continue; // _uitleg e.d.
    uit.set(id, { ...r, bron: 'hand' });
    open.delete(id);
  }
  return { uit, open };
}

const geldigInLessen = (l) => normaliseerIndex(ctx, lesIndeling(l), l.tags).fouten.length === 0;

// ── Toepassen ──────────────────────────────────────────────────────────────
if (opties.toepassen) {
  const { uit, open } = antwoorden();
  const fouten = [];
  let gezet = 0;
  const bestand = leesJson(LESSEN);
  bestand.lessen = bestand.lessen.map((l) => {
    const a = uit.get(l.id);
    if (!a) return l;
    const r = normaliseerIndex(ctx, a.themas, a.tags);
    if (r.fouten.length) { fouten.push(`${l.id} (${a.bron}): ${r.fouten.join('; ')}`); return l; }
    gezet++;
    // subthemas en tags direct na themas, de rest van de volgorde blijft.
    const { themas, subthemas } = indelingVelden(r.themas);
    const nieuw = {};
    for (const [k, v] of Object.entries(l)) {
      if (k === 'tags' || k === 'subthemas') continue;
      nieuw[k] = k === 'themas' ? themas : v;
      if (k === 'themas') Object.assign(nieuw, { subthemas, tags: r.tags });
    }
    return nieuw;
  });
  const zonder = bestand.lessen.filter((l) => !geldigInLessen(l)).map((l) => l.id);
  if (fouten.length) {
    console.error(`${fouten.length} antwoord(en) ongeldig, niets geschreven:\n- ${fouten.join('\n- ')}`);
    process.exit(1);
  }
  schrijfJson(LESSEN, bestand);
  console.log(`${gezet} lessen bijgewerkt in ${rel(LESSEN)}.`);
  if (open.size) console.log(`Nog open (met de hand invullen in ${rel(HAND)}): ${[...open.keys()].join(', ')}`);
  if (zonder.length) console.log(`${zonder.length} les(sen) zonder geldige index: ${zonder.slice(0, 20).join(', ')}${zonder.length > 20 ? ', ...' : ''}`);
  console.log('Draai daarna npm run tactics:build.');
  process.exit(0);
}

// ── Te doen ────────────────────────────────────────────────────────────────
const { uit: bekend, open: alOpen } = antwoorden();
let teDoen;
if (opties.ids) {
  const onbekend = opties.ids.filter((id) => !lesIndex.has(id));
  if (onbekend.length) { console.error(`Onbekende les(sen): ${onbekend.join(', ')}`); process.exit(1); }
  teDoen = opties.ids.map((id) => lesIndex.get(id));
} else {
  teDoen = lessen.filter((l) => !bekend.has(l.id)
    && (opties.opnieuwOpen || !alOpen.has(l.id))
    && (opties.alles || !geldigInLessen(l)));
}
const porties = [];
for (let i = 0; i < teDoen.length; i += opties.batch) porties.push(teDoen.slice(i, i + opties.batch));
const uitvoeren = porties.slice(0, opties.max);
console.log(`${teDoen.length} les(sen) te indexeren in ${porties.length} portie(s)${uitvoeren.length < porties.length ? `, nu ${uitvoeren.length}` : ''}; model ${opties.model}, effort ${opties.effort}.`);
if (alOpen.size && !opties.opnieuwOpen) console.log(`${alOpen.size} les(sen) staan open (overgeslagen; zie hand.json of --opnieuw-open).`);
if (!uitvoeren.length) process.exit(0);

// ── Prompt en schema ───────────────────────────────────────────────────────
function lesRegel(l) {
  const kort = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n - 3) + '...' : s ?? null);
  // Oude thema's (de grove lijst van voor de subthema's) gaan mee als hint, alleen bij een les die nog
  // geen subthema's heeft.
  const oud = Array.isArray(l.subthemas) && l.subthemas.length ? [] : (Array.isArray(l.themas) ? l.themas : []).filter((t) => typeof t === 'string');
  return JSON.stringify({ id: l.id, titel: l.titel, tekst: l.tekst, waarom: kort(l.waarom, 450), fase: l.fase, leger: l.leger, units: l.units,
    ...(oud.length ? { oudeThemas: oud } : {}) });
}

const REGELS = `# Index tactics lessons

You are an isolated, non-interactive batch job for a Warhammer: The Old World companion app. You
classify tactics lessons so players can browse and search them. Everything you need is in this
prompt: do not run commands, do not read or write files, do not use tools. Reply with the JSON
answer only.

For every lesson below give:

1. **themas**: 1 to ${MAX_THEMAS} themes, main theme first, each with exactly ONE sub-theme of that
   theme (the one that fits best). Give a theme only when the lesson is ABOUT it, not when the topic
   is mentioned in passing. Most lessons have one or two themes.
2. **tags**: ${MIN_TAGS} to ${MAX_TAGS} tag ids, most important first: the mechanics, rules and
   concepts a player would search for to find this lesson, and the unit type it is about. Do not tag
   what is only mentioned in passing. Unit names and armies are not tags (they have their own
   fields). Only ids from the tag list.

How to choose themes:

- game-plan: army-wide strategy (who is the aggressor, how the enemy wins, board thirds and flanks,
  concentrating force, tempo, what to sacrifice, threat ranges, aggression versus control) and
  general list-building principles. Not for a single unit's movement trick.
- deployment: advice acted on before or during deployment (pre-game checks, drops and the first
  turn, where units start, deploying out of enemy fire) and using or countering Ambush, Scouts and
  Vanguard.
- movement: in-game manoeuvre technique: charge setup, charge order and redirects, wheels,
  overruns and pursuit, reforms and formations, fleeing as a tool, supporting charges.
- chaff: cheap units that redirect, delay, screen, bait or distract, and clearing enemy chaff.
- infantry: infantry blocks (anchors, death stars, unit size and equipment, holding in combat,
  infantry on the move).
- hammers: damage dealers that break the enemy: heavy cavalry, chariots, monsters and dragons,
  random movers, and how to use them.
- characters: lords and heroes (combat roles such as tank, blender, assassin; battle standard
  bearer; mounts and items; leadership and break tests; challenges and champions; protecting
  characters). A wizard's lore, spells and arcane items are magic, not characters.
- magic: wizards, lores, spells, dispelling, magic missiles, buffs and hexes, control spells and
  casting aids.
- shooting-terrain: war machines, missile units, target priority, avoiding enemy fire, Evasive and
  skirmishing shooters, terrain and line of sight, hunting enemy shooters.
- matchups: advice about facing ONE specific enemy army or enemy unit (use the matching vs-
  sub-theme; Sky Lanterns go to vs-sky-lanterns, other Grand Cathay advice to vs-grand-cathay; an
  army without its own sub-theme goes to vs-other; dragons, giants and other big monsters to
  vs-monsters), or general advice about putting units opposite what they beat (picking-fights).
  The \`leger\` field is the player's OWN army, not the opponent: read the text for the opponent
  ("against", "facing", "in this matchup").
- scenarios: scoring units, objectives, baggage trains, King of the Hill, other named scenarios,
  the last turns of a game.
- Terror, fear, frenzy and leadership have no theme of their own: tag them, and put the lesson in
  the theme where the player acts (frenzy bait: chaff/decoys-bait; a BSB: characters/bsb;
  leadership debuff spells: magic/buffs-hexes; terror-causing monsters: hammers/monsters-dragons).
- \`oudeThemas\`, when present, are the lesson's themes from an older, coarser list (flanks, chaff,
  hammers, game-plan, matchups, infantry, shooting-terrain, psychology). Use them as a hint only:
  "game-plan" there was a catch-all, "flanks" now lives in game-plan/flanks-centre, "psychology" is
  gone. When an old theme is still clearly right (for example chaff), keep it.

Answer: a JSON object \`{ "lessen": [ { "id": "...", "themas": [ { "thema": "...", "subthema": "..." } ], "tags": ["..."] } ] }\`
with one entry for every lesson below, in the same order, nothing else.`;

function bouwPrompt(portie, herkansing) {
  const delen = [REGELS, '## Vocabulary', vocabTekst(ctx)];
  if (herkansing) {
    delen.push('## Second attempt',
      'These lessons came back invalid the first time. The reason is given per lesson; use only ids from the vocabulary, with each sub-theme under its own theme, and ' + `${MIN_TAGS} to ${MAX_TAGS} tags.`,
      portie.map((l) => `- ${l.id}: ${herkansing.get(l.id)}`).join('\n'));
  }
  delen.push(`## Lessons (${portie.length}, one JSON object per line)`, portie.map(lesRegel).join('\n'));
  return delen.join('\n\n') + '\n';
}

function bouwSchema(portie) {
  const themaKeuzes = ctx.vocab.themas.map((t) => ({
    type: 'object', additionalProperties: false, required: ['thema', 'subthema'],
    properties: { thema: { type: 'string', enum: [t.id] }, subthema: { type: 'string', enum: (t.subthemas ?? []).map((s) => s.id) } },
  }));
  return {
    type: 'object', additionalProperties: false, required: ['lessen'],
    properties: {
      lessen: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['id', 'themas', 'tags'],
          properties: {
            id: { type: 'string', enum: portie.map((l) => l.id) },
            themas: { type: 'array', minItems: 1, maxItems: MAX_THEMAS, items: { anyOf: themaKeuzes } },
            tags: { type: 'array', minItems: MIN_TAGS, maxItems: MAX_TAGS, items: { type: 'string', enum: [...ctx.tags.keys()] } },
          },
        },
      },
    },
  };
}

// ── Een Codex-run ──────────────────────────────────────────────────────────
// Bewaakt: tactics/ en public/ (de gegevens) behalve de eigen uitvoermap. Codex draait in een lege
// tijdelijke map en zou de repo niet moeten zien; raakt hij toch iets aan, dan gaat het terug.
const bewaakt = (p) => (p.startsWith('tactics/') || p.startsWith('public/'))
  && !p.startsWith('tactics/codex/index/') && !p.startsWith('tactics/codex/teruggedraaid/')
  && !p.startsWith('tactics/ruw/') && !p.startsWith('tactics/cache/')
  && p !== 'tactics/ophalen-log.json' && p !== 'tactics/garbled.json';

function vraag(portie, herkansing) {
  const werkmap = fs.mkdtempSync(path.join(os.tmpdir(), 'tactics-index-'));
  const laatste = path.join(os.tmpdir(), `tactics-index-${process.pid}-${Date.now()}.txt`);
  let schemaPad = null;
  if (opties.schema) {
    schemaPad = path.join(os.tmpdir(), `tactics-index-schema-${process.pid}.json`);
    fs.writeFileSync(schemaPad, JSON.stringify(bouwSchema(portie)), 'utf8');
  }
  const prompt = bouwPrompt(portie, herkansing);
  const voor = momentopname((p) => !bewaakt(p));
  const run = draaiCodex(prompt, laatste, { model: opties.model, effort: opties.effort, sandbox: 'read-only', werkmap, schema: schemaPad, timeoutMs: TIMEOUT_MS });
  const na = momentopname((p) => !bewaakt(p));
  fs.rmSync(laatste, { force: true });
  if (schemaPad) fs.rmSync(schemaPad, { force: true });
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
  const tekst = run.bericht.replace(/^\uFEFF/, '').replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  let ruw;
  try { ruw = JSON.parse(tekst); } catch (e) { return { ...basis, status: 'mislukt', reden: `antwoord is geen JSON: ${e.message}` }; }
  if (!ruw || !Array.isArray(ruw.lessen)) return { ...basis, status: 'mislukt', reden: 'antwoord heeft geen lessen-lijst' };
  return { ...basis, status: 'ok', lessen: ruw.lessen };
}

/** Antwoorden nakijken: { goed: Map(id -> {themas,tags}), fout: Map(id -> reden), correcties: [] } */
function beoordeel(portie, antwoord) {
  const ids = new Set(portie.map((l) => l.id));
  const goed = new Map();
  const fout = new Map();
  const correcties = [];
  for (const a of antwoord) {
    if (!a || !ids.has(a.id)) { correcties.push(`antwoord voor onbekende les ${a?.id} genegeerd`); continue; }
    if (goed.has(a.id)) { correcties.push(`${a.id}: tweede antwoord genegeerd`); continue; }
    const r = normaliseerIndex(ctx, a.themas, a.tags);
    for (const c of r.correcties) correcties.push(`${a.id}: ${c}`);
    if (r.fouten.length) fout.set(a.id, r.fouten.join('; '));
    else { goed.set(a.id, { themas: r.themas, tags: r.tags }); fout.delete(a.id); }
  }
  for (const id of ids) if (!goed.has(id) && !fout.has(id)) fout.set(id, 'geen antwoord voor deze les');
  return { goed, fout, correcties };
}

// ── Hoofdlus ───────────────────────────────────────────────────────────────
fs.mkdirSync(INDEX, { recursive: true });
let volgnummer = portieBestanden().reduce((m, x) => Math.max(m, Number(path.basename(x.pad).match(/\d+/)[0])), 0);

if (opties.droog) {
  const p = bouwPrompt(uitvoeren[0], null);
  const pad = path.join(os.tmpdir(), 'tactics-index-prompt.md');
  fs.writeFileSync(pad, p, 'utf8');
  fs.writeFileSync(pad.replace(/\.md$/, '-schema.json'), JSON.stringify(bouwSchema(uitvoeren[0]), null, 2), 'utf8');
  console.log(`Prompt ${Math.round(Buffer.byteLength(p) / 1024)} kB -> ${pad} (schema ernaast)`);
  process.exit(0);
}

let opRij = 0;
let gestopt = null;
for (let i = 0; i < uitvoeren.length && !gestopt; i++) {
  const portie = uitvoeren[i];
  volgnummer++;
  const pad = path.join(INDEX, `batch-${String(volgnummer).padStart(3, '0')}.json`);
  const doc = { batch: volgnummer, gemaaktOp: new Date().toISOString(), model: opties.model, effort: opties.effort,
    ids: portie.map((l) => l.id), resultaten: {}, open: {}, correcties: [], runs: [] };
  console.log(`\n[${i + 1}/${uitvoeren.length}] portie ${volgnummer}: ${portie.length} lessen (${portie[0].id} ... ${portie[portie.length - 1].id})`);

  // Eerste poging (bij een runnerfout een herkansing van dezelfde portie).
  let res = vraag(portie, null);
  if (res.status === 'mislukt') {
    console.log(`  mislukt (${res.reden}); een herkansing...`);
    doc.runs.push({ poging: 1, ...res, lessen: undefined });
    await slaap(PAUZE_MS);
    res = vraag(portie, null);
  }
  doc.runs.push({ poging: doc.runs.length + 1, ...res, lessen: undefined });
  if (res.status === 'gestopt') { gestopt = `Codex meldt een gebruikslimiet, loginfout of onbekend model: ${res.reden}`; break; }
  if (res.status !== 'ok') {
    console.log(`  MISLUKT: ${res.reden}`);
    for (const t of res.teruggedraaid ?? []) console.log(`    teruggedraaid: ${t.pad} (${t.actie})`);
    opRij++;
    volgnummer--; // geen portiebestand: deze lessen komen de volgende keer weer mee
    if (opRij >= 3) gestopt = `3 porties op rij mislukt; laatste reden: ${res.reden}`;
    continue;
  }
  opRij = 0;
  let b = beoordeel(portie, res.lessen);
  for (const [id, r] of b.goed) doc.resultaten[id] = r;
  doc.correcties.push(...b.correcties);
  console.log(`  ok in ${res.sec}s: ${b.goed.size} geldig, ${b.fout.size} ongeldig, ${b.correcties.length} correctie(s)`);

  // Ongeldige lessen een keer opnieuw vragen, met de reden erbij.
  if (b.fout.size) {
    const opnieuw = portie.filter((l) => b.fout.has(l.id));
    for (const [id, r] of b.fout) console.log(`    ${id}: ${r}`);
    await slaap(PAUZE_MS);
    const res2 = vraag(opnieuw, b.fout);
    doc.runs.push({ poging: 'herkansing', ...res2, lessen: undefined });
    if (res2.status === 'gestopt') gestopt = `Codex meldt een gebruikslimiet, loginfout of onbekend model: ${res2.reden}`;
    const b2 = res2.status === 'ok' ? beoordeel(opnieuw, res2.lessen) : { goed: new Map(), fout: b.fout, correcties: [] };
    for (const [id, r] of b2.goed) doc.resultaten[id] = r;
    doc.correcties.push(...b2.correcties.map((c) => `herkansing: ${c}`));
    for (const [id, r] of b2.fout) doc.open[id] = r;
    console.log(`  herkansing: ${b2.goed.size} geldig, ${b2.fout.size} blijft open${res2.status !== 'ok' ? ` (${res2.reden})` : ''}`);
  }
  schrijfJson(pad, doc);
  if (i < uitvoeren.length - 1 && !gestopt) await slaap(PAUZE_MS);
}

if (gestopt) {
  console.error(`\nGESTOPT: ${gestopt}`);
  process.exit(2);
}
console.log(`\nKlaar. Antwoorden in ${rel(INDEX)}/. Controleer ze, vul open lessen in ${rel(HAND)} in en draai npm run tactics:index -- --toepassen.`);
