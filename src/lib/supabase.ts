import { createClient } from '@supabase/supabase-js';

// Komma AI Supabase project. The publishable key is safe to ship in a client bundle;
// access to game rows is gated by Row Level Security + the unguessable join code.
//
// TESTOMGEVING (26-08-2026). Tot nu stond het project hier hard in de code, waardoor ELKE build --
// ook een dev-build op localhost -- rechtstreeks op de LIVE campagne schreef. Er loopt sinds
// 24-08 een echte campagne met veertien spelers, dus een campagne-battle uitproberen mocht niet
// meer op die database. Daarom nu overschrijfbaar via env, met de live-waarden als terugval: een
// gewone `vite build` levert exact dezelfde bundel als voorheen. Alleen `--mode test` (zie
// .env.test) wijst naar de tweede database.
//
// Een LEGE env-waarde telt als "niet ingevuld" (`||`, niet `??`): anders zou een leeg gezette
// variabele een lege URL aan createClient geven in plaats van de ingebouwde terugval.
const PROD_PROJECT = 'rbjzooxbnrfuwtnwczih';
const TEST_PROJECT = 'ljyrshiappspnwbptxka';
const ENV_URL = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim();
const SUPABASE_URL = ENV_URL || `https://${PROD_PROJECT}.supabase.co`;
const SUPABASE_PUBLISHABLE_KEY = ((import.meta.env.VITE_SUPABASE_KEY as string | undefined) ?? '').trim()
  || 'sb_publishable_JLRuSQwNPsdbwBPRJh6KSA_vMT7PJsI';

/** Draait deze bundel op de TESTdatabase? Puur om het in de UI te kunnen laten zien: een testbuild
 *  die eruitziet als de echte app is een ongeluk dat wacht om te gebeuren.
 *
 *  Beslist op de WAARDE van de URL, niet op de aanwezigheid ervan (04-10-2026, G14). Tot dan was dit
 *  `!!VITE_SUPABASE_URL`: een productiebuild die de campagne-URL expliciet als env meekreeg, gedroeg
 *  zich dan als test (testmerk + de test-only koppelflow via ?koppel=). Nu:
 *    - URL bevat het test-project-id                        -> test;
 *    - URL bevat het campagne-project-id, of is leeg         -> productie;
 *    - een onbekende URL                                     -> productie (geen testgedrag), met een
 *      waarschuwing in de console, want dan klopt er iets niet aan de build. */
export const IS_TEST_DB = SUPABASE_URL.includes(TEST_PROJECT);
if (!IS_TEST_DB && !SUPABASE_URL.includes(PROD_PROJECT)) {
  console.warn(`[supabase] Onbekende VITE_SUPABASE_URL (${SUPABASE_URL}): behandeld als productie, zonder testgedrag.`);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  // Keep the signed-in session in localStorage and refresh it in the background so a player stays
  // logged in across reloads. detectSessionInUrl stays off: this is a PWA, not an OAuth redirect
  // target, so there's never a session token to parse out of the URL.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const TOW_GAMES = 'tow_games';
export const TOW_FEEDBACK = 'tow_feedback';
