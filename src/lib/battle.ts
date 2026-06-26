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
//  Matched Play guide scenarios:
//  king-of-hill     – bands inset 8" from the side edges, 10" keepout, a large central hill
//  drawn-battlelines– diagonal (A top-right / B bottom-left), 24" no-man's-land each side
//  close-quarters   – bands inset 6" from the side edges, 12" keepout, short edges impassable
//  chance-encounter – four corner quarters (A1/A2 vs B1/B2) + an 18" central no-deploy circle
//  encirclement     – staggered offset bands (A top-left, B bottom-right)
export type DeploymentKind = 'standard' | 'command-control' | 'flank' | 'mountain-pass' | 'meeting' | 'break-point' | 'bm-pitched' | 'bm-opposed-flanks' | 'bm-close-encounter' | 'king-of-hill' | 'drawn-battlelines' | 'close-quarters' | 'chance-encounter' | 'encirclement';

export interface ScenarioDef {
  id: string;
  name: string;
  ruleSlug: string; // the rules.json page with the full scenario rules + deployment map
  d6: number;        // its number on the rulebook's D6 pitched-battle table
  d6Label?: string;  // shown on the badge instead of d6 (e.g. Battle March's "1-2")
  group?: 'pitched' | 'battle-march' | 'matched-play'; // which list it appears under (default 'pitched')
  blurb: string;
  deployment: DeploymentKind;
  deployNote: string; // short caption shown under the board explaining the deployment
  gameEnd?: string;   // recommended game-end conditions (matched play)
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
  // Matched Play Guide — six tournament scenarios, rolled/chosen at the start of each round.
  { id: 'mp-field-of-glory', name: 'Upon the Field of Glory', ruleSlug: 'scenario-1-upon-the-field-of-glory', d6: 1, group: 'matched-play', blurb: 'A straight, open clash — full strength on both sides.', deployment: 'standard', deployNote: 'Standard deployment — within 12″ of the centre line (zones A & B).', gameEnd: 'Fixed Turn Limit, Random Game Length, or Break Point.' },
  { id: 'mp-king-of-the-hill', name: 'King of the Hill', ruleSlug: 'scenario-2-king-of-the-hill', d6: 2, group: 'matched-play', blurb: 'Seize and hold the great central hill.', deployment: 'king-of-hill', deployNote: 'Zones inset 8″ from the side edges, 10″ from the centre. A large hill sits dead centre — hold it for +100 VP each turn.', gameEnd: 'Random Game Length, or Break Point.' },
  { id: 'mp-drawn-battlelines', name: 'Drawn Battlelines', ruleSlug: 'scenario-3-drawn-battlelines', d6: 3, group: 'matched-play', blurb: 'Diagonal lines; some troops arrive as reserves.', deployment: 'drawn-battlelines', deployNote: 'Diagonal deployment (A top-right, B bottom-left), 24″ no-man\'s-land each side. Roll a D6 — on a 1 each player holds an infantry/cavalry unit in reserve.', gameEnd: 'Fixed Turn Limit, or Random Game Length.' },
  { id: 'mp-close-quarters', name: 'Close Quarters', ruleSlug: 'scenario-4-close-quarters', d6: 4, group: 'matched-play', blurb: 'A cramped pass — the side edges are sheer cliffs.', deployment: 'close-quarters', deployNote: 'Zones inset 6″ from the side edges, 12″ from the centre. Bottleneck: the short edges count as impassable cliffs.', gameEnd: 'Fixed Turn Limit, or Break Point.' },
  { id: 'mp-chance-encounter', name: 'A Chance Encounter', ruleSlug: 'scenario-5-a-chance-encounter', d6: 5, group: 'matched-play', blurb: 'A fog-of-war clash from four corners.', deployment: 'chance-encounter', deployNote: 'Deploy in two opposite quarter-corners (you take both A, or both B). The 18″ circle in the centre is no-deploy.', gameEnd: 'Random Game Length, or Break Point.' },
  { id: 'mp-encirclement', name: 'Encirclement', ruleSlug: 'scenario-6-encirclement', d6: 6, group: 'matched-play', blurb: 'Staggered lines invite a flanking encirclement.', deployment: 'encirclement', deployNote: 'Staggered zones — A runs along the top (stopping 12″ short of the right), B along the bottom (starting 12″ from the left), each 12″ from the centre.', gameEnd: 'Fixed Turn Limit, or Random Game Length.' },
];

