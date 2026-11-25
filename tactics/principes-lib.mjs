// Principes: tellen, drempel en rangorde. Gedeeld door tactics/codex/principes.mjs (maakt
// public/tactics/principes.json) en tactics/bouw.mjs (controleert dat bestand en telt opnieuw).
//
// Een principe is een overkoepelend inzicht dat meerdere spelers los van elkaar geven. De rangorde is
// bewijs, geen modeloordeel: het aantal VERSCHILLENDE kanalen (via elke les -> haar bronnen ->
// bronnen.json kanaalId), daarna het aantal lessen.

export const DREMPEL = { lessen: 3, kanalen: 2 };
export const TOP = 10;
export const PER_THEMA = 5;
export const SOORTEN = ['principe', 'debat'];

/** Kanaal-ids van een les (uniek, in volgorde van de bronnen). */
export function lesKanalen(les, bronIndex) {
  const uit = [];
  for (const b of les?.bronnen ?? []) {
    const k = bronIndex.get(b.bronId)?.kanaalId;
    if (k && !uit.includes(k)) uit.push(k);
  }
  return uit;
}

/** Telling van een lijst les-ids: { aantalLessen, aantalKanalen, kanalen } (kanalen gesorteerd op
 *  aantal lessen, dan id). Onbekende ids tellen niet mee. */
export function tel(ids, lesIndex, bronIndex) {
  const perKanaal = new Map();
  let n = 0;
  for (const id of new Set(ids)) {
    const l = lesIndex.get(id);
    if (!l) continue;
    n++;
    for (const k of lesKanalen(l, bronIndex)) perKanaal.set(k, (perKanaal.get(k) ?? 0) + 1);
  }
  const kanalen = [...perKanaal].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
  return { aantalLessen: n, aantalKanalen: kanalen.length, kanalen };
}

export const haaltDrempel = (p) => p.aantalLessen >= DREMPEL.lessen && p.aantalKanalen >= DREMPEL.kanalen;

/** Meeste kanalen, dan meeste lessen, dan id (zodat de volgorde vast ligt). */
export const rangorde = (a, b) => b.aantalKanalen - a.aantalKanalen || b.aantalLessen - a.aantalLessen || a.id.localeCompare(b.id);

/**
 * Telt elk principe opnieuw (ook per kant van een debat), sorteert en maakt de lijsten.
 * principes: [{ id, titel, tekst, soort, thema, leger, lessen, kanten? }]
 * Geeft { principes (gesorteerd, met tellingen), top10, debat, perThema, perLeger }.
 * Gooit niets: wat de drempel niet haalt blijft staan; de aanroeper beslist (weglaten of fout).
 */
export function rangschik(principes, { lesIndex, bronIndex, themaVolgorde }) {
  const geteld = principes.map((p) => {
    const t = tel(p.lessen, lesIndex, bronIndex);
    const uit = {
      id: p.id, titel: p.titel, tekst: p.tekst, soort: p.soort, thema: p.thema, leger: p.leger ?? null,
      aantalLessen: t.aantalLessen, aantalKanalen: t.aantalKanalen, kanalen: t.kanalen, lessen: [...p.lessen],
    };
    if (p.soort === 'debat') {
      uit.kanten = (p.kanten ?? []).map((k) => {
        const tk = tel(k.lessen, lesIndex, bronIndex);
        return { standpunt: k.standpunt, aantalLessen: tk.aantalLessen, aantalKanalen: tk.aantalKanalen, lessen: [...k.lessen] };
      });
    }
    return uit;
  }).sort(rangorde);
  const algemeen = geteld.filter((p) => p.leger == null);
  const top10 = algemeen.filter((p) => p.soort === 'principe').slice(0, TOP).map((p) => p.id);
  const debat = algemeen.filter((p) => p.soort === 'debat').map((p) => p.id);
  const perThema = {};
  for (const thema of themaVolgorde) {
    const ids = algemeen.filter((p) => p.soort === 'principe' && p.thema === thema).slice(0, PER_THEMA).map((p) => p.id);
    if (ids.length) perThema[thema] = ids;
  }
  const perLeger = {};
  for (const p of geteld) {
    if (p.leger == null) continue;
    (perLeger[p.leger] ??= []).push(p.id);
  }
  const legersOpVolgorde = Object.fromEntries(Object.entries(perLeger).sort((a, b) => a[0].localeCompare(b[0])));
  return { principes: geteld, top10, debat, perThema, perLeger: legersOpVolgorde };
}

