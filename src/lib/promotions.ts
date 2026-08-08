// Character promotion — a character grows into the heavier version of itself (Sorceress → Supreme
// Sorceress, Orc Bigboss → Orc Warboss).
//
// This is an OFFICIAL Old World campaign rule ("Promotion or Death", AJ: The Razing of Westerland
// p. 25 — https://tow.whfb.app/campaign-battles/promotion-or-death), which gives the Bigboss →
// Warboss example but deliberately never publishes a table of which character may become which.
// `PROMOTION_PATHS` below IS that table, hand-curated for this catalogue.
//
// THE ONE TECHNICAL RULE THAT MATTERS: a promotion keeps the entry's `uid`.
// `campaignUnitId()` (owbBuilder.ts) hangs the campaign's XP, veteran abilities, battle scars AND the
// per-unit growth ceiling on that uid. Removing the light entry and adding the heavy one is therefore
// not "the same thing done manually": it starts a brand-new unit, losing the history and resetting the
// growth ceiling — which is exactly the loophole the ceiling exists to close. So `planPromotion`
// rewrites the entry IN PLACE, and nothing here ever mints a uid.
//
// SOURCE OF THE TABLE: docs/research/character_upgradepaden.md in the campaign repo (Isle of Celedon),
// §3. That document grades every pair `zeker` / `waarschijnlijk` / `twijfel`; the first two are here
// as 'certain' / 'likely'. The `twijfel` pairs are deliberately ABSENT — they are the ones where the
// archetype does not actually continue (Skink Priest → Slann Mage-Priest is a different species,
// Warlock Engineer → Grey Seer a different clan, Engineer → Engineer Sapper a sidegrade, Runelord →
// Anvil of Doom a war machine, Mage → Dragon Mage a variant, Vampire Thrall → Strigoi Ghoul King a
// different bloodline, Strategist → Lord Magistrate a guess on points alone).
//
// Named/unique characters are out of scope by construction (none appear below) and are rejected again
// at runtime by `promotionTargets`.

import {
  entryPoints, groupItems, magicCategories, magicItemId, selectedMagicItems,
  type ListEntry, type MagicItemsData, type OwbOption, type OwbUnit,
} from './owbBuilder';

export type PromotionConfidence = 'certain' | 'likely';

/** One curated path, by catalogue unit `id` within one army file. */
export interface PromotionPath {
  from: string;
  to: string;
  confidence: PromotionConfidence;
}

/** Army slugs the app uses that differ from the catalogue file name. The campaign calls the Border
 *  Princes list `realms-of-men` (tow.whfb.app does too); the OWB catalogue file is
 *  `renegade-crowns.json`. */
const SLUG_ALIAS: Record<string, string> = { 'realms-of-men': 'renegade-crowns' };

