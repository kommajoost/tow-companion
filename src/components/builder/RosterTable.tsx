// Army-builder REDESIGN — the DESKTOP roster table (the phone's screen 1a, re-laid-out as a grid).
//
// WHAT IT READS  — the pre-built `rows` (assembled by the container), plus exactly two fields of
//                  `ctx`: `ctx.derived.categoryTotals` (the read-only projection from
//                  `src/lib/builderDerived.ts`) and `ctx.list.points` (the points target). Nothing
//                  else. In particular `ctx.itemsData` is NEVER touched, so the "catalogue still
//                  loading" window (`itemsData === undefined`, REBUILD-CONSTRAINTS §"async") is a
//                  non-event here — there is nothing to prune and `entry.opts` cannot be damaged.
// WHAT IT WRITES — nothing. Select / duplicate / remove / reorder are all delegated upward as
//                  callbacks, so `ctx.list.entries` is never mutated, no entry `uid` is ever
//                  regenerated (the campaign veteran key, REBUILD-CONSTRAINTS §2) and `ctx.update`
//                  is not called at all. No back-stack layer is registered (§5): this table owns no
//                  overlay, so it has nothing to pop.
//
// RELATION TO RosterScreen.tsx — same data, same grouping, same vocabulary; only the layout differs.
// The phone row is two lines (name over an options whisper); here that whisper moves sideways into
// its own column and the row collapses to ONE line of 34px. Section grouping is by the EFFECTIVE
// category (`row.category`, never `entry.cat` — see types.ts) in the same fixed order, and
// Mercenaries/Allies are rendered when a composition maps a unit there, for the same reason
// RosterScreen does it: a row without a section would be invisible, hence un-selectable and
// un-deletable.
//
// No statline anywhere (`StatStrip` is deliberately not imported): characteristics belong to the
// inspector, never to a roster row.
//
// GUTTER — like the primitives, this component carries NO horizontal padding of its own. The
// consuming shell insets it, so the table's left edge lines up with everything else in the pane.

import { useCallback, useMemo, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import type { Category } from '../../lib/owbBuilder';
import { fmt, HAIRLINE, SectionHeader, ZEBRA } from './primitives';
import type { BuilderCtx, RosterRow } from './types';

const eb = engraved as React.CSSProperties; // Cinzel 600 · uppercase · letterSpacing .22em

// ─────────────────────────── section order & labels ───────────────────────────
/** The spec's four sections, in their fixed order. */
const SPEC_KEYS: readonly Category[] = ['characters', 'core', 'special', 'rare'];
/** Sections the spec does not mention but `unitCategoryFor` can still produce. Rendered AFTER Rare
 *  rather than dropped — identical reasoning (and identical behaviour) to RosterScreen.tsx. They get
 *  no meta, because `derived.categoryTotals` holds only the four spec categories and this table
 *  computes no totals of its own. */
const EXTRA_KEYS: readonly Category[] = ['mercenaries', 'allies'];
/** The full paint order. Exported shape is intentionally the same as RosterScreen's. */
const SECTION_ORDER: readonly Category[] = [...SPEC_KEYS, ...EXTRA_KEYS];

const SECTION_LABEL: Record<Category, string> = {
  characters: 'Characters', core: 'Core', special: 'Special', rare: 'Rare',
  mercenaries: 'Mercenaries', allies: 'Allies',
};

// ─────────────────────────── grid geometry ───────────────────────────
// The spec's column table, verbatim: Qty 42 · Unit flex 1.05 · Options flex 1.35 · Models 62 (right)
// · Points 58 (right) · Actions 52. A CSS grid rather than six flex rows, because every row and the
// column header then resolve from ONE template string — they cannot drift apart by a pixel.
// `minmax(0, …fr)` (not a bare `…fr`, whose implicit `minmax(auto, …)` floor is the content width) is
// what actually lets the two text columns shrink far enough for `text-overflow: ellipsis` to fire.
const COL_QTY = 42;
const COL_MODELS = 62;
const COL_POINTS = 58;
const COL_ACTIONS = 52;
const COL_GAP = 10; // the phone row's own inter-cell gap, reused so the two layouts feel related
const GRID_COLUMNS =
  `${COL_QTY}px minmax(0, 1.05fr) minmax(0, 1.35fr) ${COL_MODELS}px ${COL_POINTS}px ${COL_ACTIONS}px`;

/** Row height from the spec. Border-box, so the 1px hairline lives INSIDE the 34px and a stack of
 *  rows keeps an exact 34px rhythm. */
const ROW_H = 34;

const GRID: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: GRID_COLUMNS, columnGap: COL_GAP, alignItems: 'center',
  width: '100%', boxSizing: 'border-box',
};

