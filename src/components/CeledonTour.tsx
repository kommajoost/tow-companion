import { useCallback, useEffect, useRef, useState } from 'react';
import { TOW, towFont, engraved } from '../design/tow';
import { usePersistentState } from '../store';
import { useCampagnes } from '../lib/campaign';

// A guided walk-through for players arriving from Isle of Celedon who have never seen this app.
// It runs when `tow:celedon-tour` is 'pending' — set by the ?celedon=1 deep link on first arrival, or
// by "Show me around" in the campaign panel and in Settings. Finishing or skipping sets 'done', so it
// offers itself once and then stays out of the way.
//
// The tour explains the Army tab and the four tabs; it deliberately does NOT drive the builder from
// the outside. A tour that clicks through another screen's controls breaks the moment that screen
// changes, and it would be steering someone else's list. Step 4 describes what the builder does
// instead, which survives a redesign.

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

interface Stap {
  /** Comma-separated selectors; the first VISIBLE match wins (the phone tab bar and the wide rail
   *  both exist in the DOM, only one of them has a size). Omit for a centred step. */
  doel?: string;
  titel: string;
  tekst: string;
}

/** `heeftLijst` swaps step 3: "start your list" versus "here it is". */
function stappen(heeftLijst: boolean, label: string, cap: number, fase: number): Stap[] {
  return [
    {
      titel: 'Welcome to Old World Companion',
      tekst:
        `This is where you build and carry your army for ${label}. It is also a rules companion for the table: ` +
        'every phase of a game, with the rules to hand. Two minutes and you will know your way around.',
    },
    {
      doel: '[data-tour="celedon-panel"]',
      titel: 'Your campaign, at the top',
      tekst:
        `This band is your campaign. It shows the Act you are in and the ${cap}-point limit that goes with it, ` +
        'plus your faction and the composition you must use. All of it comes from the campaign — you cannot set it ' +
        'to the wrong thing here.',
    },
    heeftLijst
      ? {
          doel: '[data-tour="celedon-lijst"]',
          titel: 'Your campaign army',
          tekst:
            'Your list, with what it costs against the limit. Tap it to open the builder and keep working on it. ' +
            'There is no save button — it saves as you go.',
        }
      : {
          doel: '[data-tour="celedon-start"]',
          titel: 'Start here',
          tekst:
            'One button. It creates your campaign list with the faction, the points limit and the composition rule ' +
            'already set, so you only have to pick units.',
        },
    {
      titel: 'Inside the builder',
      tekst:
        'Units are grouped as Characters, Core, Special and Rare. Add what you like; the bar at the top counts your ' +
        'points against the limit and warns you when a category takes too much or too little of your army. Red means ' +
        'the list is not legal yet.',
    },
    {
      doel: '[data-tour="tab-army"],[data-tour="rail-army"]',
      titel: 'Army',
      tekst: 'Your lists live here. You can keep as many as you like — only the campaign one counts for the campaign.',
    },
    {
      doel: '[data-tour="tab-play"],[data-tour="rail-play"]',
      titel: 'Turns',
      tekst:
        'On game night: walk through a turn phase by phase — movement, magic, shooting, combat — with the rule text ' +
        'one tap away. Handy even if you have played for years.',
    },
    {
      doel: '[data-tour="tab-browse"],[data-tour="rail-browse"]',
      titel: 'Rulebook',
      tekst: 'The full rules, searchable. Quoted verbatim from tow.whfb.app, so it is the same wording as the book.',
    },
    {
      doel: '[data-tour="tab-settings"],[data-tour="rail-settings"]',
      titel: 'Settings',
      tekst:
        'Your account and your campaign. You are signed in with the same account as the campaign site, which is why ' +
        'this app already knows who you are. You can also install the app to your home screen here.',
    },
    {
      titel: 'That is all',
      tekst:
        `Nothing to send or upload: the campaign reads your list by itself. When you are happy with it, go back to ` +
        `Isle of Celedon and lock it in for Act ${fase}.`,
    },
  ];
}

/** The first match with an actual size — the phone tab bar and the wide rail are both in the DOM. */
function vindDoel(selectors: string): HTMLElement | null {
  const alle = Array.from(document.querySelectorAll<HTMLElement>(selectors));
  return alle.find((el) => el.getBoundingClientRect().width > 0) ?? null;
}

