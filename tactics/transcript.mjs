// Stap 2 en 3b: automatische Engelse ondertitels ophalen en omzetten naar een leesbaar transcript.
//   node tactics/transcript.mjs <videoId> [<videoId> ...]   ophalen (als nog niet aanwezig) + omzetten
//   node tactics/transcript.mjs --convert-only <videoId>    alleen omzetten (na een garbled-update)
// Uitvoer in tactics/ruw/ (staat in .gitignore, wordt nooit gepubliceerd):
//   <id>.en.json3 / <id>.en.vtt   ruw, zoals YouTube het geeft (blijft onaangeroerd)
//   <id>.txt                       schoon, getimed, zonder rollende herhaling, namen NIET hersteld
//   <id>.fixed.txt                 idem, met de verbasterde vormen uit tactics/garbled.json hersteld
import fs from 'node:fs';
import path from 'node:path';
import { RUW, TDIR, leesJson, slaap, ytdlp } from './lib.mjs';

const args = process.argv.slice(2);
const alleenOmzetten = args.includes('--convert-only');
const ids = args.filter((a) => !a.startsWith('--'));
if (ids.length === 0) { console.error('Gebruik: node tactics/transcript.mjs <videoId> ...'); process.exit(1); }
fs.mkdirSync(RUW, { recursive: true });

const mmss = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
};

/** Woorden met starttijd uit json3 (heeft geen rollende herhaling). */
function woordenUitJson3(p) {
  const d = leesJson(p);
  const out = [];
  for (const ev of d?.events ?? []) {
    if (!ev.segs) continue;
    for (const s of ev.segs) {
      const t = (s.utf8 ?? '').replace(/\n/g, ' ');
      if (!t.trim()) continue;
      out.push({ ms: (ev.tStartMs ?? 0) + (s.tOffsetMs ?? 0), tekst: t.trim() });
    }
  }
  return out;
}

/** Terugval op VTT: alleen regels met woordtijden (<00:00:01.000><c>) zijn nieuw; de regel zonder
 *  woordtijden is de herhaling van de vorige cue. */
function woordenUitVtt(p) {
  const txt = fs.readFileSync(p, 'utf8');
  const out = [];
  const blokken = txt.split(/\r?\n\r?\n/);
  const tijd = (s) => { const [h, m, rest] = s.split(':'); return ((+h * 60 + +m) * 60 + parseFloat(rest)) * 1000; };
  for (const b of blokken) {
    const regels = b.split(/\r?\n/);
    const kop = regels.find((r) => r.includes('-->'));
    if (!kop) continue;
    const start = tijd(kop.split('-->')[0].trim());
    for (const r of regels) {
      if (!r.includes('<c>') && !/<\d\d:\d\d:\d\d\.\d+>/.test(r)) continue;
      // Splits op de tijdtags; het stuk voor de eerste tag hoort bij de cue-start.
      const delen = r.split(/<(\d\d:\d\d:\d\d\.\d+)>/);
      let t = start;
      for (let i = 0; i < delen.length; i++) {
        if (i % 2 === 1) { t = tijd(delen[i]); continue; }
        const w = delen[i].replace(/<\/?c[^>]*>/g, '').trim();
        if (w) out.push({ ms: t, tekst: w });
      }
    }
  }
  return out;
}

/** Woorden tot regels van ongeveer 12 seconden, met [mm:ss] vooraan. */
function regels(woorden) {
  const out = [];
  let huidig = null;
  for (const w of woorden) {
    if (!huidig || w.ms - huidig.ms > 12000) {
      if (huidig) out.push(huidig);
      huidig = { ms: w.ms, delen: [] };
    }
    huidig.delen.push(w.tekst);
  }
  if (huidig) out.push(huidig);
  return out.map((r) => `[${mmss(r.ms)}] ${r.delen.join(' ').replace(/\s+/g, ' ')}`);
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Verbasterde vormen herstellen, alleen hele woorden; langste vormen eerst. */
function herstel(tekst, vormen) {
  const sleutels = Object.keys(vormen).sort((a, b) => b.length - a.length);
  let t = tekst;
  for (const k of sleutels) {
    const re = new RegExp(`(?<![A-Za-z])${escapeRe(k)}(?![A-Za-z])`, 'gi');
    t = t.replace(re, vormen[k]);
  }
  return t;
}

const vormen = leesJson(path.join(TDIR, 'garbled.json'), { vormen: {} }).vormen;

for (const id of ids) {
  const j3 = path.join(RUW, `${id}.en.json3`);
  const vtt = path.join(RUW, `${id}.en.vtt`);
  if (!alleenOmzetten && !fs.existsSync(j3) && !fs.existsSync(vtt)) {
    ytdlp([
      '--skip-download', '--write-auto-subs', '--sub-langs', 'en', '--sub-format', 'json3',
      '-o', path.join(RUW, '%(id)s.%(ext)s'), `https://www.youtube.com/watch?v=${id}`,
    ], { allowFail: true });
    await slaap(4000);
  }
  // Browserroute (zie tactics/README.md): <id>.txt komt rechtstreeks uit het transcriptpaneel van
  // YouTube en is dan zelf het ruwe bestand. Alleen de herstelde kopie wordt gemaakt.
  const txt = path.join(RUW, `${id}.txt`);
  if (!fs.existsSync(j3) && !fs.existsSync(vtt) && fs.existsSync(txt)) {
    const ruw = fs.readFileSync(txt, 'utf8').replace(/\s+$/, '');
    fs.writeFileSync(path.join(RUW, `${id}.fixed.txt`), herstel(ruw, vormen) + '\n', 'utf8');
    console.log(`${id}: browsertranscript, ${ruw.split('\n').length} regels, namen hersteld`);
    continue;
  }
  let woorden = [];
  if (fs.existsSync(j3)) woorden = woordenUitJson3(j3);
  else if (fs.existsSync(vtt)) woorden = woordenUitVtt(vtt);
  if (woorden.length === 0) { console.log(`${id}: GEEN bruikbare ondertitels`); continue; }
  const r = regels(woorden);
  fs.writeFileSync(path.join(RUW, `${id}.txt`), r.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(RUW, `${id}.fixed.txt`), herstel(r.join('\n'), vormen) + '\n', 'utf8');
  console.log(`${id}: ${woorden.length} woorden, ${r.length} regels`);
}
