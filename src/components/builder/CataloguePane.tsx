// Army-builder REDESIGN — the DESKTOP catalogue: a 336px "Add unit" pane.
//
// This is the desktop counterpart of `PickerScreen.tsx` (the phone's screen 2a), NOT a second
// catalogue. Everything that decides WHICH entries are visible and WHETHER one is affordable is
// imported from that screen (`filterPickerEntries`) rather than restated here, so the two layouts
// cannot drift apart: same category gate, same "Fits ✓" gate, same search over unit names and special
// rules, same order. What differs is only the frame — a persistent side pane instead of a full screen.
//
// PRESENTATION ONLY. Every number is read from `ctx.derived` or from a prebuilt `PickerEntry`; the
// pane never totals points, never touches `entry.opts`, never writes to the list and never regenerates
// a uid. Adding goes out through `onAdd`, so the container keeps the single mutation path
// (`BuilderCtx.update`) — see types.ts. `ctx.itemsData` is not read at all, which is what makes the
// "catalogue still loading" window (`itemsData === undefined`) a non-event here: with nothing to prune
// there is nothing to damage (REBUILD-CONSTRAINTS, "prune onbekende opts").
//
// IT DOES NOT OVERLAP THE ROSTER, and that is structural rather than a promise: the pane is an
// in-flow, fixed-width, `flexShrink: 0` column with no `position: absolute` and no scrim anywhere in
// this file. The shell narrows the roster column to make room; nothing here can cover a roster row or
// reflow the inspector.
//
// GUTTER — the primitives carry no horizontal padding (see their header comment), so this pane owns
// `BUILDER.gutter` (14px) on its header, scroller and footer. That is what makes the section header's
// label, every entry's name and the footer's text share one left edge.

import { useEffect, useMemo, useRef, useState } from 'react';
import { BUILDER, fmt, HAIRLINE, SectionHeader } from './primitives';
import { filterPickerEntries, type PickerCategoryFilter } from './PickerScreen';
import type { BuilderCtx, PickerEntry } from './types';
import { CATEGORIES, type Category, type OwbUnit } from '../../lib/owbBuilder';
import { TOW, towFont, engraved } from '../../design/tow';

const eb = engraved as React.CSSProperties; // Cinzel 600 · uppercase · letterSpacing .22em

/** THE points formatter (thin-space thousands separator), shared with every other builder screen. */
const n = fmt;

// ─────────────────────────── measurements ───────────────────────────
/** The pane's exact width, border-box, so it occupies exactly 336px of the shell's left column —
 *  100px more than the rail it replaces, which is where the roster's 100px comes from. */
const PANE_W = 336;
/** The trailing ＋: 28 × 26 of ink, per the desktop spec — 2px narrower and 2px shorter than the
 *  phone's 30 × 28, because a pointer target replaces a touch target. The BUTTON is 28px tall (the
 *  ink is centred in it), so the clickable height is 28px and never drops below the 26px floor the
 *  spec keeps. Nothing larger is used: on the phone the ＋ needs a 44px target that has to be hidden
 *  inside the row; with a mouse the visible control IS the target. */
const PLUS_W = 28;
const PLUS_INK_H = 26;
const PLUS_HIT_H = 28;
/** Search field. 32 rather than the phone's 36: that value exists to be tappable, and this one is
 *  clicked. Chips stay on the shared token (`BUILDER.control.chip`, 26). */
const SEARCH_H = 32;
/** Footer = 7 + primary button + 7. Derived from the token rather than a new magic number, and
 *  deliberately NOT `BUILDER.footerH` (63) — that height is 47px of content plus a 16px phone
 *  safe-area reserve, which no desktop window has. */
const FOOTER_H = 7 + BUILDER.control.primary + 7;

// ─────────────────────────── labels ───────────────────────────
// These three maps mirror `PickerScreen`'s, which keeps them private (module-local consts, not
// exports). They are pure presentation strings — no filtering, no rules — so restating them here
// cannot make the two layouts behave differently; it only means a relabel has to happen twice.
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