export const scenarioById = (id: string): ScenarioDef | undefined => SCENARIOS.find((s) => s.id === id);

/** A deployment zone (inches). Normally a rectangle (x,y,w,h); for diagonal maps it carries a
 *  polygon `poly` of [x,y] points instead. `kind` styles it: main = gold, flank = blue. */
export interface DeployZone { x: number; y: number; w: number; h: number; label: string; kind: 'main' | 'flank'; poly?: [number, number][] }
export interface DeploymentLayout {
  zones: DeployZone[];
  objective?: { x: number; y: number }; // central special feature (Command & Control)
  impassable?: { x: number; y: number; w: number; h: number }[]; // cliff strips (Mountain Pass / Close Quarters)
  hill?: { x: number; y: number; w: number; h: number }; // a scenario's central hill (King of the Hill)
  keepoutCircle?: { x: number; y: number; r: number }; // central no-deploy circle (A Chance Encounter)
}

// ---- Secondary objectives (Matched Play Guide) -------------------------------------------------
// A board overlay chosen on top of a scenario. Stored as an id list in the battle state.
export interface SecondaryDef { id: string; name: string; ruleSlug: string; blurb: string }
export const SECONDARY_OBJECTIVES: SecondaryDef[] = [
  { id: 'special-feature', name: 'Special Feature', ruleSlug: 'special-features-secondary-objectives', blurb: 'A central impassable landmark; hold it with a Core unit.' },
  { id: 'domination', name: 'Domination', ruleSlug: 'domination', blurb: 'Control the four table quarters by Unit Strength.' },
  { id: 'strategic-2', name: 'Strategic Locations (2)', ruleSlug: 'strategic-locations', blurb: 'Two objective markers near the long edges.' },
  { id: 'strategic-3', name: 'Strategic Locations (3)', ruleSlug: 'strategic-locations', blurb: 'Three objective markers across the centre line.' },
  { id: 'strategic-4', name: 'Strategic Locations (4)', ruleSlug: 'strategic-locations', blurb: 'Four objective markers, one toward each edge.' },
  { id: 'baggage-trains', name: 'Baggage Trains', ruleSlug: 'baggage-trains', blurb: 'Each army has a supply base to defend (dangerous terrain).' },
];
export const secondaryById = (id: string): SecondaryDef | undefined => SECONDARY_OBJECTIVES.find((s) => s.id === id);

/** Board overlay for the chosen secondary objectives: the four-quarter split (Domination), a central
 *  special feature, objective markers (Strategic Locations) and baggage-train bases. */
export interface SecondaryLayout {
  quarters: boolean;
  specialFeature?: { x: number; y: number };
  objectives: { x: number; y: number; n: number }[];
  baggage: { x: number; y: number; w: number; h: number }[];
}

