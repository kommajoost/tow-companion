// Army-builder REDESIGN — screen 2b "Unit options": the per-entry editor.
//
// This is a RE-SKIN, not a redesign of the model. Every rule about what may be chosen, what it
// costs and what blocks it comes from the existing engine in `src/lib/owbBuilder.ts`; the logic
// below is lifted from the working editor in `src/components/game/BuilderWorkspace.tsx`
// (`optionEditor` / `magicCategoryBlock` / `magicItemRow` / `subGroupBlock` / `optionRow` + the
// lores block) with only the presentation replaced. The designspec's flat
// `OptionGroup { kind, rule }` model CANNOT express what this screen has to keep working —
// shared magic budgets (`budgetGroup`), `maxItems`, unique-vs-common, two levels of nested
// sub-options, `alwaysActive` parents that are headers rather than choices, option-unlocked
// categories, lores/spells (which live on `entry.lores`/`entry.spells`, not in `entry.opts`) and
// the implicit free `active` default of a radio group — so it is deliberately NOT the datamodel here.
//
// Hard rules observed:
//   • `entry.opts` is the STORAGE format. Written only through the engine's own pure helpers
//     (`setExclusiveSubOption`, `toggleSubOption`, `toggleMagicItem`) plus the two rewrites the old
//     editor did inline (radio set / plain toggle), copied verbatim. The legacy `mountopt/…` prefix
//     is never written — `toggleSubOption` clears it for us.
//   • `entry.uid` is the campaign veteran key — never regenerated. Every mutation is a FUNCTIONAL
//     `ctx.update` that maps the CURRENT entries and spreads the entry, so unknown fields survive
//     (cross-device sync is last-write-wins).
//   • `ctx.itemsData` may be undefined on first paint: then no magic section renders and NOTHING in
//     `opts` is pruned or rewritten. A "clean up unknown opts" pass in that window would erase every
//     magic item.
//   • Going over the points cap is REPORTED, never blocked. The only rows that ever block are magic
//     items, and only because `magicWouldExceed()` says so.
//
// Gutter contract: the primitives carry no horizontal padding, so every band here supplies
// `BUILDER.gutter` itself and all text shares one left edge.

import { useEffect, useMemo, useRef, useState } from 'react';
import { allowedLores as resolveLores } from '../../lib/armyRules';
import { useData } from '../../data';
import { TOW, towFont, engraved } from '../../design/tow';
import { useBackClose } from '../../lib/backStack';
import { makeTroopTypeLookup } from '../../lib/troopTypes';
import {
  DEFAULT_MAGIC_BUDGET, entryPoints, magicCategories, magicGroupSpent, magicItemId,
  magicWouldExceed, radioSelected, selectedMagicKeys, selectedMountIndex, setExclusiveSubOption,
  setStackCount, stackMax, stackTaken, subOptionGroups,
  toggleMagicItem, toggleSubOption, unitBlocks, unitCategoryFor, validate,
  type Category, type ListEntry, type MagicCategory, type MagicItem, type OwbOption, type OwbUnit,
} from '../../lib/owbBuilder';
import { planPromotion, promotionTargets, type PromotionTarget } from '../../lib/promotions';
import { applyMountStatModifiers, mountStatModifiers } from '../../lib/mountModifiers';
import { BUILDER, BudgetBar, fmt, HAIRLINE, SectionHeader, StatStrip, type BudgetSegment } from './primitives';
import type { BuilderCtx } from './types';

const eb = engraved as React.CSSProperties;
/** Strip the catalogue's bookkeeping marks — `{faction}` tags and the `*` multi-takeable marker.
 *  Display only: ids, keys and lookups always use the raw `name_en`. */
const cleanLabel = (s: string) => (s || '').replace(/\{[^}]*\}/g, ' ').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
const CAT_LABEL: Record<Category, string> = {
  characters: 'Characters', core: 'Core', special: 'Special', rare: 'Rare',
  mercenaries: 'Mercenaries', allies: 'Allies',
};

// ─────────────────────────── stat profiles ───────────────────────────
// The statline is not in the OWB catalogue: it lives in `public/owb/rules-index.json`, keyed by
// OWB's normalised unit name, together with the unit's troop-type code. ListBuilder loads the same
// file and hands `statsFor` down to the old workspace as a prop — `BuilderCtx` carries no such
// field, so this screen loads it itself, through the same module-level cache so the file is fetched
// at most once per session. Read-only: nothing here writes to the list.
const STAT_COLS = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld'] as const;
type StatRow = { Name: string } & Partial<Record<(typeof STAT_COLS)[number] | 'Sv', string>>;
type StatIndex = Record<string, { stats?: StatRow[]; troopType?: string }>;
let statIndexCache: StatIndex | null = null;
const BASE = import.meta.env.BASE_URL;
/** OWB's normalizeRuleName — the key shape of rules-index.json (copied from ListBuilder, where it
 *  is a module-private const). */
const normRule = (s: string) => (s || '').toLowerCase().replace(/ *\([^)]*\) */g, '')
  .replace(/[{}[\]*]/g, '').replace(/^[0-9]x /g, '').replace(/[“”]/g, '"').trim();

