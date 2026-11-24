// Codex-route: lessen uit transcripten laten halen door de Codex CLI (ChatGPT-abonnement van Joost).
//   npm run tactics:codex                       alle video's uit tactics/ronde2-tactics.json met een
//                                               transcript en nog zonder tactics/codex/uit/<id>.json
//   npm run tactics:codex -- <videoId> ...      alleen deze video's
//   npm run tactics:codex -- --max 3            hooguit 3 video's
//   npm run tactics:codex -- --kalibratie <id>  proefrun op een al verwerkte video: uitvoer naar
//                                               tactics/codex/kalibratie/<id>.json; de lessen die
//                                               alleen uit die video komen staan dan niet in de index
//   --model <naam> (standaard gpt-6.1-sol of $TACTICS_CODEX_MODEL), --effort <low|medium|high|xhigh>
//   --droog                                     alleen de prompt bouwen en tonen hoe groot die is
//
// Per video, serieel: prompt = INSTRUCTIES.md + videogegevens + woordenlijst + lessenindex, dan
// `codex exec` (sandbox workspace-write, werkmap = repo). Daarna controleert dit script:
//   1. het uitvoerbestand bestaat en is geldige JSON;
//   2. `git status` laat buiten dat bestand geen nieuwe wijzigingen zien (anders: terugdraaien, met
//      een kopie in tactics/codex/teruggedraaid/, en de video telt als mislukt);
//   3. elk citaat staat letterlijk in tactics/ruw/<id>.fixed.txt (zoals tactics/bouw.mjs), hooguit
//      15 woorden; een les met een fout hoofdcitaat valt af, een fout extra citaat wordt weggelaten.
// Het gecontroleerde resultaat komt in tactics/codex/uit/<id>.json (in de vorm van lessen.json);
// npm run tactics:merge zet het in public/tactics/lessen.json. Logboek: tactics/codex/log.json.
// Zuinig met het abonnement: een video tegelijk, hooguit 1 herkansing per video, stoppen na 3
// mislukte runs op rij en meteen bij een gebruikslimiet of loginfout.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, RUW, TDIR, leesJson, schrijfJson, slaap } from '../lib.mjs';
import {
  CDIR, KALIBRATIE, LOG, MAX_CITATEN, MISLUKT, RONDE, SAMENGEVOEGD, TERUGGEDRAAID, UIT, VELDEN_TEKST,
  bronUrl, controleerCitaat, duurVan, laadContext, leesUitBestanden, rel, transcriptRegels, zinnen,
} from './gedeeld.mjs';

// ── Argumenten ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opties = { ids: [], kalibratie: false, max: Infinity, droog: false,
  model: process.env.TACTICS_CODEX_MODEL || 'gpt-6.1-sol', effort: process.env.TACTICS_CODEX_EFFORT || 'high' };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--kalibratie') opties.kalibratie = true;
  else if (a === '--droog') opties.droog = true;
  else if (a === '--max') opties.max = Number(argv[++i]);
  else if (a === '--model') opties.model = argv[++i];
  else if (a === '--effort') opties.effort = argv[++i];
  else if (a.startsWith('--')) { console.error(`Onbekende optie ${a}`); process.exit(1); }
  else opties.ids.push(a);
}
if (opties.kalibratie && opties.ids.length !== 1) {
  console.error('Gebruik: npm run tactics:codex -- --kalibratie <videoId>');
  process.exit(1);
}

const INSTRUCTIES = path.join(CDIR, 'INSTRUCTIES.md');
const TIMEOUT_MS = 45 * 60 * 1000;
const PAUZE_MS = 5000;
// Paden die tijdens een run door iets anders dan Codex mogen veranderen (de transcriptophaler,
// dit script zelf). Die tellen niet mee in de git-controle en worden nooit teruggedraaid.
const ANDEREN = ['tactics/ophalen-log.json', 'tactics/garbled.json', 'tactics/ruw/', 'tactics/cache/',
  'tactics/codex/log.json', 'tactics/codex/teruggedraaid/'];