/** Per army slug: which character may grow into which. Ids are the catalogue's own `id` fields. */
export const PROMOTION_PATHS: Record<string, PromotionPath[]> = {
  'beastmen-brayherds': [
    { from: 'wargor', to: 'beastlord', confidence: 'certain' },
    { from: 'bray-shaman', to: 'great-bray-shaman', confidence: 'certain' },
    { from: 'gorebull', to: 'doombull', confidence: 'certain' },
  ],
  'chaos-dwarfs': [
    { from: 'daemonsmith-sorcerer', to: 'sorcerer-prophet', confidence: 'certain' },
    { from: 'infernal-seneschal', to: 'infernal-castellan', confidence: 'certain' },
    { from: 'black-orc-bigboss', to: 'black-orc-warboss', confidence: 'certain' },
  ],
  // Herald → Greater Daemon of the same alignment. Thematically the canonical promotion, but a +220
  // to +275 point jump, so `likely` rather than `certain`.
  'daemons-of-chaos': [
    { from: 'daemonic-herald-of-khorne', to: 'bloodthirster', confidence: 'likely' },
    { from: 'daemonic-herald-of-nurgle', to: 'great-unclean-one', confidence: 'likely' },
    { from: 'daemonic-herald-of-slaanesh', to: 'keeper-of-secrets', confidence: 'likely' },
    { from: 'daemonic-herald-of-tzeentch', to: 'lord-of-change', confidence: 'likely' },
  ],
  'dark-elves': [
    { from: 'dark-elf-master', to: 'dark-elf-dreadlord', confidence: 'certain' },
    { from: 'sorceress', to: 'supreme-sorceress', confidence: 'certain' },
  ],
  'dwarfen-mountain-holds': [
    { from: 'thane', to: 'king', confidence: 'certain' },
    { from: 'runesmith', to: 'runelord', confidence: 'certain' },
    // The Slayer oath IS a promotion ladder — but it is a one-way street of its own: a Slayer never
    // returns to Thane or King, so there is no path in or out of this line.
    { from: 'dragon-slayer', to: 'daemon-slayer', confidence: 'certain' },
  ],
  'empire-of-man': [
    { from: 'captain-of-the-empire', to: 'general-of-the-empire', confidence: 'certain' },
    { from: 'master-mage', to: 'wizard-lord', confidence: 'certain' },
    { from: 'chapter-master', to: 'grand-master', confidence: 'certain' },
    { from: 'priest-of-sigmar', to: 'lector-of-sigmar', confidence: 'certain' },
    { from: 'priest-of-ulric', to: 'high-priest-of-ulric', confidence: 'certain' },
  ],
  // Note `shugengan` is the LIGHT entry despite being named "Shugengan General".
  'grand-cathay': [
    { from: 'shugengan', to: 'shugengan-lord', confidence: 'certain' },
    { from: 'astromancer', to: 'supreme-astromancer', confidence: 'certain' },
    { from: 'gate-keeper', to: 'gate-master', confidence: 'certain' },
  ],
  'high-elf-realms': [
    { from: 'noble', to: 'prince', confidence: 'certain' },
    { from: 'mage', to: 'archmage', confidence: 'certain' },
  ],
  // The only three-rung ladder in the game; the Paladin → Duke jump is the transitive close of it,
  // offered so a character that skipped a phase is not stuck one rung down forever.
  'kingdom-of-bretonnia': [
    { from: 'paladin', to: 'baron', confidence: 'certain' },
    { from: 'baron', to: 'duke', confidence: 'certain' },
    { from: 'paladin', to: 'duke', confidence: 'certain' },
    { from: 'damsel', to: 'prophetess', confidence: 'certain' },
  ],
  'lizardmen': [
    { from: 'saurus-scar-veteran', to: 'saurus-oldblood', confidence: 'certain' },
  ],
  'ogre-kingdoms': [
    { from: 'bruiser', to: 'tyrant', confidence: 'certain' },
    { from: 'butcher', to: 'slaughtermaster', confidence: 'certain' },
  ],
  // The cleanest army in the game for this: seven unambiguous pairs. Crossings between peoples
  // (Goblin Bigboss → Orc Warboss, Night Goblin → Goblin) are NOT paths.
  'orc-and-goblin-tribes': [
    { from: 'black-orc-bigboss', to: 'black-orc-warboss', confidence: 'certain' },
    { from: 'orc-bigboss', to: 'orc-warboss', confidence: 'certain' },
    { from: 'orc-weirdboy', to: 'orc-weirdnob', confidence: 'certain' },
    { from: 'goblin-bigboss', to: 'goblin-warboss', confidence: 'certain' },
    { from: 'goblin-oddgit', to: 'goblin-oddnob', confidence: 'certain' },
    { from: 'night-goblin-bigboss', to: 'night-goblin-warboss', confidence: 'certain' },
    { from: 'night-goblin-oddgit', to: 'night-goblin-oddnob', confidence: 'certain' },
  ],
  'renegade-crowns': [
    { from: 'renegade-captain', to: 'renegade-prince', confidence: 'certain' },
  ],
  'skaven': [
    { from: 'skaven-chieftain', to: 'skaven-warlord', confidence: 'certain' },
  ],
  'tomb-kings-of-khemri': [
    { from: 'tomb-prince', to: 'tomb-king', confidence: 'certain' },
    { from: 'mortuary-priest', to: 'high-priest', confidence: 'certain' },
    { from: 'necrotect', to: 'arch-necrotect', confidence: 'certain' },
  ],
  'vampire-counts': [
    { from: 'vampire-thrall', to: 'vampire-count', confidence: 'certain' },
    { from: 'necromantic-acolyte', to: 'master-necromancer', confidence: 'certain' },
    { from: 'wight-lord', to: 'wight-king', confidence: 'certain' },
  ],
  'warriors-of-chaos': [
    { from: 'aspiring-champion', to: 'exalted-champion', confidence: 'certain' },
    { from: 'exalted-champion', to: 'chaos-lord', confidence: 'certain' },
    { from: 'aspiring-champion', to: 'chaos-lord', confidence: 'certain' },
    { from: 'exalted-sorcerer', to: 'sorcerer-lord', confidence: 'certain' },
    // "0-1 Chaos Lord or Daemon Prince" — the same slot, so the swap is rules-clean, but the profile
    // and troop type change wholesale for +20 points.
    { from: 'chaos-lord', to: 'daemon-prince', confidence: 'likely' },
  ],
  'wood-elf-realms': [
    { from: 'glade-captain', to: 'glade-lord', confidence: 'certain' },
    { from: 'spellsinger', to: 'spellweaver', confidence: 'certain' },
    // The lore line holds (dryad spirit → treeman) but the troop type jumps from infantry to monster.
    { from: 'branchwraith', to: 'treeman-ancient', confidence: 'likely' },
  ],
};