function useStatIndex(): StatIndex | null {
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

// ─────────────────────────── small atoms ───────────────────────────
/** The spec's two indicators. Radio: a 15px circle, chosen = a 4px accent ring on Raised. Toggle: a
 *  15px rounded square (r4), checked = accent fill with a check in the on-accent ink (`TOW.onGrad`
 *  is the token for "ink that sits on the accent" — a hard-coded white would break the dark skin). */
function Indicator({ kind, on }: { kind: 'radio' | 'toggle'; on: boolean }): React.JSX.Element {
  const base: React.CSSProperties = {
    width: 15, height: 15, flexShrink: 0, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  if (kind === 'radio') {
    return (
      <span style={{
        ...base, borderRadius: BUILDER.radius.pill,
        border: on ? `4px solid ${TOW.gold}` : `1px solid ${TOW.lineStrong}`,
        background: on ? TOW.panel2 : TOW.panel,
      }} />
    );
  }
  return (
    <span style={{
      ...base, borderRadius: BUILDER.radius.check,
      border: `1px solid ${on ? TOW.gold : TOW.lineStrong}`,
      background: on ? TOW.gold : TOW.panel,
    }}>
      {on ? (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 6.4l2.2 2.2 4.8-5" stroke={TOW.onGrad} strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

// The eye is a BARE GLYPH, not a bordered box. It used to be a 34×34 outlined button, which on a
// phone stacked into a column of eight identical frames down the right edge — the loudest thing on a
// screen whose actual content is the option labels. The tap target stays 34×34 (transparent), only
// the frame is gone, so nothing became harder to hit.
const ICON_BTN: React.CSSProperties = {
  width: 34, height: 34, flexShrink: 0, borderRadius: BUILDER.radius.button,
  border: 'none', background: 'transparent', cursor: 'pointer', color: TOW.faint,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
};
/**
 * A troop type as a link to its rulebook page.
 *
 * A troop type is not a label, it is a bundle of rules — how the unit moves, how it fights, what it may
 * join — and every one of them has its own page. Dotted-underlined so it reads as a link inside a line
 * of plain text, and it renders as plain text when the container has no way to show a rule, rather than
 * offering a link that goes nowhere.
 */
function TroopTypeLink({ name, onShowInfo }: {
  name: string;
  onShowInfo?: (what: { kind: 'rule'; name: string; slug?: string } | { kind: 'item'; itemId: string; name: string } | { kind: 'mount'; name: string } | { kind: 'lore'; slug: string }) => void;
}): React.JSX.Element {
  if (!onShowInfo) return <>{name}</>;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onShowInfo({ kind: 'rule', name }); }}
      title={`What ${name} means`}
      style={{
        border: 'none', background: 'none', padding: 0, margin: 0, font: 'inherit',
        letterSpacing: 'inherit', textTransform: 'inherit',
        color: TOW.goldDeep, cursor: 'pointer',
        borderBottom: `1px dotted ${TOW.goldDeep}`,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {name}
    </button>
  );
}

/** The "eye" that opens the rule/profile panel. The panel itself belongs to the container: this
 *  screen only says WHAT to show (`onShowInfo`) and never resolves a slug of its own. */
function Eye({ onClick, title }: { onClick: () => void; title: string }): React.JSX.Element {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={title} title={title} style={ICON_BTN}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="2.6" />
      </svg>
    </button>
  );
}

/** Model-count stepper. The spec pins the VISUAL size at 34 × 30 and the TOUCH TARGET at 44 × 44, so
 *  each button is a transparent 44 × 44 box wrapping the 34 × 30 face — no pseudo-elements needed,
 *  which inline styles cannot express anyway. Min/max are clamped twice: the button disables at the
 *  bound (so "min 10" reads as an explanation, not an error) and `setCount` clamps again on write. */
function Stepper({ value, min, max, onChange, dense, what = 'models' }: {
  value: number; min: number; max: number; onChange: (v: number) => void; dense?: boolean;
  /** What the number counts, for the buttons' accessible names — several steppers can share a screen
   *  (the unit's size, plus one per stackable option), and "More models" on all of them is ambiguous. */
  what?: string;
}): React.JSX.Element {
  const face = (off: boolean): React.CSSProperties => ({
    width: BUILDER.control.back, height: BUILDER.control.stepper, boxSizing: 'border-box',
    borderRadius: BUILDER.radius.chip, border: `1px solid ${off ? TOW.line : TOW.lineStrong}`,
    background: off ? 'transparent' : TOW.panel, color: off ? TOW.faint : TOW.inkDim,
    fontFamily: towFont.display, fontWeight: 700, fontSize: 16, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });
  const hit = (off: boolean): React.CSSProperties => ({
    // 44 × 44 is the TOUCH minimum, and that is what the phone gets. With a mouse the 34 × 30 face is
    // already the whole target, so the dense column stops paying 10px of empty height for reach.
    width: dense ? 34 : 44, height: dense ? 34 : 44, padding: 0, border: 'none', background: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: off ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent',
  });
  const atMin = value <= min;
  const atMax = value >= max;
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <button type="button" disabled={atMin} aria-label={`Fewer ${what}`} onClick={() => onChange(value - 1)} style={hit(atMin)}>
        <span style={face(atMin)}>−</span>
      </button>
      <span style={{
        minWidth: 30, textAlign: 'center', fontFamily: towFont.display, fontWeight: 700, fontSize: 15,
        color: TOW.ink, fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
      <button type="button" disabled={atMax} aria-label={`More ${what}`} onClick={() => onChange(value + 1)} style={hit(atMax)}>
        <span style={face(atMax)}>＋</span>
      </button>
    </div>
  );
}

// TWO DENSITIES, because this screen is shared. On a phone it IS the screen and every row is a tap
// target, so it keeps 46px rows and a 15.5 label. In the desktop inspector it is a 392px side column
// you scan while the roster stays visible, and at phone metrics it needed far too much scrolling for
// the amount of data on show. `dense` is passed only by DesktopShell; shrinking both would put 32px
// tap targets on a phone, which is below every platform's minimum.
const ROW_LABEL = (dense?: boolean): React.CSSProperties => ({
  // The option name is the one thing on this screen you read to make a decision, so it stays the
  // largest thing in the row even when dense.
  fontFamily: towFont.serif, fontWeight: 400, fontSize: dense ? 13 : 15.5, lineHeight: 1.25, color: TOW.ink,
});
const ROW_SUB = (dense?: boolean): React.CSSProperties => ({
  // One step less faint than it once was. At 10.5 in `faint` on the dark skin this was barely legible,
  // which is the worst of both: it took the space of information without delivering any.
  fontFamily: towFont.serif, fontWeight: 400, fontSize: dense ? 10.5 : 12, lineHeight: 1.25, color: TOW.muted,
});
const ROW_DELTA: React.CSSProperties = {
  fontFamily: towFont.serif, fontWeight: 400, fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0,
  fontVariantNumeric: 'tabular-nums',
};
const BTN_RESET: React.CSSProperties = {
  border: 'none', margin: 0, padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit',
  background: 'transparent', WebkitTapHighlightColor: 'transparent',
};

/**
 * One option row: indicator · label (+ optional second line) · delta, with the eye alongside.
 *
 * `blocked` dims the indicator and the label to 0.42 and shows `reason` in the accent — but the
 * PRICE keeps full contrast, because the whole point of showing a blocked item is that you can see
 * what it would cost. A chosen row that costs points gets the White row background.
 */
function OptionRow({ kind, on, label, sub, delta, deltaMuted, blocked, reason, onToggle, onInfo, infoTitle, dense }: {
  kind: 'radio' | 'toggle'; on: boolean; label: string; sub?: string;
  delta: string; deltaMuted?: boolean; blocked?: boolean; reason?: string;
  onToggle: () => void; onInfo?: () => void; infoTitle?: string; dense?: boolean;
}): React.JSX.Element {
  const dim = blocked ? { opacity: 0.42 } : undefined;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: dense ? 4 : 8, width: '100%',
      borderBottom: `1px solid ${HAIRLINE}`,
      background: on && !deltaMuted ? TOW.panel : 'transparent',
    }}>
      <button
        type="button"
        disabled={blocked}
        onClick={onToggle}
        aria-pressed={on}
        style={{
          // 46px on a phone, where the row IS the tap target. 32 in the desktop inspector, where it is
          // a 392px column read with a mouse beside a visible roster: at 46 that column showed very few
          // rows for its height and everything worth comparing was a scroll away.
          ...BTN_RESET, flex: 1, minWidth: 0,
          minHeight: dense ? 32 : 46, padding: dense ? '4px 0' : '9px 0',
          display: 'flex', alignItems: 'center', gap: dense ? 7 : 10, cursor: blocked ? 'default' : 'pointer',
        }}
      >
        <span style={dim}><Indicator kind={kind} on={on} /></span>
        <span style={{ ...dim, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={ROW_LABEL(dense)}>{label}</span>
          {/* One line, ellipsised. These sub-lines carry catalogue restriction text that can run to a
              full sentence ("0-1 Dark Elf Warriors or Repeater Crossbowman per 1000 points may
              purchase a magic standard"); left to wrap it doubled the row's height and made the group
              impossible to scan. The full text stays one tap away behind the eye. */}
          {sub ? <span style={{ ...ROW_SUB(dense), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span> : null}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
          <span style={{ ...ROW_DELTA, color: deltaMuted ? TOW.faint : TOW.inkDim }}>{delta}</span>
          {blocked && reason ? <span style={{ ...ROW_SUB(dense), color: TOW.gold, textAlign: 'right' }}>{reason}</span> : null}
        </span>
      </button>
      {onInfo ? <Eye onClick={onInfo} title={infoTitle ?? 'Show rule'} /> : null}
    </div>
  );
}

/** A `stackable` option: not "does this unit have it" but "how many models take it".
 *
 *  The army lists say "Any model in the unit may take ONE of the following: Additional hand weapon
 *  +3 points per model • Great weapon +4 points per model", so a unit can be mixed and the price
 *  follows the number of models taking each. A checkbox could not say that, and charged the price
 *  once for the whole unit — a five-strong Wardancer unit taking additional hand weapons paid 1
 *  point instead of 5. The stepper is the same control the unit's own size uses, so the number in
 *  the middle means the same thing in both places: models. */
function StackRow({ label, sub, each, count, max, onChange, onInfo, infoTitle, dense }: {
  label: string; sub?: string; each: string; count: number; max: number;
  onChange: (n: number) => void; onInfo?: () => void; infoTitle?: string; dense?: boolean;
}): React.JSX.Element {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: dense ? 4 : 8, width: '100%',
      borderBottom: `1px solid ${HAIRLINE}`,
      background: count > 0 ? TOW.panel : 'transparent',
      minHeight: dense ? 32 : 46, padding: dense ? '2px 0' : '4px 0',
    }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={ROW_LABEL(dense)}>{label}</span>
        {sub ? <span style={{ ...ROW_SUB(dense), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span> : null}
      </span>
      <span style={{ ...ROW_DELTA, color: count > 0 ? TOW.inkDim : TOW.faint, whiteSpace: 'nowrap' }}>{each}</span>
      <Stepper value={count} min={0} max={max} onChange={onChange} dense={dense} what="taking it" />
      {onInfo ? <Eye onClick={onInfo} title={infoTitle ?? 'Show rule'} /> : null}
    </div>
  );
}

/** The thin spend meter under a magic section's header. Only drawn for a FINITE budget — an
 *  unlimited section (`maxPoints: 0` in the data → Infinity) has nothing to draw against and must
 *  never render as "0 / 0". */
function SpendMeter({ spent, budget }: { spent: number; budget: number }): React.JSX.Element {
  const pct = Math.min(100, (spent / Math.max(budget, 1)) * 100);
  return (
    <div style={{ height: 3, borderRadius: BUILDER.radius.pill, background: TOW.line, overflow: 'hidden', marginBottom: 4 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: TOW.gold }} />
    </div>
  );
}

const Chevron = ({ open }: { open: boolean }): React.JSX.Element => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={TOW.muted} strokeWidth="2.6"
    style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none' }} aria-hidden="true">
    <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Promote — a character grows into the heavier version of itself
// ══════════════════════════════════════════════════════════════════════════════════════════════
// "Promotion or Death" (AJ: The Razing of Westerland p. 25) lets a character be replaced by its
// heavier counterpart between phases. The curated table of which-becomes-which and the whole re-map
// live in `src/lib/promotions.ts`; this is only the confirmation in front of it.
//
// The confirmation is not ceremony. A promotion is IRREVERSIBLE in one direction that matters — the
// options the heavier entry does not have are gone — and it moves points, sometimes past a limit. So
// the sheet states three things before you commit: what it costs, what does not carry over, and which
// rules the list would newly break. All three are computed, none are guessed.

/** The list validation messages a plan would ADD — the engine's own verdict on the hypothetical list,
 *  diffed against the one it gives today. Nothing is re-derived here. */
function newWarningsFor(ctx: BuilderCtx, next: ListEntry): string[] {
  const getUnit = (cat: Category, id: string) => ctx.getUnit(cat, id);
  const before = validate(ctx.list, getUnit, ctx.itemsData).warnings;
  const after = validate(
    { ...ctx.list, entries: ctx.list.entries.map((e) => (e.uid === next.uid ? next : e)) },
    getUnit, ctx.itemsData,
  ).warnings;
  const seen = new Map<string, number>();
  for (const w of before) seen.set(w, (seen.get(w) ?? 0) + 1);
  const out: string[] = [];
  for (const w of after) {
    const n = seen.get(w) ?? 0;
    if (n > 0) seen.set(w, n - 1); else out.push(w);
  }
  return out;
}

function PromoteSheet({ ctx, entry, from, to, onClose, onConfirm }: {
  ctx: BuilderCtx; entry: ListEntry; from: OwbUnit; to: OwbUnit;
  onClose: () => void; onConfirm: (next: ListEntry) => void;
}): React.JSX.Element {
  const plan = useMemo(
    () => planPromotion(from, to, entry, ctx.itemsData, ctx.armyItemLists),
    [from, to, entry, ctx.itemsData, ctx.armyItemLists],
  );
  const breaks = useMemo(() => newWarningsFor(ctx, plan.entry), [ctx, plan.entry]);
  const delta = plan.pointsAfter - plan.pointsBefore;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(30,20,8,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, maxHeight: '86%', overflowY: 'auto', boxSizing: 'border-box',
          background: TOW.panel, borderRadius: 16, border: `1px solid ${TOW.lineStrong}`,
          boxShadow: '0 16px 50px rgba(40,24,8,0.34)', padding: 16, animation: 'sheet-pop .18s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ ...eb, fontSize: 8, color: TOW.muted }}>Promotion</span>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', color: TOW.muted, fontSize: 18, lineHeight: 1 }}
          >×</button>
        </div>

        <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 18, color: TOW.ink, marginBottom: 4 }}>
          {cleanLabel(from.name_en)} → {cleanLabel(to.name_en)}
        </div>
        <div style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.muted, marginBottom: 12 }}>
          {entry.customName ? `${entry.customName} keeps ` : 'This character keeps '}
          the same identity: the campaign's XP, veteran abilities and battle scars follow the unit, not
          the datasheet. Unspent XP is lost.
        </div>

        {/* Points — the first thing you want, so it is the first thing shown. */}
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 11px', borderRadius: 10,
          border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, marginBottom: 10,
        }}>
          <span style={{ ...eb, fontSize: 7.5, color: TOW.muted }}>Points</span>
          <span style={{ marginLeft: 'auto', fontFamily: towFont.display, fontWeight: 700, fontSize: 15, color: TOW.ink, fontVariantNumeric: 'tabular-nums' }}>
            {fmt(plan.pointsBefore)} → {fmt(plan.pointsAfter)}
          </span>
          <span style={{ fontFamily: towFont.serif, fontSize: 12.5, color: delta > 0 ? TOW.gold : TOW.muted, fontVariantNumeric: 'tabular-nums' }}>
            {delta === 0 ? '±0' : `${delta > 0 ? '+' : '−'}${fmt(Math.abs(delta))}`}
          </span>
        </div>

        {plan.dropped.length > 0 ? (
          <div style={{ marginBottom: 10 }}>
            <div style={{ ...eb, fontSize: 7.5, color: TOW.muted, marginBottom: 3 }}>These options do not carry over</div>
            <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.ink, lineHeight: 1.4 }}>
              {plan.dropped.map(cleanLabel).join(' · ')}
            </div>
          </div>
        ) : null}

        {breaks.length > 0 ? (
          <div style={{
            marginBottom: 10, padding: '9px 11px', borderRadius: 10,
            border: `1px solid ${TOW.blood}`, background: 'rgba(140,32,24,0.08)',
          }}>
            <div style={{ ...eb, fontSize: 7.5, color: TOW.blood, marginBottom: 3 }}>After this promotion the list breaks</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontFamily: towFont.serif, fontSize: 12.5, color: TOW.ink, lineHeight: 1.45 }}>
              {breaks.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose} style={{ ...FOOT_BTN, flex: 1, borderColor: TOW.lineStrong, color: TOW.inkDim }}>
            Cancel
          </button>
          {/* Enabled even when the list would break: this app REPORTS limits, it does not block them
              (see the file header) — and half of promoting is deciding what to trim next. */}
          <button
            type="button"
            onClick={() => { onConfirm(plan.entry); onClose(); }}
            style={{ ...FOOT_BTN, flex: 1, borderColor: TOW.gold, color: TOW.gold }}
          >
            Promote
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// UnitOptions
// ══════════════════════════════════════════════════════════════════════════════════════════════

