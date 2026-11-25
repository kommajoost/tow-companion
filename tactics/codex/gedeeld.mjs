// Gedeelde hulpjes voor de Codex-route (tactics/codex/run.mjs en samenvoegen.mjs).
// De controles zijn dezelfde als in tactics/bouw.mjs: citaat letterlijk in <id>.fixed.txt, hooguit
// 15 woorden, binnen 60 s van het tijdstip; hooguit 3 citaten per les; fase en thema's uit
// tactics/themas.json; units uit public/owb/rules-index.json.
import fs from 'node:fs';
import path from 'node:path';
import { CACHE, PUB, ROOT, RUW, TDIR, leesJson } from '../lib.mjs';

export const CDIR = path.join(TDIR, 'codex');
export const UIT = path.join(CDIR, 'uit');
export const KALIBRATIE = path.join(CDIR, 'kalibratie');
export const MISLUKT = path.join(CDIR, 'mislukt');
export const TERUGGEDRAAID = path.join(CDIR, 'teruggedraaid');
export const LOG = path.join(CDIR, 'log.json');
export const SAMENGEVOEGD = path.join(CDIR, 'samengevoegd.json');
export const RONDE = path.join(TDIR, 'ronde2-tactics.json');

export const VELDEN_TEKST = ['waarom', 'voorbeeld', 'wanneerNiet'];
export const MAX_CITATEN = 3;
export const MAX_WOORDEN = 15;

export const woorden = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const zinnen = (s) => String(s ?? '').split(/(?<=[.!?])\s+/).filter(Boolean).length;
export const vandaag = () => new Date().toISOString().slice(0, 10);
export const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

export const MIN_TAGS = 2;
export const MAX_TAGS = 6;
export const MAX_THEMAS = 3;

// Een les bewaart thema's als twee lijsten in dezelfde volgorde: themas (ids, hoofdthema eerst) en
// subthemas (per thema het subthema). Codex antwoordt als [{ thema, subthema }]; die vorm heet hier
// "indeling".

/** Thema-ids van een les (ook als een oud bestand nog objecten zou hebben). */
export const themaIds = (l) => (Array.isArray(l?.themas) ? l.themas : [])
  .map((t) => (typeof t === 'string' ? t : t?.thema)).filter((t) => typeof t === 'string');

/** themas + subthemas van een les als [{ thema, subthema }] (subthema null als het ontbreekt). */
export const lesIndeling = (l) => themaIds(l).map((thema, i) => ({ thema, subthema: Array.isArray(l?.subthemas) ? l.subthemas[i] ?? null : null }));

/** [{ thema, subthema }] naar de velden van een les. */
export const indelingVelden = (indeling) => ({ themas: indeling.map((t) => t.thema), subthemas: indeling.map((t) => t.subthema) });

/** Het vocabulaire (thema's met subthema's, tags) als prompttekst voor Codex. */
export function vocabTekst(ctx) {
  const themas = ctx.vocab.themas.map((t) => [
    `- ${t.id} (${t.naam}): ${t.omschrijving}`,
    ...(t.subthemas ?? []).map((s) => `  - ${s.id} (${s.naam}): ${s.omschrijving}`),
  ].join('\n')).join('\n');
  const groepen = ctx.tagGroepen.map((g) => {
    const tags = [...ctx.tags.values()].filter((t) => t.groep === g.id);
    if (!tags.length) return null;
    return `${g.naam}: ` + tags.map((t) => (t.synonyms?.length ? `${t.id} (${t.synonyms.join(', ')})` : t.id)).join('; ');
  }).filter(Boolean).join('\n');
  return [
    'Themes and their sub-themes (theme id, then its sub-theme ids indented):\n' + themas,
    'Tags (id, with synonyms in brackets; use the id):\n' + groepen,
  ].join('\n\n');
}

/**
 * Thema's met subthema's en tags van een les nakijken tegen het vocabulaire.
 * themasIn: [{ thema, subthema }] (een los subthema-id of een thema zonder subthema wordt aangevuld
 * als dat eenduidig kan). tagsIn: tag-ids; labels en synoniemen worden omgezet naar het id.
 * Geeft { themas, tags, fouten: [], correcties: [] }. fouten leeg = bruikbaar.
 */
