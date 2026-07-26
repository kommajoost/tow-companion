// Army-builder REDESIGN — the "Resolve" sheet behind the warning band's Resolve link.
//
// It lists the cheapest edits that clear the list's violations, each with its point saving, and can
// apply the ones that are applicable.
//
// IT CONTAINS NO SOLVER. Every fix comes from `resolveFixes()` in src/lib/resolveFixes.ts, in the
// order that function returns them — which is already ranked (individually SUFFICIENT fixes first,
// smallest-sufficient first; then the insufficient ones, largest first). This file re-ranks nothing,
// re-prices nothing and filters nothing, deliberately: the moment a sheet starts second-guessing which
// of the solver's fixes are "relevant", there are two solvers and they will disagree.
//
// The same goes for the missing magic-item fixes while `ctx.itemsData` is still undefined: the solver
// omits them itself rather than quote a number it cannot stand behind, so there is nothing to filter
// here and nothing to guess. `entry.opts` is never read, rewritten or pruned by this file.
//
// TWO KINDS OF FIX, and the difference is the whole point of the layout:
//   • `reduce`   — frees points up, carries an `apply`, and gets a button.
//   • `add-core` — the Core minimum, which needs points ADDED. It has NO `apply`, because only the
//                  player can decide which Core units those are; auto-"fixing" it would mean inventing
//                  units into someone's army list. So it renders as advice with the shortfall, on the
//                  validation band's own fill, with no control at all. A dead button would be a lie.
//
// MUTATION goes out through `ctx.update(fix.apply)` — a functional update, and `fix.apply` itself
// preserves every unknown field and never regenerates a uid (the campaign veteran key). This file adds
// nothing to that path.

import { useEffect, useMemo, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useBackClose } from '../../lib/backStack';
import { resolveFixes } from '../../lib/resolveFixes';
import { BUILDER, fmt, HAIRLINE, SectionHeader } from './primitives';
import type { BuilderCtx, ResolveFix } from './types';

const eb = engraved as React.CSSProperties; // Cinzel 600 · uppercase · letterSpacing .22em
const n = fmt;

/** The app's existing scrim value, used verbatim by every other overlay in the builder
 *  (BuilderWorkspace's sheets, InfoSheet, RuleSheet). Not a new token — the same string. */
const SCRIM = 'rgba(30,20,8,0.45)';
/** Above the roster and the catalogue pane, below the unit-info popup (70) that can open on top of a
 *  sheet — matching the z-order BuilderWorkspace already uses for its own builder overlays. */
const Z = 60;

// ─────────────────────────── one fix row ───────────────────────────
/**
 * Label · saving · action. The row is content-height rather than a fixed 44px: a fix label is a whole
 * sentence ("Drop 4 models from Executioners of Har Ganeth (to its minimum of 5)") and truncating the
 * unit's name out of it would make two fixes indistinguishable.
 */
