// Army-builder REDESIGN — presentational primitives (foundation only; no screen consumes these yet).
//
// Five pure presentational components + the spec's size constants. Every measurement below is the
// spec's value at a logical viewport of 390pt (px = pt 1:1). Colours come exclusively from the
// existing token set in `src/design/tow.ts` — the legacy token NAMES are misleading, so for the
// record, in the Ivory skin:
//   TOW.gold       = Blood        (#9c2b2b) — the accent
//   TOW.goldBright = Blood light  (#bb463e)
//   TOW.goldDeep   = Blood dark   (#7e2020) — section labels, icon glyphs
//   TOW.line       = Rule         rgba(26,23,20,.10)
//   TOW.lineStrong = Border       rgba(26,23,20,.26)
//   TOW.panel      = White · TOW.panel2 = Raised · TOW.bg = Parchment
// No new colour tokens are introduced here (see HAIRLINE/ZEBRA below for the two documented
// exceptions) and nothing is hard-coded that already has a token.
//
// GUTTER CONTRACT — these primitives carry NO horizontal padding. The spec's `gutter: 14` is a
// screen-level value: the consuming screen wraps a section in a 14px-inset container so the section
// header's label, every row's text and the stat strip all share one left edge. Adding the gutter
// inside the primitives too would double it. Vertical rhythm, however, IS owned by the primitives
// (a row is exactly `rowH`/`compactH` tall, hairline included).

import { useCallback, useEffect, useRef } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';

/** Maat-constanten uit de spec. Eén plek, zodat telefoon en desktop niet uiteenlopen. */
export const BUILDER = {
  gutter: 14,          // links/rechts overal
  rowH: 44,            // UnitRow (2 regels, 7px verticale padding)
  compactH: 30,        // CompactRow (1 regel)
  headerH: 74,         // roster-header
  footerH: 63,         // incl. 16px safe-area
  radius: { frame: 28, button: 9, chip: 8, pill: 99, check: 4 },
  control: { stepper: 30, back: 34, chip: 26, primary: 38 },
} as const;

// These were hardcoded Ivory values at first, which meant they silently ignored the Slate-Night theme
// switch (a near-black hairline is invisible on slate). They are now real tokens with their own dark
// counterparts — see `--tow-hairline` / `--tow-zebra` in src/index.css. Kept as named exports here so
// the ~20 call sites across the builder screens did not have to change.
/** Spec **Hairline** — the row separator; lighter than TOW.line (the spec's Rule). */
export const HAIRLINE = TOW.hairline;
/** Spec **Zebra** — alternating row tint for dense tables. */
export const ZEBRA = TOW.zebra;

const eb = engraved as React.CSSProperties; // Cinzel 600 · uppercase · letterSpacing .22em

/** Thousands separator: a THIN SPACE (U+2009), not a comma.
 *  The spec writes points as "1 998" and "of 2 000" throughout, so this is the app-wide separator for
 *  every points figure in the builder. */
const THIN_SPACE = ' ';

/**
 * THE canonical points formatter for the whole redesign — exported so every builder screen prints a
 * number the same way. Three different formatters existed across the screens at one point (commas
 * here, thin spaces in the roster chrome, bare digits in the picker), which reads as three different
 * apps. Import this one; do not write another.
 * Non-finite input degrades to 0 rather than rendering "NaN" into someone's army list.
 */