export function UnitOptions(props: {
  ctx: BuilderCtx;
  uid: string;                      // de te bewerken entry
  onBack: () => void;               // "‹ Roster" — edits zijn live, dus dit verwerpt niets
  onRemove: () => void;
  onDuplicate?: () => void;
  /** Opent het regel-/profielpaneel van de app. De container bezit de regeldata en de
   *  slug-resolutie; geef door wat je wilt tonen. */
  onShowInfo?: (what: { kind: 'rule'; name: string; slug?: string } | { kind: 'item'; itemId: string; name: string } | { kind: 'mount'; name: string } | { kind: 'lore'; slug: string }) => void;
  /** Tighter rows and smaller type, for the desktop inspector. The phone flow leaves it off: there this
   *  screen IS the screen and every row is a tap target. */
  dense?: boolean;
  /** Campagne: het puntenplafond van deze unit deze Act (debuutkosten + staffel × Acts). Undefined
   *  voor een nieuwe unit of een gewone lijst. */
  groeiMax?: number;
  /** Campagne: zoveel modellen had deze unit bij haar laatste inzending. Ze mag groeien maar nooit
   *  krimpen. Sinds 14-08-2026 is dat GEEN grens meer (minor adjustments), maar we gebruiken het nog
   *  om te melden dát je onder je vorige stand zit — dat kost namelijk van je 50-punten-budget. */
  groeiMinModellen?: number;
  /** Campagne: open de naam-dialoog voor deze unit. Alleen meegegeven voor een campagne-lijst, waar
   *  een eigen naam VERPLICHT is (de veteranen-identiteit hangt eraan). Ontbreekt hij, dan toont dit
   *  scherm geen naam-rij — een gewone lijst heeft er niets aan. */
  onNaam?: () => void;
}): React.JSX.Element {
  const { ctx, uid, onBack, onRemove, onDuplicate, onShowInfo, dense, onNaam, groeiMax, groeiMinModellen } = props;
  const { itemsData } = ctx;

  // ── hooks: all unconditional, before any early return ──────────────────────────────────────────
  const { lores } = useData();
  const fetchedStatIdx = useStatIndex();
  const statIdx = (ctx.statIdx as StatIndex | null | undefined) ?? fetchedStatIdx;
  const statsFor = useMemo(() => (unitName: string): StatRow[] => {
    if (!statIdx) return [];
    const key = normRule(unitName);
    let e = statIdx[key];
    if (!e?.stats?.length) {
      const w = key.split(' ');
      const last = w[w.length - 1];
      if (/s$/.test(last)) e = statIdx[[...w.slice(0, -1), last.replace(/s$/, '')].join(' ')];
    }
    return e?.stats ?? [];
  }, [statIdx]);
  const troopTypeFor = useMemo(() => makeTroopTypeLookup(statIdx), [statIdx]);
  /** Which of a multi-row profile (rank-and-file, champion, mount, crew…) the single strip shows. */
  const [profileIdx, setProfileIdx] = useState(0);
  /** Expanded magic categories, by `<uid>/<catId>` — same key shape as the old editor. */
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  /** The entry's points when this screen opened, for the footer's "This change" delta. Re-taken once
   *  if the baseline was captured before `itemsData` landed (otherwise every magic item on the entry
   *  would read as a change the user just made). */
  const baseline = useRef<{ pts: number; withItems: boolean } | null>(null);
  /** The promotion whose confirmation sheet is open, by target unit id. */
  const [promoteToId, setPromoteToId] = useState<string | null>(null);
  // This screen IS a layer: hardware/browser Back must return to the roster, not leave the app.
  useBackClose(true, onBack);

  const entry = ctx.list.entries.find((e) => e.uid === uid) ?? null;
  const unit = entry ? ctx.getUnit(entry.cat, entry.unitId) ?? null : null;

  // ── Promotion ──────────────────────────────────────────────────────────────────────────────────
  // CAMPAIGN LISTS ONLY (Joost, 11-08-2026). Promotion is the campaign's "Promotion or Death" move:
  // it spends the character's unspent XP and the campaign tracks the switch. On a plain list it did
  // nothing an ordinary swap could not do, and it muddied the builder — so the button lives only
  // where the rule does. The entry keeps its `uid` — which `planPromotion` guarantees and the write
  // below preserves, because it maps the entries in place instead of removing and re-adding.
  const promotions: PromotionTarget[] = useMemo(
    () => (unit && entry?.cat === 'characters' && ctx.list.campaign
      ? promotionTargets(ctx.list.army, unit, ctx.army?.characters ?? [])
      : []),
    [unit, entry?.cat, ctx.list.army, ctx.list.campaign, ctx.army],
  );
  const promoteTo = promotions.find((p) => p.unit.id === promoteToId)?.unit ?? null;
  /** Rewrite the entry IN PLACE. Same uid, same position — the campaign server reads this as the
   *  character it has been tracking all along, not as a new one with a fresh growth ceiling. */
  const applyPromotion = (next: ListEntry) =>
    ctx.update((l) => ({ entries: l.entries.map((e) => (e.uid === next.uid ? next : e)) }));

  // ── mutations — every one a FUNCTIONAL update that spreads the entry ────────────────────────────
  const patch = (fn: (e: ListEntry) => ListEntry) =>
    ctx.update((l) => ({ entries: l.entries.map((e) => (e.uid === uid ? fn(e) : e)) }));
  /** Clamped model count (same clamp as the old editor: unit minimum, `maximum: 0` = no maximum). */
  const setCount = (c: number) => ctx.update((l) => ({
    entries: l.entries.map((e) => {
      if (e.uid !== uid) return e;
      const u = ctx.getUnit(e.cat, e.unitId);
      // 14-08-2026: hier stond `Math.max(datasheet-minimum, campagne-ondergrens)` — de stepper liet je
      // niet ONDER het aantal van je vorige inzending komen. Die regel bestaat niet meer (minor
      // adjustments: tot 50 punten krimp per Act, over alle units samen), dus alleen het datasheet
      // begrenst nog. Het budget wordt gecontroleerd op lijstniveau, niet hier.
      const min = u?.minimum ?? 1;
      const max = (u?.maximum ?? 0) === 0 ? 9999 : (u?.maximum ?? 1);
      return { ...e, count: Math.max(min, Math.min(max, c)) };
    }),
  }));
  /** Plain toggle of a `<group>/<i>` key. */
  const toggleOpt = (key: string) =>
    patch((e) => ({ ...e, opts: e.opts.includes(key) ? e.opts.filter((k) => k !== key) : [...e.opts, key] }));
  /** Radio set within one group: drop this group's stored pick, store the new index. Deliberately
   *  only touches `<group>/…` keys — stale `subopt/<group>/…` of a no-longer-selected parent are
   *  ignored by the engine (it only looks at ACTIVE parents), exactly as before. */
  const setRadio = (group: string, i: number) =>
    patch((e) => ({ ...e, opts: [...e.opts.filter((k) => !k.startsWith(`${group}/`)), `${group}/${i}`] }));

  // ── stale / empty entry: render, never throw ────────────────────────────────────────────────────
  if (!entry || !unit) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: TOW.bg, color: TOW.ink, fontFamily: towFont.serif,
      }}>
        <div style={{ padding: `10px ${BUILDER.gutter}px`, borderBottom: `1px solid ${TOW.line}` }}>
          <BackButton onClick={onBack} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
          <span style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14, color: TOW.muted }}>
            {entry ? 'This unit is not in the current catalogue.' : 'This entry is no longer in the list.'}
          </span>
          {entry ? (
            <button type="button" onClick={onRemove} style={{ ...FOOT_BTN, borderColor: TOW.lineStrong, color: TOW.gold }}>Remove</button>
          ) : null}
        </div>
      </div>
    );
  }

  // ── derived, read-only ─────────────────────────────────────────────────────────────────────────
  const unitPoints = entryPoints(unit, entry, itemsData);
  if (baseline.current === null || (!baseline.current.withItems && itemsData)) {
    baseline.current = { pts: unitPoints, withItems: !!itemsData };
  }
  const change = unitPoints - baseline.current.pts;

  // Alleen het datasheet-minimum; de campagne-ondergrens is vervallen (zie setCount hierboven).
  const min = unit.minimum ?? 1;
  const rawMax = unit.maximum ?? 0;
  const max = rawMax === 0 ? 9999 : rawMax;
  /** A multi-model unit — the only kind with a count to change. A single-model character has no
   *  stepper (min = max = 1 would render two dead buttons). */
  const multiModel = (unit.maximum ?? 1) !== 1 || (unit.minimum ?? 1) > 1;
  const perModel = multiModel ? unit.points ?? 0 : null;

  const cap = ctx.list.points || 0;
  const listTotal = ctx.derived.totalPoints;
  const overCap = listTotal > cap;
  const segments: BudgetSegment[] = [];
  for (const t of ctx.derived.categoryTotals ?? []) {
    if (t.key === 'characters' || t.key === 'core' || t.key === 'special' || t.key === 'rare') {
      segments.push({ key: t.key, points: t.points });
    }
  }

  const effCat = unitCategoryFor(unit, ctx.list.composition, entry.cat);
  // De KOP is altijd het datasheet. De eigen naam van de speler staat in de naam-rij eronder, groot
  // genoeg om te lezen maar secundair: dit scherm gaat over wat de unit IS en wat je eraan verandert.
  const title = unit.name_en;
  // The troop type is pulled OUT of the joined eyebrow so it can be a link. It is not decoration: a
  // troop type is a bundle of rules (how it moves, how it fights, what it may join), each with its own
  // rulebook page — and every one of the 14 codes in `TROOP_TYPE_NAMES` resolves to one, mostly under a
  // plural title ("Behemoth" → Behemoths, "War Machine" → War Machines), which `resolveRuleSlug` already
  // handles via its singular/plural fallback.
  const unitTroopType = troopTypeFor(cleanLabel(unit.name_en));

  const selectedMount = unit.mounts?.[selectedMountIndex(unit, entry)];
  const mountModifiers = selectedMount?.name_en && !/^on foot$/i.test(selectedMount.name_en)
    ? mountStatModifiers(statsFor(cleanLabel(selectedMount.name_en)))
    : {};
  const profiles = applyMountStatModifiers(statsFor(cleanLabel(unit.name_en)), mountModifiers);
  const profile = profiles[Math.min(profileIdx, profiles.length - 1)];

  const blocks = unitBlocks(unit);
  const subGroups = subOptionGroups(unit, entry);
  /** Nested groups keyed by their parent slot so each renders directly under its parent row. */
  const subsByParent = new Map<string, typeof subGroups>();
  for (const g of subGroups) {
    const k = `${String(g.group)}/${g.parentIndex}`;
    subsByParent.set(k, [...(subsByParent.get(k) ?? []), g]);
  }
  // Magic items need `itemsData`; while it is undefined we simply render no magic section and touch
  // nothing in `opts`.
  const magicCats = itemsData
    ? magicCategories(unit, ctx.armyItemLists ?? [], itemsData, entry).filter((c) => c.items.length > 0)
    : [];
  /** One entry per shared points budget: all per-type categories of one section pool into it. */
  const magicGroups: { budgetGroup: string; groupLabel: string; cats: MagicCategory[] }[] = [];
  for (const c of magicCats) {
    let grp = magicGroups.find((x) => x.budgetGroup === c.budgetGroup);
    if (!grp) { grp = { budgetGroup: c.budgetGroup, groupLabel: c.groupLabel, cats: [] }; magicGroups.push(grp); }
    grp.cats.push(c);
  }
  // 25-08-2026: via allowedLores, want de catalogus-slug wijkt bij drie lores af van de
  // lore-data ('troll-magic' vs 'lore-of-troll-magic') en die vielen hier stil weg.
  const allowedLores = resolveLores(unit, lores);
  const specialRules = (unit.specialRules?.name_en || '').split(',').map((s) => s.trim()).filter(Boolean);

  // ── option rows ────────────────────────────────────────────────────────────────────────────────
  /** An option's cost as the spec's delta string. A per-model option ALWAYS carries the `/model`
   *  suffix. A cost-free option reads "included" once it is the chosen one — that covers the spec's
   *  case, the implicit free `active` default of a radio group (which has no key of its own) — and
   *  "free" while it is not, because "included" would otherwise claim a unit carries something it
   *  does not. */
  const deltaOf = (opt: OwbOption): { text: string; muted: boolean } => {
    const p = opt.points ?? 0;
    // A free option prints NOTHING. It used to say "free" or "included" — two words for one meaning,
    // on almost every row, so the column was full of text that carried no decision. Leaving it blank
    // means the eye only stops where there is actually a price to weigh.
    if (!p) return { text: '', muted: true };
    // "+1/model", not "+1 /model": the stray space read as two separate values.
    return { text: `+${fmt(p)}${opt.perModel ? '/model' : ''}`, muted: false };
  };
  const infoFor = (group: string, name: string) => onShowInfo
    ? () => onShowInfo(group === 'mounts' ? { kind: 'mount', name } : { kind: 'rule', name })
    : undefined;

  const optionRow = (group: string, i: number, opt: OwbOption, on: boolean, kind: 'radio' | 'toggle', onToggle: () => void) => {
    const d = deltaOf(opt);
    const label = cleanLabel(opt.name_en);
    // Second line: ONLY a mount's troop type — short, specific to that option, and genuinely useful
    // while choosing.
    //
    // The catalogue's restriction note used to go here too, and it was the single worst thing on the
    // screen: a full rules sentence ("0-1 Dark Elf Warriors or Repeater Crossbowman per 1000 points
    // may purchase a magic standard") under a two-word label, and OWB attaches the same sentence to
    // every option it covers — so Standard bearer and Veteran both carried it verbatim. Long, repeated,
    // and not what you are deciding at that moment.
    //
    // HONEST NOTE: this text is now shown NOWHERE. The eye resolves a rule by NAME and has no channel
    // for a per-option note, so calling it "behind the eye" would be wrong. The restriction is still
    // ENFORCED (validate() checks it) — only the prose is gone. If it should come back, it needs a real
    // home: an info panel that can take arbitrary text, not a second line on a list row.
    const sub = group === 'mounts' ? troopTypeFor(label) : undefined;

    // A stackable option is a COUNT of models, not a yes/no — see StackRow. Only top-level groups:
    // a nested sub-option keys as "subopt/<group>/<parent>" and none in the data is stackable, so
    // one there keeps the plain toggle rather than writing a count under a key nothing reads.
    if (opt.stackable && !group.includes('/')) {
      const key = `${group}/${i}`;
      const max = stackMax(unit, entry, opt);
      const now = stackTaken(unit, entry, key, opt);
      // Some of these come with their own floor ("Royal Host Warriors", minimum 10): taking it at all
      // means taking at least that many, so the first tap jumps there and stepping below it clears.
      const floor = Math.max(1, opt.minimum ?? 0);
      const capNote = (opt.maximum ?? 0) > 0 ? `max ${opt.maximum}` : undefined;
      return (
        <StackRow
          key={key}
          dense={dense}
          label={label}
          sub={capNote}
          each={d.text ? `${d.text} each` : ''}
          count={now}
          max={max}
          onChange={(v) => {
            const next = v > now ? Math.max(v, floor) : v < floor ? 0 : v;
            patch((e) => setStackCount(unit, e, key, opt, next));
          }}
          onInfo={infoFor(group, opt.name_en)}
          infoTitle={`About ${label}`}
        />
      );
    }
    return (
      <OptionRow
        dense={dense}
        key={`${group}/${i}`}
        kind={kind}
        on={on}
        label={label}
        sub={sub}
        delta={d.text}
        deltaMuted={d.muted}
        onToggle={onToggle}
        onInfo={infoFor(group, opt.name_en)}
        infoTitle={`About ${label}`}
      />
    );
  };

  /** A nested sub-option group under an ACTIVE parent (wizard levels, mount upgrades). `exclusive`
   *  children are one radio set, the rest are independent toggles — written with the engine's own
   *  pure helpers so the `subopt/…` key shape (and the legacy-key clean-up) stays theirs. */
  const subGroupBlock = (g: typeof subGroups[number]) => (
    <div
      key={`${String(g.group)}/${g.parentIndex}/${g.exclusive ? 'x' : 't'}`}
      style={{ marginLeft: 12, paddingLeft: 11, borderLeft: `1px solid ${TOW.line}` }}
    >
      {g.items.map(({ i, opt, selected }) => optionRow(
        `subopt/${String(g.group)}/${g.parentIndex}`, i, opt, selected, g.exclusive ? 'radio' : 'toggle',
        () => patch((e) => ({
          ...e,
          opts: g.exclusive
            ? setExclusiveSubOption(unit, e, g.group, g.parentIndex, i)
            : toggleSubOption(e, g.group, g.parentIndex, i),
        })),
      ))}
    </div>
  );

  /** The meta on a group's SectionHeader: "choose 1" for a radio group, "3 of 3 · +36" for toggles.
   *  The `+36` sums this group's chosen options with the SAME formula `entryPoints()` uses
   *  (`points × count` when `perModel`) — a display total for one section, not a second points
   *  engine: the authoritative unit total above and in the footer is `entryPoints()`. */
  const groupMeta = (b: typeof blocks[number]): string | undefined => {
    if (b.radio) return 'choose 1';
    const toggles = b.items.filter(({ opt }) => !opt.alwaysActive);
    if (!toggles.length) return undefined;
    const chosen = toggles.filter(({ i }) => entry.opts.includes(`${String(b.key)}/${i}`));
    const spent = chosen.reduce((n, { i, opt }) => {
      // Mirrors entryPoints(): stackable is priced by how many models take it, so this header must
      // read the count too — summing the bare price said "+1" over a row that was charging +5.
      const times = opt.stackable
        ? stackTaken(unit, entry, `${String(b.key)}/${i}`, opt)
        : opt.perModel ? entry.count : 1;
      return n + (opt.points ?? 0) * times;
    }, 0);
    return `${chosen.length} of ${toggles.length}${spent ? ` · +${fmt(spent)}` : ''}`;
  };

  // ── magic items ────────────────────────────────────────────────────────────────────────────────
  /** WORDING ONLY for an already-blocked row: `magicWouldExceed()` owns the verdict, this just says
   *  which of its three limits is the nearest explanation, in its order (item cap → one unique per
   *  category → shared points budget). Never used to decide whether something is blocked. */
  const blockReason = (cat: MagicCategory, item: MagicItem, budget: number): string => {
    const selected = selectedMagicKeys(entry, cat.id);
    if (isFinite(cat.maxItems)) {
      if (selected.length >= cat.maxItems) {
        return cat.maxItems === 1 ? 'Only one in this section' : `Only ${cat.maxItems} in this section`;
      }
    } else if (!item.common) {
      const uniqueTaken = selected.some((k) => {
        const id = k.split('/')[2];
        const it = cat.items.find((x) => magicItemId(x) === id);
        return !!it && !it.common;
      });
      if (uniqueTaken) return 'One unique item only';
    }
    return isFinite(budget) ? `Above this unit's ${fmt(budget)} pt limit` : 'Not available';
  };

  const magicItemRow = (cat: MagicCategory, item: MagicItem, budget: number) => {
    const key = `magic/${cat.id}/${magicItemId(item)}`;
    const on = entry.opts.includes(key);
    // The ONLY blocking rule on this screen, and it is the engine's: points budget, item cap and the
    // one-unique-plus-any-commons gate all live inside magicWouldExceed.
    const blocked = !on && magicWouldExceed(unit, entry, cat.id, item, itemsData!, { armyItemLists: ctx.armyItemLists });
    const pts = item.points ?? 0;
    // A single-pick category (Big Name, a magic standard) is mutually exclusive → radio. A
    // multi-pick one (normal magic items: one unique + any number of commons; Dwarf runes) → toggle.
    const kind: 'radio' | 'toggle' = cat.maxItems > 1 ? 'toggle' : 'radio';
    return (
      <OptionRow
        dense={dense}
        key={key}
        kind={kind}
        on={on}
        label={cleanLabel(item.name_en)}
        // Only the rare state earns a second line: `common` (multi-takeable) is the exception, while
        // "one per army" is true of nearly every item and would be noise on every row.
        sub={item.common ? 'Common — more than one model may carry it' : undefined}
        delta={pts ? `+${fmt(pts)}` : on ? 'included' : 'free'}
        deltaMuted={!pts}
        blocked={blocked}
        reason={blocked ? blockReason(cat, item, budget) : undefined}
        onToggle={() => patch((e) => ({ ...e, opts: toggleMagicItem(e, cat.id, item, cat.maxItems) }))}
        onInfo={onShowInfo ? () => onShowInfo({ kind: 'item', itemId: magicItemId(item), name: cleanLabel(item.name_en) }) : undefined}
        infoTitle={`About ${cleanLabel(item.name_en)}`}
      />
    );
  };

  /** One collapsible category inside a budget group. Default-collapsed, except an option-unlocked
   *  allowance with nothing picked yet (it only just appeared because of the player's action) —
   *  same rule as the old editor, so a magic standard opens the moment you take the standard bearer. */
  const magicCategoryBlock = (cat: MagicCategory, budget: number, soleInGroup: boolean) => {
    const catKey = `${entry.uid}/${cat.id}`;
    const selKeys = selectedMagicKeys(entry, cat.id);
    const chosen = cat.items
      .filter((it) => selKeys.includes(`magic/${cat.id}/${magicItemId(it)}`))
      .map((it) => cleanLabel(it.name_en));
    const toggled = openCats.has(catKey);
    const open = cat.budgetGroup.startsWith('opt:') && selKeys.length === 0 ? !toggled : toggled;
    const count = isFinite(cat.maxItems)
      ? (cat.maxItems > 1 ? `${selKeys.length}/${cat.maxItems}` : selKeys.length ? '1' : '')
      : (selKeys.length ? String(selKeys.length) : '');
    return (
      <div key={`magic/${cat.id}`}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpenCats((s) => { const n = new Set(s); if (n.has(catKey)) n.delete(catKey); else n.add(catKey); return n; })}
          style={{
            ...BTN_RESET, width: '100%', minHeight: 34, padding: '6px 0', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${HAIRLINE}`,
          }}
        >
          <Chevron open={open} />
          {/* A section with a single category (Big Name, Gifts of Khaine, a magic standard) already
              has its name in the header above, so the row states the choice on offer instead. */}
          <span style={{ ...eb, fontSize: 8, color: TOW.goldDeep, flexShrink: 0 }}>
            {soleInGroup && cleanLabel(cat.label) === cleanLabel(cat.groupLabel)
              ? `${cat.items.length} to choose from`
              : cat.label}
          </span>
          <span style={{
            flex: 1, minWidth: 0, fontFamily: towFont.serif, fontSize: 11.5, color: TOW.gold,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right',
          }}>{!open && chosen.length ? chosen.join(', ') : ''}</span>
          {count ? <span style={{ ...eb, fontSize: 7.5, color: TOW.faint, flexShrink: 0 }}>{count}</span> : null}
        </button>
        {open ? <div>{cat.items.map((item) => magicItemRow(cat, item, budget))}</div> : null}
      </div>
    );
  };

  // ── the lore of magic ──────────────────────────────────────────────────────────────────────────
  // A wizard knows ONE lore; the allowed lores come from the catalogue. The pick lives on
  // `entry.lores` (never in `opts`) and `spells` is reset with it, exactly as before — the game's
  // spell card reads both.
  const setLore = (slug: string, on: boolean) =>
    patch((e) => ({ ...e, lores: on ? [] : [slug], spells: [] }));


  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: TOW.bg, color: TOW.ink, fontFamily: towFont.serif, overflow: 'hidden',
    }}>
      {/* ── header ─────────────────────────────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, background: TOW.panel2, borderBottom: `1px solid ${TOW.lineStrong}` }}>
        {/* Army strip — list name, running budget bar, total. It is here because on a phone this screen
            covers the whole app and the budget would otherwise be out of sight while you spend points.
            In the desktop inspector the top bar shows all three of those things a few hundred pixels
            up, so here it is pure repetition and it is dropped: 21px of a 176px header, spent saying
            what the screen already says. */}
        {dense ? null : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, height: 8, boxSizing: 'content-box',
          padding: `6px ${BUILDER.gutter}px`, borderBottom: `1px solid ${TOW.line}`,
        }}>
          <span style={{
            ...eb, fontSize: 7.5, color: TOW.goldDeep, flexShrink: 0, maxWidth: 118,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{ctx.list.name}</span>
          <span style={{ flex: 1, minWidth: 30, display: 'flex' }}>
            <BudgetBar segments={segments} cap={cap} total={listTotal} height={4} />
          </span>
          <span style={{
            fontFamily: towFont.serif, fontSize: 10.5, color: overCap ? TOW.gold : TOW.faint,
            fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{fmt(listTotal)} / {fmt(cap)}</span>
        </div>
        )}

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: `9px ${BUILDER.gutter}px 0` }}>
          <BackButton onClick={onBack} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* The troop type sits in this line as a LINK, dotted-underlined so it reads as one. The
                surrounding parts (a renamed unit's real name, the list category) are not rules and stay
                plain text. */}
            <div style={{ ...eb, fontSize: 7.5, color: TOW.muted, marginBottom: 2 }}>
              {unitTroopType ? (
                <>
                  <TroopTypeLink name={unitTroopType} onShowInfo={onShowInfo} />
                  {' · '}
                </>
              ) : null}
              {CAT_LABEL[effCat]}
            </div>
            <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 15.5, lineHeight: 1.15, color: TOW.ink }}>
              {cleanLabel(title)}
            </div>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 5, justifyContent: 'flex-end',
              fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
            }}>
              <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 15, color: TOW.ink }}>
                {fmt(unitPoints)}
              </span>
              {/* The pending delta, moved up here from the pinned footer that used to hold it. Same
                  information, no 255px band: it sits beside the number it changes. */}
              {change !== 0 ? (
                <span style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.gold }}>
                  {change > 0 ? '+' : '−'}{fmt(Math.abs(change))}
                </span>
              ) : null}
            </div>
            <div style={{ fontFamily: towFont.serif, fontSize: 10.5, color: TOW.faint, whiteSpace: 'nowrap' }}>
              {perModel != null ? `${fmt(perModel)}/model` : 'points'}
            </div>
            {/* Campagne: het groeiplafond van deze unit. Altijd zichtbaar terwijl je opties aanzet —
                dat is precies het moment waarop je wilt weten hoeveel ruimte er nog is. */}
            {groeiMax != null ? (
              <div style={{
                fontFamily: towFont.serif, fontSize: 10.5, whiteSpace: 'nowrap', marginTop: 1,
                color: unitPoints > groeiMax ? TOW.blood : TOW.faint,
              }}>
                max {fmt(groeiMax)} this Act
              </div>
            ) : null}
          </div>
        </div>

        {/* Campagne — naam-rij. Staat BOVEN de count-rij en niet als icoontje in de kop: een eigen
            naam is waar je regiment z'n verhaal aan ophangt, dus 'm moeten zoeken zou raar zijn.
            Het is wél OPTIONEEL (02-08): de veteranen-identiteit hangt aan `entry.uid`, niet aan de
            naam, dus een naamloze unit is niets mis mee. Vandaar een uitnodiging, geen rode taak. */}
        {onNaam ? (
          <button
            type="button"
            onClick={onNaam}
            aria-label={entry.customName ? `Change the name of ${entry.customName}` : `Name this ${unit.name_en}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', boxSizing: 'border-box',
              margin: `0 ${BUILDER.gutter}px 10px`, width: `calc(100% - ${BUILDER.gutter * 2}px)`,
              padding: '9px 11px', borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${TOW.lineStrong}`,
              background: TOW.cardLt,
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...eb, fontSize: 7.5, color: TOW.muted, display: 'block' }}>
                {entry.cat === 'characters' ? 'Character name' : 'Regiment name'}
              </span>
              <span style={{
                fontFamily: towFont.serif, fontSize: 13.5, color: entry.customName ? TOW.ink : TOW.faint,
                display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {entry.customName || 'Unnamed — optional'}
              </span>
            </span>
            <span style={{ ...eb, fontSize: 7.5, color: TOW.goldDeep, flexShrink: 0 }}>
              {entry.customName ? 'Change' : 'Name it'}
            </span>
          </button>
        ) : null}

        {/* Promote — only for a character the curated table actually has a path for, so most units
            never see this row at all. It sits up here with the identity of the unit rather than down
            with Duplicate/Remove: a promotion is not an edit to the loadout, it is a change of who
            this character IS, and the loadout follows from it. */}
        {promotions.map(({ unit: target, path }) => {
          const delta = (target.points ?? 0) - (unit.points ?? 0);
          return (
            <button
              key={target.id}
              type="button"
              onClick={() => setPromoteToId(target.id)}
              aria-label={`Promote ${entry.customName || unit.name_en} to ${cleanLabel(target.name_en)}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', boxSizing: 'border-box',
                margin: `0 ${BUILDER.gutter}px 10px`, width: `calc(100% - ${BUILDER.gutter * 2}px)`,
                padding: '9px 11px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...eb, fontSize: 7.5, color: TOW.muted, display: 'block' }}>
                  {/* A `likely` path is one this campaign's research graded as thematic rather than
                      certain (a Herald becoming a Greater Daemon). Saying so is cheaper than a
                      footnote nobody reads. */}
                  Promotion{path.confidence === 'likely' ? ' · thematic' : ''}
                </span>
                <span style={{
                  fontFamily: towFont.serif, fontSize: 13.5, color: TOW.ink,
                  display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  Become {cleanLabel(target.name_en)}
                </span>
              </span>
              <span style={{
                ...eb, fontSize: 7.5, color: TOW.goldDeep, flexShrink: 0, fontVariantNumeric: 'tabular-nums',
              }}>
                {/* The BASE difference, which is what the catalogue can promise before the loadout is
                    re-mapped. The exact figure for THIS entry is on the confirmation. */}
                {delta >= 0 ? `+${fmt(delta)}` : `−${fmt(-delta)}`} base
              </span>
            </button>
          );
        })}

        {/* Count row — only a multi-model unit has a count to change. */}
        {multiModel ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `0 ${BUILDER.gutter}px` }}>
            <Stepper value={entry.count} min={min} max={max} onChange={setCount} dense={dense} />
            <span style={{ fontFamily: towFont.serif, fontSize: 11, color: TOW.faint }}>
              min {min}{rawMax > 0 ? ` · max ${rawMax}` : ''}
              {/* Krimpen mag sinds 14-08-2026, binnen 50 punten per Act over al je bestaande units.
                  Dus geen verbod meer, maar een herinnering dát het van je budget gaat — het bedrag
                  zelf hoort op lijstniveau thuis, want daar wordt het opgeteld. */}
              {groeiMinModellen != null && entry.count < groeiMinModellen
                ? <span style={{ color: TOW.gold }}> · smaller than last Act</span>
                : null}
            </span>
          </div>
        ) : null}

        {/* Statline — one strip. A profile with several rows (champion, mount, crew) gets a selector;
            the strip itself always shows exactly one row. */}
        {profile ? (
          <div style={{ padding: `4px ${BUILDER.gutter}px 7px` }}>
            {profiles.length > 1 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 5 }}>
                {profiles.map((r, i) => {
                  const on = i === Math.min(profileIdx, profiles.length - 1);
                  return (
                    <button
                      key={`${r.Name}-${i}`}
                      type="button"
                      onClick={() => setProfileIdx(i)}
                      style={{
                        ...BTN_RESET, cursor: 'pointer', padding: '2px 8px', minHeight: 22,
                        borderRadius: BUILDER.radius.pill, border: `1px solid ${on ? TOW.gold : TOW.line}`,
                        color: on ? TOW.gold : TOW.muted, fontFamily: towFont.serif, fontSize: 10.5,
                      }}
                    >{cleanLabel(r.Name)}</button>
                  );
                })}
              </div>
            ) : null}
            <StatStrip
              stats={STAT_COLS.map((k) => ({
                label: k,
                value: profile[k] && profile[k] !== '0' ? profile[k]! : '–',
                modified: !!mountModifiers[k],
                title: mountModifiers[k]
                  ? `${mountModifiers[k] > 0 ? '+' : ''}${mountModifiers[k]} from ${cleanLabel(selectedMount?.name_en ?? 'mount')}`
                  : undefined,
              }))}
              save={profile.Sv}
            />
          </div>
        ) : null}
      </div>

      {/* ── body ───────────────────────────────────────────────────────────────────────────────── */}
      <div
        data-tour="unit-opties"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: `0 ${BUILDER.gutter}px 20px` }}
      >
        {blocks.map((b) => {
          const radioKey = b.radio ? radioSelected(unit, entry, b.key) : '';
          return (
            <div key={String(b.key)}>
              <SectionHeader label={b.label} meta={groupMeta(b)} dense />
              {b.items.map(({ i, opt }) => {
                const key = `${String(b.key)}/${i}`;
                const on = b.radio ? radioKey === key : entry.opts.includes(key);
                const nested = subsByParent.get(key) ?? [];
                // An `alwaysActive` parent is a free base you cannot switch off — it is a HEADING for
                // its children ("Wizard" above the Level radio), not a choice of its own.
                if (opt.alwaysActive) {
                  return (
                    <div key={key}>
                      <div style={{ ...eb, fontSize: 7.5, color: TOW.muted, padding: '7px 0 3px' }}>{cleanLabel(opt.name_en)}</div>
                      {nested.map(subGroupBlock)}
                    </div>
                  );
                }
                return (
                  <div key={key}>
                    {optionRow(String(b.key), i, opt, on, b.radio ? 'radio' : 'toggle',
                      () => (b.radio ? setRadio(String(b.key), i) : toggleOpt(key)))}
                    {nested.map(subGroupBlock)}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Magic items — one header per SHARED budget (a section's per-type categories pool into it),
            then a collapsible category per kind. `maxPoints: 0` in the data means UNLIMITED and must
            read "no limit"; rendering it as 0/0 would disable every item (that was a real bug). */}
        {magicGroups.map((group) => {
          const budget = group.cats[0].maxPoints ?? DEFAULT_MAGIC_BUDGET;
          const unlimited = !isFinite(budget);
          const spent = magicGroupSpent(unit, entry, group.budgetGroup, itemsData!, ctx.armyItemLists);
          const over = !unlimited && spent > budget;
          const meta = unlimited
            ? (spent > 0 ? `${fmt(spent)} pt · no limit` : 'no limit')
            : `${fmt(spent)} / ${fmt(budget)} pt`;
          return (
            <div key={group.budgetGroup}>
              <SectionHeader label={group.groupLabel} meta={meta} violated={over} dense />
              {unlimited ? null : <SpendMeter spent={spent} budget={budget} />}
              {group.cats.map((cat) => magicCategoryBlock(cat, budget, group.cats.length === 1))}
            </div>
          );
        })}

        {/* Lore of Magic — a wizard knows one lore; its spells are listed once chosen. */}
        {allowedLores.length > 0 ? (
          <div>
            <SectionHeader label="Lore of Magic" meta="choose 1" dense />
            {allowedLores.map((slug) => {
              const lore = lores[slug];
              const on = (entry.lores ?? []).includes(slug);
              const spells = lore.spells ?? [];
              return (
                <div key={slug}>
                  <OptionRow
                    dense={dense}
                    kind="radio"
                    on={on}
                    label={lore.name}
                    sub={`${spells.length} spell${spells.length === 1 ? '' : 's'}`}
                    delta="included"
                    deltaMuted
                    onToggle={() => setLore(slug, on)}
                    onInfo={onShowInfo ? () => onShowInfo({ kind: 'lore', slug }) : undefined}
                    infoTitle={`About ${lore.name}`}
                  />
                  {on && spells.length > 0 ? (
                    <div style={{ marginLeft: 25, paddingLeft: 11, borderLeft: `1px solid ${TOW.line}` }}>
                      {spells.map((sp) => (
                        <button
                          key={sp.slug}
                          type="button"
                          // Mét slug: een spreuknaam kan ook een gewone special rule zijn ("Storm
                          // Call" is allebei), en opzoeken op naam koos dan de verkeerde pagina.
                          onClick={() => onShowInfo?.({ kind: 'rule', name: sp.name, slug: sp.slug })}
                          style={{
                            ...BTN_RESET, width: '100%', minHeight: 26, cursor: onShowInfo ? 'pointer' : 'default',
                            display: 'flex', alignItems: 'baseline', gap: 9, padding: '3px 0',
                          }}
                        >
                          <span style={{ ...eb, fontSize: 8, color: TOW.gold, minWidth: 11, textAlign: 'center', flexShrink: 0 }}>
                            {sp.signature ? '✦' : sp.number}
                          </span>
                          <span style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.goldDeep }}>{sp.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Special rules — not editable; a wrapping chip row. Each chip still opens its rule. */}
        {specialRules.length > 0 ? (
          <div>
            <SectionHeader label="Special rules" dense />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingTop: 2 }}>
              {specialRules.map((r, i) => {
                const label = cleanLabel(r);
                const chip: React.CSSProperties = {
                  fontFamily: towFont.serif, fontSize: 11.5, padding: '3px 10px',
                  borderRadius: BUILDER.radius.pill, border: `1px solid ${TOW.line}`, color: TOW.inkDim,
                };
                return onShowInfo ? (
                  <button key={i} type="button" onClick={() => onShowInfo({ kind: 'rule', name: r })}
                    style={{ ...BTN_RESET, ...chip, cursor: 'pointer' }}>{label}</button>
                ) : (
                  <span key={i} style={chip}>{label}</span>
                );
              })}
            </div>
          </div>
        ) : null}

        {blocks.length === 0 && magicGroups.length === 0 && allowedLores.length === 0 ? (
          <div style={{ padding: '18px 0', fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 13, color: TOW.muted }}>
            No further upgrades — this unit's wargear is fixed.
          </div>
        ) : null}

        {/* Unit actions, at the END OF THE SCROLL — deliberately not a fixed footer.
            There used to be a pinned bar here with the unit's points, a "This change: +15 points" line
            and Duplicate / Remove / Done. On a phone it claimed ~255px permanently, a quarter of the
            usable height, to hold: a total that the header already shows, and a "Done" that does
            nothing — edits are live and "‹ Roster" is the way back. So the bar is gone and the two
            real actions scroll away with the content, reachable when you look for them. */}
        <div style={{
          display: 'flex', gap: 16, alignItems: 'center',
          marginTop: 22, paddingTop: 12, borderTop: `1px solid ${TOW.line}`,
        }}>
          {onDuplicate ? (
            <button type="button" onClick={onDuplicate} style={{ ...BTN_RESET, ...TEXT_ACTION }}>Duplicate unit</button>
          ) : null}
          <button type="button" onClick={onRemove} style={{ ...BTN_RESET, ...TEXT_ACTION, color: TOW.gold }}>
            Remove from list
          </button>
        </div>
      </div>

      {promoteTo ? (
        <PromoteSheet
          ctx={ctx}
          entry={entry}
          from={unit}
          to={promoteTo}
          onClose={() => setPromoteToId(null)}
          onConfirm={applyPromotion}
        />
      ) : null}
    </div>
  );
}

/** A quiet text action. The two unit actions are not primary buttons: you come to this screen to
 *  choose equipment, and framing "Remove from list" like a call to action gave it a weight it has not
 *  earned — and put a destructive control under your thumb. */
const TEXT_ACTION: React.CSSProperties = {
  minHeight: 40, display: 'flex', alignItems: 'center', cursor: 'pointer',
  fontFamily: towFont.serif, fontSize: 13.5, color: TOW.muted, textDecoration: 'underline',
  textDecorationColor: TOW.line, textUnderlineOffset: 3,
};

// ─────────────────────────── footer / back chrome ───────────────────────────
const FOOT_BTN: React.CSSProperties = {
  height: BUILDER.control.primary, boxSizing: 'border-box', padding: '0 14px',
  borderRadius: BUILDER.radius.button, border: `1px solid ${TOW.lineStrong}`, background: 'transparent',
  color: TOW.inkDim, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5,
  letterSpacing: '0.04em', display: 'flex', alignItems: 'center', justifyContent: 'center',
  WebkitTapHighlightColor: 'transparent',
};

/** "‹ Roster". Edits are live, so this discards nothing — it is navigation, not a cancel. */
function BackButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button type="button" onClick={onClick} aria-label="Back to roster" style={{
      ...BTN_RESET, flexShrink: 0, height: BUILDER.control.back, minWidth: 44, padding: '0 9px',
      borderRadius: BUILDER.radius.button, border: `1px solid ${TOW.line}`, background: TOW.panel,
      color: TOW.inkDim, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>‹ Roster</button>
  );
}
