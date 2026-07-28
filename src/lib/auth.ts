// Optional Supabase Auth (email + password) for the companion.
//
// Signing in links this app to the same account as the "De Grensvorsten" campaign — the basis for
// the account-based coupling that replaces the sync-key/code flow later. It is entirely OPTIONAL:
// the army-list builder is local and works without an account, so login is never a gate.
//
// Like src/theme.tsx this module is provider-free: a tiny module-level store keeps every consumer
// in sync via useSyncExternalStore. The single onAuthStateChange subscription lives for the whole
// app lifetime (set up once at module load, never in a component), so it survives StrictMode's
// double-mount without leaking.

import { useSyncExternalStore } from 'react';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

// ---- Module-level session store --------------------------------------------------------------

interface AuthState {
  session: Session | null;
  /** True until the first getSession() settles — lets the UI avoid a flash of "signed out". */
  loading: boolean;
  /** Set when a hand-off from the campaign app was attempted and failed, so the UI can explain
   *  itself instead of silently showing a sign-in form the player didn't expect. */
  ssoError?: string | null;
}

let state: AuthState = { session: null, loading: true };
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function setState(next: AuthState) {
  state = next; // new object each time → useSyncExternalStore sees the change
  emit();
}

// ---- Legacy seamless hand-off (SSO) ------------------------------------------------------------
//
// The current `?celedon=1` Preparation entry deliberately skips token exchange: OWC uses its own
// session or shows the account dialog. The handler below remains for older non-Celedon SSO links.
//
// Historically, "Open Old World Companion" asked its own server for a ONE-TIME token (a magic
// link that is never mailed) and sends us here as `#sso=<token>`. We exchange it for a session of
// our own — a separate refresh-token family from the campaign tab's, so neither app can log the
// other out when its token rotates. Sharing the campaign's tokens outright would do exactly that.
//
// The token rides in the URL FRAGMENT: fragments are never sent to a server and never land in a
// Referer header. It is single-use and short-lived, and we strip it from the address bar before the
// exchange even resolves, so a reload can't replay a spent token.

/** Pull an SSO token out of the URL and strip it, or null. Reads the fragment first (preferred),
 *  then the query string, so a copied link with `?sso=` still works. */
function takeSsoToken(): string | null {
  try {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    let token = hash.get('sso');
    // Preparation's current entry flow is explicit: on ?celedon=1 OWC uses its OWN existing
    // session or shows the account dialog. Discard a token from an older/cached campaign build, but
    // keep the celedon query intact for AppShell. Other legacy SSO links continue to work below.
    if (url.searchParams.has('celedon')) {
      let changed = false;
      if (token) {
        hash.delete('sso');
        changed = true;
      }
      if (url.searchParams.has('sso')) {
        url.searchParams.delete('sso');
        changed = true;
      }
      if (changed) {
        const rest = hash.toString();
        window.history.replaceState(null, '', `${url.pathname}${url.search}${rest ? `#${rest}` : ''}`);
      }
      return null;
    }
    if (token) {
      hash.delete('sso');
      const rest = hash.toString();
      window.history.replaceState(null, '', `${url.pathname}${url.search}${rest ? `#${rest}` : ''}`);
      return token;
    }
    token = url.searchParams.get('sso');
    if (token) {
      url.searchParams.delete('sso');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      return token;
    }
  } catch { /* a malformed URL is simply "no token" */ }
  return null;
}

/** Fall back to whatever session is already stored (so a failed hand-off never signs anyone out). */
function hydrateFromStorage(ssoError: string | null = null) {
  supabase.auth
    .getSession()
    .then(({ data }) => setState({ session: data.session ?? null, loading: false, ssoError }))
    .catch(() => setState({ session: null, loading: false, ssoError }));
}

// Hydrate once (client only), then keep in sync with every auth change (sign in/out, token refresh).
if (typeof window !== 'undefined') {
  const ssoToken = takeSsoToken();
  if (ssoToken) {
    supabase.auth
      .verifyOtp({ token_hash: ssoToken, type: 'email' })
      .then(({ data, error }) => {
        if (error || !data.session) {
          hydrateFromStorage('That sign-in link has expired — please sign in below.');
        } else {
          setState({ session: data.session, loading: false, ssoError: null });
        }
      })
      .catch(() => hydrateFromStorage('Automatic sign-in failed — please sign in below.'));
  } else {
    hydrateFromStorage();
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    setState({ session: session ?? null, loading: false, ssoError: session ? null : state.ssoError });
  });
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot(): AuthState {
  return state;
}

export interface UseAuthResult {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** Non-null when a hand-off from the campaign app failed (see takeSsoToken above). */
  ssoError: string | null;
}

/** React hook: the current session/user, kept live via onAuthStateChange. */
export function useAuth(): UseAuthResult {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { session: s.session, user: s.session?.user ?? null, loading: s.loading, ssoError: s.ssoError ?? null };
}

/** Non-React read of the current session (null when signed out). Handy for the later coupling. */
export function getAuthSession(): Session | null {
  return state.session;
}

// ---- Helpers ----------------------------------------------------------------------------------

/** Map a Supabase AuthError to a short, friendly English message. */
function friendlyAuthError(error: AuthError): string {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Invalid email or password.';
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'That email is already registered — sign in instead.';
  }
  if (m.includes('at least') || m.includes('password should be') || m.includes('too short')) {
    return 'Password too short — use at least 6 characters.';
  }
  if (m.includes('unable to validate email') || m.includes('invalid email') || m.includes('invalid format')) {
    return 'That doesn’t look like a valid email address.';
  }
  if (m.includes('email not confirmed')) {
    return 'Email not confirmed yet — check your inbox for the confirmation link.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts — please wait a moment and try again.';
  }
  if (m.includes('network') || m.includes('failed to fetch')) return 'Network error — check your connection.';
  return error?.message || 'Something went wrong — please try again.';
}

/** Sign in with email + password. Returns a friendly error string, or null on success (the session
 *  arrives via onAuthStateChange). */
export async function authSignIn(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  return { error: error ? friendlyAuthError(error) : null };
}

/** Register a new email + password account. `needsConfirmation` is true when the project requires
 *  email confirmation (signUp returns no active session yet). On success with confirmation off, the
 *  session arrives via onAuthStateChange. */
export async function authSignUp(
  email: string,
  password: string,
): Promise<{ error: string | null; needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) return { error: friendlyAuthError(error), needsConfirmation: false };
  // With email confirmation ON, signing up an existing address is obscured as a user with no
  // identities (anti-enumeration) rather than an error — treat that as "already registered".
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { error: 'That email is already registered — sign in instead.', needsConfirmation: false };
  }
  return { error: null, needsConfirmation: !data.session };
}

/** Sign out and clear the persisted session. */
export async function authSignOut(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signOut();
  return { error: error ? friendlyAuthError(error) : null };
}