export const fmt = (n: number): string =>
  (Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('en-US').replace(/,/g, THIN_SPACE);

// ─────────────────────────── shared row typography ───────────────────────────
// UnitRow and CompactRow share one type scale so a compact list never drifts from a roster list.
const ROW_NAME: React.CSSProperties = {
  fontFamily: towFont.serif, fontWeight: 400, fontSize: 14.5, lineHeight: 1.25, color: TOW.ink,
  // Never wrap: one line, ellipsised. `minWidth: 0` is what actually lets a flex child shrink far
  // enough for text-overflow to kick in.
  flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
// The fixed-width bits of the name line (the count prefix, the ✦ glyph): the same type scale as the
// name, but they never shrink and never ellipsise, so they survive however long the name is.
const ROW_FIXED: React.CSSProperties = {
  fontFamily: towFont.serif, fontSize: 14.5, lineHeight: 1.25, flex: '0 0 auto',
};
const ROW_WHISPER: React.CSSProperties = {
  fontFamily: towFont.serif, fontWeight: 400, fontSize: 11, lineHeight: 1.3, color: TOW.faint,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const ROW_POINTS: React.CSSProperties = {
  fontFamily: towFont.serif, fontWeight: 400, fontSize: 12.5, color: TOW.muted,
  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0,
};
// A 3px inset rail rather than a border: a real border would change the row's box and break the
// exact 44px / 30px rhythm the moment a row is selected.
const SELECTED_RAIL = `inset 3px 0 0 ${TOW.gold}`;

// Reset for a row rendered as a <button> so it is indistinguishable from the <div> variant.
const BUTTON_RESET: React.CSSProperties = {
  border: 'none', margin: 0, textAlign: 'left', font: 'inherit', color: 'inherit',
  WebkitTapHighlightColor: 'transparent',
};

// ─────────────────────────── long press ───────────────────────────
const LONG_PRESS_MS = 500;

/** Bare-bones long press: a pointerdown timer that aborts on pointerup/-cancel/-move/-leave, with
 *  the pending timer cleared on unmount. No library, no gesture state beyond the timer itself. */
function useLongPress(onLongPress?: () => void) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const clear = useCallback(() => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
  }, []);
  // A pending timer must never fire into an unmounted row.
  useEffect(() => clear, [clear]);
  const start = useCallback(() => {
    if (!onLongPress) return;
    fired.current = false;
    clear();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      fired.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  }, [onLongPress, clear]);

  const handlers: React.HTMLAttributes<HTMLElement> = onLongPress
    ? { onPointerDown: start, onPointerUp: clear, onPointerCancel: clear, onPointerMove: clear, onPointerLeave: clear }
    : {};
  /** True (once) when the gesture that just ended was a long press, so the row can swallow the click
   *  that follows it — one gesture must never fire both onLongPress and onClick. */
  const consumeLongPress = () => { const f = fired.current; fired.current = false; return f; };
  return { handlers, consumeLongPress };
}

// ─────────────────────────── BudgetBar ───────────────────────────
export interface BudgetSegment { key: 'characters' | 'core' | 'special' | 'rare'; points: number }

// Fixed per-category opacities over the single accent colour — the budget bar reads as one material
// with four depths rather than four competing hues.
const SEGMENT_OPACITY: Record<BudgetSegment['key'], number> = {
  characters: 1, core: 0.68, special: 0.42, rare: 0.24,
};

/**
 * The points budget as one thin bar: four stacked category segments plus, when the list is over the
 * cap, a hatched overage tail.
 *
 * Scaling: the bar's denominator is `max(cap, total)`. Inside the cap that is simply `cap`, so a
 * segment's width is its true share of the budget. Once `total > cap` the denominator becomes
 * `total`, the category segments are clipped cumulatively at `cap`, and the remainder is drawn as the
 * hatched tail — so the tail's width IS the overshoot's share and the whole thing still sums to 100%.
 * Never divides by zero: a non-positive/non-finite `cap` is treated as 0, which makes every point
 * spent overage (correct: with no budget, everything is over it).
 */
export function BudgetBar({ segments, cap, total, height = 5 }: {
  segments: BudgetSegment[]; cap: number; total: number; height?: number;
}): React.JSX.Element {
  const safeCap = Number.isFinite(cap) && cap > 0 ? cap : 0;
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const over = Math.max(0, safeTotal - safeCap);
  const denom = Math.max(safeCap, safeTotal, 1); // ← the only guard needed against /0

  const bars: { id: string; pct: number; style: React.CSSProperties }[] = [];
  let used = 0; // points already laid out inside the cap
  for (const s of segments ?? []) {
    const pts = Number.isFinite(s?.points) && s.points > 0 ? s.points : 0;
    const draw = Math.min(pts, Math.max(0, safeCap - used)); // clip cumulatively at the cap
    if (draw <= 0) continue;
    used += draw;
    bars.push({
      id: s.key,
      pct: (draw / denom) * 100,
      style: { background: TOW.gold, opacity: SEGMENT_OPACITY[s.key] ?? 1 },
    });
  }
  if (over > 0) {
    bars.push({
      id: 'overage',
      pct: (over / denom) * 100,
      style: {
        background: `repeating-linear-gradient(45deg, ${TOW.goldDeep}, ${TOW.goldDeep} 2px, ${TOW.goldBright} 2px, ${TOW.goldBright} 4px)`,
      },
    });
  }

  return (
    <div
      style={{
        display: 'flex', gap: 1, width: '100%', height, borderRadius: height / 2,
        background: TOW.line, overflow: 'hidden',
      }}
    >
      {bars.map((b) => (
        <div key={b.id} style={{ ...b.style, width: `${b.pct}%`, flex: '0 0 auto', height: '100%' }} />
      ))}
    </div>
  );
}

// ─────────────────────────── SectionHeader ───────────────────────────
/**
 * A category heading: engraved label · hairline rule · right-aligned meta.
 * `violated` re-colours ONLY the meta (to the accent, prefixed with ▲); the label and the rule are
 * deliberately untouched so a breached section still reads as the same section.
 */
export function SectionHeader({ label, meta, violated, dense }: {
  label: string; meta?: string; violated?: boolean;
  /** Tighter vertical rhythm (9/3 instead of 14/5). For a screen that stacks MANY groups — the unit
   *  option editor has up to eight, where the spec's roster spacing eats the screen and only about six
   *  option rows survive above the fold. The roster keeps the airier default: it has four sections. */
  dense?: boolean;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: dense ? '9px 0 3px' : '14px 0 5px' }}>
      <span style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: TOW.line }} />
      {meta ? (
        <span
          style={{
            fontFamily: towFont.serif, fontWeight: 400, fontSize: 10.5,
            color: violated ? TOW.gold : TOW.faint,
            fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          {violated ? '▲ ' : ''}{meta}
        </span>
      ) : null}
    </div>
  );
}

