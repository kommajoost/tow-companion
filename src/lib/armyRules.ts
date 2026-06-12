import type { ArmyUnit, Lore, Rule } from '../types';

// Maps army-list special-rule labels to our verbatim wiki rules, and tags each rule with
// the turn phase(s) it is relevant in (heuristic keyword scan of the rule body).

export type PhaseId = 'strategy' | 'movement' | 'shooting' | 'combat';

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stripParens = (s: string) => s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

// Build a name→slug index from the rules map. Exact rule names win; then paren-stripped
// aliases fill the gaps so army-list labels resolve to rules whose wiki name carries a value
// placeholder — e.g. "Impact Hits (D6+1)", "Hatred (High Elves)", "Fly (9)", "Magic
// Resistance (-1)", "Multiple Shots (2)" → "Impact Hits (X)", "Hatred (X)", "Fly (X)",
// "Magic Resistance (-X)", "Multiple Shots (X)". On alias collisions the shortest (most
// canonical) rule name wins, so e.g. "Magic Resistance (-X)" beats "...(Magic)".
export function buildRuleIndex(rules: Record<string, Rule>): Map<string, string> {
  const idx = new Map<string, string>();
  const exact = new Set<string>();
  for (const r of Object.values(rules)) {
    const k = normalize(r.name);
    if (k && !idx.has(k)) {
      idx.set(k, r.slug);
      exact.add(k);
    }
  }
  const aliasLen = new Map<string, number>();
  for (const r of Object.values(rules)) {
    const stripped = stripParens(r.name);
    if (!stripped || stripped === r.name.trim()) continue;
    const k = normalize(stripped);
    if (!k || exact.has(k)) continue; // never override an exact rule name
    const prev = aliasLen.get(k);
    if (prev == null || r.name.length < prev) {
      idx.set(k, r.slug);
      aliasLen.set(k, r.name.length);
    }
  }
  return idx;
}

// Resolve a special-rule label (e.g. "Hatred (High Elves)", "Impact Hits (D6+1)") to a
// rule slug, or null if there's no matching rule page.
export function resolveRuleSlug(label: string, idx: Map<string, string>): string | null {
  const withoutParen = label.replace(/\(.*?\)/g, ' ');
  const candidates = [
    label,
    withoutParen,
    withoutParen.replace(/\s*\d.*$/, ''), // drop trailing number/qualifier
  ];
  for (const c of candidates) {
    const k = normalize(c);
    if (!k) continue;
    if (idx.has(k)) return idx.get(k)!;
    // final-word singular/plural (e.g. "Ward Save" → "Ward Saves")
    const words = k.split(' ');
    const last = words[words.length - 1];
    const swapped = /s$/.test(last) ? last.replace(/s$/, '') : last + 's';
    const k2 = [...words.slice(0, -1), swapped].join(' ');
    if (k2 !== k && idx.has(k2)) return idx.get(k2)!;
  }
  return null;
}

// Some army-list tokens use a singular form while the rulebook entry is plural (command
// group), or a slightly different name. Map those explicitly to the right rule slug.
const OPTION_ALIASES: Record<string, string> = {
  'standard bearer': 'standard-bearers',
  'standard bearers': 'standard-bearers',
  musician: 'musicians',
  musicians: 'musicians',
  champion: 'champions',
  champions: 'champions',
  standard: 'standards',
  standards: 'standards',
  'war banner': 'standards',
  'magic standard': 'magic-standards',
  'battle standard': 'the-battle-standard',
  'battle standard bearer': 'the-battle-standard',
  'army standard bearer': 'the-battle-standard',
  general: 'the-general-characters',
  'army general': 'the-general-characters',
  wizard: 'wizards',
  'additional hand weapon': 'two-hand-weapons-additional-hand-weapon',
  'additional hand weapons': 'two-hand-weapons-additional-hand-weapon',
  'two hand weapons': 'two-hand-weapons-additional-hand-weapon',
  'great weapons': 'great-weapon',
  bow: 'bows',
  spear: 'spears',
};