/** The curated paths for an army slug (empty for an army with none, and for an unknown slug). */
export function promotionPathsFor(armySlug: string): PromotionPath[] {
  const slug = SLUG_ALIAS[armySlug] ?? armySlug;
  return PROMOTION_PATHS[slug] ?? [];
}

/** One promotion a specific entry may actually take, with the target already resolved. */
export interface PromotionTarget {
  path: PromotionPath;
  unit: OwbUnit;
}

/**
 * Which promotions this entry may take, resolved against the catalogue.
 *
 * Returns nothing for a unit outside `characters`, for a named/unique character on either end, and
 * for a target the catalogue does not have (an army file can be older than this table — a missing
 * entry must silently offer no promotion, never throw).
 */
export function promotionTargets(armySlug: string, unit: OwbUnit, characters: OwbUnit[]): PromotionTarget[] {
  if (unit.named === true) return [];
  const out: PromotionTarget[] = [];
  for (const path of promotionPathsFor(armySlug)) {
    if (path.from !== unit.id) continue;
    const to = characters.find((u) => u.id === path.to);
    if (!to || to.named === true || to.id === unit.id) continue;
    out.push({ path, unit: to });
  }
  return out;
}

// ── The re-map ──────────────────────────────────────────────────────────────────────────────────
// `entry.opts` stores INDEXES ("mounts/2", "subopt/options/0/1"), and an index means nothing in
// another entry: the Sorceress' "Dark Pegasus" is mounts/3, the Supreme Sorceress' is mounts/3 today
// and could be mounts/4 after the next catalogue sync. So everything is re-keyed BY NAME, and an
// option the heavier entry does not have is dropped and reported rather than silently re-pointed at
// whatever now sits at that index.

/** Compare two catalogue labels: `{faction}` tags and the `*` multi-takeable marker are bookkeeping. */
const normLabel = (s: string): string =>
  (s || '').replace(/\{[^}]*\}/g, ' ').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

