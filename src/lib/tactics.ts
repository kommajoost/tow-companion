// Tactiekdatabank (zie docs/tactics/ontwerp.md). Twee vaste bestanden in public/tactics/, gemaakt
// door de verzamelroutine op Joosts pc: bronnen.json (kanalen + losse video's/artikelen) en
// lessen.json (de lessen zelf, elk met bron, fase, thema's met subthema en tags). Daarnaast
// themas.json (thema's met subthema's, en fases) en tags.json (zoektermen met synoniemen): het vaste
// vocabulaire. Deze module typt ze en haalt ze één keer op; ontbreekt een vocabulairebestand, dan
// wordt het afgeleid uit de lessen.

export type KanaalType = 'youtube' | 'artikel' | 'wiki' | 'data';
export type Waardering = 'A' | 'B' | 'C';

export interface Kanaal {
  id: string;
  naam: string;
  /** null als bronnen.md geen handle of adres geeft. */
  url: string | null;
  type: KanaalType;
  waardering: Waardering;
  /** Weergave als de bron zelf genuanceerder is dan één letter ("A (meta)", "B/C"). */
  waarderingTekst?: string;
  omschrijving: string | null;
  laatsteUpload: string | null;
  /** 1 = eerste ronde (algemene tactiek), 2 = Dark Elves-ronde, 3 = derde ronde (tactiekvideo's van
   *  nieuwe kanalen, tactics/ronde3/), null = nog niet gepland. */
  ronde: 1 | 2 | 3 | null;
}

export type BronStatus = 'candidate' | 'processed';

/** Soort video, beslist in tactics/selectie.json. Alleen de eerste vier komen op de pagina. */
export type BronSoort = 'tactics' | 'list-building' | 'army-review' | 'rules-explained' | 'battle-report' | 'meta' | 'other';

export const BRON_SOORTEN: BronSoort[] = ['tactics', 'list-building', 'army-review', 'rules-explained', 'battle-report', 'meta', 'other'];

export interface Bron {
  id: string;
  kanaalId: string;
  titel: string;
  url: string;
  datum: string | null;
  /** 'general' of de Companion-slug van het leger waar de video over gaat (dark-elves). */
  onderwerp: string;
  status: BronStatus;
  lessen: number;
  duurMin?: number | null;
  soort?: BronSoort;
  verwerktOp?: string | null;
}

export interface BronnenBestand {
  bijgewerkt: string | null;
  kanalen: Kanaal[];
  bronnen: Bron[];
}

/** Onderverdeling van een thema ("Magic" → "Dispelling"). Een les heeft per thema één subthema. */
export interface Subthema {
  id: string;
  naam: string;
  omschrijving: string;
  volgorde: number;
}

/** Een thema is de ingang op de pagina ("Magic"). Een les hoort bij 1 tot 3 thema's. */
export interface Thema {
  id: string;
  naam: string;
  /** Eén korte feitelijke regel, Engels. */
  omschrijving: string;
  volgorde: number;
  subthemas: Subthema[];
}

/** Een zoekterm uit public/tactics/tags.json ("overrun", synoniemen "overruns"). */
export interface Tag {
  id: string;
  label: string;
  groep: string | null;
  synonyms: string[];
}

/** Thema van een les met het subthema daarbinnen. subthema null = (nog) niet ingedeeld. */
export interface LesThema {
  thema: string;
  subthema: string | null;
}

/** De spelfase waarin een les speelt; binnen een thema de onderverdeling. Precies één per les. */
export interface Fase {
  id: string;
  naam: string;
  volgorde: number;
}

/** public/tactics/themas.json, een kopie van tactics/themas.json (gemaakt door tactics:build). */
export interface ThemasBestand {
  themas: Thema[];
  fases: Fase[];
}

export interface LesBron {
  bronId: string;
  /** Link met tijdstip (&t=123s). */
  url: string;
  /** Seconden, of een tekst als "12:34". */
  tijd?: number | string | null;
  /** Hooguit 15 woorden, om na te kijken. */
  citaat: string;
  /** Hooguit twee extra citaten uit dezelfde bron, elk met eigen tijdstip (seconden). */
  extraCitaten?: { tijd: number; citaat: string }[];
}

