// Battle setup data: the pitched-battle scenarios, terrain types, table sizes and the engine bits
// (recommended terrain count, defaults). The board UI (BattleBoard) + setup screen (BattleSetup) use
// this. Scenario rules live verbatim in rules.json — we only carry the slug to open the rule sheet.

// How each scenario's deployment map is drawn on the board (from the rulebook diagrams):
//  standard         – two 12" zones off the long edges (the classic pitched battle)
//  command-control  – standard zones + a special feature at the table centre (+200 VP)
//  flank            – central 12" main zones + 18" flank zones at the short ends
//  mountain-pass    – deploy at the short ends; the long edges are impassable cliffs
export type DeploymentKind = 'standard' | 'command-control' | 'flank' | 'mountain-pass';

export interface ScenarioDef {
  id: string;
  name: string;
  ruleSlug: string; // the rules.json page with the full scenario rules + deployment map
  d6: number;        // its number on the rulebook's D6 pitched-battle table
  blurb: string;
  deployment: DeploymentKind;
  deployNote: string; // short caption shown under the board explaining the deployment
}

export const SCENARIOS: ScenarioDef[] = [
  { id: 'open-battle', name: 'Open Battle', ruleSlug: 'open-battle', d6: 1, blurb: 'A straight clash on open ground — even footing for both armies.', deployment: 'standard', deployNote: 'Standard deployment — each army sets up within 12″ of its long edge (zones A & B).' },
  { id: 'break-point', name: 'Break Point', ruleSlug: 'break-point-matched-play', d6: 2, blurb: 'Hold the line at the breaking point; objectives decide it.', deployment: 'standard', deployNote: 'Standard 12″ deployment zones (A & B). Game ends when an army drops below ¼ of its starting Unit Strength.' },
  { id: 'flank-attack', name: 'Flank Attack', ruleSlug: 'flank-attack', d6: 3, blurb: 'Both armies send units wide to outflank — they may arrive from a flank.', deployment: 'flank', deployNote: 'Main forces deploy in the central 12″ zones (A & B); a flanking force (≤33% pts) arrives in one 18″ flank zone (blue).' },
  { id: 'meeting-engagement', name: 'Meeting Engagement', ruleSlug: 'meeting-engagement', d6: 4, blurb: 'A sudden clash of marching columns; some units arrive late.', deployment: 'standard', deployNote: 'Standard 12″ zones (A & B). Roll a D6 per unit — on a 1 it starts in reserve and marches on later.' },
  { id: 'mountain-pass', name: 'Mountain Pass', ruleSlug: 'mountain-pass', d6: 5, blurb: 'A long, narrow battlefield — manoeuvring and outflanking are hard.', deployment: 'mountain-pass', deployNote: 'Deploy at the short ends (A & B). The long edges are impassable cliffs — nothing moves off them.' },
  { id: 'command-control', name: 'Command & Control', ruleSlug: 'command-and-control', d6: 6, blurb: 'Fight for control of a central landmark.', deployment: 'command-control', deployNote: 'Standard 12″ zones (A & B). A special feature (★) sits at the centre — hold it for +200 VP.' },
];

export const scenarioById = (id: string): ScenarioDef | undefined => SCENARIOS.find((s) => s.id === id);

/** A deployment zone rectangle (inches). `kind` styles it: main = gold, flank = blue. */
export interface DeployZone { x: number; y: number; w: number; h: number; label: string; kind: 'main' | 'flank' }
export interface DeploymentLayout {
  zones: DeployZone[];
  objective?: { x: number; y: number }; // central special feature (Command & Control)
  impassable?: { x: number; y: number; w: number; h: number }[]; // cliff strips (Mountain Pass)
}

