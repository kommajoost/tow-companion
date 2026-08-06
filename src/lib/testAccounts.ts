// Testaccount-switcher — Joost speelt de campagne met zichzelf als meerdere spelers.
//
// De campagne-app (Isle of Celedon) heeft exact hetzelfde: een handjevol ECHTE Supabase-accounts
// (gmail-plus-aliassen) waartussen je met één tik wisselt, zodat je per speler een leger kunt bouwen
// en battles kunt spelen. Wisselen is hier geen impersonatie-truc maar een échte uit- en inlog:
// signOut → signInWithPassword. Er is dus niets te "escaleren" — je logt in met een wachtwoord dat
// je zelf hebt ingevoerd.
//
// De wachtwoorden staan LEESBAAR in localStorage (`tow-testaccounts`). Dat is bewust en wordt in de
// UI ook zo gezegd: het is alleen bedoeld voor wegwerp-testaccounts, nooit voor een account van een
// echte speler.
//
// Waarom hier ook lijst-/campagne-staat wordt gewist: OWC hangt de army lists aan het account (de
// sync-sleutel is uit het user-id afgeleid) en cachet de campagne-context lokaal. Zonder opruimen zou
// het nieuwe account de lijsten van het vorige zien — of erger, ze naar zijn eigen cloud-rij pushen.

import { useMemo } from 'react';
import { supabase } from './supabase';
import { accountSyncKey, pushLists } from './listSync';
import { getPersisted, setPersisted, usePersistentState } from '../store';

/** localStorage-sleutel. Bewust zonder `tow:`-prefix: zelfde naam als in de campagne-app. */
export const TEST_ACCOUNTS_KEY = 'tow-testaccounts';

export interface TestAccount {
  /** Korte naam die je in de switcher ziet ("Speler 2", "Joost"). */
  label: string;
  email: string;
  password: string;
  /** True = dit is je EIGEN account, geen testaccount. Dan verschijnt de amber "Testing as"-chip niet. */
  eigen?: boolean;
}

// ---- Opslag -------------------------------------------------------------------------------------

const tekst = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Maak van willekeurige localStorage-inhoud een bruikbare lijst; rommel valt eruit. */
function normaliseer(raw: unknown): TestAccount[] {
  if (!Array.isArray(raw)) return [];
  const uit: TestAccount[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const email = tekst(o.email).trim();
    if (!email) continue;
    uit.push({
      label: tekst(o.label).trim() || email,
      email,
      password: tekst(o.password),
      ...(o.eigen === true ? { eigen: true as const } : {}),
    });
  }
  return uit;
}

/** Non-React lees van de geconfigureerde testaccounts. */
export function leesTestAccounts(): TestAccount[] {
  return normaliseer(getPersisted<unknown>(TEST_ACCOUNTS_KEY, []));
}

/** Schrijf de hele lijst weg (elke consument in dit tabblad ververst mee). */
export function schrijfTestAccounts(lijst: TestAccount[]): void {
  setPersisted<TestAccount[]>(TEST_ACCOUNTS_KEY, normaliseer(lijst));
}

/** React-hook: de geconfigureerde testaccounts, live. */
export function useTestAccounts(): TestAccount[] {
  const [raw] = usePersistentState<unknown>(TEST_ACCOUNTS_KEY, []);
  return useMemo(() => normaliseer(raw), [raw]);
}

const zelfdeMail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Voeg een account toe (of werk het bij als dat e-mailadres er al staat). */
export function voegTestAccountToe(acc: TestAccount): { error: string | null } {
  const email = acc.email.trim();
  if (!email.includes('@')) return { error: 'That doesn’t look like an email address.' };
  if (!acc.password) return { error: 'A password is required — the switch signs in for real.' };
  const lijst = leesTestAccounts();
  const idx = lijst.findIndex((a) => zelfdeMail(a.email, email));
  const rij: TestAccount = { label: acc.label.trim() || email, email, password: acc.password, ...(acc.eigen ? { eigen: true as const } : {}) };
  if (idx >= 0) lijst[idx] = rij;
  else lijst.push(rij);
  schrijfTestAccounts(lijst);
  return { error: null };
}

/** Verwijder een account op e-mailadres. */
export function verwijderTestAccount(email: string): void {
  schrijfTestAccounts(leesTestAccounts().filter((a) => !zelfdeMail(a.email, email)));
}

/** Het geconfigureerde account dat bij dit e-mailadres hoort (of null). */
export function vindTestAccount(email: string | null | undefined): TestAccount | null {
  if (!email) return null;
  return leesTestAccounts().find((a) => zelfdeMail(a.email, email)) ?? null;
}

/** De drie campagne-testaccounts van Joost, zoals de campagne-app ze ook aanmaakt. */
export const STANDAARD_TESTACCOUNTS: TestAccount[] = [1, 2, 3].map((n) => ({
  label: `Test ${n}`,
  email: `joostvanrooijen+test${n}@gmail.com`,
  password: `celedon-test-${n}`,
}));

// ---- Wisselen -----------------------------------------------------------------------------------

// Zolang dit aan staat mag de lijst-sync NIETS doen: tijdens een wissel is de lokale lijst-staat
// even van het ene account en de sleutel al van het andere. Zonder deze grendel kon de debounced
// auto-push een lege lijst over de cloud van het vertrekkende account heen schrijven, of de
// pull-tak de lijsten van het vórige account als "seed" naar de verse rij van het nieuwe duwen.
let bezig = false;

/** True zolang er een accountwissel loopt (listSync leest dit). */
export const testSwitchBezig = (): boolean => bezig;

