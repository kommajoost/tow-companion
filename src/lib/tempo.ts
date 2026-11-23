/**
 * DE TEMPOMETER VAN EEN 2-TEGEN-2-TAFEL (Act 4, blok E, 24-11-2026).
 *
 * Joosts overdracht "2v2-slagen sneller spelen": een richttijd per TEAMbeurt van 20, 20, 15, 15, 10 en
 * 10 minuten voor ronde 1-6 (90 minuten per kant, 180 per slag). De avond loopt van 19:30 tot 22:30;
 * na 22:15 begint er geen nieuwe ronde meer (de lopende ronde wordt afgemaakt). De tijden zijn per
 * battle night in te stellen (`instelling`).
 *
 * De stand staat op de gedeelde tracker (`tracker.tempo`), dus alle vier de telefoons zien hetzelfde.
 * Elke wijziging gaat als compare-and-set op `rev` naar de server (tow_game_tracker_patch): tikken
 * twee spelers tegelijk op "Turn done", dan wint de eerste en ziet de tweede dat de beurt al voorbij is.
 *
 * PUUR: geen React, geen fetch, geen Date.now() binnen de reducer (de tijd komt als argument mee), zodat
 * scripts/tests/tempo.test.cjs hem los kan draaien.
 *
 * Teams: 'A' = Wardens (stoelen host/host2), 'B' = Unchained (guest/guest2). Zie lib/teams.ts.
 */
import type { Team } from './teams';

export type EindReden = 'zes-rondes' | 'eindtijd' | 'anders';
export type PleinHouder = Team | null;

export interface TempoInstelling {
  /** 'HH:MM', lokale tijd. */
  avondStart: string;
  avondEind: string;
  /** Na dit tijdstip begint er geen nieuwe ronde meer. */
  laatsteRonde: string;
  /** Richttijd per teambeurt in minuten, per ronde (index 0 = ronde 1). */
  richt: number[];
}

/** Eén afgesloten teambeurt. Tijden als ISO-tekst (de tracker is JSON). */
export interface TempoBeurt {
  ronde: number;
  team: Team;
  start: string;
  eind: string;
  /** Speelduur zonder pauzes, in ms. */
  duurMs: number;
  pauzeMs: number;
  /** Wie had het plein aan het eind van deze spelerbeurt (Wardens, Unchained of niemand). */
  plein: PleinHouder;
  /** Raiders (campagne-speler-id) van wie het team het plein had en die een unit van Unit Strength
   *  10 of meer op het plein hadden. Telt zijn beurten voor de uitslag (contract 2). */
  raiders: string[];
}

export interface TempoHuidig {
  ronde: number;
  team: Team;
  start: string;
  pauzeMs: number;
  pauzeSinds: string | null;
}

export interface TempoEinde {
  tijd: string;
  reden: EindReden;
}

export interface TempoStand {
  /** Versie voor de compare-and-set. Elke wijziging +1. */
  rev: number;
  instelling: TempoInstelling;
  /** De werkelijke starttijd van deze tafel (Start battle). */
  start: string | null;
  /** Wie na de roll-off de eerste beurt neemt. */
  eersteTeam: Team | null;
  beurten: TempoBeurt[];
  huidig: TempoHuidig | null;
  einde: TempoEinde | null;
  /** Wie het artefact NU controleert, als dat tijdens de battle verandert (de regel: de nieuwe
   *  controleur gooit). undefined = nog de houder van de campagne; null = niemand. */
  artefactBij?: Team | null;
  /** Vorige standen voor Undo (zonder hun eigen `vorige`), hoogstens UNDO_DIEPTE. */
  vorige?: Omit<TempoStand, 'vorige'>[];
}

export const STANDAARD_INSTELLING: TempoInstelling = {
  avondStart: '19:30',
  avondEind: '22:30',
  laatsteRonde: '22:15',
  richt: [20, 20, 15, 15, 10, 10],
};

export const MAX_RONDES = 6;
const UNDO_DIEPTE = 6;
const MIN = 60_000;

export const leegTempo = (instelling: TempoInstelling = STANDAARD_INSTELLING): TempoStand => ({
  rev: 0, instelling, start: null, eersteTeam: null, beurten: [], huidig: null, einde: null,
});

export const anderTeam = (t: Team): Team => (t === 'A' ? 'B' : 'A');

const isTijd = (v: unknown): v is string => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v);
const isTeam = (v: unknown): v is Team => v === 'A' || v === 'B';
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const getal = (v: unknown, terug = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : terug);