const OPT_GROUPS = ['command', 'equipment', 'armor', 'options', 'mounts'] as const;
type OptGroup = (typeof OPT_GROUPS)[number];
const isOptGroup = (s: string): s is OptGroup => (OPT_GROUPS as readonly string[]).includes(s);

/** The nested children of an option, in the order `subopt/…` keys index them (mirrors
 *  `subOptionGroups`, which filters the same way before indexing). */
const childItems = (parent?: OwbOption): OwbOption[] =>
  (Array.isArray(parent?.options) ? parent!.options! : []).filter((o) => o && o.name_en);

const indexByName = (list: OwbOption[], name: string): number => {
  const want = normLabel(name);
  return list.findIndex((o) => !o.hidden && normLabel(o.name_en) === want);
};

/** Everything a promotion would do, computed BEFORE anything is written. */
export interface PromotionPlan {
  /** The rewritten entry — same `uid`, same `cat`, same position, same custom name. */
  entry: ListEntry;
  /** Human-readable labels of what does NOT carry over ("these options do not carry over: …"). */
  dropped: string[];
  pointsBefore: number;
  pointsAfter: number;
  /** False when `itemsData` had not loaded yet, so magic items were carried over untouched rather
   *  than checked against the new entry. Never prune `opts` in that window — see `BuilderFlow`'s
   *  header note; a "tidy up unknown keys" pass there deletes every magic item on the list. */
  magicChecked: boolean;
}

/**
 * Plan the promotion of `entry` from `from` to `to`. Pure: nothing is written, nothing is mutated.
 *
 * What carries over: the uid, the stored category, the model count, the player's own name for the
 * character, every option/sub-option/magic item the heavier entry also has, and any chosen lore it
 * still allows. What does not: options the target lacks (reported), lores it does not have
 * (reported), and the chosen spells — a promotion changes the wizard level, so the spells are picked
 * again, exactly as the rulebook's promotion does.
 */
