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
  // Paren-stripped aliases fill the gaps. BUT when a stripped alias collides across multiple distinct
  // FACTION-variant rules (e.g. "Fiery Breath (Dark Elves)" / "(Lizardmen)" / "(Renegade)" all strip
  // to "fiery breath"), the bare alias is ambiguous — picking one army's version is wrong — so we
  // leave it unresolved (callers disambiguate via the army faction). Value qualifiers like "(9)" or
  // "(-X)" are not factions, so those aliases are still registered (shortest, most canonical wins).
  const aliasCands = new Map<string, { slug: string; name: string }[]>();
  for (const r of Object.values(rules)) {
    if (r.slug.endsWith('-profile')) continue; // profiles aren't link targets
    const stripped = stripParens(r.name);
    if (!stripped || stripped === r.name.trim()) continue;
    const k = normalize(stripped);
    if (!k || exact.has(k)) continue; // never override an exact rule name
    const list = aliasCands.get(k);
    if (list) list.push({ slug: r.slug, name: r.name });
    else aliasCands.set(k, [{ slug: r.slug, name: r.name }]);
  }
  for (const [k, cands] of aliasCands) {
    const factionSlugs = new Set(cands.filter((c) => isFactionQualifier(c.name)).map((c) => c.slug));
    if (factionSlugs.size >= 2) continue; // ambiguous faction family → no bare alias
    const best = cands.reduce((a, b) => (b.name.length < a.name.length ? b : a));
    idx.set(k, best.slug);
  }

  // A rule page whose title names two things at once — "Two Hand Weapons/Additional Hand Weapon",
  // "Ithilmar Armour/Ithilmar Barding" — is ONE page reachable under either name. Army lists cite the
  // halves ("Additional hand weapon"), which matched nothing, so the page existed but no label could
  // reach it. There are two such titles in the data, yielding four aliases and colliding with nothing;
  // `exact` still wins, so a half that is also a page in its own right keeps its own page.
  for (const r of Object.values(rules)) {
    if (r.slug.endsWith('-profile') || !r.name.includes('/')) continue;
    for (const half of r.name.split('/')) {
      const k = normalize(half);
      if (k && !exact.has(k) && !idx.has(k)) idx.set(k, r.slug);
    }
  }
  return idx;
}

// A rule whose only qualifier is a faction/army name (letters, no digits or "X" value placeholder),
// e.g. "(Dark Elves)", "(Renegade)" — as opposed to a value qualifier like "(9)", "(-X)", "(D6+1)".
function isFactionQualifier(name: string): boolean {
  const q = name.match(/\(([^)]*)\)/)?.[1]?.trim() ?? '';
  return q.length > 0 && /[a-z]/i.test(q) && !/[0-9x]/i.test(q);
}

