// Objective-VP per campagne-scenario / secondary objective (optie B). De getallen komen LETTERLIJK
// uit tow.whfb.app (via OWC's gescrapete public/rules.json — Warhammer: The Old World). Niets verzonnen.
// Elke entry = één te scoren objective; de speler zet 'm per kant aan (toggle) of telt 'm (count) —
// bordafhankelijk (wie hield wat), dus de app rekent alleen, ze is geen scheidsrechter.
//
// Bronnen: domination (p.30, +100/quarter, +50 als US>2×, +100 uncontested) · strategic-locations
// (p.30, +30 per marker per beurt) · battle-march/victory-points-battle-march (p.27, treasure troves
// +10 per trove per speler-turn / strategic landmark +25 per speler-turn) ·
// special-features-secondary-objectives (p.29, +200 at end) ·
// baggage-trains (p.28, +100 held / +250 destroyed) · scenario-2-king-of-the-hill (p.21, +100/turn) ·
// command-and-control (+200 feature at end).

export type ObjKind = 'toggle' | 'count';

export interface ObjectiveDef {
  /** Stabiele sleutel binnen tracker.bonus[side].objectives. */
  key: string;
  /** Korte UI-tekst (wat je scoorde). */
  label: string;
  /** toggle = vast bedrag aan/uit; count = aantal × `vp`. */
  kind: ObjKind;
  /** toggle: het bedrag; count: het bedrag per getelde eenheid. */
  vp: number;
  /** count: wat je telt (bv. "turns", "markers held/turn", "quarters"). */
  countLabel?: string;
  /** Regeltekst als reminder (letterlijk van de wiki). */
  rule: string;
}

// ── Battle March-objectives (Act 1-2) — General's Companion p.27, /battle-march/victory-points-
// battle-march. Dit zijn ECHTE VP-posten die het gewone formaat niet kent, en ze telden hier tot
// 21-08-2026 niet mee: de campagne wijst per battle óf treasure troves óf één strategic landmark toe
// (secondary-id `bm-troves-2` / `bm-troves-3` / `bm-landmark`), maar OBJECTIVE_VP kende die sleutels
// niet, dus kreeg de speler geen enkele control te zien en moest hij het totaal in het vrije
// "Other objective VP"-veld typen. Zelfde per-turn-patroon als STRAT: je telt TURN-EENHEDEN.
//
// Eén gedeelde sleutel per soort (net als STRAT over strategic-2/3/4): het aantal troves op tafel
// verandert de bordopstelling, niet de rekensom (+10 per trove per turn). Zo blijft een al ingevoerd
// aantal staan als de sheet zou wijzigen.
const TROVES = (aantal: number): ObjectiveDef[] => [
  {
    key: 'bm-troves',
    label: 'Trove-turns controlled',
    kind: 'count',
    vp: 10,
    countLabel: 'trove-turns',
    rule: `+10 VP for each treasure trove you control at the end of each player’s turn (${aantal} troves on the table — count the total trove-turns you held).`,
  },
];

const STRAT: ObjectiveDef[] = [
  { key: 'strat', label: 'Marker-turns controlled', kind: 'count', vp: 30, countLabel: 'marker-turns', rule: '+30 VP per objective marker you control at the end of each player’s turn (count total marker-turns).' },
];

// Sleutel = scenario-id (zoals `mp-king-of-the-hill`) OF secondary-id (`domination` …), zoals de
// campagne ze in de BattleSheet zet. Scenario’s zonder eigen objective-VP staan hier niet in.
export const OBJECTIVE_VP: Record<string, ObjectiveDef[]> = {
  // ── Scenario-objectives ──
  'mp-king-of-the-hill': [
    { key: 'koth', label: 'Turns holding the central hill', kind: 'count', vp: 100, countLabel: 'turns', rule: '+100 VP for whoever controls the central hill at the end of each player’s turn.' },
  ],
  'command-control': [
    { key: 'cc', label: 'Controlled the central feature at the end', kind: 'toggle', vp: 200, rule: '+200 VP for controlling the special feature at the end of the battle.' },
  ],
  // ── Secondary objectives (matched-play overlays die de campagne kan toewijzen) ──
  'special-feature': [
    { key: 'sf', label: 'Controlled the special feature at the end', kind: 'toggle', vp: 200, rule: '+200 VP if you control the special feature at the end of the battle.' },
  ],
  'domination': [
    { key: 'dom', label: 'Table quarters controlled', kind: 'count', vp: 100, countLabel: 'quarters', rule: '+100 VP per quarter you control at the end (add +50 if your Unit Strength there is over twice the enemy’s, +100 if uncontested — via Objective VP).' },
  ],
  'strategic-2': STRAT,
  'strategic-3': STRAT,
  'strategic-4': STRAT,
  // ── Battle March-objectives (Act 1-2) ──
  'bm-troves-2': TROVES(2),
  'bm-troves-3': TROVES(3),
  'bm-landmark': [
    { key: 'bm-landmark', label: 'Landmark-turns controlled', kind: 'count', vp: 25, countLabel: 'turns', rule: '+25 VP if you control the strategic landmark at the end of each player’s turn (count the total turns you held it).' },
  ],
  'baggage-trains': [
    { key: 'bag-hold', label: 'Held your own baggage train', kind: 'toggle', vp: 100, rule: '+100 VP per baggage train you control at the end of the battle.' },
    { key: 'bag-kill', label: 'Destroyed the enemy baggage train', kind: 'toggle', vp: 250, rule: '+250 VP for destroying your opponent’s baggage train.' },
  ],
};

/** Verzamel de objectives voor een battle (scenario-id + secondary-ids), ontdubbeld op key. */
export function objectivesVoor(scenarioId: string | null | undefined, secondaries: string[] | null | undefined): ObjectiveDef[] {
  const uit: ObjectiveDef[] = [];
  const gezien = new Set<string>();
  for (const id of [scenarioId, ...(secondaries ?? [])]) {
    if (!id) continue;
    for (const def of OBJECTIVE_VP[id] ?? []) {
      if (gezien.has(def.key)) continue;
      gezien.add(def.key);
      uit.push(def);
    }
  }
  return uit;
}
