import { supabase } from './supabase';
import { getAuthSession } from './auth';
import type { DeelbareLijst, GedeeldeLijst } from './listShare';
import type { ListEntry } from './owbBuilder';

// HET LEGER VAN JE TEGENSTANDER BEKIJKEN — vanuit het battle-overzicht van de campagne.
//
// "Bij battle-overzicht kun je elkaars army zien. Maak ook een knop bij de army van de tegenstander
// om hem te bekijken in de Companion, met alle rules enzo, alsof je hem in de armybuilder hebt."
// (Joost, 31-10-2026)
//
// De campagne-site linkt naar `?tegenlijst=<battle-id>`. Dit bestand haalt de lijst op via
// `towc_battle_tegenlijst` en giet hem in dezelfde vorm als een GEDEELDE lijst (listShare), zodat
// ListBuilder hem door exact dezelfde molen haalt: dezelfde catalogus, dezelfde compositie-overlay,
// hetzelfde leesscherm. Geen eigen viewer, dus ook geen tweede plek waar punten anders kunnen uitkomen.
//
// DE HELE BEVEILIGING ZIT IN DE DATABASE. De RPC leest `auth.uid()`, laat alleen de twee generals aan
// tafel kijken en hanteert dezelfde onthullings-poort als de campagne-app (beide lijsten gelockt, en
// in de lopende Act pas na de beurtronde). Een battle-id in de URL geeft dus niets weg: wie hem van
// een ander overneemt krijgt NIET_IN_BATTLE. Dit bestand rekent niets uit en kent geen spelregels.

/** Wat de kijker extra weet over een tegenstanderslijst: van wie, en voor welke battle. */
export interface TegenInfo {
  battle: number;
  /** De Act van de battle. */
  fase: number;
  /** De naam van de general aan de overkant. */
  tegenstander: string;
  /** Wanneer zijn lijst gelockt werd (ISO), of ''. */
  gelocktOp: string;
}

/**
 * Een tegenstanderslijst IS een gedeelde lijst voor de viewer, plus de markering `tegen`.
 *
 * Bewust een uitbreiding en geen eigen type: alles in ListBuilder dat aan `gedeeld` hangt (welke
 * catalogus er laadt, welke overlay erop gaat, de terugknop) werkt dan zonder één extra regel. Alleen
 * de BAND bovenaan kijkt naar `tegen`. `code` is leeg — er is geen deelcode, en de band toont hem
 * in deze modus ook niet.
 */
export interface TegenLijst extends GedeeldeLijst {
  tegen: TegenInfo;
}

/** Is deze opgehaalde lijst het leger van je tegenstander (en niet een lijst met een deelcode)? */
export const isTegenLijst = (g: GedeeldeLijst | null | undefined): g is TegenLijst =>
  !!g && typeof (g as Partial<TegenLijst>).tegen === 'object' && (g as Partial<TegenLijst>).tegen !== null;

/** De foutcodes van de RPC, plus `VERBINDING` voor alles wat niet eens bij de server aankwam. */
export type TegenFoutCode = 'NIET_INGELOGD' | 'ONBEKENDE_BATTLE' | 'NIET_IN_BATTLE' | 'NOG_NIET_ONTHULD' | 'GEEN_LIJST' | 'VERBINDING' | 'ONLEESBAAR';

/** Een Error met de ruwe code erbij. ListBuilder heeft de code nodig om bij NIET_INGELOGD te blijven
 *  wachten op een sessie; de `message` is meteen toonbaar. */
export class TegenFout extends Error {
  code: TegenFoutCode;
  constructor(code: TegenFoutCode) {
    super(tegenFoutTekst(code));
    this.code = code;
  }
}

/** Waarom het leger niet getoond kan worden, in spelerstaal. */
export const tegenFoutTekst = (code: TegenFoutCode): string => {
  switch (code) {
    case 'NIET_INGELOGD': return "Sign in to view your opponent's army. Use your Isle of Celedon account on Settings; the army opens here as soon as you are signed in.";
    case 'ONBEKENDE_BATTLE': return 'This battle could not be found. It may have been removed from the campaign.';
    case 'NIET_IN_BATTLE': return 'You are not in this battle, so you cannot view this army.';
    case 'NOG_NIET_ONTHULD': return "Your opponent's army is revealed once both lists are locked and the Realm phase is over.";
    case 'GEEN_LIJST': return 'Your opponent has no locked list for this battle.';
    case 'ONLEESBAAR': return "Your opponent's army could not be read.";
    case 'VERBINDING':
    default: return "Could not load your opponent's army. Check your connection and try again.";
  }
};

const BEKENDE_CODES: TegenFoutCode[] = ['NIET_INGELOGD', 'ONBEKENDE_BATTLE', 'NIET_IN_BATTLE', 'NOG_NIET_ONTHULD', 'GEEN_LIJST'];

/**
 * Haal het leger van je tegenstander in één battle op. Gooit een `TegenFout`.
 *
 * ZONDER SESSIE NIET EENS AANROEPEN. De RPC is alleen aan `authenticated` gegrant (zie de migratie
 * 20261031b), dus een uitgelogde aanroep komt niet bij de `NIET_INGELOGD`-tak van de functie maar
 * strandt op "permission denied". Voor de speler is dat hetzelfde probleem, dus het krijgt hier ook
 * dezelfde code — en ListBuilder blijft dan wachten tot er wél een sessie is.
 */
