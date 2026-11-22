import type { ArmyUnit, Rule, UnitProfile } from '../types';
import { unitWeapons, effectiveMelee, statValue, SHOOTING_MODS, type WeaponProfile } from './weaponStats';
import { unitArmourSave, getRuleIndex, resolveRuleSlug, unitSize, woundsPerModel } from './armyRules';
import { wapensPerRij, rijMeleeWapen, type EquipmentLine, type RijWapens } from './unitDetails';

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// MATHHAMMER — expected wounds (and the exact distribution of wounds) for one unit attacking another,
// shooting or in close combat. Pure, deterministic maths on the device.
//
// RULE FIDELITY: every mechanic below comes from the verbatim rule text in public/rules.json. Each
// implemented rule carries its slug and the sentence it is based on. A rule that is not reviewed, is
// ambiguous, or depends on something the app cannot know (and cannot be offered as a toggle) is NOT
// guessed: it is reported in `nietMeegerekend`.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export type AanvalSoort = 'schieten' | 'combat';

/** A situational toggle the table state decides (the app cannot know it). */
export interface Situatie { key: string; label: string; standaard: boolean }

export interface AanvalOpties {
  soort: AanvalSoort;
  /** How many of the attacker's models attack / shoot. UI passes a stepper value; default = models alive. */
  modellen: number;
  /** WeaponProfile.slug of the chosen weapon; omit = same default CombatStats uses. */
  wapenSlug?: string;
  /** Shooting: fire the Multiple Shots / Rapid Fire mode. Default true when the weapon has it (as CombatStats). */
  multi?: boolean;
  /** Shooting: extra To Hit penalty the player dialled in (positive = harder), on top of situaties. */
  toHitMod?: number;
  /** Values for the toggles returned by `situatiesVoor`. Missing key = that situatie's `standaard`. */
  situaties?: Record<string, boolean>;
  /** Wounds the ATTACKER (a single multi-Wound model) has left. Only used for "Extra Attacks (+remaining
   *  Wounds)"; omit = its full Wounds. */
  aanvallerWounds?: number;
  /** Models of the DEFENDER still alive (for capping / models-killed). Omit = full unit. */
  doelwitModellen?: number;
  /** Files: how many models wide the attacker stands (its front rank). When given, `modellen` means ALL models
   *  alive in the unit and the engine works out who attacks / shoots from the rules. Omit = old behaviour
   *  (`modellen` models attack with full Attacks). */
  breedte?: number;
  /** The attacker's equipment PER MODEL, verbatim from public/unit-details.json (unitDetails.equipmentVoor).
   *  Given: each profile row fights with its own weapon (the chosen `wapenSlug` only where that model carries
   *  it). Omit / null = old behaviour (every wielder row takes the chosen weapon). The engine never fetches. */
  uitrusting?: EquipmentLine[] | null;
}

export interface Stap {
  label: string;
  worp: string;
  /** probability an attack passes this step (0..1); for saves: probability the save FAILS */
  kans: number;
  /** expected number remaining after this step */
  aantal: number;
  toelichting?: string;
}

export interface AanvalsGroep {
  naam: string;
  aanvallen: string;
  stappen: Stap[];
  wounds: number;
  /** Combat exchange only: position of this group in `GevechtResultaat.volgorde` (0 = strikes first). */
  slag?: number;
  /** Combat exchange only, and only when casualties cost this group attacks: how many attacks it would have
   *  made at full strength, and how many of those are lost on average because the models were slain before
   *  their Initiative step (we-cant-all-fight). `aanvallen` then reads "0.7 of 4". */
  mogelijk?: number;
  verloren?: number;
}

export interface MathResultaat {
  wounds: number;
  verdeling: number[] | null;
  modellenGedood: number | null;
  groepen: AanvalsGroep[];
  meegerekend: { regel: string; effect: string }[];
  nietMeegerekend: { regel: string; van: 'aanvaller' | 'wapen' | 'doelwit'; reden: string }[];
  onmogelijk?: string;
}

// ───────────────────────────── Charts (verified against rules.json) ─────────────────────────────
// to-hit-chart "To Hit Chart" and to-wound-chart "To Wound Chart", verbatim. grid[attacker−1][defender−1]
// → required D6 roll; 0 in the wound chart is the chart's "-" (cannot wound — too-tough-to-wound: "If
// your Strength is six or more points lower than your target's Toughness characteristic, you cannot
// wound them."). A test re-parses both charts from rules.json and compares.
export const TO_HIT_CHART: number[][] = [
  [4, 4, 5, 5, 5, 5, 5, 5, 5, 5],
  [3, 4, 4, 4, 5, 5, 5, 5, 5, 5],
  [2, 3, 4, 4, 4, 4, 5, 5, 5, 5],
  [2, 3, 3, 4, 4, 4, 4, 4, 5, 5],
  [2, 2, 3, 3, 4, 4, 4, 4, 4, 4],
  [2, 2, 3, 3, 3, 4, 4, 4, 4, 4],
  [2, 2, 2, 3, 3, 3, 4, 4, 4, 4],
  [2, 2, 2, 3, 3, 3, 3, 4, 4, 4],
  [2, 2, 2, 2, 3, 3, 3, 3, 4, 4],
  [2, 2, 2, 2, 3, 3, 3, 3, 3, 4],
];
export const TO_WOUND_CHART: number[][] = [
  [4, 5, 6, 6, 6, 6, 0, 0, 0, 0],
  [3, 4, 5, 6, 6, 6, 6, 0, 0, 0],
  [2, 3, 4, 5, 6, 6, 6, 6, 0, 0],
  [2, 2, 3, 4, 5, 6, 6, 6, 6, 0],
  [2, 2, 2, 3, 4, 5, 6, 6, 6, 6],
  [2, 2, 2, 2, 3, 4, 5, 6, 6, 6],
  [2, 2, 2, 2, 2, 3, 4, 5, 6, 6],
  [2, 2, 2, 2, 2, 2, 3, 4, 5, 6],
  [2, 2, 2, 2, 2, 2, 2, 3, 4, 5],
  [2, 2, 2, 2, 2, 2, 2, 2, 3, 4],
];
const chartIdx = (n: number) => Math.max(1, Math.min(10, n)) - 1;

// ───────────────────────────── Rule registry ─────────────────────────────
// Three classes, keyed by RULE SLUG (= the normalised rule name, resolved with `resolveRuleSlug`, so
// "Hatred (High Elves)" and "Murderous {renegade}" land on `hatred` / `murderous-renegade`).
//   1. TELT        — implemented below; changes the numbers. `kant` = whose rule it is to matter.
//   2. GEEN_EFFECT — rule text read; it does not touch hit/wound/save rolls or attack counts.
//   3. anything else → nietMeegerekend (never silently dropped).
type Kant = 'aanvaller' | 'doelwit' | 'beide';
const TELT: Record<string, { kant: Kant; soort?: AanvalSoort }> = {
  // armour-bane: "If a model with this special rule rolls a natural 6 when making a roll To Wound, the Armour
  // Piercing characteristic of its weapon is improved by the amount shown in brackets"
  'armour-bane': { kant: 'aanvaller' },
  // poisoned-attacks: "If a model with Poisoned Attacks rolls a natural 6 when making a roll To Hit, it may apply
  // a +2 modifier to that hit's roll To Wound." — not with magic weapons, not on 7+ To Hit or automatic hits.
  'poisoned-attacks': { kant: 'aanvaller' },
  // killing-blow: "...natural 6 when making a roll To Wound for an attack made in combat ... infantry or cavalry
  // are not permitted an armour or Regeneration save ... it loses all of its remaining Wounds."
  'killing-blow': { kant: 'aanvaller', soort: 'combat' },
  // cleaving-blow: "...regular infantry, heavy infantry, light cavalry, heavy cavalry or war beasts are not
  // permitted an armour or Regeneration save against a Cleaving Blow"
  'cleaving-blow': { kant: 'aanvaller', soort: 'combat' },
  // monster-slayer: "Enemy models whose troop type is monster are not permitted an armour or Regeneration save
  // ... it loses all of its remaining Wounds."
  'monster-slayer': { kant: 'aanvaller', soort: 'combat' },
  // multiple-wounds: "Each unsaved wound inflicted by an attack with this special rule is multiplied by the
  // number shown in brackets ... Where the number of Multiple Wounds is generated by a dice roll, roll separately
  // for each unsaved wound."
  'multiple-wounds': { kant: 'aanvaller' },
  // extra-attacks: "A model with this special rule has a modifier to its Attacks characteristic"
  'extra-attacks': { kant: 'aanvaller', soort: 'combat' },
  // flaming-attacks: "Any attack made or hits caused by a model with this special rule ... is a 'Flaming'
  // attack." — counts only against Flammable ("cannot make a Regeneration save against a wound caused by a
  // Flaming attack").
  'flaming-attacks': { kant: 'aanvaller' },
  // magical-attacks: "Any attack made or hit caused by a model with this special rule, or made using a weapon
  // with this special rule, is a 'Magical' attack. *... as are any hits caused by magic items.*" — counts
  // against Ethereal, Warp-spawned, Daemonic and non-magical-only armour bonuses.
  'magical-attacks': { kant: 'aanvaller' },
  // hatred: "may re-roll any failed rolls To Hit made against a hated enemy during the first round of combat"
  hatred: { kant: 'aanvaller', soort: 'combat' },
  // eternal-hatred: "Against High Elves, this model's Hatred applies in every round of close combat, not just the
  // first. Note that this special rule does not apply to this model's mount"
  'eternal-hatred': { kant: 'aanvaller', soort: 'combat' },
  // murderous: "...fighting with a hand weapon may re-roll any rolls To Wound of a natural 1 ... only applies to a
  // single, non-magical hand weapon and does not apply to a model's mount"
  murderous: { kant: 'aanvaller', soort: 'combat' },
  // murderous-renegade: "In the first round of combat, a model with this special rule may re-roll any rolls To
  // Wound of a natural 1 ... only applies to non-magical weapons and does not apply to a model's mount"
  'murderous-renegade': { kant: 'aanvaller', soort: 'combat' },
  // impact-hits: "Impact Hits can only be made by a charging model that moved 3\" or more ... They hit
  // automatically and use the unmodified Strength of the model making them."
  'impact-hits': { kant: 'aanvaller', soort: 'combat' },
  // stomp-attacks: "Stomp Attacks can only be made by a model that is in base contact with the enemy ... They hit
  // automatically and use the unmodified Strength of the model making them."
  'stomp-attacks': { kant: 'aanvaller', soort: 'combat' },
  // quick-shot: "does not suffer the usual -1 To Hit modifier for Moving and Shooting"
  'quick-shot': { kant: 'aanvaller', soort: 'schieten' },
  // ponderous: "suffers a To Hit modifier of -2 for Moving and Shooting, rather than the usual -1"
  ponderous: { kant: 'aanvaller', soort: 'schieten' },
  // move-or-shoot: "cannot be used in the Shooting phase if the model equipped with it moved for any reason"
  'move-or-shoot': { kant: 'aanvaller', soort: 'schieten' },
  // ignores-cover: "it ignores any To Hit modifiers caused by partial or full cover"
  'ignores-cover': { kant: 'aanvaller', soort: 'schieten' },
  // multiple-shots: "fired a number of times ... each roll To Hit suffers an additional -1 To Hit modifier ...
  // Where the number of Multiple Shots is generated by a dice roll, roll separately for each model."
  'multiple-shots': { kant: 'aanvaller', soort: 'schieten' },
  // furious-charge: "During a turn in which it made a charge move of 3\" or more, ... gains a +1 modifier to its
  // Attacks characteristic."
  'furious-charge': { kant: 'aanvaller', soort: 'combat' },
  // frenzy: "During a turn in which it made a charge move ... a Frenzied model has a +1 modifier to its Attacks
  // characteristic. This modifier does not apply to the model's mount ... to the beasts that draw it" — and "If
  // the majority of the models in a unit are Frenzied, the unit automatically passes any Fear ... tests"
  frenzy: { kant: 'aanvaller', soort: 'combat' },
  // random-attacks: "a dice roll is given ... roll the dice to determine the number of attacks it will make ...
  // roll separately for each"
  'random-attacks': { kant: 'aanvaller', soort: 'combat' },
  // martial-prowess: "During the first round of combat, a unit with this special rule gains a +1 modifier to its
  // Weapon Skill characteristic."
  'martial-prowess': { kant: 'aanvaller', soort: 'combat' },
  // primal-fury: "A unit subject to Primal Fury may re-roll any rolls To Hit of a natural 1." (subject after a
  // Leadership test → toggle)
  'primal-fury': { kant: 'aanvaller', soort: 'combat' },
  // ithilmar-weapons: "When engaged in combat ... fighting with a hand weapon may re-roll any rolls To Hit of a
  // natural 1 ... single, non-magical hand weapon and does not apply to a model's mount"
  'ithilmar-weapons': { kant: 'aanvaller', soort: 'combat' },
  // ensorcelled-weapons: "A hand weapon carried by a model with this special rule has the Magical Attacks special
  // rule and an Armour Piercing characteristic of -1 ... does not apply to a model's mount"
  'ensorcelled-weapons': { kant: 'aanvaller', soort: 'combat' },
  // khopesh: "A hand weapon carried by a model with this special rule has an Armour Piercing characteristic of
  // -1 ... does not apply to a model's mount"
  khopesh: { kant: 'aanvaller', soort: 'combat' },
  // gromril-weapons: "A hand weapon carried by a model with this special rule has an Armour Piercing
  // characteristic of -1 ... or if their hand weapon is inscribed with any Weapon runes, this special rule ceases"
  'gromril-weapons': { kant: 'aanvaller', soort: 'combat' },
  // choppas: "During a turn in which it charged, a model with this special rule may re-roll any rolls To Wound
  // of a natural 1, and improves the Armour Piercing characteristic of its weapon(s) by 1 ... non-magical
  // weapons and does not apply to a model's mount"
  choppas: { kant: 'aanvaller', soort: 'combat' },
  // foe-render: "Whilst subject to Primal Fury, a hand weapon carried by a model with this special rule has an
  // Armour Piercing characteristic of -2 ... does not apply to a model's mount"
  'foe-render': { kant: 'aanvaller', soort: 'combat' },
  // fear: "any models in the unit that direct their attacks against the Fear-causing enemy suffer a -1 modifier
  // to their rolls To Hit" (if the Fear test is failed → toggle). "Models that cause Fear are immune to Fear."
  fear: { kant: 'beide', soort: 'combat' },
  // terror: "Models that cause Terror also cause Fear"
  terror: { kant: 'beide', soort: 'combat' },
  // immune-to-psychology: "the unit automatically passes any Fear, Panic or Terror tests"
  'immune-to-psychology': { kant: 'aanvaller', soort: 'combat' },
  // fear-of-elves: "Elves of any type cause Fear in models with this special rule."
  'fear-of-elves': { kant: 'aanvaller', soort: 'combat' },
  // nehekharan-undead / necromantic-undead: "all Undead models have the following universal special rules: Fear
  // Immune To Psychology Unbreakable Unstable" — only the Fear part matters here.
  'nehekharan-undead': { kant: 'beide', soort: 'combat' },
  'necromantic-undead': { kant: 'beide', soort: 'combat' },
  // daemonic: "All Daemonic models have a 5+ Ward save against any wounds suffered that were caused by a
  // non-magical enemy attack. ... Fear Immune to Psychology Magical Attacks Unbreakable Warp-spawned"
  daemonic: { kant: 'beide' },
  // daemonic-renegade: "All Daemonic models have a 5+ Ward save against any wounds suffered. ... Fear Immune to
  // Psychology Magical Attacks Unbreakable Warp-spawned"
  'daemonic-renegade': { kant: 'beide' },
  // ward-saves: "A Ward save's Warding value is always given ... shown after the name of a special rule."
  // more-than-one-save: "makes its Armour Save roll first. If this is failed ... the model makes its Ward save.
  // ... If a model has more than one Ward save, simply use the best."
  'ward-saves': { kant: 'doelwit' },
  // regeneration: "Immediately after a Wound is lost ... may make a 'Regeneration save' ... the lost Wound is
  // recovered"
  regeneration: { kant: 'doelwit' },
  // flammable: "cannot make a Regeneration save against a wound caused by a Flaming attack."
  flammable: { kant: 'doelwit' },
  // warp-spawned: "cannot make a Regeneration save against a wound caused by a Magical attack."
  'warp-spawned': { kant: 'doelwit' },
  // ethereal: "Ethereal creatures can only be wounded by Magical attacks."
  ethereal: { kant: 'doelwit' },
  // large-target: "Large Targets do not benefit from partial or full cover."
  'large-target': { kant: 'doelwit', soort: 'schieten' },
  // enemy-fire-skirmishers (via the unit's Skirmishers rule): "enemy units shooting at a unit of Skirmishers
  // that consists entirely of models with a Unit Strength of 1 suffer a -1 To Hit modifier."
  skirmishers: { kant: 'doelwit', soort: 'schieten' },
  // press-of-battle / monstrous-ranks-renegade / phalanx: decide how many ranks fight when the caller gives Files
  // (`breedte`); quoted at the place they are used.
  'press-of-battle': { kant: 'aanvaller', soort: 'combat' },
  // strike-first / strike-last / elven-reflexes: change Initiative, so the order of blows in a combat exchange
  // (berekenGevecht); no effect on a one-way attack. Quoted where used (`initiatief`).
  'strike-first': { kant: 'aanvaller', soort: 'combat' },
  'strike-last': { kant: 'aanvaller', soort: 'combat' },
  'elven-reflexes': { kant: 'aanvaller', soort: 'combat' },
  'monstrous-ranks-renegade': { kant: 'aanvaller', soort: 'combat' },
  phalanx: { kant: 'aanvaller', soort: 'combat' },
  // armoured-hide / parry / sea-dragon-cloak / lion-cloak: valued by unitArmourSave (armyRules.ts), which quotes
  // the rules; the engine uses its general save in combat and its "vs (non-magical) shooting" save when shooting.
  'armoured-hide': { kant: 'doelwit' },
  parry: { kant: 'doelwit', soort: 'combat' },
  'sea-dragon-cloak': { kant: 'doelwit', soort: 'schieten' },
  'lion-cloak': { kant: 'doelwit', soort: 'schieten' },
};