export interface LesMarkering {
  soort: 'verouderd' | 'renegade-afwijking' | 'regel-afwijking';
  tekst: string;
}

export interface Les {
  id: string;
  titel: string;
  tekst: string;
  /** De redenering van de spreker, in eigen woorden. null = de spreker geeft er geen. */
  waarom?: string | null;
  /** Het concrete voorbeeld van de spreker, of null. */
  voorbeeld?: string | null;
  /** Uitzonderingen of voorbehouden die de spreker noemt, of null. */
  wanneerNiet?: string | null;
  /** Fase-id uit themas.json. */
  fase: string;
  /** 1 tot 3 thema-ids uit themas.json; het eerste is het hoofdthema. */
  themas: string[];
  /** Per thema (zelfde volgorde) het subthema-id daarbinnen. Ontbreekt bij oude gegevens. */
  subthemas?: string[];
  /** 2 tot 6 tag-ids uit tags.json. Ontbreekt bij oude gegevens. */
  tags?: string[];
  /** null = algemeen, anders de Companion-slug (dark-elves). */
  leger: string | null;
  units: string[];
  bronnen: LesBron[];
  datum: string | null;
  markeringen: LesMarkering[];
}

export interface LessenBestand {
  bijgewerkt: string | null;
  lessen: Les[];
}

/** Eén kant van een debat: een standpunt met de lessen die het innemen. */
export interface PrincipeKant {
  standpunt: string;
  aantalLessen: number;
  aantalKanalen: number;
  lessen: string[];
}

/** Een overkoepelend inzicht dat meerdere spelers los van elkaar geven (tactics/codex/principes.mjs).
 *  Titel en tekst zijn een AI-samenvatting van de lessen eronder; de tellingen komen uit de gegevens. */
export interface Principe {
  id: string;
  titel: string;
  tekst: string;
  /** 'debat' = spelers zijn het oneens; dan staan de kanten in `kanten`. */
  soort: 'principe' | 'debat';
  thema: string;
  /** null = algemeen, anders het leger waar het principe over gaat (spelen of tegenover staan). */
  leger: string | null;
  aantalLessen: number;
  /** Aantal verschillende kanalen onder de lessen: de maat voor "onafhankelijk". */
  aantalKanalen: number;
  kanalen: string[];
  lessen: string[];
  kanten?: PrincipeKant[];
}

/** public/tactics/principes.json. Lijsten zijn principe-ids, op rangorde (meeste kanalen, dan lessen). */
export interface PrincipesBestand {
  bijgewerkt: string | null;
  principes: Principe[];
  top10: string[];
  debat: string[];
  perThema: Record<string, string[]>;
  perLeger: Record<string, string[]>;
}

/** Een kernpunt van een subthema (tactics/codex/kernpunten.mjs): een advies dat meerdere lessen van
 *  die sectie geven. Titel en tekst zijn een AI-samenvatting; de tellingen komen uit de gegevens. */
export interface Kernpunt {
  id: string;
  titel: string;
  /** Eén zin. */
  tekst: string;
  lessen: string[];
  nLessen: number;
  /** Aantal verschillende kanalen onder de lessen. */
  nKanalen: number;
  kanalen: string[];
  /** Het principe met (vrijwel) dezelfde lessen, als dat er is. */
  principeId?: string;
}

/** public/tactics/kernpunten.json: per subthema-id de kernpunten op rangorde (kanalen, dan lessen). */
export interface KernpuntenBestand {
  bijgewerkt: string | null;
  perSubthema: Record<string, Kernpunt[]>;
}

export interface TacticsData {
  /** null = bronnen.json ontbreekt of is onleesbaar. */
  bronnen: BronnenBestand | null;
  /** Ontbreekt principes.json, dan leeg (de pagina toont dan alleen de thema's). */
  principes: PrincipesBestand;
  /** Ontbreekt kernpunten.json, dan leeg (de secties tonen dan meteen hun lessen). */
  kernpunten: KernpuntenBestand;
  /** Ontbreekt lessen.json, dan een lege lijst: dat is gewoon "nog geen lessen". */
  lessen: LessenBestand;
  /** Thema's en fases. Ontbreekt themas.json, dan afgeleid uit de ids in de lessen. */
  vocab: ThemasBestand;
  /** Tags uit tags.json; ontbreekt dat bestand, dan afgeleid uit de ids in de lessen (zonder synoniemen). */
  tags: Tag[];
}

