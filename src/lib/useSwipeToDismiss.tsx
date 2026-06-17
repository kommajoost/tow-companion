import { useRef, useState } from 'react';

// Bottom-sheet "swipe down from the top to dismiss" gesture. Returns:
//  - handleProps: touch handlers to put on a top grab area (the DragHandle), so dragging there (not
//    the scrollable body) drives the dismiss.
//  - sheetStyle: a translateY that follows the finger for feedback; spread onto the sheet element.
// Releasing past ~90px closes; otherwise it springs back.
export function useSwipeToDismiss(onClose: () => void) {
  const start = useRef<number | null>(null);
  const cur = useRef(0); // latest offset, read synchronously on release (no stale-state batching)
  const [dy, setDy] = useState(0);

  const handleProps = {
    onTouchStart: (e: React.TouchEvent) => { start.current = e.touches[0].clientY; cur.current = 0; },
    onTouchMove: (e: React.TouchEvent) => {
      if (start.current == null) return;
      const d = e.touches[0].clientY - start.current;
      cur.current = d > 0 ? d : 0;
      setDy(cur.current);
    },
    onTouchEnd: () => { const d = cur.current; start.current = null; cur.current = 0; if (d > 90) onClose(); else setDy(0); },
  };

  const sheetStyle: React.CSSProperties = dy
    ? { transform: `translateY(${dy}px)`, transition: 'none' }
    : { transition: 'transform .2s ease' };

  return { handleProps, sheetStyle };
}

// The grab bar shown at the top of a bottom sheet. Spread the hook's handleProps onto it.
export function DragHandle(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '7px 0 3px', cursor: 'grab', touchAction: 'none', flexShrink: 0 }}
    >
      <div style={{ width: 38, height: 4, borderRadius: 99, background: 'rgba(120,90,40,0.4)' }} />
    </div>
  );
}