// ── Codex starten ──────────────────────────────────────────────────────────
function codexOpdracht() {
  if (process.env.CODEX_JS) return { cmd: process.execPath, pre: [process.env.CODEX_JS], shell: false };
  if (process.platform === 'win32') {
    // codex.cmd is een npm-shim; node rechtstreeks op codex.js voorkomt quoting-gedoe met de spatie
    // in "D:\CLAUDE CODE".
    const r = spawnSync('where', ['codex.cmd'], { encoding: 'utf8' });
    const shim = (r.stdout ?? '').split(/\r?\n/).find(Boolean);
    if (shim) {
      const js = path.join(path.dirname(shim), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
      if (fs.existsSync(js)) return { cmd: process.execPath, pre: [js], shell: false };
    }
  }
  return { cmd: 'codex', pre: [], shell: process.platform === 'win32' };
}

const FATAAL = /usage limit|usage_limit|quota|insufficient|not logged in|log ?in again|unauthori[sz]ed|\b401\b|model_not_found|not supported when using codex/i;

function draaiCodex(prompt, laatsteBericht) {
  const { cmd, pre, shell } = codexOpdracht();
  const args = [...pre, 'exec',
    '--ignore-user-config', // geen MCP-servers, plugins of meldingen van de gewone Codex-config
    '--ephemeral', // geen sessie in de Codex-geschiedenis per video
    '-m', opties.model,
    '-c', `model_reasoning_effort="${opties.effort}"`,
    '-c', 'approval_policy="never"',
    // Zonder deze instelling (staat in Joosts gewone config) weigert Codex op Windows elk commando.
    ...(process.platform === 'win32' ? ['-c', 'windows.sandbox="elevated"'] : []),
    '-s', 'workspace-write',
    '-C', ROOT,
    '--color', 'never',
    '--json',
    '-o', laatsteBericht,
    '-'];
  const t0 = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: ROOT, input: prompt, encoding: 'utf8', shell, timeout: TIMEOUT_MS,
    maxBuffer: 512 * 1024 * 1024, windowsHide: true,
  });
  const events = [];
  for (const regel of (r.stdout ?? '').split(/\r?\n/)) {
    if (!regel.trim().startsWith('{')) continue;
    try { events.push(JSON.parse(regel)); } catch { /* geen JSON */ }
  }
  const items = events.filter((e) => e.type === 'item.completed').map((e) => e.item ?? {});
  const perSoort = {};
  for (const it of items) perSoort[it.type] = (perSoort[it.type] ?? 0) + 1;
  const usage = events.filter((e) => e.type === 'turn.completed' && e.usage).map((e) => e.usage).pop() ?? null;
  const fouten = [
    ...events.filter((e) => e.type === 'error').map((e) => e.message),
    ...events.filter((e) => e.type === 'turn.failed').map((e) => e.error?.message),
    ...items.filter((it) => it.type === 'error').map((it) => it.message),
  ].filter(Boolean).map(String);
  const stderr = (r.stderr ?? '').trim();
  return {
    exit: r.status, signaal: r.signal, timeout: r.error?.code === 'ETIMEDOUT', startFout: r.error?.message,
    sec: Math.round((Date.now() - t0) / 1000), perSoort, usage, fouten,
    stderrStaart: stderr.split(/\r?\n/).filter((l) => !/failed to load skill|rmcp::transport/.test(l)).slice(-5).join('\n'),
    bericht: fs.existsSync(laatsteBericht) ? fs.readFileSync(laatsteBericht, 'utf8').trim().slice(0, 500) : null,
    commandos: items.filter((it) => it.type === 'command_execution').map((it) => String(it.command ?? '').slice(0, 200)),
    fataal: FATAAL.test([...fouten, stderr].join('\n')),
  };
}

