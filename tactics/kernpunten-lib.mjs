// Kernpunten per subthema: tellen, rangorde, keuze en controle. Gedeeld door
// tactics/codex/kernpunten.mjs (maakt public/tactics/kernpunten.json) en tactics/bouw.mjs (controleert
// dat bestand en telt opnieuw).
//
// Een kernpunt is een advies dat meerdere lessen in EEN subthema (een sectie op de pagina) geven: korte
// titel (een claim), een zin uitleg en de les-ids. De rangorde is bewijs, zoals bij de principes: het
// aantal VERSCHILLENDE kanalen, dan het aantal lessen (tel en rangorde uit principes-lib.mjs).
import { rangorde, tel } from './principes-lib.mjs';

/** Minstens zoveel lessen per kernpunt; een sectie met minder lessen dan MIN_SECTIE krijgt er geen. */
export const KP_DREMPEL = { lessen: 2 };
export const MIN_SECTIE = 4;
/** Zoveel kernpunten met minstens 2 kanalen wil een sectie hebben voordat een kernpunt uit een kanaal mag. */
export const MIN_MEER_KANALEN = 3;
export const MAX_KERNPUNTEN = 5;

/** Hooguit zoveel kernpunten voor een sectie met n lessen: kleine secties krijgen er minder. */
export const maxVoor = (n) => (n < MIN_SECTIE ? 0 : n < 10 ? 3 : n < 16 ? 4 : MAX_KERNPUNTEN);

/** Les-ids van een subthema (een les hoort er bij als het subthema in haar `subthemas` staat). */
export const sectieLessen = (lessen, sub) => lessen.filter((l) => (l.subthemas ?? []).includes(sub)).map((l) => l.id);

/** Telt kernpunten (nLessen, nKanalen, kanalen) en sorteert ze: meeste kanalen, dan lessen, dan id. */
export function telKernpunten(lijst, { lesIndex, bronIndex }) {
  return lijst.map((k) => {
    const t = tel(k.lessen, lesIndex, bronIndex);
    return {
      id: k.id, titel: k.titel, tekst: k.tekst, lessen: [...k.lessen],
      nLessen: t.aantalLessen, nKanalen: t.aantalKanalen, kanalen: t.kanalen,
      ...(k.principeId ? { principeId: k.principeId } : {}),
    };
  }).sort((a, b) => rangorde({ id: a.id, aantalKanalen: a.nKanalen, aantalLessen: a.nLessen }, { id: b.id, aantalKanalen: b.nKanalen, aantalLessen: b.nLessen }));
}

/**
 * De kernpunten van een sectie kiezen uit getelde kandidaten (gesorteerd): eerst die met minstens 2
 * kanalen; staan er dan minder dan MIN_MEER_KANALEN, dan aanvullen met kernpunten uit een kanaal tot
 * MIN_MEER_KANALEN. Nooit meer dan maxVoor(aantal lessen van de sectie).
 */
export function kies(geteld, nSectie) {
  const max = maxVoor(nSectie);
  const geldig = geteld.filter((k) => k.nLessen >= KP_DREMPEL.lessen);
  const meer = geldig.filter((k) => k.nKanalen >= 2).slice(0, max);
  const ruimte = Math.min(max, MIN_MEER_KANALEN) - meer.length;
  const een = ruimte > 0 ? geldig.filter((k) => k.nKanalen < 2).slice(0, ruimte) : [];
  return [...meer, ...een];
}

const zinnen = (s) => String(s ?? '').split(/(?<=[.!?])\s+/).filter(Boolean).length;

/**
 * Controle van public/tactics/kernpunten.json tegen de lessen. Geeft { fouten, herberekend }:
 * herberekend is het bestand met opnieuw getelde en gesorteerde kernpunten (tactics:build schrijft dat
 * weg; tactics:check faalt als het verschilt).
 */
export function controleerKernpunten(bestand, { lessen, lesIndex, bronIndex, subthemaIds, principeIds }) {
  const fouten = [];
  const fout = (m) => fouten.push(m);
  if (!bestand || typeof bestand.perSubthema !== 'object' || bestand.perSubthema === null) return { fouten: ['perSubthema ontbreekt'], herberekend: null };
  const perSubthema = {};
  for (const [sub, lijst] of Object.entries(bestand.perSubthema)) {
    const w = `subthema ${sub}`;
    if (!subthemaIds.has(sub)) { fout(`${w}: onbekend subthema`); continue; }
    if (!Array.isArray(lijst) || !lijst.length) { fout(`${w}: lege lijst (laat het subthema dan weg)`); continue; }
    const inSectie = new Set(sectieLessen(lessen, sub));
    if (inSectie.size < MIN_SECTIE) fout(`${w}: ${inSectie.size} lessen, een sectie onder ${MIN_SECTIE} lessen krijgt geen kernpunten`);
    if (lijst.length > MAX_KERNPUNTEN) fout(`${w}: ${lijst.length} kernpunten (max ${MAX_KERNPUNTEN})`);
    const ids = new Set();
    for (const k of lijst) {
      const v = `${w}, kernpunt ${k?.id}`;
      if (!k?.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(k.id)) fout(`${v}: id moet kebab-case zijn`);
      if (ids.has(k?.id)) fout(`${v}: dubbel id`);
      ids.add(k?.id);
      if (!k?.titel || !k?.tekst) fout(`${v}: titel of tekst ontbreekt`);
      for (const veld of ['titel', 'tekst']) if (/[—–]/.test(k?.[veld] ?? '')) fout(`${v}: ${veld} bevat een gedachtestreepje`);
      if (zinnen(k?.tekst) > 1) fout(`${v}: tekst heeft meer dan 1 zin`);
      if (!Array.isArray(k?.lessen)) { fout(`${v}: geen lessen`); continue; }
      if (new Set(k.lessen).size !== k.lessen.length) fout(`${v}: dubbele les`);
      if (k.lessen.length < KP_DREMPEL.lessen) fout(`${v}: ${k.lessen.length} les(sen), minstens ${KP_DREMPEL.lessen}`);
      for (const id of k.lessen) {
        if (!lesIndex.has(id)) fout(`${v}: les ${id} bestaat niet`);
        else if (!inSectie.has(id)) fout(`${v}: les ${id} hoort niet bij subthema ${sub}`);
      }
      if (k.principeId != null && !principeIds.has(k.principeId)) fout(`${v}: principe ${k.principeId} bestaat niet`);
    }
    perSubthema[sub] = telKernpunten(lijst.filter((k) => Array.isArray(k?.lessen)), { lesIndex, bronIndex });
  }
  const herberekend = { ...bestand, perSubthema };
  if (JSON.stringify(herberekend.perSubthema) !== JSON.stringify(bestand.perSubthema)) fout('tellingen of volgorde klopt niet met de lessen (draai npm run tactics:build)');
  return { fouten, herberekend };
}