function leesInstelling(v: unknown): TempoInstelling {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const richt = Array.isArray(o.richt) && o.richt.length === MAX_RONDES && o.richt.every((x) => typeof x === 'number' && x > 0 && x <= 120)
    ? (o.richt as number[]) : STANDAARD_INSTELLING.richt;
  return {
    avondStart: isTijd(o.avondStart) ? o.avondStart : STANDAARD_INSTELLING.avondStart,
    avondEind: isTijd(o.avondEind) ? o.avondEind : STANDAARD_INSTELLING.avondEind,
    laatsteRonde: isTijd(o.laatsteRonde) ? o.laatsteRonde : STANDAARD_INSTELLING.laatsteRonde,
    richt,
  };
}

function leesBeurt(v: unknown): TempoBeurt | null {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  if (!o || !isTeam(o.team) || !isIso(o.start) || !isIso(o.eind)) return null;
  return {
    ronde: Math.max(1, Math.round(getal(o.ronde, 1))),
    team: o.team,
    start: o.start,
    eind: o.eind,
    duurMs: Math.max(0, getal(o.duurMs)),
    pauzeMs: Math.max(0, getal(o.pauzeMs)),
    plein: isTeam(o.plein) ? o.plein : null,
    raiders: Array.isArray(o.raiders) ? o.raiders.filter((x): x is string => typeof x === 'string') : [],
  };
}

/** De tempo-stand van de tracker, defensief gelezen. null = er is nog geen tempometer (oude tracker). */
export function leesTempo(v: unknown): TempoStand | null {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  if (!o) return null;
  const h = o.huidig && typeof o.huidig === 'object' ? (o.huidig as Record<string, unknown>) : null;
  const e = o.einde && typeof o.einde === 'object' ? (o.einde as Record<string, unknown>) : null;
  const stand: TempoStand = {
    rev: Math.max(0, Math.round(getal(o.rev))),
    instelling: leesInstelling(o.instelling),
    start: isIso(o.start) ? o.start : null,
    eersteTeam: isTeam(o.eersteTeam) ? o.eersteTeam : null,
    beurten: (Array.isArray(o.beurten) ? o.beurten : []).map(leesBeurt).filter((b): b is TempoBeurt => !!b),
    huidig: h && isTeam(h.team) && isIso(h.start)
      ? { ronde: Math.max(1, Math.round(getal(h.ronde, 1))), team: h.team, start: h.start, pauzeMs: Math.max(0, getal(h.pauzeMs)), pauzeSinds: isIso(h.pauzeSinds) ? h.pauzeSinds : null }
      : null,
    einde: e && isIso(e.tijd) ? { tijd: e.tijd, reden: e.reden === 'zes-rondes' || e.reden === 'eindtijd' ? e.reden : 'anders' } : null,
  };
  if (o.artefactBij === null || isTeam(o.artefactBij)) stand.artefactBij = o.artefactBij as Team | null;
  if (Array.isArray(o.vorige)) stand.vorige = (o.vorige as unknown[]).map((x) => leesTempo(x)).filter((x): x is TempoStand => !!x).map(zonderVorige).slice(-UNDO_DIEPTE);
  return stand;
}

function zonderVorige(t: TempoStand): Omit<TempoStand, 'vorige'> {
  const { vorige: _v, ...rest } = t;
  void _v;
  return rest;
}

/** 'HH:MM' op de kalenderdag van `basis` (lokale tijd), in ms. Valt de tijd vóór 12:00 terwijl de avond
 *  om 19:30 begon, dan is het de volgende dag (een avond die over middernacht loopt). */