export function CeledonTour() {
  const [stand, setStand] = usePersistentState<string | null>('tow:celedon-tour', null);
  const { actief } = useCampagnes();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const loopt = stand === 'pending';

  // Heeft de speler al een campagne-lijst? Dat leiden we af uit de DOM — staat de lijst-knop van het
  // paneel er, dan is er een lijst. Zo hoeft de tour de lijsten niet zelf te kennen. Na de mount
  // meten, niet tijdens het renderen: het paneel wordt in dezelfde commit gemonteerd en bestaat dan
  // nog niet.
  const [heeftLijst, setHeeftLijst] = useState(false);
  useEffect(() => {
    if (!loopt) return;
    const t = window.setTimeout(() => setHeeftLijst(!!document.querySelector('[data-tour="celedon-lijst"]')), 100);
    return () => window.clearTimeout(t);
  }, [loopt]);

  const stapjes = stappen(heeftLijst, actief?.label ?? 'Isle of Celedon', actief?.puntenCap ?? 500, actief?.fase ?? 1);
  const stap = stapjes[Math.min(i, stapjes.length - 1)];

  // De selector van de HUIDIGE stap in een ref, tijdens het renderen bijgewerkt. De meter leest hem
  // daaruit en is daardoor stabiel: een meting kan nooit nog naar de vorige stap wijzen. (Met de
  // selector in de useCallback-deps liep de spotlight één stap achter — memoisatie en een timeout die
  // elkaar net verkeerd raken.) Meten scrollt NOOIT: scrollen vanuit een scroll-handler voedt zichzelf.
  const doelRef = useRef<string | undefined>(undefined);
  doelRef.current = stap?.doel;

  const meet = useCallback(() => {
    const sel = doelRef.current;
    if (!sel) { setRect(null); return; }
    const el = vindDoel(sel);
    setRect(el ? el.getBoundingClientRect() : null);
  }, []);

  // Bij een nieuwe stap: het doel één keer in beeld scrollen, dan een paar keer opmeten terwijl de
  // layout tot rust komt. GEEN requestAnimationFrame: in een ingebedde webview loopt die soms niet, en
  // dan zou de spotlight nooit verschijnen.
  useEffect(() => {
    if (!loopt) return;
    const sel = doelRef.current;
    if (!sel) { setRect(null); return; }
    const el = vindDoel(sel);
    if (el) { try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch { /* oudere webview */ } }
    meet();
    const timers = [60, 200, 450].map((ms) => window.setTimeout(meet, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [loopt, i, meet]);

  useEffect(() => {
    if (!loopt) return;
    window.addEventListener('resize', meet);
    window.addEventListener('scroll', meet, true);
    return () => { window.removeEventListener('resize', meet); window.removeEventListener('scroll', meet, true); };
  }, [loopt, meet]);

  // Escape sluit de tour af, net als "Skip".
  useEffect(() => {
    if (!loopt) return;
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') setStand('done'); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [loopt, setStand]);

  if (!loopt || !stap) return null;

  const laatste = i >= stapjes.length - 1;
  // Kaart onderaan, tenzij het doel daar zit — dan bovenaan. Geen popper-rekenwerk: dat zit er altijd
  // net naast op een telefoon, en dit leest op elk formaat goed.
  const doelLaag = rect ? rect.top + rect.height / 2 > window.innerHeight * 0.55 : false;

  const pad = 8;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} role="dialog" aria-modal="true" aria-label="Guided tour">
      {/* Spotlight: één element dat tegelijk de rest dimt (enorme box-shadow) en het doel omlijnt.
          Zonder doel valt het terug op een egale dimlaag. */}
      {rect ? (
        <div style={{
          position: 'fixed',
          top: rect.top - pad, left: rect.left - pad,
          width: rect.width + pad * 2, height: rect.height + pad * 2,
          borderRadius: 14, pointerEvents: 'none',
          border: `2px solid ${TOW.goldBright}`,
          boxShadow: '0 0 0 9999px rgba(20,14,8,0.72)',
          transition: 'top .18s ease, left .18s ease, width .18s ease, height .18s ease',
        }} />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,14,8,0.72)' }} />
      )}

      <div style={{
        position: 'fixed', left: 0, right: 0,
        [doelLaag ? 'top' : 'bottom']: 0,
        padding: '14px 14px calc(14px + env(safe-area-inset-bottom, 0px))',
        display: 'flex', justifyContent: 'center',
      }}>
        <div style={{
          width: '100%', maxWidth: 440, background: TOW.panel,
          border: `1px solid ${TOW.lineStrong}`, borderRadius: 16, padding: 16,
          boxShadow: '0 18px 50px rgba(20,14,8,0.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ ...eb, fontSize: 8, color: TOW.goldDeep }}>{i + 1} / {stapjes.length}</span>
            <span style={{ flex: 1, height: 1, background: TOW.line }} />
            <button onClick={() => setStand('done')} style={{
              border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
              fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted, textDecoration: 'underline',
            }}>Skip</button>
          </div>
          <h2 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 18, color: TOW.ink, margin: '0 0 6px' }}>{stap.titel}</h2>
          <p style={{ fontFamily: towFont.serif, fontSize: 14, lineHeight: 1.6, color: TOW.parchDim, margin: 0 }}>{stap.tekst}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {i > 0 && (
              <button onClick={() => setI((n) => Math.max(0, n - 1))} style={{
                padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${TOW.lineStrong}`, background: 'transparent', color: TOW.parchDim,
                fontFamily: towFont.display, fontWeight: 600, fontSize: 13,
              }}>Back</button>
            )}
            <button
              onClick={() => (laatste ? setStand('done') : setI((n) => n + 1))}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                border: 'none', background: goldGrad, color: TOW.onGrad,
                fontFamily: towFont.display, fontWeight: 700, fontSize: 13.5,
              }}>{laatste ? 'Got it' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