const BASE = import.meta.env.BASE_URL;

async function haalJson(pad: string): Promise<unknown> {
  try {
    const r = await fetch(`${BASE}${pad}`);
    if (!r.ok) return null;
    // Een ontbrekend bestand kan als index.html terugkomen (SPA-fallback); json() gooit dan.
    return await r.json();
  } catch {
    return null;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function leesBronnen(v: unknown): BronnenBestand | null {
  if (!isObj(v) || !Array.isArray(v.kanalen)) return null;
  return {
    bijgewerkt: typeof v.bijgewerkt === 'string' ? v.bijgewerkt : null,
    kanalen: (v.kanalen as unknown[]).filter((k): k is Kanaal => isObj(k) && typeof k.id === 'string' && typeof k.naam === 'string'),
    bronnen: Array.isArray(v.bronnen)
      ? (v.bronnen as unknown[]).filter((b): b is Bron => isObj(b) && typeof b.id === 'string' && typeof b.kanaalId === 'string')
      : [],
  };
}

/** themas (ids) en subthemas (zelfde volgorde) netjes gemaakt; een subthema ontbreekt als ''. */
function leesLesThemas(t: unknown, s: unknown): { themas: string[]; subthemas: string[] } {
  const themas: string[] = [];
  const subthemas: string[] = [];
  const subs = Array.isArray(s) ? s : [];
  (Array.isArray(t) ? t : []).forEach((x, i) => {
    if (typeof x !== 'string' || themas.includes(x)) return;
    themas.push(x);
    subthemas.push(typeof subs[i] === 'string' ? subs[i] : '');
  });
  return { themas, subthemas };
}

/** Thema's van een les met het subthema daarbinnen (null = niet ingedeeld). */
export function lesThemas(l: Les): LesThema[] {
  return l.themas.map((thema, i) => ({ thema, subthema: l.subthemas?.[i] || null }));
}

function leesLessen(v: unknown): LessenBestand {
  if (!isObj(v) || !Array.isArray(v.lessen)) return { bijgewerkt: null, lessen: [] };
  return {
    bijgewerkt: typeof v.bijgewerkt === 'string' ? v.bijgewerkt : null,
    lessen: (v.lessen as unknown[])
      .filter((l): l is Les => isObj(l) && typeof l.id === 'string' && typeof l.titel === 'string')
      .map((l) => ({
        ...l,
        fase: typeof l.fase === 'string' ? l.fase : '',
        ...leesLesThemas(l.themas, l.subthemas),
        tags: Array.isArray(l.tags) ? [...new Set(l.tags.filter((t): t is string => typeof t === 'string'))] : [],
        units: Array.isArray(l.units) ? l.units : [],
        bronnen: Array.isArray(l.bronnen) ? l.bronnen : [],
        markeringen: Array.isArray(l.markeringen) ? l.markeringen : [],
      })),
  };
}

const idLabel = (id: string) => {
  const s = id.replace(/-/g, ' ');
  return s ? s[0].toUpperCase() + s.slice(1) : s;
};

/** Leest themas.json; wat ontbreekt (bestand weg, of een id die er nog niet in staat) wordt
 *  aangevuld uit de lessen, zodat geen les onvindbaar wordt. */
function leesVocab(v: unknown, lessen: Les[]): ThemasBestand {
  type Item = Record<string, unknown> & { id: string; naam: string };
  const items = (lijst: unknown): Item[] =>
    Array.isArray(lijst) ? lijst.filter((x): x is Item => isObj(x) && typeof x.id === 'string' && typeof x.naam === 'string') : [];
  const volgorde = (x: Item, i: number) => (typeof x.volgorde === 'number' ? x.volgorde : i + 1);
  const omschrijving = (x: Item) => (typeof x.omschrijving === 'string' ? x.omschrijving : '');
  const themas: Thema[] = items(isObj(v) ? v.themas : null).map((t, i) => ({
    id: t.id, naam: t.naam, omschrijving: omschrijving(t), volgorde: volgorde(t, i),
    subthemas: items(t.subthemas).map((s, j) => ({ id: s.id, naam: s.naam, omschrijving: omschrijving(s), volgorde: volgorde(s, j) })),
  }));
  const fases: Fase[] = items(isObj(v) ? v.fases : null).map((f, i) => ({ id: f.id, naam: f.naam, volgorde: volgorde(f, i) }));
  const themaIndex = new Map(themas.map((t) => [t.id, t]));
  const faseIds = new Set(fases.map((f) => f.id));
  for (const l of lessen) {
    for (const { thema, subthema } of lesThemas(l)) {
      let t = themaIndex.get(thema);
      if (!t) {
        t = { id: thema, naam: idLabel(thema), omschrijving: '', volgorde: 1000 + themas.length, subthemas: [] };
        themas.push(t);
        themaIndex.set(thema, t);
      }
      if (subthema && !t.subthemas.some((s) => s.id === subthema)) {
        t.subthemas.push({ id: subthema, naam: idLabel(subthema), omschrijving: '', volgorde: 1000 + t.subthemas.length });
      }
    }
    if (l.fase && !faseIds.has(l.fase)) { faseIds.add(l.fase); fases.push({ id: l.fase, naam: idLabel(l.fase), volgorde: 1000 + fases.length }); }
  }
  themas.sort((a, b) => a.volgorde - b.volgorde);
  for (const t of themas) t.subthemas.sort((a, b) => a.volgorde - b.volgorde);
  fases.sort((a, b) => a.volgorde - b.volgorde);
  return { themas, fases };
}

/** Leest tags.json; tag-ids uit de lessen die er niet in staan worden aangevuld (label = id). */
function leesTags(v: unknown, lessen: Les[]): Tag[] {
  const ruw = isObj(v) && Array.isArray(v.tags) ? (v.tags as unknown[]) : [];
  const tags: Tag[] = ruw
    .filter((t): t is Record<string, unknown> & { id: string; label: string } => isObj(t) && typeof t.id === 'string' && typeof t.label === 'string')
    .map((t) => ({
      id: t.id,
      label: t.label,
      groep: typeof t.groep === 'string' ? t.groep : null,
      synonyms: Array.isArray(t.synonyms) ? t.synonyms.filter((s): s is string => typeof s === 'string') : [],
    }));
  const ids = new Set(tags.map((t) => t.id));
  for (const l of lessen) {
    for (const id of l.tags ?? []) if (!ids.has(id)) { ids.add(id); tags.push({ id, label: id.replace(/-/g, ' '), groep: null, synonyms: [] }); }
  }
  return tags;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Leest principes.json; alleen principes met geldige lessen blijven, lijsten verwijzen alleen naar
 *  principes die er zijn. */
function leesPrincipes(v: unknown, lessen: Les[]): PrincipesBestand {
  const leeg: PrincipesBestand = { bijgewerkt: null, principes: [], top10: [], debat: [], perThema: {}, perLeger: {} };
  if (!isObj(v) || !Array.isArray(v.principes)) return leeg;
  const lesIds = new Set(lessen.map((l) => l.id));
  const principes: Principe[] = (v.principes as unknown[])
    .filter((p): p is Record<string, unknown> & { id: string; titel: string } => isObj(p) && typeof p.id === 'string' && typeof p.titel === 'string')
    .map((p) => ({
      id: p.id,
      titel: p.titel,
      tekst: typeof p.tekst === 'string' ? p.tekst : '',
      soort: p.soort === 'debat' ? 'debat' as const : 'principe' as const,
      thema: typeof p.thema === 'string' ? p.thema : '',
      leger: typeof p.leger === 'string' ? p.leger : null,
      aantalLessen: typeof p.aantalLessen === 'number' ? p.aantalLessen : 0,
      aantalKanalen: typeof p.aantalKanalen === 'number' ? p.aantalKanalen : 0,
      kanalen: strings(p.kanalen),
      lessen: strings(p.lessen).filter((id) => lesIds.has(id)),
      kanten: Array.isArray(p.kanten)
        ? (p.kanten as unknown[]).filter(isObj).map((k) => ({
          standpunt: typeof k.standpunt === 'string' ? k.standpunt : '',
          aantalLessen: typeof k.aantalLessen === 'number' ? k.aantalLessen : 0,
          aantalKanalen: typeof k.aantalKanalen === 'number' ? k.aantalKanalen : 0,
          lessen: strings(k.lessen).filter((id) => lesIds.has(id)),
        }))
        : undefined,
    }))
    .filter((p) => p.lessen.length > 0);
  const ids = new Set(principes.map((p) => p.id));
  const lijst = (x: unknown) => strings(x).filter((id) => ids.has(id));
  const perSleutel = (x: unknown) => (isObj(x) ? Object.fromEntries(Object.entries(x).map(([k, l]) => [k, lijst(l)]).filter(([, l]) => l.length)) : {});
  return {
    bijgewerkt: typeof v.bijgewerkt === 'string' ? v.bijgewerkt : null,
    principes,
    top10: lijst(v.top10),
    debat: lijst(v.debat),
    perThema: perSleutel(v.perThema),
    perLeger: perSleutel(v.perLeger),
  };
}

/** Leest kernpunten.json; alleen kernpunten met minstens één bestaande les blijven. */
function leesKernpunten(v: unknown, lessen: Les[]): KernpuntenBestand {
  const leeg: KernpuntenBestand = { bijgewerkt: null, perSubthema: {} };
  if (!isObj(v) || !isObj(v.perSubthema)) return leeg;
  const lesIds = new Set(lessen.map((l) => l.id));
  const getal = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  const perSubthema: Record<string, Kernpunt[]> = {};
  for (const [sub, lijst] of Object.entries(v.perSubthema)) {
    if (!Array.isArray(lijst)) continue;
    const kp: Kernpunt[] = lijst
      .filter((k): k is Record<string, unknown> & { id: string; titel: string } => isObj(k) && typeof k.id === 'string' && typeof k.titel === 'string')
      .map((k) => ({
        id: k.id,
        titel: k.titel,
        tekst: typeof k.tekst === 'string' ? k.tekst : '',
        lessen: strings(k.lessen).filter((id) => lesIds.has(id)),
        nLessen: getal(k.nLessen),
        nKanalen: getal(k.nKanalen),
        kanalen: strings(k.kanalen),
        ...(typeof k.principeId === 'string' ? { principeId: k.principeId } : {}),
      }))
      .filter((k) => k.lessen.length > 0);
    if (kp.length) perSubthema[sub] = kp;
  }
  return { bijgewerkt: typeof v.bijgewerkt === 'string' ? v.bijgewerkt : null, perSubthema };
}

let cache: Promise<TacticsData> | null = null;

/** Haalt de bestanden één keer op. Mislukt bronnen.json (offline, ontbreekt), dan wordt de
 *  cache niet vastgehouden, zodat een volgende keer openen het opnieuw probeert. */
export function laadTactics(): Promise<TacticsData> {
  if (cache) return cache;
  const p = Promise.all([
    haalJson('tactics/bronnen.json'), haalJson('tactics/lessen.json'), haalJson('tactics/themas.json'), haalJson('tactics/tags.json'),
    haalJson('tactics/principes.json'), haalJson('tactics/kernpunten.json'),
  ])
    .then(([b, l, t, g, p, k]) => {
      const lessen = leesLessen(l);
      return {
        bronnen: leesBronnen(b), lessen, vocab: leesVocab(t, lessen.lessen), tags: leesTags(g, lessen.lessen),
        principes: leesPrincipes(p, lessen.lessen), kernpunten: leesKernpunten(k, lessen.lessen),
      };
    });
  cache = p;
  void p.then((d) => { if (!d.bronnen && cache === p) cache = null; });
  return p;
}

/** Seconden of "m:ss" als leesbaar tijdstip. */
export function tijdLabel(t: number | string | null | undefined): string | null {
  if (t == null || t === '') return null;
  if (typeof t === 'string') return t;
  if (!Number.isFinite(t) || t < 0) return null;
  const s = Math.floor(t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