export function normaliseerIndex(ctx, themasIn, tagsIn) {
  const fouten = [];
  const correcties = [];
  const themas = [];
  const gezien = new Set();
  for (const x of Array.isArray(themasIn) ? themasIn : []) {
    let thema = typeof x === 'string' ? x : x?.thema;
    let sub = typeof x === 'string' ? null : x?.subthema;
    if (!ctx.themas.has(thema) && ctx.subthemaThema.has(thema) && !sub) { sub = thema; thema = ctx.subthemaThema.get(sub); }
    if (!ctx.themas.has(thema) && ctx.subthemaThema.has(sub)) { correcties.push(`thema ${thema} -> ${ctx.subthemaThema.get(sub)} (van subthema ${sub})`); thema = ctx.subthemaThema.get(sub); }
    if (!ctx.themas.has(thema)) { fouten.push(`onbekend thema ${JSON.stringify(x)}`); continue; }
    const subs = ctx.themas.get(thema).subthemas;
    if (!subs.has(sub)) { fouten.push(`subthema ${sub} hoort niet bij ${thema}`); continue; }
    if (gezien.has(thema)) { correcties.push(`dubbel thema ${thema} weggelaten`); continue; }
    gezien.add(thema);
    themas.push({ thema, subthema: sub });
  }
  if (themas.length === 0 && !fouten.length) fouten.push('geen thema');
  if (themas.length > MAX_THEMAS) { correcties.push(`meer dan ${MAX_THEMAS} thema's, eerste ${MAX_THEMAS} gehouden`); themas.length = MAX_THEMAS; }
  const tags = [];
  for (const t of Array.isArray(tagsIn) ? tagsIn : []) {
    const k = String(t).toLowerCase().trim();
    const id = ctx.tagAlias.get(k) ?? ctx.tagAlias.get(k.replace(/-/g, ' '));
    if (!id) { correcties.push(`onbekende tag "${t}" weggelaten`); continue; }
    if (id !== t) correcties.push(`tag "${t}" -> ${id}`);
    if (!tags.includes(id)) tags.push(id);
  }
  if (tags.length > MAX_TAGS) { correcties.push(`meer dan ${MAX_TAGS} tags, eerste ${MAX_TAGS} gehouden`); tags.length = MAX_TAGS; }
  if (tags.length < MIN_TAGS) fouten.push(`${tags.length} geldige tag(s) (minstens ${MIN_TAGS})`);
  return { themas, tags, fouten, correcties };
}

/** Alles wat de controles nodig hebben, in een keer gelezen. */
export function laadContext() {
  const bronnen = leesJson(path.join(PUB, 'bronnen.json'));
  const lessen = leesJson(path.join(PUB, 'lessen.json'));
  const vocab = leesJson(path.join(TDIR, 'themas.json'));
  const tagsBestand = leesJson(path.join(TDIR, 'tags.json'), { groepen: [], tags: [] });
  const meta = leesJson(path.join(CACHE, 'meta.json'), {});
  const glossary = leesJson(path.join(TDIR, 'glossary.json'), {});
  const index = leesJson(path.join(ROOT, 'public', 'owb', 'rules-index.json'), {});
  const legers = new Set(fs.readdirSync(path.join(ROOT, 'public', 'owb')).filter((f) => {
    const d = leesJson(path.join(ROOT, 'public', 'owb', f));
    return d && Array.isArray(d.characters);
  }).map((f) => f.replace(/\.json$/, '')));
  const titel = (k) => k.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const weergave = glossary.unitWeergave ?? {};
  /** lowercase naam -> naam zoals in de app */
  const units = new Map();
  for (const [k, v] of Object.entries(index)) {
    if (v?.url?.startsWith('unit/')) units.set(k, weergave[k] ?? titel(k));
  }
  // thema-id -> { ...thema, subthemas: Set }; subthema-id -> thema-id; tag-id/label/synoniem -> tag-id.
  const themas = new Map(vocab.themas.map((t) => [t.id, { ...t, subthemas: new Set((t.subthemas ?? []).map((s) => s.id)) }]));
  const subthemaThema = new Map();
  for (const t of vocab.themas) for (const s of t.subthemas ?? []) subthemaThema.set(s.id, t.id);
  const tags = new Map((tagsBestand.tags ?? []).map((t) => [t.id, t]));
  const tagAlias = new Map();
  for (const t of tags.values()) {
    for (const a of [t.label, ...(t.synonyms ?? [])]) if (a && !tagAlias.has(a.toLowerCase())) tagAlias.set(a.toLowerCase(), t.id);
  }
  for (const id of tags.keys()) tagAlias.set(id, id); // het id wint altijd
  return {
    bronnen, lessen, vocab, meta, legers, units,
    fases: new Set(vocab.fases.map((f) => f.id)),
    themas, subthemaThema, tags, tagAlias, tagGroepen: tagsBestand.groepen ?? [],
    bronIndex: new Map(bronnen.bronnen.map((b) => [b.id, b])),
    kanaalIndex: new Map(bronnen.kanalen.map((k) => [k.id, k])),
  };
}

