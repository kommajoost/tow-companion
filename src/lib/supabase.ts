import { createClient } from '@supabase/supabase-js';

// Komma AI Supabase project. The publishable key is safe to ship in a client bundle;
// access to game rows is gated by Row Level Security + the unguessable join code.
const SUPABASE_URL = 'https://rbjzooxbnrfuwtnwczih.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_JLRuSQwNPsdbwBPRJh6KSA_vMT7PJsI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});

export const TOW_GAMES = 'tow_games';
export const TOW_FEEDBACK = 'tow_feedback';
