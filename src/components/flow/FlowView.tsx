import { useData } from '../../data';
import { useUI } from '../../state';
import { RichText } from '../../lib/RichText';
import { ExplainBlock, ConditionalBlock, AbilityList, SeeAlso } from './blocks';
import type { FlowStep } from '../../types';

// Renders a turn step as a continuous, interpreted flow:
//   header → "only if" banner → core rule → inline explanations →
//   conditional questions → compact ability list → see-also.
// All rule text is the verbatim body resolved from rules.json.
export function FlowView({ slug, flow }: { slug: string; flow: FlowStep }) {
  const { getRule } = useData();
  const { isFavorite, toggleFavorite } = useUI();
  const rule = getRule(slug);
  if (!rule) return <p className="text-ink-dim">Rule “{slug}” is not available offline.</p>;

  const explains = flow.blocks.filter((b) => b.type === 'explain');
  const conditionals = flow.blocks.filter((b) => b.type === 'conditional');
  const abilities = flow.blocks.filter((b) => b.type === 'ability');
  const seealso = flow.blocks.filter((b) => b.type === 'seealso');

  return (
    <article>
      <header className="mb-3 flex items-start gap-3 border-b border-border-soft pb-3">
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
          className="shrink-0 rounded-full p-2 text-2xl leading-none active:scale-95"
          style={{ color: isFavorite(slug) ? 'var(--color-gold)' : 'var(--color-ink-faint)' }}
        >
          {isFavorite(slug) ? '★' : '☆'}
        </button>
      </header>

      {flow.stepCondition && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-900/50 bg-amber-950/25 px-3 py-2.5">
          <span className="mt-0.5 shrink-0">❓</span>
          <p className="text-sm text-amber-200/90">
            <span className="font-semibold">Only do this step if: </span>
            {flow.stepCondition}
          </p>
        </div>
      )}

      <RichText doc={rule.body} />

      {explains.length > 0 && (
        <div className="mt-5">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-ink-faint">
            How it works
          </h2>
          {explains.map((b) => (
            <ExplainBlock key={b.slug} slug={b.slug} />
          ))}
        </div>
      )}

      {conditionals.length > 0 && (
        <div className="mt-5">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-ink-faint">
            Only in certain cases
          </h2>
          {conditionals.map((b) => (
            <ConditionalBlock key={b.slug} slug={b.slug} label={b.label} />
          ))}
        </div>
      )}

      <AbilityList blocks={abilities} />

      <SeeAlso blocks={seealso} />
    </article>
  );
}
