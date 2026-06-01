import { useState } from 'react';
import { useData } from '../../data';
import { useUI } from '../../state';
import { RichText } from '../../lib/RichText';
import type { FlowBlock } from '../../types';

// An inline, woven-in explanation of how something referenced in the step works.
// Shown expanded by default (the user wants it explained right there), collapsible.
export function ExplainBlock({ slug }: { slug: string }) {
  const { getRule } = useData();
  const [open, setOpen] = useState(true);
  const rule = getRule(slug);
  if (!rule) return null;
  return (
    <section className="my-3 rounded-xl border border-border-soft bg-surface-2/60 pl-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 py-2.5 pr-3 text-left"
      >
        <span className="font-display text-base text-accent">{rule.name}</span>
        <span className={`ml-auto text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`}>
          ›
        </span>
      </button>
      {open && (
        <div className="pb-3 pr-3">
          <RichText doc={rule.body} />
        </div>
      )}
    </section>
  );
}

// A rule that only applies under a condition. Posed as a question; the verbatim rule is
// revealed only when the player confirms it applies.
export function ConditionalBlock({ slug, label }: { slug: string; label?: string }) {
  const { getRule } = useData();
  const [open, setOpen] = useState(false);
  const rule = getRule(slug);
  if (!rule) return null;
  const question = label || `Does “${rule.name}” apply?`;
  return (
    <section className="my-2.5 overflow-hidden rounded-xl border border-amber-900/50 bg-amber-950/20">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2.5 px-3 py-3 text-left"
      >
        <span className="mt-0.5 shrink-0 text-base">❓</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-amber-200/90">{question}</span>
          <span className="text-xs text-ink-faint">
            {open ? 'Tap to hide' : `Tap to show — ${rule.name}`}
          </span>
        </span>
        <span className={`mt-0.5 text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`}>
          ›
        </span>
      </button>
      {open && (
        <div className="border-t border-amber-900/40 px-3 py-3">
          <RichText doc={rule.body} />
        </div>
      )}
    </section>
  );
}

// One row inside the ability list.
function AbilityRow({ slug }: { slug: string }) {
  const { getRule } = useData();
  const [open, setOpen] = useState(false);
  const rule = getRule(slug);
  if (!rule) return null;
  return (
    <li className="border-t border-border-soft first:border-t-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{rule.name}</span>
        <span className={`text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <RichText doc={rule.body} />
        </div>
      )}
    </li>
  );
}

// Compact, collapsible list of special rules / options that can apply at this step.
export function AbilityList({ blocks }: { blocks: FlowBlock[] }) {
  const [open, setOpen] = useState(false);
  if (blocks.length === 0) return null;
  return (
    <section className="my-3 overflow-hidden rounded-xl border border-border bg-surface-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="text-sm">✦</span>
        <span className="text-sm font-semibold text-gold">
          Special rules &amp; options that may apply
        </span>
        <span className="ml-auto rounded-full bg-surface-3 px-2 text-xs text-ink-dim">
          {blocks.length}
        </span>
        <span className={`text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <ul>
          {blocks.map((b) => (
            <AbilityRow key={b.slug} slug={b.slug} />
          ))}
        </ul>
      )}
    </section>
  );
}

// Tangential pointers, de-emphasised, that open the existing pop-up sheet.
export function SeeAlso({ blocks }: { blocks: FlowBlock[] }) {
  const { getRule } = useData();
  const { openRule } = useUI();
  if (blocks.length === 0) return null;
  return (
    <section className="mt-6 border-t border-border-soft pt-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-faint">
        See also
      </h2>
      <div className="flex flex-wrap gap-2">
        {blocks.map((b) => {
          const rule = getRule(b.slug);
          if (!rule) return null;
          return (
            <button
              key={b.slug}
              onClick={() => openRule(b.slug)}
              className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm text-accent active:bg-surface-3"
            >
              {rule.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
