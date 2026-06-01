import { useMemo, useRef, useEffect } from 'react';
import { useData } from '../data';
import { useUI } from '../state';
import { usePersistentState } from '../store';
import { RuleContent } from './RuleContent';
import { FlowView } from './flow/FlowView';
import type { Phase } from '../types';

const SHORT_NAME: Record<string, string> = {
  'the-strategy-phase': 'Strategy',
  'the-movement-phase': 'Movement',
  'the-shooting-phase': 'Shooting',
  'the-combat-phase': 'Combat',
  magic: 'Magic',
};

export function PlayMode() {
  const data = useData();
  const { getRule } = data;
  const { isChecked, toggleChecked, clearChecked, countChecked } = useUI();

  // The four turn phases, plus Magic as a handy reference tab (spells are cast
  // throughout the turn, so the rules are useful to have at hand).
  const phases = useMemo<Phase[]>(() => {
    const keep = (slugs: string[]) =>
      slugs.filter((s) => getRule(s) && !data.hiddenSteps.has(s));
    const list = data.turn.phases.map((p) => ({
      slug: p.slug,
      name: p.name,
      stepSlugs: keep(p.stepSlugs),
    }));
    if (data.turn.magicSlug && getRule(data.turn.magicSlug)) {
      const m = getRule(data.turn.magicSlug)!;
      list.push({ slug: m.slug, name: m.name, stepSlugs: keep(m.childSlugs) });
    }
    return list;
  }, [data, getRule]);

  const [phaseIndex, setPhaseIndex] = usePersistentState('tow:play:phase', 0);
  // The open step slug, or null while showing the phase's step list.
  const [stepSlug, setStepSlug] = usePersistentState<string | null>(
    'tow:play:step',
    null,
  );

  const safePhaseIndex = Math.min(phaseIndex, phases.length - 1);
  const phase = phases[safePhaseIndex];

  // Flat sequence of every step across every phase, for linear Prev/Next.
  const flat = useMemo(
    () =>
      phases.flatMap((p, pi) =>
        p.stepSlugs.map((slug) => ({ phaseIndex: pi, slug })),
      ),
    [phases],
  );

  const goToStep = (pi: number, slug: string) => {
    setPhaseIndex(pi);
    setStepSlug(slug);
  };

  const flatPos = stepSlug
    ? flat.findIndex((f) => f.phaseIndex === safePhaseIndex && f.slug === stepSlug)
    : -1;

  const step = (delta: number) => {
    if (flatPos < 0) return;
    const next = flat[flatPos + delta];
    if (next) goToStep(next.phaseIndex, next.slug);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Phase tabs */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-border bg-surface/80 px-3 py-2 backdrop-blur">
        {phases.map((p, i) => {
          const total = p.stepSlugs.length;
          const done = countChecked(p.stepSlugs);
          const active = i === safePhaseIndex;
          return (
            <button
              key={p.slug}
              onClick={() => {
                setPhaseIndex(i);
                setStepSlug(null);
              }}
              className={`flex shrink-0 flex-col items-center rounded-xl border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? 'border-accent-2 bg-surface-3 text-gold'
                  : 'border-border bg-surface-2 text-ink-dim'
              } ${p.slug === 'magic' ? 'italic' : ''}`}
            >
              <span className="font-display font-semibold">
                {SHORT_NAME[p.slug] ?? p.name}
              </span>
              <span className="text-[10px] text-ink-faint">
                {done}/{total}
              </span>
            </button>
          );
        })}
      </div>

      {stepSlug ? (
        <StepDetail
          slug={stepSlug}
          phaseName={SHORT_NAME[phase.slug] ?? phase.name}
          position={flatPos}
          total={flat.length}
          onList={() => setStepSlug(null)}
          onPrev={flatPos > 0 ? () => step(-1) : undefined}
          onNext={flatPos < flat.length - 1 ? () => step(1) : undefined}
        />
      ) : (
        <PhaseList
          phase={phase}
          intro={getRule(phase.slug)?.bodyIndex}
          isChecked={isChecked}
          toggleChecked={toggleChecked}
          onReset={() => clearChecked(phase.stepSlugs)}
          onOpen={(slug) => goToStep(safePhaseIndex, slug)}
        />
      )}
    </div>
  );
}

