// Battle setup data: the pitched-battle scenarios, terrain types, table sizes and the engine bits
// (recommended terrain count, defaults). The board UI (BattleBoard) + setup screen (BattleSetup) use
// this. Scenario rules live verbatim in rules.json — we only carry the slug to open the rule sheet.

export interface ScenarioDef {
  id: string;
  name: string;
  ruleSlug: string; // the rules.json page with the full scenario rules + deployment map
  d6: number;        // its number on the rulebook's D6 pitched-battle table
  blurb: string;
}

export const SCENARIOS: ScenarioDef[] = [
  { id: 'open-battle', name: 'Open Battle', ruleSlug: 'open-battle', d6: 1, blurb: 'A straight clash on open ground — even footing for both armies.' },
  { id: 'break-point', name: 'Break Point', ruleSlug: 'break-point-matched-play', d6: 2, blurb: 'Hold the line at the breaking point; objectives decide it.' },
  { id: 'flank-attack', name: 'Flank Attack', ruleSlug: 'flank-attack', d6: 3, blurb: 'Both armies send units wide to outflank — they may arrive from a flank.' },
  { id: 'meeting-engagement', name: 'Meeting Engagement', ruleSlug: 'meeting-engagement', d6: 4, blurb: 'A sudden clash of marching columns; some units arrive late.' },
  { id: 'mountain-pass', name: 'Mountain Pass', ruleSlug: 'mountain-pass', d6: 5, blurb: 'A long, narrow battlefield — manoeuvring and outflanking are hard.' },
  { id: 'command-control', name: 'Command & Control', ruleSlug: 'command-and-control', d6: 6, blurb: 'Fight for control of a central landmark.' },
];

export const scenarioById = (id: string): ScenarioDef | undefined => SCENARIOS.find((s) => s.id === id);

export interface TerrainType { id: string; label: string; color: string; }
// Categories of terrain from the rulebook, with a distinct colour each.
export const TERRAIN_TYPES: TerrainType[] = [
  { id: 'hill', label: 'Hill', color: '#b08a4f' },
  { id: 'wood', label: 'Wood', color: '#4e7a45' },
  { id: 'building', label: 'Building', color: '#9a6a44' },
  { id: 'ruins', label: 'Ruins', color: '#8a7f70' },
  { id: 'marsh', label: 'Marsh / Water', color: '#4f7b8a' },
  { id: 'obstacle', label: 'Obstacle', color: '#7a5a3a' },
  { id: 'field', label: 'Field', color: '#9a8a3a' },
];
export const terrainType = (id: string): TerrainType => TERRAIN_TYPES.find((t) => t.id === id) ?? TERRAIN_TYPES[0];

/** A placed terrain feature, in inches (x,y = top-left; w,h = size). */
export interface TerrainPiece { id: string; type: string; x: number; y: number; w: number; h: number }

export interface BattleSetupState {
  scenario: string;
  tableW: number; // inches
  tableH: number; // inches
  terrain: TerrainPiece[];
}

// Common table sizes (inches). Mountain Pass is long & narrow per its rules.
export const TABLE_PRESETS: { label: string; w: number; h: number }[] = [
  { label: "6×4′", w: 72, h: 48 },
  { label: "4×4′", w: 48, h: 48 },
  { label: "6×3′", w: 72, h: 36 },
  { label: "8×4′", w: 96, h: 48 },
  { label: "4×6′", w: 48, h: 72 },
];

// Rulebook guide: one terrain feature per 12" of the longest table edge (rounded up).
export const recommendedTerrainCount = (w: number, h: number): number => Math.ceil(Math.max(w, h) / 12);

export const DEFAULT_BATTLE: BattleSetupState = { scenario: 'open-battle', tableW: 72, tableH: 48, terrain: [] };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
let counter = 0;
export const newTerrainId = () => `t${(counter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** Randomly scatter the recommended number of terrain features (2–8" each), kept inside the table
 *  with a small edge margin and a light overlap check. Mirrors the rulebook's Random Terrain idea. */
export function scatterTerrain(w: number, h: number): TerrainPiece[] {
  const count = recommendedTerrainCount(w, h);
  const out: TerrainPiece[] = [];
  const margin = 4;
  let guard = 0;
  while (out.length < count && guard < count * 60) {
    guard++;
    const tw = Math.round(rnd(3, 8));
    const th = Math.round(rnd(3, 8));
    const x = Math.round(rnd(margin, Math.max(margin, w - tw - margin)));
    const y = Math.round(rnd(margin, Math.max(margin, h - th - margin)));
    // avoid heavy overlap with already-placed features
    const overlaps = out.some((p) => x < p.x + p.w + 2 && x + tw + 2 > p.x && y < p.y + p.h + 2 && y + th + 2 > p.y);
    if (overlaps) continue;
    const type = TERRAIN_TYPES[Math.floor(Math.random() * TERRAIN_TYPES.length)].id;
    out.push({ id: newTerrainId(), type, x, y, w: tw, h: th });
  }
  return out;
}

/** Add a terrain piece of the given type, centred on the table. */
export function addTerrain(state: BattleSetupState, type: string): TerrainPiece {
  const w = 6, h = 5;
  return { id: newTerrainId(), type, x: clamp(Math.round(state.tableW / 2 - w / 2), 0, state.tableW - w), y: clamp(Math.round(state.tableH / 2 - h / 2), 0, state.tableH - h), w, h };
}