/** `${cat}/${unitId}` — an id, not the object, so hover/selection survive a re-render with a rebuilt
 *  `entries` array (the container rebuilds it whenever the list changes). Same key shape the phone
 *  picker uses for its selection. */
const keyOf = (e: PickerEntry): string => `${e.cat}/${e.unit.id}`;

// ─────────────────────────── the ⌘K hint ───────────────────────────
/** Mac shows the command glyph, everything else spells the modifier out. This is not cosmetic
 *  pedantry: "⌘K" on Windows is both wrong and a tofu risk (neither Cinzel nor EB Garamond carries
 *  U+2318 — the same reasoning that made RosterScreen's footer print "+" instead of "＋"), while on a
 *  Mac the glyph is what a reader expects and the system font always has it. With no `navigator` at
 *  all (server render) the spec's own wording is used. */
const KBD_HINT: string = (() => {
  const nav = typeof navigator === 'undefined' ? null : (navigator as { platform?: string; userAgent?: string });
  if (!nav) return '⌘K';
  return /mac|iphone|ipad|ipod/i.test(`${nav.platform ?? ''} ${nav.userAgent ?? ''}`) ? '⌘K' : 'Ctrl K';
})();
/** The keycap is the one place a system UI font is used instead of a TOW font: it is chrome that has
 *  to render a modifier glyph, not typography. */
const KBD_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// ─────────────────────────── small building blocks ───────────────────────────
function Chip({ label, active, onClick }: {
  label: string; active: boolean; onClick: () => void;
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
      }}
    >
      {label}
    </button>
  );
}