const transcriptCache = new Map();
/** Regels uit tactics/ruw/<id>.fixed.txt: [{ sec, tekst }], of null als het bestand er niet is. */
export function transcriptRegels(videoId) {
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

/** Precies de controle van bouw.mjs. */
export function citaatInTranscript(regels, tijd, citaat) {
  const venster = regels.filter((r) => r.sec >= tijd - 60 && r.sec <= tijd + 60).map((r) => r.tekst).join(' ');
  return norm(venster).includes(norm(citaat));
}

/** Startregels waar het citaat letterlijk begint (een citaat loopt over hooguit 3 regels). */
function startRegels(regels, citaat) {
  const doel = norm(citaat);
  const uit = [];
  if (!doel) return uit;
  for (let i = 0; i < regels.length; i++) {
    const stuk = norm(regels.slice(i, i + 3).map((r) => r.tekst).join(' '));
    if (!stuk.includes(doel)) continue;
    const rest = norm(regels.slice(i + 1, i + 3).map((r) => r.tekst).join(' '));
    if (rest.includes(doel)) continue; // begint pas in een latere regel
    uit.push(regels[i].sec);
  }
  return uit;
}

/**
 * Controleert een citaat en zet het tijdstip op de regel waar het begint.
 * Geeft { ok: true, tijd, verschoven } of { ok: false, reden }.
 * Een letterlijk citaat met een verkeerd tijdstip wordt verschoven naar de dichtstbijzijnde plek waar
 * het echt staat; een niet-letterlijk citaat wordt afgekeurd.
 */
export function controleerCitaat(regels, duurSec, c) {
  if (!c || typeof c.citaat !== 'string' || !c.citaat.trim()) return { ok: false, reden: 'citaat ontbreekt' };
  if (typeof c.tijd !== 'number' || !Number.isFinite(c.tijd)) return { ok: false, reden: 'tijd ontbreekt' };
  const n = woorden(c.citaat);
  if (n > MAX_WOORDEN) return { ok: false, reden: `citaat heeft ${n} woorden (max ${MAX_WOORDEN})` };
  const kandidaten = startRegels(regels, c.citaat);
  let tijd = Math.round(c.tijd);
  if (kandidaten.length) {
    const beste = kandidaten.reduce((a, b) => (Math.abs(b - tijd) < Math.abs(a - tijd) ? b : a));
    if (citaatInTranscript(regels, beste, c.citaat)) tijd = beste;
  }
  if (!citaatInTranscript(regels, tijd, c.citaat)) {
    return { ok: false, reden: kandidaten.length ? 'citaat niet te plaatsen binnen 60 s' : 'citaat niet letterlijk in het transcript' };
  }
  if (tijd < 0 || (duurSec && tijd > duurSec)) return { ok: false, reden: `tijd ${tijd}s valt buiten de video` };
  return { ok: true, tijd, verschoven: tijd !== Math.round(c.tijd) ? tijd - Math.round(c.tijd) : 0 };
}

export const bronUrl = (bron, tijd) => `${bron.url}${bron.url.includes('?') ? '&' : '?'}t=${Math.max(0, tijd - 3)}s`;

export function duurVan(ctx, videoId) {
  const b = ctx.bronIndex.get(`yt-${videoId}`);
  return ctx.meta[videoId]?.duurSec ?? (b?.duurMin ? b.duurMin * 60 + 59 : null);
}

/** Aantal citaten in een les (hoofdcitaat per bron plus extra citaten). */
export const aantalCitaten = (les) => (les.bronnen ?? []).reduce((n, b) => n + 1 + (b.extraCitaten?.length ?? 0), 0);

/** Alle uit/*.json-bestanden (genormaliseerd door run.mjs), op naam gesorteerd. */
export function leesUitBestanden(dir = UIT) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({
    bestand: path.join(dir, f), data: leesJson(path.join(dir, f)),
  })).filter((x) => x.data && Array.isArray(x.data.nieuw));
}