// ─────────────────────────── UnitRow ───────────────────────────
/**
 * The phone roster row: exactly 44px tall (hairline included), two lines, 7px vertical padding.
 *
 * The count prefix and the ✦ magic glyph sit OUTSIDE the ellipsising name span (both `flexShrink: 0`)
 * so a very long unit name truncates in the middle of the row instead of eating the count or the
 * glyph — the two bits of information you most need when scanning a roster.
 */
export function UnitRow({
  count, name, bijnaam, whisper, points, magic, selected, issues, onClick, onLongPress,
}: {
  count?: number; name: string;
  /** De naam die de speler deze unit gaf (campagne). Staat op de WHISPER-regel en niet op de
   *  naamregel: de rij is precies 44px met twee regels, en de naamregel moet zeggen WAT dit is —
   *  het datasheet herken je zo altijd, ook als twee regimenten dezelfde eigennaam-stijl hebben. */
  bijnaam?: string;
  whisper?: string; points: number;
  magic?: boolean; selected?: boolean; issues?: string[];
  onClick?: () => void; onLongPress?: () => void;
}): React.JSX.Element {
  const { handlers, consumeLongPress } = useLongPress(onLongPress);

  // SPEC SLIP, resolved deliberately. Spec 1a pins the count prefix to Blood ("Count prefix in
  // #9c2b2b 600") and the validation section pins the out-of-size state to the SAME colour ("count
  // prefix turns #9c2b2b") — so colour alone cannot distinguish them and the flag would render as a
  // no-op. A silent no-op is worse than either reading: a screen would set `issues` and the
  // violation would simply never show. So the marker is taken from the spec's OWN violation
  // vocabulary in the same document — "the meta turns #9c2b2b and gains a ▲ prefix" (section header,
  // 1a) — and applied here as a ▲ before the count. Colour stays exactly as specified; only the
  // marker is an extrapolation, and it is a one-line revert if the intent was a muted normal count.
  const countColour = TOW.gold;

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    // `height` + border-box means the hairline lives INSIDE the 44px, so a stack of rows keeps an
    // exact 44px rhythm. The two line-boxes (18.1 + 14.3 = 32.4px) are taller than the 29px content
    // box, so they bleed ~1.7px into each 7px padding — glyph ink stays well clear of the edges.
    height: BUILDER.rowH, boxSizing: 'border-box', padding: '7px 0', width: '100%', overflow: 'hidden',
    background: selected ? TOW.panel : 'transparent',
    borderBottom: `1px solid ${HAIRLINE}`,
    boxShadow: selected ? SELECTED_RAIL : 'none',
    cursor: onClick ? 'pointer' : 'default',
    userSelect: onLongPress ? 'none' : undefined,
  };

  const body = (
    <>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
          {count != null ? (
            <span style={{ ...ROW_FIXED, fontWeight: 600, color: countColour }}>
              {issues && issues.length ? '▲ ' : ''}{count}×&nbsp;
            </span>
          ) : null}
          <span style={ROW_NAME}>{name}</span>
          {magic ? (
            <span style={{ ...ROW_FIXED, color: TOW.gold, paddingLeft: 4 }}>✦</span>
          ) : null}
        </span>
        {/* A problem REPLACES the loadout whisper rather than being added under it: the row is a fixed
            44px and a third line would break that rhythm for every row in the list. The loadout is
            still one tap away in the unit editor, and "over the 25% cap" is the more urgent of the two.
            A `title` would be the desktop answer, but this row is built for a phone, where there is no
            hover to reveal one. */}
        {issues && issues.length ? (
          <span style={{ ...ROW_WHISPER, color: TOW.gold }}>{issues[0]}</span>
        ) : bijnaam || whisper ? (
          <span style={ROW_WHISPER}>
            {bijnaam ? <span style={{ color: TOW.muted, fontStyle: 'italic' }}>{bijnaam}</span> : null}
            {bijnaam && whisper ? ' · ' : ''}
            {whisper}
          </span>
        ) : null}
      </span>
      <span style={ROW_POINTS}>{fmt(points)}</span>
    </>
  );

  if (!onClick) return <div style={rowStyle} {...handlers}>{body}</div>;
  return (
    <button
      type="button"
      style={{ ...BUTTON_RESET, ...rowStyle }}
      {...handlers}
      onClick={() => { if (!consumeLongPress()) onClick(); }}
    >
      {body}
    </button>
  );
}

