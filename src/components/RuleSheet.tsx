import { useEffect, useState } from 'react';
import { useUI } from '../state';
import { useBackClose } from '../lib/backStack';
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss';
import { RuleContent } from './RuleContent';

// One back-stack registrant per stacked rule level, so a hardware Back closes ONE rule at a time
// (matching the in-sheet "‹ Back" / Escape). Rendering one per level keeps the central LIFO stack
// in step with the rule stack; collapsing the whole stack (backdrop / ✕) unmounts each level and
// the hook's cleanup consumes its history entry, so Back stays balanced.
function RuleBackLayer({ onClose }: { onClose: () => void }) {
  useBackClose(true, onClose);
  return null;
}

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

  // Swiping the header down (on phones) closes the top rule, like Back / Esc.
  const { handleProps, sheetStyle } = useSwipeToDismiss(closeTopRule);

  if (!depth) return null;

  return (
    // DE REGELPAGINA HOORT BOVENOP, altijd. Hij stond op z-50 terwijl alles wat hem kan openen
    // hoger ligt: de InfoSheet op 80, de spreukenkiezer op 80, de compositieregels op 95. Tik je
    // in zo'n venster een regel aan, dan opende die eronder en zag je niets veranderen — je moest
    // eerst het venster wegklikken waar je net in zat (Joost, 17-08, screenshot Goblin-hewer ->
    // Hand Weapon). 210 ligt ook boven het eindoverzicht van een battle (200), zodat een regel die
    // je daar aantikt evengoed bovenkomt.
    //
    // Het onderliggende venster blijft BEWUST open: sluit je de regel, dan sta je weer in de
    // wapenlijst waar je vandaan kwam in plaats van op een leeg scherm.
    <div className={`fixed inset-0 flex ${wide ? 'items-center justify-center p-4' : 'flex-col justify-end'}`} style={{ zIndex: 210 }}>
      {/* One Back-trap per stacked rule: a hardware Back closes the top rule (one level). */}
      {sheetStack.map((slug, i) => (
        <RuleBackLayer key={`${slug}-${i}`} onClose={closeTopRule} />
      ))}
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
        style={{ animation: wide ? 'sheet-pop 0.18s ease-out' : 'sheet-up 0.22s ease-out', ...sheetStyle }}
      >
        <div className="flex items-center gap-2 border-b border-border-soft px-2 py-2" {...(wide ? {} : handleProps)} style={wide ? undefined : { touchAction: 'none' }}>
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