export function planPromotion(
  from: OwbUnit,
  to: OwbUnit,
  entry: ListEntry,
  itemsData?: MagicItemsData,
  armyItemLists?: string[],
): PromotionPlan {
  const dropped: string[] = [];
  const opts: string[] = [];
  /** old opts key → new opts key, so `optCounts` can follow along. */
  const rekeyed = new Map<string, string>();
  const magicKeys: string[] = [];

  for (const key of entry.opts) {
    const parts = key.split('/');

    // Magic items are resolved by ITEM ID, not by index, so they need no re-keying — only a check
    // that the heavier entry still has a section that can hold them. Collected here, decided below.
    if (parts[0] === 'magic') { magicKeys.push(key); continue; }

    // subopt/<group>/<parent>/<child>, plus the legacy mounts-only `mountopt/<parent>/<child>`.
    const nested = parts[0] === 'subopt' && parts.length === 4
      ? { group: parts[1], p: Number(parts[2]), c: Number(parts[3]) }
      : parts[0] === 'mountopt' && parts.length === 3
        ? { group: 'mounts', p: Number(parts[1]), c: Number(parts[2]) }
        : null;
    if (nested) {
      if (!isOptGroup(nested.group)) { opts.push(key); continue; }
      const oldParent = groupItems(from, nested.group)[nested.p];
      const oldChild = childItems(oldParent)[nested.c];
      if (!oldParent || !oldChild) continue; // already stale on the light entry — nothing to carry
      const newParents = groupItems(to, nested.group);
      const pi = indexByName(newParents, oldParent.name_en);
      const ci = pi >= 0 ? indexByName(childItems(newParents[pi]), oldChild.name_en) : -1;
      if (pi >= 0 && ci >= 0) {
        const next = `subopt/${nested.group}/${pi}/${ci}`;
        opts.push(next);
        rekeyed.set(key, next);
      } else {
        // The wizard-level case lives here: a Sorceress' "Level 2 Wizard" has no counterpart on a
        // Supreme Sorceress, whose own free default is already Level 3. Reported, never re-pointed.
        dropped.push(oldChild.name_en);
      }
      continue;
    }

    // <group>/<index>
    if (parts.length === 2 && isOptGroup(parts[0])) {
      const group = parts[0];
      const oldOpt = groupItems(from, group)[Number(parts[1])];
      if (!oldOpt) continue; // stale key on the light entry
      const i = indexByName(groupItems(to, group), oldOpt.name_en);
      if (i >= 0) {
        const next = `${group}/${i}`;
        opts.push(next);
        rekeyed.set(key, next);
      } else {
        dropped.push(oldOpt.name_en);
      }
      continue;
    }

    // Anything else is a key shape this function does not know. Carried through untouched: the engine
    // ignores keys it cannot resolve, so keeping it is harmless, while dropping it would silently
    // delete data written by a newer version of the app.
    opts.push(key);
  }

  // Lores the heavier entry no longer offers (none in today's catalogue — every pair shares its lore
  // set — but a future Arcane Journal could break that, and losing a lore silently would be worse).
  const keptLores = (entry.lores ?? []).filter((l) => !Array.isArray(to.lores) || to.lores.includes(l));
  for (const l of entry.lores ?? []) if (!keptLores.includes(l)) dropped.push(`Lore: ${l}`);
  if ((entry.spells ?? []).length > 0) dropped.push('Chosen spells (a promoted wizard picks again)');

  // Magic items. With no `itemsData` we CANNOT tell whether the target keeps a section — and the one
  // thing that must not happen is deleting someone's items on a guess, so they ride along untouched.
  const magicChecked = !!itemsData;
  if (!itemsData) {
    opts.push(...magicKeys);
  } else {
    const before = new Map(
      selectedMagicItems(from, entry, itemsData, armyItemLists).map(({ item, key }) => [key, item.name_en]),
    );
    const probe: ListEntry = { ...entry, opts, lores: keptLores, spells: undefined };
    const cats = magicCategories(to, armyItemLists ?? Object.keys(itemsData), itemsData, probe);
    for (const key of magicKeys) {
      const itemId = key.split('/')[2];
      // Same resolution `selectedMagicItems` uses: the named category first, else any category of the
      // new entry that holds the item — so an item that merely moved section still carries over.
      if (cats.some((c) => c.items.some((it) => magicItemId(it) === itemId))) { opts.push(key); continue; }
      // Only REPORT a loss the player could see. A key the light entry could not resolve either is
      // junk from an older catalogue; announcing "you lose sacrificial-dagger" for an item that was
      // never on the sheet would be a lie, so it goes the same silent way a stale option key does.
      const was = before.get(key);
      if (was) dropped.push(was);
    }
  }

  const optCounts = entry.optCounts
    ? Object.fromEntries(
      Object.entries(entry.optCounts)
        .filter(([k]) => rekeyed.has(k))
        .map(([k, n]) => [rekeyed.get(k)!, n]),
    )
    : undefined;

  const next: ListEntry = {
    ...entry,
    // uid, cat and customName come from the spread ON PURPOSE — the uid especially: it is the
    // campaign's veteran key, and this is a promotion, not a new character.
    unitId: to.id,
    // A character is a single model; a target with a different minimum still gets a legal count.
    count: Math.max(to.minimum ?? 1, Math.min(entry.count, (to.maximum ?? 0) > 0 ? to.maximum! : entry.count)),
    opts,
    ...(optCounts && Object.keys(optCounts).length ? { optCounts } : {}),
    ...(keptLores.length ? { lores: keptLores } : {}),
  };
  // `spells` is dropped rather than left undefined-in-place, so the wizard screen asks again.
  delete (next as { spells?: string[] }).spells;

  return {
    entry: next,
    dropped: [...new Set(dropped)],
    pointsBefore: entryPoints(from, entry, itemsData),
    pointsAfter: entryPoints(to, next, itemsData),
    magicChecked,
  };
}
