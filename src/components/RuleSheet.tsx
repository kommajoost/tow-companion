import { useEffect, useState } from 'react';
import { useUI } from '../state';
import { RuleContent } from './RuleContent';

// Shows a rule looked up from an inline term. Tapping further terms pushes onto a stack, so you
// can drill down and step back without losing place. On phones it's a bottom sheet; on wide
// screens a smaller centred dialog (a full-width bottom sheet reads far too wide on a laptop).
export function RuleSheet() {
  const { sheetStack, closeTopRule, closeAllRules } = useUI();
  const depth = sheetStack.length;
  const top = sheetStack[depth - 1];

  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 800);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= 800);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

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
    <div className={`fixed inset-0 z-50 flex ${wide ? 'items-center justify-center p-4' : 'flex-col justify-end'}`}>
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
        onClick={closeAllRules}
      />
      <div
        key={top}
        className={
          wide
            ? 'relative flex w-full max-w-[560px] max-h-[82vh] flex-col rounded-2xl border border-accent-2 bg-surface shadow-2xl'
            : 'relative flex max-h-[88vh] flex-col rounded-t-2xl border-t-2 border-accent-2 bg-surface shadow-2xl'
        }
        style={{ animation: wide ? 'sheet-pop 0.18s ease-out' : 'sheet-up 0.22s ease-out' }}
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
          {!wide && <div className="mx-auto h-1 w-10 rounded-full bg-border" />}
          <button
            onClick={closeAllRules}
            aria-label="Close"
            className="ml-auto rounded-lg px-3 py-1.5 text-lg text-ink-dim active:bg-surface-2"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          <RuleContent slug={top} />
        </div>
      </div>

      <style>{`
        @keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes sheet-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}