// ─────────────────────────── cell typography ───────────────────────────
// Mirrors primitives.tsx's row scale (name 14.5/1.25, whisper 11, points 12.5 tabular) so a desktop
// row and a phone row read as the same row. Those consts are module-private over there, so the
// values — not the objects — are what is shared; keep the two in step.
const CELL_CLIP: React.CSSProperties = {
  minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
};
const QTY_CELL: React.CSSProperties = {
  ...CELL_CLIP, fontFamily: towFont.serif, fontWeight: 600, fontSize: 13.5, lineHeight: 1.25,
  color: TOW.gold, fontVariantNumeric: 'tabular-nums',
};
const NAME_CELL: React.CSSProperties = {
  ...CELL_CLIP, fontFamily: towFont.serif, fontSize: 14.5, lineHeight: 1.25, color: TOW.ink,
};
const OPTIONS_CELL: React.CSSProperties = {
  ...CELL_CLIP, fontFamily: towFont.serif, fontWeight: 400, fontSize: 11, lineHeight: 1.3,
  color: TOW.faint,
};
const NUM_CELL: React.CSSProperties = {
  ...CELL_CLIP, fontFamily: towFont.serif, fontWeight: 400, fontSize: 12.5, lineHeight: 1.25,
  color: TOW.muted, fontVariantNumeric: 'tabular-nums', textAlign: 'right',
};

/** A 3px inset rail rather than a border — a real border would change the row's box and break the
 *  exact 34px rhythm the moment a row is selected. Same trick, same value as primitives.tsx. */
const SELECTED_RAIL = `inset 3px 0 0 ${TOW.gold}`;

// ─────────────────────────── section meta ───────────────────────────
/**
 * `CategoryTotal.rule` is a PERCENTAGE string ("max 50%" / "min 25%" / "" for an unlimited
 * category), because the phone header prints percentages. The desktop spec prints ABSOLUTE points
 * instead — "460 · max 500", "638 · min 500 ✓" — and `CategoryTotal` does not carry the absolute
 * limit (`validate()` computes it as `CategoryTally.cap` / `.floor`, which `deriveList` consumes but
 * does not forward).
 *
 * So the percentage is converted here. This is NOT a fourth points calculation
 * (REBUILD-CONSTRAINTS §7): no unit, option or magic item is priced anywhere in this file — the
 * category's own `points` come straight from `derived`, and this only turns "25% of the target" into
 * a number. The rounding deliberately mirrors owbBuilder.ts:438/442 exactly — `floor` on a maximum,
 * `ceil` on a minimum — so the printed limit can never disagree with the verdict (`ok`) printed
 * beside it.
 *
 * Returns null when there is no rated limit to print: an unlimited category, or a non-positive
 * points target (with no target there is no percentage base, which is the same reason `deriveList`
 * suppresses the percentage violations there).
 */
function absoluteLimit(rule: string, target: number): { kind: 'max' | 'min'; points: number } | null {
  if (!(target > 0)) return null;
  const m = /^(max|min)\s+(\d+(?:\.\d+)?)%$/.exec((rule ?? '').trim());
  if (!m) return null;
  const pct = Number(m[2]);
  if (!Number.isFinite(pct)) return null;
  return m[1] === 'max'
    ? { kind: 'max', points: Math.floor((pct / 100) * target) }
    : { kind: 'min', points: Math.ceil((pct / 100) * target) };
}

// ─────────────────────────── visible order ───────────────────────────
/**
 * The rows in the order this table PAINTS them: grouped by effective category, sections in
 * `SECTION_ORDER`, rows in their `rows`-array order inside a section.
 *
 * Exported because a Shift-click range is meaningless without it. `onSelect(uid, 'range')` hands the
 * container an anchor and a mode but cannot hand it an ordering, and the container's own `rows` array
 * is in ENTRY order — which is not what the user sees the moment a list holds two categories
 * interleaved. Resolving the range against `rows` would then select rows that are nowhere near the
 * two the user clicked. So the container computes its range over this function's output; the table
 * and the range then agree by construction.
 */