// Resolve a special-rule label (e.g. "Hatred (High Elves)", "Impact Hits (D6+1)") to a
// rule slug, or null if there's no matching rule page.
export function resolveRuleSlug(label: string, idx: Map<string, string>, faction?: string): string | null {
  // A faction-variant rule ("Fiery Breath (Dark Elves)") keys as "fiery breath dark elves". For a
  // bare label ("Fiery breath") we can recover the right army's version using the army's faction.
  if (faction) {
    const base = label.replace(/\([^)]*\)/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\s*\d.*$/, '');
    const fk = normalize(`${base} ${faction}`);
    if (fk && idx.has(fk)) return idx.get(fk)!;
  }
  const withoutParen = label.replace(/\(.*?\)/g, ' ');
  const withoutBraces = label.replace(/\{.*?\}/g, ' ');
  const candidates = [
    label,
    withoutParen,
    withoutParen.replace(/\s*\d.*$/, ''), // drop trailing number/qualifier
    // {faction} tags are part of some rule slugs ("…{renegade}" → "-renegade"), so the brace-kept
    // forms above are tried first; this drops the tag as a fallback ("Doomseeker {dwarfs}" → rule
    // "doomseeker") for rules whose slug does NOT carry the tag.
    withoutBraces,
    withoutBraces.replace(/\(.*?\)/g, ' '),
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

// Memoise the rule index per rules object so repeated callers (RichText, UnitCard) share it.
const ruleIndexCache = new WeakMap<Record<string, Rule>, Map<string, string>>();
export function getRuleIndex(rules: Record<string, Rule>): Map<string, string> {
  let i = ruleIndexCache.get(rules);
  if (!i) {
    i = buildRuleIndex(rules);
    ruleIndexCache.set(rules, i);
  }
  return i;
}

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

/** Split an option label that names SEVERAL pieces of wargear at once into its parts.
 *
 *  A third of the catalogue's option labels are compounds — "Hand weapons, Additional hand weapon",
 *  "Light armour, Shields", "Demolition Rockets, Infernal Incendiaries, Hand weapons". No rule page
 *  is named after the combination, so resolving the whole string finds nothing and the option's eye
 *  did nothing at all. Each PART does have a page, so the parts are what to offer.
 *
 *  Splits only at the top level: "Hand weapons (Claws, fangs, tusks, teeth)" is one piece of wargear
 *  whose parenthetical happens to contain commas, and cutting there would leave four fragments that
 *  resolve to nothing. Returns a single-element array for an ordinary label, so callers can treat
 *  every label the same way. */
export function splitCompoundLabel(label: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < label.length; i++) {
    const c = label[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) {
      parts.push(label.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(label.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

// Resolve a wargear/option label (e.g. "Wizard [Level 3 Wizard]", "Shields", "Lances",
// "Standard bearer", "Repeater crossbows") to a rule slug. Tries, in order: an explicit
// alias, resolveRuleSlug, then singular/plural variants of the final word.
export function resolveOptionSlug(label: string, idx: Map<string, string>, faction?: string): string | null {
  const noBracket = label.replace(/\[.*?\]/g, ' ').trim();
  const aliasKey = normalize(noBracket);

  // 1. explicit alias — accept only if that slug actually exists in the rule data
  const alias = OPTION_ALIASES[aliasKey];
  if (alias && knownSlugs(idx).has(alias)) return alias;

  // 2. direct name match (handles parenthetical qualifiers + faction-variant rules via resolveRuleSlug)
  const direct = resolveRuleSlug(noBracket, idx, faction);
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

  // 5. LEIDENDE WOORDEN LATEN VALLEN. De catalogus benoemt wargear specifieker dan het rulebook:
  //    het rulebook heeft "Bolt Throwers" (p.223, met beide profielen erop), de catalogus zegt
  //    "Repeater bolt thrower" en vond daardoor niets — de Reaper Bolt Thrower liet zijn eigen
  //    wapen als dode tekst zien (Joost, 17-08). Hetzelfde patroon zit onder een creature z'n
  //    natuurwapens: "Scaly skin (Heavy armour)" IS heavy armour, "Claws and fangs (Hand weapons)"
  //    zijn hand weapons, en dat is precies de pagina die je wil lezen.
  //
  //    Dit staat als LAATSTE stap en accepteert alleen een pagina die bestaat, dus het kan nooit
  //    een goed antwoord overrulen — het vult alleen een gat. Gemeten over de hele catalogus lost
  //    het 13 van de 61 onopgeloste wargear-labels op, en alle dertien wijzen naar de juiste
  //    pagina; niets ging naar de verkeerde.
  // EEN BUNDEL BLIJFT EEN BUNDEL. Een label kan meerdere stukken wargear noemen ("Repeater bolt
  // thrower, Hand weapons"), en de aanroeper splitst zo'n bundel zelf in losse chips — maar alleen
  // als het GEHELE label geen pagina vindt. Zonder deze poort loste stap 5 de bundel op naar zijn
  // laatste onderdeel en toonde de popup alleen nog "Hand weapons" in plaats van beide wapens
  // (Joost, 17-08). Dat trof elke unit met gebundelde wargear.
  //
  // Een per-woord-grens volstond niet: de bron schrijft de komma soms als los teken ("Slashing
  // talons , Gnashing maws"), en dan zit hij niet in het weggelaten deel maar vooraan de rest.
  // Overslaan is bovendien geen verlies — na het splitsen heeft elk onderdeel geen komma meer en
  // krijgt het deze stap alsnog.
  if (noBracket.includes(',')) return null;
  // ...en al helemaal geen ZIN. Deze stap is een terugval voor wargear-NAMEN; laat je hem los op
  // een alinea, dan vindt hij ergens achteraan wel een woord dat toevallig een pagina heeft en
  // wordt een halve regeltekst als chip getoond. Dezelfde prozatest als magicItemRules: een punt
  // gevolgd door witruimte. Plus een woordgrens — de langste echte naam die deze stap oplost is
  // "Lashing tails and venomous fangs (Hand weapons)", zeven woorden.
  if (/\.\s/.test(noBracket) || words.length > 8) return null;
  for (let start = 1; start < words.length; start++) {
    const rest = words.slice(start).join(' ');
    if (rest.length < 3) break;
    // Via resolveRuleSlug, niet via een kale index-lookup: die functie pelt de haakjes eraf en doet
    // zelf enkelvoud/meervoud. Zonder dat bleef "(Hand weapons)" op de sluithaak steken — de
    // meervoud-s stond niet aan het eind van de string, dus werd hij nooit weggehaald.
    const raak = resolveRuleSlug(rest, idx, faction);
    if (raak) return raak;
  }
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

export interface ArmourSave {
  /** Required save roll for the general case (close combat, front arc), e.g. 3 means 3+. */
  save: number;
  /** Human-readable breakdown of the general save, e.g. ["Heavy armour (5+)", "Shield (+1)"]. */
  parts: string[];
  /** True when the 2+ maximum clipped a better computed value. */
  capped?: boolean;
  /** Situational saves that differ from the general one, e.g. {save:4, when:"vs non-magical shooting"}. */
  conditional?: { save: number; when: string }[];
  /** Caveats the player should know (Parry, magic armour we can't value, …). */
  notes?: string[];
}

// Tokens that contain the word "shield" but are NOT a physical (+1) shield: formations,
// spells and ward-granting magic items. Used so we don't mis-count them as a shield.
const NON_PHYSICAL_SHIELD = /shieldwall|arcane shield|shield of (the lady|saphery)|oaken shield|ancestral shield/i;
// Clearly two-handed melee weapons: a model wielding one cannot also use a shield in close
// combat (the shield still counts against shooting → handled as a conditional save).
const TWO_HANDED_WEAPON = /great weapon|greatsword|great axe|great hammer|halberd|two[\s-]?hand|requires two hands/i;

const clampSave = (n: number) => Math.max(2, Math.min(7, n));

// Work out a unit's Armour Save from its wargear and special rules, grounded in the verbatim TOW
// rules ("Determining Armour Value" / "Maximum Armour Value"). The base value is a value GIVEN in
// the profile (monsters/chariots export a bare "4+"/"5+" wargear line — these win), else worn
// armour (Light 6+, Heavy 5+, Full plate 4+), else 7+ (no armour). It is improved by a shield (+1),
// barding (+1), Armoured Hide (X) (+X) and an ironfist/buckler (+1); capped at 2+.
//
// Some improvements are CONDITIONAL and are returned as separate saves with their condition:
//   • Sea Dragon / Lion Cloak — +1 only against non-magical shooting.
//   • Tower shield — +3 only within the front arc; no cover to flank/rear.
//   • A shield used with a two-handed weapon — counts vs shooting but not in close combat.
// Magic/named armours (Gromril, Dragon, Chaos, … — ward saves / re-rolls in TOW, NOT armour value)
// are never given a number; an unrecognised worn "… armour" item is surfaced as a note. Parry is
// noted (its +1 has its own 3+ cap that depends on the chosen weapon).
export function unitArmourSave(unit: ArmyUnit): ArmourSave | null {
  let base: number | null = null;
  let baseName = '';
  const notes: string[] = [];
  const setBase = (v: number, name: string) => {
    if (base == null || v < base) {
      base = v;
      baseName = name;
    }
  };

  let shield = false;        // physical (+1) shield
  let towerShield = false;   // +3 front arc only
  let barding = false;
  let ironfist = false;      // ironfist / buckler — a flat +1
  let has2H = false;         // two-handed weapon in the wargear
  let handWeapon = false;    // an explicit hand weapon — Parry needs one by name
  let armouredHide = 0;      // Armoured Hide (X) → +X
  let seaCloak = false;      // Sea Dragon / Lion Cloak — +1 vs non-magical shooting
  let parry = false;
  let unvalued: string | null = null; // a worn "… armour" we can't put a number to

  const isStdArmour = (o: string) => /plate armou?r|full plate|heavy armou?r|light armou?r/.test(o);

  for (const raw of unit.options) {
    const o = ` ${raw.toLowerCase()} `;
    const fixed = raw.trim().match(/^(\d)\+$/); // a given profile armour value, e.g. "4+"
    if (fixed) { setBase(parseInt(fixed[1], 10), `Armour value ${fixed[1]}+ (profile)`); continue; }
    if (/plate armou?r|full plate/.test(o)) setBase(4, 'Full plate armour (4+)');
    else if (/heavy armou?r/.test(o)) setBase(5, 'Heavy armour (5+)');
    else if (/light armou?r/.test(o)) setBase(6, 'Light armour (6+)');

    if (/tower shield/.test(o)) towerShield = true;
    else if (/\bshields?\b/.test(o) && !NON_PHYSICAL_SHIELD.test(raw)) shield = true;
    if (/barding|caparison/.test(o)) barding = true;
    if (/ironfist|buckler/.test(o)) ironfist = true;
    if (TWO_HANDED_WEAPON.test(o)) has2H = true;
    // "Hand weapons" alleen, niet "additional hand weapon" — twee handwapens is een andere keuze en
    // die sluit het schild uit. Ook niet meetellen als het onderdeel van een bundel is die met een
    // ander wapen eindigt; daar beslist has2H.
    if (/\bhand weapons?\b/.test(o) && !/additional hand weapon|two hand weapons/.test(o)) handWeapon = true;
    // A worn "… armour" we don't recognise (Dragon, Gromril, Chaos, …): surface, don't guess.
    if (!isStdArmour(o) && /armou?r/.test(o) && !/armoured hide/.test(o) && !/ironfist/.test(o)) {
      unvalued = raw.trim();
    }
  }

  for (const raw of unit.specialRules) {
    const m = raw.match(/armoured hide\s*\(\s*(\d+)\s*\)/i);
    if (m) armouredHide += parseInt(m[1], 10);
    if (/sea dragon cloak|lion cloak/i.test(raw)) seaCloak = true;
    if (/\bparry\b/i.test(raw)) parry = true;
  }

  // PARRY KOMT VAN HET TROOP TYPE, niet van de datasheet. Van de 1377 units noemen er precies twee
  // "Parry" in hun special rules (beide Wood Elf, en dat is een andere regel); de rulebook-tekst
  // hangt onder `troop-types-in-detail` en wordt daar genoemd door Regular Infantry en Heavy
  // Infantry — niet door Monstrous Infantry of Swarms, die eigen sub-categorieen zijn. Alleen in
  // specialRules zoeken zou de regel bij 263 units laten liggen en precies nul keer afgaan.
  const tt = String(unit.troopType ?? '').trim();
  if (/^(RI|HI)$/i.test(tt) || /^(regular|heavy) infantry$/i.test(tt)) parry = true;

  const hasAnything = base != null || shield || towerShield || barding || ironfist || armouredHide > 0 || seaCloak;
  if (!hasAnything && !unvalued) return null;

  const baseVal = base ?? 7;
  if (base == null) baseName = 'No armour (7+)';

  // Improvements that apply in every situation.
  let always = 0;
  const parts: string[] = [baseName];
  if (barding) { always += 1; parts.push('Barding (+1)'); }
  if (armouredHide > 0) { always += armouredHide; parts.push(`Armoured Hide (+${armouredHide})`); }
  if (ironfist) { always += 1; parts.push('Ironfist/buckler (+1)'); }

  const shieldInCombat = shield && !has2H ? 1 : 0; // a regular shield is dropped if using a 2H weapon
  const towerFront = towerShield ? 3 : 0;

  // General save: close combat, front arc, no special condition.
  const rawGeneral = baseVal - (always + shieldInCombat + towerFront);
  const save = clampSave(rawGeneral);
  if (shield && !towerShield) parts.push(has2H ? 'Shield (+1, shooting only — 2H weapon)' : 'Shield (+1)');
  if (towerShield) parts.push('Tower shield (+3, front arc)');

  const conditional: { save: number; when: string }[] = [];
  const addCond = (val: number, when: string) => {
    if (val !== save && !conditional.some((c) => c.when === when)) conditional.push({ save: val, when });
  };

  // Against shooting: a shield always counts (even with a 2H weapon) and the cloak adds +1.
  if (seaCloak || (shield && has2H)) {
    const shootDelta = always + (shield ? 1 : 0) + towerFront + (seaCloak ? 1 : 0);
    addCond(clampSave(baseVal - shootDelta), seaCloak ? 'vs non-magical shooting' : 'vs shooting');
  }
  // A tower shield gives no protection to the flank or rear.
  if (towerShield) {
    addCond(clampSave(baseVal - (always + shieldInCombat)), 'to the flank or rear (no tower-shield cover)');
  }

  // PARRY — "Whilst engaged in close combat, a model with this rule that is equipped with and chooses
  // to use a hand weapon and shield improves its armour value by 1, to a maximum of 3+" (rulebook
  // p.190). De algemene save in deze functie IS de close-combat-save, dus daar hoort de +1 in
  // (Joost, 17-08). Drie grenzen komen letterlijk uit de regel en zijn geen interpretatie:
  //   · alleen met een handwapen én schild — een tweehandig wapen laat het schild vallen (has2H),
  //   · het maximum van 3+ , dus vanaf 3+ levert Parry niets meer op,
  //   · en de bonus mag nooit VERSLECHTEREN: een unit die al op 2+ zit houdt 2+.
  // Buiten close combat verandert er niets; de conditionele schiet-save wordt los berekend.
  const parryTelt = parry && handWeapon && shield && !has2H;
  const naParry = parryTelt ? Math.min(save, Math.max(3, save - 1)) : save;
  if (parryTelt) {
    parts.push(naParry < save ? 'Parry (+1, close combat, max 3+)' : 'Parry (geen effect — al op 3+ of beter)');
    // Buiten close combat geldt de bonus niet. Alleen melden als hij daadwerkelijk iets deed,
    // anders zijn het twee identieke getallen naast elkaar.
    if (naParry < save) addCond(save, 'vs shooting (Parry telt alleen in close combat)');
  } else if (parry) {
    notes.push('Parry: +1 armour in close combat with a hand weapon & shield (max 3+)');
  }
  if (unvalued) notes.push(`${unvalued} not auto-valued — check its rule`);

  return {
    save: naParry,
    parts,
    capped: rawGeneral < 2,
    conditional: conditional.length ? conditional : undefined,
    notes: notes.length ? notes : undefined,
  };
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

/**
 * Resolve a lore slug from the ARMY CATALOGUE against the LORE DATA (25-08-2026).
 *
 * The two sources disagree on the prefix: the catalogue writes `troll-magic`, `primal-magic` and
 * `shadowlands`, while rules.json calls those `lore-of-troll-magic`, `lore-of-primal-magic` and
 * `lore-of-the-shadowlands`. Every wizard picker filters its options with `lores[slug]`, so those
 * three lores silently vanished from the list -- Tim could not pick the Lore of Troll Magic that his
 * Troll Horde shamans are entitled to (Troll Tongue).
 *
 * Returns the key as it exists in the lore data, or null if it genuinely is not there.
 */
export function loreSlug(slug: string, lores: Record<string, Lore>): string | null {
  if (!slug) return null;
  for (const kandidaat of [slug, `lore-of-${slug}`, `lore-of-the-${slug}`]) {
    if (lores[kandidaat]) return kandidaat;
  }
  return null;
}

/** De toegestane lores van een unit, opgelost tegen de lore-data en zonder dubbelingen. */
export function allowedLores(unit: { lores?: string[] }, lores: Record<string, Lore>): string[] {
  const uit: string[] = [];
  for (const s of unit.lores ?? []) {
    const k = loreSlug(s, lores);
    if (k && !uit.includes(k)) uit.push(k);
  }
  return uit;
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