export function tijdOpDag(hhmm: string, basis: number, avondStart = STANDAARD_INSTELLING.avondStart): number {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  const d = new Date(basis);
  const [sh] = avondStart.split(':').map((x) => parseInt(x, 10));
  // De avond hoort bij de dag waarop hij begon: ligt `basis` na middernacht maar vóór de middag, dan is
  // de avond gisteren begonnen.
  if (d.getHours() < 12 && sh >= 12) d.setDate(d.getDate() - 1);
  d.setHours(h, m, 0, 0);
  if (h < 12 && sh >= 12) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export const richtMs = (inst: TempoInstelling, ronde: number): number =>
  (inst.richt[Math.min(MAX_RONDES, Math.max(1, ronde)) - 1] ?? 10) * MIN;

/** Hoe lang de huidige beurt al loopt, zonder pauzes, op tijdstip `nu`. */
export function verstrekenMs(h: TempoHuidig, nu: number): number {
  const lopendePauze = h.pauzeSinds ? Math.max(0, nu - Date.parse(h.pauzeSinds)) : 0;
  return Math.max(0, nu - Date.parse(h.start) - h.pauzeMs - lopendePauze);
}

// ── Acties ──────────────────────────────────────────────────────────────────────────────────────

export type TempoActie =
  | { soort: 'start'; eersteTeam: Team }
  | { soort: 'eersteTeam'; eersteTeam: Team }
  /** `verwacht` = de beurt die de speler zag toen hij tikte. Is die al voorbij (iemand anders was
   *  sneller), dan gebeurt er niets: zo telt een dubbele tik nooit twee beurten. */
  | { soort: 'beurtKlaar'; verwacht: { ronde: number; team: Team }; plein: PleinHouder; raiders: string[] }
  | { soort: 'pauze' }
  | { soort: 'hervat' }
  | { soort: 'einde'; reden: EindReden }
  | { soort: 'heropen' }
  | { soort: 'instelling'; instelling: TempoInstelling }
  | { soort: 'artefactBij'; team: Team | null }
  | { soort: 'undo' };

/** Mag er na deze ronde nog een nieuwe beginnen, op tijdstip `nu`? */
export function nieuweRondeMag(t: TempoStand, nu: number): boolean {
  const basis = t.start ? Date.parse(t.start) : nu;
  return nu <= tijdOpDag(t.instelling.laatsteRonde, basis, t.instelling.avondStart);
}

/**
 * Pas één actie toe. Geeft de NIEUWE stand (rev + 1, met de oude in `vorige` voor Undo), of null als de
 * actie niet (meer) geldt: een beurt die al afgesloten is, pauze terwijl er al gepauzeerd wordt, enz.
 * `nu` in ms.
 */
export function pasToe(t: TempoStand, a: TempoActie, nu: number): TempoStand | null {
  const iso = new Date(nu).toISOString();
  const basis = zonderVorige(t);
  const metUndo = (n: Omit<TempoStand, 'vorige'>): TempoStand => ({
    ...n,
    rev: t.rev + 1,
    vorige: [...(t.vorige ?? []), basis].slice(-UNDO_DIEPTE),
  });

  switch (a.soort) {
    case 'start': {
      if (t.start) return null;
      return metUndo({ ...basis, start: iso, eersteTeam: a.eersteTeam, huidig: { ronde: 1, team: a.eersteTeam, start: iso, pauzeMs: 0, pauzeSinds: null }, einde: null });
    }
    case 'eersteTeam': {
      // Alleen zolang ronde 1 nog bij de eerste beurt staat (vergissing bij de roll-off herstellen).
      if (!t.huidig || t.beurten.length > 0 || t.eersteTeam === a.eersteTeam) return null;
      return metUndo({ ...basis, eersteTeam: a.eersteTeam, huidig: { ...t.huidig, team: a.eersteTeam } });
    }
    case 'beurtKlaar': {
      const h = t.huidig;
      if (!h || t.einde || h.ronde !== a.verwacht.ronde || h.team !== a.verwacht.team) return null;
      const pauzeMs = h.pauzeMs + (h.pauzeSinds ? Math.max(0, nu - Date.parse(h.pauzeSinds)) : 0);
      const beurt: TempoBeurt = {
        ronde: h.ronde, team: h.team, start: h.start, eind: iso,
        duurMs: Math.max(0, nu - Date.parse(h.start) - pauzeMs), pauzeMs,
        plein: a.plein,
        raiders: a.plein ? a.raiders : [],
      };
      const eerste = t.eersteTeam ?? h.team;
      const rondeKlaar = h.team !== eerste;
      let huidig: TempoHuidig | null;
      let einde: TempoEinde | null = null;
      if (!rondeKlaar) {
        huidig = { ronde: h.ronde, team: anderTeam(h.team), start: iso, pauzeMs: 0, pauzeSinds: null };
      } else if (h.ronde >= MAX_RONDES) {
        huidig = null;
        einde = { tijd: iso, reden: 'zes-rondes' };
      } else if (!nieuweRondeMag(t, nu)) {
        // Na 22:15 begint geen nieuwe ronde: de slag is op tijd voorbij.
        huidig = null;
        einde = { tijd: iso, reden: 'eindtijd' };
      } else {
        huidig = { ronde: h.ronde + 1, team: eerste, start: iso, pauzeMs: 0, pauzeSinds: null };
      }
      return metUndo({ ...basis, beurten: [...t.beurten, beurt], huidig, einde });
    }
    case 'pauze': {
      if (!t.huidig || t.huidig.pauzeSinds) return null;
      return metUndo({ ...basis, huidig: { ...t.huidig, pauzeSinds: iso } });
    }
    case 'hervat': {
      const h = t.huidig;
      if (!h || !h.pauzeSinds) return null;
      return metUndo({ ...basis, huidig: { ...h, pauzeMs: h.pauzeMs + Math.max(0, nu - Date.parse(h.pauzeSinds)), pauzeSinds: null } });
    }
    case 'einde': {
      if (t.einde) return null;
      return metUndo({ ...basis, einde: { tijd: iso, reden: a.reden } });
    }
    case 'heropen': {
      if (!t.einde) return null;
      return metUndo({ ...basis, einde: null });
    }
    case 'instelling':
      return metUndo({ ...basis, instelling: leesInstelling(a.instelling) });
    case 'artefactBij':
      if (t.artefactBij === a.team) return null;
      return metUndo({ ...basis, artefactBij: a.team });
    case 'undo': {
      const v = t.vorige ?? [];
      if (!v.length) return null;
      const terug = v[v.length - 1];
      return { ...terug, rev: t.rev + 1, vorige: v.slice(0, -1) };
    }
  }
}

/** Welk plein-vinkje een overgang toevoegt of weghaalt (voor de gedeelde plein-teller): +1 voor het team
 *  van een nieuw afgesloten beurt met plein, -1 als Undo zo'n beurt terugdraait. */
export function pleinDelta(oud: TempoStand, nieuw: TempoStand): { A: number; B: number } {
  const tel = (bs: TempoBeurt[]) => ({
    A: bs.filter((b) => b.plein === 'A').length,
    B: bs.filter((b) => b.plein === 'B').length,
  });
  const o = tel(oud.beurten);
  const n = tel(nieuw.beurten);
  return { A: n.A - o.A, B: n.B - o.B };
}

// ── Afgeleide weergave ──────────────────────────────────────────────────────────────────────────

export type SchemaKleur = 'groen' | 'oranje' | 'rood';

export interface TempoBeeld {
  gestart: boolean;
  klaar: boolean;
  ronde: number;
  team: Team | null;
  gepauzeerd: boolean;
  /** Resterende richttijd van de huidige beurt (negatief = over tijd), ms. */
  restMs: number;
  richtMs: number;
  /** Achterstand op het schema (wandklok, pauzes tellen mee: de avond loopt door), ms; negatief = voor. */
  achterstandMs: number;
  kleur: SchemaKleur;
  /** Tempofactor: werkelijke duur / richttijd over de afgesloten beurten (1 zonder gegevens). */
  factor: number;
  /** Verwachte eindtijd op dit tempo (ms), of null zonder start. */
  verwachtEind: number | null;
  /** Tot en met welke ronde het op dit tempo haalbaar is (een ronde die vóór de laatste-rondetijd
   *  begint wordt afgemaakt). */
  haalbaarTot: number;
  /** Na de laatste-rondetijd: dit is de laatste ronde. */
  laatsteRonde: boolean;
  /** Het officiële avondeinde in ms (voor in beeld). */
  avondEind: number;
}

export const kleurVoor = (achterstandMs: number): SchemaKleur =>
  achterstandMs <= 3 * MIN ? 'groen' : achterstandMs <= 10 * MIN ? 'oranje' : 'rood';

export function tempoBeeld(t: TempoStand | null, nu: number): TempoBeeld {
  const inst = t?.instelling ?? STANDAARD_INSTELLING;
  const basis = t?.start ? Date.parse(t.start) : nu;
  const avondEind = tijdOpDag(inst.avondEind, basis, inst.avondStart);
  const laatste = tijdOpDag(inst.laatsteRonde, basis, inst.avondStart);
  if (!t || !t.start) {
    // Nog niet begonnen: hoe ver komen we als we NU beginnen?
    let tijd = nu;
    let haalbaar = 0;
    for (let r = 1; r <= MAX_RONDES; r++) {
      if (r > 1 && tijd > laatste) break;
      tijd += 2 * richtMs(inst, r);
      haalbaar = r;
    }
    return { gestart: false, klaar: false, ronde: 1, team: null, gepauzeerd: false, restMs: richtMs(inst, 1), richtMs: richtMs(inst, 1), achterstandMs: 0, kleur: 'groen', factor: 1, verwachtEind: tijd, haalbaarTot: haalbaar, laatsteRonde: nu > laatste, avondEind };
  }
  const h = t.huidig;
  const geplandAf = t.beurten.reduce((s, b) => s + richtMs(inst, b.ronde), 0);
  const werkelijkAf = t.beurten.reduce((s, b) => s + b.duurMs, 0);
  const factor = geplandAf > 0 ? Math.max(0.5, Math.min(2.5, werkelijkAf / geplandAf)) : 1;
  const start = Date.parse(t.start);

  if (!h || t.einde) {
    const eind = t.einde ? Date.parse(t.einde.tijd) : nu;
    const laatsteBeurt = t.beurten[t.beurten.length - 1];
    return {
      gestart: true, klaar: true, ronde: laatsteBeurt?.ronde ?? 1, team: null, gepauzeerd: false,
      restMs: 0, richtMs: 0, achterstandMs: (eind - start) - geplandAf, kleur: kleurVoor((eind - start) - geplandAf),
      factor, verwachtEind: eind, haalbaarTot: laatsteBeurt?.ronde ?? 0, laatsteRonde: false, avondEind,
    };
  }

  const verstreken = verstrekenMs(h, nu);
  const richt = richtMs(inst, h.ronde);
  // Het schema loopt op de wandklok: start + richttijden van de afgesloten beurten + (zover) deze beurt.
  const gepland = geplandAf + Math.min(verstreken, richt);
  const achterstand = (nu - start) - gepland;
  // De rest van de slag op dit tempo: wat er van deze beurt nog over is, de tweede beurt van deze ronde
  // (als die nog moet), en dan ronde voor ronde zolang die vóór de laatste-rondetijd begint.
  const eerste = t.eersteTeam ?? h.team;
  let tijd = nu + Math.max(0, richt - verstreken) * factor;
  if (h.team === eerste) tijd += richt * factor;
  let haalbaar = h.ronde;
  for (let r = h.ronde + 1; r <= MAX_RONDES; r++) {
    if (tijd > laatste) break;
    tijd += 2 * richtMs(inst, r) * factor;
    haalbaar = r;
  }
  return {
    gestart: true, klaar: false, ronde: h.ronde, team: h.team, gepauzeerd: !!h.pauzeSinds,
    restMs: richt - verstreken, richtMs: richt, achterstandMs: achterstand, kleur: kleurVoor(achterstand),
    factor, verwachtEind: tijd, haalbaarTot: haalbaar, laatsteRonde: nu > laatste, avondEind,
  };
}

/** mm:ss (negatief met een min-teken), voor de klok. */
export function klok(ms: number): string {
  const neg = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  return `${neg ? '-' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** HH:MM in lokale tijd. */
export function uurMin(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Het tempo-logboek zoals het naar de campagne gaat (contract 2, `tempo`): per beurt ronde, team, start,
 *  eind, duur en pauzetijd, en per slag de start, het einde, het aantal gespeelde rondes en de reden. */
export function tempoLogboek(t: TempoStand | null): Record<string, unknown> | null {
  if (!t) return null;
  const rondes = t.beurten.length ? Math.max(...t.beurten.map((b) => b.ronde)) : 0;
  return {
    instelling: t.instelling,
    start: t.start,
    eind: t.einde?.tijd ?? null,
    eindReden: t.einde?.reden ?? null,
    eersteTeam: t.eersteTeam === 'A' ? 'wardens' : t.eersteTeam === 'B' ? 'unchained' : null,
    rondes,
    beurten: t.beurten.map((b) => ({
      ronde: b.ronde,
      team: b.team === 'A' ? 'wardens' : 'unchained',
      start: b.start,
      eind: b.eind,
      duurMin: Math.round(b.duurMs / 6000) / 10,
      pauzeMin: Math.round(b.pauzeMs / 6000) / 10,
      richtMin: t.instelling.richt[b.ronde - 1] ?? null,
      plein: b.plein === 'A' ? 'wardens' : b.plein === 'B' ? 'unchained' : null,
      raiders: b.raiders,
    })),
  };
}

/** Hoeveel rondes er gespeeld zijn (een ronde telt als hij begonnen is). */
export function gespeeldeRondes(t: TempoStand | null): number {
  if (!t) return 0;
  const uitLog = t.beurten.length ? Math.max(...t.beurten.map((b) => b.ronde)) : 0;
  return Math.max(uitLog, t.huidig?.ronde ?? 0);
}

/** Per raider het aantal spelerbeurten met het plein (contract 2: `raiders[id].beurten`, 0..12). */
export function raiderBeurten(t: TempoStand | null, raiderId: string): number {
  if (!t) return 0;
  return Math.min(12, t.beurten.filter((b) => b.raiders.includes(raiderId)).length);
}
