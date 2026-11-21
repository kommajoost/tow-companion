import { useState } from 'react';
import { useData } from '../data';
import { useUI } from '../state';
import { RichText } from '../lib/RichText';

// Above this many children a section's "In this section" list starts collapsed (Special Rules has
// ~660 children; Command Groups a handful).
const SECTION_LIST_OPEN_MAX = 40;

// Renders a single rule the way the wiki lays out a rule page: breadcrumb to its section, title,
// source + page, the verbatim body, the wiki's curated "Related" list (open), the broad
// cross-reference list (collapsed), the section's own contents when the rule IS a section, and
// prev/next within the wiki order. Used in the detail pane and the pop-up sheet.
export function RuleContent({ slug }: { slug: string }) {
  const { getRule } = useData();
  const { isFavorite, toggleFavorite, openRule } = useUI();
  // Toggle state is stored as "the slug it was toggled for", not as a boolean. RuleSheet keys its
  // panel on the slug today, but nothing forces a remount here: if the slug changes while this
  // component stays mounted, a toggle made for the previous rule no longer matches and every
  // block falls back to its default. No effect needed, no stale flash.
  const [crossOpenFor, setCrossOpenFor] = useState<string | null>(null);
  const [childrenToggledFor, setChildrenToggledFor] = useState<string | null>(null);
  const rule = getRule(slug);

  if (!rule) {
    return <p className="text-ink-dim">Rule “{slug}” is not available offline.</p>;
  }

  const parent = rule.parentSlug ? getRule(rule.parentSlug) : undefined;
  const book = rule.association?.[0];
  const sourceLine =
    rule.pageReference != null
      ? `${book ?? 'Rulebook'}, p. ${rule.pageReference}`
      : book ?? null;

  // Unique, existing, not-self slugs in the given order.
  const clean = (list: string[] | undefined) =>
    (list ?? []).filter((s, i, arr) => s !== slug && arr.indexOf(s) === i && !!getRule(s));

  const related = clean(rule.relatedSlugs);
  const relatedSet = new Set(related);
  const crossRefs = clean(rule.crossRefSlugs).filter((s) => !relatedSet.has(s));
  const showCross = crossOpenFor === slug;

  const children = clean(rule.childSlugs);
  const childrenDefaultOpen = children.length <= SECTION_LIST_OPEN_MAX;
  // A toggle flips the default for this slug only.
  const showChildren = childrenToggledFor === slug ? !childrenDefaultOpen : childrenDefaultOpen;

  // Prev/next only make sense inside a section; loose rules (spells, charts) have no wiki order.
  const prev = rule.parentSlug ? getRule(rule.prevSlug) : undefined;
  const next = rule.parentSlug ? getRule(rule.nextSlug) : undefined;

  const chip = (s: string) => (
    <button
      key={s}
      onClick={() => openRule(s)}
      className="min-h-[40px] rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm text-accent active:bg-surface-3"
    >
      {getRule(s)!.name}
    </button>
  );

  return (
    <article>
      <header className="mb-4 flex items-start gap-3 border-b border-border-soft pb-3">
        <div className="min-w-0 flex-1">
          {parent && (
            <button
              onClick={() => openRule(parent.slug)}
              // Negative margin keeps the 40px tap target without pushing the title down as much.
              className="-my-2 flex min-h-[40px] max-w-full items-center gap-1 text-left text-xs uppercase tracking-wide text-accent active:opacity-70"
            >
              <span className="truncate">{parent.name}</span>
              <span aria-hidden className="shrink-0">›</span>
            </button>
          )}
          <h1 className="font-display text-2xl leading-tight text-gold">{rule.name}</h1>
          {sourceLine && (
            <p className="mt-1 text-xs uppercase tracking-wide text-ink-faint">{sourceLine}</p>
          )}
        </div>
        <button
          aria-label={isFavorite(slug) ? 'Remove favourite' : 'Add favourite'}
          onClick={() => toggleFavorite(slug)}
          className="shrink-0 rounded-full p-2 text-2xl leading-none transition-colors active:scale-95"
          style={{ color: isFavorite(slug) ? 'var(--color-gold)' : 'var(--color-ink-faint)' }}
        >
          {isFavorite(slug) ? '★' : '☆'}
        </button>
      </header>

      <RichText doc={rule.body} />

      {children.length > 0 && (
        <section className="mt-7 border-t border-border-soft pt-4">
          <button
            onClick={() => setChildrenToggledFor((t) => (t === slug ? null : slug))}
            className="flex min-h-[40px] w-full items-center gap-2 text-left"
            aria-expanded={showChildren}
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
              In this section
            </span>
            <span className="rounded-full bg-surface-2 px-2 text-[11px] text-ink-faint">
              {children.length}
            </span>
            <span
              className="ml-auto text-ink-faint transition-transform"
              style={{ transform: showChildren ? 'rotate(90deg)' : 'none' }}
            >
              ›
            </span>
          </button>
          {showChildren && (
            <ul className="mt-2 space-y-1">
              {children.map((s) => {
                const c = getRule(s)!;
                return (
                  <li key={s}>
                    <button
                      onClick={() => openRule(s)}
                      className="flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-border-soft bg-surface/40 px-3 py-2 text-left active:bg-surface-3"
                    >
                      <span className="min-w-0 flex-1 truncate text-ink">{c.name}</span>
                      {c.pageReference != null && (
                        <span className="shrink-0 text-xs text-ink-faint">p.{c.pageReference}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-7 border-t border-border-soft pt-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-ink-faint">Related rules</div>
          <div className="mt-3 flex flex-wrap gap-2">{related.map(chip)}</div>
        </section>
      )}

      {crossRefs.length > 0 && (
        <section className={`${related.length > 0 ? 'mt-4' : 'mt-7 border-t border-border-soft'} pt-4`}>
          <button
            onClick={() => setCrossOpenFor((o) => (o === slug ? null : slug))}
            className="flex min-h-[40px] w-full items-center gap-2 text-left"
            aria-expanded={showCross}
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
              Cross-reference links
            </span>
            <span className="rounded-full bg-surface-2 px-2 text-[11px] text-ink-faint">
              {crossRefs.length}
            </span>
            <span
              className="ml-auto text-ink-faint transition-transform"
              style={{ transform: showCross ? 'rotate(90deg)' : 'none' }}
            >
              ›
            </span>
          </button>
          {showCross && <div className="mt-3 flex flex-wrap gap-2">{crossRefs.map(chip)}</div>}
        </section>
      )}

      {(prev || next) && (
        // Two equal columns with min-w-0 so long names truncate instead of pushing off a 375px screen.
        <nav className="mt-7 grid grid-cols-2 gap-2 border-t border-border-soft pt-4">
          {prev ? (
            <button
              onClick={() => openRule(prev.slug)}
              className="flex min-h-[40px] min-w-0 items-center gap-1 rounded-lg border border-border-soft bg-surface-2 px-3 py-2 text-left text-sm text-accent active:bg-surface-3"
            >
              <span aria-hidden className="shrink-0">‹</span>
              <span className="min-w-0 truncate">{prev.name}</span>
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button
              onClick={() => openRule(next.slug)}
              className="flex min-h-[40px] min-w-0 items-center justify-end gap-1 rounded-lg border border-border-soft bg-surface-2 px-3 py-2 text-right text-sm text-accent active:bg-surface-3"
            >
              <span className="min-w-0 truncate">{next.name}</span>
              <span aria-hidden className="shrink-0">›</span>
            </button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </article>
  );
}
