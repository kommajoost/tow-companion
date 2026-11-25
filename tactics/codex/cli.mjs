// De Codex CLI starten en nakijken wat hij in de repo veranderde. Gedeeld door tactics/codex/run.mjs
// (lessen uit transcripten) en tactics/codex/indexeren.mjs (thema's, subthema's en tags).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib.mjs';
import { TERUGGEDRAAID } from './gedeeld.mjs';

export const STANDAARD_MODEL = 'gpt-6.1-sol';

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

export const FATAAL = /usage limit|usage_limit|quota|insufficient|not logged in|log ?in again|unauthori[sz]ed|\b401\b|model_not_found|not supported when using codex/i;

/**
 * Een `codex exec`-run. De prompt gaat via stdin, het laatste bericht naar `laatsteBericht`.
 * opties: model, effort, sandbox ('workspace-write' | 'read-only'), werkmap (standaard de repo),
 * schema (pad naar een JSON Schema voor het eindantwoord), timeoutMs.
 */
export function draaiCodex(prompt, laatsteBericht, opties) {
  const { model, effort, sandbox = 'workspace-write', werkmap = ROOT, schema = null, timeoutMs = 45 * 60 * 1000 } = opties;
  const { cmd, pre, shell } = codexOpdracht();
  const args = [...pre, 'exec',
    '--ignore-user-config', // geen MCP-servers, plugins of meldingen van de gewone Codex-config
    '--ephemeral', // geen sessie in de Codex-geschiedenis per run
    '-m', model,
    '-c', `model_reasoning_effort="${effort}"`,
    '-c', 'approval_policy="never"',
    // Zonder deze instelling (staat in Joosts gewone config) weigert Codex op Windows elk commando.
    ...(process.platform === 'win32' ? ['-c', 'windows.sandbox="elevated"'] : []),
    '-s', sandbox,
    '-C', werkmap,
    ...(werkmap !== ROOT ? ['--skip-git-repo-check'] : []),
    ...(schema ? ['--output-schema', schema] : []),
    '--color', 'never',
    '--json',
    '-o', laatsteBericht,
    '-'];
  const t0 = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: werkmap, input: prompt, encoding: 'utf8', shell, timeout: timeoutMs,
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
  const bericht = fs.existsSync(laatsteBericht) ? fs.readFileSync(laatsteBericht, 'utf8').trim() : null;
  return {
    exit: r.status, signaal: r.signal, timeout: r.error?.code === 'ETIMEDOUT', startFout: r.error?.message,
    sec: Math.round((Date.now() - t0) / 1000), perSoort, usage, fouten,
    stderrStaart: stderr.split(/\r?\n/).filter((l) => !/failed to load skill|rmcp::transport/.test(l)).slice(-5).join('\n'),
    bericht, // volledig; run.mjs kort het zelf in voor het logboek
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

/** Inhoud en hash van alle gewijzigde of nieuwe bestanden in de repo, behalve wat `uitgesloten` is. */
export function momentopname(uitgesloten) {
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

export function verschillen(voor, na) {
  const uit = new Set();
  for (const [p, n] of na) if (!voor.has(p) || voor.get(p).hash !== n.hash || voor.get(p).xy !== n.xy) uit.add(p);
  for (const p of voor.keys()) if (!na.has(p)) uit.add(p);
  return [...uit].sort();
}

/** Zet een door Codex aangeraakt bestand terug; de aangetroffen versie gaat eerst naar teruggedraaid/. */
export function draaiTerug(p, voor, stempel) {
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