export function secondaryLayout(ids: string[] | undefined, W: number, H: number): SecondaryLayout {
  const set = new Set(ids || []);
  const out: SecondaryLayout = { quarters: set.has('domination'), objectives: [], baggage: [] };
  if (set.has('special-feature')) out.specialFeature = { x: W / 2, y: H / 2 };
  // Strategic Locations marker placements (rulebook): halfway between centre and an edge midpoint.
  if (set.has('strategic-2')) out.objectives = [{ x: W / 2, y: H / 4, n: 1 }, { x: W / 2, y: (3 * H) / 4, n: 2 }];
  else if (set.has('strategic-3')) out.objectives = [{ x: W / 2, y: H / 2, n: 1 }, { x: W / 4, y: H / 2, n: 2 }, { x: (3 * W) / 4, y: H / 2, n: 3 }];
  else if (set.has('strategic-4')) out.objectives = [{ x: W / 2, y: H / 4, n: 1 }, { x: (3 * W) / 4, y: H / 2, n: 2 }, { x: W / 2, y: (3 * H) / 4, n: 3 }, { x: W / 4, y: H / 2, n: 4 }];
  if (set.has('baggage-trains')) {
    const bw = 4, bh = 2.4; // ~100×60mm
    out.baggage = [{ x: W / 2 - bw / 2, y: 5, w: bw, h: bh }, { x: W / 2 - bw / 2, y: H - 5 - bh, w: bw, h: bh }];
  }
  return out;
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

    case 'king-of-hill': {
      // Bands inset 8" from the side edges, reaching to 10" of the centre, plus a large central hill.
      const ins = 8, dh = longHoriz ? zoneDepth(H, 10) : zoneDepth(W, 10);
      const zones: DeployZone[] = longHoriz
        ? [{ x: ins, y: 0, w: Math.max(0, W - 2 * ins), h: dh, label: 'A', kind: 'main' }, { x: ins, y: H - dh, w: Math.max(0, W - 2 * ins), h: dh, label: 'B', kind: 'main' }]
        : [{ x: 0, y: ins, w: dh, h: Math.max(0, H - 2 * ins), label: 'A', kind: 'main' }, { x: W - dh, y: ins, w: dh, h: Math.max(0, H - 2 * ins), label: 'B', kind: 'main' }];
      const hw = longHoriz ? 18 : 12, hh = longHoriz ? 12 : 18; // 12×18 hill, long side along the long axis
      return { zones, hill: { x: W / 2 - hw / 2, y: H / 2 - hh / 2, w: hw, h: hh } };
    }

    case 'close-quarters': {
      // Bands inset 6" from the side edges, 12" keepout; the short edges count as impassable cliffs.
      const ins = 6, t = 1.6;
      if (longHoriz) {
        return {
          zones: [{ x: ins, y: 0, w: Math.max(0, W - 2 * ins), h: d, label: 'A', kind: 'main' }, { x: ins, y: H - d, w: Math.max(0, W - 2 * ins), h: d, label: 'B', kind: 'main' }],
          impassable: [{ x: 0, y: 0, w: t, h: H }, { x: W - t, y: 0, w: t, h: H }],
        };
      }
      return {
        zones: [{ x: 0, y: ins, w: d, h: Math.max(0, H - 2 * ins), label: 'A', kind: 'main' }, { x: W - d, y: ins, w: d, h: Math.max(0, H - 2 * ins), label: 'B', kind: 'main' }],
        impassable: [{ x: 0, y: 0, w: W, h: t }, { x: 0, y: H - t, w: W, h: t }],
      };
    }

    case 'chance-encounter':
      // Four corner quarters: A takes both A-corners (diagonal), B both B-corners; 18" central circle no-deploy.
      return {
        zones: [
          { x: 0, y: 0, w: W / 2, h: H / 2, label: 'B1', kind: 'flank' },
          { x: W / 2, y: 0, w: W / 2, h: H / 2, label: 'A2', kind: 'main' },
          { x: 0, y: H / 2, w: W / 2, h: H / 2, label: 'A1', kind: 'main' },
          { x: W / 2, y: H / 2, w: W / 2, h: H / 2, label: 'B2', kind: 'flank' },
        ],
        keepoutCircle: { x: W / 2, y: H / 2, r: 9 },
      };

    case 'encirclement': {
      // Staggered offset bands: A along the top (stopping 12" short of the far end), B along the
      // bottom (starting 12" in), each 12" from the centre.
      const off = 12;
      if (longHoriz) {
        return { zones: [
          { x: 0, y: 0, w: Math.max(0, W - off), h: d, label: 'A', kind: 'main' },
          { x: off, y: H - d, w: Math.max(0, W - off), h: d, label: 'B', kind: 'main' },
        ] };
      }
      return { zones: [
        { x: 0, y: 0, w: d, h: Math.max(0, H - off), label: 'A', kind: 'main' },
        { x: W - d, y: off, w: d, h: Math.max(0, H - off), label: 'B', kind: 'main' },
      ] };
    }

    case 'drawn-battlelines': {
      // Diagonal along the MAIN diagonal: A is the top-right triangle, B the bottom-left, with a 24"
      // no-man's-land each side.
      const a = Math.min(0.95, 24 * Math.sqrt(1 / (W * W) + 1 / (H * H)));
      return { zones: [
        { x: 0, y: 0, w: W, h: H, label: 'A', kind: 'main', poly: [[W * a, 0], [W, 0], [W, H * (1 - a)]] },
        { x: 0, y: 0, w: W, h: H, label: 'B', kind: 'main', poly: [[0, H * a], [0, H], [W * (1 - a), H]] },
      ] };
    }

    default:
      return { zones: standard };
  }
}