// Read, and no effect on hit/wound/save rolls or attack counts (slug: what it does instead).
const GEEN_EFFECT = new Set<string>([
  'close-order', 'open-order', // "may adopt a Close/Open Order formation"
  'swiftstride', // charge range / Flee / Pursuit rolls
  'move-through-cover', // terrain movement, Dangerous Terrain re-rolls
  'magic-resistance', // Casting rolls of enemy spells
  'first-charge', // "the charge target becomes Disrupted"
  'stubborn', 'unbreakable', 'veteran', 'resolute', 'valour-of-ages', 'mark-of-chaos-undivided', 'cold-blooded-renegade', 'scurry-away', // Break/Leadership/Panic/Flee tests
  'counter-charge', 'impetuous', 'feigned-flight', 'fire-and-flee', 'evasive', // charge reactions / charging
  'fly', 'vanguard', 'scouts', 'ambushers', 'reserve-move', 'random-movement', 'dragged-along', 'fast-cavalry', // movement & deployment
  'horde', 'warband', 'levies', 'mercenaries', 'loner', 'regimental-unit', 'detachment', 'drilled', 'chariot-runners', // rank bonus / unit composition / Leadership
  'rallying-cry', 'shieldwall', 'stupidity', // Command / Give Ground / Stupidity test
  'timmm-berrr', 'deathblow', // hits caused when THIS model dies — not part of the attack being calculated
  'cumbersome', // "cannot be used when making a Stand & Shoot charge reaction"
  'move-and-shoot', // "can be used in the Shooting phase even if the model equipped with it marched"
  'requires-two-hands', // "cannot use a shield alongside" — the defender's shield is handled by unitArmourSave
  'unstable', 'indomitable', 'infernal-favour', // wounds lost after combat results, not from these attacks
  'howdah', // split profile/Firing Platform: the target's WS is taken from its first WS row (crew) as for chariots
  'close-order-formation', 'open-order-formation', // how the unit is arranged, moves and treats terrain
]);
// A "Lore of …" entry (parent `the-lores-of-magic`) only says which spells a Wizard may know — spells are not part
// of the attack being calculated.
const isLore = (r: Rule | undefined) => r?.parentSlug === 'the-lores-of-magic';

// Read, and they DO matter, but the app cannot know the input: reported with a specific reason.
const NIET_MET_REDEN: Record<string, string> = {
  // volley-fire: "half of the models in each rank other than the front rank ... can shoot"
  'volley-fire': 'Decides how many models can shoot — set the number of shooting models yourself',
  // fight-in-extra-rank / supporting-attacks + how-many-attacks: "not in base contact ... only one attack"
  'fight-in-extra-rank': 'Supporting attacks (1 attack each) are not modelled — every attacking model counts as in base contact',
  // monster-handlers: "each handler adds its attacks ... on a roll of 5+ one of the handlers is removed instead"
  'monster-handlers': 'Handlers only count where they are a profile row; the 5+ handler roll is not modelled',
  // motley-crew: "use the armour value of the majority of the models in the fighting rank"
  'motley-crew': 'Mixed weapons/armour inside the unit — the unit\'s listed loadout is used',
  // breath-weapon: "can use it once per round, during the Shooting phase ... Place the flame template"
  'breath-weapon': 'Template attack — the number of models hit depends on the table',
  // ogre-charge: "improved by the current Rank Bonus of its unit"
  'ogre-charge': 'AP depends on the current Rank Bonus — not known to the app',
  // dry-as-dust: "On a roll of 4+ ... this model loses one additional Wound" (vs Flaming)
  'dry-as-dust': 'Extra Wound from Flaming attacks (4+) — not evaluated',
  // gaze-of-the-gods: a random table roll during the game
  'gaze-of-the-gods': 'Random in-game result — not known to the app',
  // blood-rage: may become Frenzied after a Primal Fury test
  'blood-rage': 'Frenzy gained in-game — not known to the app',
};

// Rules that may sit on a weapon or model and are implemented by weaponStats / the engine directly.
const WEAPON_HANDLED = new Set<string>(['multiple-shots', 'rapid-fire', 'extra-attacks', 'two-hand-weapons-additional-hand-weapon']);

// ───────────────────────────── small helpers ─────────────────────────────
const norm = (s: string) =>
  s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const zonderAantal = (label: string) => label.replace(/\s*\(x\s*\d+\)\s*$/i, '').trim();
const aantalInLabel = (label: string) => {
  const m = label.match(/\(x\s*(\d+)\)\s*$/i);
  return m ? parseInt(m[1], 10) : 1;
};
const cel = (stats: { k: string; v: string }[], k: string) => stats.find((s) => s.k.toUpperCase() === k.toUpperCase())?.v?.trim() ?? '';
/** An absolute number, or null for "-", "(+1)", "*", a dice roll, … */
const absGetal = (v: string): number | null => (/^\d+$/.test(v.trim()) ? parseInt(v.trim(), 10) : null);
const plusGetal = (v: string): number | null => {
  const m = v.trim().match(/^\(?\s*\+\s*(\d+)\s*\)?$/);
  return m ? parseInt(m[1], 10) : null;
};

const plus = (n: number) => `${n}+`;

/** Distribution of a dice expression ("2", "D3", "D3+3", "2D6", "D6-1"), index = value. null if unparseable. */
export function dobbelVerdeling(expr: string): number[] | null {
  const t = expr.replace(/\s+/g, '').toUpperCase();
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    const a = new Array(n + 1).fill(0);
    a[n] = 1;
    return a;
  }
  const m = t.match(/^(\d*)D(\d+)([+-]\d+)?$/);
  if (!m) return null;
  const count = m[1] ? parseInt(m[1], 10) : 1;
  const sides = parseInt(m[2], 10);
  const add = m[3] ? parseInt(m[3], 10) : 0;
  if (count < 1 || count > 6 || sides < 2 || sides > 12) return null;
  const die = [0, ...new Array(sides).fill(1 / sides)];
  let dist = [1];
  for (let i = 0; i < count; i++) dist = conv(dist, die);
  const out: number[] = [];
  dist.forEach((p, v) => {
    if (!p) return;
    const w = Math.max(0, v + add);
    out[w] = (out[w] ?? 0) + p;
  });
  for (let i = 0; i < out.length; i++) out[i] = out[i] ?? 0;
  return out;
}

function conv(a: number[], b: number[]): number[] {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    if (!a[i]) continue;
    for (let j = 0; j < b.length; j++) if (b[j]) out[i + j] += a[i] * b[j];
  }
  return out;
}
const verwachting = (d: number[]) => d.reduce((s, p, k) => s + p * k, 0);
/** Sum of `n` independent copies of `d`. */
function somVan(d: number[], n: number): number[] {
  let out = [1];
  for (let i = 0; i < n; i++) out = conv(out, d);
  return out;
}
function binom(n: number, k: number, p: number): number {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return c * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

/** "Armour Bane (1 - Cold One only)" → { waarde: '1', noot: 'Cold One only' }. */
function regelParam(label: string): { waarde: string | null; noot: string | null } {
  const m = label.match(/\(([^)]*)\)/);
  if (!m) return { waarde: null, noot: null };
  const parts = m[1].split(/\s+-\s+|,\s*|\s+–\s+/).map((s) => s.trim()).filter(Boolean);
  return { waarde: parts[0] ?? null, noot: parts.length > 1 ? parts.slice(1).join(', ') : null };
}

// Cache label → slug per rules object (cheap per call afterwards).
const slugCache = new WeakMap<Record<string, Rule>, Map<string, string | null>>();
function slugVan(label: string, rules: Record<string, Rule>): string | null {
  let c = slugCache.get(rules);
  if (!c) { c = new Map(); slugCache.set(rules, c); }
  if (c.has(label)) return c.get(label)!;
  const s = resolveRuleSlug(label, getRuleIndex(rules));
  c.set(label, s);
  return s;
}

// ───────────────────────────── troop types ─────────────────────────────
type TT = 'RI' | 'HI' | 'MI' | 'Sw' | 'LCa' | 'HCa' | 'MCa' | 'WB' | 'LCh' | 'HCh' | 'MCr' | 'Be' | 'WM';
const TT_NAAM: [RegExp, TT][] = [
  [/^ri$|regular infantry/i, 'RI'], [/^hi$|heavy infantry/i, 'HI'], [/^mi$|monstrous infantry/i, 'MI'],
  [/^sw$|swarm/i, 'Sw'], [/^lca$|light cavalry/i, 'LCa'], [/^hca$|heavy cavalry/i, 'HCa'],
  [/^mca$|monstrous cavalry/i, 'MCa'], [/^wb$|war beast/i, 'WB'], [/^lch$|light chariot/i, 'LCh'],
  [/^hch$|heavy chariot/i, 'HCh'], [/^mcr$|monstrous creature/i, 'MCr'], [/^be$|behemoth/i, 'Be'],
  [/^wm$|war machine/i, 'WM'],
];
function ttCode(s?: string): TT | null {
  const t = String(s ?? '').replace(/\(character\)/i, '').trim();
  if (!t) return null;
  for (const [re, c] of TT_NAAM) if (re.test(t)) return c;
  return null;
}
const isInfantry = (t: TT | null) => t === 'RI' || t === 'HI' || t === 'MI' || t === 'Sw';
const isCavalry = (t: TT | null) => t === 'LCa' || t === 'HCa' || t === 'MCa' || t === 'WB';
const isChariot = (t: TT | null) => t === 'LCh' || t === 'HCh';
const isMonster = (t: TT | null) => t === 'MCr' || t === 'Be';

/** characters-and-cavalry-mounts / -ridden-monsters / -chariot-mounts: "the whole model is treated as being of
 *  the mount's sub-category of troop type". */
function effectiefTroopType(u: ArmyUnit): TT | null {
  for (const m of u.mounts ?? []) {
    const c = ttCode(m.troopType);
    if (c && (isCavalry(c) || isChariot(c) || isMonster(c))) return c;
  }
  return ttCode(u.troopType);
}

// ───────────────────────────── profile rows ─────────────────────────────
interface Rij {
  label: string;
  stats: UnitProfile['stats'];
  /** CombatStats.isWielder: has Ld and S → wields the chosen weapon; else a mount / beast / chariot body. */
  wielder: boolean;
  /** "(x2)" in the label: two such models per model (chariot crew, draught beasts). */
  mult: number;
  eigenRegels: string[];
}

function rijenVan(u: ArmyUnit): Rij[] {
  const rows: Rij[] = (u.profiles ?? []).map((p) => ({
    label: p.label,
    stats: p.stats,
    wielder: statValue(p.stats, 'Ld') != null && statValue(p.stats, 'S') != null,
    mult: aantalInLabel(p.label),
    eigenRegels: [...(p.info?.specialRules ?? [])],
  }));
  // A builder list carries a character's mount in `mounts` (its profile applied as modifiers to the rider row);
  // the mount still attacks with its own WS/S/A (split-profile-cavalry: "The rider and mount each use their own
  // Weapon Skill, Ballistic Skill, Strength, Initiative and Attacks characteristics, and their own weapons").
  for (const m of u.mounts ?? []) {
    for (const p of m.profiles ?? []) {
      const al = rows.find((r) => norm(zonderAantal(r.label)) === norm(zonderAantal(p.label)));
      if (al) { al.eigenRegels.push(...(m.specialRules ?? [])); continue; }
      rows.push({
        label: p.label,
        stats: p.stats,
        wielder: statValue(p.stats, 'Ld') != null && statValue(p.stats, 'S') != null,
        mult: aantalInLabel(p.label),
        eigenRegels: [...(m.specialRules ?? [])],
      });
    }
  }
  return rows;
}

// ───────────────────────────── rule instances ─────────────────────────────
interface Inst {
  label: string;
  slug: string | null;
  waarde: string | null;
  noot: string | null;
  bron: 'unit' | 'rij' | 'item' | 'wapen';
  /** Row indices this rule applies to (null = all rows). */
  rijen: Set<number> | null;
  /** The note could not be matched to exactly one row. */
  onmatchbaar?: boolean;
}

function matchNoot(noot: string, rows: Rij[]): number[] {
  const n = norm(noot.replace(/\bonly\b/i, ''));
  const out: number[] = [];
  rows.forEach((r, i) => {
    const l = norm(zonderAantal(r.label));
    if (l === n || l === n.replace(/s$/, '') || `${l}s` === n) out.push(i);
  });
  return out;
}

function instanties(u: ArmyUnit, rows: Rij[], rules: Record<string, Rule>, metItems: boolean, uitsluitItems: Set<string>): { inst: Inst[]; proza: { label: string; item: string }[] } {
  const inst: Inst[] = [];
  const proza: { label: string; item: string }[] = [];
  const unitSlugs = new Set<string>();
  const add = (label: string, bron: Inst['bron'], rijIdx: number | null) => {
    const slug = slugVan(label, rules);
    const { waarde, noot } = regelParam(label);
    let rijen: Set<number> | null = rijIdx == null ? null : new Set([rijIdx]);
    let onmatchbaar = false;
    // A per-model note ("Armour Bane (1, Cold One only)") applies to the matching profile row only.
    if (noot && /only/i.test(noot)) {
      const m = matchNoot(noot, rows);
      if (m.length === 1) rijen = new Set(m);
      else onmatchbaar = true;
    }
    inst.push({ label, slug, waarde: noot && /only/i.test(noot) ? waarde : waarde && noot ? `${waarde}, ${noot}` : waarde, noot, bron, rijen, onmatchbaar });
  };
  // A list pasted before 22-11-2026 had its special rules split on EVERY comma, so "Armour Bane (1, Cold One
  // only)" sits in a saved game as "Armour Bane (1" + "Cold One only)". Glue such halves back together.
  const heel: string[] = [];
  for (const l of u.specialRules ?? []) {
    const vorige = heel[heel.length - 1];
    const open = (s: string) => (s.match(/\(/g) ?? []).length > (s.match(/\)/g) ?? []).length;
    if (vorige != null && open(vorige)) heel[heel.length - 1] = `${vorige}, ${l}`;
    else heel.push(l);
  }
  for (const l of heel) {
    add(l, 'unit', null);
    const s = slugVan(l, rules);
    if (s) unitSlugs.add(s);
  }
  // A row's / mount's own rules. split-profile-cavalry/-chariots/-ridden-monster say "Unless noted otherwise, any
  // special rules that apply to one element ... apply to the other as well" — but the mount data drops the per-model
  // notes (the Cold One Chariot mount lists a bare "Armour Bane (1)" where the unit line says "Cold One only"). So a
  // mount's own rule is applied to the mount's rows only, and the engine reports the rider part as not counted.
  // When the unit line carries the same rule, the unit line (and its note) decides.
  rows.forEach((r, ri) => {
    for (const l of r.eigenRegels) {
      const s = slugVan(l, rules);
      if (s && unitSlugs.has(s)) continue;
      const al = inst.find((x) => x.label === l && x.bron === 'rij');
      if (al) { if (!r.wielder) al.rijen?.add(ri); continue; }
      add(l, 'rij', ri);
      if (r.wielder) inst[inst.length - 1].rijen?.delete(ri); // present (for the defender), but not on a rider/crew row
    }
  });
  if (metItems) {
    for (const it of u.magicItems ?? []) {
      if (uitsluitItems.has(it.name)) continue;
      for (const l of it.specialRules ?? []) {
        if (/\.\s|^notes\b/i.test(l) || l.length > 60) proza.push({ label: l, item: it.name });
        else add(l, 'item', null);
      }
      if (!(it.specialRules ?? []).length) proza.push({ label: '', item: it.name });
    }
  }
  return { inst, proza };
}

