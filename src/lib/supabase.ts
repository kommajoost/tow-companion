import { createClient } from '@supabase/supabase-js';

// Komma AI Supabase project. The publishable key is safe to ship in a client bundle;
// access to game rows is gated by Row Level Security + the unguessable join code.
const SUPABASE_URL = 'https://rbjzooxbnrfuwtnwczih.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_JLRuSQwNPsdbwBPRJh6KSA_vMT7PJsI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  // Keep the signed-in session in localStorage and refresh it in the background so a player stays
  // logged in across reloads. detectSessionInUrl stays off: this is a PWA, not an OAuth redirect
  // target, so there's never a session token to parse out of the URL.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const TOW_GAMES = 'tow_games';
export const TOW_FEEDBACK = 'tow_feedback';
