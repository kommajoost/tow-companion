// Laadt public/unit-details.json één keer (scripts/sync-unit-details.mjs). Ontbreekt het bestand, dan
// blijft alles werken zoals vóór 22-11-2026 (null = geen gegevens per model), net als mount-details.
import { useEffect, useState } from 'react';
import type { UnitDetails, UnitDetailsFile } from './unitDetails';

const BASE = import.meta.env.BASE_URL;
let cache: UnitDetails | null = null;
let belofte: Promise<UnitDetails | null> | null = null;

export function laadUnitDetails(): Promise<UnitDetails | null> {
  if (!belofte) {
    belofte = fetch(`${BASE}unit-details.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((f: UnitDetailsFile | null) => { cache = f?.units ?? null; return cache; })
      .catch(() => null);
  }
  return belofte;
}

/** The per-model equipment of every known unit, or null while loading / when the file is missing. */
export function useUnitDetails(): UnitDetails | null {
  const [d, setD] = useState<UnitDetails | null>(cache);
  useEffect(() => {
    if (cache) return;
    let weg = false;
    laadUnitDetails().then((x) => { if (!weg) setD(x); });
    return () => { weg = true; };
  }, []);
  return d;
}