// ─────────────────────────── CompactRow ───────────────────────────
/**
 * The one-line, 30px sibling of UnitRow — the desktop muster table and the catalogue list.
 * Same type scale, no whisper. `trailing` replaces the points cell entirely so a caller can put a
 * stepper, a chip or a category tag there instead; `muted` dims the name for a non-actionable row.
 */
export function CompactRow({ count, name, points, trailing, muted, selected, onClick }: {
  count?: number; name: string; points?: number; trailing?: React.ReactNode;
  muted?: boolean; selected?: boolean; onClick?: () => void;
}): React.JSX.Element {
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    height: BUILDER.compactH, boxSizing: 'border-box', width: '100%', overflow: 'hidden',
    background: selected ? TOW.panel : 'transparent',
    borderBottom: `1px solid ${HAIRLINE}`,
    boxShadow: selected ? SELECTED_RAIL : 'none',
    cursor: onClick ? 'pointer' : 'default',
  };

  const body = (
    <>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline' }}>
        {count != null ? (
          <span style={{ ...ROW_FIXED, fontWeight: 600, color: TOW.gold }}>{count}×&nbsp;</span>
        ) : null}
        <span style={{ ...ROW_NAME, color: muted ? TOW.muted : TOW.ink }}>{name}</span>
      </span>
      {trailing != null
        ? <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{trailing}</span>
        : points != null ? <span style={ROW_POINTS}>{fmt(points)}</span> : null}
    </>
  );

  if (!onClick) return <div style={rowStyle}>{body}</div>;
  return <button type="button" style={{ ...BUTTON_RESET, ...rowStyle }} onClick={onClick}>{body}</button>;
}

// ─────────────────────────── StatStrip ───────────────────────────
/**
 * The characteristic strip. Cells are equal-width (`flex: 1`); the optional Save cell gets a little
 * more room (`flex: 1.1`) and a Border-weight divider on its left, because it is a different KIND of
 * value than the profile characteristics. Works with any number of stats — the spec shows
 * M WS BS S T W I A Ld + Sv, but that count is never assumed.
 */
export function StatStrip({ stats, save }: {
  stats: { label: string; value: string; modified?: boolean; title?: string }[]; save?: string;
}): React.JSX.Element {
  const cells = Array.isArray(stats) ? stats : [];
  const cell = (label: string, value: string, key: string, isSave: boolean, modified = false, title?: string): React.JSX.Element => (
    <div
      key={key}
      title={title}
      style={{
        flex: isSave ? 1.1 : 1, minWidth: 0, textAlign: 'center',
        // Only divide when something actually precedes the Save cell.
        borderLeft: isSave && cells.length > 0 ? `1px solid ${TOW.lineStrong}` : undefined,
        background: modified ? 'rgba(184,134,47,0.10)' : 'transparent',
      }}
    >
      <div style={{ ...eb, fontSize: 7.5, color: TOW.goldDeep }}>{label}</div>
      <div style={{ fontFamily: towFont.serif, fontSize: 12, fontWeight: modified ? 700 : 400, color: modified ? TOW.goldDeep : TOW.ink }}>{value}</div>
    </div>
  );
  return (
    <div style={{ display: 'flex', width: '100%', alignItems: 'stretch' }}>
      {cells.map((s, i) => cell(s.label, s.value, `${s.label}-${i}`, false, !!s.modified, s.title))}
      {save != null ? cell('Sv', save, 'save', true) : null}
    </div>
  );
}
