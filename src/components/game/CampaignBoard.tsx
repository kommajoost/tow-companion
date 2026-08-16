import { useId, useMemo } from 'react';
import { TOW, towFont } from '../../design/tow';

/**
 * READ-ONLY deployment map for a CAMPAIGN battle (16-08-2026).
 *
 * Draws nothing it has not been handed. The campaign app works the deployment out itself and writes
 * the finished thing into the BattleSheet (`layout` / `secLayout`, in table inches); this component
 * is a renderer for exactly that. It deliberately does NOT import `deploymentFor`/`secondaryLayout`
 * from `src/lib/battle.ts`: that module is an older fork of the campaign's scenario catalogue — it
 * does not know the three Battle March maps nor the attacker/defender setups — so re-deriving a
 * layout here would quietly draw a DIFFERENT battle than the one the campaign set up.
 *
 * Two registers on purpose (Joost, 16-08-2026):
 *   • zones, dimension lines and objectives are drawn CRISP — those are rules. Where you may deploy,
 *     how deep your zone is and where the objectives sit is not a matter of taste.
 *   • terrain is NOT drawn at all (16-08-2026, Joost). It used to sit here muted, but scattered
 *     woods and hills landed on top of the objective markers, and the plan then claims something it
 *     does not decide. WHAT goes on the table is the list below the board; WHERE it goes you settle
 *     at the table by the official rules (tow.whfb.app/battlefield-terrain).
 *   • (old note) terrain was drawn MUTED (low opacity, dashed outline) with a caption saying so — at the table
 *     you put the pieces down by eye, and those inches are not a rule.
 *
 * Styling follows `BattleBoard` (the planning tool) so both boards read as the same object, but the
 * two share no code or state: this one is static, has no drag/selection, and is fed by the wire.
 */

export interface CampaignZone {
  x: number; y: number; w: number; h: number;
  label: string;
  kind: 'main' | 'flank';
  /** Free-form polygon (diagonal/corner deployments); wins from x/y/w/h when present. */
  poly?: [number, number][];
}

export interface CampaignLayout {
  zones: CampaignZone[];
  objective?: { x: number; y: number };
  impassable?: { x: number; y: number; w: number; h: number }[];
  hill?: { x: number; y: number; w: number; h: number };
  keepoutCircle?: { x: number; y: number; r: number };
}

export interface CampaignSecLayout {
  quarters: boolean;
  specialFeature?: { x: number; y: number };
  objectives: { x: number; y: number; n: number }[];
  baggage: { x: number; y: number; w: number; h: number }[];
}

