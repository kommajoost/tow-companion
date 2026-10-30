import { useEffect, useRef, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { usePersistentState } from '../../store';
import { listTotal } from '../../lib/builderToArmy';
import { compName } from '../../lib/armies';
import { useLijstNaarLeger } from '../../lib/lijstNaarLeger';
import type { BuilderList } from '../../lib/owbBuilder';
import type { Army } from '../../types';
import { useCampagnes, isCampagneLijst } from '../../lib/campaign';

// Reusable picker over the player's saved builder lists (tow:lists). Loads each list's army
// catalogue plus the stat + magic-item data, converts the chosen list into a game Army and hands
// it back via onPick. Renders nothing when there are no saved lists. Used on the Game setup screen
// and inside a live/solo game when adding your own — or your opponent's — army from your lists.

const eb = engraved as React.CSSProperties;
interface SavedList extends BuilderList { id: string; name: string; army: string; createdAt: number; updatedAt: number; groupId?: string | null }
/** Een map uit "My lists" (ListBuilder, `tow:list-groups`). */
interface LijstGroep { id: string; name: string }
/** Sectie-sleutel voor lijsten zonder (bestaande) map — dezelfde als in ListBuilder. */
const UNGROUPED = '__ungrouped__';

export function ArmyListPicker({ onPick, label, lockedListName = null, campaignPlayerId = null, lockedListArmy = null, autoPick = false, stil = false, lijsten = null, gekozenId = null, onKiesId, zonderScheiding = false }: {
  onPick: (a: Army) => void;
  label?: string;
  lockedListName?: string | null;
  /** Campagne-speler-id waarvoor dit een campagne-battle is. Hiermee vinden we de campagne-lijst op zijn
   *  ID (de gelockte lijst, dan de server-wijzer; sinds 04-10-2026) in plaats van op naam. Naam-matching
   *  brak zodra de lijst hernoemd was ná het locken, of als een ander device 'm anders had staan — en
   *  dan kreeg je de gewone "kies een lijst"-picker, alsof het geen campagne-battle was (Joost 30-07). */
  campaignPlayerId?: string | null;
  /** Leger-slug van de gelockte lijst — gebruikt om bij dubbele lijstnamen de juiste te kiezen. */
  lockedListArmy?: string | null;
  /** With a locked campaign list, hand it over as soon as it can be built — no click. There is nothing
   *  to choose: the campaign already decided which list plays, so asking was busywork. */
  autoPick?: boolean;
  /** QUIET (14-08-2026, Joost). With `autoPick` the block below was purely informational — and on the
   *  campaign-battle screen it duplicated the briefing at the top, which already names both lists and
   *  does so authoritatively (server-side snapshot, not this device's copy). Two blocks both headed
   *  "Your locked campaign list", one of them the OPPONENT's, on top of the pair already listed above.
   *  With this on, a found list loads silently; the picker only appears when the list ISN'T on this
   *  device — which is exactly the case where you do need to act. */
  stil?: boolean;
  /** Laat de regel "— or paste an export below —" weg (28-10-2026). De wizard zet er zelf kopjes onder
   *  ("Or open a share code", "Or paste an Old World Builder export"); met deze regel erbij stond er twee
   *  keer "or paste", en de eerste klopte niet eens: eronder kwam eerst de deelcode. */
  zonderScheiding?: boolean;
  /** SCENARIO LAB (23-10-2026, test-build): kies uit DEZE lijsten in plaats van uit `tow:lists`. Het lab
   *  geeft er zijn vaste mock-legers mee, zodat ze dezelfde omzetting krijgen als een speler-lijst zonder
   *  ooit in de opgeslagen lijsten van dit apparaat te belanden. */
  lijsten?: SavedList[] | null;
  /** De lijst die in dit vak het laatst gekozen is (Joost 28-10-2026). Zijn map staat open en de rij is
   *  goud gemarkeerd, zodat "Change" je terugbrengt waar je was in plaats van voor een dichte stapel. */
  gekozenId?: string | null;
  /** Krijgt het id van de aangeklikte lijst, naast `onPick`. Bewust een APARTE prop en geen tweede
   *  argument van `onPick`: bestaande aanroepers geven `setMyArmy` e.d. rechtstreeks door, en die
   *  horen geen onverwacht tweede argument te krijgen. */
  onKiesId?: (id: string) => void;
}) {
  // Lists can span different armies, so we keep a per-army catalogue cache + army metadata and
  // convert each list with ITS OWN catalogue/faction/composition.
  const [opgeslagen] = usePersistentState<SavedList[]>('tow:lists', []);
  const lists = lijsten ?? opgeslagen;
  // De mappen van "My lists". Alleen LEZEN: de picker ordent ermee, maar beheert ze niet.
  const [groepen] = usePersistentState<LijstGroep[]>('tow:list-groups', []);
  const { actief: campagne } = useCampagnes();
  // Catalogus, statlines, magic items, overlays en de omzetting zelf: gedeeld met de battle-wizard
  // (deelcode, geplakte New Recruit-lijst) via useLijstNaarLeger (30-10-2026). Hetzelfde recept dat
  // hier altijd stond, nu op één plek.
  const omzetter = useLijstNaarLeger(lists);
  const armyNameFor = omzetter.legerNaam;
  const toArmy = (l: SavedList): Army | null => omzetter.naarLeger(l);

  // Campaign battle: the list is already locked in the campaign, so match it by name and show ONLY
  // that one — no picking, and no override either. If the name match fails on this device there is no
  // locked list to show, and it falls back to the full picker with the original label; that is the
  // honest failure, rather than offering a swap that would disagree with the campaign.
  const normName = (s: string) => (s || '').trim().toLowerCase();
  // Eerst op ID, dan pas op naam (04-10-2026). De naam is de zwakste schakel: die verandert zodra je je
  // lijst hernoemt, terwijl de battle de naam bewaart die hij bij het locken zag. Volgorde:
  //   1. de GELOCKTE lijst van deze Act (`lijstId` = towc_spel_lijst.lijst_uid), want die speelt;
  //   2. DE campagnelijst (de server-wijzer, isCampagneLijst);
  // allebei alleen als dit de battle van de ingelogde speler zelf is. Was: de eerste lijst met de
  // markering `campaign` + `campaignSpeler`, en dat kon een gemarkeerde kopie zijn. De markering telt
  // alleen nog op een server zonder wijzers (isCampagneLijst valt dan zelf terug).
  const eigenCampagne = !!campaignPlayerId && !!campagne && campagne.speler.id === campaignPlayerId ? campagne : null;
  const opVlag = eigenCampagne
    ? (eigenCampagne.lijstId ? lists.find((l) => l.id === eigenCampagne.lijstId) : undefined)
      ?? lists.find((l) => isCampagneLijst(l, eigenCampagne))
      ?? null
    : campaignPlayerId
      // Geen (passende) context geladen: de oude markering, alleen lezen.
      ? lists.find((l) => {
          const x = l as unknown as { campaign?: boolean; campaignSpeler?: string };
          return x.campaign === true && x.campaignSpeler === campaignPlayerId;
        }) ?? null
      : null;
  // Naam-terugval: namen zijn NIET uniek (twee lijsten "Playtest army", één dark-elves en één
  // wood-elf-realms). Daarom eerst een naam+leger-match, en alleen als dat niets geeft naam alleen —
  // anders laadt hij het verkeerde leger onder de juiste naam.
  const opNaam = lockedListName
    ? lists.find((l) => normName(l.name) === normName(lockedListName)
        && (!lockedListArmy || normName(l.army) === normName(lockedListArmy)))
      ?? lists.find((l) => normName(l.name) === normName(lockedListName))
      ?? null
    : null;
  const locked = opVlag ?? opNaam;
  const solo = !!locked;
  const shown = solo ? [locked] : lists;
  // Een expliciet `label` wint ALTIJD. Stond hier `solo ? 'Your locked campaign list' : label`, en
  // daardoor kreeg ook de picker van de AI-TEGENSTANDER dat kopje — zijn lijst stond dus onder "jouw"
  // gelockte lijst (Joost 14-08).
  const heading = label ?? (solo ? 'Your locked campaign list' : 'Choose one of your saved army lists');

  // AUTO-PICK. With a locked campaign list there is nothing to choose — the campaign already decided
  // which list plays — so it is handed over as soon as it can actually be built. Guarded by a ref so it
  // fires exactly once: `toArmy` returns null until the catalogue, stat index and any composition
  // overlay have loaded, and this effect re-runs as each of those arrives.
  const autoPicked = useRef(false);
  useEffect(() => {
    if (!autoPick || autoPicked.current || !locked) return;
    const army = toArmy(locked);
    if (!army) return;            // data still loading — a later run catches it
    autoPicked.current = true;
    onPick(army);
    // `toArmy` and `onPick` are new identities every render; the ref is what makes this idempotent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPick, locked, omzetter]);

  // ── GEGROEPEERD ZOALS "MY LISTS" (Joost 28-10-2026) ──────────────────────────────────────────
  // "Het kiezen van je armylijsten is erg onduidelijk: je verliest je groepen, en ik moet in een mega
  // lange rommelige lijst zoeken." Dus dezelfde indeling als het My lists-scherm (ListBuilder): eerst
  // de mappen in de volgorde van `tow:list-groups`, binnen een map de lijsten in de volgorde van
  // `tow:lists`, en onderaan "Ungrouped" (geen map, of een map die niet meer bestaat). Anders dan daar
  // vallen LEGE mappen hier weg: dit is een kiezer, geen sleepdoel. Valt alles in één sectie (geen
  // mappen, of het Scenario lab met zijn eigen mock-lijsten), dan blijft het een platte lijst — net als
  // My lists zonder mappen. Een gelockte campagnelijst blijft altijd die ene rij.
  const groepIds = new Set(groepen.map((g) => g.id));
  const secties = locked ? [] : [
    ...groepen.map((g) => ({ key: g.id, titel: g.name, ls: lists.filter((l) => l.groupId === g.id) })),
    { key: UNGROUPED, titel: 'Ungrouped', ls: lists.filter((l) => !l.groupId || !groepIds.has(l.groupId)) },
  ].filter((sec) => sec.ls.length > 0);
  const gegroepeerd = secties.length > 1;

  // Welke mappen open staan. Beginstand: alléén de map van de gekozen lijst; zonder keuze alles dicht,
  // zodat je eerst het overzicht van je mappen ziet en niet weer die lange lijst. Lokale stand — het
  // inklappen op My lists (`tow:list-groups-collapsed`) blijft van dat scherm.
  const gekozenSectie = gekozenId ? secties.find((sec) => sec.ls.some((l) => l.id === gekozenId))?.key ?? null : null;
  const [open, setOpen] = useState<string[]>(() => (gekozenSectie ? [gekozenSectie] : []));
  const wissel = (key: string) => setOpen((o) => (o.includes(key) ? o.filter((k) => k !== key) : [...o, key]));

  // Every hook has run by here, so these early returns are safe.
  if (lists.length === 0) return null;
  // STIL: de lijst is gevonden en wordt vanzelf geladen — dan is er niets te kiezen en niets te
  // melden. Alleen als hij NIET gevonden is blijft het blok staan, want dan moet je zelf iets doen.
  if (stil && locked) return null;

  const rij = (l: SavedList) => {
    const data = omzetter.catalogusVoor(l);
    const total = data ? listTotal(l, data.cat, data.itemPool ?? undefined) : null;
    const ready = !!data;
    // The locked list gets a gold "open me" accent — and so does the list you already picked here.
    const primary = solo || (!!gekozenId && l.id === gekozenId);
    // GEEN UNIT-AANTAL MEER (Joost 28-10-2026: "het aantal units is daar niet relevant"). Wel de factie
    // (+ composition, zelfde fluisterregel als op My lists) en de punten.
    return (
      <button key={l.id} disabled={!ready} onClick={() => { const a = toArmy(l); if (a) { onKiesId?.(l.id); onPick(a); } }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '9px 13px', borderRadius: 11, cursor: ready ? 'pointer' : 'default', border: `1px solid ${primary ? TOW.goldDeep : TOW.line}`, background: primary ? 'rgba(184,134,47,0.12)' : TOW.panel2, opacity: ready ? 1 : 0.55 }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 15, color: primary ? TOW.goldDeep : TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
          <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{armyNameFor(l.army)} · {compName(l.composition, l.army)}</span>
        </span>
        <span style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>{ready ? `${total ?? '…'}/${l.points} pts` : 'loading…'}</span>
      </button>
    );
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...eb, fontSize: 9, color: TOW.muted, marginBottom: 7 }}>{heading}</div>
      {/* De campagne verwacht een gelockte lijst, maar dit apparaat kan 'm niet vinden. Zonder deze regel
          verscheen gewoon de normale keuzelijst en leek het alsof het geen campagne-battle was. */}
      {!locked && (lockedListName || campaignPlayerId) && (
        <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted, lineHeight: 1.4, marginBottom: 8 }}>
          {lockedListName
            ? `Your campaign list “${lockedListName}” is not on this device yet — sync your lists (Settings) or pick it by hand below.`
            : 'No campaign list found on this device yet — sync your lists (Settings) or pick one by hand below.'}
        </div>
      )}
      {gegroepeerd ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {secties.map((sec) => {
            const isOpen = open.includes(sec.key);
            return (
              <div key={sec.key}>
                {/* Zelfde anatomie als de mapkop op My lists: chevron + gegraveerde titel, een haarlijn
                    die de ruimte neemt, en het aantal rechts. Een ✓ verraadt in een dichte map waar je
                    gekozen lijst zit. */}
                <button onClick={() => wissel(sec.key)} aria-expanded={isOpen} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 2px 7px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={TOW.goldDeep} strokeWidth="2.8" style={{ flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease' }} aria-hidden="true"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{sec.titel}</span>
                  {sec.key === gekozenSectie && !isOpen && <span aria-label="contains your current pick" style={{ color: TOW.goldDeep, fontSize: 11, flexShrink: 0 }}>✓</span>}
                  <span style={{ flex: 1, minWidth: 12, height: 1, background: TOW.line }} />
                  <span style={{ fontFamily: towFont.serif, fontSize: 10.5, color: TOW.faint, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{sec.ls.length}</span>
                </button>
                {isOpen && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>{sec.ls.map(rij)}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(rij)}
        </div>
      )}
      {/* No "use a different list" here. Under a campaign lock there is genuinely no choice to make:
          the campaign decided which list plays, and swapping in another one locally would only
          disagree with what the campaign has recorded. */}
      {solo || zonderScheiding ? null : (
        <div style={{ ...eb, fontSize: 8, color: TOW.faint, textAlign: 'center', margin: '11px 0 2px' }}>— or paste an export below —</div>
      )}
    </div>
  );
}