// ── Git-controle ───────────────────────────────────────────────────────────
function gitStatus() {
  const r = spawnSync('git', ['status', '--porcelain=v1', '-z', '-uall'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git status faalde: ${r.stderr}`);
  const delen = r.stdout.split('\0');
  const m = new Map();
  for (let i = 0; i < delen.length; i++) {
    const s = delen[i];
    if (!s) continue;
    const xy = s.slice(0, 2);
    m.set(s.slice(3), xy);
    if (xy[0] === 'R' || xy[0] === 'C') i++; // het oude pad van een rename overslaan
  }
  return m;
}

function momentopname(uitgesloten) {
  const m = new Map();
  for (const [p, xy] of gitStatus()) {
    if (uitgesloten(p)) continue;
    let inhoud = null;
    try {
      const st = fs.statSync(path.join(ROOT, p));
      if (st.isFile() && st.size < 20 * 1024 * 1024) inhoud = fs.readFileSync(path.join(ROOT, p));
    } catch { /* verwijderd */ }
    m.set(p, { xy, inhoud, hash: inhoud ? crypto.createHash('sha1').update(inhoud).digest('hex') : 'weg' });
  }
  return m;
}

function verschillen(voor, na) {
  const uit = new Set();
  for (const [p, n] of na) if (!voor.has(p) || voor.get(p).hash !== n.hash || voor.get(p).xy !== n.xy) uit.add(p);
  for (const p of voor.keys()) if (!na.has(p)) uit.add(p);
  return [...uit].sort();
}

/** Zet een door Codex aangeraakt bestand terug; de aangetroffen versie gaat eerst naar teruggedraaid/. */
function draaiTerug(p, voor, stempel) {
  const abs = path.join(ROOT, p);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
    const kopie = path.join(TERUGGEDRAAID, stempel, p);
    fs.mkdirSync(path.dirname(kopie), { recursive: true });
    fs.copyFileSync(abs, kopie);
  }
  const was = voor.get(p);
  if (was) {
    // Stond al gewijzigd of nieuw in de werkmap: die versie terugzetten.
    if (was.inhoud) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, was.inhoud); return 'oude inhoud teruggezet'; }
    if (fs.existsSync(abs)) fs.rmSync(abs, { force: true });
    return 'weer verwijderd';
  }
  const gevolgd = spawnSync('git', ['ls-files', '--error-unmatch', '--', p], { cwd: ROOT, encoding: 'utf8' }).status === 0;
  if (gevolgd) {
    const r = spawnSync('git', ['checkout', '--', p], { cwd: ROOT, encoding: 'utf8' });
    return r.status === 0 ? 'git checkout' : `git checkout faalde: ${r.stderr.trim()}`;
  }
  fs.rmSync(abs, { force: true });
  // Lege mappen die Codex aanmaakte opruimen.
  let dir = path.dirname(abs);
  while (dir.startsWith(ROOT) && dir !== ROOT && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
    dir = path.dirname(dir);
  }
  return 'nieuw bestand verwijderd';
}

// ── Prompt ─────────────────────────────────────────────────────────────────
function indexRegel(l) {
  const eerste = String(l.tekst ?? '').split(/(?<=[.!?])\s+/)[0] ?? '';
  const kort = eerste.length > 110 ? eerste.slice(0, 107) + '...' : eerste;
  const leeg = VELDEN_TEKST.filter((v) => l[v] == null).join(',') || '-';
  return `${l.id} | ${l.fase} | ${(l.themas ?? []).join(',')} | ${l.leger ?? '-'} | ${l.titel} | ${kort} | ${leeg}`;
}

function bouwPrompt(ctx, video, doelRel, pool) {
  const b = ctx.bronIndex.get(`yt-${video.videoId}`);
  const kanaal = ctx.kanaalIndex.get(b.kanaalId);
  const duur = duurVan(ctx, video.videoId);
  const delen = [
    fs.readFileSync(INSTRUCTIES, 'utf8').trim(),
    '## This run',
    [
      `- videoId: ${video.videoId}`,
      `- bronId: yt-${video.videoId}`,
      `- title: ${b.titel}`,
      `- channel: ${kanaal?.naam ?? b.kanaalId}`,
      `- upload date: ${b.datum ?? 'unknown'}`,
      `- length: ${duur ? `${Math.round(duur / 60)} min` : 'unknown'}`,
      `- transcript (read this): tactics/ruw/${video.videoId}.fixed.txt`,
      `- output file (write only this): ${doelRel}`,
    ].join('\n'),
    '## Vocabulary',
    'Phases:\n' + ctx.vocab.fases.map((f) => `- ${f.id} (${f.naam})`).join('\n'),
    'Themes:\n' + ctx.vocab.themas.map((t) => `- ${t.id} (${t.naam}): ${t.omschrijving}`).join('\n'),
    '## Army slugs',
    [...ctx.legers].sort().join(', '),
    '## Unit names',
    'Use these exact names in `units` (separated by semicolons):',
    [...new Set(ctx.units.values())].sort((a, c) => a.localeCompare(c)).join('; '),
    `## Existing lessons (${pool.length})`,
    'id | phase | themes | army | title | start of the text | empty fields',
    pool.map(indexRegel).join('\n'),
  ];
  return delen.join('\n\n') + '\n';
}

// ── Normaliseren en controleren ────────────────────────────────────────────
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugify = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 6).join('-');
const tekstOfNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function normaliseer(ruw, ctx, video, poolMap, bekendeIds) {
  const bronId = `yt-${video.videoId}`;
  const bron = ctx.bronIndex.get(bronId);
  const regels = transcriptRegels(video.videoId);
  const duur = duurVan(ctx, video.videoId);
  const afgekeurd = [];
  const gecorrigeerd = [];

  function maakBron(rb, maxCitaten, wie) {
    if (!rb || typeof rb !== 'object') return { ok: false, reden: 'bron ontbreekt' };
    const hoofd = controleerCitaat(regels, duur, rb);
    if (!hoofd.ok) return { ok: false, reden: `hoofdcitaat: ${hoofd.reden} ("${rb.citaat}" @${rb.tijd})` };
    if (hoofd.verschoven) gecorrigeerd.push({ wie, wat: `tijd ${rb.tijd} -> ${hoofd.tijd}` });
    const extra = [];
    for (const ec of Array.isArray(rb.extraCitaten) ? rb.extraCitaten : []) {
      if (1 + extra.length >= maxCitaten) { gecorrigeerd.push({ wie, wat: `extra citaat weggelaten (max ${maxCitaten}): "${ec?.citaat}"` }); continue; }
      const r = controleerCitaat(regels, duur, ec);
      if (!r.ok) { gecorrigeerd.push({ wie, wat: `extra citaat weggelaten: ${r.reden} ("${ec?.citaat}" @${ec?.tijd})` }); continue; }
      if (r.verschoven) gecorrigeerd.push({ wie, wat: `extra tijd ${ec.tijd} -> ${r.tijd}` });
      extra.push({ tijd: r.tijd, citaat: ec.citaat.trim() });
    }
    return { ok: true, bron: { bronId, url: bronUrl(bron, hoofd.tijd), tijd: hoofd.tijd, citaat: rb.citaat.trim(), ...(extra.length ? { extraCitaten: extra } : {}) } };
  }

  const nieuw = [];
  for (const l of Array.isArray(ruw.nieuw) ? ruw.nieuw : []) {
    const wie = l?.id ?? l?.titel ?? '?';
    const keur = (reden) => afgekeurd.push({ soort: 'nieuw', id: wie, reden, les: l });
    if (!l || typeof l !== 'object') { keur('geen object'); continue; }
    const titel = tekstOfNull(l.titel);
    const tekst = tekstOfNull(l.tekst);
    if (!titel || !tekst) { keur('titel of tekst ontbreekt'); continue; }
    if (zinnen(tekst) > 3) { keur(`tekst heeft ${zinnen(tekst)} zinnen (max 3)`); continue; }
    if (!ctx.fases.has(l.fase)) { keur(`onbekende fase ${l.fase}`); continue; }
    const themasIn = Array.isArray(l.themas) ? l.themas : [];
    let themas = [...new Set(themasIn.filter((t) => ctx.themas.has(t)))];
    if (themas.length !== themasIn.length) gecorrigeerd.push({ wie, wat: `thema's ${JSON.stringify(themasIn)} -> ${JSON.stringify(themas)}` });
    if (themas.length > 3) { themas = themas.slice(0, 3); gecorrigeerd.push({ wie, wat: 'meer dan 3 thema\'s, eerste 3 gehouden' }); }
    if (themas.length === 0) { keur('geen geldig thema'); continue; }
    const leger = l.leger == null || l.leger === '' ? null : l.leger;
    if (leger !== null && !ctx.legers.has(leger)) { keur(`onbekend leger ${leger}`); continue; }
    const units = [];
    for (const u of Array.isArray(l.units) ? l.units : []) {
      const naam = ctx.units.get(String(u).toLowerCase().trim());
      if (naam) { if (!units.includes(naam)) units.push(naam); } else gecorrigeerd.push({ wie, wat: `onbekende unit "${u}" weggelaten` });
    }
    const b = maakBron(l.bron, MAX_CITATEN, wie);
    if (!b.ok) { keur(b.reden); continue; }
    let id = SLUG.test(String(l.id ?? '')) ? l.id : slugify(l.id || titel);
    if (!id) id = 'les';
    if (bekendeIds.has(id)) {
      let n = 2;
      while (bekendeIds.has(`${id}-${n}`)) n++;
      gecorrigeerd.push({ wie, wat: `id ${id} bestond al -> ${id}-${n}` });
      id = `${id}-${n}`;
    }
    bekendeIds.add(id);
    const les = { id, titel, tekst };
    for (const v of VELDEN_TEKST) les[v] = tekstOfNull(l[v]);
    Object.assign(les, { fase: l.fase, themas, leger, units, bronnen: [b.bron], datum: bron.datum ?? null, markeringen: [] });
    nieuw.push(les);
  }

  const aanvullingen = [];
  const alAangevuld = new Set();
  for (const a of Array.isArray(ruw.aanvullingen) ? ruw.aanvullingen : []) {
    const wie = `aanvulling ${a?.lesId}`;
    const keur = (reden) => afgekeurd.push({ soort: 'aanvulling', id: a?.lesId, reden, aanvulling: a });
    const doel = poolMap.get(a?.lesId);
    if (!doel) { keur('les bestaat niet'); continue; }
    if (doel.bronnen.some((x) => x.bronId === bronId) || alAangevuld.has(a.lesId)) { keur('deze video is al een bron van de les'); continue; }
    const b = maakBron(a.bron, 2, wie);
    if (!b.ok) { keur(b.reden); continue; }
    alAangevuld.add(a.lesId);
    const uit = { lesId: a.lesId, bron: b.bron };
    for (const v of VELDEN_TEKST) {
      const t = tekstOfNull(a[v]);
      if (!t) continue;
      if (doel[v] == null) uit[v] = t;
      else gecorrigeerd.push({ wie, wat: `${v} weggelaten: de les heeft dat veld al` });
    }
    if (tekstOfNull(a.toelichting)) uit.toelichting = a.toelichting.trim();
    aanvullingen.push(uit);
  }
  return { nieuw, aanvullingen, afgekeurd, gecorrigeerd };
}

