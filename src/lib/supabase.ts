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
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  ?? 'https://rbjzooxbnrfuwtnwczih.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_KEY as string | undefined)
  ?? 'sb_publishable_JLRuSQwNPsdbwBPRJh6KSA_vMT7PJsI';

/** Draait deze bundel op de TESTdatabase? Puur om het in de UI te kunnen laten zien: een testbuild
 *  die eruitziet als de echte app is een ongeluk dat wacht om te gebeuren. */
export const IS_TEST_DB = !!(import.meta.env.VITE_SUPABASE_URL as string | undefined);

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  // Keep the signed-in session in localStorage and refresh it in the background so a player stays
  // logged in across reloads. detectSessionInUrl stays off: this is a PWA, not an OAuth redirect
  // target, so there's never a session token to parse out of the URL.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const TOW_GAMES = 'tow_games';
export const TOW_FEEDBACK = 'tow_feedback';
