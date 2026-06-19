import { supabase } from './supabase';

// Army-list sync over Supabase, gated only by an unguessable sync key (no login). The key is shared
// between a player's devices; the server RPCs (tow_lists_pull / tow_lists_push) only ever touch the
// row matching the exact key, so nobody can read another player's lists.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

/** A fresh random sync key, shown grouped for readability (e.g. "K7Q4-M2NP-7RST-9WXY"). */
export function makeSyncKey(len = 16): string {
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[arr[i] % ALPHABET.length];
  return s.replace(/(.{4})(?=.)/g, '$1-');
}

/** Normalise a key for the wire: strip separators/whitespace, upper-case. */
export const cleanKey = (k: string): string => (k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Derive the actual sync key from a user-chosen password. Hashing (SHA-256) means the password
 *  itself is never the literal database key, gives a valid fixed-length key, and is forgiving about
 *  spacing/case so the same password always resolves to the same syncs. */
export async function deriveKey(password: string): Promise<string> {
  const norm = (password || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`tow:sync:v1:${norm}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface CloudLists { lists: unknown[]; groups: unknown[]; updatedAt: string }

/** Fetch the lists + groups stored for a key (null if the key has never been pushed). */
export async function pullLists(key: string): Promise<CloudLists | null> {
  const { data, error } = await supabase.rpc('tow_lists_pull', { p_key: cleanKey(key) });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { lists?: unknown; groups?: unknown; updated_at?: string } | undefined;
  if (!row || !row.updated_at) return null;
  return { lists: Array.isArray(row.lists) ? row.lists : [], groups: Array.isArray(row.groups) ? row.groups : [], updatedAt: row.updated_at };
}

/** Upload lists + groups for a key (last write wins); returns the new server timestamp. */
export async function pushLists(key: string, lists: unknown[], groups: unknown[]): Promise<string> {
  const { data, error } = await supabase.rpc('tow_lists_push', { p_key: cleanKey(key), p_lists: lists, p_groups: groups });
  if (error) throw error;
  return data as string;
}
