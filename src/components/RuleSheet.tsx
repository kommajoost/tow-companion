import { useEffect } from 'react';
import { useUI } from '../state';
import { RuleContent } from './RuleContent';

// A bottom sheet that shows a rule looked up from an inline term. Tapping further
// terms pushes onto a stack, so you can drill down and step back without losing place.
export function RuleSheet() {
  const { sheetStack, closeTopRule, closeAllRules } = useUI();
  const depth = sheetStack.length;
  const top = sheetStack[depth - 1];

  // Lock background scroll + close on Escape while the sheet is open.
  useEffect(() => {
    if (!depth) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTopRule();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [depth, closeTopRule]);

  if (!depth) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
        onClick={closeAllRules}
      />
      <div
        key={top}
        className="relative flex max-h-[88vh] flex-col rounded-t-2xl border-t-2 border-accent-2 bg-surface shadow-2xl"
        style={{ animation: 'sheet-up 0.22s ease-out' }}
      >
        <div className="flex items-center gap-2 border-b border-border-soft px-2 py-2">
          {depth > 1 ? (
            <button
              onClick={closeTopRule}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-ink-dim active:bg-surface-2"
            >
              ‹ Back
            </button>
          ) : (
            <span className="px-2 text-xs uppercase tracking-widest text-ink-faint">
              Rule
            </span>
          )}
          <div className="mx-auto h-1 w-10 rounded-full bg-border" />
          <button
            onClick={closeAllRules}
            aria-label="Close"
            className="rounded-lg px-3 py-1.5 text-lg text-ink-dim active:bg-surface-2"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          <RuleContent slug={top} />
        </div>
      </div>

      <style>{`@keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}
