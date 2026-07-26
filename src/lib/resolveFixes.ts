// Army-builder REDESIGN — the "Resolve" solver behind the warning band's Resolve link.
//
// The spec asks for "a sheet listing the cheapest edits that clear every violation, each with its
// point saving". This produces exactly that list. It is the one piece of the redesign that is genuine
// NEW logic rather than new presentation, so the reasoning is spelled out below.
//
// WHAT THIS IS NOT: it is not a global optimiser. It does not search combinations of edits for a
// provably minimal repair — that is a knapsack problem, it would be slow, and its answer ("delete
// these three specific things") is not what a player wants from an army-list tool anyway. Instead it
// enumerates every SINGLE edit that is individually available, prices each one honestly, and ranks
// them so the smallest edit that actually clears the problem comes first. The player composes the
// repair; the tool does the arithmetic.
//
// Points always come from `entryPoints()` — the same function the rest of the app totals with — by
// pricing a hypothetical edited entry and diffing. Nothing here re-derives a points rule.

import { entryPoints, unitCategoryFor, type BuilderList, type Category, type ListEntry, type MagicItemsData, type OwbUnit } from './owbBuilder';
import type { DerivedList } from './builderDerived';
import type { ResolveFix, SavedListLike } from '../components/builder/types';

/** Replace one entry in a list, preserving every other field on both list and entry. Never
 *  regenerates a uid (that is the campaign veteran key) and never drops unknown fields, which the
 *  cross-device sync would otherwise erase. */
const withEntry = (l: SavedListLike, uid: string, next: ListEntry): Partial<SavedListLike> => ({
  entries: l.entries.map((e) => (e.uid === uid ? next : e)),
});

/** The display name of an entry — the campaign custom name wins, as everywhere else in the app. */
const entryName = (unit: OwbUnit, entry: ListEntry): string => (entry.customName ?? '').trim() || unit.name_en;

/**
 * Every single edit that would reduce this list's points, priced and ranked.
 *
 * @param list      the open list
 * @param army      its catalogue
 * @param derived   the current `deriveList()` result — the violations to be cleared
 * @param itemsData magic-item data; when absent, magic-item strip fixes are omitted (never guessed)
 */
