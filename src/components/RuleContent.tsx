import { useState } from 'react';
import { useData } from '../data';
import { useUI } from '../state';
import { RichText } from '../lib/RichText';

// Renders a single rule: title, page reference, favourite toggle, the verbatim body,
// and a collapsible list of related rules. Used in the detail pane and the pop-up sheet.
export function RuleContent({ slug }: { slug: string }) {
  const { getRule } = useData();
  const { isFavorite, toggleFavorite, openRule } = useUI();
  const [showRelated, setShowRelated] = useState(false);
  const rule = getRule(slug);

  if (!rule) {
    return <p className="text-ink-dim">Rule “{slug}” is not available offline.</p>;
  }

  const related = rule.crossRefSlugs
    .filter((s) => s !== slug && getRule(s))
    .filter((s, i, arr) => arr.indexOf(s) === i);

  return (
    <article>
      <header className="mb-4 flex items-start gap-3 border-b border-border-soft pb-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl leading-tight text-gold">{rule.name}</h1>
          {rule.pageReference != null && (
            <p className="mt-1 text-xs uppercase tracking-wide text-ink-faint">
              Rulebook p.{rule.pageReference}
            </p>
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

      {related.length > 0 && (
        <section className="mt-7 border-t border-border-soft pt-4">
          <button
            onClick={() => setShowRelated((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
              Related rules
            </span>
            <span className="rounded-full bg-surface-2 px-2 text-[11px] text-ink-faint">
              {related.length}
            </span>
            <span
              className="ml-auto text-ink-faint transition-transform"
              style={{ transform: showRelated ? 'rotate(90deg)' : 'none' }}
            >
              ›
            </span>
          </button>
          {showRelated && (
            <div className="mt-3 flex flex-wrap gap-2">
              {related.map((s) => (
                <button
                  key={s}
                  onClick={() => openRule(s)}
                  className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm text-accent active:bg-surface-3"
                >
                  {getRule(s)!.name}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </article>
  );
}
