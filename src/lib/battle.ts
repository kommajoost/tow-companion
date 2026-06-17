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

/** A terrain trait that can be combined with any feature (rulebook: "Combining Terrain Categories"). */
export type TerrainTrait = 'difficult' | 'dangerous';
export const TRAIT_RULE: Record<TerrainTrait, { slug: string; label: string }> = {
  difficult: { slug: 'difficult-terrain', label: 'Difficult terrain' },
  dangerous: { slug: 'dangerous-terrain', label: 'Dangerous terrain' },
};

export interface TerrainType { id: string; label: string; color: string; ruleSlug: string; defaultTrait?: TerrainTrait }
// The rulebook's terrain feature types, each with a distinct colour and a link to its rules page.
// `defaultTrait` reflects how the rulebook usually classifies it (most woods are difficult terrain,
// marshes/water are dangerous, etc.) — used as the default when scattering random terrain.
export const TERRAIN_TYPES: TerrainType[] = [
  { id: 'hill', label: 'Hill', color: '#b08a4f', ruleSlug: 'hills' },
  { id: 'wood', label: 'Wood', color: '#4e7a45', ruleSlug: 'woods', defaultTrait: 'difficult' },
  { id: 'building', label: 'Building', color: '#9a6a44', ruleSlug: 'buildings' },
  { id: 'ruins', label: 'Ruins', color: '#8a7f70', ruleSlug: 'buildings', defaultTrait: 'difficult' },
  { id: 'marsh', label: 'Marsh / Water', color: '#4f7b8a', ruleSlug: 'dangerous-terrain', defaultTrait: 'dangerous' },
  { id: 'obstacle', label: 'Obstacle', color: '#7a5a3a', ruleSlug: 'linear-obstacles' },
  { id: 'field', label: 'Field', color: '#9a8a3a', ruleSlug: 'difficult-terrain', defaultTrait: 'difficult' },
];
export const terrainType = (id: string): TerrainType => TERRAIN_TYPES.find((t) => t.id === id) ?? TERRAIN_TYPES[0];

/** A placed terrain feature, in inches (x,y = top-left; w,h = size). May carry difficult/dangerous traits. */
export interface TerrainPiece { id: string; type: string; x: number; y: number; w: number; h: number; difficult?: boolean; dangerous?: boolean }

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

// Minimum centre-to-centre spacing between features (inches), so terrain isn't bunched up.
const MIN_SPACING = 12;

// Which quadrant of the table a centre point falls in (0..3) — used to keep terrain balanced
// across the table rather than clustered on one side.
const quadrantOf = (cx: number, cy: number, w: number, h: number) => (cx >= w / 2 ? 1 : 0) + (cy >= h / 2 ? 2 : 0);

/** A piece to be positioned: carries everything except x/y (and an optional id to preserve). */
interface PlaceSpec { id?: string; type: string; w: number; h: number; difficult?: boolean; dangerous?: boolean }

// Lay out the given specs across the table with two balance rules from the user's brief:
//  1. features keep at least ~12" between their centres (relaxed only if the table is too crowded),
//  2. they spread across the four quadrants rather than piling up on one side.
// Constraints relax in stages so a requested count always gets placed.
function placeSpecs(specs: PlaceSpec[], w: number, h: number): TerrainPiece[] {
  const margin = 3;
  const placed: TerrainPiece[] = [];
  const quadCount = [0, 0, 0, 0];
  const quadCap = Math.ceil(specs.length / 4) + 1;
  // strict → drop the quadrant balance → shrink the spacing, in that order
  const stages = [
    { spacing: MIN_SPACING, cap: quadCap },
    { spacing: MIN_SPACING, cap: Infinity },
    { spacing: 8, cap: Infinity },
    { spacing: 4, cap: Infinity },
    { spacing: 0, cap: Infinity },
  ];
  for (const spec of specs) {
    const { w: tw, h: th } = spec;
    let chosen: { x: number; y: number; q: number } | null = null;
    for (const stage of stages) {
      for (let i = 0; i < 80 && !chosen; i++) {
        const x = Math.round(rnd(margin, Math.max(margin, w - tw - margin)));
        const y = Math.round(rnd(margin, Math.max(margin, h - th - margin)));
        const cx = x + tw / 2, cy = y + th / 2;
        const q = quadrantOf(cx, cy, w, h);
        if (quadCount[q] >= stage.cap) continue;
        const farEnough = placed.every((p) => Math.hypot((p.x + p.w / 2) - cx, (p.y + p.h / 2) - cy) >= stage.spacing);
        if (farEnough) chosen = { x, y, q };
      }
      if (chosen) break;
    }
    if (!chosen) {
      const x = clamp(Math.round(rnd(margin, w - tw - margin)), 0, Math.max(0, w - tw));
      const y = clamp(Math.round(rnd(margin, h - th - margin)), 0, Math.max(0, h - th));
      chosen = { x, y, q: quadrantOf(x + tw / 2, y + th / 2, w, h) };
    }
    quadCount[chosen.q]++;
    placed.push({ id: spec.id ?? newTerrainId(), type: spec.type, x: chosen.x, y: chosen.y, w: tw, h: th, difficult: spec.difficult, dangerous: spec.dangerous });
  }
  return placed;
}