/** Build the deployment-zone layout for a scenario on a given table, mirroring the rulebook maps. */
export function deploymentFor(scenarioId: string, W: number, H: number): DeploymentLayout {
  const longHoriz = W >= H; // is the long table axis horizontal?
  const d = 12;             // standard 12" deployment depth
  const standard: DeployZone[] = longHoriz
    ? [{ x: 0, y: 0, w: W, h: d, label: 'A', kind: 'main' }, { x: 0, y: H - d, w: W, h: d, label: 'B', kind: 'main' }]
    : [{ x: 0, y: 0, w: d, h: H, label: 'A', kind: 'main' }, { x: W - d, y: 0, w: d, h: H, label: 'B', kind: 'main' }];

  switch (scenarioById(scenarioId)?.deployment) {
    case 'command-control':
      return { zones: standard, objective: { x: W / 2, y: H / 2 } };

    case 'flank': {
      const f = 18; // 18" flank zones at the short ends
      if (longHoriz) {
        return { zones: [
          { x: f, y: 0, w: Math.max(0, W - 2 * f), h: d, label: 'A', kind: 'main' },
          { x: f, y: H - d, w: Math.max(0, W - 2 * f), h: d, label: 'B', kind: 'main' },
          { x: 0, y: 0, w: f, h: H, label: 'Flank', kind: 'flank' },
          { x: W - f, y: 0, w: f, h: H, label: 'Flank', kind: 'flank' },
        ] };
      }
      return { zones: [
        { x: 0, y: f, w: d, h: Math.max(0, H - 2 * f), label: 'A', kind: 'main' },
        { x: W - d, y: f, w: d, h: Math.max(0, H - 2 * f), label: 'B', kind: 'main' },
        { x: 0, y: 0, w: W, h: f, label: 'Flank', kind: 'flank' },
        { x: 0, y: H - f, w: W, h: f, label: 'Flank', kind: 'flank' },
      ] };
    }

    case 'mountain-pass': {
      // The pass runs along the long axis: deploy at the short ends, long edges are impassable cliffs.
      const t = 1.6; // cliff strip thickness
      if (longHoriz) {
        return {
          zones: [{ x: 0, y: 0, w: d, h: H, label: 'A', kind: 'main' }, { x: W - d, y: 0, w: d, h: H, label: 'B', kind: 'main' }],
          impassable: [{ x: 0, y: 0, w: W, h: t }, { x: 0, y: H - t, w: W, h: t }],
        };
      }
      return {
        zones: [{ x: 0, y: 0, w: W, h: d, label: 'A', kind: 'main' }, { x: 0, y: H - d, w: W, h: d, label: 'B', kind: 'main' }],
        impassable: [{ x: 0, y: 0, w: t, h: H }, { x: W - t, y: 0, w: t, h: H }],
      };
    }

    default:
      return { zones: standard };
  }
}

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

/** A random number of features, varying around the rulebook recommendation (rec−1 … rec+2, min 3). */
export const randomTerrainCount = (w: number, h: number): number => {
  const rec = recommendedTerrainCount(w, h);
  return Math.max(3, rec - 1 + Math.floor(Math.random() * 4));
};

// Find a non-overlapping spot for a w×h piece inside the table (margin from the edges). Falls back to
// a clamped random position if it can't find a clear one after a few tries.
function randomSpot(w: number, h: number, tw: number, th: number, placed: TerrainPiece[]): { x: number; y: number } {
  const margin = 3;
  for (let i = 0; i < 60; i++) {
    const x = Math.round(rnd(margin, Math.max(margin, w - tw - margin)));
    const y = Math.round(rnd(margin, Math.max(margin, h - th - margin)));
    const overlaps = placed.some((p) => x < p.x + p.w + 2 && x + tw + 2 > p.x && y < p.y + p.h + 2 && y + th + 2 > p.y);
    if (!overlaps) return { x, y };
  }
  return { x: clamp(Math.round(rnd(margin, Math.max(margin, w - tw - margin))), 0, w - tw), y: clamp(Math.round(rnd(margin, Math.max(margin, h - th - margin))), 0, h - th) };
}

/** Generate a fresh random layout: a random number of features (random types & sizes 3–8"), scattered
 *  across the table with a light overlap check. Mirrors the rulebook's Random Terrain idea. */
export function scatterTerrain(w: number, h: number, count = randomTerrainCount(w, h)): TerrainPiece[] {
  const out: TerrainPiece[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 60) {
    guard++;
    const tw = Math.round(rnd(3, 8));
    const th = Math.round(rnd(3, 8));
    const { x, y } = randomSpot(w, h, tw, th, out);
    const type = TERRAIN_TYPES[Math.floor(Math.random() * TERRAIN_TYPES.length)].id;
    out.push({ id: newTerrainId(), type, x, y, w: tw, h: th });
  }
  return out;
}

/** Randomly re-place the features that are already on the table — keeps each piece's type & size,
 *  just gives it a fresh random position (with a light overlap check). */
export function shufflePlacement(terrain: TerrainPiece[], w: number, h: number): TerrainPiece[] {
  const out: TerrainPiece[] = [];
  for (const piece of terrain) {
    const { x, y } = randomSpot(w, h, piece.w, piece.h, out);
    out.push({ ...piece, x, y });
  }
  return out;
}

/** Add a terrain piece of the given type, near the table centre. Successive adds cascade by a few
 *  inches so they don't stack invisibly on top of one another. */
export function addTerrain(state: BattleSetupState, type: string): TerrainPiece {
  const w = 6, h = 5;
  const step = (state.terrain.length % 6) * 3;
  return {
    id: newTerrainId(), type,
    x: clamp(Math.round(state.tableW / 2 - w / 2 + step), 0, state.tableW - w),
    y: clamp(Math.round(state.tableH / 2 - h / 2 + step), 0, state.tableH - h),
    w, h,
  };
}