export interface CampaignTerrainPiece {
  id?: string | null;
  type: string;
  x: number; y: number; w: number; h: number;
  difficult?: boolean;
  dangerous?: boolean;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ── De sheet lezen ───────────────────────────────────────────────────────────────────────────────
// Het BattleSheet is jsonb van een ANDERE app: elk veld wordt gecontroleerd, nooit aangenomen. Deze
// parsers staan hier en niet in het paneel omdat ze samen mét de tekenaar hét contract zijn — wie de
// vorm verandert, verandert allebei. Ze zijn puur, zodat ze los te testen zijn.

const sStr = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const sRec = (v: unknown): Record<string, unknown> | null =>
  (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** {x,y,w,h} met echte getallen en een positief formaat, anders null. */
function parseBox(v: unknown): { x: number; y: number; w: number; h: number } | null {
  const o = sRec(v);
  if (!o) return null;
  const x = num(o.x), y = num(o.y), w = num(o.w), h = num(o.h);
  return x != null && y != null && w != null && w > 0 && h != null && h > 0 ? { x, y, w, h } : null;
}

function parsePoint(v: unknown): { x: number; y: number } | null {
  const o = sRec(v);
  if (!o) return null;
  const x = num(o.x), y = num(o.y);
  return x != null && y != null ? { x, y } : null;
}

/** Eén deployment-zone. Een `poly` van ≥3 punten wint van het rechthoek-formaat (diagonale/hoek-
 *  opstellingen); zonder allebei is de zone onbruikbaar en valt hij weg in plaats van op 0,0 te landen. */
function parseZone(v: unknown): CampaignZone | null {
  const o = sRec(v);
  if (!o) return null;
  const label = sStr(o.label) ?? '';
  const kind: 'main' | 'flank' = o.kind === 'flank' ? 'flank' : 'main';
  const poly = (Array.isArray(o.poly) ? o.poly : [])
    .map((p) => {
      if (!Array.isArray(p)) return null;
      const x = num(p[0]), y = num(p[1]);
      return x != null && y != null ? ([x, y] as [number, number]) : null;
    })
    .filter((p): p is [number, number] => !!p);
  if (poly.length >= 3) return { x: 0, y: 0, w: 0, h: 0, label, kind, poly };
  const box = parseBox(o);
  return box ? { ...box, label, kind } : null;
}

/** De hele opstelling uit `sheet.layout`, of null als er geen bruikbare zones in zitten — een kaart
 *  zonder zones is geen kaart, en een leeg raster tekenen zou net zulke schijnprecisie zijn als de
 *  plattegrond die er op 14-08 juist uitging. */
export function parseSheetLayout(v: unknown): CampaignLayout | null {
  const o = sRec(v);
  if (!o) return null;
  const zones = (Array.isArray(o.zones) ? o.zones : []).map(parseZone).filter((z): z is CampaignZone => !!z);
  if (zones.length === 0) return null;
  const kc = sRec(o.keepoutCircle);
  const kcx = kc ? num(kc.x) : null, kcy = kc ? num(kc.y) : null, kcr = kc ? num(kc.r) : null;
  return {
    zones,
    objective: parsePoint(o.objective) ?? undefined,
    impassable: (Array.isArray(o.impassable) ? o.impassable : []).map(parseBox).filter((b): b is NonNullable<typeof b> => !!b),
    hill: parseBox(o.hill) ?? undefined,
    keepoutCircle: kcx != null && kcy != null && kcr != null && kcr > 0 ? { x: kcx, y: kcy, r: kcr } : undefined,
  };
}

/** De secondary-objective-overlay uit `sheet.secLayout`. Null als er niets op tafel komt te liggen. */
export function parseSheetSecLayout(v: unknown): CampaignSecLayout | null {
  const o = sRec(v);
  if (!o) return null;
  const objectives = (Array.isArray(o.objectives) ? o.objectives : [])
    .map((raw) => {
      const p = parsePoint(raw);
      const n = num(sRec(raw)?.n);
      return p ? { ...p, n: n ?? 0 } : null;
    })
    .filter((p): p is { x: number; y: number; n: number } => !!p);
  const baggage = (Array.isArray(o.baggage) ? o.baggage : []).map(parseBox).filter((b): b is NonNullable<typeof b> => !!b);
  const specialFeature = parsePoint(o.specialFeature) ?? undefined;
  const quarters = o.quarters === true;
  if (!quarters && !specialFeature && objectives.length === 0 && baggage.length === 0) return null;
  return { quarters, specialFeature, objectives, baggage };
}

/** Middelpunt van een zone op de diepte-as — werkt voor rechthoeken én polygonen. */
export const zoneCy = (z: CampaignZone): number =>
  z.poly && z.poly.length ? z.poly.reduce((s, p) => s + p[1], 0) / z.poly.length : z.y + z.h / 2;

/**
 * Ligt de VERDEDIGER boven op de kaart? De campagne zet de verdediger in zone A en A ligt boven
 * (`verdedigerKant: 'A'`), maar we leiden het liever af uit de zones zelf: de nieuwe attacker/
 * defender-opstellingen labelen hun zones al letterlijk "Defender"/"Attacker". Pas als geen van
 * beide te vinden is, valt dit terug op de afspraak — want een gok die de kanten omdraait is erger
 * dan geen kaart.
 */
export function defenderIsTop(layout: CampaignLayout | null, tableH: number, verdedigerKant?: string | null): boolean {
  const mains = (layout?.zones ?? []).filter((z) => z.kind === 'main');
  const kant = (sStr(verdedigerKant) ?? 'A').toUpperCase();
  const def = mains.find((z) => /defender/i.test(z.label)) ?? mains.find((z) => z.label.trim().toUpperCase() === kant);
  if (def && tableH > 0) return zoneCy(def) < tableH / 2;
  const att = mains.find((z) => /attacker/i.test(z.label));
  if (att && tableH > 0) return zoneCy(att) > tableH / 2;
  return true;
}

/** Rough text width in inches for the board's own display font — good enough to decide whether a
 *  label fits inside its zone. Deliberately pessimistic (0.58em/char) so labels never spill. */
const textWidth = (s: string, fs: number) => s.length * fs * 0.58;

/**
 * Fit a zone label to the space it has. A flank zone is a narrow sliver, and the campaign's own
 * label can be a sentence ("Flank entry, from Turn 2") — too long to sit inside it. Shorten to the
 * generic "Flank entry" rather than clipping mid-word, and drop the label entirely if even that
 * does not fit: an unreadable smear of letters is worse than a clean empty zone.
 */
function fitLabel(label: string, maxW: number, fs: number, flank: boolean): string | null {
  if (!label) return null;
  if (textWidth(label, fs) <= maxW) return label;
  if (flank) {
    const short = 'Flank entry';
    if (textWidth(short, fs) <= maxW) return short;
  }
  return null;
}

/**
 * The two 12″-style dimension lines: how deep each main zone is and how much no-man's-land sits
 * between them. Worked out from the zones THEMSELVES — the campaign has already placed them, so the
 * depths are a measurement, not a re-derivation. Only for the ordinary case of two rectangular main
 * zones stacked top and bottom (which is how the campaign lays every board out); anything else
 * (polygons, corner deployments) returns null and simply gets no dimension lines.
 */
function bandDims(zones: CampaignZone[]): { depthTop: number; depthBottom: number; gapStart: number; gapEnd: number; gap: number; lo: number; hi: number } | null {
  const mains = zones.filter((z) => z.kind === 'main' && !z.poly && z.w > 0 && z.h > 0);
  if (mains.length !== 2) return null;
  const [p, q] = mains;
  const xOverlap = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
  const yOverlap = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
  if (yOverlap > 1 || xOverlap <= 0.5 * Math.min(p.w, q.w)) return null;
  const [top, bot] = p.y <= q.y ? [p, q] : [q, p];
  return {
    depthTop: top.h,
    depthBottom: bot.h,
    gapStart: top.y + top.h,
    gapEnd: bot.y,
    gap: Math.max(0, bot.y - (top.y + top.h)),
    lo: Math.max(top.x, bot.x),
    hi: Math.min(top.x + top.w, bot.x + bot.w),
  };
}

export function CampaignBoard({ layout, secLayout, tableW, tableH, youSide }: {
  layout: CampaignLayout;
  secLayout?: CampaignSecLayout | null;
  tableW: number;
  tableH: number;
  /** Which half of the table the viewer deploys on. Only used for a subtle accent — the labels
   *  around the board carry the actual "you / opponent" reading. */
  youSide?: 'top' | 'bottom';
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const W = num(tableW) && tableW > 0 ? tableW : 0;
  const H = num(tableH) && tableH > 0 ? tableH : 0;

  // 1″ grid with the 12″ / foot lines a touch stronger, exactly as the planning board draws them.
  const grid = useMemo(() => {
    if (!W || !H) return null;
    const lines: React.ReactNode[] = [];
    const stroke = (i: number) => (i % 12 === 0 ? 'rgba(74,55,22,0.28)' : 'rgba(74,55,22,0.11)');
    const width = (i: number) => (i % 12 === 0 ? 0.16 : 0.08);
    for (let x = 0; x <= Math.ceil(W); x++) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={H} stroke={stroke(x)} strokeWidth={width(x)} />);
    for (let y = 0; y <= Math.ceil(H); y++) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={W} y2={y} stroke={stroke(y)} strokeWidth={width(y)} />);
    return lines;
  }, [W, H]);

  if (!W || !H) return null;

  const zones = (layout.zones || []).filter((z) => !!z && (z.poly ? z.poly.length >= 3 : num(z.w) !== null && num(z.h) !== null));
  const dims = bandDims(zones);
  const hatch = `cbhatch-${uid}`;

  /** Is this zone on the viewer's half? Used only for the accent outline. */
  const isMine = (z: CampaignZone): boolean => {
    if (!youSide) return false;
    const cy = z.poly ? z.poly.reduce((s, p) => s + p[1], 0) / z.poly.length : z.y + z.h / 2;
    return youSide === 'top' ? cy < H / 2 : cy > H / 2;
  };


  return (
    <div>
      <svg
        viewBox={`-0.5 -0.5 ${W + 1} ${H + 1}`}
        role="img"
        aria-label={`Deployment map, ${fmt(W)} by ${fmt(H)} inches`}
        style={{ width: '100%', aspectRatio: `${W} / ${H}`, display: 'block', background: '#efe7d4', borderRadius: 10, border: `1px solid ${TOW.lineStrong}` }}
      >
        <defs>
          {/* Cliff hatching for impassable strips — diagonal rule lines, not a flat block, so it
              reads as "you cannot go here" rather than as another terrain feature. */}
          <pattern id={hatch} width={1.4} height={1.4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={1.4} height={1.4} fill="rgba(60,45,30,0.30)" />
            <line x1={0} y1={0} x2={0} y2={1.4} stroke="rgba(40,30,18,0.65)" strokeWidth={0.45} />
          </pattern>
        </defs>

        {/* Deployment zones — a rule, so drawn crisply: a shaded area with a hairline border.
            Gold = main deployment zone, blue = flank/reserve entry. */}
        {zones.map((z, i) => {
          const flank = z.kind === 'flank';
          const fill = flank ? 'rgba(70,110,150,0.20)' : 'rgba(120,92,40,0.20)';
          const edge = flank ? 'rgba(70,110,150,0.55)' : 'rgba(120,92,40,0.55)';
          const txtFill = flank ? 'rgba(70,110,150,0.85)' : 'rgba(120,92,40,0.85)';
          const fs = flank ? 2.2 : 3;
          const mine = isMine(z);
          if (z.poly) {
            const pts = z.poly;
            const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
            const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
            // Widest horizontal run of the polygon's bounding box is the only honest budget here.
            const bw = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
            const label = fitLabel(z.label, Math.max(0, bw - 1), fs, flank);
            return (
              <g key={`z${i}`}>
                <polygon points={pts.map((p) => `${p[0]},${p[1]}`).join(' ')} fill={fill} stroke={edge} strokeWidth={0.16} />
                {mine && <polygon points={pts.map((p) => `${p[0]},${p[1]}`).join(' ')} fill="none" stroke={TOW.goldDeep} strokeWidth={0.28} strokeDasharray="1.6 1.1" />}
                {label && <text x={cx} y={cy + fs / 2} fontSize={fs} textAnchor="middle" fontFamily={towFont.display} fontWeight={700} fill={txtFill}>{label}</text>}
              </g>
            );
          }
          // A flank zone is usually a narrow vertical sliver down a table edge — no horizontal label
          // ever fits in 6″. Turn the text with the zone instead of dropping it.
          const upright = z.h > z.w * 1.5;
          const budget = Math.max(0, (upright ? z.h : z.w) - 2);
          const label = fitLabel(z.label, budget, fs, flank);
          const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
          return (
            <g key={`z${i}`}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} fill={fill} stroke={edge} strokeWidth={0.16} />
              {mine && <rect x={z.x} y={z.y} width={z.w} height={z.h} fill="none" stroke={TOW.goldDeep} strokeWidth={0.28} strokeDasharray="1.6 1.1" />}
              {label && (upright ? (
                <text
                  x={cx} y={cy} transform={`rotate(-90 ${cx} ${cy})`}
                  fontSize={fs} textAnchor="middle" dominantBaseline="central"
                  fontFamily={towFont.display} fontWeight={700} fill={txtFill}
                >
                  {label}
                </text>
              ) : (
                <text
                  x={z.x + Math.min(1.5, z.w / 2)}
                  y={z.y + Math.min(3.6, Math.max(1.6, z.h - 0.8))}
                  fontSize={fs}
                  fontFamily={towFont.display}
                  fontWeight={700}
                  fill={txtFill}
                >
                  {label}
                </text>
              ))}
            </g>
          );
        })}

        {/* Impassable strips (cliffs / walls). Also a rule: nothing crosses these. */}
        {(layout.impassable || []).filter((c) => num(c?.w) !== null && num(c?.h) !== null).map((c, i) => (
          <rect key={`imp${i}`} x={c.x} y={c.y} width={c.w} height={c.h} fill={`url(#${hatch})`} stroke="rgba(40,30,18,0.6)" strokeWidth={0.15} />
        ))}

        {grid}


        {/* Central objective (a rule — full strength). */}
        {layout.objective && num(layout.objective.x) !== null && num(layout.objective.y) !== null && (
          <g>
            <circle cx={layout.objective.x} cy={layout.objective.y} r={3.4} fill="rgba(138,108,48,0.18)" stroke={TOW.goldDeep} strokeWidth={0.3} />
            <text x={layout.objective.x} y={layout.objective.y + 1.7} fontSize={4.4} textAnchor="middle" fill={TOW.goldDeep}>★</text>
          </g>
        )}

        {/* A scenario's own central hill. Not scatter terrain — the scenario puts it there. */}
        {layout.hill && num(layout.hill.w) !== null && num(layout.hill.h) !== null && (
          <g>
            <rect x={layout.hill.x} y={layout.hill.y} width={layout.hill.w} height={layout.hill.h} rx={2} fill="rgba(176,138,79,0.34)" stroke="rgba(120,92,40,0.6)" strokeWidth={0.25} />
            <text x={layout.hill.x + layout.hill.w / 2} y={layout.hill.y + layout.hill.h / 2 + 1.3} fontSize={3.6} textAnchor="middle" fontFamily={towFont.display} fontWeight={700} fill="#5c4326">Hill</text>
          </g>
        )}

        {/* Central no-deploy circle. */}
        {layout.keepoutCircle && num(layout.keepoutCircle.r) !== null && layout.keepoutCircle.r > 0 && (
          <circle cx={layout.keepoutCircle.x} cy={layout.keepoutCircle.y} r={layout.keepoutCircle.r} fill="none" stroke="rgba(60,45,30,0.45)" strokeWidth={0.3} strokeDasharray="1.5 1.2" />
        )}

        {/* Secondary-objective overlay (battle quests that put something ON the table). */}
        {secLayout?.quarters && (
          <g stroke="rgba(120,92,40,0.5)" strokeWidth={0.22} strokeDasharray="2 1.4">
            <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
            <line x1={0} y1={H / 2} x2={W} y2={H / 2} />
          </g>
        )}
        {secLayout?.specialFeature && num(secLayout.specialFeature.x) !== null && (
          <g>
            <rect x={secLayout.specialFeature.x - 2.5} y={secLayout.specialFeature.y - 2.5} width={5} height={5} rx={0.8} fill="rgba(60,45,30,0.55)" />
            <text x={secLayout.specialFeature.x} y={secLayout.specialFeature.y + 1.3} fontSize={3.4} textAnchor="middle" fill="#fff">★</text>
          </g>
        )}
        {(secLayout?.objectives || []).filter((o) => num(o?.x) !== null && num(o?.y) !== null).map((o, i) => (
          <g key={`sobj${i}`}>
            <circle cx={o.x} cy={o.y} r={2.4} fill="rgba(138,108,48,0.20)" stroke={TOW.goldDeep} strokeWidth={0.3} />
            <text x={o.x} y={o.y + 1.1} fontSize={3} textAnchor="middle" fontFamily={towFont.display} fontWeight={700} fill={TOW.goldDeep}>{num(o.n) ?? ''}</text>
          </g>
        ))}
        {(secLayout?.baggage || []).filter((b) => num(b?.w) !== null && num(b?.h) !== null).map((b, i) => (
          <g key={`bag${i}`}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={0.6} fill="rgba(120,92,40,0.5)" stroke="#5c4326" strokeWidth={0.2} />
            {/* two wheels, so a baggage train reads as a cart rather than as a block of terrain */}
            <circle cx={b.x + b.w * 0.25} cy={b.y + b.h} r={0.5} fill="none" stroke="#5c4326" strokeWidth={0.18} />
            <circle cx={b.x + b.w * 0.75} cy={b.y + b.h} r={0.5} fill="none" stroke="#5c4326" strokeWidth={0.18} />
          </g>
        ))}

        {/* Inch dimension lines: each zone's depth and the no-man's-land between them. These are the
            numbers you actually measure out with a tape before the first turn. */}
        {dims && (() => {
          const m = dims;
          const L = 'rgba(60,45,30,0.65)', ink = '#46341a', lw = 0.18, cap = 1.6, fs = 2.7;
          const halo: React.CSSProperties = { paintOrder: 'stroke', stroke: '#efe7d4', strokeWidth: 0.9, strokeLinejoin: 'round' };
          const xr = Math.max(3, Math.min(W - 3, m.hi - 3));
          const seg = (y1: number, y2: number, label: string, key: string) => (
            <g key={key}>
              <line x1={xr} y1={y1} x2={xr} y2={y2} stroke={L} strokeWidth={lw} />
              <line x1={xr - cap / 2} y1={y1} x2={xr + cap / 2} y2={y1} stroke={L} strokeWidth={lw} />
              <line x1={xr - cap / 2} y1={y2} x2={xr + cap / 2} y2={y2} stroke={L} strokeWidth={lw} />
              <text x={xr - cap / 2 - 0.7} y={(y1 + y2) / 2 + fs * 0.35} fontSize={fs} textAnchor="end" fontFamily={towFont.display} fontWeight={700} fill={ink} style={halo}>{label}</text>
            </g>
          );
          return (
            <g style={{ pointerEvents: 'none' }}>
              {seg(0, m.depthTop, `${fmt(m.depthTop)}″`, 'dTop')}
              {m.gap > 0 && seg(m.gapStart, m.gapEnd, `${fmt(m.gap)}″`, 'gap')}
              {seg(H - m.depthBottom, H, `${fmt(m.depthBottom)}″`, 'dBot')}
            </g>
          );
        })()}
      </svg>

    </div>
  );
}