export async function openTegenLijst(battleId: number): Promise<TegenLijst> {
  if (!Number.isInteger(battleId) || battleId <= 0) throw new TegenFout('ONBEKENDE_BATTLE');
  if (!getAuthSession()) throw new TegenFout('NIET_INGELOGD');
  let antw: Record<string, unknown> | null;
  try {
    const { data, error } = await supabase.rpc('towc_battle_tegenlijst', { p_battle: battleId });
    if (error) {
      // 42501 = permission denied: de sessie is verlopen of nooit goed aangekomen.
      if ((error as { code?: string }).code === '42501') throw new TegenFout('NIET_INGELOGD');
      throw error;
    }
    antw = (data && typeof data === 'object' ? data : null) as Record<string, unknown> | null;
  } catch (e) {
    if (e instanceof TegenFout) throw e;
    console.warn('[tegenlijst]', e);
    throw new TegenFout('VERBINDING');
  }
  if (!antw) throw new TegenFout('ONLEESBAAR');
  if (antw.ok !== true) {
    const f = String(antw.fout ?? '') as TegenFoutCode;
    throw new TegenFout(BEKENDE_CODES.includes(f) ? f : 'ONLEESBAAR');
  }
  const l = antw.lijst as Partial<DeelbareLijst> | null | undefined;
  if (!l || typeof l !== 'object' || !Array.isArray(l.entries) || !l.army) throw new TegenFout('ONLEESBAAR');

  const tegenstander = typeof antw.tegenstander === 'string' && antw.tegenstander.trim() ? antw.tegenstander.trim() : 'Your opponent';
  const gelocktOp = typeof antw.gelocktOp === 'string' ? antw.gelocktOp : '';
  // Alleen de velden die de viewer nodig heeft — dezelfde vorm als `schoneKopie` in listShare. Wat
  // de server eventueel nog meer meestuurt, komt dit apparaat niet binnen.
  const lijst: DeelbareLijst = {
    id: l.id ?? `battle-${battleId}`,
    name: l.name ?? `${tegenstander}'s army`,
    army: l.army,
    composition: l.composition ?? l.army,
    rule: l.rule ?? 'open-war',
    points: Number(l.points ?? 0),
    entries: l.entries as ListEntry[],
  };
  return {
    code: '',
    naam: lijst.name,
    leger: lijst.army,
    lijst,
    gedeeldOp: gelocktOp,
    bijgewerktOp: gelocktOp,
    tegen: {
      battle: Number(antw.battle ?? battleId),
      fase: Number(antw.fase ?? 0),
      tegenstander,
      gelocktOp,
    },
  };
}

/**
 * Lees `?tegenlijst=<battle-id>` uit de URL en HAAL DE PARAMETER ER METEEN UIT.
 *
 * Exact het twee-afnemers-patroon van `gedeeldeCodeUitUrl` in listShare: AppShell leest om naar de
 * Army-tab te springen, ListBuilder VERBRUIKT (`neemTegenLijst`) om de lijst op te halen. Wie als
 * eerste kijkt wist de parameter uit de adresbalk; dit geheugen zorgt dat de tweede niet met lege
 * handen staat, wat de volgorde van de effecten ook is. Roep dus aan beide kanten deze functie aan,
 * niet `searchParams.get('tegenlijst')`.
 */
let gevondenBattle: number | null = null;
export function tegenLijstUitUrl(): number | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const raw = url.searchParams.get('tegenlijst');
  if (raw === null) return gevondenBattle;
  url.searchParams.delete('tegenlijst');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  const n = Number((raw || '').trim());
  gevondenBattle = Number.isInteger(n) && n > 0 ? n : null;
  return gevondenBattle;
}

/** Zoals hierboven, maar VERBRUIKEND: een tweede aanroep levert niets meer (ListBuilder mount bij
 *  elke tabwissel opnieuw, en anders klapte hetzelfde leger bij elke terugkeer naar Army weer open). */
export function neemTegenLijst(): number | null {
  const id = tegenLijstUitUrl();
  gevondenBattle = null;
  return id;
}

/**
 * WACHTEN OP INLOGGEN. Kwam de link binnen zonder sessie, dan onthouden we het battle-id hier — in
 * het geheugen van deze module, niet in opslag. Zo overleeft hij dat ListBuilder unmount terwijl de
 * speler naar Settings gaat om in te loggen: bij terugkeer op Army (of meteen, als de sessie arriveert
 * terwijl Army openstaat) wordt het leger alsnog opgehaald. Een herlaadbeurt vergeet hem; dan opent
 * de knop op de campagne-site hem gewoon opnieuw.
 */
let wachtOpInlog: number | null = null;
export const onthoudTotInlog = (battleId: number): void => { wachtOpInlog = battleId; };
export const wachtendeTegenLijst = (): number | null => wachtOpInlog;
export const vergeetWachtendeTegenLijst = (): void => { wachtOpInlog = null; };
