// Army-builder REDESIGN — phone screen 1a "Roster" (and, as a STATE of the same screen, spec 2c
// "over budget"). Presentation only: this screen computes nothing numeric and mutates nothing.
//
// WHAT IT READS  — `ctx.derived` (the read-only projection from `src/lib/builderDerived.ts`), the
//                  pre-built `rows` (assembled by the container), and `ctx.labels` / `ctx.list`.
// WHAT IT WRITES — nothing. Duplicate/remove/add/select are all delegated upward as callbacks, so
//                  `ctx.list.entries` is never touched here, no entry `uid` is ever regenerated
//                  (the campaign veteran key, see REBUILD-CONSTRAINTS §2) and `ctx.update` is not
//                  called at all. `ctx.itemsData`, `ctx.army`, `ctx.getUnit`, `ctx.armyItemLists`
//                  and `ctx.update` are deliberately unused: with nothing to prune or rewrite, the
//                  "catalogue still loading" window (`itemsData === undefined`) is a non-event here
//                  — the screen renders `rows` as handed to it and `opts` cannot be damaged.
//
// LAYOUT — three bands in one column: a fixed 74px header, the body (THE ONLY scroll container) and
// a fixed 63px footer. The over-budget warning band is a SIBLING between header and body, never a
// child of the header and never an inserted card, so the header stays exactly 74px whether or not
// anything is wrong (acceptance criterion 6).
//
// No statline appears on this screen (`StatStrip` is intentionally not imported): the roster row is
// a two-line summary, characteristics belong to the unit-options screen.

import { useCallback, useMemo, useRef, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useBackClose } from '../../lib/backStack';
import type { Category } from '../../lib/owbBuilder';
import { BudgetBar, BUILDER, fmt, SectionHeader, UnitRow, type BudgetSegment } from './primitives';
import type { BuilderCtx, RosterRow } from './types';

const eb = engraved as React.CSSProperties; // Cinzel 600 · uppercase · letterSpacing .22em

// The spec's warning-band fill and top rule — the accent at low alpha. They are real tokens now
// (`--tow-band-fill` / `--tow-band-line` in src/index.css) rather than hardcoded Ivory values, so the
// band follows the Slate-Night theme switch like everything else. Aliased locally to keep call sites
// short.
const BAND_FILL = TOW.bandFill;
const BAND_LINE = TOW.bandLine;

/** The four categories with a budget segment / a footer chip, in the spec's fixed order. Typed as
 *  `BudgetSegment['key']` (the narrow union) rather than `Category`, so the budget bar's segments
 *  type-check without a cast while still being assignable to `Category` everywhere else. */
const SPEC_KEYS: readonly BudgetSegment['key'][] = ['characters', 'core', 'special', 'rare'];
/** Sections the spec does not mention but a composition can still produce (`unitCategoryFor` may map
 *  a unit into Mercenaries/Allies). Rendered AFTER Rare rather than dropped: a row with no section
 *  would be invisible and therefore un-editable and un-deletable — a worse outcome than one extra
 *  heading. They get no meta, because `derived.categoryTotals` holds only the four spec categories
 *  and this screen does not compute totals of its own. */
const EXTRA_KEYS: readonly Category[] = ['mercenaries', 'allies'];

const SECTION_LABEL: Record<Category, string> = {
  characters: 'Characters', core: 'Core', special: 'Special', rare: 'Rare',
  mercenaries: 'Mercenaries', allies: 'Allies',
};
/** Footer-chip / header-row-3 abbreviations, exactly as the spec prints them ("Chr 460 / Core 638
 *  / Spec 560 / Rare 340") — mixed case, so these labels deliberately skip `engraved`'s uppercase. */
const SHORT_LABEL: Record<BudgetSegment['key'], string> = {
  characters: 'Chr', core: 'Core', special: 'Spec', rare: 'Rare',
};

// ─── numbers ───
// The canonical points formatter lives in primitives.tsx (thin space, per the spec's "1 998" and
// "of 2 000") and is now shared by every builder screen AND by UnitRow’s own points cell, so the
// header and the rows can no longer disagree. Kept as a local alias to avoid churning call sites.
const pts = fmt;