/** Generate a fresh random layout: `count` features drawn from the enabled types (random sizes 3–8"),
 *  balanced across the table (≥12" apart, spread over the quadrants). Each feature takes its type's
 *  default trait (most woods difficult, marshes dangerous, …). */
export function scatterTerrain(w: number, h: number, count = recommendedTerrainCount(w, h), enabledTypeIds?: string[]): TerrainPiece[] {
  const pool = enabledTypeIds && enabledTypeIds.length ? TERRAIN_TYPES.filter((t) => enabledTypeIds.includes(t.id)) : TERRAIN_TYPES;
  if (pool.length === 0) return [];
  const specs: PlaceSpec[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(count)); i++) {
    const tt = pool[Math.floor(Math.random() * pool.length)];
    specs.push({ type: tt.id, w: Math.round(rnd(3, 8)), h: Math.round(rnd(3, 8)), difficult: tt.defaultTrait === 'difficult', dangerous: tt.defaultTrait === 'dangerous' });
  }
  return placeSpecs(specs, w, h);
}

/** Randomly re-place the features already on the table — keeps each piece's id, type, size and traits,
 *  just gives them fresh, balanced positions (same ≥12"-apart / spread rules). */
export function shufflePlacement(terrain: TerrainPiece[], w: number, h: number): TerrainPiece[] {
  return placeSpecs(terrain.map((t) => ({ id: t.id, type: t.type, w: t.w, h: t.h, difficult: t.difficult, dangerous: t.dangerous })), w, h);
}

// Find a single spot for a tw×th piece that keeps ~12" from the existing features (relaxing if it
// can't), without disturbing the others. Used when adding one piece via the per-type stepper.
function findSpot(existing: TerrainPiece[], tw: number, th: number, w: number, h: number): { x: number; y: number } {
  const margin = 3;
  for (const spacing of [MIN_SPACING, 8, 4, 0]) {
    for (let i = 0; i < 80; i++) {
      const x = Math.round(rnd(margin, Math.max(margin, w - tw - margin)));
      const y = Math.round(rnd(margin, Math.max(margin, h - th - margin)));
      const cx = x + tw / 2, cy = y + th / 2;
      if (existing.every((p) => Math.hypot((p.x + p.w / 2) - cx, (p.y + p.h / 2) - cy) >= spacing)) return { x, y };
    }
  }
  return { x: clamp(Math.round(rnd(margin, w - tw - margin)), 0, Math.max(0, w - tw)), y: clamp(Math.round(rnd(margin, h - th - margin)), 0, Math.max(0, h - th)) };
}

/** Add one feature of the given type at a balanced spot (≥12" from the others where possible),
 *  leaving the existing features where they are. Picks up the type's default trait. */
export function addPieceBalanced(state: BattleSetupState, type: string): TerrainPiece {
  const w = 6, h = 5;
  const trait = terrainType(type).defaultTrait;
  const { x, y } = findSpot(state.terrain, w, h, state.tableW, state.tableH);
  return { id: newTerrainId(), type, x, y, w, h, difficult: trait === 'difficult', dangerous: trait === 'dangerous' };
}

/** Add a terrain piece of the given type, near the table centre. Successive adds cascade by a few
 *  inches so they don't stack invisibly on top of one another. Picks up the type's default trait. */
export function addTerrain(state: BattleSetupState, type: string): TerrainPiece {
  const w = 6, h = 5;
  const step = (state.terrain.length % 6) * 3;
  const trait = terrainType(type).defaultTrait;
  return {
    id: newTerrainId(), type,
    x: clamp(Math.round(state.tableW / 2 - w / 2 + step), 0, state.tableW - w),
    y: clamp(Math.round(state.tableH / 2 - h / 2 + step), 0, state.tableH - h),
    w, h,
    difficult: trait === 'difficult',
    dangerous: trait === 'dangerous',
  };
}
