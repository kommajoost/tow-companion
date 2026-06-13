import type { ArmyUnit, Rule, RichNode } from '../types';

// Turns the verbatim weapon "(Profile)" tables in rules.json (columns R | S | AP | Special Rules)
// into structured weapon profiles, and computes a unit's EFFECTIVE combat stats once a weapon /
// loadout is chosen — e.g. a Dark Rider's S 3 → 4 with a cavalry spear on the charge — plus the
// shooting To Hit from the model's Ballistic Skill.

export interface WeaponProfile {
  slug: string;
  name: string; // clean name, without the "(Profile)" suffix
  kind: 'melee' | 'ranged';
  range: string; // "Combat" or e.g. `24"`
  /** Relative Strength modifier for melee weapons (e.g. +1 for a cavalry spear), else null. */
  sMod: number | null;
  /** Absolute Strength (ranged weapons, e.g. 3), else null. */
  sAbs: number | null;
  /** Armour Piercing as a number (0 = none, -1, -2 …). */
  ap: number;
  /** Single-shot count (the "fire normally" mode) — almost always 1. */
  shots: number;
  /** The multiple-shots count when the weapon can fire more — the "X" of "Multiple Shots (X)"
   * (e.g. "2", "D3+3"), or "D3+3" for a Rapid Fire bolt thrower; null if it can't. Firing the
   * multiple-shots mode costs an extra −1 To Hit (the "Multiple Shots" rule). */
  multiShots: string | null;
  /** Attacks modifier (e.g. +1 from an additional hand weapon / "Extra Attacks (+1)"). */
  aMod: number;
  specialRules: string[];
  /** True when the Strength/AP bonus applies only on the charge (cavalry spear, lance). */
  chargeBonus: boolean;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Flatten the text of a rich-text node.
function textOf(node: RichNode | undefined): string {
  if (!node) return '';
  if (node.nodeType === 'text') return node.value ?? '';
  return (node.content ?? []).map(textOf).join('');
}

// Pull the rows (each a list of cell texts) out of the first table in a rich-text body.
function tableRows(body: RichNode | null): string[][] {
  const rows: string[][] = [];
  const walk = (n: RichNode | undefined) => {
    if (!n) return;
    if (n.nodeType === 'table-row') {
      const cells: string[] = [];
      const cellWalk = (x: RichNode | undefined) => {
        if (!x) return;
        for (const c of x.content ?? []) {
          if (c.nodeType === 'table-cell' || c.nodeType === 'table-header-cell') cells.push(textOf(c).trim());
          else cellWalk(c);
        }
      };
      cellWalk(n);
      rows.push(cells);
      return;
    }
    (n.content ?? []).forEach(walk);
  };
  walk(body ?? undefined);
  return rows;
}

function splitRules(cell: string): string[] {
  const t = cell.trim();
  if (!t || t === '-' || t === '–') return [];
  return t
    .split(',')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// Parse a "<weapon> (Profile)" rule into a WeaponProfile. `baseRule` is the matching weapon rule
// (slug without "-profile"), read only to detect a charge-only bonus from its notes.
export function parseWeaponProfile(rule: Rule, baseRule?: Rule): WeaponProfile | null {
  const rows = tableRows(rule.body);
  if (rows.length < 2) return null;
  // Header is rows[0] (R | S | AP | Special Rules); the weapon's line is the first data row.
  const [r = '', s = '', ap = '', sr = ''] = rows[1];
  const kind: WeaponProfile['kind'] = /combat/i.test(r) ? 'melee' : 'ranged';

  let sMod: number | null = null;
  let sAbs: number | null = null;
  const sTrim = s.replace(/\s+/g, '');
  const rel = sTrim.match(/^S([+-]\d+)?$/i);
  if (rel) sMod = rel[1] ? parseInt(rel[1], 10) : 0;
  else {
    const abs = sTrim.match(/-?\d+/);
    if (abs) sAbs = parseInt(abs[0], 10);
  }

  const apNum = ap.match(/-?\d+/);
  const specialRules = splitRules(sr);
  // Multiple Shots (X) → the player may fire X shots instead of 1 (at −1 To Hit). A Rapid Fire
  // bolt thrower is the same idea (its rule fires Multiple Shots (D3+3)).
  const msExpr = specialRules.find((x) => /multiple shots/i.test(x))?.match(/\(([^)]+)\)/)?.[1]?.trim();
  const rapidFire = specialRules.some((x) => /rapid fire/i.test(x));
  const extraM = specialRules.find((x) => /extra attacks/i.test(x))?.match(/\(\s*\+?(\d+)\s*\)/);

  const chargeBonus = !!baseRule && /a turn in which the wielder charged/i.test(baseRule.bodyIndex || '');

  return {
    slug: rule.slug,
    name: rule.name.replace(/\s*\(profile\)\s*$/i, '').trim(),
    kind,
    range: r || (kind === 'melee' ? 'Combat' : ''),
    sMod,
    sAbs,
    ap: apNum ? parseInt(apNum[0], 10) : 0,
    shots: 1,
    multiShots: msExpr ?? (rapidFire ? 'D3+3' : null),
    aMod: extraM ? parseInt(extraM[1], 10) : 0,
    specialRules,
    chargeBonus,
  };
}

// Find the "<name>-profile" rule for a wargear/loadout label (handles plurals and bracketed
// suffixes), or null if it isn't a weapon with a profile (armour, shields, command, …).
function weaponProfileSlug(label: string, rules: Record<string, Rule>): string | null {
  const noBracket = label.replace(/\[.*?\]/g, ' ').trim();
  const n = norm(noBracket);
  if (!n) return null;
  const tries = new Set([n]);
  const words = n.split(' ');
  const last = words[words.length - 1];
  if (/s$/.test(last)) tries.add([...words.slice(0, -1), last.replace(/s$/, '')].join(' '));
  for (const t of tries) {
    const slug = `${t.replace(/ /g, '-')}-profile`;
    if (rules[slug]) return slug;
  }
  for (const t of tries) {
    const r = Object.values(rules).find(
      (x) => x.slug.endsWith('-profile') && norm(x.name.replace(/\(profile\)/i, '')) === t,
    );
    if (r) return r.slug;
  }
  return null;
}

// Resolve a unit's loadout into melee and ranged weapon profiles (in loadout order, de-duplicated).
export function unitWeapons(unit: ArmyUnit, rules: Record<string, Rule>): {
  melee: WeaponProfile[];
  ranged: WeaponProfile[];
} {
  const melee: WeaponProfile[] = [];
  const ranged: WeaponProfile[] = [];
  const seen = new Set<string>();
  for (const opt of unit.options) {
    // An additional / second hand weapon has no weapon-profile table — it grants Extra Attacks
    // (+1). Synthesise it so it shows in the loadout and bumps the model's Attacks.
    if (/additional hand weapon|two hand weapons/i.test(opt) && !seen.has('two-hand-weapons')) {
      seen.add('two-hand-weapons');
      melee.push({
        slug: 'two-hand-weapons-additional-hand-weapon',
        name: 'Two hand weapons',
        kind: 'melee',
        range: 'Combat',
        sMod: 0,
        sAbs: null,
        ap: 0,
        shots: 1,
        multiShots: null,
        aMod: 1,
        specialRules: ['Extra Attacks (+1)', 'Requires Two Hands'],
        chargeBonus: false,
      });
      continue;
    }
    const slug = weaponProfileSlug(opt, rules);
    if (!slug || seen.has(slug)) continue;
    const w = parseWeaponProfile(rules[slug], rules[slug.replace(/-profile$/, '')]);
    if (!w) continue;
    seen.add(slug);
    (w.kind === 'ranged' ? ranged : melee).push(w);
  }
  return { melee, ranged };
}

// Effective melee Strength, AP and Attacks modifier for a model wielding `w`. Charge-only bonuses
// (cavalry spear, lance) apply their Strength/AP only when `charge` is true; the Attacks modifier
// (an additional hand weapon's +1) always applies.
export function effectiveMelee(baseS: number, w: WeaponProfile, charge: boolean): { s: number; ap: number; aMod: number } {
  if (w.sAbs != null) return { s: w.sAbs, ap: w.ap, aMod: w.aMod };
  const apply = !w.chargeBonus || charge;
  return { s: baseS + (apply ? w.sMod ?? 0 : 0), ap: apply ? w.ap : 0, aMod: w.aMod };
}

// Standard shooting To Hit modifiers (To Hit Modifiers chart + Enemy Fire (Skirmishers)). Each
// is a penalty to the roll.
export const SHOOTING_MODS: { key: string; label: string; penalty: number }[] = [
  { key: 'long', label: 'Long range', penalty: 1 },
  { key: 'moved', label: 'Moved & shot', penalty: 1 },
  { key: 'stand', label: 'Stand & shoot', penalty: 1 },
  { key: 'soft', label: 'Partial cover', penalty: 1 },
  { key: 'full', label: 'Full cover', penalty: 2 },
  { key: 'skirmish', label: 'Target skirmishers', penalty: 1 },
];

// Shooting To Hit from Ballistic Skill (Roll to Hit chart: BS1 6+ … BS5 2+) plus penalties.
// `impossible` when the penalties push the required roll above 6.
export function rangedToHit(bs: number, penalty: number): { value: number; impossible: boolean } {
  const base = Math.max(2, Math.min(6, 7 - bs));
  const v = base + penalty;
  return { value: Math.min(6, v), impossible: v > 6 };
}

// Read a numeric characteristic (S, BS, …) from a profile's stat cells; null if absent / "-".
export function statValue(stats: { k: string; v: string }[], key: string): number | null {
  const cell = stats.find((s) => s.k.toUpperCase() === key.toUpperCase());
  if (!cell) return null;
  const m = cell.v.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}
