// ── DRIEWEG-MERGE VAN DE LIJSTEN (28-10-2026) ──────────────────────────────────────────────────────
// Tot nu toe was de sync "hele document, laatste schrijver wint": één cloud-rij per sleutel, en wie
// het laatst pushte had gelijk. Op één apparaat prima, op een PC én een telefoon niet (Joost: "ik wil
// gewoon altijd dezelfde lijsten"). Een lijst die op de PC was weggegooid stond nog op de telefoon, en
// de telefoon kon niet zien of dat een NIEUWE lijst was of een VERWIJDERDE — dus kwam er een
// "which copy?"-dialoog die niemand kon beantwoorden.
//
// Het ontbrekende stuk was een BASIS: de laatste stand waarvan we weten dat dit apparaat en de cloud
// hem allebei hadden. Mét die basis is elk verschil te duiden, per lijst (op id):
//   • alleen hier veranderd t.o.v. de basis → hier wint; alleen daar → daar wint;
//   • allebei veranderd → de lijst met de nieuwste `updatedAt` wint;
//   • stond in de basis, nu alleen nog hier → elders verwijderd (tenzij hier sindsdien bewerkt);
//   • stond niet in de basis → nieuw, altijd houden.
// Zonder basis (eerste sync op een apparaat, nieuwe sleutel) wordt alles samengevoegd en verdwijnt er
// niets — liever een lijst te veel dan één kwijt.
//
// Puur en zonder React/Supabase, zodat het met `node --test` vast te zetten is
// (scripts/tests/list-merge.test.cjs).

export interface SyncDoc {
  lists: unknown[];
  groups: unknown[];
}

type Soort = 'lists' | 'groups';

/** JSON met gesorteerde sleutels. Postgres (jsonb) herschikt de sleutels van een object, dus de cloud-
 *  kopie van een ongewijzigde lijst is als gewone JSON-string tóch anders dan de lokale. Vergelijken
 *  moet daarom op inhoud, niet op volgorde van sleutels. Verder als JSON.stringify: `undefined` en
 *  functies vallen weg in objecten en worden `null` in arrays. */
export function stabielJson(v: unknown): string {
  if (v === null || typeof v !== 'object') {
    const s = JSON.stringify(v);
    return s === undefined ? 'null' : s;
  }
  if (Array.isArray(v)) {
    return `[${v.map((x) => (x === undefined || typeof x === 'function' ? 'null' : stabielJson(x))).join(',')}]`;
  }
  const o = v as Record<string, unknown>;
  const delen: string[] = [];
  for (const k of Object.keys(o).sort()) {
    const x = o[k];
    if (x === undefined || typeof x === 'function') continue;
    delen.push(`${JSON.stringify(k)}:${stabielJson(x)}`);
  }
  return `{${delen.join(',')}}`;
}

/** Zelfde inhoud (lijsten én groepen, in dezelfde volgorde)? */
export function zelfdeDoc(a: SyncDoc, b: SyncDoc): boolean {
  return stabielJson(a.lists ?? []) === stabielJson(b.lists ?? [])
    && stabielJson(a.groups ?? []) === stabielJson(b.groups ?? []);
}

/** Het id van een lijst/groep, of null als hij er geen (bruikbaar) heeft. */
export function idVan(item: unknown): string | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const id = (item as { id?: unknown }).id;
  return typeof id === 'string' && id ? id : null;
}

/** `updatedAt` als getal (ms). De app schrijft `Date.now()`; een ISO-string wordt ook geslikt. */
export function updatedAtVan(item: unknown): number | null {
  if (!item || typeof item !== 'object') return null;
  const u = (item as { updatedAt?: unknown }).updatedAt;
  if (typeof u === 'number' && Number.isFinite(u)) return u;
  if (typeof u === 'string' && u.trim()) {
    const n = Number(u);
    if (Number.isFinite(n)) return n;
    const d = Date.parse(u);
    if (Number.isFinite(d)) return d;
  }
  return null;
}

// Een element in de merge heet naar zijn id. Items ZONDER id (horen er niet te zijn, maar oude data
// is oude data) krijgen hun inhoud als sleutel: dan vallen twee identieke vanzelf samen en doen ze
// gewoon mee in de volgorde. Het NUL-teken voorkomt een botsing met een echt id.
const ZONDER_ID = '\u0000json:';

interface Zijde {
  volgorde: string[];
  items: Map<string, unknown>;
  /** Stabiele JSON per sleutel, één keer uitgerekend. */
  json: Map<string, string>;
}

function zijde(arr: unknown[] | null | undefined): Zijde {
  const z: Zijde = { volgorde: [], items: new Map(), json: new Map() };
  for (const item of Array.isArray(arr) ? arr : []) {
    const id = idVan(item);
    const j = stabielJson(item);
    // Een dubbel id binnen één kant is een datafout; de eerste telt als "die lijst", de rest blijft
    // als los item bestaan in plaats van stil te verdwijnen.
    const sleutel = id !== null && !z.items.has(id) ? id : ZONDER_ID + j;
    if (z.items.has(sleutel)) continue; // exact hetzelfde id-loze item twee keer: één houden
    z.volgorde.push(sleutel);
    z.items.set(sleutel, item);
    z.json.set(sleutel, j);
  }
  return z;
}

