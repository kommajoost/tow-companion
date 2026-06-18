// Battle setup data: the pitched-battle scenarios, terrain types, table sizes and the engine bits
// (recommended terrain count, defaults). The board UI (BattleBoard) + setup screen (BattleSetup) use
// this. Scenario rules live verbatim in rules.json — we only carry the slug to open the rule sheet.

// How each scenario's deployment map is drawn on the board (traced from the rulebook diagrams):
//  standard         – two zones off the long edges, 24" no-man's-land down the centre
//  command-control  – standard zones + a special feature at the table centre (+200 VP)
//  flank            – central main zones + 18" flank zones at the short ends
//  mountain-pass    – deploy at the short ends, 24" no-man's-land down the middle
//  meeting          – diagonal: split corner-to-corner, 6" no-man's-land each side of the line
//  break-point      – zones inset 9" from the side edges and 9" from the centre line
//  bm-pitched       – Battle March pitched battle: shallow bands, 15" no-man's-land
//  bm-opposed-flanks– Battle March: slanted opposed-corner zones
//  bm-close-encounter– Battle March: opposite quadrants + central objective
export type DeploymentKind = 'standard' | 'command-control' | 'flank' | 'mountain-pass' | 'meeting' | 'break-point' | 'bm-pitched' | 'bm-opposed-flanks' | 'bm-close-encounter';

export interface ScenarioDef {
  id: string;
  name: string;
  ruleSlug: string; // the rules.json page with the full scenario rules + deployment map
  d6: number;        // its number on the rulebook's D6 pitched-battle table
  d6Label?: string;  // shown on the badge instead of d6 (e.g. Battle March's "1-2")
  group?: 'pitched' | 'battle-march'; // which list it appears under (default 'pitched')
  blurb: string;
  deployment: DeploymentKind;
  deployNote: string; // short caption shown under the board explaining the deployment
}

export const SCENARIOS: ScenarioDef[] = [
  { id: 'open-battle', name: 'Open Battle', ruleSlug: 'open-battle', d6: 1, blurb: 'A straight clash on open ground — even footing for both armies.', deployment: 'standard', deployNote: 'Standard deployment — each army sets up within 12″ of its long edge (zones A & B).' },
  { id: 'break-point', name: 'Break Point', ruleSlug: 'break-point-matched-play', d6: 2, blurb: 'Hold the line at the breaking point; objectives decide it.', deployment: 'break-point', deployNote: 'Deploy in a zone set 9″ in from the side edges and 9″ from the centre line. Game ends when an army drops below ¼ of its starting Unit Strength.' },
  { id: 'flank-attack', name: 'Flank Attack', ruleSlug: 'flank-attack', d6: 3, blurb: 'Both armies send units wide to outflank — they may arrive from a flank.', deployment: 'flank', deployNote: 'Main forces deploy in the central 12″ zones (A & B); a flanking force (≤33% pts) arrives in one 18″ flank zone (blue).' },
  { id: 'meeting-engagement', name: 'Meeting Engagement', ruleSlug: 'meeting-engagement', d6: 4, blurb: 'A sudden clash of marching columns; some units arrive late.', deployment: 'meeting', deployNote: 'Diagonal deployment — split corner-to-corner with a 6″ no-man\'s-land each side of the line. Roll a D6 per unit; on a 1 it starts in reserve.' },
  { id: 'mountain-pass', name: 'Mountain Pass', ruleSlug: 'mountain-pass', d6: 5, blurb: 'A long, narrow battlefield — manoeuvring and outflanking are hard.', deployment: 'mountain-pass', deployNote: 'Deploy at the short ends (A & B), 24″ no-man\'s-land down the middle. The long edges count as impassable cliffs.' },
  { id: 'command-control', name: 'Command & Control', ruleSlug: 'command-and-control', d6: 6, blurb: 'Fight for control of a central landmark.', deployment: 'command-control', deployNote: 'Standard 12″ zones (A & B). A special feature (★) sits at the centre — hold it for +200 VP.' },
  // Battle March (small games, ~44×30″) — its own three deployment maps, rolled 1-2 / 3-4 / 5-6.
  { id: 'bm-pitched', name: 'Pitched Battle', ruleSlug: 'battle-march-deployment-maps', d6: 1, d6Label: '1-2', group: 'battle-march', blurb: 'Battle March — armies line up across a 15″ no-man\'s-land.', deployment: 'bm-pitched', deployNote: 'Battle March pitched battle: shallow deployment bands with a 15″ no-man\'s-land down the centre.' },
  { id: 'bm-close-encounter', name: 'Close Encounter', ruleSlug: 'battle-march-deployment-maps', d6: 3, d6Label: '3-4', group: 'battle-march', blurb: 'Battle March — deploy in opposite corners around a central feature.', deployment: 'bm-close-encounter', deployNote: 'Battle March Close Encounter: deploy in opposite quarter-table corners (A top-left, B bottom-right) around a central feature.' },
  { id: 'bm-opposed-flanks', name: 'Opposed Flanks', ruleSlug: 'battle-march-deployment-maps', d6: 5, d6Label: '5-6', group: 'battle-march', blurb: 'Battle March — slanted, opposed flank deployment.', deployment: 'bm-opposed-flanks', deployNote: 'Battle March Opposed Flanks: slanted opposed zones — A in the top-left flank, B in the bottom-right.' },
];