function EmptyState({ line, hint }: { line: string; hint?: string }): React.JSX.Element {
  return (
    <div style={{ padding: '30px 2px 34px', textAlign: 'center' }}>
      <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted, lineHeight: 1.45 }}>{line}</div>
      {hint ? (
        <div style={{ fontFamily: towFont.serif, fontSize: 10.5, color: TOW.faint, marginTop: 6, lineHeight: 1.45 }}>
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
 * Geometry is the phone picker's, deliberately: 44px tall (`BUILDER.rowH`), 7px vertical padding,
 * hairline inside the box, so a catalogue list and a roster list keep one rhythm on both layouts.
 *
 * Two things are inherited from `PickerScreen`'s row for the same reasons stated there:
 *  • the element is a <div role="button">, not a <button> — a button inside a button is invalid HTML
 *    and browsers break the nesting, which would cost the ＋ its own hit area;
 *  • there is NO `overflow: hidden` — it would clip the ＋'s hit area, and a clipped region is not
 *    clickable. Ellipsising is done by the name and whisper spans.
 *
 * HOVER is a real state here (it cannot be on a phone): a hovered row takes the white panel
 * background and a 1px accent ring, AND asks the shell to preview the unit in the inspector, so a
 * statline can be read before committing. Keyboard focus does exactly the same thing — it is the
 * pointer-less equivalent of hover, and without it a keyboard user could never see a preview.
 */
function EntryRow({ entry, fits, selected, hovered, onSelect, onHover, onAdd }: {
  entry: PickerEntry;
  fits: boolean;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHover: () => void;
  onAdd: () => void;
}): React.JSX.Element {
  const name = entry.unit.name_en ?? entry.unit.id;

  // Affordable: "Regular Infantry · min 10 · 7 pt/model" — or "Monster · 1 model · 180 pt" for a unit
  // priced flat rather than per model, with the composition's restriction note last. Unaffordable: the
  // spec REPLACES the whisper with the reason, in the accent colour.
  // The note rides along at the end (not omitted for width): the leading three fields are what the
  // spec asks for, so at 308px of content the ellipsis eats the note, never the cost — and dropping
  // it would hide a real restriction that has no other home in this pane.
  const size = entry.perModel != null
    ? `min ${n(entry.minSize)}`
    : `${n(entry.minSize)} model${entry.minSize === 1 ? '' : 's'}`;
  const cost = entry.perModel != null ? `${n(entry.perModel)} pt/model` : `${n(entry.addCost)} pt`;
  const whisper = fits
    ? [entry.troopType, size, cost, entry.note].filter(Boolean).join(' · ')
    : `${n(entry.addCost)} pt · exceeds remaining points`;

  // ONE vocabulary for these states, shared with RosterTable and PickerScreen: hover lifts the ground,
  // selection adds a 3px inset rail. This pane used to also draw a full 1px accent RING — on hover and
  // again under selection — and it was the only place in the builder that did. It read as a box drawn
  // around the row, and because the row owns no horizontal padding (the pane insets it) the ring hugged
  // the row box while the text sat inside it, so the box looked wider than the content it framed.
  // An inset shadow, not a border, so the row's box is identical in every state and the 44px rhythm
  // never shifts.
  const rail = `inset 3px 0 0 ${TOW.gold}`;
  const active = hovered || selected;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(); }
      }}
      // Setting hover only — clearing is owned by the scroller (see the pane), so moving the pointer
      // from one row to the next never flickers the inspector through an empty state.
      onMouseEnter={onHover}
      onFocus={onHover}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        height: BUILDER.rowH, boxSizing: 'border-box', padding: '7px 0', width: '100%',
        background: active ? TOW.panel : 'transparent',
        borderBottom: `1px solid ${HAIRLINE}`,
        boxShadow: selected ? rail : 'none',
        // Over budget is REPORTED, never enforced: the row dims and states the reason, but it stays
        // fully interactive — no `disabled`, no `pointerEvents: none`. Only "Fits ✓" hides it.
        opacity: fits ? 1 : 0.42,
        cursor: 'pointer', textAlign: 'left',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
          <span
            style={{
              fontFamily: towFont.serif, fontWeight: 400, fontSize: 14, lineHeight: 1.25, color: TOW.ink,
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
                fontFamily: towFont.serif, fontSize: 11, lineHeight: 1.25, color: TOW.faint,
                flex: '0 0 auto', paddingLeft: 5, whiteSpace: 'nowrap',
              }}
            >
              · {n(entry.inRoster)} in roster
            </span>
          ) : null}
        </span>
        <span
          style={{
            fontFamily: towFont.serif, fontWeight: 400, fontSize: 10.5, lineHeight: 1.3,
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
        title={`Add ${name} at minimum size`}
        onClick={(ev) => { ev.stopPropagation(); onAdd(); }}
        style={{
          width: PLUS_W, height: PLUS_HIT_H, flexShrink: 0, padding: 0,
          border: 'none', background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <span
          style={{
            width: PLUS_W, height: PLUS_INK_H, boxSizing: 'border-box',
            borderRadius: BUILDER.radius.chip, border: `1px solid ${TOW.lineStrong}`,
            background: TOW.panel2, color: TOW.goldDeep,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            // The spec prints a fullwidth "＋" (U+FF0B); the display and serif stacks do not carry that
            // codepoint (RosterScreen's footer already settled this), and a tofu box in the pane's most
            // used control is not a trade worth making. An ordinary "+" one step up reads identically.
            fontFamily: towFont.serif, fontSize: 16, lineHeight: 1,
          }}
        >
          +
        </span>
      </button>
    </div>
  );
}

// ═══════════════════════════ the pane ═══════════════════════════
export function CataloguePane(props: {
  ctx: BuilderCtx;
  /** Already built by the container — including `inRoster`, `addCost`, `unaffordable`, `troopType`
   *  and `note`. This pane only filters, groups, selects and previews. */
  entries: PickerEntry[];
  /** Preselected chip, e.g. from a category header's "+" in the roster table. Read once, at mount. */
  initialCategory?: Category;
  onClose: () => void;
  /** Adds at minimum size. Always called with `entry.cat` — the STORED base category. */
  onAdd: (unit: OwbUnit, cat: Category) => void;
  /** The hovered (or keyboard-focused) unit, for the inspector's preview; `null` when nothing is
   *  hovered, when the pane is left, and when the pane unmounts. */
  onHoverPreview?: (unit: OwbUnit | null) => void;
  /** Focus het zoekveld bij openen (⌘K). */
  autoFocusSearch?: boolean;
}): React.JSX.Element {
  const { ctx, entries, initialCategory, onClose, onAdd, onHoverPreview, autoFocusSearch } = props;

  const [category, setCategory] = useState<PickerCategoryFilter>(initialCategory ?? 'all');
  const [query, setQuery] = useState('');
  const [fitsOnly, setFitsOnly] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const remaining = ctx.derived.remainingPoints;
  const composition = ctx.list.composition;
  const searching = query.trim().length > 0;

  // ── which entries are visible ───────────────────────────────────────────────────────────────────
  // The phone screen's own filter, imported rather than reimplemented: category → Fits → query, with
  // `unitAllowedIn` re-checked inside. One filter, two layouts.
  const visible = useMemo(
    () => filterPickerEntries(entries, { composition, category, query, remaining, fitsOnly }),
    [entries, composition, category, query, remaining, fitsOnly],
  );

  // ── which of them are affordable ────────────────────────────────────────────────────────────────
  // Derived by running the SAME imported filter over the visible set with only its "Fits ✓" gate
  // armed, instead of restating the affordability predicate. That is the point: the dim/reason
  // treatment and the "Fits ✓" chip can never disagree, because they are literally the same verdict.
  // It also inherits the over-cap behaviour for free — once `remaining` is negative nothing fits,
  // which is correct, the list is already past its target.
  const fitting = useMemo(
    () => new Set<PickerEntry>(
      filterPickerEntries(visible, { composition, category: 'all', query: '', remaining, fitsOnly: true }),
    ),
    [visible, composition, remaining],
  );

  // Grouped for display by `displayCat` (the category under this composition), in the fixed
  // CATEGORIES order — which keeps mercenaries/allies at the end instead of dropping them.
  const groups = useMemo(() => {
    const by = new Map<Category, PickerEntry[]>();
    for (const e of visible) {
      const rows = by.get(e.displayCat);
      if (rows) rows.push(e); else by.set(e.displayCat, [e]);
    }
    return CATEGORIES.filter((c) => by.has(c)).map((c) => ({ cat: c, rows: by.get(c) as PickerEntry[] }));
  }, [visible]);

  // Both hover and selection resolve against the VISIBLE set: the footer describes a row you can see,
  // so filtering the selected row away (typing a query, flipping "Fits ✓") also puts the footer away,
  // and a preview never outlives the row that asked for it.
  const selected = useMemo(
    () => visible.find((e) => keyOf(e) === selectedKey) ?? null,
    [visible, selectedKey],
  );
  const hoveredUnit = useMemo(
    () => visible.find((e) => keyOf(e) === hoverKey)?.unit ?? null,
    [visible, hoverKey],
  );

  // ── the inspector preview ───────────────────────────────────────────────────────────────────────
  // Sent from an effect keyed on the hovered UNIT (a stable catalogue object), not from the mouse
  // handlers: that way a rebuilt `entries` array does not re-fire the callback, and the pane can clear
  // the preview when it unmounts. Without that cleanup, closing the pane would leave a phantom unit
  // in the inspector. The callback is held in a ref so a new closure identity never re-fires a send.
  const previewRef = useRef(onHoverPreview);
  useEffect(() => { previewRef.current = onHoverPreview; }, [onHoverPreview]);
  useEffect(() => { previewRef.current?.(hoveredUnit); }, [hoveredUnit]);
  useEffect(() => () => { previewRef.current?.(null); }, []);

  // ── Esc closes the pane ─────────────────────────────────────────────────────────────────────────
  // A document listener (bubble phase), not a handler on the pane, because Esc must close it from
  // anywhere in the workspace — the roster table has focus most of the time. `defaultPrevented` is
  // honoured so a deeper layer that already handled the key wins; a modal that also stops propagation
  // in the CAPTURE phase (as ResolveSheet does) is never overruled by this listener.
  // No `useBackClose` layer is registered: this is not an overlay — it is an in-flow column that
  // covers nothing — and registering a phantom layer would make hardware Back close a pane the user
  // cannot see is modal, exactly the ordering hazard REBUILD-CONSTRAINTS §5 warns about.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || ev.defaultPrevented) return;
      ev.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ⌘K itself belongs to the shell (it is what OPENS the pane); the pane only obeys the resulting
  // `autoFocusSearch`. Two owners for one shortcut is how you get a pane that closes and refocuses in
  // the same keystroke.
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (autoFocusSearch) searchRef.current?.focus(); }, [autoFocusSearch]);

  // A chip for every category the filter can currently hold — the four from the spec plus, if
  // `initialCategory` handed us mercenaries/allies, that one too.
  const chips: Category[] = category !== 'all' && !SPEC_CHIPS.includes(category)
    ? [...SPEC_CHIPS, category]
    : [...SPEC_CHIPS];

  // `entry.cat` — the BASE category — is what gets stored; `displayCat` is presentation only. Passing
  // displayCat would file the entry under a category the catalogue lookup cannot find and the unit
  // would vanish from the roster.
  // The pane STAYS OPEN after adding (where the phone returns to the roster): a persistent side pane
  // exists precisely so several units can be added in a row, and the roster is visible the whole time.
  const add = (e: PickerEntry) => {
    onAdd(e.unit, e.cat);
    setSelectedKey(null); // the pending selection has been spent; the footer folds away
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
        // The whole non-overlap guarantee, in three declarations: a fixed width, no shrinking, and no
        // positioning of any kind.
        //
        // `maxWidth: 100%` is the one concession to the shell: it hands the pane a slot of
        // `rail + 100`, which is exactly 336 at the default rail width but follows the rail's resize
        // handle. Without the cap a narrower slot would CLIP the ＋ column (and a clipped control is
        // not clickable); with it the pane gives way instead. It never grows past 336.
        // No `borderRight` here on purpose — the shell already draws the separating rule on both slots
        // it places the pane in, and a second rule 1px away reads as a mistake.
        width: PANE_W, maxWidth: '100%', flexShrink: 0, boxSizing: 'border-box',
        height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: TOW.bg, color: TOW.ink,
      }}
    >
      {/* ── header ────────────────────────────────────────────────────────────────────────────────
          Not height-locked (the phone's 118px exists to protect a 12-row body budget on a 390×812
          screen; a desktop window has no such budget), so the chip row may wrap on a narrow
          composition without anything being cut off. */}
      <div
        style={{
          flexShrink: 0, boxSizing: 'border-box',
          padding: `9px ${BUILDER.gutter}px 8px`,
          display: 'flex', flexDirection: 'column', gap: 7,
          background: TOW.panel, borderBottom: `1px solid ${TOW.line}`,
        }}
      >
        {/* title · remaining points · close */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 13.5,
              lineHeight: 1.15, color: TOW.ink, whiteSpace: 'nowrap', overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Add unit
          </span>
          <span
            style={{
              flexShrink: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 13.5, lineHeight: 1.15,
              fontVariantNumeric: 'tabular-nums',
              // A negative remainder is the over-cap state; the accent is the app's own violation
              // vocabulary, so it reads as a problem without introducing a colour.
              color: remaining < 0 ? TOW.gold : TOW.ink,
            }}
          >
            {n(remaining)}
          </span>
          <span style={{ ...eb, flexShrink: 0, fontSize: 7, color: remaining < 0 ? TOW.gold : TOW.faint }}>
            left
          </span>
          {/* Not in the spec's header list, added deliberately: Esc is the specified way out, and a
              pointer-driven pane whose only exit is a keystroke is a dead end. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close catalogue"
            title="Close (Esc)"
            style={{
              flexShrink: 0, width: 20, height: 20, marginLeft: 2, marginBottom: -2, padding: 0,
              border: 'none', background: 'none', cursor: 'pointer', color: TOW.muted,
              fontFamily: towFont.serif, fontSize: 17, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* search + ⌘K hint */}
        <div
          style={{
            height: SEARCH_H, flexShrink: 0, boxSizing: 'border-box', padding: '0 8px',
            borderRadius: BUILDER.radius.button, border: `1px solid ${TOW.lineStrong}`,
            background: TOW.panel2, display: 'flex', alignItems: 'center', gap: 7,
          }}
        >
          <span aria-hidden style={{ flexShrink: 0, color: TOW.faint, fontSize: 14, lineHeight: 1 }}>⌕</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            aria-label="Search unit or rule"
            placeholder="Search unit or rule…"
            style={{
              flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
              padding: 0, fontFamily: towFont.serif, fontSize: 13, color: TOW.ink,
            }}
          />
          {searching ? (
            // The two share one slot on purpose: the shortcut hint is how you GET here and is useless
            // once you are typing; the match count is the only thing worth knowing then.
            <span
              style={{
                flexShrink: 0, fontFamily: towFont.serif, fontSize: 10.5, color: TOW.faint,
                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
              }}
            >
              {n(visible.length)} match{visible.length === 1 ? '' : 'es'}
            </span>
          ) : (
            <span
              aria-hidden
              style={{
                flexShrink: 0, padding: '1px 5px', borderRadius: BUILDER.radius.check,
                border: `1px solid ${TOW.line}`, background: TOW.panel,
                fontFamily: KBD_FONT, fontSize: 9.5, lineHeight: 1.5, color: TOW.faint,
                whiteSpace: 'nowrap',
              }}
            >
              {KBD_HINT}
            </span>
          )}
        </div>

        {/* filter chips */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, rowGap: 5 }}>
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

      {/* ── body — the only scroll container ──────────────────────────────────────────────────────
          Hover and focus are CLEARED here rather than on the rows, so moving between two rows never
          passes through a null preview (which would flash the inspector empty between every row).
          `relatedTarget` keeps focus moving from a row to its own ＋ from counting as leaving. */}
      <div
        onMouseLeave={() => setHoverKey(null)}
        onBlur={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget)) setHoverKey(null); }}
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
          overscrollBehavior: 'contain', padding: `0 ${BUILDER.gutter}px 16px`,
        }}
      >
        {groups.length === 0 ? emptyState() : groups.map(({ cat, rows }) => (
          // The section header carries NO meta here, unlike the phone picker. On the phone the
          // catalogue is a full screen, so the category's spend against its rule has to be repeated
          // inside it; on the desktop the roster and its category totals are on screen at the same
          // time, and printing them a second time in a different unit (the phone converts the
          // percentage rule to absolute points) is exactly how two layouts start disagreeing.
          <div key={cat}>
            <SectionHeader label={SECTION_LABEL[cat]} />
            {rows.map((e) => {
              const key = keyOf(e);
              return (
                <EntryRow
                  key={key}
                  entry={e}
                  fits={fitting.has(e)}
                  selected={selectedKey === key}
                  hovered={hoverKey === key}
                  // Clicking the selected row again clears it — the footer has no cancel, so this is
                  // the way back out of a selection.
                  onSelect={() => setSelectedKey((k) => (k === key ? null : key))}
                  onHover={() => setHoverKey(key)}
                  onAdd={() => add(e)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* ── footer · only with a pending selection ────────────────────────────────────────────── */}
      {selected ? (
        <div
          style={{
            flexShrink: 0, height: FOOTER_H, boxSizing: 'border-box',
            padding: `7px ${BUILDER.gutter}px`,
            background: TOW.panel, borderTop: `1px solid ${TOW.line}`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: towFont.serif, fontSize: 12.5, lineHeight: 1.2, color: TOW.ink,
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
            onClick={() => add(selected)}
            style={{
              height: BUILDER.control.primary, flexShrink: 0, padding: '0 18px', boxSizing: 'border-box',
              borderRadius: BUILDER.radius.button, border: `1px solid ${TOW.gold}`,
              background: TOW.gold, color: TOW.onGrad, cursor: 'pointer',
              fontFamily: towFont.display, fontWeight: 700, fontSize: 12.5, letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
            }}
          >
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}