/** De volgorde van `vol`, beperkt tot de sleutels in `binnen`. */
const beperkt = (vol: string[], binnen: Set<string>): string[] => vol.filter((k) => binnen.has(k));
const zelfdeRij = (a: string[], b: string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** Wie wint als beide kanten het item hebben en ze verschillen. */
function kiesBeide(soort: Soort, basisJson: string | undefined, l: Zijde, c: Zijde, k: string): 'l' | 'c' {
  const lj = l.json.get(k)!;
  const cj = c.json.get(k)!;
  const lu = updatedAtVan(l.items.get(k));
  const cu = updatedAtVan(c.items.get(k));
  if (basisJson !== undefined) {
    if (lj === basisJson) return 'c';   // alleen daar veranderd
    if (cj === basisJson) return 'l';   // alleen hier veranderd
    // Allebei veranderd sinds de basis. Lijsten: de nieuwste bewerking wint. Gelijk of onbekend →
    // dit apparaat: dat is de kant waar de speler nu naar kijkt. Groepen hebben geen `updatedAt`
    // (alleen een naam), dus daar wint ook dit apparaat.
    if (soort === 'lists' && lu !== null && cu !== null && cu > lu) return 'c';
    return 'l';
  }
  // Geen basis voor dit id (eerste sync, of op beide apparaten los van elkaar aangemaakt met
  // hetzelfde id — in de praktijk: een eerdere sync die de basis nog niet bewaarde). De nieuwste wint;
  // gelijk of onbekend → de cloud, want dat is de kopie die de andere apparaten al hebben.
  if (lu !== null && cu !== null && lu > cu) return 'l';
  return 'c';
}

/** Driewegmerge van één array (lijsten óf groepen). Zie de kop van dit bestand voor de regels. */
export function mergeArray(soort: Soort, basis: unknown[] | null, lokaal: unknown[], cloud: unknown[]): unknown[] {
  const b = basis ? zijde(basis) : null;
  const l = zijde(lokaal);
  const c = zijde(cloud);

  // ── Welke items blijven, en in welke versie ──
  const uit = new Map<string, unknown>();
  const alle = new Set<string>([...l.volgorde, ...c.volgorde]);
  for (const k of alle) {
    const inL = l.items.has(k);
    const inC = c.items.has(k);
    const idLoos = k.startsWith(ZONDER_ID);
    const basisJson = b && !idLoos ? b.json.get(k) : undefined;
    if (inL && inC) {
      // Gelijk → de LOKALE versie (zelfde inhoud, maar dan blijft het object hier hetzelfde en
      // hertekent er niets).
      if (l.json.get(k) === c.json.get(k)) { uit.set(k, l.items.get(k)); continue; }
      uit.set(k, kiesBeide(soort, basisJson, l, c, k) === 'l' ? l.items.get(k) : c.items.get(k));
    } else if (inL) {
      // Alleen hier. Stond hij in de basis, dan is hij elders verwijderd — en dat volgen we, tenzij
      // hij hier sindsdien bewerkt is: een bewerking weggooien is erger dan een verwijdering missen.
      if (basisJson !== undefined && l.json.get(k) === basisJson) continue;
      uit.set(k, l.items.get(k));
    } else {
      // Alleen in de cloud: spiegelbeeld. Hier verwijderd → weg, tenzij elders sindsdien bewerkt.
      if (basisJson !== undefined && c.json.get(k) === basisJson) continue;
      uit.set(k, c.items.get(k));
    }
  }

  // ── Volgorde ──
  // De speler sleept lijsten in een eigen volgorde. Heeft DIT apparaat de onderlinge volgorde van de
  // gedeelde lijsten veranderd (t.o.v. de basis) en de cloud niet, dan is de lokale volgorde de
  // ruggengraat; anders die van de cloud. "Gedeeld" = in alle drie, zodat een toegevoegde of
  // verwijderde lijst niet als herschikking telt.
  let ruggengraat: Zijde = c;
  let ander: Zijde = l;
  if (b) {
    const gedeeld = new Set(l.volgorde.filter((k) => c.items.has(k) && b.items.has(k)));
    const bRij = beperkt(b.volgorde, gedeeld);
    const hierHerschikt = !zelfdeRij(beperkt(l.volgorde, gedeeld), bRij);
    const daarHerschikt = !zelfdeRij(beperkt(c.volgorde, gedeeld), bRij);
    if (hierHerschikt && !daarHerschikt) { ruggengraat = l; ander = c; }
  }
  const rij = ruggengraat.volgorde.filter((k) => uit.has(k));
  const geplaatst = new Set(rij);
  // Wat alleen aan de andere kant staat, komt direct na zijn dichtstbijzijnde voorganger van díe kant
  // (die al geplaatst is), of vooraan. Zo blijft een nieuwe lijst ongeveer waar hij gemaakt is, en
  // blijven meerdere nieuwe achter elkaar in hun eigen volgorde.
  ander.volgorde.forEach((k, i) => {
    if (!uit.has(k) || geplaatst.has(k)) return;
    let na = -1;
    for (let j = i - 1; j >= 0; j--) {
      const p = ander.volgorde[j];
      if (geplaatst.has(p)) { na = rij.indexOf(p); break; }
    }
    rij.splice(na + 1, 0, k);
    geplaatst.add(k);
  });
  return rij.map((k) => uit.get(k));
}

/** Voeg de lokale en de cloud-stand samen tegen de gedeelde basis. `basis` null = er is geen
 *  gedeelde stand bekend (eerste sync op dit apparaat of een nieuwe sleutel): dan alles samen, niets
 *  weg. Lijsten en groepen worden los van elkaar samengevoegd. */
export function mergeSync(basis: SyncDoc | null, lokaal: SyncDoc, cloud: SyncDoc): SyncDoc {
  return {
    lists: mergeArray('lists', basis ? basis.lists ?? [] : null, lokaal.lists ?? [], cloud.lists ?? []),
    groups: mergeArray('groups', basis ? basis.groups ?? [] : null, lokaal.groups ?? [], cloud.groups ?? []),
  };
}