export const scenarioById = (id: string): ScenarioDef | undefined => SCENARIOS.find((s) => s.id === id);

/** A deployment zone (inches). Normally a rectangle (x,y,w,h); for diagonal maps it carries a
 *  polygon `poly` of [x,y] points instead. `kind` styles it: main = gold, flank = blue. */
export interface DeployZone { x: number; y: number; w: number; h: number; label: string; kind: 'main' | 'flank'; poly?: [number, number][] }
export interface DeploymentLayout {
  zones: DeployZone[];
  objective?: { x: number; y: number }; // central special feature (Command & Control)
  impassable?: { x: number; y: number; w: number; h: number }[]; // cliff strips (Mountain Pass)
}

// Units deploy in their own half but no closer than 12" to the centre line, so a deployment zone
// reaches from a player's edge to 12" short of the middle (a 24" no-man's-land down the centre). The
// depth therefore scales with the table — 12" on a 48"-deep table, deeper on bigger boards.
const CENTRE_KEEPOUT = 12;
const zoneDepth = (dim: number, keep = CENTRE_KEEPOUT) => Math.max(4, Math.min(dim / 2 - keep, dim / 2));

/** Build the deployment-zone layout for a scenario on a given table, mirroring the rulebook maps. */
export function deploymentFor(scenarioId: string, W: number, H: number): DeploymentLayout {
  const longHoriz = W >= H; // is the long table axis horizontal?
  // Standard deployment: a band along each LONG edge, reaching to 12" short of the centre line.
  const d = longHoriz ? zoneDepth(H) : zoneDepth(W);
  const standard: DeployZone[] = longHoriz
    ? [{ x: 0, y: 0, w: W, h: d, label: 'A', kind: 'main' }, { x: 0, y: H - d, w: W, h: d, label: 'B', kind: 'main' }]
    : [{ x: 0, y: 0, w: d, h: H, label: 'A', kind: 'main' }, { x: W - d, y: 0, w: d, h: H, label: 'B', kind: 'main' }];

  switch (scenarioById(scenarioId)?.deployment) {
    case 'command-control':
      return { zones: standard, objective: { x: W / 2, y: H / 2 } };

    case 'flank': {
      const f = 18; // 18" flank zones at the short ends; main forces deploy in the central band
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
      // The pass runs along the long axis: deploy at the SHORT ends, 24" no-man's-land down the middle.
      const dp = longHoriz ? zoneDepth(W) : zoneDepth(H);
      return longHoriz
        ? { zones: [{ x: 0, y: 0, w: dp, h: H, label: 'A', kind: 'main' }, { x: W - dp, y: 0, w: dp, h: H, label: 'B', kind: 'main' }] }
        : { zones: [{ x: 0, y: 0, w: W, h: dp, label: 'A', kind: 'main' }, { x: 0, y: H - dp, w: W, h: dp, label: 'B', kind: 'main' }] };
    }

    case 'break-point': {
      // Zones inset 9" from the side (short) edges and reaching to 9" of the centre line.
      const ins = 9, keep = 9;
      if (longHoriz) {
        const d = Math.max(4, H / 2 - keep);
        return { zones: [
          { x: ins, y: 0, w: Math.max(0, W - 2 * ins), h: d, label: 'A', kind: 'main' },
          { x: ins, y: H - d, w: Math.max(0, W - 2 * ins), h: d, label: 'B', kind: 'main' },
        ] };
      }
      const d = Math.max(4, W / 2 - keep);
      return { zones: [
        { x: 0, y: ins, w: d, h: Math.max(0, H - 2 * ins), label: 'A', kind: 'main' },
        { x: W - d, y: ins, w: d, h: Math.max(0, H - 2 * ins), label: 'B', kind: 'main' },
      ] };
    }

    case 'meeting': {
      // Diagonal deployment: split along the anti-diagonal (bottom-left → top-right), with a 6"
      // no-man's-land each side. Zone A is the top-left triangle, Zone B the bottom-right triangle.
      const delta = 6 * Math.sqrt(1 / (W * W) + 1 / (H * H)); // 6" perpendicular, in x/W+y/H units
      const cA = 1 - delta, cB = 1 + delta;
      const polyA: [number, number][] = [[0, 0], [W * cA, 0], [0, H * cA]];
      const polyB: [number, number][] = [[W, H * (cB - 1)], [W, H], [W * (cB - 1), H]];
      return { zones: [
        { x: 0, y: 0, w: W, h: H, label: 'A', kind: 'main', poly: polyA },
        { x: 0, y: 0, w: W, h: H, label: 'B', kind: 'main', poly: polyB },
      ] };
    }

    case 'bm-pitched': {
      // Battle March pitched battle: shallow bands off the long edges, ~15" no-man's-land (7.5" each).
      const dd = longHoriz ? zoneDepth(H, 7.5) : zoneDepth(W, 7.5);
      return longHoriz
        ? { zones: [{ x: 0, y: 0, w: W, h: dd, label: 'A', kind: 'main' }, { x: 0, y: H - dd, w: W, h: dd, label: 'B', kind: 'main' }] }
        : { zones: [{ x: 0, y: 0, w: dd, h: H, label: 'A', kind: 'main' }, { x: W - dd, y: 0, w: dd, h: H, label: 'B', kind: 'main' }] };
    }

    case 'bm-close-encounter':
      // Opposite quarter-table corners (A top-left, B bottom-right) around a central feature.
      return {
        zones: [
          { x: 0, y: 0, w: W / 2, h: H / 2, label: 'A', kind: 'main' },
          { x: W / 2, y: H / 2, w: W / 2, h: H / 2, label: 'B', kind: 'main' },
        ],
        objective: { x: W / 2, y: H / 2 },
      };

    case 'bm-opposed-flanks':
      // Slanted opposed corners: A is the top-left flank triangle, B the bottom-right.
      return { zones: [
        { x: 0, y: 0, w: W, h: H, label: 'A', kind: 'main', poly: [[0, 0], [W, 0], [0, 0.4 * H]] },
        { x: 0, y: 0, w: W, h: H, label: 'B', kind: 'main', poly: [[W, H], [0, H], [W, 0.6 * H]] },
      ] };

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
  { id: 'marsh', label: 'Marsh / Water', color: '#4f7b8a', ruleSlug: 'dangerous-terrain', defaultTrait: 'dangerous' },
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

// Common table sizes (inches). Mountain Pass is long & narrow per its rules; 44×30 is the small
// Battle March board.
export const TABLE_PRESETS: { label: string; w: number; h: number }[] = [
  { label: "6×4′", w: 72, h: 48 },
  { label: "4×4′", w: 48, h: 48 },
  { label: "6×3′", w: 72, h: 36 },
  { label: "8×4′", w: 96, h: 48 },
  { label: "4×6′", w: 48, h: 72 },
  { label: "44×30″", w: 44, h: 30 },
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

/** A piece to be positioned: carries everything except x/y (and an optional id to preserve). */
interface PlaceSpec { id?: string; type: string; w: number; h: number; difficult?: boolean; dangerous?: boolean }

// Lay out the given specs with 180°-rotational symmetry about the table centre, so both players face
// a mirrored, balanced battlefield. Features are paired up (same type where counts allow): one of
// each pair goes in the top half (spread out, ≥12" between centres where it fits), its partner at the
// point-mirrored position. An odd leftover sits in the dead centre (self-symmetric).
function placeSpecs(specs: PlaceSpec[], W: number, H: number): TerrainPiece[] {
  const margin = 3;
  const ordered = [...specs].sort((a, b) => a.type.localeCompare(b.type)); // group types → same-type pairs
  const out: TerrainPiece[] = [];
  const N = ordered.length;
  const pairCount = Math.floor(N / 2);
  const hasCentre = N % 2 === 1;

  // Spread the primary centres across the TOP half (their mirrors fill the bottom half).
  const primaryCentres: { cx: number; cy: number }[] = [];
  const stages = [MIN_SPACING, 9, 6, 3, 0];
  for (let i = 0; i < pairCount; i++) {
    const { w: tw, h: th } = ordered[i * 2];
    let c: { cx: number; cy: number } | null = null;
    for (const spacing of stages) {
      for (let t = 0; t < 80 && !c; t++) {
        const cx = rnd(margin + tw / 2, W - margin - tw / 2);
        const cy = rnd(margin + th / 2, Math.max(margin + th / 2, H / 2 - 2));
        if (primaryCentres.every((p) => Math.hypot(p.cx - cx, p.cy - cy) >= spacing)) c = { cx, cy };
      }
      if (c) break;
    }
    primaryCentres.push(c ?? { cx: W / 2, cy: Math.max(margin, H / 4) });
  }

  const place = (spec: PlaceSpec, cx: number, cy: number) => {
    out.push({
      id: spec.id ?? newTerrainId(), type: spec.type,
      x: clamp(Math.round(cx - spec.w / 2), 0, Math.max(0, W - spec.w)),
      y: clamp(Math.round(cy - spec.h / 2), 0, Math.max(0, H - spec.h)),
      w: spec.w, h: spec.h, difficult: spec.difficult, dangerous: spec.dangerous,
    });
  };

  for (let i = 0; i < pairCount; i++) {
    const { cx, cy } = primaryCentres[i];
    place(ordered[i * 2], cx, cy);                 // primary (top half)
    place(ordered[i * 2 + 1], W - cx, H - cy);     // partner at the point-mirrored position
  }
  if (hasCentre) place(ordered[N - 1], W / 2, H / 2);
  return out;
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