// ─────────────────────────── warning-band message ───────────────────────────
// `DerivedList.violations` and `.warnings` OVERLAP BY DESIGN (see their doc comments): `violations`
// is the four typed kinds worded per the spec, `warnings` is validate()'s complete list worded its
// own way. Joining both raw would print the same complaint twice in one band ("34 points over the
// limit · Over the points limit by 34").
//
// So every warning whose complaint IS one of the four typed kinds is dropped by shape, and only the
// warnings the typed set cannot express survive — `unitAllowedIn`, the Grand Melee 25%/wizard caps,
// Combined Arms per-datasheet counts, Battle March minimums, the campaign named-unit requirement.
// The patterns below are validate()'s own templates (owbBuilder.ts:429-443, :505).
//
// CONSEQUENCE, stated rather than hidden: `deriveList` suppresses the percentage violations while the
// points target is 0 (they would read "Characters at 0% of max 50%"). Because the filter here is
// unconditional, the percentage WARNINGS are dropped in that case too, so a target-less list shows
// only its overshoot and its unit-size/composition problems. That matches deriveList's documented
// intent — a percentage verdict against a zero base says nothing — and the overshoot itself always
// still fires, so such a list is never reported as clean.
const TYPED_COUNTERPART: readonly RegExp[] = [
  /^Over the points limit by /,                 // ← Violation 'over-cap'
  / over its \d+% cap \(/,                      // ← Violation 'category-max'
  / below its \d+% minimum \(/,                 // ← Violation 'core-min'
  /: (?:below minimum|above maximum) size \(/,  // ← Violation 'unit-size' (identical wording, in fact)
];

export function RosterScreen(props: {
  ctx: BuilderCtx;
  rows: RosterRow[];              // AL gebouwd door de container — bouw ze niet zelf op
  onBack: () => void;
  onAddUnit: (category?: Category) => void;
  onSelectUnit: (uid: string) => void;
  onDuplicate: (uid: string) => void;
  onRemove: (uid: string) => void;
  onResolve?: () => void;
  highlightUid?: string;
  /** Opens the container's list-settings sheet (rename, army composition). Without it the header
   *  title is inert text, exactly as it was before. */
  onEditList?: () => void;
}): React.JSX.Element {
  const { ctx, rows, onBack, onAddUnit, onSelectUnit, onDuplicate, onRemove, onResolve, highlightUid, onEditList } = props;
  const { derived, labels, list } = ctx;

  // LONG-PRESS ACTIONS — chosen shape and why.
  // A long press reveals Duplicate + Remove as a two-button strip absolutely positioned INSIDE the
  // pressed row, right-anchored, on the row's own `selected` white background. Reasons:
  //   • no reflow — the strip overlays the row instead of being inserted next to it, so the 44px row
  //     rhythm and the 12-rows-on-a-390x812-screen budget are untouched whether it is open or not;
  //   • no modal layer — nothing covers the roster, so the neighbouring rows stay readable and the
  //     unit's own name stays visible next to "Remove" (you can see what you are about to delete);
  //   • cheapest correct thing — no portal, no backdrop, no focus trap, no gesture library.
  // Dismissal: hardware Back (the one `useBackClose` layer below), scrolling the body, tapping the
  // row again, long-pressing another row, or either action firing. There is deliberately no
  // full-screen backdrop: an invisible element over the whole screen would have to out-stack the
  // scroll container, and the five dismissal routes above already cover it.
  const [actionUid, setActionUid] = useState<string | null>(null);
  const closeActions = useCallback(() => setActionUid(null), []);
  // The screen itself registers NO back-stack layer (the container owns that, via `onBack`). This is
  // the only layer, so it is trivially the deepest — no ordering hazard (REBUILD-CONSTRAINTS §5).
  useBackClose(actionUid !== null, closeActions);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Partial<Record<Category, HTMLDivElement | null>>>({});

  // ── grouping: by the EFFECTIVE category (`row.category`), never `entry.cat` ──────────────────
  const grouped = useMemo(() => {
    const map = new Map<Category, RosterRow[]>();
    for (const r of rows ?? []) {
      const list_ = map.get(r.category);
      if (list_) list_.push(r);
      else map.set(r.category, [r]);
    }
    return map;
  }, [rows]);

  const totalFor = useMemo(
    () => new Map((derived.categoryTotals ?? []).map((t) => [t.key, t] as const)),
    [derived.categoryTotals],
  );

  const segments = useMemo<BudgetSegment[]>(
    () => SPEC_KEYS.map((key) => ({ key, points: totalFor.get(key)?.points ?? 0 })),
    [totalFor],
  );

  const bandMessages = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (m: string) => {
      const s = (m ?? '').trim();
      if (!s || seen.has(s)) return;   // ← second guard: exact duplicates, whatever their origin
      seen.add(s);
      out.push(s);
    };
    for (const v of derived.violations ?? []) push(v.message);       // typed first (severity order)
    for (const w of derived.warnings ?? []) {
      if (TYPED_COUNTERPART.some((re) => re.test(w))) continue;      // already said above
      push(w);
    }
    return out;
  }, [derived.violations, derived.warnings]);

  // The cap comes straight from the list; `BudgetBar` clamps a non-positive/NaN cap itself, and the
  // overshoot is read back from `derived.remainingPoints` rather than recomputed — no fourth points
  // calculation anywhere in this file (REBUILD-CONSTRAINTS §7).
  const cap = list?.points ?? 0;
  const overBy = Math.max(0, -(derived.remainingPoints ?? 0));

  // Scroll the body to a section AND open the picker pre-filtered — the spec's footer chip does both,
  // so the roster is already at that section when the picker closes. rect-based rather than
  // `scrollIntoView`, which would scroll the nearest scrollable ancestor (possibly the page).
  const goToSection = useCallback((cat: Category) => {
    const body = bodyRef.current;
    const el = sectionRefs.current[cat];
    if (!body || !el) return;
    const top = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
    body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, []);

  const order: Category[] = [...SPEC_KEYS, ...EXTRA_KEYS];
  const sections = order.filter((cat) => (grouped.get(cat)?.length ?? 0) > 0);

  return (
    <div
      style={{
        width: '100%', height: '100%', minHeight: 0, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: TOW.bg, color: TOW.parch,
      }}
    >
      {/* ═══════════════ header — exactly 74px, band or no band ═══════════════
          Vertical budget, for the record: 12 (pad) + 24 (row 1: 15.5/16 + 1 + 7.5/7) + 11 (gap)
          + 5 (bar) + 6 (gap) + 9 (row 3) = 67, inside a fixed 74px border-box. The spec's own
          numbers over-book the box — its 12/10 paddings plus its 11+6 gaps leave 30px for two text
          rows that need ~33 — so the HEIGHT wins (it is hard, and the 12-row body budget is measured
          against it) and the effective bottom padding lands at ~7px instead of 10px. Nothing is
          clipped: content is laid out from the top and ends 7px above the bottom edge. */}
      <div
        style={{
          flexShrink: 0, height: BUILDER.headerH, boxSizing: 'border-box',
          padding: `12px ${BUILDER.gutter}px 10px`, overflow: 'hidden',
          background: `linear-gradient(180deg, ${TOW.paper2}, ${TOW.leatherDark})`,
          borderBottom: `1px solid ${TOW.lineStrong}`,
        }}
      >
        {/* ── row 1: back · name + eyebrow · total + micro-caps · status dot ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            style={{
              // 34px tap target (BUILDER.control.back) pulled back to a 23px layout footprint with
              // negative margins, so the touch area stays honest without inflating the 74px header.
              width: BUILDER.control.back, height: BUILDER.control.back, flexShrink: 0,
              margin: '-6px 0 -5px -8px', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer',
              color: TOW.goldDeep, fontFamily: towFont.serif, fontSize: 20, lineHeight: 1,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            ‹
          </button>

          {/* Title + eyebrow. With `onEditList` this is the way into the list settings on a phone
              (rename, army composition) — the desktop rail has its own rows for that, but here there
              was no way in at all. Rendered as a button only when it does something. */}
          <span
            {...(onEditList ? { role: 'button', tabIndex: 0, onClick: onEditList,
                                onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEditList(); } },
                                'aria-label': 'List settings' } : {})}
            data-tour="lijst-naam"
            style={{
              flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
              cursor: onEditList ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span
              style={{
                fontFamily: towFont.display, fontWeight: 700, fontSize: 15.5, lineHeight: 1,
                color: TOW.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {list?.name || 'Untitled list'}
              {onEditList && <span aria-hidden style={{ color: TOW.faint, fontWeight: 400 }}> ✎</span>}
            </span>
            <span
              style={{
                ...eb, fontSize: 7.5, letterSpacing: '0.18em', lineHeight: 1, marginTop: 1,
                color: TOW.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {[labels?.faction, labels?.composition, labels?.rule].filter(Boolean).join(' · ')}
            </span>
          </span>

          <span
            data-tour="lijst-punten"
            style={{
              flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
            }}
          >
            <span
              style={{
                fontFamily: towFont.display, fontWeight: 700, fontSize: 16, lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                // Spec 2c: over budget re-colours the total to the accent.
                color: overBy > 0 ? TOW.gold : TOW.ink,
              }}
            >
              {pts(derived.totalPoints)}
            </span>
            <span
              style={{
                ...eb, fontSize: 7, letterSpacing: '0.14em', lineHeight: 1, marginTop: 1,
                color: overBy > 0 ? TOW.gold : TOW.faint, whiteSpace: 'nowrap',
              }}
            >
              {/* Spec 2c: "of 2 000" → "34 over". */}
              {overBy > 0 ? `${pts(overBy)} over` : `of ${pts(cap)}`}
            </span>
          </span>

          {/* 8px status dot. Two states only, both from the existing token set: the accent when the
              band has anything to say, a quiet neutral when the list is clean. */}
          <span
            aria-hidden
            style={{
              flexShrink: 0, width: 8, height: 8, borderRadius: BUILDER.radius.pill, marginTop: 4,
              background: bandMessages.length > 0 ? TOW.gold : TOW.faint,
            }}
          />
        </div>

        {/* ── row 2: the budget bar, 11px below row 1 ── */}
        <div style={{ marginTop: 11 }}>
          {/* Always the REAL total: BudgetBar draws its hatched overage tail itself as soon as
              total > cap, which is exactly the spec-2c bar state. */}
          <BudgetBar segments={segments} cap={cap} total={derived.totalPoints} height={5} />
        </div>

        {/* ── row 3: the four category totals, 6px below the bar ── */}
        <div
          style={{
            marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            gap: 6,
          }}
        >
          {SPEC_KEYS.map((key) => {
            const t = totalFor.get(key);
            return (
              <span
                key={key}
                style={{
                  fontFamily: towFont.display, fontWeight: 600, fontSize: 9, lineHeight: 1,
                  letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                  color: t && !t.ok ? TOW.gold : TOW.muted,
                }}
              >
                {SHORT_LABEL[key]} {pts(t?.points ?? 0)}
              </span>
            );
          })}
        </div>
      </div>

      {/* ═══════════════ warning band (spec 2c) ═══════════════
          A SIBLING of the header, attached directly under it: full-bleed fill, 1px top rule, 5px
          vertical padding, content on the screen gutter. Single line, ellipsised — the spec puts every
          active violation on ONE line, and a wrapping band would silently steal body height. */}
      {bandMessages.length > 0 ? (
        <div
          style={{
            flexShrink: 0, boxSizing: 'border-box', width: '100%',
            padding: `5px ${BUILDER.gutter}px`,
            background: BAND_FILL, borderTop: `1px solid ${BAND_LINE}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, color: TOW.goldDeep }}>
            <span aria-hidden style={{ flexShrink: 0, fontSize: 8.5, lineHeight: 1.25 }}>▲</span>
            {/* ONE MESSAGE PER LINE. These used to be joined with " · " into a single nowrap line, so
                with more than one problem the run never fit and the rest was ellipsised away — the band
                said there was a problem while hiding what it was. Each message is a separate row now and
                the band grows to fit; a list with three problems is worth three lines. */}
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {bandMessages.map((m) => (
                <span
                  key={m}
                  style={{ fontFamily: towFont.serif, fontSize: 10.5, lineHeight: 1.25 }}
                >
                  {m}
                </span>
              ))}
            </span>
            {/* The Resolve SHEET is another phase's work — this is only the link that asks for it, and
                it is omitted entirely when no handler was passed (a dead link is worse than none). */}
            {onResolve ? (
              <button
                type="button"
                onClick={onResolve}
                style={{
                  flexShrink: 0, background: 'none', border: 'none', padding: 0, margin: 0,
                  cursor: 'pointer', color: TOW.goldDeep, textDecoration: 'underline',
                  ...eb, fontSize: 8, letterSpacing: '0.16em',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                Resolve
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ═══════════════ body — THE ONLY scroll container ═══════════════ */}
      <div
        ref={bodyRef}
        onScroll={actionUid !== null ? closeActions : undefined}
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch', boxSizing: 'border-box',
          padding: `0 ${BUILDER.gutter}px 8px`,
        }}
      >
        {sections.map((cat) => {
          const catRows = grouped.get(cat) ?? [];
          const t = totalFor.get(cat);
          // "460 · max 25%" for a capped category, "638 · min 25%" for Core, bare points when the
          // category is unlimited, and nothing at all for Mercenaries/Allies (no CategoryTotal).
          const meta = t ? `${pts(t.points)}${t.rule ? ` · ${t.rule}` : ''}` : undefined;
          return (
            <div
              key={cat}
              ref={(el) => { sectionRefs.current[cat] = el; }}
            >
              <SectionHeader label={SECTION_LABEL[cat]} meta={meta} violated={t ? !t.ok : false} />
              {catRows.map((row) => {
                const open = actionUid === row.uid;
                return (
                  <div key={row.uid} style={{ position: 'relative' }}>
                    <UnitRow
                      count={row.count}
                      name={row.name}
                      whisper={row.whisper}
                      points={row.points}
                      magic={row.magic}
                      issues={row.issues}
                      // The row that caused the last change keeps the white background + 3px inset
                      // accent rail until the next interaction; the row whose actions are showing gets
                      // the same treatment, which is also what makes the action strip's own TOW.panel
                      // background blend seamlessly into the row.
                      selected={row.uid === highlightUid || open}
                      onClick={() => {
                        if (open) { closeActions(); return; }  // second tap dismisses, never navigates
                        setActionUid(null);
                        onSelectUnit(row.uid);
                      }}
                      onLongPress={() => setActionUid(row.uid)}
                    />
                    {open ? (
                      <div
                        style={{
                          position: 'absolute', top: 0, right: 0, bottom: 1, zIndex: 1,
                          display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 16,
                          background: TOW.panel,
                        }}
                      >
                        <RowAction label="Duplicate" onClick={() => { closeActions(); onDuplicate(row.uid); }} />
                        <RowAction label="Remove" accent onClick={() => { closeActions(); onRemove(row.uid); }} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Not in the spec, added deliberately: with no units every section is skipped (a category
            without units must not produce a heading), which would otherwise leave a completely blank
            body and no hint at all. One quiet line, pointing at the footer's own affordance. */}
        {sections.length === 0 ? (
          <div
            style={{
              padding: '30px 0', textAlign: 'center',
              fontFamily: towFont.serif, fontSize: 11.5, lineHeight: 1.5, color: TOW.faint,
            }}
          >
            No units yet.<br />Add your first with “+ Unit” below.
          </div>
        ) : null}
      </div>

      {/* ═══════════════ footer — 63px incl. 16px safe-area ═══════════════
          `minHeight` rather than `height`: on a device with a home indicator the real
          env(safe-area-inset-bottom) is larger than the spec's 16px reserve and the footer must grow
          rather than tuck its button under the indicator. Where there is no inset (every desktop
          browser, and the 390x812 measurement) it is exactly 63px: 5 + 38 + 16 = 59 → minHeight 63. */}
      <div
        style={{
          flexShrink: 0, minHeight: BUILDER.footerH, boxSizing: 'border-box',
          padding: `5px ${BUILDER.gutter}px max(16px, env(safe-area-inset-bottom))`,
          display: 'flex', alignItems: 'center', gap: 8,
          background: TOW.panel, borderTop: `1px solid ${TOW.lineStrong}`,
        }}
      >
        <button
          type="button"
          data-tour="lijst-toevoegen"
          onClick={() => { closeActions(); onAddUnit(); }}
          style={{
            flexShrink: 0, height: BUILDER.control.primary, padding: '0 14px',
            display: 'flex', alignItems: 'center', gap: 5,
            border: 'none', borderRadius: BUILDER.radius.button, cursor: 'pointer',
            background: `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`,
            color: TOW.onGrad, fontFamily: towFont.display, fontWeight: 700, fontSize: 12.5,
            lineHeight: 1, WebkitTapHighlightColor: 'transparent',
          }}
        >
          {/* The spec prints a fullwidth "＋" (U+FF0B); neither Cinzel nor its declared fallbacks
              carry that codepoint, and a tofu box in the primary action is not a trade worth making.
              An ordinary "+" one step up in size reads identically. */}
          <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>+</span>
          Unit
        </button>

        <div
          style={{
            flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end',
            alignItems: 'center', gap: 6,
          }}
        >
          {SPEC_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              // Both halves of the spec's chip behaviour: scroll the roster to that section AND open
              // the picker with that category pre-selected.
              onClick={() => { closeActions(); goToSection(key); onAddUnit(key); }}
              style={{
                flexShrink: 0, height: BUILDER.control.chip, padding: '0 8px',
                borderRadius: BUILDER.radius.chip, border: `1px solid ${TOW.lineStrong}`,
                background: TOW.panel2, cursor: 'pointer', color: TOW.goldDeep,
                ...eb, fontSize: 8, letterSpacing: '0.16em', lineHeight: 1,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {SHORT_LABEL[key]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** One button in the long-press action strip. Chip geometry (26px, radius 8) so it sits inside a 44px
 *  row without touching its edges; `accent` marks the destructive one. */
function RowAction({ label, accent, onClick }: {
  label: string; accent?: boolean; onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: BUILDER.control.chip, padding: '0 9px', flexShrink: 0,
        borderRadius: BUILDER.radius.chip,
        border: `1px solid ${accent ? TOW.gold : TOW.lineStrong}`,
        background: accent ? TOW.panel : TOW.panel2,
        color: accent ? TOW.gold : TOW.goldDeep, cursor: 'pointer',
        ...eb, fontSize: 8, letterSpacing: '0.14em', lineHeight: 1,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {label}
    </button>
  );
}
