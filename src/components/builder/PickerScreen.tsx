// Army-builder REDESIGN — phone screen 2a, the "Add unit" picker.
//
// PRESENTATION ONLY. Every number on this screen is read from `ctx.derived` or from a prebuilt
// `PickerEntry`; the screen never totals points, never touches `entry.opts` and never writes to the
// list. Adding goes out through `onAdd` / `onConfigure` so the container keeps the single mutation
// path (`BuilderCtx.update`) — see types.ts.
//
// Measurements are the spec's values at a 390pt viewport (px = pt 1:1):
//   header 118 · search 36 · chip 26 · row 44 (BUILDER.rowH) · footer 63 (BUILDER.footerH).
// Colours come exclusively from `src/design/tow.ts` plus HAIRLINE from primitives.tsx. Remember that
// the legacy token names lie: TOW.gold IS the spec's Blood (#9c2b2b), TOW.goldDeep its dark variant,
// TOW.panel = White, TOW.panel2 = Raised, TOW.bg = Parchment. No new colour tokens are introduced.
//
// GUTTER — the primitives carry no horizontal padding (see their header comment), so this screen owns
// `BUILDER.gutter` (14px) on the header, the scroller and the footer. That is what makes the section
// header's label, every row's name and the footer's text share one left edge.

import { useMemo, useState } from 'react';
import { BUILDER, fmt, HAIRLINE, SectionHeader } from './primitives';
import type { BuilderCtx, PickerEntry } from './types';
import { CATEGORIES, unitAllowedIn, type Category, type OwbUnit } from '../../lib/owbBuilder';
import { TOW, towFont, engraved } from '../../design/tow';

const eb = engraved as React.CSSProperties; // Cinzel 600 · uppercase · letterSpacing .22em

/** Numbers go through the app-wide formatter (thin-space thousands separator).
 *
 *  The spec is internally inconsistent here: its RENDERED roster frame typesets four digits as
 *  "1 998" / "of 2 000", while its picker ANNOTATION prose writes "560 / max 1000" and
 *  "+210 · 122 left" unseparated. Resolved in favour of the frames — typeset design is the authority
 *  on typography, annotation prose is not — so one app prints numbers exactly one way. Seeing
 *  "of 2 000" on one screen and "max 1000" on the next is the kind of seam a reader notices. */
const n = fmt;

/** The four chips the spec draws. A `Category` outside this set (mercenaries/allies, reachable via
 *  `initialCategory`) gets an extra chip appended at runtime — a filter the chip row cannot express
 *  would trap the user with no way back to "All". */
const SPEC_CHIPS: readonly Category[] = ['characters', 'core', 'special', 'rare'];
const CHIP_LABEL: Record<Category, string> = {
  characters: 'Chr', core: 'Core', special: 'Spec', rare: 'Rare', mercenaries: 'Merc', allies: 'Allies',
};
const SECTION_LABEL: Record<Category, string> = {
  characters: 'Characters', core: 'Core', special: 'Special', rare: 'Rare',
  mercenaries: 'Mercenaries', allies: 'Allies',
};

/** `'all'` is a UI-only value; it is never stored and never reaches `onAdd`. */
export type PickerCategoryFilter = Category | 'all';

// ─────────────────────────── affordability ───────────────────────────
/**
 * Does adding this entry right now stay inside the remaining points?
 *
 * Two sources agree here on purpose: the container's precomputed `unaffordable` flag AND a fresh
 * comparison against `ctx.derived.remainingPoints`. An entry counts as fitting only when BOTH say so,
 * so the two can never disagree in the permissive direction (a stale flag can't make an unaffordable
 * unit look affordable). It also makes the over-cap case fall out for free: once `remainingPoints` is
 * negative NOTHING fits, which is exactly right — the list is already past its target.
 */
const entryFits = (e: PickerEntry, remaining: number): boolean =>
  !e.unaffordable && e.addCost <= remaining;