function FixRow({ fix, onApply }: { fix: ResolveFix; onApply: () => void }): React.JSX.Element {
  const advisory = fix.kind === 'add-core';
  // `apply` is what actually decides whether a button appears — not the kind. The two agree by
  // contract (types.ts), and reading the field that is used means a fix can never render a control
  // that cannot fire.
  const canApply = typeof fix.apply === 'function';

  // Two whole style objects rather than one with conditional borders: mixing the `border` shorthand
  // with a `borderBottom` longhand in a single object is the kind of thing React warns about (and
  // whichever wins depends on key order, which is not something a reader should have to reason about).
  // Advice sits on the validation band's fill inside the band's own rule and gains the band's ▲ — the
  // same vocabulary the roster's warning band uses, so "this is a statement, not a control" needs no
  // explaining.
  const rowStyle: React.CSSProperties = advisory
    ? {
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '9px 10px', margin: '4px -10px 0',
      border: `1px solid ${TOW.bandLine}`, borderRadius: BUILDER.radius.button,
      background: TOW.bandFill,
    }
    : {
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '9px 0', borderBottom: `1px solid ${HAIRLINE}`, background: 'transparent',
    };

  return (
    <div style={rowStyle}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block', fontFamily: towFont.serif, fontSize: 13, lineHeight: 1.35,
            color: advisory ? TOW.goldDeep : TOW.ink,
          }}
        >
          {advisory ? '▲ ' : ''}{fix.label}
        </span>
        {advisory ? (
          <span
            style={{
              display: 'block', marginTop: 3, fontFamily: towFont.serif, fontSize: 11, lineHeight: 1.35,
              color: TOW.muted,
            }}
          >
            No single edit can do this — which Core units to add is your call.
          </span>
        ) : null}
      </span>

      <span
        style={{
          flexShrink: 0, minWidth: 56, textAlign: 'right',
          fontFamily: towFont.serif, fontSize: 13, lineHeight: 1.35,
          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
          // Signed, because the two kinds mean opposite things: a `reduce` frees points, an `add-core`
          // still needs them. `ResolveFix.saving` is positive in both cases.
          color: advisory ? TOW.gold : TOW.muted,
        }}
      >
        {advisory ? '+' : '−'}{n(fix.saving)}
      </span>

      {canApply ? (
        <button
          type="button"
          onClick={onApply}
          style={{
            flexShrink: 0, height: BUILDER.control.chip, padding: '0 10px', boxSizing: 'border-box',
            borderRadius: BUILDER.radius.chip, border: `1px solid ${TOW.lineStrong}`,
            background: TOW.panel2, color: TOW.goldDeep, cursor: 'pointer',
            ...eb, fontSize: 8, letterSpacing: '0.14em', lineHeight: 1,
          }}
        >
          Apply
        </button>
      ) : (
        // The add-core row keeps the same column so the list stays aligned, and fills it with a label
        // instead of a control.
        <span
          style={{
            flexShrink: 0, height: BUILDER.control.chip, display: 'flex', alignItems: 'center',
            ...eb, fontSize: 7.5, letterSpacing: '0.14em', color: TOW.faint, whiteSpace: 'nowrap',
          }}
        >
          Your choice
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════ the sheet ═══════════════════════════
export function ResolveSheet(props: {
  ctx: BuilderCtx;
  onClose: () => void;
}): React.JSX.Element {
  const { ctx, onClose } = props;

  // A real overlay, so it takes a back-stack layer: without it hardware Back leaves the app instead of
  // closing the sheet (REBUILD-CONSTRAINTS §5). Registered unconditionally — this component only
  // exists while the sheet is open, exactly like RuleSheet/UnitOptions do it — so it is trivially the
  // deepest layer and there is no ordering hazard.
  useBackClose(true, onClose);

  // Esc, in the CAPTURE phase. Capture is what makes a modal win over a non-modal layer that also
  // listens on the document (the catalogue pane): document's capture listener runs before anything in
  // the bubble phase, whatever the mount order was, and stopping propagation there keeps the keystroke
  // from reaching a second handler.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const { derived, list } = ctx;
  const violations = derived.violations ?? [];
  const legal = violations.length === 0;

  // The solver, called exactly as documented and never with a captured snapshot: `ctx.list` is a fresh
  // object after every `update`, so the memo recomputes and the rows on screen always describe the
  // CURRENT list. Skipped entirely for a legal list — `resolveFixes` enumerates reduce-fixes for every
  // entry regardless of whether anything is wrong, so rendering it unconditionally would offer to
  // delete units from a list that has nothing to fix.
  const fixes = useMemo(
    () => (legal ? [] : resolveFixes(list, ctx.army, derived, ctx.itemsData)),
    [legal, list, ctx.army, derived, ctx.itemsData],
  );

  // What the last Apply did. The sheet STAYS OPEN after applying, because one edit frequently does not
  // clear a large overshoot and the ranking is recomputed against what is left — closing would force a
  // reopen for every step of a multi-step repair, and would hide the result of the step just taken.
  // The trade-off is that the list re-sorts under the cursor, so the applied edit is echoed here to
  // keep that legible rather than surprising.
  const [applied, setApplied] = useState<{ label: string; saving: number } | null>(null);

  const applyFix = (fix: ResolveFix) => {
    const apply = fix.apply;
    if (!apply) return; // add-core: no control is rendered for it, so this is belt-and-braces only
    ctx.update(apply);
    setApplied({ label: fix.label, saving: fix.saving });
  };

  const cap = list?.points ?? 0;
  // Read back from `derived`, never recomputed — no fourth points calculation (REBUILD-CONSTRAINTS §7).
  const overBy = Math.max(0, -(derived.remainingPoints ?? 0));

  return (
    <div
      onClick={onClose}
      style={{
        // `absolute`, not `fixed`: the sheet belongs over the roster column its shell positions, not
        // over the whole window. The shell's workspace box therefore needs `position: relative` — as
        // BuilderWorkspace's own overlays already assume.
        position: 'absolute', inset: 0, zIndex: Z, background: SCRIM,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
      }}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '100%', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', minHeight: 0,
          background: TOW.panel, color: TOW.ink,
          border: `1px solid ${TOW.lineStrong}`, borderRadius: 14,
          boxShadow: '0 14px 40px rgba(40,24,8,0.26)',
        }}
      >
        {/* ── head: what is wrong ─────────────────────────────────────────────────────────────── */}
        <div
          style={{
            flexShrink: 0, padding: '13px 16px 11px', borderBottom: `1px solid ${TOW.line}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ ...eb, flex: 1, minWidth: 0, fontSize: 9, color: TOW.goldDeep }}>Resolve</span>
            <span
              style={{
                flexShrink: 0, fontFamily: towFont.serif, fontSize: 11.5, color: TOW.faint,
                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
              }}
            >
              {n(derived.totalPoints)} of {n(cap)}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              title="Close (Esc)"
              style={{
                flexShrink: 0, width: 22, height: 22, padding: 0, marginBottom: -4,
                border: 'none', background: 'none', cursor: 'pointer', color: TOW.muted,
                fontFamily: towFont.serif, fontSize: 20, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              marginTop: 5, fontFamily: towFont.display, fontWeight: 700, fontSize: 15.5, lineHeight: 1.2,
              color: TOW.ink,
            }}
          >
            {legal
              ? 'Nothing to resolve'
              : `${violations.length} thing${violations.length === 1 ? '' : 's'} to fix`}
          </div>

          {/* The kop leans on `derived.violations` — the four typed kinds, worded per the spec — and on
              nothing else. `derived.warnings` is deliberately not joined in here: the two overlap by
              design (see their doc comments) and printing both would say the same complaint twice. */}
          {legal ? null : (
            <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {violations.map((v, i) => (
                <div
                  key={`${v.kind}-${i}`}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: 6, color: TOW.goldDeep,
                    fontFamily: towFont.serif, fontSize: 12, lineHeight: 1.35,
                  }}
                >
                  <span aria-hidden style={{ flexShrink: 0, fontSize: 9 }}>▲</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{v.message}</span>
                </div>
              ))}
            </div>
          )}

          {applied ? (
            <div
              style={{
                marginTop: 9, ...eb, fontSize: 7.5, letterSpacing: '0.14em', color: TOW.muted,
                lineHeight: 1.4,
              }}
            >
              Applied · {applied.label} · −{n(applied.saving)}
            </div>
          ) : null}
        </div>

        {/* ── body ──────────────────────────────────────────────────────────────────────────────── */}
        <div
          style={{
            flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
            padding: '0 16px 14px',
          }}
        >
          {legal ? (
            <>
              <div
                style={{
                  padding: '18px 2px 4px', fontFamily: towFont.serif, fontSize: 13, lineHeight: 1.5,
                  color: TOW.muted,
                }}
              >
                This list is within its points limit and its composition rules
                {cap > 0 ? ` — ${n(derived.totalPoints)} of ${n(cap)} points` : ''}. There is nothing to
                fix, so no edits are suggested.
              </div>
              {/* `violations` is a SUBSET of what validate() checks (four typed kinds); the rest —
                  composition rules, wizard caps, the campaign named-unit requirement — has no typed
                  shape and no points fix. Saying "nothing to resolve" while one of those stands would
                  be a lie, so they are listed as the manual decisions they are. */}
              {(derived.warnings ?? []).length > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <SectionHeader label="Still worth a look" meta={`${n(derived.warnings.length)}`} />
                  {derived.warnings.map((w, i) => (
                    <div
                      key={`${i}-${w}`}
                      style={{
                        padding: '7px 0', borderBottom: `1px solid ${HAIRLINE}`,
                        fontFamily: towFont.serif, fontSize: 12.5, lineHeight: 1.4, color: TOW.parchDim,
                      }}
                    >
                      {w}
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <SectionHeader
                label="Cheapest edits first"
                meta={`${n(fixes.length)} option${fixes.length === 1 ? '' : 's'}`}
              />
              {fixes.length === 0 ? (
                // Reachable: a one-unit list at its minimum size with no options has nothing to give
                // up, and the Core minimum produces no fix at all when the points target is 0.
                <div
                  style={{
                    padding: '14px 2px', fontFamily: towFont.serif, fontSize: 12.5, lineHeight: 1.5,
                    color: TOW.muted,
                  }}
                >
                  No single edit changes this list's points — there is nothing left to drop. Raise the
                  points limit or add units by hand.
                </div>
              ) : (
                fixes.map((fix, i) => (
                  <FixRow
                    key={`${fix.kind}-${fix.uid ?? 'list'}-${i}`}
                    fix={fix}
                    onApply={() => applyFix(fix)}
                  />
                ))
              )}
            </>
          )}
        </div>

        {/* ── foot ──────────────────────────────────────────────────────────────────────────────── */}
        <div
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', borderTop: `1px solid ${TOW.line}`, background: TOW.panel2,
            borderRadius: '0 0 14px 14px',
          }}
        >
          <span
            style={{
              flex: 1, minWidth: 0, ...eb, fontSize: 7.5, letterSpacing: '0.14em',
              color: legal ? TOW.faint : TOW.gold, lineHeight: 1.4,
            }}
          >
            {/* Not every violation is a points overshoot: a Core minimum or an undersized unit leaves
                the total inside the cap, and "0 over the limit" would be nonsense. */}
            {legal
              ? 'List is legal'
              : overBy > 0
                ? `${n(overBy)} over the limit`
                : 'Inside the points limit — composition rules are not met'}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              flexShrink: 0, height: BUILDER.control.primary, padding: '0 18px', boxSizing: 'border-box',
              borderRadius: BUILDER.radius.button, border: `1px solid ${TOW.gold}`,
              background: TOW.gold, color: TOW.onGrad, cursor: 'pointer',
              fontFamily: towFont.display, fontWeight: 700, fontSize: 12.5, letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