// ── Een video ──────────────────────────────────────────────────────────────
async function verwerkVideo(ctx, video, doel, pool) {
  const doelRel = rel(doel);
  const uitgesloten = (p) => p === doelRel || ANDEREN.some((a) => (a.endsWith('/') ? p.startsWith(a) : p === a));
  const poolMap = new Map(pool.map((l) => [l.id, l]));
  const bekendeIds = new Set([...ctx.lessen.lessen.map((l) => l.id), ...pool.map((l) => l.id)]);
  const prompt = bouwPrompt(ctx, video, doelRel, pool);
  const laatste = path.join(os.tmpdir(), `tactics-codex-${video.videoId}-${process.pid}.txt`);

  const voor = momentopname(uitgesloten);
  if (fs.existsSync(doel)) fs.rmSync(doel);
  const run = draaiCodex(prompt, laatste);
  fs.rmSync(laatste, { force: true });
  const na = momentopname(uitgesloten);

  const basis = { promptKB: Math.round(Buffer.byteLength(prompt) / 1024), sec: run.sec, exit: run.exit,
    usage: run.usage, items: run.perSoort, commandos: run.commandos, bericht: run.bericht };

  const vreemd = verschillen(voor, na);
  if (vreemd.length) {
    const stempel = new Date().toISOString().replace(/[:.]/g, '-');
    const teruggedraaid = vreemd.map((p) => ({ pad: p, actie: draaiTerug(p, voor, stempel) }));
    if (fs.existsSync(doel)) {
      fs.mkdirSync(MISLUKT, { recursive: true });
      fs.renameSync(doel, path.join(MISLUKT, `${video.videoId}.json`));
    }
    return { ...basis, status: 'mislukt', reden: 'Codex veranderde bestanden buiten het uitvoerbestand', teruggedraaid, herkansing: false };
  }

  if (run.fataal) return { ...basis, status: 'gestopt', reden: run.fouten.concat(run.stderrStaart).join(' | ').slice(0, 600), fataal: true };
  if (!fs.existsSync(doel)) {
    return { ...basis, status: 'mislukt', reden: `geen uitvoerbestand (exit ${run.exit}${run.timeout ? ', timeout' : ''}${run.startFout ? `, ${run.startFout}` : ''}) ${run.fouten.join(' | ')} ${run.stderrStaart}`.slice(0, 600), herkansing: true, runner: true };
  }
  const tekst = fs.readFileSync(doel, 'utf8').replace(/^\uFEFF/, '');
  let ruw;
  try { ruw = JSON.parse(tekst); } catch (e) {
    fs.mkdirSync(MISLUKT, { recursive: true });
    fs.renameSync(doel, path.join(MISLUKT, `${video.videoId}.json`));
    return { ...basis, status: 'mislukt', reden: `uitvoer is geen geldige JSON: ${e.message}`, herkansing: true, runner: true };
  }
  if (!ruw || typeof ruw !== 'object' || (!Array.isArray(ruw.nieuw) && !Array.isArray(ruw.aanvullingen))) {
    fs.mkdirSync(MISLUKT, { recursive: true });
    fs.renameSync(doel, path.join(MISLUKT, `${video.videoId}.json`));
    return { ...basis, status: 'mislukt', reden: 'uitvoer heeft geen nieuw/aanvullingen', herkansing: true, runner: true };
  }

  const n = normaliseer(ruw, ctx, video, poolMap, bekendeIds);
  const uit = {
    videoId: video.videoId,
    bronId: `yt-${video.videoId}`,
    model: typeof ruw.model === 'string' ? ruw.model : null,
    modelGevraagd: opties.model,
    effort: opties.effort,
    gemaaktOp: new Date().toISOString(),
    nieuw: n.nieuw,
    aanvullingen: n.aanvullingen,
    overgeslagen: typeof ruw.overgeslagen === 'string' ? ruw.overgeslagen : null,
    controle: { afgekeurd: n.afgekeurd, gecorrigeerd: n.gecorrigeerd },
  };
  schrijfJson(doel, uit);
  return { ...basis, status: 'ok', modelGemeld: uit.model, nieuw: n.nieuw.length, aanvullingen: n.aanvullingen.length,
    afgekeurd: n.afgekeurd.map((x) => `${x.soort} ${x.id}: ${x.reden}`), gecorrigeerd: n.gecorrigeerd.length };
}