function PhaseList({
  phase,
  intro,
  isChecked,
  toggleChecked,
  onReset,
  onOpen,
}: {
  phase: Phase;
  intro?: string;
  isChecked: (s: string) => boolean;
  toggleChecked: (s: string) => void;
  onReset: () => void;
  onOpen: (slug: string) => void;
}) {
  const { getRule } = useData();
  const done = phase.stepSlugs.filter(isChecked).length;
  const total = phase.stepSlugs.length;

  return (
    <div className="flex-1 overflow-y-auto px-3 pb-28 pt-3">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gold">{phase.name}</h1>
          <p className="text-xs text-ink-faint">
            {done} of {total} steps done this turn
          </p>
        </div>
        {done > 0 && (
          <button
            onClick={onReset}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-ink-dim active:bg-surface-2"
          >
            Reset turn
          </button>
        )}
      </div>

      {intro && (
        <p className="mb-4 rounded-xl border border-border-soft bg-surface-2 p-3 text-sm leading-relaxed text-ink-dim">
          {intro}
        </p>
      )}

      <ol className="space-y-1.5">
        {phase.stepSlugs.map((slug, i) => {
          const rule = getRule(slug);
          const checked = isChecked(slug);
          return (
            <li key={slug}>
              <div
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  checked
                    ? 'border-border-soft bg-surface/50'
                    : 'border-border bg-surface-2'
                }`}
              >
                <button
                  aria-label="Toggle done"
                  onClick={() => toggleChecked(slug)}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-sm ${
                    checked
                      ? 'border-accent-2 bg-accent-2 text-white'
                      : 'border-border bg-bg text-transparent'
                  }`}
                >
                  ✓
                </button>
                <button
                  onClick={() => onOpen(slug)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="font-mono text-xs text-ink-faint">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={`truncate ${
                      checked ? 'text-ink-faint line-through' : 'text-ink'
                    }`}
                  >
                    {rule?.name ?? slug}
                  </span>
                </button>
                <span className="text-ink-faint">›</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepDetail({
  slug,
  phaseName,
  position,
  total,
  onList,
  onPrev,
  onNext,
}: {
  slug: string;
  phaseName: string;
  position: number;
  total: number;
  onList: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const { isChecked, toggleChecked } = useUI();
  const { getFlow } = useData();
  const flow = getFlow(slug);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to top whenever the step changes.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [slug]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border-soft px-3 py-2 text-sm">
        <button
          onClick={onList}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-ink-dim active:bg-surface-2"
        >
          ≡ Steps
        </button>
        <span className="ml-auto text-xs text-ink-faint">
          {phaseName} · {position + 1} / {total}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-28 pt-4">
        {flow ? <FlowView slug={slug} flow={flow} /> : <RuleContent slug={slug} />}
      </div>

      {/* Sticky walkthrough nav */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 border-t border-border bg-surface/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <button
          onClick={onPrev}
          disabled={!onPrev}
          className="rounded-xl border border-border px-4 py-3 text-sm text-ink-dim disabled:opacity-30 active:bg-surface-2"
        >
          ‹ Prev
        </button>
        <button
          onClick={() => toggleChecked(slug)}
          className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold ${
            isChecked(slug)
              ? 'border-accent-2 bg-surface-3 text-gold'
              : 'border-border bg-surface-2 text-ink'
          }`}
        >
          {isChecked(slug) ? '✓ Done' : 'Mark done'}
        </button>
        <button
          onClick={onNext}
          disabled={!onNext}
          className="rounded-xl border border-accent-2 bg-accent-2/20 px-4 py-3 text-sm font-semibold text-gold disabled:opacity-30 active:bg-accent-2/40"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