/** Korte, vriendelijke tekst bij een mislukte inlog. */
function meldingVoor(message: string | undefined): string {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password for that test account.';
  if (m.includes('email not confirmed')) return 'That account still needs its email confirmed.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts — wait a moment and try again.';
  if (m.includes('network') || m.includes('failed to fetch')) return 'Network error — check your connection.';
  return message || 'Could not sign in to that account.';
}

/** Uitkomst van een wissel. `herladenNodig` = ingelogd, maar de pagina wilde niet herladen; de UI
 *  vraagt dan om één klik zodat de lijsten en de campagne-koppeling schoon opkomen. */
export interface WisselResultaat { error: string | null; herladenNodig?: boolean }

/** Herlaad de app. `reload()` alleen was niet genoeg: in een ingebedde webview (en tijdens een nog
 *  lopende resource-load) wordt die soms genegeerd, en dan bleef de switcher op "Switching…" staan
 *  met een half omgezette staat. Een expliciete navigatie naar hetzelfde adres doet het wél. */
function herlaad(): void {
  try { window.location.reload(); } catch { /* zie de navigatie hieronder */ }
  window.setTimeout(() => { try { window.location.replace(window.location.href); } catch { /* niets meer te doen */ } }, 250);
}

/** Alles wat aan het VORIGE account hing lokaal wissen. De cloud blijft ongemoeid: de lijsten van dat
 *  account staan onder zijn eigen sleutel en komen terug zodra je terugwisselt. */
function wisAccountStaat(): void {
  setPersisted<unknown[]>('tow:lists', []);
  setPersisted<unknown[]>('tow:list-groups', []);
  setPersisted<string | null>('tow:syncAt', null);
  setPersisted<unknown>('tow:campaignCtx', null);
  setPersisted<string | null>('tow:campaignActief', null);
  setPersisted<string | null>('tow:campaignCode', null);
  setPersisted<string | null>('tow:builder-active', null);
  setPersisted<string | null>('tow:campaign-battle', null);
}

/**
 * Wissel naar een testaccount: écht uitloggen en met wachtwoord weer inloggen (~1s), daarna de app
 * herladen zodat de lijsten en de campagne-koppeling van het nieuwe account schoon opkomen.
 *
 * Voordat er iets verandert gaan de huidige lijsten nog één keer naar de cloud, zodat werk van het
 * vertrekkende account nooit tussen wal en schip valt. Lukt dat niet (offline), dan gaat de wissel
 * NIET door en is er niets veranderd.
 */
export async function wisselNaarTestAccount(acc: TestAccount): Promise<WisselResultaat> {
  if (bezig) return { error: 'A switch is already running.' };
  bezig = true;
  try {
    const lijsten = getPersisted<unknown[]>('tow:lists', []);
    const groepen = getPersisted<unknown[]>('tow:list-groups', []);
    const oudeKey = getPersisted<string | null>('tow:syncKey', null);
    if (oudeKey && Array.isArray(lijsten) && lijsten.length > 0) {
      try {
        await pushLists(oudeKey, lijsten, groepen);
      } catch {
        bezig = false;
        return { error: 'Could not save the current lists to the cloud first (offline?) — nothing was changed.' };
      }
    }

    // Alleen deze browser uitloggen: een globale signOut zou ook je telefoon uit dit account gooien.
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* al uitgelogd is prima */ }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: acc.email.trim(),
      password: acc.password,
    });
    if (error || !data.session) {
      bezig = false;
      return { error: `${meldingVoor(error?.message)} You are signed out now — try again, or sign in under Account.` };
    }

    wisAccountStaat();
    setPersisted<boolean>('tow:syncViaAccount', true);
    setPersisted<string | null>('tow:syncKey', accountSyncKey(data.session.user.id));
    // Herladen is de eenvoudigste manier om élke consument (lijstbouwer, campagne, battle-brug)
    // schoon op het nieuwe account te zetten. `bezig` blijft aan tot de pagina weg is: zolang de
    // staat halverwege is mag de lijst-sync niets naar de cloud schrijven.
    herlaad();
    await new Promise((r) => window.setTimeout(r, 2500));
    // Nog hier? Dan werd het herladen genegeerd. Meld het in plaats van eeuwig "Switching…" te tonen.
    return { error: null, herladenNodig: true };
  } catch (e) {
    bezig = false;
    return { error: e instanceof Error ? e.message : 'Could not switch accounts.' };
  }
}

/** Uitloggen vanuit de switcher: zelfde opruiming, zonder nieuwe inlog. */
export async function testAccountUitloggen(): Promise<WisselResultaat> {
  if (bezig) return { error: 'A switch is already running.' };
  bezig = true;
  try {
    const lijsten = getPersisted<unknown[]>('tow:lists', []);
    const groepen = getPersisted<unknown[]>('tow:list-groups', []);
    const oudeKey = getPersisted<string | null>('tow:syncKey', null);
    if (oudeKey && Array.isArray(lijsten) && lijsten.length > 0) {
      try {
        await pushLists(oudeKey, lijsten, groepen);
      } catch {
        bezig = false;
        return { error: 'Could not save the current lists to the cloud first (offline?) — nothing was changed.' };
      }
    }
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* niets aan de hand */ }
    wisAccountStaat();
    setPersisted<boolean>('tow:syncViaAccount', false);
    setPersisted<string | null>('tow:syncKey', null);
    herlaad();
    await new Promise((r) => window.setTimeout(r, 2500));
    return { error: null, herladenNodig: true };
  } catch (e) {
    bezig = false;
    return { error: e instanceof Error ? e.message : 'Could not sign out.' };
  }
}
