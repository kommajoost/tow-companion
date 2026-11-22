// Tactiekdatabank (zie docs/tactics/ontwerp.md). Twee vaste bestanden in public/tactics/, gemaakt
// door de verzamelroutine op Joosts pc: bronnen.json (kanalen + losse video's/artikelen) en
// lessen.json (de lessen zelf, elk met bron). Deze module typt ze en haalt ze één keer op.

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
  /** 1 = eerste ronde (algemene tactiek), 2 = Dark Elves-ronde, null = nog niet gepland. */
  ronde: 1 | 2 | null;
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

export type LesOnderwerp =
  | 'deployment' | 'movement' | 'charging' | 'shooting' | 'combat' | 'magic'
  | 'list-building' | 'scenarios' | 'characters' | 'psychology' | 'chaff';

export const LES_ONDERWERPEN: LesOnderwerp[] = [
  'deployment', 'movement', 'charging', 'shooting', 'combat', 'magic',
  'list-building', 'scenarios', 'characters', 'psychology', 'chaff',
];

export interface LesBron {
  bronId: string;
  /** Link met tijdstip (&t=123s). */
  url: string;
  /** Seconden, of een tekst als "12:34". */
  tijd?: number | string | null;
  /** Hooguit 15 woorden, om na te kijken. */
  citaat: string;
}

export interface LesMarkering {
  soort: 'verouderd' | 'renegade-afwijking' | 'regel-afwijking';
  tekst: string;
}

export interface Les {
  id: string;
  titel: string;
  tekst: string;
  onderwerp: LesOnderwerp;
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

export interface TacticsData {
  /** null = bronnen.json ontbreekt of is onleesbaar. */
  bronnen: BronnenBestand | null;
  /** Ontbreekt lessen.json, dan een lege lijst: dat is gewoon "nog geen lessen". */
  lessen: LessenBestand;
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

function leesLessen(v: unknown): LessenBestand {
  if (!isObj(v) || !Array.isArray(v.lessen)) return { bijgewerkt: null, lessen: [] };
  return {
    bijgewerkt: typeof v.bijgewerkt === 'string' ? v.bijgewerkt : null,
    lessen: (v.lessen as unknown[])
      .filter((l): l is Les => isObj(l) && typeof l.id === 'string' && typeof l.titel === 'string')
      .map((l) => ({
        ...l,
        units: Array.isArray(l.units) ? l.units : [],
        bronnen: Array.isArray(l.bronnen) ? l.bronnen : [],
        markeringen: Array.isArray(l.markeringen) ? l.markeringen : [],
      })),
  };
}

let cache: Promise<TacticsData> | null = null;

/** Haalt beide bestanden één keer op. Mislukt bronnen.json (offline, ontbreekt), dan wordt de
 *  cache niet vastgehouden, zodat een volgende keer openen het opnieuw probeert. */
export function laadTactics(): Promise<TacticsData> {
  if (cache) return cache;
  const p = Promise.all([haalJson('tactics/bronnen.json'), haalJson('tactics/lessen.json')])
    .then(([b, l]) => ({ bronnen: leesBronnen(b), lessen: leesLessen(l) }));
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
