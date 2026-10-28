import { useEffect, useRef, useState } from 'react';

/** Waar een gesleepte lijst terechtkomt: een sectie (map-id of de "ungrouped"-sleutel), en eventueel de
 *  kaart waar hij vóór of ná komt. Zonder kaart gaat hij achteraan in die sectie. */
export interface SleepDoel {
  sectie: string;
  kaartId: string | null;
  voor: boolean;
}

/**
 * SLEPEN MET JE VINGER (Joost 28-10-2026): "drag and drop van die groepen werkt niet op mijn telefoon. Ik
 * kan geen lijsten draggen naar de groepen."
 *
 * WAAROM DIT NODIG IS. My lists gebruikt de sleepfunctie van de browser zelf (HTML5 `draggable`,
 * `onDragStart`/`onDrop`). Die werkt met een muis, maar een mobiele browser start hem niet met een
 * vinger — op de telefoon gebeurde er dus niets. Dit is de aanraakversie ernaast; de muisversie blijft
 * ongewijzigd.
 *
 * HOE HET VOELT. LANG DRUKKEN (≈0,4 s) pakt een lijst op — een trilling bevestigt het — en daarna sleep je
 * hem naar een plek tussen andere lijsten of op een map; loslaten zet hem neer. Beweeg je vóór die 0,4 s
 * al meer dan 10 px, dan was het gewoon scrollen en gebeurt er niets. Bij de rand van het scherm schuift
 * de lijst vanzelf mee, zodat je ook een map buiten beeld bereikt.
 *
 * DE CONTRACTEN. Een kaart die gesleept mag worden draagt `data-sleep-lijst` (het lijst-id),
 * `data-sleep-naam` en `data-sleep-sectie`; een sectie die iets mag ontvangen draagt `data-sleep-doel`.
 * Knoppen binnen een kaart die NIET mogen beginnen met slepen (dupliceren, verwijderen) dragen
 * `data-geen-sleep`. De touch-listeners zijn native en `touchmove` is niet-passief: React registreert
 * touch-events passief, en dan kan het scrollen tijdens het slepen niet worden tegengehouden.
 */
export function useAanraakSlepen(
  container: HTMLElement | null,
  opts: { onOver: (doel: SleepDoel | null) => void; onDrop: (lijstId: string, doel: SleepDoel) => void },
): { gesleept: { id: string; naam: string; x: number; y: number } | null; netGesleept: () => boolean } {
  const [gesleept, setGesleept] = useState<{ id: string; naam: string; x: number; y: number } | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  // Na het loslaten vuurt de browser soms nog een "click" op de kaart af; die mag de lijst niet openen.
  const klikNegerenTot = useRef(0);

  useEffect(() => {
    if (!container) return;
    let timer = 0;
    let start: { x: number; y: number } | null = null;
    let kandidaat: { id: string; naam: string } | null = null;
    let actief = false;
    let doel: SleepDoel | null = null;
    let laatsteY = 0;
    let rand = 0; // requestAnimationFrame-lus voor het meeschuiven bij de rand

    const doelOnder = (x: number, y: number): SleepDoel | null => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!el || !container.contains(el)) return null;
      const kaart = el.closest('[data-sleep-lijst]') as HTMLElement | null;
      if (kaart) {
        const r = kaart.getBoundingClientRect();
        return { sectie: kaart.dataset.sleepSectie ?? '', kaartId: kaart.dataset.sleepLijst ?? null, voor: y < r.top + r.height / 2 };
      }
      const sectie = el.closest('[data-sleep-doel]') as HTMLElement | null;
      return sectie ? { sectie: sectie.dataset.sleepDoel ?? '', kaartId: null, voor: false } : null;
    };

    const randLus = () => {
      if (!actief) { rand = 0; return; }
      const r = container.getBoundingClientRect();
      if (laatsteY < r.top + 56) container.scrollTop -= 9;
      else if (laatsteY > r.bottom - 56) container.scrollTop += 9;
      rand = requestAnimationFrame(randLus);
    };

    const opruimen = () => {
      window.clearTimeout(timer);
      timer = 0;
      start = null;
      kandidaat = null;
      doel = null;
      if (actief) {
        actief = false;
        optsRef.current.onOver(null);
        setGesleept(null);
      }
      if (rand) { cancelAnimationFrame(rand); rand = 0; }
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { opruimen(); return; }
      const doelEl = e.target as HTMLElement;
      if (doelEl.closest('[data-geen-sleep]')) return;
      const kaart = doelEl.closest('[data-sleep-lijst]') as HTMLElement | null;
      if (!kaart) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY };
      laatsteY = t.clientY;
      kandidaat = { id: kaart.dataset.sleepLijst ?? '', naam: kaart.dataset.sleepNaam ?? '' };
      timer = window.setTimeout(() => {
        if (!kandidaat || !start) return;
        actief = true;
        try { navigator.vibrate?.(15); } catch { /* geen trilmotor: geen probleem */ }
        setGesleept({ ...kandidaat, x: start.x, y: start.y });
        rand = requestAnimationFrame(randLus);
      }, 380);
    };

    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (!actief) {
        // Bewogen vóór het oppakken: dat is scrollen, geen slepen.
        if (start && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) opruimen();
        return;
      }
      e.preventDefault(); // tijdens het slepen scrolt de pagina niet onder je vinger weg
      laatsteY = t.clientY;
      setGesleept((g) => (g ? { ...g, x: t.clientX, y: t.clientY } : g));
      doel = doelOnder(t.clientX, t.clientY);
      optsRef.current.onOver(doel);
    };

    const onEnd = () => {
      if (actief && kandidaat) {
        const id = kandidaat.id;
        const waar = doel;
        if (waar && waar.kaartId !== id) optsRef.current.onDrop(id, waar);
        klikNegerenTot.current = Date.now() + 500;
      }
      opruimen();
    };

    // Lang drukken roept op Android anders een contextmenu of tekstselectie op.
    const onContext = (e: Event) => { if (kandidaat || actief) e.preventDefault(); };

    container.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', opruimen);
    container.addEventListener('contextmenu', onContext);
    return () => {
      container.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', opruimen);
      container.removeEventListener('contextmenu', onContext);
      window.clearTimeout(timer);
      if (rand) cancelAnimationFrame(rand);
    };
  }, [container]);

  return { gesleept, netGesleept: () => Date.now() < klikNegerenTot.current };
}
