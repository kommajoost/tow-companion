// Gedeelde hulpjes voor de tactiekroutine (docs/tactics/ontwerp.md).
// yt-dlp draait als Python-module: `python -m yt_dlp`.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TDIR = path.join(ROOT, 'tactics');
export const CACHE = path.join(TDIR, 'cache');
export const RUW = path.join(TDIR, 'ruw');
export const PUB = path.join(ROOT, 'public', 'tactics');

export function leesJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

export function schrijfJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** Als schrijfJson, maar de arrays op het hoogste niveau krijgen één item per regel: compact en
 *  goed te diffen (zo stond public/tactics/bronnen.json er al). */
export function schrijfJsonRegels(p, data) {
  const delen = Object.entries(data).map(([k, v]) => {
    if (Array.isArray(v)) {
      // Rauwe regeleinden komen in JSON-strings niet voor (die worden \n), dus dit raakt geen inhoud.
      const items = v.map((x) => '    ' + JSON.stringify(x, null, 1).replace(/\n\s*/g, ' '));
      return `  ${JSON.stringify(k)}: [\n${items.join(',\n')}\n  ]`;
    }
    return `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
  });
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `{\n${delen.join(',\n')}\n}\n`, 'utf8');
}

/** Roept yt-dlp aan en geeft stdout terug. Gooit bij een fout, met de stderr erbij. Rustig aan:
 *  altijd --sleep-requests, nooit parallel. */
export function ytdlp(args, { allowFail = false } = {}) {
  const r = spawnSync('python', ['-m', 'yt_dlp', '--sleep-requests', '1', '--no-warnings', ...args], {
    encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, cwd: ROOT,
  });
  const err = r.stderr || '';
  if (/Sign in to confirm|confirm you.re not a bot|HTTP Error 429|Too Many Requests/i.test(err)) {
    throw new Error('YouTube blokkeert (bot-check of 429). Stoppen en later opnieuw proberen.\n' + err.slice(0, 500));
  }
  if (r.status !== 0 && !allowFail) throw new Error(`yt-dlp ${args.join(' ')} faalde:\n${err.slice(0, 1000)}`);
  return r.stdout;
}

export const slaap = (ms) => new Promise((res) => setTimeout(res, ms));

/** Kanalen uit de eerste ronde met een YouTube-adres. */
export function rondeEenKanalen() {
  const b = leesJson(path.join(PUB, 'bronnen.json'));
  return b.kanalen.filter((k) => k.ronde === 1 && k.type === 'youtube' && k.url);
}

/** Op de pagina: deze soorten. Battle reports en meta blijven alleen in selectie.json. */
export const PAGINA_SOORTEN = ['tactics', 'list-building', 'army-review', 'rules-explained'];
export const ALLE_SOORTEN = ['tactics', 'list-building', 'army-review', 'rules-explained', 'battle-report', 'meta', 'other'];
