// CAMPAIGN INTEGRATION (De Grensvorsten) — added 2026-06-30, extended (Phase B+C) 2026-06-30.
// See CAMPAIGN_INTEGRATION.md. De Grensvorsten lives on the SAME Komma AI Supabase and exposes its
// state via SECURITY DEFINER RPCs (granted to anon): towc_get_spel (read), towc_get_map (read),
// towc_spel_reageer + towc_spel_uitslag (write a battle response/result back). We only call those.

import { supabase } from './supabase';

export interface CampSpeler {
  id: string;
  naam: string;
  factie: string;
  kleur: string;
  fame: number;
  geld: number;
}
export interface CampBezit {
  speler: string;
  gebouw: string | null;
  gegenereerd?: boolean;
  controle?: number;
}
export interface CampBattle {
  id: number;
  fase: number;
  week: number;
  aanvaller: string;
  verdediger: string;
  hex: string;
  type: string;
  reactie: string | null;
  uitkomst: string | null;
  winnaar: string | null;
  opbrengst: number | null;
}
export interface CampGebouwtype {
  id: string;
  label: string;
  info: string;
  kosten: number;
  goud: number;
  fame: number;
}
export interface CampState {
  klok: { fase: number; week: number };
  spelers: CampSpeler[];
  bezit: Record<string, CampBezit>;
  gebouwtypes: CampGebouwtype[];
  battles: CampBattle[];
}

/** Pull the full De Grensvorsten campaign state. */
export async function fetchCampaign(): Promise<CampState | null> {
  const { data, error } = await supabase.rpc('towc_get_spel');
  if (error || !data) return null;
  return data as CampState;
}

/** Pull the shared map's per-hex terrain types ("c,r" → terrain). Empty if the map isn't published. */
export async function fetchMapTypes(): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc('towc_get_map');
  if (error || !data) return {};
  return ((data as { types?: Record<string, string> }).types ?? {}) as Record<string, string>;
}

/** Defender response to a battle: 'defend' (play it) or 'yield' (concede). */
export async function reageerBattle(speler: string, battle: number, reactie: 'defend' | 'yield'): Promise<boolean> {
  const { error } = await supabase.rpc('towc_spel_reageer', { p_speler: speler, p_battle: battle, p_reactie: reactie });
  return !error;
}

/** Record the tabletop result back to the campaign (winner + spoils are computed server-side). */
export type Uitkomst = 'aanvaller-major' | 'aanvaller-minor' | 'gelijk' | 'verdediger-minor' | 'verdediger-major';
export async function recordUitslag(speler: string, battle: number, uitkomst: Uitkomst, legerstatus = 'normaal'): Promise<boolean> {
  const { error } = await supabase.rpc('towc_spel_uitslag', {
    p_speler: speler,
    p_battle: battle,
    p_uitkomst: uitkomst,
    p_legerstatus: legerstatus,
  });
  return !error;
}

/** Phase points budget — De Grensvorsten reglement #14: 500 + 250 per phase, ~2000+ at the finale. */
export function puntenBudget(fase: number): number {
  return 500 + 250 * Math.max(0, fase - 1);
}

/** Which army-list slot each roster-option building unlocks (De Grensvorsten gebouwen.ts, category 'roster').
 * The building only grants PERMISSION; the points still come from your budget. */
export const ROSTER_BONUS: Record<string, string> = {
  stable: '+1 Cavalry unit',
  'beast-pen': '+1 Monstrous / Behemoth unit',
  armoury: '+1 War Machine / Chariot',
  'mustering-hall': '+1 unit (capacity)',
  'great-hall': '+1 Character',
  'mage-tower': 'Wizards may be level 2',
  reliquary: '+1 Magic-item slot',
  citadel: 'Garrison + control 3 (siege to take)',
};

/** Cluster 1 — terrain → scenario matrix. Maps a De Grensvorsten hex terrain to the battle it frames.
 * Names align with TOW battleplans so you can pick the matching scenario in Companion's Game tab. */
export const TERREIN_SCENARIO: Record<string, { naam: string; opzet: string }> = {
  vlakte: { naam: 'Open Battle', opzet: 'Pitched battle on open ground — a fair, straight fight.' },
  woud: { naam: 'Ambush in the Woods', opzet: 'Dense forest — heavy cover and hidden/scout deployment.' },
  heuvels: { naam: 'Hold the Heights', opzet: 'Hills dominate the field — seize and hold the high ground.' },
  bergen: { naam: 'Mountain Pass', opzet: 'Treacherous peaks — a bottleneck, flanks denied by impassable rock.' },
  bergpas: { naam: 'Mountain Pass', opzet: 'A narrow defile — funnelled deployment, no flanking room.' },
  moeras: { naam: 'Treacherous Ground', opzet: 'Marsh — dangerous terrain across the board slows and drowns.' },
  rivier: { naam: 'River Crossing', opzet: 'A river bisects the field — fight for the bridge/ford.' },
  kust: { naam: 'Coastal Landing', opzet: 'A beachhead assault — attacker lands, defender holds the shore.' },
  meer: { naam: 'Lakeside Battle', opzet: 'A lake edges the field — a constrained, one-flank fight.' },
  sleutelplek: { naam: 'Seize the Objective', opzet: 'A waystone / ruin (artefact site) — claim and hold the centre.' },
  verdorven: { naam: 'Blighted Ground', opzet: 'Corrupted, chaos-touched land — vortex/blight events colour the game.' },
  zee: { naam: '—', opzet: 'Open sea — not a battlefield.' },
};

export function scenarioVoor(terrein: string | undefined): { naam: string; opzet: string } {
  return (terrein && TERREIN_SCENARIO[terrein]) || { naam: 'Open Battle', opzet: 'Open ground (terrain unknown — map not published yet).' };
}