// Cache the set of existing slugs derived from the name→slug index (memoised per index).
const slugSetCache = new WeakMap<Map<string, string>, Set<string>>();
function knownSlugs(idx: Map<string, string>): Set<string> {
  let s = slugSetCache.get(idx);
  if (!s) {
    s = new Set(idx.values());
    slugSetCache.set(idx, s);
  }
  return s;
}

// Resolve a wargear/option label (e.g. "Wizard [Level 3 Wizard]", "Shields", "Lances",
// "Standard bearer", "Repeater crossbows") to a rule slug. Tries, in order: an explicit
// alias, resolveRuleSlug, then singular/plural variants of the final word.
export function resolveOptionSlug(label: string, idx: Map<string, string>): string | null {
  const noBracket = label.replace(/\[.*?\]/g, ' ').trim();
  const aliasKey = normalize(noBracket);

  // 1. explicit alias — accept only if that slug actually exists in the rule data
  const alias = OPTION_ALIASES[aliasKey];
  if (alias && knownSlugs(idx).has(alias)) return alias;

  // 2. direct name match (handles parenthetical qualifiers via resolveRuleSlug)
  const direct = resolveRuleSlug(noBracket, idx);
  if (direct) return direct;

  // 2b. a parenthetical command role, e.g. "Dread Knight (champion)" → champions,
  // "Bannerman (standard bearer)" → standard-bearers.
  const role = label.match(/\(([^)]+)\)/);
  if (role) {
    const roleAlias = OPTION_ALIASES[normalize(role[1])];
    if (roleAlias && knownSlugs(idx).has(roleAlias)) return roleAlias;
  }

  // 3. final-word singular / plural variants (Shields↔Shield, Standard bearer↔bearers)
  const words = noBracket.split(/\s+/).filter(Boolean);
  if (words.length) {
    const last = words[words.length - 1];
    const variants: string[] = [];
    if (/s$/.test(last)) variants.push(last.replace(/s$/, ''));
    else variants.push(last + 's');
    for (const v of variants) {
      const k = normalize([...words.slice(0, -1), v].join(' '));
      if (k && idx.has(k)) return idx.get(k)!;
    }
  }

  // 4. drop a trailing "s" everywhere (Repeater crossbows → Repeater crossbow)
  const k2 = normalize(noBracket.replace(/s\b/g, ''));
  if (k2 && idx.has(k2)) return idx.get(k2)!;
  return null;
}

// ─────────────────────────── Battle tracking helpers ───────────────────────────

/** Number of models in a unit (the leading multiplier; single models = 1). */
export function unitSize(unit: ArmyUnit): number {
  return unit.count && unit.count > 0 ? unit.count : 1;
}

// Parse a `W` stat value. A value like "+2" or "(+1)" is a wounds MODIFIER (a ridden
// mount/steed adding wounds to the rider); a plain number is an absolute value.
function parseW(v: string | undefined): { mod: number | null; abs: number | null } {
  const s = String(v ?? '').trim();
  const m = s.match(/^\(?\s*\+\s*(\d+)\s*\)?$/);
  if (m) return { mod: parseInt(m[1], 10), abs: null };
  const n = parseInt(s.replace(/[^\d]/g, ''), 10);
  return { mod: null, abs: Number.isFinite(n) ? n : null };
}

/**
 * Wounds for one model. Base = the `W` of the unit's first (main) profile, PLUS any mount/
 * steed wound modifiers on later profiles — e.g. a character on a Dark Pegasus whose profile
 * shows `W(+1)` gets +1 wound. Additional profiles with an absolute `W` (rank-and-file mounts
 * like a Cold One) don't add. Defaults to 1.
 */