/**
 * Controle van een principes-bestand (zoals in public/tactics/principes.json) tegen de lessen.
 * Geeft een lijst foutmeldingen (leeg = goed). Tellingen en lijsten moeten gelijk zijn aan een
 * nieuwe rangschik(); `herberekend` is die uitkomst, zodat tactics:build hem kan wegschrijven.
 */
export function controleerPrincipes(bestand, { lesIndex, bronIndex, themaVolgorde, legers }) {
  const fouten = [];
  if (!bestand || !Array.isArray(bestand.principes)) return { fouten: ['principes ontbreekt'], herberekend: null };
  const ids = new Set();
  const themas = new Set(themaVolgorde);
  for (const p of bestand.principes) {
    const w = `principe ${p.id}`;
    if (!p.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id)) fout(`${w}: id moet kebab-case zijn`);
    if (ids.has(p.id)) fout(`${w}: dubbel id`);
    ids.add(p.id);
    if (!p.titel || !p.tekst) fout(`${w}: titel of tekst ontbreekt`);
    for (const veld of ['titel', 'tekst']) if (/[—–]/.test(p[veld] ?? '')) fout(`${w}: ${veld} bevat een gedachtestreepje`);
    if ((p.tekst ?? '').split(/(?<=[.!?])\s+/).filter(Boolean).length > 2) fout(`${w}: tekst heeft meer dan 2 zinnen`);
    if (!SOORTEN.includes(p.soort)) fout(`${w}: soort ${p.soort}`);
    if (!themas.has(p.thema)) fout(`${w}: onbekend thema ${p.thema}`);
    if (p.leger != null && !legers.has(p.leger)) fout(`${w}: onbekend leger ${p.leger}`);
    if (!Array.isArray(p.lessen) || !p.lessen.length) fout(`${w}: geen lessen`);
    if (new Set(p.lessen ?? []).size !== (p.lessen ?? []).length) fout(`${w}: dubbele les`);
    for (const id of p.lessen ?? []) if (!lesIndex.has(id)) fout(`${w}: les ${id} bestaat niet`);
    if (p.soort === 'debat') {
      if (!Array.isArray(p.kanten) || p.kanten.length < 2) fout(`${w}: een debat heeft minstens 2 kanten`);
      const alle = new Set(p.lessen ?? []);
      const opKant = new Set();
      for (const k of p.kanten ?? []) {
        if (!k.standpunt || !Array.isArray(k.lessen) || !k.lessen.length) fout(`${w}: kant zonder standpunt of lessen`);
        if (/[—–]/.test(k.standpunt ?? '')) fout(`${w}: standpunt bevat een gedachtestreepje`);
        for (const id of k.lessen ?? []) { if (!alle.has(id)) fout(`${w}: les ${id} staat bij een kant maar niet in lessen`); opKant.add(id); }
      }
      for (const id of alle) if (!opKant.has(id)) fout(`${w}: les ${id} staat bij geen enkele kant`);
    } else if (p.kanten != null) fout(`${w}: alleen een debat heeft kanten`);
  }
  const herberekend = rangschik(bestand.principes, { lesIndex, bronIndex, themaVolgorde });
  for (const p of herberekend.principes) if (!haaltDrempel(p)) fout(`principe ${p.id}: ${p.aantalLessen} lessen uit ${p.aantalKanalen} kanalen (drempel ${DREMPEL.lessen} lessen uit ${DREMPEL.kanalen} kanalen)`);
  const vergelijk = (naam, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) fout(`${naam} klopt niet met de lessen (draai npm run tactics:build)`); };
  vergelijk('principes (volgorde of tellingen)', bestand.principes.map(sleutel), herberekend.principes.map(sleutel));
  vergelijk('top10', bestand.top10, herberekend.top10);
  vergelijk('debat', bestand.debat, herberekend.debat);
  vergelijk('perThema', bestand.perThema, herberekend.perThema);
  vergelijk('perLeger', bestand.perLeger, herberekend.perLeger);
  return { fouten, herberekend };

  function fout(m) { fouten.push(m); }
}

const sleutel = (p) => [p.id, p.aantalLessen, p.aantalKanalen, p.kanalen, ...(p.kanten ?? []).map((k) => [k.aantalLessen, k.aantalKanalen])];