const geldtVoor = (i: Inst, rij: number) => !i.onmatchbaar && (i.rijen == null || i.rijen.has(rij));

// ───────────────────────────── probability core ─────────────────────────────
interface HitSpec {
  kind: 'auto' | 'roll' | 'none';
  /** shooting / combat target number after modifiers (2..9, ≥10 impossible) */
  need?: number;
  /** BS ≥ 6: second roll target (unmodified) */
  tweede?: number;
  /** combat: natural 6 always hits (roll-to-hit-combat) */
  nat6Altijd?: boolean;
  reroll?: 'failed' | 'ones' | null;
}

/** P(hit by a natural 6 that may use Poisoned Attacks) and P(other hit). */
function hitKansen(h: HitSpec): { n: number; s: number } {
  if (h.kind === 'auto') return { n: 1, s: 0 };
  if (h.kind === 'none') return { n: 0, s: 0 };
  const enkel = (t: number, nat6: boolean): { n: number; s: number } => {
    // roll-to-hit-*: "a roll of a natural 1 is always a fail, regardless of modifiers."
    if (nat6) t = Math.min(6, t); // roll-to-hit-combat: "a roll of a natural 6 is always a success"
    if (t <= 6) {
      const tt = Math.max(2, t);
      return { n: (7 - tt) / 6 - 1 / 6, s: 1 / 6 };
    }
    // 7-to-hit: "Each dice that rolls a natural 6 ... is rolled again: 7 followed by a 4+, 8 followed by a 5+,
    // 9 followed by a 6, 10 Impossible!" — poisoned-attacks: "if an attack needs a To Hit roll of 7+ ... this
    // special rule cannot be used."
    if (t >= 10) return { n: 0, s: 0 };
    const vervolg = t - 3;
    return { n: (1 / 6) * ((7 - vervolg) / 6), s: 0 };
  };
  let r = enkel(h.need!, !!h.nat6Altijd);
  if (h.tweede != null) {
    // bs-of-6-or-higher-chart "2+/6+" and to-hit-modifiers: "In the case of models with a BS of 6 or higher, these
    // modifiers are only applied to the first dice roll." → a missed first roll is rolled again at the second value.
    const t2 = enkel(h.tweede, false);
    const mis = 1 - r.n - r.s;
    r = { n: r.n + mis * t2.n, s: r.s + mis * t2.s };
  }
  if (h.reroll === 'failed') {
    // re-rolls: "No single dice can be re-rolled more than once"
    const mis = 1 - r.n - r.s;
    r = { n: r.n + mis * r.n, s: r.s + mis * r.s };
  } else if (h.reroll === 'ones') {
    r = { n: r.n + (1 / 6) * r.n, s: r.s + (1 / 6) * r.s };
  }
  return r;
}

/** P(wound with natural 6), P(wound otherwise) for one hit. */
function woundKansen(need: number, mod: number, reroll1: boolean): { w6: number; wn: number } {
  if (need <= 0) return { w6: 0, wn: 0 };
  let w6 = 0;
  let wn = 0;
  for (let n = 2; n <= 6; n++) {
    // roll-to-wound-*: "a roll of a natural 1 is always a fail, regardless of modifiers."
    if (n + mod >= need) { if (n === 6) w6 += 1 / 6; else wn += 1 / 6; }
  }
  if (reroll1) { w6 += (1 / 6) * w6; wn += (1 / 6) * wn; }
  return { w6, wn };
}

/** Probability an armour/ward save FAILS. make-armour-saves-*: "a roll of a natural 1 is always a fail".
 *  armour-piercing: "a negative modifier, which is applied to the Armour Save roll". */
const saveFaalt = (doel: number | null) => (doel == null || doel > 6 ? 1 : (Math.max(2, doel) - 1) / 6);

interface Spec {
  naam: string;
  aanvallen: string;
  /** Distribution of the group's total number of attacks / hits. */
  aantal: number[];
  hit: HitSpec;
  hitWorp: string;
  hitNote?: string;
  poisoned: boolean;
  woundNeed: number;
  woundMod: number;
  woundNote: string;
  reroll1Wound: boolean;
  armour: number | null; // armour value, null = none (7+)
  apImp: number; // positive amount the AP worsens the save
  bane: number;
  nat6: 'kb' | 'cleave' | null;
  ward: number | null;
  regen: number | null;
  mw: number[]; // damage distribution per unsaved wound
  mwLabel: string | null;
  notes: string[];
  // ── combat exchange (berekenGevecht) ──
  /** Attacks per attacking model, and the number of attacking models before any casualties. */
  perModel?: number[];
  n0?: number;
  /** Which models these are, to know who is lost to casualties (see `aantalNa`). */
  rol?: 'rf' | 'champ' | 'mount' | 'pob' | 'sup' | 'single' | 'impact' | 'stomp';
  mult?: number;
  laag?: Laag;
  /** Initiative step (impact hits 100, stomp attacks −1) and how it was reached. */
  ini?: number;
  iniNote?: string;
}

/** The attacker's layout, for working out who is lost to casualties before striking. */
interface Laag { multi: boolean; breedte: boolean; F: number; c: number; P: number; S: number; modellen: number }

interface Kansen { pN: number; pC: number; pK: number; hit: number; wound: number; naArmour: number; naWard: number }

function perAanval(sp: Spec): Kansen {
  const h = hitKansen(sp.hit);
  const plain = woundKansen(sp.woundNeed, sp.woundMod, sp.reroll1Wound);
  const gif = sp.poisoned ? woundKansen(sp.woundNeed, sp.woundMod + 2, sp.reroll1Wound) : plain;
  const w6 = h.n * plain.w6 + h.s * gif.w6;
  const wn = h.n * plain.wn + h.s * gif.wn;
  const aN = saveFaalt(sp.armour == null ? null : sp.armour + sp.apImp);
  const a6 = sp.nat6 ? 1 : saveFaalt(sp.armour == null ? null : sp.armour + sp.apImp + sp.bane);
  const fw = saveFaalt(sp.ward);
  const pK = sp.nat6 === 'kb' ? w6 * fw : 0;
  const pC = sp.nat6 === 'cleave' ? w6 * fw : 0;
  const pN = (wn * aN + (sp.nat6 ? 0 : w6 * a6)) * fw;
  const naArmour = wn * aN + w6 * a6;
  return { pN, pC, pK, hit: h.n + h.s, wound: w6 + wn, naArmour, naWard: naArmour * fw };
}

/** Distribution of Wounds lost by the current model from ONE attack, given `cur` Wounds left on it. */
function verliesVerdeling(k: Kansen, sp: Spec, cur: number): number[] {
  const q = sp.regen == null ? 1 : saveFaalt(sp.regen); // P(the Regeneration save fails)
  const out: number[] = [1 - k.pN - k.pC - k.pK];
  const put = (i: number, p: number) => { out[i] = (out[i] ?? 0) + p; };
  sp.mw.forEach((pm, x) => {
    if (!pm || x === 0) { if (pm) put(0, (k.pN + k.pC) * pm); return; }
    // hits-that-inflict-multiple-wounds: "A model cannot suffer more wounds than it has on its profile ... excess
    // wounds are wasted"; multiple-wounds: "Excess wounds do not 'spill over' onto other models in the unit."
    const d = Math.min(x, cur);
    for (let j = 0; j <= d; j++) put(j, k.pN * pm * binom(d, j, q));
    put(d, k.pC * pm);
  });
  if (k.pK) put(Number.isFinite(cur) ? cur : 1, k.pK);
  for (let i = 0; i < out.length; i++) out[i] = out[i] ?? 0;
  return out;
}

const DP_BUDGET = 4_000_000;

/** The step table of one attack group for `att` expected attacks (fresh-model capping for the group total). */
function groepTabel(sp: Spec, k: Kansen, att: number, W: number | null): { stappen: Stap[]; verlies: number } {
  const stappen: Stap[] = [];
  const hits = att * k.hit;
  stappen.push({ label: 'To Hit', worp: sp.hitWorp, kans: k.hit, aantal: hits, toelichting: sp.hitNote });
  stappen.push({ label: 'To Wound', worp: sp.woundNeed > 0 ? plus(Math.max(2, sp.woundNeed - sp.woundMod)) : '—', kans: hits ? (att * k.wound) / hits : 0, aantal: att * k.wound, toelichting: sp.woundNote });
  const wonden = att * k.wound;
  const aDoel = sp.armour == null ? null : sp.armour + sp.apImp;
  stappen.push({
    label: 'Armour save',
    worp: aDoel == null || aDoel > 6 ? '—' : plus(aDoel),
    kans: wonden ? (att * k.naArmour) / wonden : 1,
    aantal: att * k.naArmour,
    toelichting: [sp.armour == null ? 'no armour' : `${sp.armour}+${sp.apImp ? ` worsened by AP −${sp.apImp}` : ''}`, ...sp.notes].filter(Boolean).join('; '),
  });
  if (sp.ward != null) stappen.push({ label: 'Ward save', worp: plus(sp.ward), kans: saveFaalt(sp.ward), aantal: att * k.naWard });
  const vers = verliesVerdeling(k, sp, W ?? Infinity);
  const verlies = vers.reduce((s, p, i) => s + p * i, 0) * att;
  const zonderRegen = verliesVerdeling(k, { ...sp, regen: null }, W ?? Infinity).reduce((s, p, i) => s + p * i, 0) * att;
  if (sp.mwLabel || k.pK) stappen.push({ label: k.pK && !sp.mwLabel ? 'Killing Blow' : 'Multiple Wounds', worp: sp.mwLabel ?? 'all', kans: 1, aantal: zonderRegen, toelichting: W != null ? `capped at the target's ${W} Wound(s) per model` : undefined });
  if (sp.regen != null) stappen.push({ label: 'Regeneration', worp: plus(sp.regen), kans: zonderRegen ? verlies / zonderRegen : 1, aantal: verlies });
  return { stappen, verlies };
}

// ───────────────────────────── context: weapons & defaults ─────────────────────────────
function standaardMelee(melee: WeaponProfile[]): number {
  return Math.max(0, melee.findIndex((w) => !/^hand weapon$/i.test(w.name)));
}

const HAND_WEAPON: WeaponProfile = {
  slug: 'hand-weapon-profile', name: 'Hand weapon', kind: 'melee', range: 'Combat', sMod: 0, sAbs: null, ap: 0,
  shots: 1, multiShots: null, multiProfile: null, aMod: 0, specialRules: [], chargeBonus: false,
};
const isHandWeapon = (w: WeaponProfile) => /^hand weapons?$/i.test(w.name) || w.slug === 'hand-weapon-profile';
const isMagic = (w: WeaponProfile) => w.slug.startsWith('magic-weapon:');

// unitWeapons scans the rules for every unresolved option label; the UI calls the engine for every enemy unit on
// every render, so cache it per rules object and per (immutable) ArmyUnit object. The result is never mutated.
const wapenCache = new WeakMap<Record<string, Rule>, WeakMap<ArmyUnit, ReturnType<typeof unitWeapons>>>();
function wapensVan(u: ArmyUnit, rules: Record<string, Rule>): ReturnType<typeof unitWeapons> {
  let per = wapenCache.get(rules);
  if (!per) { per = new WeakMap(); wapenCache.set(rules, per); }
  let w = per.get(u);
  if (!w) { w = unitWeapons(u, rules); per.set(u, w); }
  return w;
}

/** Per profile row its own weapons (unitDetails.wapensPerRij), or null when there is no per-model data. */
function rijWapensVan(a: ArmyUnit, rows: Rij[], uitrusting: EquipmentLine[] | null | undefined, rules: Record<string, Rule>): (RijWapens | null)[] | null {
  if (!uitrusting?.length) return null;
  const per = wapensPerRij(rows, uitrusting, wapensVan(a, rules));
  return per.some(Boolean) ? per : null;
}

/** `uitrusting` (optional, unit-details.json): the melee list is then the MAIN model's weapons only (the
 *  first wielder row and its champion), so a War Hydra is never offered its handlers' whip. Ranged stays
 *  unit-wide: the shooting calculation picks the row that carries the chosen ranged weapon. */
export function wapensVoor(aanvaller: ArmyUnit, soort: AanvalSoort, rules: Record<string, Rule>, uitrusting?: EquipmentLine[] | null): { slug: string; naam: string; standaard: boolean }[] {
  const { melee, ranged } = wapensVan(aanvaller, rules);
  let meleeLijst = melee;
  if (soort === 'combat' && uitrusting?.length) {
    const rows = rijenVan(aanvaller);
    const hoofd = rows.findIndex((r) => r.wielder);
    const eigen = hoofd >= 0 ? rijWapensVan(aanvaller, rows, uitrusting, rules)?.[hoofd] : null;
    if (eigen) meleeLijst = eigen.melee;
  }
  const lijst = soort === 'schieten' ? ranged : meleeLijst;
  const std = soort === 'schieten' ? 0 : standaardMelee(meleeLijst);
  return lijst.map((w, i) => ({ slug: w.slug, naam: w.name, standaard: i === std }));
}

// ───────────────────────────── ranks & files ─────────────────────────────
// troop-type-table-chart, column "Models per Rank" ("the minimum number required to claim a Rank Bonus"):
// Regular Infantry 5, Heavy Infantry 4, Monstrous Infantry 3, Swarms -, Light Cavalry 5, Heavy Cavalry 4,
// Monstrous Cavalry 3, War Beasts 5, Light Chariots 3, Heavy Chariots -, Monstrous Creatures -, Behemoths -,
// War Machines -.
const MODELLEN_PER_RANG: Partial<Record<TT, number>> = { RI: 5, HI: 4, MI: 3, LCa: 5, HCa: 4, MCa: 3, WB: 5, LCh: 3 };
// Troop types that do not form ranks here: heavy chariots and monsters are Lumbering single models
// (lumbering: "a Lumbering model cannot join a unit"), and war machines are single models.
const GEEN_RANGEN = new Set<TT>(['HCh', 'MCr', 'Be', 'WM']);

/** A sensible default width for the UI stepper, and whether the Files control applies to this unit at all. */
export function breedteVoor(aanvaller: ArmyUnit, modellen: number): { vanToepassing: boolean; standaard: number; max: number } {
  const n = Math.max(0, Math.floor(Number.isFinite(modellen) ? modellen : unitSize(aanvaller)));
  const tt = effectiefTroopType(aanvaller);
  const vanToepassing = aanvaller.count != null && n > 1 && !(tt && GEEN_RANGEN.has(tt));
  // Default = the troop type's "Models per Rank" (the narrowest front that still claims a Rank Bonus); when the
  // table gives none (Swarms, unknown troop type) the widest value in that column, 5.
  const perRang = (tt && MODELLEN_PER_RANG[tt]) ?? 5;
  return { vanToepassing, standaard: Math.max(1, Math.min(n, perRang)), max: Math.max(1, n) };
}

/** Models per rank, front first ("it must be the rear rank that has fewer models" — close-order-formation). */
function rangenVan(n: number, breedte: number): number[] {
  const out: number[] = [];
  for (let rest = n; rest > 0; rest -= breedte) out.push(Math.min(breedte, rest));
  return out;
}

// ───────────────────────────── defender ─────────────────────────────
interface Doelwit {
  ws: number | null;
  t: number | null;
  w: number | null; // null = Wounds unknown
  tt: TT | null;
  armour: (magisch: boolean) => { save: number | null; note: string };
  ward: (magisch: boolean) => { v: number | null; label: string };
  regen: number | null;
  regenLabel: string;
  flammable: boolean;
  warpSpawned: boolean;
  ethereal: boolean;
  causesFear: boolean;
  largeTarget: boolean;
  skirmishers: boolean;
  tNote?: string;
}