// ── Hoofdlus ───────────────────────────────────────────────────────────────
const ctx = laadContext();
const ronde = leesJson(RONDE, []);
const verwerkt = leesJson(path.join(TDIR, 'verwerkt.json'), {});
const samengevoegd = leesJson(SAMENGEVOEGD, {});
const doelDir = opties.kalibratie ? KALIBRATIE : UIT;

let lijst;
if (opties.ids.length) {
  lijst = opties.ids.map((id) => ronde.find((v) => v.videoId === id) ?? (ctx.bronIndex.has(`yt-${id}`) ? { videoId: id } : null));
  const onbekend = opties.ids.filter((_, i) => !lijst[i]);
  if (onbekend.length) { console.error(`Onbekend in bronnen.json: ${onbekend.join(', ')}`); process.exit(1); }
} else lijst = ronde;

const overslaan = [];
lijst = lijst.filter((v) => {
  const reden = !fs.existsSync(path.join(RUW, `${v.videoId}.fixed.txt`)) ? 'geen transcript'
    : opties.kalibratie ? null
      : fs.existsSync(path.join(UIT, `${v.videoId}.json`)) ? 'al in uit/'
        : verwerkt[v.videoId] ? 'al verwerkt' : samengevoegd[v.videoId] ? 'al samengevoegd' : null;
  if (reden) overslaan.push(`${v.videoId} (${reden})`);
  return !reden;
}).slice(0, opties.max);

