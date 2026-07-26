// Army-agnostic helpers for the multi-army builder. The catalogue ships 18 armies under
// public/owb/; this module turns OWB's slug ids into the display names the UI shows.

// Words kept lower-case inside a title (unless they're the first word).
const SMALL_WORDS = new Set(['of', 'and', 'the']);

/** "royal-clan" → "Royal Clan", "wolves-of-the-sea" → "Wolves of the Sea". */
export function titleCase(slug: string): string {
  return (slug || '')
    .split('-')
    .filter(Boolean)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** The composition's display name within an army:
 *  - the comp whose id equals the army id is the army's own "Grand Army";
 *  - any "*-renegade-v2" comp is "Renegade V2" — the community Renegade Legacy Pack, which is a
 *    DIFFERENT thing from the older Renegade Crowns list and must not read as it;
 *  - "renegade-crowns" and any "*-renegade" comp are "Renegade Crowns";
 *  - everything else is its title-cased slug (e.g. "royal-clan" → "Royal Clan").
 *  (e.g. dark-elves→"Grand Army", de-renegade→"Renegade Crowns", ok-renegade-v2→"Renegade V2".)
 *  Order matters: the v2 test comes first, or the title-cased fallback would print "Ok Renegade V2". */
export function compName(comp: string, army: string): string {
  if (comp === army) return 'Grand Army';
  if (comp.endsWith('-renegade-v2')) return 'Renegade V2';
  if (comp === 'renegade-crowns' || comp.endsWith('-renegade')) return 'Renegade Crowns';
  return titleCase(comp);
}