function doelwitVan(d: ArmyUnit, soort: AanvalSoort, rules: Record<string, Rule>, uit: MathResultaat): Doelwit {
  const rows = rijenVan(d);
  const tt = effectiefTroopType(d);
  const { inst, proza } = instanties(d, rows, rules, true, new Set((d.magicWeapons ?? []).map((m) => m.name)));
  const heeft = (slug: string) => inst.some((i) => i.slug === slug && !i.onmatchbaar);

  // split-profile-cavalry/-chariots/-ridden-monster: "all enemy rolls To Hit are made against the rider's / crew's /
  // character's Weapon Skill" → the first row that has a Weapon Skill (rider, crew or character come first).
  let ws: number | null = null;
  for (const p of d.profiles ?? []) { const v = absGetal(cel(p.stats, 'WS')); if (v != null) { ws = v; break; } }

  let t: number | null = null;
  let w: number | null = null;
  let tNote: string | undefined;
  const profs = d.profiles ?? [];
  if (tt === 'WM' && soort === 'combat') {
    // split-profile-war-machine: "In combat, use the Toughness and Wounds characteristics of the crew. When not in
    // combat, use the Toughness and Wounds characteristics of the war machine."
    const crew = profs.find((p) => statValue(p.stats, 'Ld') != null && absGetal(cel(p.stats, 'T')) != null);
    if (crew) { t = absGetal(cel(crew.stats, 'T')); w = absGetal(cel(crew.stats, 'W')); tNote = 'crew T/W (war machine in combat)'; }
  }
  if (t == null) {
    const i0 = profs.findIndex((p) => absGetal(cel(p.stats, 'T')) != null);
    if (i0 >= 0) {
      t = absGetal(cel(profs[i0].stats, 'T'));
      const gemod = profs[i0].stats.find((s) => s.k.toUpperCase() === 'T')?.modified;
      // "being mounted upon one will increase the character's Toughness ... noted within the mount's profile"
      if (!gemod) profs.forEach((p, i) => { if (i !== i0) { const pl = plusGetal(cel(p.stats, 'T')); if (pl) t! += pl; } });
    }
    // split-profile-chariot-mount: "Enemy rolls To Wound are made against either the chariot's or the character's
    // Toughness, whichever is the highest."
    for (const m of d.mounts ?? []) {
      if (!isChariot(ttCode(m.troopType))) continue;
      const ct = (m.profiles ?? []).map((p) => absGetal(cel(p.stats, 'T'))).find((x) => x != null);
      if (ct != null && (t == null || ct > t)) { t = ct; tNote = 'chariot Toughness (higher than the character\'s)'; }
    }
    const heeftW = profs.some((p) => absGetal(cel(p.stats, 'W')) != null) || (d.mounts ?? []).some((m) => m.profiles.some((p) => absGetal(cel(p.stats, 'W')) != null));
    w = heeftW ? woundsPerModel(d) : null;
  }

  // Armour: unitArmourSave (armour-value / determining-armour-value / maximum-armour-value / armoured-hide /
  // parry / sea-dragon-cloak). A mount's Armoured Hide also counts: "improves their armour value (and that of their
  // rider)".
  const mountRegels = (d.mounts ?? []).flatMap((m) => m.specialRules ?? []);
  const rijRegels = rows.flatMap((r) => r.eigenRegels);
  const asv = unitArmourSave({ ...d, specialRules: [...(d.specialRules ?? []), ...mountRegels, ...rijRegels.filter((l) => /armoured hide/i.test(l) && !(d.specialRules ?? []).some((x) => /armoured hide/i.test(x)))] });
  for (const n of asv?.notes ?? []) {
    if (/^Parry:/i.test(n)) continue; // Parry was evaluated: it only applies with hand weapon & shield
    if (/^no armou?r not auto-valued/i.test(n)) continue; // a "No armour" option is simply 7+
    uit.nietMeegerekend.push({ regel: n.replace(/ not auto-valued.*$/, ''), van: 'doelwit', reden: 'Armour item the app cannot value — save may be better than shown' });
  }
  // split-profile-ridden-monster / -chariot-mount: "it may use either the mount or the character's armour value,
  // whichever is better."
  let mountAv: number | null = null;
  for (const m of d.mounts ?? []) {
    const c = ttCode(m.troopType);
    if (!(isMonster(c) || isChariot(c))) continue;
    for (const det of m.details ?? []) { const mm = det.match(/armour value:\s*(\d)\+/i); if (mm) mountAv = Math.min(mountAv ?? 7, parseInt(mm[1], 10)); }
  }
  // maximum-armour-value: "Chariot, monster or war machine can never have an armour value better than 3+."
  const maxAv = isChariot(tt) || isMonster(tt) || tt === 'WM' ? 3 : 2;
  const armour = (magisch: boolean): { save: number | null; note: string } => {
    let s: number | null = asv ? asv.save : null;
    let note = asv ? asv.parts.join(', ') : 'no armour';
    if (asv && soort === 'schieten') {
      const c = (asv.conditional ?? []).find((x) => /^vs non-magical shooting/i.test(x.when) && !magisch)
        ?? (asv.conditional ?? []).find((x) => /^vs shooting/i.test(x.when));
      if (c) { s = c.save; note += ` (${c.when})`; }
      // parry: "Whilst engaged in close combat, ... improves its armour value by 1" — unitArmourSave folds the +1
      // into its general save but (because its addCond compares against the pre-Parry value) does not always
      // return the shooting save, so undo the Parry +1 here when no shooting conditional came back.
      else if (s != null && asv.parts.some((p) => /^Parry \(\+1/.test(p))) { s += 1; note += ' (Parry only counts in close combat)'; }
    }
    if (s != null && s >= 7) s = null;
    if (mountAv != null && (s == null || mountAv < s)) { s = mountAv; note = `mount armour value ${mountAv}+ (better)`; }
    if (s != null && s < maxAv) { s = maxAv; note += `, max ${maxAv}+ for this troop type`; }
    return { save: s, note };
  };

  // Ward saves
  const wardInst = inst.filter((i) => i.slug === 'ward-saves');
  const daemonic = heeft('daemonic');
  const daemonicR = heeft('daemonic-renegade');
  const ward = (magisch: boolean) => {
    let v: number | null = null;
    let label = '';
    for (const wi of wardInst) {
      const m = (wi.waarde ?? '').match(/^(\d)\+$/);
      if (m && !wi.noot && !wi.onmatchbaar) { const x = parseInt(m[1], 10); if (v == null || x < v) { v = x; label = wi.label; } }
    }
    if (daemonicR && (v == null || 5 < v)) { v = 5; label = 'Daemonic (5+ Ward save)'; }
    if (daemonic && !magisch && (v == null || 5 < v)) { v = 5; label = 'Daemonic (5+ Ward save vs non-magical attacks)'; }
    return { v, label };
  };
  for (const wi of wardInst) {
    if (!/^\d\+$/.test(wi.waarde ?? '') || wi.noot) uit.nietMeegerekend.push({ regel: wi.label, van: 'doelwit', reden: 'Conditional or unclear Ward save — not applied' });
  }

  let regen: number | null = null;
  let regenLabel = '';
  for (const ri of inst.filter((i) => i.slug === 'regeneration')) {
    const m = (ri.waarde ?? '').match(/^(\d)\+$/);
    if (m && !ri.noot && !ri.onmatchbaar) { const x = parseInt(m[1], 10); if (regen == null || x < regen) { regen = x; regenLabel = ri.label; } }
    else uit.nietMeegerekend.push({ regel: ri.label, van: 'doelwit', reden: 'Conditional or unclear Regeneration — not applied' });
  }

  const causesFear = ['fear', 'terror', 'nehekharan-undead', 'necromantic-undead', 'daemonic', 'daemonic-renegade'].some(heeft);

  // Classify every defender rule.
  for (const i of inst) classificeer(i, 'doelwit', soort, rules, uit);
  for (const p of proza) uit.nietMeegerekend.push({ regel: p.item, van: 'doelwit', reden: 'Magic item with a free-text effect — not evaluated' });

  return {
    ws, t, w, tt, armour, ward, regen, regenLabel,
    flammable: heeft('flammable'), warpSpawned: heeft('warp-spawned') || daemonic || daemonicR, ethereal: heeft('ethereal'),
    causesFear, largeTarget: heeft('large-target'), skirmishers: heeft('skirmishers'), tNote,
  };
}

function classificeer(i: Inst, kant: 'aanvaller' | 'doelwit' | 'wapen', soort: AanvalSoort, rules: Record<string, Rule>, uit: MathResultaat) {
  const van = kant;
  if (!i.slug) {
    uit.nietMeegerekend.push({ regel: i.label, van, reden: i.bron === 'item' ? 'Magic item effect — not evaluated' : 'No rule text found in the rules data' });
    return;
  }
  if (GEEN_EFFECT.has(i.slug) || WEAPON_HANDLED.has(i.slug) || isLore(rules[i.slug])) return;
  if (NIET_MET_REDEN[i.slug]) {
    const relevant = kant === 'doelwit'
      ? ['monster-handlers', 'motley-crew', 'dry-as-dust'].includes(i.slug)
      : i.slug !== 'dry-as-dust' && !(i.slug === 'volley-fire' && soort === 'combat') && !(i.slug === 'fight-in-extra-rank' && soort === 'schieten');
    if (relevant) uit.nietMeegerekend.push({ regel: i.label, van, reden: NIET_MET_REDEN[i.slug] });
    return;
  }
  const t = TELT[i.slug];
  if (t) {
    if (i.onmatchbaar) uit.nietMeegerekend.push({ regel: i.label, van, reden: `Note "${i.noot}" cannot be matched to exactly one profile row` });
    return; // implemented (or not relevant for this side / phase)
  }
  const r = rules[i.slug];
  const army = r && !(r.association ?? []).includes('Rulebook');
  uit.nietMeegerekend.push({ regel: i.label, van, reden: army ? 'Army-specific rule — not evaluated' : 'Rule not evaluated by the calculator' });
}

// ───────────────────────────── main ─────────────────────────────
interface Ctx {
  sit: (key: string, label: string, standaard?: boolean) => boolean;
  lijst: Situatie[];
}
function maakCtx(waarden: Record<string, boolean> | undefined, lijst: Situatie[] = [], hernoem?: (key: string, label: string) => [string, string]): Ctx {
  return {
    lijst,
    sit(key0, label0, standaard = false) {
      const [key, label] = hernoem ? hernoem(key0, label0) : [key0, label0];
      if (!lijst.some((s) => s.key === key)) lijst.push({ key, label, standaard });
      return waarden && key in waarden ? !!waarden[key] : standaard;
    },
  };
}

/** The enemy's toggles in a combat exchange: `charged` → "Enemy charged", the shared first round stays, every other
 *  toggle of the enemy gets its own key and an "Enemy:" label. */
const vijandSleutel = (key: string, label: string): [string, string] =>
  key === 'firstRound' ? [key, label]
    : key === 'charged' ? ['enemyCharged', 'Enemy charged']
      : [`enemy.${key}`, `Enemy: ${label.charAt(0).toLowerCase()}${label.slice(1)}`];

/** `breedte` (optional): pass it when the UI uses the Files control, so the rank-related toggles (hill, Skirmish
 *  formation, moving for Volley Fire) are offered too. */
export function situatiesVoor(aanvaller: ArmyUnit, doelwit: ArmyUnit, opties: Pick<AanvalOpties, 'soort' | 'wapenSlug' | 'multi' | 'breedte' | 'uitrusting'>, rules: Record<string, Rule>): Situatie[] {
  const ctx = maakCtx(undefined);
  reken(aanvaller, doelwit, { ...opties, modellen: unitSize(aanvaller) }, rules, ctx);
  return ctx.lijst;
}

export function berekenAanval(aanvaller: ArmyUnit, doelwit: ArmyUnit, opties: AanvalOpties, rules: Record<string, Rule>): MathResultaat {
  return reken(aanvaller, doelwit, opties, rules, maakCtx(opties.situaties));
}

function leeg(): MathResultaat {
  return { wounds: 0, verdeling: null, modellenGedood: null, groepen: [], meegerekend: [], nietMeegerekend: [] };
}

/** Extra input/output when `reken` is one side of a combat exchange (berekenGevecht). */
interface GevechtCtx {
  /** The OTHER unit charged this turn (spears' Initiative, long spear's Strike First). */
  tegenCharged: boolean;
  /** Receives the finished attack groups, the defender's Wounds per model and its models. */
  vang: (c: { specs: Spec[]; W: number | null; M: number }) => void;
}

function reken(a: ArmyUnit, d: ArmyUnit, o: AanvalOpties, rules: Record<string, Rule>, ctx: Ctx, gv?: GevechtCtx): MathResultaat {
  const uit = leeg();
  const meeg = (regel: string, effect: string) => { if (!uit.meegerekend.some((m) => m.regel === regel && m.effect === effect)) uit.meegerekend.push({ regel, effect }); };
  const stop = (reden: string) => { uit.onmogelijk = reden; return afronden(uit); };

  const rows = rijenVan(a);
  if (!rows.length) return stop('The attacking unit has no profile.');
  const doel = doelwitVan(d, o.soort, rules, uit);
  if (doel.t == null) return stop('The target has no Toughness value.');

  const { melee, ranged } = wapensVan(a, rules);
  // Which model carries which weapon (unit-details.json), when the caller passes it; null = unknown.
  const perRij = rijWapensVan(a, rows, o.uitrusting, rules);
  const modellen = Math.max(0, Math.floor(Number.isFinite(o.modellen) ? o.modellen : unitSize(a)));
  const M = Math.max(0, Math.floor(o.doelwitModellen ?? unitSize(d)));
  if (modellen === 0 || M === 0) {
    // Nobody attacks, or nobody is left to hit: exactly zero Wounds.
    uit.verdeling = [1];
    uit.modellenGedood = 0;
    return afronden(uit);
  }

  // Attacker rule instances (unit + rows + non-weapon magic items).
  const { inst, proza } = instanties(a, rows, rules, true, new Set((a.magicWeapons ?? []).map((m) => m.name)));
  const heeftOp = (slug: string, rij: number) => inst.some((i) => i.slug === slug && geldtVoor(i, rij));
  const heeftUnit = (slug: string) => inst.some((i) => i.slug === slug && !i.onmatchbaar);
  const instVan = (slug: string, rij: number) => inst.filter((i) => i.slug === slug && geldtVoor(i, rij));

  const specs: Spec[] = [];
  let wapenRegels: Inst[] = [];

  // ── ranks & files (only when the caller gives a width) ──
  const breedteActief = o.breedte != null && Number.isFinite(o.breedte) && breedteVoor(a, modellen).vanToepassing;
  const breedte = breedteActief ? Math.max(1, Math.min(modellen, Math.floor(o.breedte!))) : 0;
  const rang = breedteActief ? rangenVan(modellen, breedte) : [];
  // skirmish-formation: "never consists of rigid ranks and files". adopting-and-changing-formation: "the type(s) of
  // formation a unit can adopt are indicated by a special rule of the same name" → a unit whose only formation rule
  // is Skirmishers is always in Skirmish formation; with Close/Open Order as well, the table decides (toggle).
  const kanRangen = heeftUnit('close-order') || heeftUnit('open-order');
  const skirm = breedteActief && heeftUnit('skirmishers') ? (kanRangen ? ctx.sit('skirmishFormation', 'In Skirmish formation') : true) : false;
  const rangLimiet = () => {
    if (!breedteActief) return;
    uit.nietMeegerekend.push({ regel: 'Files', van: 'aanvaller', reden: o.soort === 'combat'
      // how-many-attacks (overlap → 1 attack each), we-cant-all-fight (slain before they strike); the app does not
      // know the enemy's frontage or the order of blows, so the player sees this as the assumption behind the number.
      ? 'Every front-rank model counts as in base contact. Overlap with a narrower enemy, casualties before striking and joined characters are not included.'
      // we-cant-all-shoot: line of sight and range per model.
      : 'Every model in a rank that may shoot has line of sight and range. Joined characters are not included.' });
  };

  if (o.soort === 'schieten') {
    if (!ranged.length) return stop('This unit has no ranged weapon.');
    const rw = ranged.find((w) => w.slug === o.wapenSlug) ?? ranged[0];
    const multi = !!rw.multiShots && (o.multi ?? true);
    const eff = multi && rw.multiProfile ? rw.multiProfile : rw;
    wapenRegels = eff.specialRules.map((l) => ({ label: l, slug: slugVan(l, rules), ...regelParam(l), bron: 'wapen' as const, rijen: null }));
    const wHeeft = (slug: string) => wapenRegels.some((i) => i.slug === slug);
    // bombardment / cannon-fire / breath-weapon: placed templates, no roll To Hit with BS.
    if (rw.noToHit || wHeeft('breath-weapon')) {
      for (const i of wapenRegels) classificeer(i, 'wapen', o.soort, rules, uit);
      return stop(`${rw.name} uses a template (no To Hit roll) — the number of models hit depends on the table.`);
    }
    // With per-model data: only the rows that carry this weapon shoot it (their BS, their Strength).
    const dragers = perRij ? rows.map((_, i) => i).filter((i) => perRij[i]?.ranged.some((w) => w.slug === rw.slug)) : [];
    const schietRijen = dragers.length ? dragers.map((i) => rows[i]) : rows;
    const bs = Math.max(0, ...schietRijen.map((r) => statValue(r.stats, 'BS') ?? 0));
    // characteristics-of-zero: "many models simply lack the ability to make any form of ranged attack"
    if (bs <= 0) return stop('This unit has no Ballistic Skill.');
    const shooterRij = rows.indexOf(schietRijen.find((r) => (statValue(r.stats, 'BS') ?? 0) === bs)!);
    const shooterS = Math.max(0, ...schietRijen.filter((r) => r.wielder).map((r) => statValue(r.stats, 'S') ?? 0));
    const s = eff.sAbs != null ? eff.sAbs : eff.sMod != null && shooterS > 0 ? shooterS + eff.sMod : null;
    if (s == null) return stop(`${eff.name} has a variable Strength — not calculable.`);

    // To Hit modifiers (to-hit-modifiers-chart), as SHOOTING_MODS — filtered by what applies.
    let pen = 0;
    const notes: string[] = [];
    const ignoreCover = wHeeft('ignores-cover') || heeftOp('ignores-cover', shooterRij);
    // volley-fire: "A unit cannot Volley Fire if it has moved for any reason during this turn ..., or when making a
    // Stand & Shoot charge reaction." → with Files given, 'moved' matters even for a Quick Shot weapon.
    const volley = breedteActief && !skirm && (wHeeft('volley-fire') || heeftUnit('volley-fire'));
    for (const m of SHOOTING_MODS) {
      if ((m.key === 'soft' || m.key === 'full') && (ignoreCover || doel.largeTarget)) continue;
      if (m.key === 'skirmish' && !doel.skirmishers) continue;
      if (m.key === 'moved' && wHeeft('quick-shot') && !wHeeft('move-or-shoot') && !volley) continue;
      let p = m.penalty;
      if (m.key === 'moved' && wHeeft('ponderous')) p = 2;
      if (m.key === 'moved' && wHeeft('quick-shot')) p = 0; // quick-shot: "does not suffer the usual -1 To Hit modifier for Moving and Shooting"
      const on = ctx.sit(m.key, m.key === 'moved' ? 'Moved this turn' : m.label);
      if (!on) continue;
      if (m.key === 'moved' && wHeeft('move-or-shoot')) return stop(`${rw.name}: Move or Shoot — cannot shoot after moving.`);
      if (!p) continue;
      pen += p;
      notes.push(`${m.label} −${p}`);
    }
    if (ignoreCover) meeg('Ignores Cover', 'No To Hit penalty for cover');
    if (doel.largeTarget) meeg('Large Target', 'Target gets no cover modifier');
    if (wHeeft('quick-shot')) meeg('Quick Shot', 'No −1 for moving and shooting');
    if (wHeeft('ponderous')) meeg('Ponderous', 'Moving and shooting is −2 instead of −1');
    if (multi) { pen += 1; notes.push(`${rw.multiProfile ? 'Rapid fire' : 'Multiple Shots'} −1`); meeg(`Multiple Shots (${rw.multiShots})`, `${rw.multiShots} shots per model at −1 To Hit`); }
    const extra = o.toHitMod ?? 0;
    if (extra) { pen += extra; notes.push(`custom ${extra > 0 ? '−' : '+'}${Math.abs(extra)}`); }

    const hit: HitSpec = bs >= 6 ? { kind: 'roll', need: 2 + pen, tweede: Math.max(2, 12 - Math.min(10, bs)) } : { kind: 'roll', need: Math.max(2, 7 - bs) + pen };
    const hitWorp = hit.need! >= 10 ? '—' : hit.need! > 6 ? `${hit.need}+ (6 then ${hit.need! - 3}+)` : bs >= 6 ? `${Math.max(2, hit.need!)}+ / ${hit.tweede}+` : plus(Math.max(2, hit.need!));
    if (hit.need! >= 10 && bs < 6) return stop(`To Hit needs ${hit.need}+ — impossible (7+ To Hit chart).`);

    const perModel = multi ? dobbelVerdeling(rw.multiShots!) : dobbelVerdeling(String(rw.shots));
    if (!perModel) return stop(`Shots "${rw.multiShots}" not understood.`);
    const magisch = isMagic(rw) || wHeeft('magical-attacks') || heeftOp('magical-attacks', shooterRij) || heeftOp('daemonic', shooterRij) || heeftOp('daemonic-renegade', shooterRij);
    // Who shoots. Without Files: `modellen`. With Files:
    //  shooting-with-more-than-one-rank: "Usually, only the models in a unit's front rank can shoot."
    //  "Shooting from a Hill ... can fire with one additional rank compared to a unit on flat ground."
    //  large-target: "a unit that shoots at a Large Target can shoot with one additional rank."
    //  volley-fire: "half of the models in each rank other than the front rank (or front two ranks if the unit is on a
    //  hill), rounding up, can shoot" — "if there is ever any question over how many models can fire, always round up".
    let schutters = modellen;
    let schuttersLabel: string | null = null;
    if (breedteActief && skirm) {
      // skirmish-formation: "never consists of rigid ranks and files" — no front-rank limit to apply.
      uit.nietMeegerekend.push({ regel: 'Skirmish formation', van: 'aanvaller', reden: 'No ranks, so every model is counted as shooting; line of sight per model is not known to the app' });
    } else if (breedteActief) {
      const heuvel = ctx.sit('hill', 'On a hill');
      const volRangen = 1 + (heuvel ? 1 : 0) + (doel.largeTarget ? 1 : 0);
      const vol = rang.slice(0, volRangen).reduce((x, y) => x + y, 0);
      let extraV = 0;
      const volleyMag = volley && !ctx.sit('moved', 'Moved this turn') && !ctx.sit('stand', 'Stand & shoot');
      if (volleyMag && doel.largeTarget && rang.length > volRangen) {
        // The Volley Fire text counts from "the front rank (or front two ranks if the unit is on a hill)" and does not
        // mention the Large Target extra rank, so how the two combine is not stated → not counted.
        uit.nietMeegerekend.push({ regel: 'Volley Fire', van: 'wapen', reden: 'Shooting at a Large Target: the texts do not say how Volley Fire combines with the extra rank — rear ranks not counted' });
      } else if (volleyMag) {
        for (let i = volRangen; i < rang.length; i++) extraV += Math.ceil(rang[i] / 2);
      }
      schutters = vol + extraV;
      const delen = [`${vol}`];
      meeg('Front rank shoots', `${vol} model${vol === 1 ? '' : 's'} (${volRangen} rank${volRangen === 1 ? '' : 's'}${heuvel ? ', hill +1' : ''}${doel.largeTarget ? ', Large Target +1' : ''})`);
      if (extraV) { delen.push(`${extraV}`); meeg('Volley Fire', `+${extraV} models (half of each rear rank, rounded up)`); }
      else if (volley && !volleyMag && rang.length > volRangen) meeg('Volley Fire', 'Not used: the unit moved or is standing & shooting');
      if (delen.length > 1) schuttersLabel = delen.join(' + ');
    }
    const shotLabel = perModel.length === 2 && perModel[1] === 1 ? null : (multi ? rw.multiShots! : String(rw.shots));
    const sp = basisSpec(`${a.datasheet ?? a.name} · ${rw.name}`, perModel, schutters, shotLabel, hit, hitWorp, `BS${bs}${notes.length ? ', ' + notes.join(', ') : ''}`);
    if (schuttersLabel) sp.aanvallen = shotLabel ? `(${schuttersLabel})×${shotLabel}` : schuttersLabel;
    vulWondEnSaves(sp, { s, ap: eff.ap, wapen: eff, magisch, rij: shooterRij, isMagicWeapon: isMagic(rw), wHeeft, wapenRegels, combatRij: false });
    if (schutters > 0) specs.push(sp);
    else return stop('No model in this unit can shoot.');
    rangLimiet();
  } else {
    // ── close combat ──
    const charged = () => ctx.sit('charged', 'Charged this turn');
    const eersteRonde = () => ctx.sit('firstRound', 'First round of combat');
    const eersteWielder = rows.findIndex((r) => r.wielder);
    // The chosen weapon is one of the MAIN model's weapons when per-model data is given (wapensVoor offers those).
    const keuzeLijst = (perRij && eersteWielder >= 0 ? perRij[eersteWielder]?.melee : undefined) ?? melee;
    const gekozen = keuzeLijst.find((w) => w.slug === o.wapenSlug) ?? keuzeLijst[standaardMelee(keuzeLijst)] ?? HAND_WEAPON;
    const regelsVan = (w: WeaponProfile): Inst[] => w.specialRules.map((l) => ({ label: l, slug: slugVan(l, rules), ...regelParam(l), bron: 'wapen' as const, rijen: null }));
    wapenRegels = regelsVan(gekozen);
    // Weapon rules of every weapon a row actually fights with (per-model data: not only the chosen one).
    const gebruikteRegels = new Map<string, Inst>();
    const multiModel = a.count != null;
    // characteristics-champions: "A unit's champion usually has slightly better characteristics ... shown in the
    // model's profile" → in a multi-model unit, every wielder row after the first is a champion (1 model).
    const champIdx = multiModel ? rows.map((r, i) => (r.wielder && i > eersteWielder ? i : -1)).filter((i) => i >= 0) : [];
    // With Files: the-fighting-rank: "any row of models ... in which one or more is in base contact with the enemy is a
    // 'fighting rank'" → the front rank; every front-rank model is taken to be in base contact (see `rangLimiet`).
    const front = breedteActief ? rang[0] : 0;
    const champsVoor = breedteActief ? Math.min(champIdx.length, front) : 0;
    const laag: Laag = { multi: multiModel, breedte: breedteActief, F: breedteActief ? front : modellen, c: breedteActief ? champsVoor : Math.min(champIdx.length, modellen), P: 0, S: 0, modellen };

    // ── Initiative (only for a combat exchange; the order of blows does not change a one-way attack) ──
    // who-strikes-first: "Work your way through the Initiative values of the models, starting with the highest and
    // ending with the lowest."
    const initiatief = (r: Rij, ri: number, w: WeaponProfile, wr: Inst[]): { ini: number; note: string } => {
      const basis = absGetal(cel(r.stats, 'I'));
      let ini = basis ?? 1;
      const delen: string[] = [basis != null ? `I${basis}` : 'I –'];
      // strike-first: "improves its Initiative characteristic to 10 (before any other modifiers are applied)";
      // strike-last: "reduces its Initiative characteristic to 1 (before any other modifiers are applied). If a model
      // has both this rule and Strike First, the two rules cancel one another out." Weapon rules count (great weapon:
      // "Strike Last"; long-spear: "A long spear's Strike First special rule applies only against charging enemy units").
      const wapenTekst = rules[w.slug.replace(/(-ranged|-combat)?-profile$/, '')]?.bodyIndex ?? '';
      const sfWapen = wr.some((i) => i.slug === 'strike-first') && (!/Strike First special rule applies only against charging/i.test(wapenTekst) || gv!.tegenCharged);
      const sf = heeftOp('strike-first', ri) || sfWapen;
      const sl = heeftOp('strike-last', ri) || wr.some((i) => i.slug === 'strike-last');
      if (sf && !sl) { ini = 10; delen.push('Strike First → 10'); meeg('Strike First', `${zonderAantal(r.label)} at Initiative 10`); }
      else if (sl && !sf) { ini = 1; delen.push('Strike Last → 1'); meeg('Strike Last', `${zonderAantal(r.label)} at Initiative 1`); }
      // charging-units: "models gain a modifier to their Initiative characteristic during the Combat phase of a turn in
      // which they charged (to a maximum of 10): Charging an enemy in their front arc: +1 Initiative per full inch
      // moved (prior to making contact), to a maximum of +3." The owner's assumption: a charge of 3" or more, front arc.
      if (charged()) { ini += 3; delen.push('+3 charge'); }
      // elven-reflexes: "A model with this special rule (but not its mount) has a +1 modifier to its Initiative
      // characteristic (to a maximum of 10) during the first round of any combat."
      if (heeftOp('elven-reflexes', ri) && r.wielder && eersteRonde()) { ini += 1; delen.push('+1 Elven Reflexes'); }
      // thrusting-spear / asrai-spear / handmaidens-spear: "During a turn in which it was charged (in its front arc), a
      // model wielding a ... spear gains a +1 modifier to its Initiative against the charging unit(s)."
      if (gv!.tegenCharged && /gains a \+1 modifier to its Initiative against the charging unit/i.test(wapenTekst)) { ini += 1; delen.push(`+1 ${w.name}`); }
      return { ini: Math.min(10, ini), note: delen.join(' ') + (ini > 10 ? ' (max 10)' : '') };
    };

    // Fear (attacker side): fear: "If this test is failed, any models in the unit that direct their attacks
    // against the Fear-causing enemy suffer a -1 modifier to their rolls To Hit." "Models that cause Fear are
    // immune to Fear." immune-to-psychology / frenzy: automatically pass Fear tests.
    const immuun = ['fear', 'terror', 'nehekharan-undead', 'necromantic-undead', 'daemonic', 'daemonic-renegade', 'immune-to-psychology', 'frenzy'].some(heeftUnit);
    const angst = (doel.causesFear || heeftUnit('fear-of-elves')) && !immuun ? ctx.sit('fearFailed', 'Failed Fear test (−1 To Hit)') : false;

    // Hatred
    const hatInst = inst.find((i) => i.slug === 'hatred' && !i.onmatchbaar);
    let hatredActief: (rij: number) => boolean = () => false;
    if (hatInst) {
      const x = (hatInst.waarde ?? '').trim();
      const iedereen = /^all enemies$/i.test(x);
      const r1 = eersteRonde();
      const gehaat = iedereen ? true : ctx.sit('hatedTarget', `Target is hated (${x || 'see rule'})`);
      let hoogElf = false;
      const eternal = heeftUnit('eternal-hatred');
      if (eternal) hoogElf = /^high elves$/i.test(x) ? gehaat : ctx.sit('highElves', 'Target is High Elves');
      hatredActief = (rij: number) => {
        if (!geldtVoor(hatInst, rij)) return false;
        if (eternal && hoogElf && rows[rij].wielder) return true; // eternal-hatred: every round (not the mount)
        return r1 && gehaat;
      };
    }

    // Impact Hits — before anything else (impact-hits: "resolved ... before issuing challenges").
    const attTT = effectiefTroopType(a);
    const impactInst = inst.find((i) => i.slug === 'impact-hits' && !i.onmatchbaar);
    const stompInst = inst.find((i) => i.slug === 'stomp-attacks' && !i.onmatchbaar);
    // split-profile-*: "Impact Hits and/or Stomp Attacks use the mount's / chariot's Strength."
    const automatischeRij = (): number => {
      // monster-handlers: "A monster with this special rule is accompanied by one or more models representing its
      // handlers" — the monster (the first row) is the model that stomps, not its handlers.
      if (isMonster(attTT) && !(a.mounts ?? []).length && heeftUnit('monster-handlers') && absGetal(cel(rows[0].stats, 'S')) != null) return 0;
      if (isChariot(attTT)) return rows.findIndex((r) => absGetal(cel(r.stats, 'WS')) == null && absGetal(cel(r.stats, 'S')) != null);
      if (isCavalry(attTT) || (isMonster(attTT) && rows.length > 1)) {
        const kand = rows.map((r, i) => (!r.wielder && absGetal(cel(r.stats, 'S')) != null ? i : -1)).filter((i) => i >= 0);
        return kand.length === 1 ? kand[0] : -1;
      }
      const kand = rows.map((r, i) => (absGetal(cel(r.stats, 'S')) != null ? i : -1)).filter((i) => i >= 0);
      return kand.length === 1 ? kand[0] : -1;
    };
    const autoGroep = (ii: Inst, naam: string, apBasis: number, apNote: string | null) => {
      const ri = automatischeRij();
      if (ri < 0) { uit.nietMeegerekend.push({ regel: ii.label, van: 'aanvaller', reden: 'Cannot tell which profile row\'s Strength it uses' }); return; }
      const perModel = dobbelVerdeling(ii.waarde ?? '');
      if (!perModel) { uit.nietMeegerekend.push({ regel: ii.label, van: 'aanvaller', reden: `Number "${ii.waarde}" not understood` }); return; }
      const s = absGetal(cel(rows[ri].stats, 'S'))!;
      const magisch = heeftUnit('magical-attacks') || heeftUnit('daemonic') || heeftUnit('daemonic-renegade');
      // impact-hits: "can only be made by a charging model ... that is in base contact with the enemy"; stomp-attacks:
      // "can only be made by a model that is in base contact with the enemy" → with Files, the front rank only.
      const sp = basisSpec(`${naam}`, perModel, breedteActief ? front : modellen, perModel.length === 2 && perModel[1] === 1 ? null : ii.waarde!, { kind: 'auto' }, 'auto', `S${s} (${zonderAantal(rows[ri].label)}, unmodified)`);
      vulWondEnSaves(sp, { s, ap: apBasis, wapen: null, magisch, rij: ri, isMagicWeapon: false, wHeeft: () => false, wapenRegels: [], combatRij: false, auto: true });
      if (apNote) sp.notes.push(apNote);
      // impact-hits: "resolved against the charged unit when the combat is chosen ..., before issuing challenges" →
      // before every Initiative step; stomp-attacks: "must be made last, after all other attacks have been made,
      // including attacks made at Initiative 1".
      const isImpact = naam === 'Impact Hits';
      Object.assign(sp, { rol: isImpact ? 'impact' : 'stomp', mult: 1, laag, ini: isImpact ? 100 : -1, iniNote: isImpact ? 'before all blows' : 'after all blows' });
      specs.push(sp);
      meeg(ii.label, `${ii.waarde} automatic hit(s) per model at S${s}${apBasis ? `, AP ${apBasis}` : ''}`);
    };
    if (impactInst && charged()) {
      // scythed-wheels: "Any Impact Hits caused by a heavy chariot have an Armour Piercing characteristic of -2."
      const scythed = attTT === 'HCh';
      autoGroep(impactInst, 'Impact Hits', scythed ? -2 : 0, scythed ? 'Scythed Wheels: AP −2' : null);
      if (scythed) meeg('Scythed Wheels (Heavy Chariot)', 'Impact Hits have AP −2');
    }

    // press-of-battle: "Except during a turn in which it charged, the fighting rank of a unit that has this rule and is
    // arrayed in combat order is not one, but two ranks deep." Who has it: regular-infantry and heavy-infantry list it
    // under the troop type's Special Rules; monstrous-ranks-renegade: "All Ogre Kingdom's Monstrous Infantry (except
    // Yhetees) gain the Press of Battle". combat-order-close-order / -open-order: "wider than it is deep ... or that is
    // square ... is said to be in Combat Order"; phalanx: "considered to be in Combat Order ... even if it is deeper
    // than it is wide, provided it contains enough models per rank to claim a rank bonus".
    let pobN = 0;
    let supIdx = 1; // supporting-attacks: "the rank or file directly behind the fighting rank"
    if (breedteActief) {
      const pob = attTT === 'RI' || attTT === 'HI' || heeftUnit('press-of-battle')
        || (heeftUnit('monstrous-ranks-renegade') && attTT === 'MI' && !/yhetee/i.test(`${a.datasheet ?? ''} ${a.name}`));
      if (pob && rang.length > 1) {
        const combatOrder = breedte >= rang.length || (heeftUnit('phalanx') && breedte >= (MODELLEN_PER_RANG[attTT!] ?? Infinity));
        if (skirm) uit.nietMeegerekend.push({ regel: 'Press of Battle', van: 'aanvaller', reden: 'In Skirmish formation the unit is not "arrayed in combat order" (a Close/Open Order shape) — second rank not counted' });
        else if (!combatOrder) meeg('Press of Battle', `No effect: the unit is deeper than it is wide (Marching Column), not in Combat Order`);
        else if (charged()) meeg('Press of Battle', 'No effect on the turn the unit charged');
        else { pobN = rang[1]; supIdx = 2; meeg('Press of Battle', `+${pobN} model${pobN === 1 ? '' : 's'} in rank 2 make 1 attack each`); }
      }
      laag.P = pobN;
      laag.S = rang[supIdx] ?? 0;
    }

    rows.forEach((r, ri) => {
      // Attacks
      const aCel = cel(r.stats, 'A');
      let aDist: number[] | null = null;
      if (absGetal(aCel) != null) aDist = dobbelVerdeling(aCel);
      else if (/d\d/i.test(aCel)) { aDist = dobbelVerdeling(aCel); if (aDist) meeg('Random Attacks', `${zonderAantal(r.label)}: ${aCel} attacks per model`); }
      if (!aDist) return; // "-": no attacks (a chariot body, a war machine)
      const wsA = absGetal(cel(r.stats, 'WS'));
      const sBase = absGetal(cel(r.stats, 'S'));
      if (sBase == null) return;
      // Which weapon this row fights with.
      //  - Per-model data (unit-details.json, `o.uitrusting`): the chosen weapon only if THIS model carries it,
      //    else its own default (unitDetails.rijMeleeWapen); a model whose line names no weapon of the unit (a
      //    mount's "hooves (counts as a hand weapons)") fights with the plain hand weapon.
      //  - A row the data does not match: every wielder takes the chosen weapon, as before.
      //  - No per-model data at all (fallback): monster-handlers — "In combat, each handler adds its attacks to
      //    those of the monster." The monster's own weapon (Wicked claws, …) is not the handlers', so a handler
      //    row fights with the plain hand weapon every model has, and the result says so (review 22-11-2026).
      const eigen = perRij?.[ri] ?? null;
      const isHandler = !perRij && r.wielder && ri > eersteWielder && /handler/i.test(r.label) && heeftUnit('monster-handlers');
      let draagt: boolean;
      let w: WeaponProfile;
      if (eigen) {
        const x = rijMeleeWapen(eigen, gekozen);
        w = x ?? HAND_WEAPON;
        draagt = !!x;
      } else {
        draagt = r.wielder && !isHandler;
        w = draagt ? gekozen : HAND_WEAPON;
      }
      if (isHandler && gekozen !== HAND_WEAPON && !isHandWeapon(gekozen)) {
        uit.nietMeegerekend.push({ regel: zonderAantal(r.label), van: 'aanvaller', reden: `Counted with hand weapons — the game data does not say which weapons the handlers carry` });
      }
      // This row's weapon rules (Armour Bane, Fight in Extra Rank, …): those of ITS weapon.
      const rijRegels = !draagt ? [] : w === gekozen ? wapenRegels : regelsVan(w);
      for (const i of rijRegels) if (!gebruikteRegels.has(i.label)) gebruikteRegels.set(i.label, i);
      const wNote: string[] = [];
      // lance: "A lance can only be used during a turn in which the wielder charged"
      const baseRule = rules[w.slug.replace(/(-ranged|-combat)?-profile$/, '')];
      if (draagt && /can only be used during a turn in which the wielder charged/i.test(baseRule?.bodyIndex ?? '') && !charged()) {
        wNote.push(`${w.name} only usable when charging → hand weapon`);
        w = HAND_WEAPON;
      }
      const e = effectiveMelee(sBase, w, w.chargeBonus ? charged() : false);
      let aMod = draagt ? e.aMod : 0;
      // extra-attacks (on the model, not the weapon — the weapon's is already in aMod)
      for (const ei of instVan('extra-attacks', ri)) {
        const n = (ei.waarde ?? '').match(/^\+?(\d+)$/);
        if (n) { aMod += parseInt(n[1], 10); meeg(ei.label, `+${n[1]} Attacks`); continue; }
        // "Extra Attacks (+remaining Wounds)" (War Hydra): extra-attacks — "a modifier to its Attacks characteristic,
        // as shown in brackets". The modifier is the model's remaining Wounds: what the caller passes
        // (`aanvallerWounds`, from the wound tracker), else the full Wounds of this profile row. Only the row that
        // has the Wounds gets it, so the handlers do not.
        const wRij = absGetal(cel(r.stats, 'W'));
        if (/^\+?\s*remaining wounds$/i.test(ei.waarde ?? '') && wRij != null && !isHandler) {
          const rest = Math.max(0, Math.min(wRij, Math.round(o.aanvallerWounds ?? wRij)));
          aMod += rest;
          meeg(ei.label, `+${rest} Attacks (${rest} Wound${rest === 1 ? '' : 's'} remaining)`);
        } else if (!/^\+?\s*remaining wounds$/i.test(ei.waarde ?? '')) {
          uit.nietMeegerekend.push({ regel: ei.label, van: 'aanvaller', reden: 'Attacks modifier that is not a fixed number — not applied' });
        }
      }
      if (heeftOp('furious-charge', ri) && charged()) { aMod += 1; meeg('Furious Charge', '+1 Attacks on the charge'); }
      if (heeftOp('frenzy', ri) && r.wielder && charged()) { aMod += 1; meeg('Frenzy', '+1 Attacks on the charge (not the mount)'); }
      if (aMod) {
        // modifying-characteristics: "add or subtract the modifier(s) shown to the characteristic"
        const shifted: number[] = [];
        aDist.forEach((p, k) => { const v = Math.max(0, k + aMod); shifted[v] = (shifted[v] ?? 0) + p; });
        for (let i = 0; i < shifted.length; i++) shifted[i] = shifted[i] ?? 0;
        aDist = shifted;
      }
      if (verwachting(aDist) <= 0) return;

      // How many of this row attack. Without Files: `modellen` (champions are 1 of them). With Files: only the front
      // rank is in base contact — how-many-attacks: "If a model is in base contact with an enemy model, it makes a
      // number of attacks equal to its Attacks characteristic"; the champion is one of the front-rank models, and a
      // mount fights only for the models in base contact (its rider's model).
      const aantalModellen = breedteActief ? front : modellen;
      let n = aantalModellen;
      if (multiModel && r.wielder) {
        if (ri === eersteWielder) n = Math.max(0, aantalModellen - (breedteActief ? champsVoor : champIdx.length));
        else { const pos = champIdx.indexOf(ri); n = pos >= 0 && aantalModellen > pos ? 1 : 0; }
      }
      n *= r.mult;
      // Extra 1-attack models behind the front rank (rank-and-file row only).
      let pobHier = 0;
      let supHier = 0;
      if (breedteActief && multiModel && ri === eersteWielder) {
        pobHier = pobN * r.mult;
        // supporting-attacks: "Models whose weapons allow them to make a 'supporting attack' can do so if they are in
        // the rank or file directly behind the fighting rank"; fight-in-extra-rank: "A model with this special rule
        // may make a supporting attacks." Spears/polearms: "cannot make a supporting attack during a turn in which it
        // charged".
        const fier = (draagt && rijRegels.some((i) => i.slug === 'fight-in-extra-rank')) || heeftOp('fight-in-extra-rank', ri);
        const nietOpCharge = /cannot make a supporting attack during a turn in which it charged/i.test(rules[w.slug.replace(/(-ranged|-combat)?-profile$/, '')]?.bodyIndex ?? '');
        if (fier && !(nietOpCharge && charged())) supHier = (rang[supIdx] ?? 0) * r.mult;
        if (fier && nietOpCharge && charged() && (rang[supIdx] ?? 0) > 0) meeg('Fight in Extra Rank', `No supporting attacks: the ${w.name} cannot support on the turn it charged`);
      }
      // cavalry-support: "Should a cavalry model be able to make a supporting attack, only the rider can attack, not
      // the mount." (mount rows never get supporting attacks here). For a mount in a Press of Battle second rank the
      // texts say nothing → not counted.
      if (breedteActief && !r.wielder && pobN > 0) uit.nietMeegerekend.push({ regel: `${zonderAantal(r.label)} (second rank)`, van: 'aanvaller', reden: 'Press of Battle: whether a mount in the second rank attacks is not stated — not counted' });
      if (supHier > 0 && rows.some((x) => !x.wielder && absGetal(cel(x.stats, 'A')) != null)) meeg('Cavalry Support', 'Only the riders make the supporting attack, not the mounts');
      if (n <= 0 && pobHier <= 0 && supHier <= 0) return;

      // To Hit
      let wsEff = wsA;
      if (wsEff != null && heeftOp('martial-prowess', ri) && eersteRonde()) { wsEff = Math.min(10, wsEff + 1); meeg('Martial Prowess', '+1 WS in the first round of combat'); }
      let hit: HitSpec;
      let hitWorp: string;
      let hitNote: string;
      // characteristics-of-zero-combat: "If a model has a WS of 0, all of its attacks miss automatically, whilst
      // attacks directed against it will hit automatically."
      if (wsEff == null || wsEff === 0) { hit = { kind: 'none' }; hitWorp = '—'; hitNote = 'WS 0: attacks miss'; }
      else if (doel.ws === 0) { hit = { kind: 'auto' }; hitWorp = 'auto'; hitNote = 'target WS 0: automatic hits'; }
      else if (doel.ws == null) { uit.nietMeegerekend.push({ regel: 'Target Weapon Skill', van: 'doelwit', reden: 'Target has no WS value' }); return; }
      else {
        let need = TO_HIT_CHART[chartIdx(wsEff)][chartIdx(doel.ws)];
        const mods: string[] = [];
        if (angst) { need += 1; mods.push('Fear −1'); }
        let reroll: HitSpec['reroll'] = null;
        if (hatredActief(ri)) { reroll = 'failed'; mods.push('re-roll misses (Hatred)'); meeg(hatInst!.label, 'Re-roll failed To Hit rolls'); }
        if (!reroll) {
          const pf = heeftOp('primal-fury', ri) && ctx.sit('primalFury', 'Subject to Primal Fury');
          const ith = heeftOp('ithilmar-weapons', ri) && r.wielder && isHandWeapon(w) && !isMagic(w);
          if (pf || ith) { reroll = 'ones'; mods.push('re-roll 1s'); meeg(pf ? 'Primal Fury' : 'Ithilmar Weapons', 'Re-roll To Hit rolls of a natural 1'); }
        } else if (heeftOp('primal-fury', ri)) ctx.sit('primalFury', 'Subject to Primal Fury');
        hit = { kind: 'roll', need, nat6Altijd: true, reroll };
        hitWorp = plus(Math.max(2, Math.min(6, need)));
        hitNote = `WS${wsEff} vs WS${doel.ws}${mods.length ? ', ' + mods.join(', ') : ''}`;
      }
      const label = draagt && w !== HAND_WEAPON && w.slug !== 'hand-weapon-profile' ? `${zonderAantal(r.label)} · ${w.name}` : zonderAantal(r.label);
      const perModelLabel = absGetal(aCel) != null ? null : aCel;
      const magisch = isMagic(w) || w.specialRules.some((x) => slugVan(x, rules) === 'magical-attacks') || heeftOp('magical-attacks', ri) || heeftOp('daemonic', ri) || heeftOp('daemonic-renegade', ri)
        || (r.wielder && isHandWeapon(w) && heeftOp('ensorcelled-weapons', ri));
      const wr = rijRegels;
      const iniRij = gv ? initiatief(r, ri, w, wr) : null;
      const maak = (naam: string, dist: number[], aantal: number, diceLabel: string | null, rol: NonNullable<Spec['rol']>) => {
        const sp = basisSpec(naam, dist, aantal, diceLabel, hit, hitWorp, hitNote);
        vulWondEnSaves(sp, {
          s: e.s, ap: e.ap, wapen: w, magisch, rij: ri, isMagicWeapon: isMagic(w),
          wHeeft: (slug) => wr.some((i) => i.slug === slug), wapenRegels: wr, combatRij: true,
        });
        sp.notes.push(...wNote);
        Object.assign(sp, { rol, mult: r.mult, laag, ini: iniRij?.ini, iniNote: iniRij?.note });
        specs.push(sp);
      };
      const rolHoofd: NonNullable<Spec['rol']> = !multiModel ? 'single' : !r.wielder ? 'mount' : ri === eersteWielder ? 'rf' : 'champ';
      if (n > 0) maak(label, aDist, n, perModelLabel ? `${perModelLabel}${aMod ? `+${aMod}` : ''}` : null, rolHoofd);
      // how-many-attacks: "If a model is able to fight but is not in base contact with an enemy model, it can make
      // only one attack, regardless of its Attacks characteristic." — the Press of Battle second rank. A supporting
      // attack is "a 'supporting attack'" (one) by a model that is not in base contact.
      if (pobHier > 0) maak(`${label} · rank 2 (Press of Battle)`, [0, 1], pobHier, null, 'pob');
      if (supHier > 0) {
        maak(`${label} · rank ${supIdx + 1} (supporting)`, [0, 1], supHier, null, 'sup');
        meeg('Fight in Extra Rank', `+${supHier} model${supHier === 1 ? '' : 's'} in rank ${supIdx + 1} make 1 supporting attack each`);
      }
    });

    // Per-model data: report the rules of the weapons the rows really used (the handlers' whip too).
    if (perRij) wapenRegels = [...gebruikteRegels.values()];

    // Stomp Attacks — last (stomp-attacks: "must be made last, after all other attacks have been made").
    if (stompInst) {
      // thunderstomp: "Any Stomp Attacks made by a behemoth have an Armour Piercing characteristic of -2. However,
      // this rule cannot be used against another monster"
      const thunder = attTT === 'Be' && !isMonster(doel.tt);
      autoGroep(stompInst, 'Stomp Attacks', thunder ? -2 : 0, thunder ? 'Thunderstomp: AP −2' : null);
      if (thunder) meeg('Thunderstomp (Behemoth)', 'Stomp Attacks have AP −2');
    }
    if (!specs.length) return stop('No model in this unit can make attacks.');
    rangLimiet();
  }

  // ── classify everything that was not consumed ──
  for (const i of inst) classificeer(i, 'aanvaller', o.soort, rules, uit);
  for (const i of wapenRegels) classificeer(i, 'wapen', o.soort, rules, uit);
  if (breedteActief && !skirm) {
    // With Files the engine works these out itself (above); drop the generic "set the number yourself" entries.
    uit.nietMeegerekend = uit.nietMeegerekend.filter((x) => !(x.reden === NIET_MET_REDEN['volley-fire'] || x.reden === NIET_MET_REDEN['fight-in-extra-rank']));
  }
  for (const i of inst) {
    const t = i.slug ? TELT[i.slug] : undefined;
    if (i.bron !== 'rij' || !t || t.kant === 'doelwit' || (t.soort && t.soort !== o.soort)) continue;
    if (['impact-hits', 'stomp-attacks', 'fear', 'terror', 'immune-to-psychology', 'nehekharan-undead', 'necromantic-undead'].includes(i.slug!)) continue; // model-level anyway
    if (rows.some((r, ri) => r.wielder && !(i.rijen?.has(ri)))) {
      const eigen = [...(i.rijen ?? [])].map((ri) => zonderAantal(rows[ri].label));
      uit.nietMeegerekend.push({ regel: eigen.length ? `${i.label} (${eigen.join(', ')})` : i.label, van: 'aanvaller', reden: 'Listed as the mount\'s rule only: applied to the mount, not to the rider/crew (the data has no per-model note)' });
    }
  }
  for (const p of proza) uit.nietMeegerekend.push({ regel: p.item, van: 'aanvaller', reden: 'Magic item with a free-text effect — not evaluated' });
  if (o.soort === 'combat') {
    const hoofd = rows.findIndex((r) => r.wielder);
    const lijst = (perRij && hoofd >= 0 ? perRij[hoofd]?.melee : undefined) ?? melee;
    const gekozen = lijst.find((w) => w.slug === o.wapenSlug) ?? lijst[standaardMelee(lijst)];
    if (gekozen && isMagic(gekozen)) uit.nietMeegerekend.push({ regel: gekozen.name, van: 'wapen', reden: 'Magic weapon: its own S/AP profile is not in the game data — the wielder\'s base profile is used' });
  } else {
    const rw = ranged.find((w) => w.slug === o.wapenSlug) ?? ranged[0];
    if (rw && isMagic(rw)) uit.nietMeegerekend.push({ regel: rw.name, van: 'wapen', reden: 'Magic weapon: its own profile is not in the game data' });
  }

  // ── per-group step tables & the distribution ──
  const W = doel.w;
  gv?.vang({ specs, W, M });
  const kansen = specs.map(perAanval);
  specs.forEach((sp, gi) => {
    const { stappen, verlies } = groepTabel(sp, kansen[gi], verwachting(sp.aantal), W);
    uit.groepen.push({ naam: sp.naam, aanvallen: sp.aanvallen, stappen, wounds: verlies });
  });

  // Distribution over total Wounds lost: state = Wounds lost so far (multiple-wound-models: "Wounds are lost by
  // a single model until its Wounds characteristic is reduced to zero. Wounds are then lost by the next model").
  const maxSchade = Math.max(1, ...specs.map((sp) => sp.mw.length - 1), W ?? 1);
  const totMax = specs.reduce((s, sp) => s + (sp.aantal.length - 1) * maxSchade, 0);
  const cap = W != null ? Math.min(M * W, totMax) : totMax;
  const kosten = specs.reduce((s, sp) => s + (sp.aantal.length - 1), 0) * (cap + 1) * (maxSchade + 2);
  if (kosten <= DP_BUDGET) {
    let st = new Float64Array(cap + 1);
    st[0] = 1;
    specs.forEach((sp, gi) => {
      const cache = new Map<number, number[]>();
      const verlies = (cur: number) => { let v = cache.get(cur); if (!v) { v = verliesVerdeling(kansen[gi], sp, cur); cache.set(cur, v); } return v; };
      const stap = (s: Float64Array) => {
        const nw = new Float64Array(cap + 1);
        for (let L = 0; L <= cap; L++) {
          const p = s[L];
          if (!p) continue;
          if (W != null && L >= M * W) { nw[L] += p; continue; }
          const cur = W != null ? W - (L % W) : Infinity;
          const v = verlies(cur);
          for (let kk = 0; kk < v.length; kk++) if (v[kk]) nw[Math.min(cap, L + kk)] += p * v[kk];
        }
        return nw;
      };
      const acc = new Float64Array(cap + 1);
      let cur = st;
      for (let N = 0; N < sp.aantal.length; N++) {
        if (N > 0) cur = stap(cur);
        const pN = sp.aantal[N];
        if (pN) for (let L = 0; L <= cap; L++) acc[L] += pN * cur[L];
      }
      st = acc;
    });
    let eind = st.length;
    while (eind > 1 && st[eind - 1] < 1e-15) eind--;
    uit.verdeling = Array.from(st.slice(0, eind));
    uit.wounds = uit.verdeling.reduce((s, p, k) => s + p * k, 0);
    uit.modellenGedood = W != null ? uit.verdeling.reduce((s, p, L) => s + p * Math.floor(L / W), 0) : null;
  } else {
    uit.verdeling = null;
    const som = uit.groepen.reduce((s, g) => s + g.wounds, 0);
    uit.wounds = W != null ? Math.min(som, M * W) : som;
    uit.modellenGedood = W === 1 ? uit.wounds : null;
  }
  if (W == null && specs.some((sp) => sp.nat6 === 'kb')) uit.nietMeegerekend.push({ regel: 'Killing Blow / Monster Slayer', van: 'doelwit', reden: 'Target Wounds unknown — counted as a single Wound' });

  // ── record the rules that changed the numbers ──
  for (const sp of specs) for (const n of sp.notes) if (/^(Armour Bane|Poisoned|Killing Blow|Cleaving|Monster Slaying|Murderous|Choppas|Ensorcelled|Khopesh|Gromril|Foe Render)/.test(n)) meeg(n.split(':')[0], n.split(':').slice(1).join(':').trim() || n);
  if (specs.some((sp) => sp.ward != null)) {
    const wd = doel.ward(false).label || doel.ward(true).label;
    if (wd) meeg(wd, 'Ward save after the armour save');
  }
  if (specs.some((sp) => sp.regen != null)) meeg(doel.regenLabel, 'Regeneration save per Wound lost');
  if (doel.regen != null && specs.some((sp) => sp.regen == null)) meeg(doel.flammable ? 'Flammable' : 'Warp-spawned / Killing Blow', 'No Regeneration save against some attacks');
  for (const sp of specs) if (sp.mwLabel) meeg(`Multiple Wounds (${sp.mwLabel.replace(/^×/, '')})`, 'Each unsaved wound multiplied');
  if (doel.ethereal) meeg('Ethereal', 'Only Magical attacks can wound');

  if (specs.every((sp) => sp.woundNeed <= 0)) {
    uit.onmogelijk = specs[0]?.woundNote?.startsWith('Ethereal') ? 'Ethereal: only Magical attacks can wound this target.' : 'These attacks cannot wound the target (Strength too low).';
  } else if (specs.every((sp) => sp.hit.kind === 'none' || (sp.hit.kind === 'roll' && sp.hit.need! >= 10 && sp.hit.tweede == null))) {
    uit.onmogelijk = 'These attacks cannot hit.';
  }
  return afronden(uit);

  // ── helpers bound to this call ──
  function basisSpec(naam: string, perModel: number[], n: number, diceLabel: string | null, hit: HitSpec, hitWorp: string, hitNote: string): Spec {
    const aantal = somVan(perModel, n);
    const vast = perModel.findIndex((p) => p === 1);
    return {
      naam,
      aanvallen: vast >= 0 ? String(vast * n) : diceLabel ? `${n}×(${diceLabel})` : String(verwachting(perModel) * n),
      aantal, hit, hitWorp, hitNote, perModel, n0: n,
      poisoned: false, woundNeed: 0, woundMod: 0, woundNote: '', reroll1Wound: false,
      armour: null, apImp: 0, bane: 0, nat6: null, ward: null, regen: null, mw: [0, 1], mwLabel: null, notes: [],
    };
  }

  function vulWondEnSaves(sp: Spec, x: { s: number; ap: number; wapen: WeaponProfile | null; magisch: boolean; rij: number; isMagicWeapon: boolean; wHeeft: (slug: string) => boolean; wapenRegels: Inst[]; combatRij: boolean; auto?: boolean }) {
    const t = doel.t!;
    const handw = !!x.wapen && isHandWeapon(x.wapen) && !x.isMagicWeapon;
    const wielder = rows[x.rij]?.wielder ?? false;
    const opModel = (slug: string) => !x.auto && heeftOp(slug, x.rij);
    const beide = (slug: string) => x.wHeeft(slug) || opModel(slug);
    let ap = x.ap;
    // Hand-weapon AP rules (not on the mount; single non-magical hand weapon)
    if (x.combatRij && wielder && handw) {
      if (opModel('foe-render') && ctx.sit('primalFury', 'Subject to Primal Fury')) { ap = -2; sp.notes.push('Foe Render: hand weapon AP −2'); }
      else if (opModel('ensorcelled-weapons')) { ap = Math.min(ap, -1); sp.notes.push('Ensorcelled Weapons: hand weapon AP −1, Magical'); }
      else if (opModel('khopesh')) { ap = Math.min(ap, -1); sp.notes.push('Khopesh: hand weapon AP −1'); }
      else if (opModel('gromril-weapons')) {
        if ((a.magicItems ?? []).some((m) => /rune/i.test(m.name))) uit.nietMeegerekend.push({ regel: 'Gromril Weapons', van: 'aanvaller', reden: 'Not applied: the unit carries runes (a rune-inscribed hand weapon cancels it)' });
        else { ap = Math.min(ap, -1); sp.notes.push('Gromril Weapons: hand weapon AP −1'); }
      }
    }
    if (x.combatRij && wielder && !x.isMagicWeapon && opModel('choppas') && ctx.sit('charged', 'Charged this turn')) { ap -= 1; sp.notes.push('Choppas: AP improved by 1, re-roll To Wound 1s'); sp.reroll1Wound = true; }

    // To Wound
    if (doel.ethereal && !x.magisch) {
      sp.woundNeed = 0; sp.woundNote = 'Ethereal: only Magical attacks can wound';
    } else if (x.s <= 0) {
      sp.woundNeed = 0; sp.woundNote = `S${x.s}: cannot wound`;
    } else {
      sp.woundNeed = TO_WOUND_CHART[chartIdx(x.s)][chartIdx(t)];
      const capNote = x.s > 10 || t > 10 ? ' (chart stops at 10)' : '';
      sp.woundNote = sp.woundNeed > 0 ? `S${x.s} vs T${t}${capNote}${doel.tNote ? ` — ${doel.tNote}` : ''}` : `S${x.s} vs T${t}: too tough to wound${capNote}`;
    }
    // Poisoned Attacks: "Any spells cast by the model are unaffected, as are any attacks made with magic weapons."
    if (!x.auto && beide('poisoned-attacks') && !x.isMagicWeapon && sp.hit.kind === 'roll') {
      sp.poisoned = true;
      sp.notes.push('Poisoned Attacks: natural 6 To Hit gives +2 To Wound');
    }
    // Murderous (rulebook): hand weapon only; Murderous (Renegade): first round, non-magical weapons. Not the mount.
    if (x.combatRij && wielder && opModel('murderous') && handw) { sp.reroll1Wound = true; sp.notes.push('Murderous: re-roll To Wound 1s'); }
    if (x.combatRij && wielder && opModel('murderous-renegade') && !x.isMagicWeapon && ctx.sit('firstRound', 'First round of combat')) { sp.reroll1Wound = true; sp.notes.push('Murderous: re-roll To Wound 1s (first round)'); }

    // Armour, AP, Armour Bane (cumulative-special-rules: duplicate versions combine)
    sp.apImp = Math.max(0, -ap);
    let bane = 0;
    if (!x.auto) {
      for (const i of [...x.wapenRegels.filter((w) => w.slug === 'armour-bane'), ...instVan('armour-bane', x.rij)]) {
        const v = parseInt(i.waarde ?? '', 10);
        if (Number.isFinite(v)) bane += v;
        else uit.nietMeegerekend.push({ regel: i.label, van: 'aanvaller', reden: 'Value not understood' });
      }
    }
    sp.bane = bane;
    if (bane) sp.notes.push(`Armour Bane (${bane}): natural 6 To Wound improves AP by ${bane}`);
    sp.armour = doel.armour(x.magisch).save;

    // Natural-6 To Wound specials — combat only, and not on attacks that wound automatically.
    if (x.combatRij && !x.auto) {
      const kb = beide('killing-blow') && (isInfantry(doel.tt) || isCavalry(doel.tt));
      const ms = beide('monster-slayer') && isMonster(doel.tt);
      const cl = beide('cleaving-blow') && (doel.tt === 'RI' || doel.tt === 'HI' || doel.tt === 'LCa' || doel.tt === 'HCa' || doel.tt === 'WB');
      if (kb || ms) { sp.nat6 = 'kb'; sp.notes.push(`${kb ? 'Killing Blow' : 'Monster Slaying Blow'}: natural 6 To Wound — no armour or Regeneration, all Wounds lost`); }
      else if (cl) { sp.nat6 = 'cleave'; sp.notes.push('Cleaving Blow: natural 6 To Wound — no armour or Regeneration save'); }
      if ((beide('killing-blow') || beide('monster-slayer') || beide('cleaving-blow')) && doel.tt == null) uit.nietMeegerekend.push({ regel: 'Killing Blow / Cleaving Blow / Monster Slayer', van: 'doelwit', reden: 'Target troop type unknown' });
    }

    // Ward & Regeneration
    sp.ward = doel.ward(x.magisch).v;
    const flaming = (beide('flaming-attacks') && !x.isMagicWeapon) || x.wHeeft('flaming-attacks');
    let regen = doel.regen;
    if (regen != null && doel.flammable && flaming) { regen = null; sp.notes.push('Flammable: no Regeneration vs Flaming attacks'); meeg('Flaming Attacks', 'Target is Flammable: no Regeneration save'); }
    if (regen != null && doel.warpSpawned && x.magisch) { regen = null; sp.notes.push('Warp-spawned: no Regeneration vs Magical attacks'); }
    sp.regen = regen;

    // Multiple Wounds
    const mwI = [...x.wapenRegels.filter((w) => w.slug === 'multiple-wounds'), ...(x.auto ? [] : instVan('multiple-wounds', x.rij))];
    if (mwI.length) {
      const dist = dobbelVerdeling(mwI[0].waarde ?? '');
      if (dist && mwI.length === 1) { sp.mw = dist; sp.mwLabel = `×${mwI[0].waarde}`; }
      else uit.nietMeegerekend.push({ regel: mwI[0].label, van: 'wapen', reden: mwI.length > 1 ? 'More than one Multiple Wounds source — not combined' : 'Value not understood' });
    }
  }
}

// ───────────────────────────── combat exchange ─────────────────────────────
// One round of close combat between two units: both strike, in Initiative order, and models slain before their
// Initiative step do not strike back.
//  who-strikes-first: "Work your way through the Initiative values of the models, starting with the highest and
//  ending with the lowest. Models make attacks when their Initiative value is reached."
//  simultaneous-combat: "If models on both sides of a combat have the same Initiative value (after modifiers), they
//  will attack at the same time. ... Casualties caused by the active player during simultaneous combat do not reduce
//  the number of attacks made by enemy models with the same Initiative value."
//  we-cant-all-fight: "If a model in the fighting rank is slain by an enemy with a higher Initiative characteristic
//  before it has made its attack(s), it cannot fight and its attacks are lost. ... A model cannot fight during a phase
//  in which it stepped forward into the fighting rank".
//  stepping-forward-and-closing-in: "casualties are removed from the back rank ... Slain models are considered to have
//  been removed from the end(s) of the fighting rank."
//  excess-casualties: "any excess casualties will reduce the number of supporting attacks."
//  combat-champions: "A champion is not counted amongst casualties caused by enemy attacks in combat unless: They are
//  the last remaining model in the unit." (attacks directed at the champion are not modelled)
//  split-profiles-combat: "each set of Attacks is resolved when their Initiative value is reached. If the model is
//  slain before it can make all of its attacks, any not yet made are lost."

export interface GevechtZijde { modellen: number; breedte?: number; wapenSlug?: string; aanvallerWounds?: number; uitrusting?: EquipmentLine[] | null }
export interface GevechtOpties {
  /** The unit the player is looking at. */
  ik: GevechtZijde;
  /** The target, striking back. */
  vijand: GevechtZijde;
  /** One shared map: `charged` = I charged, `enemyCharged` = the enemy charged (both on = both charged, as after a
   *  Counter Charge: "Both units are considered to have charged during this turn"), `firstRound` shared, enemy-only
   *  toggles under `enemy.<key>`. */
  situaties?: Record<string, boolean>;
}
/** Strike order, first to last. */
export interface SlagBeurt { zijde: 'ik' | 'vijand'; naam: string; initiatief: string; toelichting?: string }
export interface GevechtResultaat {
  /** Wounds I inflict, with my attackers reduced by casualties suffered before they strike. */
  uit: MathResultaat;
  /** Wounds the enemy inflicts on me, same idea. */
  terug: MathResultaat;
  volgorde: SlagBeurt[];
}

/** Joint-distribution cells below this probability are dropped after each Initiative step. */
const GEVECHT_PRUNE = 1e-13;
/** Largest joint state space (my Wounds × enemy Wounds) computed exactly. */
const GEVECHT_MAX = 40_000;

/** Attacking models of a group after `k` models of its own unit were slain before its Initiative step. */
function aantalNa(sp: Spec, k: number): number {
  const L = sp.laag;
  const m = sp.mult ?? 1;
  const n0 = sp.n0 ?? 0;
  if (!L || k <= 0 || sp.rol === 'impact') return n0; // impact-hits come before any blow
  const levend = Math.max(0, L.modellen - k);
  if (!L.multi || sp.rol === 'single') return Math.min(n0, levend * m);
  // Slain models come off the fighting rank (front rank first), then rank 2 (Press of Battle), then the supporting
  // rank; the champion stays until it is the last model.
  const rfBasis = Math.max(0, L.F - L.c);
  const rf = rfBasis - Math.min(k, rfBasis);
  const champ = levend > 0;
  switch (sp.rol) {
    case 'rf': return Math.min(n0, rf * m);
    case 'champ': return champ ? n0 : 0;
    case 'mount': return Math.min(n0, (rf + (champ ? L.c : 0)) * m);
    case 'stomp': return Math.min(n0, rf + (champ ? L.c : 0));
    case 'pob': return Math.min(n0, Math.max(0, L.P - Math.max(0, k - rfBasis)) * m);
    case 'sup': return Math.min(n0, Math.max(0, L.S - Math.max(0, k - rfBasis - L.P)) * m);
    default: return n0;
  }
}

/** Apply a group with `aantal` (distribution of its number of attacks) to a distribution over the target's Wounds
 *  lost (multiple-wound-models: Wounds go on one model until it is slain). */
function pasGroepToe(v: Float64Array, sp: Spec, k: Kansen, aantal: number[], W: number, M: number, cap: number, cache: Map<number, number[]>): Float64Array {
  const verlies = (cur: number) => { let x = cache.get(cur); if (!x) { x = verliesVerdeling(k, sp, cur); cache.set(cur, x); } return x; };
  const stap = (s: Float64Array) => {
    const nw = new Float64Array(cap + 1);
    for (let L = 0; L <= cap; L++) {
      const p = s[L];
      if (!p) continue;
      if (L >= M * W) { nw[L] += p; continue; }
      const x = verlies(W - (L % W));
      for (let kk = 0; kk < x.length; kk++) if (x[kk]) nw[Math.min(cap, L + kk)] += p * x[kk];
    }
    return nw;
  };
  const acc = new Float64Array(cap + 1);
  let cur = v;
  for (let N = 0; N < aantal.length; N++) {
    if (N > 0) cur = stap(cur);
    const pN = aantal[N];
    if (pN) for (let L = 0; L <= cap; L++) acc[L] += pN * cur[L];
  }
  return acc;
}

interface Vang { specs: Spec[]; W: number | null; M: number }

function gevechtZijden(ik: ArmyUnit, vijand: ArmyUnit, o: GevechtOpties, rules: Record<string, Rule>, lijst: Situatie[]) {
  const w = o.situaties ?? {};
  let A: Vang | null = null;
  let B: Vang | null = null;
  const optie = (z: GevechtZijde, tegen: GevechtZijde): AanvalOpties => ({
    soort: 'combat', modellen: z.modellen, breedte: z.breedte, wapenSlug: z.wapenSlug, aanvallerWounds: z.aanvallerWounds,
    uitrusting: z.uitrusting, doelwitModellen: tegen.modellen, situaties: w,
  });
  const uitA = reken(ik, vijand, optie(o.ik, o.vijand), rules, maakCtx(w, lijst), { tegenCharged: !!w.enemyCharged, vang: (c) => { A = c; } });
  const uitB = reken(vijand, ik, optie(o.vijand, o.ik), rules, maakCtx(w, lijst, vijandSleutel), { tegenCharged: !!w.charged, vang: (c) => { B = c; } });
  return { uitA, uitB, A: A as Vang | null, B: B as Vang | null };
}

/** The toggles for a combat exchange: mine, then the enemy's ("Enemy charged", "Enemy: …"). */
export function situatiesVoorGevecht(ik: ArmyUnit, vijand: ArmyUnit, opties: Pick<GevechtOpties, 'ik' | 'vijand'>, rules: Record<string, Rule>): Situatie[] {
  const lijst: Situatie[] = [];
  gevechtZijden(ik, vijand, { ...opties, situaties: undefined }, rules, lijst);
  return lijst;
}

const iniLabel = (ini: number) => (ini >= 100 ? 'Impact' : ini < 0 ? 'Stomp' : `I${ini}`);
const fmtKort = (n: number) => (Math.round(n * 10) / 10).toString();

export function berekenGevecht(ik: ArmyUnit, vijand: ArmyUnit, o: GevechtOpties, rules: Record<string, Rule>): GevechtResultaat {
  const w = o.situaties ?? {};
  const { uitA, uitB, A, B } = gevechtZijden(ik, vijand, o, rules, []);
  const specsA = A?.specs ?? [];
  const specsB = B?.specs ?? [];
  type G = { sp: Spec; k: Kansen; zijde: 'ik' | 'vijand'; att: number; wounds: number; cache: Map<number, number[]>; dist: Map<number, number[]>; slag?: number };
  const groepen: G[] = [
    ...specsA.map((sp) => ({ sp, k: perAanval(sp), zijde: 'ik' as const, att: 0, wounds: 0, cache: new Map(), dist: new Map() })),
    ...specsB.map((sp) => ({ sp, k: perAanval(sp), zijde: 'vijand' as const, att: 0, wounds: 0, cache: new Map(), dist: new Map() })),
  ];
  const iniVan = (g: G) => g.sp.ini ?? 1;
  const inis = [...new Set(groepen.map(iniVan))].sort((x, y) => y - x);

  // Strike order (also used when the exact propagation is not possible).
  const volgorde: SlagBeurt[] = [];
  for (const ini of inis) {
    const hier = groepen.filter((g) => iniVan(g) === ini);
    const samen = hier.some((g) => g.zijde === 'ik') && hier.some((g) => g.zijde === 'vijand');
    for (const g of [...hier.filter((x) => x.zijde === 'ik'), ...hier.filter((x) => x.zijde === 'vijand')]) {
      g.slag = volgorde.length;
      volgorde.push({ zijde: g.zijde, naam: g.sp.naam, initiatief: iniLabel(ini), toelichting: [g.sp.iniNote, samen && ini < 100 && ini >= 0 ? 'same Initiative: simultaneous' : ''].filter(Boolean).join('; ') || undefined });
    }
  }

  // Shared notes for both results.
  const noten = (r: MathResultaat) => {
    r.nietMeegerekend = r.nietMeegerekend.filter((x) => x.regel !== 'Files');
    if (o.ik.breedte != null || o.vijand.breedte != null) {
      r.nietMeegerekend.push({ regel: 'Files', van: 'aanvaller', reden: 'Every front-rank model counts as in base contact. Overlap with a narrower enemy and joined characters are not included.' });
    }
    if (w.charged || w.enemyCharged) {
      r.nietMeegerekend.push({ regel: 'Charge', van: 'aanvaller', reden: 'A charge of 3" or more into the front arc: +3 Initiative (charging-units). A flank or rear charge (up to +4) is not modelled.' });
    }
    r.nietMeegerekend.push({ regel: 'Casualties', van: 'aanvaller', reden: 'Models slain before their Initiative step do not strike. Slain models come off the front rank first, then rank 2 (Press of Battle), then the supporting rank; the champion last. Challenges are not modelled.' });
    if (r.meegerekend.some((m) => /remaining\)/.test(m.effect))) {
      r.nietMeegerekend.push({ regel: 'Extra Attacks (+remaining Wounds)', van: 'aanvaller', reden: 'Uses the Wounds at the start of the combat, not those left after earlier blows' });
    }
  };
  const klaar = (uit: MathResultaat, terug: MathResultaat): GevechtResultaat => {
    noten(uit); noten(terug);
    for (const g of groepen) {
      const r = g.zijde === 'ik' ? uit : terug;
      const gr = r.groepen.find((x) => x.naam === g.sp.naam && x.slag == null);
      if (gr) gr.slag = g.slag;
    }
    uit.groepen.sort((x, y) => (x.slag ?? 0) - (y.slag ?? 0));
    terug.groepen.sort((x, y) => (x.slag ?? 0) - (y.slag ?? 0));
    return { uit: afronden(uit), terug: afronden(terug), volgorde };
  };

  const Wv = A?.W ?? null; // enemy Wounds per model (target of my attacks)
  const Mv = Math.max(0, Math.floor(o.vijand.modellen));
  const Wi = B?.W ?? null; // my Wounds per model
  const Mi = Math.max(0, Math.floor(o.ik.modellen));
  const nietExact = (reden: string) => {
    for (const r of [uitA, uitB]) {
      r.verdeling = null;
      r.nietMeegerekend.push({ regel: 'Casualties before striking', van: 'aanvaller', reden });
    }
    return klaar(uitA, uitB);
  };
  // My losses are only tracked when the enemy strikes (and need my Wounds per model), and vice versa.
  if ((specsA.length && Wv == null) || (specsB.length && Wi == null)) {
    return nietExact('Not counted: Wounds per model unknown, so casualties before striking cannot be worked out');
  }
  const WvN = Wv ?? 1;
  const WiN = Wi ?? 1;
  const capB = specsA.length ? Mv * WvN : 0;
  const capA = specsB.length ? Mi * WiN : 0;
  const nb = capB + 1;
  if ((capA + 1) * nb > GEVECHT_MAX) return nietExact('Not counted: too many models for the exact calculation');

  const distVan = (g: G, n: number) => { let d = g.dist.get(n); if (!d) { d = somVan(g.sp.perModel ?? [0, 1], n); g.dist.set(n, d); } return d; };
  const moment = (v: Float64Array) => { let s = 0; for (let i = 1; i < v.length; i++) s += i * v[i]; return s; };
  const som = (v: Float64Array) => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i]; return s; };

  // My groups: their number of attackers depends on MY Wounds lost (row), they act on the enemy's (column).
  const doeIk = (J: Float64Array, gs: G[]) => {
    const out = new Float64Array(J.length);
    for (let la = 0; la <= capA; la++) {
      let v: Float64Array = J.slice(la * nb, (la + 1) * nb);
      const mass = som(v);
      if (mass <= 0) continue;
      const kA = Math.floor(la / WiN);
      for (const g of gs) {
        const n = aantalNa(g.sp, kA);
        if (n <= 0) continue;
        const d = distVan(g, n);
        g.att += mass * verwachting(d);
        const m0 = moment(v);
        v = pasGroepToe(v, g.sp, g.k, d, WvN, Mv, capB, g.cache);
        g.wounds += moment(v) - m0;
      }
      out.set(v, la * nb);
    }
    return out;
  };
  // The enemy's groups: attackers depend on the enemy's Wounds lost (column, or a fixed count in a simultaneous step).
  const doeVijand = (J: Float64Array, gs: G[], vastK?: number) => {
    const out = new Float64Array(J.length);
    for (let lb = 0; lb <= capB; lb++) {
      let v: Float64Array = new Float64Array(capA + 1);
      for (let la = 0; la <= capA; la++) v[la] = J[la * nb + lb];
      const mass = som(v);
      if (mass <= 0) continue;
      const kB = vastK ?? Math.floor(lb / WvN);
      for (const g of gs) {
        const n = aantalNa(g.sp, kB);
        if (n <= 0) continue;
        const d = distVan(g, n);
        g.att += mass * verwachting(d);
        const m0 = moment(v);
        v = pasGroepToe(v, g.sp, g.k, d, WiN, Mi, capA, g.cache);
        g.wounds += moment(v) - m0;
      }
      for (let la = 0; la <= capA; la++) out[la * nb + lb] = v[la];
    }
    return out;
  };

  let J = new Float64Array((capA + 1) * nb);
  J[0] = 1;
  for (const ini of inis) {
    const ga = groepen.filter((g) => g.zijde === 'ik' && iniVan(g) === ini);
    const gb = groepen.filter((g) => g.zijde === 'vijand' && iniVan(g) === ini);
    if (ga.length && gb.length) {
      // Simultaneous: the enemy's attackers count from its losses BEFORE this step → split by that count.
      const acc = new Float64Array(J.length);
      const plakken = new Map<number, Float64Array>();
      for (let i = 0; i < J.length; i++) {
        if (!J[i]) continue;
        const kb = Math.floor((i % nb) / WvN);
        let s = plakken.get(kb);
        if (!s) { s = new Float64Array(J.length); plakken.set(kb, s); }
        s[i] = J[i];
      }
      for (const [kb, s] of plakken) {
        const s2 = doeVijand(doeIk(s, ga), gb, kb);
        for (let i = 0; i < acc.length; i++) acc[i] += s2[i];
      }
      J = acc;
    } else if (ga.length) J = doeIk(J, ga);
    else if (gb.length) J = doeVijand(J, gb);
    for (let i = 0; i < J.length; i++) if (J[i] < GEVECHT_PRUNE) J[i] = 0;
  }

  // Marginals (renormalised for the pruned mass).
  const tot = som(J) || 1;
  const margB = new Array(capB + 1).fill(0);
  const margA = new Array(capA + 1).fill(0);
  for (let la = 0; la <= capA; la++) for (let lb = 0; lb <= capB; lb++) {
    const p = J[la * nb + lb] / tot;
    if (!p) continue;
    margB[lb] += p;
    margA[la] += p;
  }
  const trim = (v: number[]) => { let e = v.length; while (e > 1 && v[e - 1] < 1e-15) e--; return v.slice(0, e); };
  const vul = (r: MathResultaat, gs: G[], marg: number[], Wd: number) => {
    if (!gs.length) return;
    r.verdeling = trim(marg);
    r.wounds = r.verdeling.reduce((s, p, k) => s + p * k, 0);
    r.modellenGedood = r.verdeling.reduce((s, p, L) => s + p * Math.floor(L / Wd), 0);
    r.groepen = gs.map((g) => {
      const att = g.att / tot;
      const { stappen } = groepTabel(g.sp, g.k, att, Wd);
      const vol = verwachting(g.sp.aantal);
      const minder = att < vol - 0.005 && fmtKort(att) !== fmtKort(vol);
      return {
        naam: g.sp.naam, aanvallen: minder ? `${fmtKort(att)} of ${g.sp.aanvallen}` : g.sp.aanvallen, stappen, wounds: g.wounds / tot,
        ...(minder ? { mogelijk: vol, verloren: vol - att } : {}),
      };
    });
    const verlorenAtt = gs.reduce((s, g) => s + verwachting(g.sp.aantal) - g.att / tot, 0);
    if (verlorenAtt > 0.005) {
      r.meegerekend.push({ regel: 'Casualties before striking', effect: `${fmtKort(verlorenAtt)} attacks lost on average to models slain before they strike (we-cant-all-fight)` });
    }
  };
  vul(uitA, groepen.filter((g) => g.zijde === 'ik'), margB, WvN);
  vul(uitB, groepen.filter((g) => g.zijde === 'vijand'), margA, WiN);
  return klaar(uitA, uitB);
}

function afronden(r: MathResultaat): MathResultaat {
  // de-duplicate the honest lists
  const seen = new Set<string>();
  r.nietMeegerekend = r.nietMeegerekend.filter((x) => {
    const k = `${x.van}|${x.regel}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (r.onmogelijk) { r.wounds = r.groepen.length ? r.wounds : 0; }
  return r;
}