export function resolveFixes(
  list: SavedListLike | (BuilderList & { id?: string }),
  army: { [k in Category]?: OwbUnit[] },
  derived: DerivedList,
  itemsData?: MagicItemsData,
): ResolveFix[] {
  const getUnit = (cat: Category, id: string) => army?.[cat]?.find((u) => u.id === id);
  const fixes: ResolveFix[] = [];

  // WHAT CAN A REDUCTION ACTUALLY FIX? Only two things: the points cap, and a category maximum. It
  // cannot fix a Core MINIMUM — that floor is a share of the cap, not of the total, so deleting units
  // leaves the floor untouched and only widens the shortfall. Offering "Delete Repeater Crossbowmen"
  // to someone whose sole problem is too little Core is worse than offering nothing: it is confidently
  // pointing the wrong way. So reduce-fixes are emitted ONLY where they can help, and a category
  // maximum only admits fixes for units IN THAT CATEGORY.
  const overCap = derived.violations.find((v) => v.kind === 'over-cap')?.delta ?? 0;
  const catOver = new Map<Category, number>();
  for (const v of derived.violations) {
    if (v.kind === 'category-max' && v.category) catOver.set(v.category, v.delta ?? 0);
  }
  const reducible = overCap > 0 || catOver.size > 0;
  /** entry-uid → its effective category, so the ranking below can ask which overflow a fix addresses. */
  const uidCategory = new Map<string, Category>();

  for (const entry of list?.entries ?? []) {
    const unit = getUnit(entry.cat, entry.unitId);
    if (!unit) continue; // stale entry — validate() ignores it too, so it cannot be part of a repair
    if (!reducible) continue; // nothing a reduction can repair — see the note above
    // The unit's EFFECTIVE category, because that is the one the limits are tallied against.
    const effCat = unitCategoryFor(unit, list.composition, entry.cat);
    // Over the cap → every unit is fair game. Otherwise only the offending categories are.
    if (overCap <= 0 && !catOver.has(effCat)) continue;
    uidCategory.set(entry.uid, effCat);
    const now = entryPoints(unit, entry, itemsData);
    const name = entryName(unit, entry);

    // ── 1. Drop models down to the unit's minimum size ────────────────────────────────────────────
    // Only for units that are above their own minimum; going below is itself a violation, so a "fix"
    // that creates one is not offered.
    const min = unit.minimum ?? 1;
    if (entry.count > min) {
      const shrunk: ListEntry = { ...entry, count: min };
      const saving = now - entryPoints(unit, shrunk, itemsData);
      if (saving > 0) {
        const dropped = entry.count - min;
        fixes.push({
          kind: 'reduce',
          label: `Drop ${dropped} model${dropped === 1 ? '' : 's'} from ${name} (to its minimum of ${min})`,
          saving,
          uid: entry.uid,
          apply: (l) => withEntry(l, entry.uid, { ...entry, count: min }),
        });
      }
    }

    // ── 2. Strip this unit's magic items ─────────────────────────────────────────────────────────
    // Magic items are pure additions, so removing them is the least destructive real saving there is:
    // the unit itself survives intact. Requires itemsData to price — without it we stay silent rather
    // than quote a number we cannot stand behind.
    if (itemsData) {
      const magicKeys = entry.opts.filter((k) => k.startsWith('magic/'));
      if (magicKeys.length > 0) {
        const stripped: ListEntry = { ...entry, opts: entry.opts.filter((k) => !k.startsWith('magic/')) };
        const saving = now - entryPoints(unit, stripped, itemsData);
        if (saving > 0) {
          fixes.push({
            kind: 'reduce',
            label: `Remove ${magicKeys.length === 1 ? 'the magic item' : `all ${magicKeys.length} magic items`} from ${name}`,
            saving,
            uid: entry.uid,
            apply: (l) => withEntry(l, entry.uid, stripped),
          });
        }
      }
    }

    // ── 3. Strip this unit's paid upgrades (command, equipment, sub-options) ──────────────────────
    // Everything that is not a magic item and not the free implicit default. Priced by diffing an
    // entry with only its magic keys left, so the two upgrade fixes never double-count.
    const upgradeKeys = entry.opts.filter((k) => !k.startsWith('magic/'));
    if (upgradeKeys.length > 0) {
      const bare: ListEntry = { ...entry, opts: entry.opts.filter((k) => k.startsWith('magic/')) };
      const saving = now - entryPoints(unit, bare, itemsData);
      if (saving > 0) {
        fixes.push({
          kind: 'reduce',
          label: `Remove the paid upgrades from ${name}`,
          saving,
          uid: entry.uid,
          apply: (l) => withEntry(l, entry.uid, bare),
        });
      }
    }

    // ── 4. Delete the unit ───────────────────────────────────────────────────────────────────────
    // The biggest saving per entry, and always last in the ranking for an equal amount because it is
    // the most destructive. Not offered when it is the list's only unit.
    if (now > 0 && (list?.entries?.length ?? 0) > 1) {
      fixes.push({
        kind: 'reduce',
        label: `Delete ${name}`,
        saving: now,
        uid: entry.uid,
        apply: (l) => ({ entries: l.entries.filter((e) => e.uid !== entry.uid) }),
      });
    }
  }

  // ── Ranking ──────────────────────────────────────────────────────────────────────────────────
  // "Cheapest edit that clears the problem": fixes that are individually SUFFICIENT come first,
  // smallest-sufficient first (the least damage that finishes the job); then the insufficient ones,
  // largest first (the biggest step towards it).
  //
  // "Sufficient" is measured against whatever this fix could actually clear — the cap overshoot when
  // there is one, otherwise the overflow of the category the fix's unit sits in. Without the second
  // case a pure category breach ranked purely largest-first, i.e. most-destructive-first, directly
  // contradicting the sheet's own "cheapest edits first" heading.
  const target = (f: ResolveFix) => {
    if (overCap > 0) return overCap;
    const cat = f.uid ? uidCategory.get(f.uid) : undefined;
    return (cat && catOver.get(cat)) || 0;
  };
  const sufficient = (f: ResolveFix) => {
    const t = target(f);
    return t > 0 && f.saving >= t;
  };
  fixes.sort((a, b) => {
    const sa = sufficient(a), sb = sufficient(b);
    if (sa !== sb) return sa ? -1 : 1;
    return sa ? a.saving - b.saving : b.saving - a.saving;
  });

  // ── The Core minimum ─────────────────────────────────────────────────────────────────────────
  // Appended last, and deliberately NOT applicable: clearing it needs points ADDED, and only the
  // player can decide which Core units those are. Auto-"fixing" it would mean inventing units into
  // someone's army list. Reported with the exact shortfall so the next step is obvious.
  const coreShort = derived.violations.find((v) => v.kind === 'core-min')?.delta ?? 0;
  if (coreShort > 0) {
    fixes.push({
      kind: 'add-core',
      label: `Add ${coreShort} more points of Core units to meet the minimum`,
      saving: coreShort,
    });
  }

  return fixes;
}
