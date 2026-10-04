import { useEffect, useState } from 'react';
import type { StatRow } from './builderToArmy';

// The statline index (public/owb/rules-index.json), fetched once per session and shared. Used by the
// builder (UnitOptions) and by the game's UnitCard, which repairs an army snapshot without profiles.
export type StatIndex = Record<string, { stats?: StatRow[]; troopType?: string }>;

const BASE = import.meta.env.BASE_URL;
let statIndexCache: StatIndex | null = null;

export function useStatIndex(): StatIndex | null {
  const [idx, setIdx] = useState<StatIndex | null>(statIndexCache);
  useEffect(() => {
    if (statIndexCache) { setIdx(statIndexCache); return; }
    let cancelled = false;
    fetch(`${BASE}owb/rules-index.json`)
      .then((r) => r.json())
      .then((j: StatIndex) => { statIndexCache = j; if (!cancelled) setIdx(j); })
      .catch(() => { /* no statline is a display gap, never an error state */ });
    return () => { cancelled = true; };
  }, []);
  return idx;
}