// ─────────────────────────── search ───────────────────────────
/** The catalogue stores a unit's rules as ONE comma-joined string (`specialRules.name_en` =
 *  "Close Order, Elven Reflexes, Hatred (High Elves), …"), so a rule search splits it first: a query
 *  must match inside a single rule name, not across the join. */
const ruleNames = (unit: OwbUnit): string[] =>
  (unit.specialRules?.name_en ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Case-insensitive substring match on the unit name OR on any one special-rule name. */
function matchesQuery(unit: OwbUnit, q: string): boolean {
  if ((unit.name_en ?? '').toLowerCase().includes(q)) return true;
  return ruleNames(unit).some((r) => r.toLowerCase().includes(q));
}

// ─────────────────────────── the visibility filter ───────────────────────────
/**
 * Which entries the picker shows, in the container's original order.
 *
 * Order of the gates matters for the empty states: category → Fits → query, so "no match" always
 * means "no match *within* the active chip", which is what the spec asks for.
 *
 * `unitAllowedIn` is re-checked here even though the container is expected to have filtered already:
 * a unit the chosen army composition does not offer must never be reachable, and this is the cheap
 * belt-and-braces version of that (a unit without an `armyComposition` map is always allowed, so for
 * catalogues that don't use compositions this is a no-op).
 *
 * Exported as a pure function so the filter can be exercised on its own — the states it produces
 * (empty search, "Fits ✓" with nothing affordable) are otherwise only reachable by interaction.
 */
export function filterPickerEntries(entries: readonly PickerEntry[], opts: {
  composition: string;
  category: PickerCategoryFilter;
  query: string;
  remaining: number;
  fitsOnly: boolean;
}): PickerEntry[] {
  const q = opts.query.trim().toLowerCase();
  return (entries ?? []).filter((e) => {
    if (!e || !e.unit) return false;
    if (!unitAllowedIn(e.unit, opts.composition)) return false;
    if (opts.category !== 'all' && e.displayCat !== opts.category) return false;
    if (opts.fitsOnly && !entryFits(e, opts.remaining)) return false;
    if (q && !matchesQuery(e.unit, q)) return false;
    return true;
  });
}

// ─────────────────────────── absolute category limits ───────────────────────────
/** "max 50%" / "min 25%" — the shape `builderDerived.CategoryTotal.rule` produces. */
const RULE_RE = /^(max|min)\s+([0-9]+(?:\.[0-9]+)?)\s*%$/i;

/**
 * The percentage rule as an ABSOLUTE points figure, because the picker's section meta prints points
 * ("560 / max 1000") where the roster prints percentages.
 *
 * The rounding MIRRORS `validate()` in owbBuilder.ts exactly — `cap = Math.floor(pct × target)` for a
 * maximum, `floor = Math.ceil(pct × target)` for a minimum — so the number shown here is the very
 * threshold the engine tests against, and `CategoryTotal.ok` can never contradict it. This is a
 * re-expression of validate()'s own arithmetic, not a second opinion about it.
 *
 * Returns null when there is no rule or no points target: with `target <= 0` every percentage
 * collapses to 0 and `builderDerived` already suppresses the percentage verdicts, so printing
 * "/ max 0" would be noise.
 */
function absoluteLimit(rule: string, target: number): { kind: 'max' | 'min'; points: number } | null {
  if (!(target > 0)) return null;
  const m = RULE_RE.exec((rule ?? '').trim());
  if (!m) return null;
  const pct = Number(m[2]);
  if (!Number.isFinite(pct)) return null;
  const kind = m[1].toLowerCase() === 'max' ? 'max' : 'min';
  return { kind, points: kind === 'max' ? Math.floor((pct / 100) * target) : Math.ceil((pct / 100) * target) };
}

// ─────────────────────────── small building blocks ───────────────────────────
function Chip({ label, active, onClick, style }: {
  label: string; active: boolean; onClick: () => void; style?: React.CSSProperties;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        height: BUILDER.control.chip, flexShrink: 0, padding: '0 9px',
        borderRadius: BUILDER.radius.chip, boxSizing: 'border-box', cursor: 'pointer',
        border: `1px solid ${active ? TOW.gold : TOW.lineStrong}`,
        background: active ? TOW.gold : 'transparent',
        color: active ? TOW.onGrad : TOW.muted,
        fontFamily: towFont.display, fontWeight: active ? 700 : 600, fontSize: 10.5,
        letterSpacing: '0.06em', whiteSpace: 'nowrap',
        display: 'inline-flex', alignItems: 'center',
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
    >
      {label}
    </button>
  );
}

function EmptyState({ line, hint }: { line: string; hint?: string }): React.JSX.Element {
  return (
    <div style={{ padding: '34px 4px 40px', textAlign: 'center' }}>
      <div style={{ fontFamily: towFont.serif, fontSize: 13, color: TOW.muted, lineHeight: 1.45 }}>{line}</div>
      {hint ? (
        <div style={{ fontFamily: towFont.serif, fontSize: 11, color: TOW.faint, marginTop: 6, lineHeight: 1.45 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────── the entry row ───────────────────────────
/**
 * One catalogue entry: name (+ "· N in roster"), a whisper line, and the ＋ button.
 *
 * It is NOT `UnitRow`/`CompactRow`: UnitRow's trailing cell is points-only and CompactRow is a single
 * 30px line, while this row needs two lines AND an interactive trailing control. It deliberately
 * reuses their geometry though — 44px tall, 7px vertical padding, hairline inside the box, the same
 * 3px inset selection rail — so a picker list and a roster list keep one rhythm.
 *
 * Two things differ from UnitRow on purpose:
 *  • the element is a <div role="button">, not a <button>: a <button> inside a <button> is invalid
 *    HTML and browsers actually break the nesting, which would cost the ＋ its own hit area;
 *  • there is NO `overflow: hidden` on the row. UnitRow can afford it; here it would clip the ＋
 *    button's 44px target back to the row's 30px content box — and a clipped region is not hittable,
 *    so the spec's 44×44 requirement would silently evaporate. Ellipsising is done by the name span.
 */
function EntryRow({ entry, fits, remaining, selected, onSelect, onAdd }: {
  entry: PickerEntry; fits: boolean; remaining: number; selected: boolean; onSelect: () => void; onAdd: () => void;
}): React.JSX.Element {
  const name = entry.unit.name_en ?? entry.unit.id;

  // Affordable: "Regular Infantry · min 10 · 7 pt/model" — or "Monster · 1 model · 180 pt" for a
  // unit that is priced flat rather than per model. The composition's restriction note rides along at
  // the end; it is the only place it can be shown, and dropping it would hide a real restriction.
  // Unaffordable: the spec REPLACES the whisper with the reason, in the accent colour.
  const size = entry.perModel != null
    ? `min ${n(entry.minSize)}`
    : `${n(entry.minSize)} model${entry.minSize === 1 ? '' : 's'}`;
  const cost = entry.perModel != null ? `${n(entry.perModel)} pt/model` : `${n(entry.addCost)} pt`;
  // The over-budget line ADDS to the facts instead of replacing them. It used to swap the whole whisper
  // for "exceeds remaining points", which threw away the troop type, the unit size and the per-model
  // cost — exactly what you need to decide whether to take it anyway.
  const whisper = [entry.troopType, size, cost, entry.note].filter(Boolean).join(' · ')
    // Once the list is ALREADY over, "how much over" is simply the unit's whole price, and printing it
    // twice on one line ("150 pt · 150 pt over") is noise. Then the note only has to say the state.
    + (fits ? '' : remaining > 0 ? ` · ${n(entry.addCost - remaining)} pt over` : ' · over budget');

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(); }
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        height: BUILDER.rowH, boxSizing: 'border-box', padding: '7px 0', width: '100%',
        background: selected ? TOW.panel : 'transparent',
        borderBottom: `1px solid ${HAIRLINE}`,
        boxShadow: selected ? `inset 3px 0 0 ${TOW.gold}` : 'none',
        // Over budget is REPORTED, never enforced: the row dims and states the reason, but it stays
        // fully interactive — no `disabled`, no `pointerEvents: none`.
        cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
          <span
            style={{
              fontFamily: towFont.serif, fontWeight: 400, fontSize: 14.5, lineHeight: 1.25, color: TOW.ink,
              // minWidth:0 is what actually lets a flex child shrink far enough for the ellipsis.
              flex: '0 1 auto', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {name}
          </span>
          {entry.inRoster > 0 ? (
            // Outside the ellipsising span and never shrinking: with a very long name the NAME
            // truncates, not the count — the count is the thing you are scanning for.
            <span
              style={{
                fontFamily: towFont.serif, fontSize: 11.5, lineHeight: 1.25, color: TOW.faint,
                flex: '0 0 auto', paddingLeft: 5, whiteSpace: 'nowrap',
              }}
            >
              · {n(entry.inRoster)} in roster
            </span>
          ) : null}
        </span>
        <span
          style={{
            fontFamily: towFont.serif, fontWeight: 400, fontSize: 11, lineHeight: 1.3,
            color: fits ? TOW.faint : TOW.gold,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {whisper}
        </span>
      </span>

      <button
        type="button"
        aria-label={`Add ${name}`}
        onClick={(ev) => { ev.stopPropagation(); onAdd(); }}
        style={{
          // 44×44 TOUCH TARGET, 30×28 of ink. The <button> itself IS the target; the visible box is an
          // inner span, so the target size is not a layout dimension and cannot push anything around.
          // `marginRight: -7` spends the horizontal slack in the screen gutter instead of the row, so
          // the visible border still lines up with the row's right edge; vertically nothing is needed
          // because the row's own fixed 44px height already contains the target exactly.
          width: 44, height: 44, marginRight: -7, flexShrink: 0, padding: 0,
          border: 'none', background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span
          style={{
            width: 30, height: 28, boxSizing: 'border-box',
            borderRadius: BUILDER.radius.chip, border: `1px solid ${TOW.lineStrong}`,
            background: TOW.panel2, color: TOW.goldDeep,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: towFont.serif, fontSize: 15, lineHeight: 1,
          }}
        >
          ＋
        </span>
      </button>
    </div>
  );
}

// ═══════════════════════════ the screen ═══════════════════════════
export function PickerScreen(props: {
  ctx: BuilderCtx;
  /** Already built by the container — including `inRoster`, `addCost`, `unaffordable`, `troopType`
   *  and `note`. This screen only filters, groups and selects. */
  entries: PickerEntry[];
  /** Preselected chip, e.g. from a category chip in the roster footer. Read once, at mount. */
  initialCategory?: Category;
  onBack: () => void;
  /** Adds at minimum size. Always called with `entry.cat` — the STORED base category. */
  onAdd: (unit: OwbUnit, cat: Category) => void;
  /** "Options": configure the unit BEFORE it is added. Also `entry.cat`. */
  onConfigure: (unit: OwbUnit, cat: Category) => void;
  /** Campagne-units die eerder in je lijst stonden en er nu NIET meer in zitten (14-08-2026). Leeg bij
   *  een gewone lijst. Zie `restoreUnit` in BuilderFlow: terugzetten behoudt de oorspronkelijke uid en
   *  daarmee de campagne-identiteit — opnieuw toevoegen zou een ander regiment opleveren. */
  terugTeHalen?: { uid: string; unitId: string; cat: string; modellen: number | null; label: string; sub: string | null }[];
  onRestore?: (b: { uid: string; unitId: string; cat: string; modellen: number | null }) => void;
}): React.JSX.Element {
  const { ctx, entries, initialCategory, onBack, onAdd, onConfigure, terugTeHalen = [], onRestore } = props;

  const [category, setCategory] = useState<PickerCategoryFilter>(initialCategory ?? 'all');
  const [query, setQuery] = useState('');
  const [fitsOnly, setFitsOnly] = useState(false);
  /** `${cat}/${unitId}` of the selected row — an id, not the object, so it survives a re-render with
   *  a rebuilt `entries` array (the container rebuilds it whenever the list changes). */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const remaining = ctx.derived.remainingPoints;
  const target = ctx.list.points;
  const composition = ctx.list.composition;
  const searching = query.trim().length > 0;

  const visible = useMemo(
    () => filterPickerEntries(entries, { composition, category, query, remaining, fitsOnly }),
    [entries, composition, category, query, remaining, fitsOnly],
  );

  // Grouped for display by `displayCat` (the category under this composition), in the fixed
  // CATEGORIES order — which keeps mercenaries/allies at the end instead of dropping them.
  const groups = useMemo(() => {
    const by = new Map<Category, PickerEntry[]>();
    for (const e of visible) {
      const list = by.get(e.displayCat);
      if (list) list.push(e); else by.set(e.displayCat, [e]);
    }
    return CATEGORIES.filter((c) => by.has(c)).map((c) => ({ cat: c, rows: by.get(c) as PickerEntry[] }));
  }, [visible]);

  // The selection is resolved against the VISIBLE set: the footer describes a row you can see, so
  // filtering the selected row away (typing a query, flipping "Fits ✓") also puts the footer away.
  const selected = useMemo(
    () => visible.find((e) => `${e.cat}/${e.unit.id}` === selectedKey) ?? null,
    [visible, selectedKey],
  );

  // A chip for every category the filter can currently hold — the four from the spec plus, if
  // `initialCategory` handed us mercenaries/allies, that one too.
  const chips: Category[] = category !== 'all' && !SPEC_CHIPS.includes(category)
    ? [...SPEC_CHIPS, category]
    : [...SPEC_CHIPS];

  const add = (e: PickerEntry) => {
    // `entry.cat` — the BASE category — is what gets stored; `displayCat` is presentation only.
    // Passing displayCat here would file the entry under a category the catalogue lookup cannot find
    // and the unit would vanish from the roster.
    onAdd(e.unit, e.cat);
    onBack(); // the spec: ＋ adds at minimum size and returns to the roster
  };

  const emptyState = (): React.JSX.Element => {
    if (searching) {
      return (
        <EmptyState
          line={`No unit or rule matches “${query.trim()}”.`}
          hint={fitsOnly ? 'Fits ✓ is on — units you cannot afford yet are hidden.' : undefined}
        />
      );
    }
    if (fitsOnly) {
      return (
        <EmptyState
          line={remaining < 0 ? 'The list is already over its points limit.' : 'Nothing fits the remaining points.'}
          hint="Turn off Fits ✓ to see the rest — going over is reported, not blocked."
        />
      );
    }
    if (category !== 'all') {
      return <EmptyState line={`No ${SECTION_LABEL[category]} units are available in this composition.`} />;
    }
    return <EmptyState line="No units are available in this composition." />;
  };

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
        background: TOW.bg, color: TOW.ink,
      }}
    >
      {/* ── header · 118px ──────────────────────────────────────────────────────────────────────
          5 (pad) + 34 (title row) + 6 (gap) + 36 (search) + 6 (gap) + 26 (chips) + 4 (pad) + 1
          (rule) = 118. `height` + border-box, so the rule lives INSIDE the 118px. */}
      <div
        style={{
          flexShrink: 0, height: 118, boxSizing: 'border-box',
          padding: `5px ${BUILDER.gutter}px 4px`,
          display: 'flex', flexDirection: 'column', gap: 6,
          background: TOW.panel, borderBottom: `1px solid ${TOW.line}`,
        }}
      >
        <div style={{ height: BUILDER.control.back, display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* A LABELLED back button, never a bare chevron: on a phone the label is the only thing
              that says where back goes. 34px = BUILDER.control.back. */}
          <button
            type="button"
            onClick={onBack}
            style={{
              height: BUILDER.control.back, flexShrink: 0, padding: '0 11px', boxSizing: 'border-box',
              borderRadius: BUILDER.radius.button, border: `1px solid ${TOW.lineStrong}`,
              background: 'transparent', color: TOW.goldDeep, cursor: 'pointer',
              fontFamily: towFont.display, fontWeight: 600, fontSize: 12, letterSpacing: '0.04em',
              whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            ‹ Roster
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: towFont.display, fontWeight: 700, fontSize: 15.5, lineHeight: 1.15,
                color: TOW.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              Add unit
            </div>
            <div
              style={{
                ...eb, fontSize: 7.5, color: TOW.faint, marginTop: 2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {[ctx.labels.faction, ctx.labels.composition].filter(Boolean).join(' · ')}
            </div>
          </div>

          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div
              style={{
                fontFamily: towFont.display, fontWeight: 700, fontSize: 16, lineHeight: 1.1,
                fontVariantNumeric: 'tabular-nums',
                // A negative remainder is the over-cap state; the accent is the app's own violation
                // vocabulary, so it reads as a problem without adding a colour.
                color: remaining < 0 ? TOW.gold : TOW.ink,
              }}
            >
              {n(remaining)}
            </div>
            <div style={{ ...eb, fontSize: 7, color: TOW.faint, marginTop: 2 }}>points remaining</div>
          </div>
        </div>

        {/* ── search · 36px ── */}
        <div
          style={{
            height: 36, flexShrink: 0, boxSizing: 'border-box', padding: '0 10px',
            borderRadius: BUILDER.radius.button, border: `1px solid ${TOW.lineStrong}`,
            background: TOW.panel2, display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span aria-hidden style={{ flexShrink: 0, color: TOW.faint, fontSize: 15, lineHeight: 1 }}>⌕</span>
          <input
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            aria-label="Search unit or rule"
            placeholder="Search unit or rule…"
            style={{
              flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
              padding: 0, fontFamily: towFont.serif, fontSize: 13.5, color: TOW.ink,
            }}
          />
          {searching ? (
            // The result counter. It lives inside the field because the header height is fixed at
            // 118px — a line of its own would push the chips out.
            <span
              style={{
                flexShrink: 0, fontFamily: towFont.serif, fontSize: 10.5, color: TOW.faint,
                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
              }}
            >
              {n(visible.length)} match{visible.length === 1 ? '' : 'es'}
            </span>
          ) : null}
        </div>

        {/* ── filter chips · 26px ── */}
        <div style={{ height: BUILDER.control.chip, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Chip label="All" active={category === 'all'} onClick={() => setCategory('all')} />
          {chips.map((c) => (
            <Chip
              key={c}
              label={CHIP_LABEL[c]}
              active={category === c}
              onClick={() => setCategory(category === c ? 'all' : c)}
            />
          ))}
          {/* The spacer that pushes "Fits ✓" to the right edge. */}
          <span style={{ flex: 1 }} />
          <Chip label="Fits ✓" active={fitsOnly} onClick={() => setFitsOnly((v) => !v)} />
        </div>
      </div>

      {/* ── body ─────────────────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          padding: `0 ${BUILDER.gutter}px 18px`,
        }}
      >
        {/* ── Terug in de linie (14-08-2026) ────────────────────────────────────────────────────
            Campagne-units die je hebt verwijderd maar die de campagne nog kent. Ze staan hier BOVEN de
            catalogus, want ze zijn geen nieuwe aanwinst maar een correctie: gewoon opnieuw toevoegen
            geeft een nieuwe uid, en dan raakt de unit haar debuutkosten, groeiplafond en XP kwijt. */}
        {terugTeHalen.length > 0 && onRestore && (
          <div style={{ marginTop: 12, marginBottom: 6 }}>
            <div style={{ ...eb, fontSize: 9, color: TOW.goldDeep, marginBottom: 6 }}>Back into the line</div>
            <div style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.muted, lineHeight: 1.4, marginBottom: 8 }}>
              These fought for you in an earlier Act and are no longer on the list. Put one back and it
              keeps its campaign history — adding it fresh from the catalogue below would make it a new
              regiment. You will need to pick its equipment again.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {terugTeHalen.map((b2) => (
                <button
                  key={b2.uid}
                  type="button"
                  onClick={() => { onRestore(b2); onBack(); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    textAlign: 'left', width: '100%', padding: '9px 11px', cursor: 'pointer',
                    borderRadius: BUILDER.radius.button, border: `1px solid ${TOW.goldDeep}`,
                    background: 'transparent', color: TOW.ink,
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 14 }}>{b2.label}</span>
                    {(b2.sub || b2.modellen) && (
                      <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted }}>
                        {[b2.sub, b2.modellen ? `${b2.modellen} model${b2.modellen === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span style={{ flexShrink: 0, fontFamily: towFont.display, fontSize: 12, color: TOW.goldDeep }}>Restore</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {groups.length === 0 ? emptyState() : groups.map(({ cat, rows }) => {
          // The section meta shows the ROSTER's spend in this category against the category rule,
          // in absolute points. `ok` is validate()'s own verdict, carried through builderDerived.
          const total = ctx.derived.categoryTotals.find((t) => t.key === cat);
          const limit = total ? absoluteLimit(total.rule, target) : null;
          // "✓ when it is met" reads as an ACHIEVEMENT, so it marks a satisfied MINIMUM ("638 / min
          // 500 ✓"). A maximum is not achieved by staying under it, and the spec's own second example
          // ("560 / max 1000") carries no tick even though it is comfortably inside the cap.
          const meta = total
            ? limit
              ? `${n(total.points)} / ${limit.kind} ${n(limit.points)}${limit.kind === 'min' && total.ok ? ' ✓' : ''}`
              : n(total.points)
            : undefined;

          return (
            <div key={cat}>
              <SectionHeader label={SECTION_LABEL[cat]} meta={meta} violated={total ? !total.ok : false} />
              {rows.map((e) => {
                const key = `${e.cat}/${e.unit.id}`;
                return (
                  <EntryRow
                    key={key}
                    entry={e}
                    fits={entryFits(e, remaining)}
                    remaining={remaining}
                    selected={selectedKey === key}
                    // Tapping the selected row again clears it — the footer has no cancel, so this is
                    // the way back out of a selection.
                    onSelect={() => setSelectedKey((k) => (k === key ? null : key))}
                    onAdd={() => add(e)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ── footer · only with a selection · 63px incl. 16px safe-area ────────────────────────── */}
      {selected ? (
        <div
          style={{
            flexShrink: 0, height: BUILDER.footerH, boxSizing: 'border-box',
            padding: `5px ${BUILDER.gutter}px 16px`,
            background: TOW.panel, borderTop: `1px solid ${TOW.line}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: towFont.serif, fontSize: 13, lineHeight: 1.2, color: TOW.ink,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {selected.unit.name_en ?? selected.unit.id} ×{n(selected.minSize)}
            </div>
            <div
              style={{
                ...eb, fontSize: 7.5, marginTop: 3, fontVariantNumeric: 'tabular-nums',
                color: remaining - selected.addCost < 0 ? TOW.gold : TOW.faint,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              +{n(selected.addCost)} · {n(remaining - selected.addCost)} left
            </div>
          </div>

          <button
            type="button"
            onClick={() => onConfigure(selected.unit, selected.cat)}
            style={{
              height: BUILDER.control.primary, flexShrink: 0, padding: '0 13px', boxSizing: 'border-box',
              borderRadius: BUILDER.radius.button, border: `1px solid ${TOW.lineStrong}`,
              background: 'transparent', color: TOW.goldDeep, cursor: 'pointer',
              fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5, letterSpacing: '0.04em',
              whiteSpace: 'nowrap', WebkitTapHighlightColor: 'transparent',
            }}
          >
            Options
          </button>
          <button
            type="button"
            onClick={() => add(selected)}
            style={{
              height: BUILDER.control.primary, flexShrink: 0, padding: '0 18px', boxSizing: 'border-box',
              borderRadius: BUILDER.radius.button, border: `1px solid ${TOW.gold}`,
              background: TOW.gold, color: TOW.onGrad, cursor: 'pointer',
              fontFamily: towFont.display, fontWeight: 700, fontSize: 13, letterSpacing: '0.04em',
              whiteSpace: 'nowrap', WebkitTapHighlightColor: 'transparent',
            }}
          >
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}
