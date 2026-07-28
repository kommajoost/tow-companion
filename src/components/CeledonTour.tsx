import { useCallback, useEffect, useRef, useState } from 'react';
import { TOW, towFont, engraved } from '../design/tow';
import { getPersisted, setPersisted, usePersistentState } from '../store';
import { useCampagnes } from '../lib/campaign';

// A guided walk-through for players arriving from Isle of Celedon who have never seen this app.
// It runs when `tow:celedon-tour` is 'pending' — set by the ?celedon=1 deep link on first arrival, or
// by "Show me around" in the campaign panel and in Settings. Finishing or skipping sets 'done', so it
// offers itself once and then stays out of the way.
//
// The tour walks from the campaign band into the builder and back out again: a step that talks about
// the points bar has to be standing next to the points bar, so it opens the player's campaign list
// (via `tow:builder-active`, which ListBuilder owns) and closes it again afterwards. It never touches
// the CONTENT of a list — no units are added on someone's behalf — and every step degrades to a
// centred card if its target is missing, so a redesign of the builder cannot break the tour.

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

interface Stap {
  /** Comma-separated selectors; the first VISIBLE match wins (the phone tab bar and the wide rail
   *  both exist in the DOM, only one of them has a size). Omit for a centred step. */
  doel?: string;
  titel: string;
  tekst: string;
  /** Uitgevoerd bij het BINNENKOMEN van deze stap: open de campagne-lijst, of ga terug naar het
   *  overzicht. Zo staan de builder-stappen ook echt in de builder. */
  actie?: 'open-lijst' | 'sluit-lijst';
}

function stappen(label: string, cap: number, fase: number): Stap[] {
  return [
    {
      titel: 'Welcome to Old World Companion',
      tekst:
        `This is where you build and carry your army for ${label}. It is also a rules companion for the table: ` +
        'every phase of a game, with the rules to hand. Two minutes and you will know your way around.',
      actie: 'sluit-lijst',
    },
    {
      doel: '[data-tour="celedon-panel"]',
      titel: 'Your campaign, at the top',
      tekst:
        `This band is your campaign. It shows the Act you are in and the ${cap}-point limit that goes with it, ` +
        'plus your faction and the composition you must use. All of it comes from the campaign — you cannot set it ' +
        'to the wrong thing here.',
    },
    {
      doel: '[data-tour="celedon-lijst"]',
      titel: 'Your list is already here',
      tekst:
        'We made it for you: right faction, right points limit, right composition. Nothing to set up — all that is ' +
        'left is choosing units. Let us open it.',
    },
    {
      doel: '[data-tour="lijst-punten"]',
      actie: 'open-lijst',
      titel: 'What you have spent',
      tekst:
        `Your points against the ${cap}-point limit, always in view. It turns to gold when you go over. The bars also ` +
        'watch how your army is divided: Core needs a minimum share, Special and Rare have a maximum.',
    },
    {
      doel: '[data-tour="lijst-toevoegen"]',
      titel: 'Adding units',
      tekst:
        'Units are grouped as Characters, Core, Special and Rare. Pick one, then set its size, equipment and magic ' +
        'items. There is no save button — everything you do is stored as you go.',
    },
    {
      doel: '[data-tour="lijst-naam"]',
      titel: 'Name and composition',
      tekst:
        'Tap any row in this Army block to rename the list or switch army composition (Grand Army, Renegade ' +
        'Crowns, …). On a phone you tap the list name in the header instead. Your faction, the points limit and ' +
        'the game mode come from the campaign, so those are shown but fixed.',
    },
    {
      doel: '[data-tour="tab-army"],[data-tour="rail-army"]',
      actie: 'sluit-lijst',
      titel: 'Back to your lists',
      tekst:
        'Army is where your lists live. You can keep as many as you like — only the campaign one counts for the ' +
        'campaign, and a copy is the safe place to try something out.',
    },
    {
      doel: '[data-tour="tab-play"],[data-tour="rail-play"]',
      titel: 'Turns and Rulebook',
      tekst:
        'Turns walks you through a battle phase by phase — movement, magic, shooting, combat — with the rule text ' +
        'one tap away. Rulebook next to it has the lot, searchable, quoted straight from tow.whfb.app. Both are ' +
        'there to look things up, at the table or at home.',
    },
    {
      doel: '[data-tour="tab-game"],[data-tour="rail-game"]',
      titel: 'Game — for later',
      tekst:
        'This is where a campaign battle is actually played and scored: casualties, victory points, and the result ' +
        'that travels back to Isle of Celedon. We will take you through it before your first battle. For now you can ' +
        'ignore it — the army list is the only thing that matters.',
    },
    {
      doel: '[data-tour="tab-settings"],[data-tour="rail-settings"]',
      titel: 'Settings',
      tekst:
        'Your account and your campaign. You are signed in with the same account as the campaign site, which is why ' +
        'this app already knows who you are. You can install the app to your home screen here, and restart this tour.',
    },
    {
      titel: 'That is all',
      tekst:
        'One job for now: your army list. Nothing to send or upload — the campaign reads it by itself. When you are ' +
        `happy with it, go back to Isle of Celedon and lock it in for Act ${fase}. Everything about playing a battle ` +
        'comes later, well before your first one.',
    },
  ];
}

/** Het id van de campagne-lijst van de actieve campagne, uit `tow:lists`. De tour heeft dat nodig om
 *  de builder te kunnen openen; de lijsten zelf blijven van ListBuilder. */
function campagneLijstId(spelerId: string | undefined): string | null {
  if (!spelerId) return null;
  const lijsten = getPersisted<unknown[]>('tow:lists', []);
  if (!Array.isArray(lijsten)) return null;
  for (const raw of lijsten) {
    const l = raw as { id?: string; campaign?: boolean; campaignSpeler?: string };
    if (l && l.campaign && l.id && l.campaignSpeler === spelerId) return l.id;
  }
  return null;
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

  // Bij (her)starten weer bij stap 1 beginnen. Zonder dit bleef `i` op de laatste stap staan van de
  // vorige keer, dus "Show me around" opende meteen "That is all" — de tour leek niet te herstarten.
  useEffect(() => { if (loopt) setI(0); }, [loopt]);

  const stapjes = stappen(actief?.label ?? 'Isle of Celedon', actief?.puntenCap ?? 500, actief?.fase ?? 1);
  const stap = stapjes[Math.min(i, stapjes.length - 1)];

  // Navigeren hoort bij de stap: de builder-stappen wijzen naar dingen die alleen bestaan als de lijst
  // OPEN staat. Daarom zet de tour zelf `tow:builder-active` — ListBuilder luistert daarop en opent de
  // builder. Loopt vóór de meting, zodat het doel er al staat als we gaan opmeten.
  useEffect(() => {
    if (!loopt || !stap?.actie) return;
    if (stap.actie === 'sluit-lijst') { setPersisted('tow:builder-active', null); return; }
    const id = campagneLijstId(actief?.speler.id);
    if (id) setPersisted('tow:builder-active', id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loopt, i, stap?.actie, actief?.speler.id]);

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
    // Ruim genoeg dat een net-geopende builder er al staat voordat we de laatste keer meten.
    const timers = [60, 200, 450, 800].map((ms) => window.setTimeout(meet, ms));
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
          // Net genoeg om de aandacht te sturen; op 0.72 was de rest van de app onleesbaar.
          boxShadow: '0 0 0 9999px rgba(20,14,8,0.42)',
          transition: 'top .18s ease, left .18s ease, width .18s ease, height .18s ease',
        }} />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,14,8,0.42)' }} />
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