export function rosterTableOrder(rows: RosterRow[]): RosterRow[] {
  const groups = groupRows(rows);
  const out: RosterRow[] = [];
  for (const cat of SECTION_ORDER) {
    const g = groups.get(cat);
    if (g) out.push(...g);
  }
  return out;
}

/** Group by the EFFECTIVE category (`row.category`), never `entry.cat` (types.ts is explicit: a
 *  composition may move a unit, and `entry.cat` stays the stored BASE category). */
function groupRows(rows: RosterRow[]): Map<Category, RosterRow[]> {
  const map = new Map<Category, RosterRow[]>();
  for (const r of rows ?? []) {
    if (!r) continue;
    const bucket = map.get(r.category);
    if (bucket) bucket.push(r);
    else map.set(r.category, [r]);
  }
  return map;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// RosterTable
// ═════════════════════════════════════════════════════════════════════════════════════════════
export function RosterTable(props: {
  ctx: BuilderCtx;
  rows: RosterRow[];
  selectedUids: string[];                 // leeg = niets geselecteerd
  onSelect: (uid: string, mode: 'single' | 'range' | 'toggle') => void;
  onDuplicate: (uid: string) => void;
  onRemove: (uid: string) => void;
  /** Herordenen: verplaats `uid` naar de positie van `beforeUid` binnen dezelfde categorie.
   *  `beforeUid === null` betekent: naar het einde van die categorie. */
  onReorder: (uid: string, beforeUid: string | null) => void;
  highlightUid?: string;
}): React.JSX.Element {
  const {
    ctx, rows, selectedUids, onSelect, onDuplicate, onRemove, onReorder, highlightUid,
  } = props;

  // HOVER IN STATE, NOT IN CSS — and why it is safe.
  // The spec's hover state changes two things and only two: the row's background goes White and the
  // two action glyphs go from `transparent` to visible. Neither is a layout property, and the glyphs
  // are ALWAYS rendered (a transparent colour, never a conditional mount), so the 52px action column
  // reserves its space whether or not anything is hovered — the row cannot shift. Kept as React
  // state rather than a `:hover` rule because this file is inline-style only, and it has the useful
  // side effect that the hovered state is reachable in a server render (so it can be measured).
  // Must stay the FIRST useState in this component: the measurement harness seeds it by hook index.
  const [hoverUid, setHoverUid] = useState<string | null>(null);
  // Drag-reorder state. `drag` carries the dragged row's CATEGORY as well as its uid, because
  // `dataTransfer.getData()` is blocked during `dragover` (only `drop` may read it) — without this
  // the cross-category check could not run until the drop had already been accepted.
  const [drag, setDrag] = useState<{ uid: string; category: Category } | null>(null);
  const [dropAt, setDropAt] = useState<{ uid: string; before: boolean } | null>(null);

  const grouped = useMemo(() => groupRows(rows), [rows]);
  const selected = useMemo(() => new Set(selectedUids ?? []), [selectedUids]);
  const totalFor = useMemo(
    () => new Map((ctx?.derived?.categoryTotals ?? []).map((t) => [t.key, t] as const)),
    [ctx?.derived?.categoryTotals],
  );

  // The points target, read (not computed) from the list — the same field `deriveList` uses as its
  // percentage base, so the printed limits agree with `derived`'s verdicts.
  const target = Number.isFinite(ctx?.list?.points) ? Math.max(0, ctx.list.points) : 0;

  const clearDrag = useCallback(() => { setDrag(null); setDropAt(null); }, []);

  /** Ordinary click → 'single', Shift → 'range', ⌘ (macOS) or Ctrl (Windows/Linux) → 'toggle'.
   *  Shift wins when both are held, matching every file manager. */
  const modeOf = (e: React.MouseEvent): 'single' | 'range' | 'toggle' =>
    e.shiftKey ? 'range' : (e.metaKey || e.ctrlKey) ? 'toggle' : 'single';

  /**
   * Resolve a drop onto `target` into the `onReorder(uid, beforeUid)` contract.
   * `before` is which HALF of the target row the pointer was over (top → insert above it).
   * Dropping on the bottom half means "after the target", which is expressed as "before the target's
   * next sibling IN THIS CATEGORY", or `null` when the target is the last row of its category.
   */
  const dropOnto = (draggedUid: string, targetRow: RosterRow, before: boolean) => {
    const siblings = grouped.get(targetRow.category) ?? [];
    const ti = siblings.findIndex((s) => s.uid === targetRow.uid);
    if (ti < 0) return;
    const beforeUid = before ? targetRow.uid : (siblings[ti + 1]?.uid ?? null);
    // "Move X before X" is a no-op that says nothing; never hand it to the container.
    if (beforeUid === draggedUid) return;
    onReorder(draggedUid, beforeUid);
  };

  const sections = SECTION_ORDER.filter((cat) => (grouped.get(cat)?.length ?? 0) > 0);

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* ═══════════ column header — ONCE, above the whole table ═══════════
          Deliberately NOT repeated per category: the section headings already say where you are, and
          a repeated header in a 34px-row table reads as a second table starting. Cinzel 600 / 7.5px
          / uppercase over a 1px Border-weight rule. */}
      <div
        style={{
          ...GRID, paddingBottom: 5, borderBottom: `1px solid ${TOW.lineStrong}`,
        }}
      >
        <span style={{ ...eb, ...CELL_CLIP, fontSize: 7.5, lineHeight: 1, color: TOW.goldDeep }}>Qty</span>
        <span style={{ ...eb, ...CELL_CLIP, fontSize: 7.5, lineHeight: 1, color: TOW.goldDeep }}>Unit</span>
        <span style={{ ...eb, ...CELL_CLIP, fontSize: 7.5, lineHeight: 1, color: TOW.goldDeep }}>Options</span>
        <span style={{ ...eb, ...CELL_CLIP, fontSize: 7.5, lineHeight: 1, color: TOW.goldDeep, textAlign: 'right' }}>Models</span>
        <span style={{ ...eb, ...CELL_CLIP, fontSize: 7.5, lineHeight: 1, color: TOW.goldDeep, textAlign: 'right' }}>Points</span>
        <span aria-hidden style={{ ...eb, fontSize: 7.5, lineHeight: 1 }} />
      </div>

      {sections.map((cat) => {
        const catRows = grouped.get(cat) ?? [];
        const t = totalFor.get(cat);
        // "460 · max 500" / "638 · min 500 ✓" — absolute points, per the desktop spec. Bare points
        // when the category is unlimited or there is no target, and nothing at all for
        // Mercenaries/Allies (which have no CategoryTotal at all).
        let meta: string | undefined;
        if (t) {
          const lim = absoluteLimit(t.rule, target);
          meta = lim
            // The ✓ is the spec's own, and it appears on the MIN example only — a satisfied minimum
            // is the one limit worth confirming (a maximum you are under is simply the normal case).
            ? `${fmt(t.points)} · ${lim.kind} ${fmt(lim.points)}${lim.kind === 'min' && t.ok ? ' ✓' : ''}`
            : fmt(t.points);
        }
        return (
          <div key={cat}>
            {/* The CATEGORY RULES themselves (the "max 50% of your army's points" prose) move to the
                desktop rail — another screen's job. What stays here is exactly what the spec leaves
                on the section line: the spend and the rule figure. */}
            <SectionHeader label={SECTION_LABEL[cat]} meta={meta} violated={t ? !t.ok : false} />

            {catRows.map((row, i) => {
              const isSel = selected.has(row.uid);
              // `highlightUid` is the row the LAST change touched (the container's echo). It gets the
              // selected row's surface — white + rail — but not its emphasis (600 name, ink points),
              // which stays reserved for actual selection, because selection is what drives the
              // inspector and the two must stay tellable apart.
              const isHl = !isSel && row.uid === highlightUid;
              const hot = hoverUid === row.uid;
              const dragging = drag?.uid === row.uid;
              const line = dropAt?.uid === row.uid ? dropAt.before : null; // true=top, false=bottom
              const lifted = isSel || isHl || hot;

              return (
                <div
                  key={row.uid}
                  data-uid={row.uid}
                  data-row="roster"
                  data-selected={isSel ? 'true' : 'false'}
                  data-hover={hot ? 'true' : 'false'}
                  draggable
                  onDragStart={(ev) => {
                    ev.dataTransfer.setData('text/plain', row.uid);
                    ev.dataTransfer.effectAllowed = 'move';
                    setDrag({ uid: row.uid, category: row.category });
                  }}
                  onDragEnd={clearDrag}
                  onDragOver={(ev) => {
                    // CROSS-CATEGORY DROPS ARE REFUSED. Not preventing the default here is what makes
                    // the browser reject the drop and animate the row back to where it came from —
                    // "de rij springt terug" — and `dropEffect = 'none'` gives the no-drop cursor
                    // while hovering, so the refusal is visible BEFORE the mouse is released rather
                    // than only after.
                    if (drag && drag.category !== row.category) {
                      ev.dataTransfer.dropEffect = 'none';
                      if (dropAt) setDropAt(null);
                      return;
                    }
                    ev.preventDefault();
                    ev.dataTransfer.dropEffect = 'move';
                    const r = ev.currentTarget.getBoundingClientRect();
                    const before = ev.clientY < r.top + r.height / 2;
                    if (dropAt?.uid !== row.uid || dropAt.before !== before) {
                      setDropAt({ uid: row.uid, before });
                    }
                  }}
                  onDragLeave={() => setDropAt((d) => (d?.uid === row.uid ? null : d))}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    const r = ev.currentTarget.getBoundingClientRect();
                    const before = ev.clientY < r.top + r.height / 2;
                    // `dataTransfer` is authoritative (it survives a drag that started elsewhere);
                    // the state is the fallback for browsers that clear it early.
                    const draggedUid = ev.dataTransfer.getData('text/plain') || drag?.uid || '';
                    const source = draggedUid
                      ? (grouped.get(drag?.category ?? row.category) ?? []).find((s) => s.uid === draggedUid)
                        ?? rows.find((s) => s?.uid === draggedUid)
                      : undefined;
                    clearDrag();
                    if (!source || source.uid === row.uid) return;
                    // Second gate, on the authoritative uid: a drop that slipped past `dragover`
                    // (a synthetic event, a browser that skips it) still cannot cross a category.
                    if (source.category !== row.category) return;
                    dropOnto(source.uid, row, before);
                  }}
                  onPointerEnter={(ev) => {
                    // Touch fires enter and never leave, which would leave the glyphs stuck visible
                    // on a tablet. This is the desktop layout, so only a real pointer lights a row.
                    if (ev.pointerType !== 'touch') setHoverUid(row.uid);
                  }}
                  onPointerLeave={() => setHoverUid((u) => (u === row.uid ? null : u))}
                  // Tabbing to one of the action glyphs lights its row, so a keyboard user sees the
                  // same affordance a mouse user does.
                  onFocus={() => setHoverUid(row.uid)}
                  onBlur={() => setHoverUid((u) => (u === row.uid ? null : u))}
                  onClick={(ev) => onSelect(row.uid, modeOf(ev))}
                  style={{
                    ...GRID,
                    position: 'relative',
                    height: ROW_H, boxSizing: 'border-box', overflow: 'hidden',
                    borderBottom: `1px solid ${HAIRLINE}`,
                    // Hover and selection both raise the row to White. The zebra tint underneath is
                    // the dense-table variant the ZEBRA token exists for; it is a background only,
                    // so it can never affect the 34px rhythm.
                    background: lifted ? TOW.panel : (i % 2 === 1 ? ZEBRA : 'transparent'),
                    boxShadow: isSel || isHl ? SELECTED_RAIL : 'none',
                    opacity: dragging ? 0.45 : 1,
                    cursor: 'pointer',
                    // A dense table is not for text selection, and without this a Shift-click would
                    // drag-select the text of every row it passed instead of selecting rows.
                    userSelect: 'none',
                  }}
                >
                  {/* Qty — the count as the phone row's own prefix vocabulary (Blood 600, `N×`),
                      carrying the ▲ violation marker when the unit is below its minimum size.
                      MEASURED: the marker is 8.5px, not the cell's 13.5px, because at cell size
                      "▲ 25×" needs 45px and the spec's Qty column is 42 — the marker would have
                      clipped exactly when it mattered most. 8.5px is the same size the redesign
                      already prints ▲ at (the validation band, and SectionHeader's own meta), and it
                      brings the widest realistic case ("▲ 100×") to 38.8px, inside budget. */}
                  <span style={QTY_CELL}>
                    {row.undersized ? (
                      <span
                        aria-hidden
                        style={{ display: 'inline-block', fontSize: 8.5, marginRight: 2 }}
                      >
                        ▲
                      </span>
                    ) : null}
                    {fmt(row.count)}×
                  </span>

                  {/* Unit — name (600 when selected) + the ✦ magic glyph, which sits OUTSIDE the
                      ellipsising name so a very long name truncates instead of eating the glyph. */}
                  <span style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
                    <span style={{ ...NAME_CELL, fontWeight: isSel ? 600 : 400 }}>{row.name}</span>
                    {row.magic ? (
                      <span
                        aria-hidden
                        style={{
                          flex: '0 0 auto', paddingLeft: 4, color: TOW.gold,
                          fontFamily: towFont.serif, fontSize: 14.5, lineHeight: 1.25,
                        }}
                      >
                        ✦
                      </span>
                    ) : null}
                  </span>

                  {/* Options — the phone row's second line, moved into its own column. */}
                  <span style={OPTIONS_CELL}>{row.whisper}</span>

                  {/* Models */}
                  <span style={NUM_CELL}>{fmt(row.count)}</span>

                  {/* Points — to Ink when selected. */}
                  <span style={{ ...NUM_CELL, color: isSel ? TOW.ink : TOW.muted }}>
                    {fmt(row.points)}
                  </span>

                  {/* Actions — ALWAYS mounted, `transparent` until the row is hot. This is the whole
                      reason the row never shifts on hover: nothing appears, something merely gains a
                      colour. */}
                  <span
                    style={{
                      display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6,
                      minWidth: 0,
                    }}
                  >
                    <GlyphButton
                      glyph="⧉"
                      label={`Duplicate ${row.name}`}
                      tone={TOW.goldDeep}
                      visible={hot}
                      onClick={() => onDuplicate(row.uid)}
                    />
                    <GlyphButton
                      glyph="✕"
                      label={`Remove ${row.name}`}
                      tone={TOW.gold}
                      visible={hot}
                      onClick={() => onRemove(row.uid)}
                    />
                  </span>

                  {/* The drop indicator. Absolutely positioned and `pointerEvents: none`, so it
                      cannot take part in layout — a 34px row stays 34px mid-drag. */}
                  {line != null ? (
                    <div
                      aria-hidden
                      style={{
                        position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 2,
                        [line ? 'top' : 'bottom']: -1,
                        background: TOW.gold, pointerEvents: 'none',
                      }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* With no units every section is skipped (a category without units must not produce a
          heading), which would leave the column header floating over nothing. One quiet line, same
          wording family as the phone's empty roster. */}
      {sections.length === 0 ? (
        <div
          style={{
            padding: '26px 0', textAlign: 'center',
            fontFamily: towFont.serif, fontSize: 11.5, lineHeight: 1.5, color: TOW.faint,
          }}
        >
          No units yet.
        </div>
      ) : null}
    </div>
  );
}

/**
 * One hover-revealed row action. The colour — not the presence — is what changes: the button is in
 * the tree at its full size at all times, so the 52px action column is occupied on every row and
 * hovering can never reflow anything.
 *
 * It stays focusable while invisible on purpose: that is what lets a keyboard reach Duplicate and
 * Remove at all, and focusing it lights its row (the row's own `onFocus`), so the glyph the user is
 * on is visible by the time they can act on it.
 */
function GlyphButton({ glyph, label, tone, visible, onClick }: {
  glyph: string; label: string; tone: string; visible: boolean; onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // A row click selects; an action click acts. Without this the row underneath would also
      // register a selection change on every duplicate and every remove.
      onClick={(ev) => { ev.stopPropagation(); onClick(); }}
      // The row is `draggable`, and a button inside a draggable ancestor still starts that drag on
      // mousedown — which would make the action glyphs impossible to click without nudging.
      draggable={false}
      onDragStart={(ev) => { ev.preventDefault(); ev.stopPropagation(); }}
      onMouseDown={(ev) => ev.stopPropagation()}
      style={{
        flex: '0 0 auto', width: 18, height: 18, padding: 0, margin: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'none', border: 'none', borderRadius: 3, cursor: 'pointer',
        fontFamily: towFont.serif, fontSize: 12, lineHeight: 1,
        color: visible ? tone : 'transparent',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {glyph}
    </button>
  );
}