export function woundsPerModel(unit: ArmyUnit): number {
  const profiles = unit.profiles ?? [];
  let base = 0;
  let bonus = 0;
  profiles.forEach((p, idx) => {
    const { mod, abs } = parseW(p.stats.find((s) => s.k.toUpperCase() === 'W')?.v);
    if (mod != null) bonus += mod;
    else if (idx === 0 && abs != null && abs > 0) base = abs;
  });
  const total = base + bonus;
  return total > 0 ? total : 1;
}

/** Total strength of a unit = models × wounds per model. */
export function unitTotalStrength(unit: ArmyUnit): number {
  return unitSize(unit) * woundsPerModel(unit);
}

// ───────────────────────────── Wizards & lores ─────────────────────────────

export interface WizardInfo {
  isWizard: boolean;
  /** Level of Wizardry (1–4) when stated in the list, else null. */
  level: number | null;
}

// A unit is a Wizard if any option/special-rule mentions "Wizard" (army lists write it as
// "Wizard [Level 3 Wizard]" or a "Level 3 Wizard" special rule). Pull the level if present.
export function wizardInfo(unit: ArmyUnit): WizardInfo {
  const tokens = [...unit.options, ...unit.specialRules];
  let isWizard = false;
  let level: number | null = null;
  for (const t of tokens) {
    if (/\bwizard\b/i.test(t) || /\blevel\s*\d+\b/i.test(t)) {
      const lm = t.match(/level\s*(\d+)/i);
      if (lm) {
        isWizard = true;
        level = parseInt(lm[1], 10);
      } else if (/\bwizard\b/i.test(t)) {
        isWizard = true;
      }
    }
  }
  return { isWizard, level };
}

// Build a normalised lore-name → slug index (memoised per lores object).
const loreIdxCache = new WeakMap<Record<string, Lore>, Map<string, string>>();
function loreNameIndex(lores: Record<string, Lore>): Map<string, string> {
  let idx = loreIdxCache.get(lores);
  if (!idx) {
    idx = new Map();
    for (const lore of Object.values(lores)) {
      const k = normalize(lore.name);
      if (k) idx.set(k, lore.slug);
    }
    loreIdxCache.set(lores, idx);
  }
  return idx;
}

// Lores a Wizard unit references directly in its special rules (e.g. "Lore of Naggaroth",
// "Dark Magic"). These are pre-selected as a starting point; the player can add more.
export function suggestedLores(unit: ArmyUnit, lores: Record<string, Lore>): string[] {
  const idx = loreNameIndex(lores);
  const out: string[] = [];
  for (const label of [...unit.specialRules, ...unit.options]) {
    const slug = idx.get(normalize(label));
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
}

// Phase keyword heuristics. A rule can map to several phases.
const PHASE_KEYWORDS: Record<PhaseId, RegExp> = {
  strategy:
    /\b(strategy phase|command sub-phase|start of turn|rally|rallie|conjuration|cast|spell|winds of magic|dispel)\b/i,
  movement:
    /\b(movement phase|charge|march|flee|fleeing|compulsory|pursu|advance move|wheel|reform|swiftstride|fast cavalry|move)\b/i,
  shooting:
    /\b(shooting phase|shoot|volley|ballistic skill|\bbs\b|stand & shoot|stand and shoot|missile|bow|crossbow)\b/i,
  combat:
    /\b(combat phase|close combat|fight|initiative|combat result|break test|strikes? first|to wound|impact hits|killing blow|armour bane|in melee)\b/i,
};

/**
 * Best-effort set of phases a rule is relevant in, by scanning its plain-text body.
 * Returns [] when no phase keyword is found (e.g. always-on psychology like Fear).
 */
export function phasesForRule(rule: Rule | undefined): PhaseId[] {
  if (!rule) return [];
  const text = `${rule.name}. ${rule.bodyIndex || ''}`;
  const out: PhaseId[] = [];
  (Object.keys(PHASE_KEYWORDS) as PhaseId[]).forEach((p) => {
    if (PHASE_KEYWORDS[p].test(text)) out.push(p);
  });
  return out;
}
