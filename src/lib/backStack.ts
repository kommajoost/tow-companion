import { useEffect } from 'react';

type Entry = { close: () => void };
const stack: Entry[] = [];
let installed = false;
// Count of history.back() calls we made ourselves from a cleanup (UI close). Their popstate is
// indistinguishable from a real Back press, so we skip exactly that many before treating a pop as
// a user Back — otherwise closing a nested layer via the UI would cascade and close the one below.
let selfPops = 0;

function onPop() {
  if (selfPops > 0) { selfPops--; return; } // our own cleanup back(): consume, don't close a layer
  // The browser already popped our trap entry; let the TOP layer close itself.
  const top = stack[stack.length - 1];
  if (top) { stack.pop(); top.close(); }
}
function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('popstate', onPop);
}

/** True when no overlay/builder layer is currently trapping Back — used by the tab-level
 *  handler so it only treats a Back press as a tab-back when no layer consumed it. */
export const backStackEmpty = () => stack.length === 0;

/** While `active`, intercept one Back press to run `close()` instead of leaving the app.
 *  Nesting works (LIFO): the most-recently-opened active layer handles Back first.
 *  Closing via the UI (active → false) consumes the pushed history entry so Back stays balanced. */
export function useBackClose(active: boolean, close: () => void) {
  useEffect(() => {
    if (!active) return;
    install();
    const entry: Entry = { close };
    stack.push(entry);
    window.history.pushState({ towBack: true }, '');
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) {
        // Closed by the app (not by a Back press, which would have popped it already):
        // remove from the stack and consume our extra history entry. Flag the resulting popstate
        // as self-initiated so onPop doesn't mistake it for a Back and close the layer below.
        stack.splice(i, 1);
        if (window.history.state && window.history.state.towBack) { selfPops++; window.history.back(); }
      }
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps  (close captured at open time)
}