if (opties.ids.length && overslaan.length) console.log(`Overgeslagen: ${overslaan.join(', ')}`);
console.log(`${lijst.length} video('s) te doen met ${opties.model} (effort ${opties.effort})${opties.kalibratie ? ', kalibratie' : ''}.`);

/** Lessenindex: lessen.json + nieuwe lessen uit uit/*.json (nog niet samengevoegd). */
function lessenPool(videoId) {
  const pool = [...ctx.lessen.lessen];
  const ids = new Set(pool.map((l) => l.id));
  for (const { data } of leesUitBestanden(UIT)) {
    for (const l of data.nieuw) if (!ids.has(l.id)) { pool.push(l); ids.add(l.id); }
  }
  if (!opties.kalibratie) return pool;
  // Kalibratie: de lessen die alleen uit deze video komen, horen niet in de index.
  return pool.filter((l) => !l.bronnen.every((b) => b.bronId === `yt-${videoId}`));
}

const log = leesJson(LOG, []);
let opRij = 0;
let gestopt = null;
for (let i = 0; i < lijst.length && !gestopt; i++) {
  const v = lijst[i];
  const b = ctx.bronIndex.get(`yt-${v.videoId}`);
  const doel = path.join(doelDir, `${v.videoId}.json`);
  fs.mkdirSync(doelDir, { recursive: true });
  if (opties.kalibratie && fs.existsSync(doel)) fs.renameSync(doel, path.join(doelDir, `${v.videoId}.vorige.json`));
  console.log(`\n[${i + 1}/${lijst.length}] ${v.videoId}  ${b.titel}`);

  if (opties.droog) {
    const p = bouwPrompt(ctx, v, rel(doel), lessenPool(v.videoId));
    const pad = path.join(os.tmpdir(), `tactics-codex-prompt-${v.videoId}.md`);
    fs.writeFileSync(pad, p, 'utf8');
    console.log(`  prompt ${Math.round(Buffer.byteLength(p) / 1024)} kB -> ${pad}`);
    continue;
  }

  const start = new Date().toISOString();
  let res;
  let pogingen = 0;
  do {
    pogingen++;
    res = await verwerkVideo(ctx, v, doel, lessenPool(v.videoId));
    if (res.status === 'ok' || res.status === 'gestopt' || !res.herkansing || pogingen >= 2) break;
    console.log(`  mislukt (${res.reden}); een herkansing...`);
    await slaap(PAUZE_MS);
  } while (true);

  const regel = { videoId: v.videoId, titel: b.titel, start, modus: opties.kalibratie ? 'kalibratie' : 'uit',
    model: opties.model, effort: opties.effort, pogingen, ...res };
  delete regel.herkansing;
  log.push(regel);
  schrijfJson(LOG, log);

  if (res.status === 'ok') {
    opRij = 0;
    console.log(`  ok in ${res.sec}s: ${res.nieuw} nieuw, ${res.aanvullingen} aanvulling(en), ${res.afgekeurd.length} afgekeurd, ${res.gecorrigeerd} correctie(s); model volgens Codex: ${res.modelGemeld}`);
    for (const a of res.afgekeurd) console.log(`    afgekeurd: ${a}`);
  } else if (res.status === 'gestopt') {
    gestopt = `Codex meldt een gebruikslimiet, loginfout of onbekend model: ${res.reden}`;
  } else {
    console.log(`  MISLUKT: ${res.reden}`);
    for (const t of res.teruggedraaid ?? []) console.log(`    teruggedraaid: ${t.pad} (${t.actie})`);
    if (res.runner) opRij++; else opRij = 0;
    if (opRij >= 3) gestopt = `3 video's op rij mislukt; laatste reden: ${res.reden}`;
  }
  if (i < lijst.length - 1 && !gestopt) await slaap(PAUZE_MS);
}

if (gestopt) {
  console.error(`\nGESTOPT: ${gestopt}`);
  process.exit(2);
}
console.log('\nKlaar. Controleer de uitvoer in tactics/codex/' + (opties.kalibratie ? 'kalibratie/' : 'uit/') + ' en draai daarna npm run tactics:merge.');
