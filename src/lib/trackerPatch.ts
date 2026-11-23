/**
 * DE TRACKER IN STUKJES SCHRIJVEN (Act 4, blok E, 24-11-2026).
 *
 * Aan een 2-tegen-2-tafel zitten vier telefoons op dezelfde `tow_games`-rij. De rest van de app schrijft
 * de tracker als geheel (`setTracker({ ...tracker, units: { ... } })`); met twee spelers ging dat net
 * goed, met vier verliest de een de tik van de ander (laatste schrijver wint). Daarom rekent de
 * tafel-modus het VERSCHIL uit tussen de oude en de nieuwe tracker en stuurt alleen de gewijzigde paden
 * naar `tow_game_tracker_patch` (server, één transactie). De rest van GameView hoeft niets te weten.
 *
 * Hoe diep: objecten worden sleutel voor sleutel vergeleken tot vier niveaus, behalve de paden in
 * ATOMAIR (één unit-stand, de tempometer, de sheet): die gaan als één waarde.
 *
 * Puur, geen React: scripts/tests/tafel.test.cjs test het los.
 */

export interface TrackerPatch {
  /** Pad in de tracker, bv. ['units', 'host2:u3'] of ['bonus', 'guest', 'scenario', 'ks-plaza-turn']. */
  p: string[];
  /** Nieuwe waarde (bij zetten). */
  v?: unknown;
  /** Weghalen. */
  weg?: true;
  /** Optellen op de server (atomair), geklemd tussen min en max. */
  plus?: number;
  min?: number;
  max?: number;
}

const MAX_DIEPTE = 4;
/** Paden (prefix) die als één waarde gaan. */
const ATOMAIR: string[][] = [['units', '*'], ['tempo'], ['sheet'], ['weer'], ['report'], ['spelers', '*']];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const gelijk = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function isAtomair(pad: string[]): boolean {
  return ATOMAIR.some((a) => a.length === pad.length && a.every((x, i) => x === '*' || x === pad[i]));
}

/** De patches die van `oud` naar `nieuw` leiden. Leeg als er niets veranderde. */
export function trackerDiff(oud: unknown, nieuw: unknown, pad: string[] = []): TrackerPatch[] {
  if (gelijk(oud, nieuw)) return [];
  if (pad.length > 0 && (pad.length >= MAX_DIEPTE || isAtomair(pad) || !isObj(oud) || !isObj(nieuw))) {
    return nieuw === undefined ? [{ p: pad, weg: true }] : [{ p: pad, v: nieuw }];
  }
  const a = isObj(oud) ? oud : {};
  const b = isObj(nieuw) ? nieuw : {};
  const uit: TrackerPatch[] = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(k in b) || b[k] === undefined) {
      if (k in a && a[k] !== undefined) uit.push({ p: [...pad, k], weg: true });
      continue;
    }
    uit.push(...trackerDiff(a[k], b[k], [...pad, k]));
  }
  return uit;
}

/** Zet een waarde op een pad, met ontbrekende tussenobjecten. Immutable. */
function zetPad(doc: Record<string, unknown>, pad: string[], waarde: unknown, weg: boolean): Record<string, unknown> {
  const [k, ...rest] = pad;
  const uit: Record<string, unknown> = { ...doc };
  if (!rest.length) {
    if (weg) delete uit[k];
    else uit[k] = waarde;
    return uit;
  }
  const kind = isObj(doc[k]) ? (doc[k] as Record<string, unknown>) : {};
  if (weg && !isObj(doc[k])) return uit;
  uit[k] = zetPad(kind, rest, waarde, weg);
  return uit;
}

function leesPad(doc: unknown, pad: string[]): unknown {
  let v: unknown = doc;
  for (const k of pad) {
    if (!isObj(v)) return undefined;
    v = v[k];
  }
  return v;
}

/** Dezelfde patches LOKAAL toepassen (optimistisch, en in de tafeltest), met dezelfde regels als de
 *  server-functie. */
export function pasPatchesToe<T>(doc: T, patches: TrackerPatch[]): T {
  let uit = (isObj(doc) ? doc : {}) as Record<string, unknown>;
  for (const p of patches) {
    if (!p.p.length) continue;
    if (typeof p.plus === 'number') {
      const cur = leesPad(uit, p.p);
      let n = (typeof cur === 'number' ? cur : 0) + p.plus;
      if (typeof p.min === 'number') n = Math.max(p.min, n);
      if (typeof p.max === 'number') n = Math.min(p.max, n);
      uit = zetPad(uit, p.p, n, false);
    } else if (p.weg) {
      uit = zetPad(uit, p.p, undefined, true);
    } else {
      uit = zetPad(uit, p.p, p.v === undefined ? null : p.v, false);
    }
  }
  return uit as T;
}