/** Dimension hints for the board: the depth of each deployment zone and the no-man's-land between
 *  them, derived from the two main rectangular zones when they form a band pair. `axis` is the
 *  direction the depths/gap are measured along ('v' = stacked top/bottom, 'h' = side by side);
 *  `lo`/`hi` give the zones' shared extent on the OTHER axis so the ruler can be placed clear. */
export interface BandMeasure { axis: 'v' | 'h'; depthA: number; depthB: number; gap: number; gapStart: number; gapEnd: number; lo: number; hi: number }
export function bandMeasure(layout: DeploymentLayout): BandMeasure | null {
  const mains = layout.zones.filter((z) => z.kind === 'main' && !z.poly);
  if (mains.length !== 2) return null;
  const [p, q] = mains;
  const xOverlap = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
  const yOverlap = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
  const minW = Math.min(p.w, q.w), minH = Math.min(p.h, q.h);
  // Vertical bands: one above the other, horizontally aligned (so they're a band pair, not quadrants).
  if (yOverlap <= 1 && xOverlap > 0.5 * minW) {
    const [top, bot] = p.y <= q.y ? [p, q] : [q, p];
    return { axis: 'v', depthA: top.h, depthB: bot.h, gapStart: top.y + top.h, gapEnd: bot.y, gap: Math.max(0, bot.y - (top.y + top.h)), lo: Math.max(top.x, bot.x), hi: Math.min(top.x + top.w, bot.x + bot.w) };
  }
  // Horizontal bands: side by side, vertically aligned.
  if (xOverlap <= 1 && yOverlap > 0.5 * minH) {
    const [left, right] = p.x <= q.x ? [p, q] : [q, p];
    return { axis: 'h', depthA: left.w, depthB: right.w, gapStart: left.x + left.w, gapEnd: right.x, gap: Math.max(0, right.x - (left.x + left.w)), lo: Math.max(left.y, right.y), hi: Math.min(left.y + left.h, right.y + right.h) };
  }
  return null;
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
  secondaries?: string[]; // chosen secondary-objective ids (Matched Play)
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
  // Guide: a terrain feature is 2"–12" across. Cap to ~⅓ of the short edge so a 12" feature doesn't
  // swamp a small table.
  const maxSize = Math.max(3, Math.min(12, Math.floor(Math.min(w, h) / 3)));
  const specs: PlaceSpec[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(count)); i++) {
    const tt = pool[Math.floor(Math.random() * pool.length)];
    specs.push({ type: tt.id, w: Math.round(rnd(2, maxSize)), h: Math.round(rnd(2, maxSize)), difficult: tt.defaultTrait === 'difficult', dangerous: tt.defaultTrait === 'dangerous' });
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
