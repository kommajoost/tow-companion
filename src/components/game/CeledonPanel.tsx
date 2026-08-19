import { useCallback, useEffect, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { COMPOSITION_RULES } from '../../lib/owbBuilder';
import { useCampagnes, kiesCampagne, keurLijst, dienLijstIn, verversCampagnes, staatOpSlot, lijstNotitieZet, type LijstKeuring, type CampagneBron } from '../../lib/campaign';
import { useListSync } from '../../listSync';
import { useAuth } from '../../lib/auth';

// The campaign banner at the top of "My lists". Most players arrive here straight from Isle of
// Celedon having never seen this app, so this panel has one job: say where you are, what the rules
// on your list are, and what the single next action is. Everything mechanical it shows (the points
// cap, the faction, the composition rule, whether the list is locked) comes from the campaign
// server, never from a value typed in here.
//
// Players with no campaign see nothing at all — the army builder is a public app and must stay
// exactly as it was for them.

const eb = engraved as React.CSSProperties;
const ruleName = (id: string): string => COMPOSITION_RULES.find((r) => r.id === id)?.name ?? id;

/** The campaign's verdict, plus whether we have one at all. `onbekend` = we could not reach the
 *  campaign; that must read differently from "the list is fine", so it never enables submitting. */
interface KeuringState { stand: 'laden' | 'klaar' | 'onbekend'; keuring: LijstKeuring | null }

/** One saved list as this panel needs it (kept minimal so ListBuilder stays the owner of the data). */
export interface PanelLijst {
  id: string; name: string; army: string; units: number; points: number; computed: number | null;
  campaign?: boolean; campaignSpeler?: string;
}

export function CeledonPanel({ lijsten, onOpen, onTour, onHerstel }: {
  lijsten: PanelLijst[];
  onOpen: (id: string) => void;
  onTour: () => void;
  /** Maak een nieuwe campagne-lijst voor de huidige factie; de oude blijft als gewone lijst staan. */
  onHerstel: () => void;
}) {
  const { campagnes, actief, laden, fout } = useCampagnes();
  // The list SYNC is what actually carries a list to the campaign; the send button only triggers it.
  const { pushNow, key: syncKey, lastSyncedAt } = useListSync();
  const [stuur, setStuur] = useState<'rust' | 'bezig' | 'klaar' | 'fout'>('rust');
  const { session, loading: authLaden, ssoError } = useAuth();

  // ── De keuring van de campagne ────────────────────────────────────────────────────────────────
  // The campaign judges the list that is IN THE CLOUD, so this is refetched whenever a push lands
  // (`lastSyncedAt` changes on every successful one) — never off the local list, which would report
  // a verdict on a version the campaign has not seen. A failed fetch leaves the last verdict
  // standing rather than clearing it: a dropped connection is not evidence the list became legal.
  const spelerId = actief?.speler.id ?? null;
  const [keuring, setKeuring] = useState<KeuringState>({ stand: 'laden', keuring: null });
  const [indienen, setIndienen] = useState<'rust' | 'bezig'>('rust');
  const [indienFout, setIndienFout] = useState<string | null>(null);
  // ── Een woord bij je lijst (15-08-2026) ───────────────────────────────────────────────────────
  // Wat je hier schrijft gaat twee kanten op: naar de kroniekschrijver, die er het verhaal van deze
  // Act mee kleurt, en naar de onafhankelijke veteraan die de lijst beoordeelt. Die laatste ziet 'm
  // in zijn Word-document staan — een rare keuze die ergens vóór staat leest heel anders dan
  // dezelfde keuze zonder uitleg. Mag ook nog ná het indienen: het is verhaal, geen regel.
  const [notitieOpen, setNotitieOpen] = useState(false);
  const [notitie, setNotitie] = useState('');
  const [notitieBezig, setNotitieBezig] = useState(false);
  const [notitieFout, setNotitieFout] = useState<string | null>(null);
  // De opgeslagen tekst komt mee in de keuring; die is de waarheid zodra hij binnen is.
  const bewaardeNotitie = keuring.keuring?.notitie ?? null;
  useEffect(() => { setNotitie(bewaardeNotitie ?? ''); }, [bewaardeNotitie]);

  const haalKeuring = useCallback(async (id: string, bron?: CampagneBron) => {
    try {
      setKeuring((k) => ({ stand: k.keuring ? 'klaar' : 'laden', keuring: k.keuring }));
      // 19-08: de bron MOET mee. De voorbereiding leeft op Act 0 en de playtest op de lopende Act;
      // zonder bron keurt de server je voorbereidingslijst tegen de cap van de game.
      const k = await keurLijst(id, bron);
      setKeuring({ stand: 'klaar', keuring: k });
    } catch {
      setKeuring((k) => ({ stand: k.keuring ? 'klaar' : 'onbekend', keuring: k.keuring }));
    }
  }, []);

  useEffect(() => {
    if (!spelerId) { setKeuring({ stand: 'onbekend', keuring: null }); return; }
    void haalKeuring(spelerId, actief?.bron);
  }, [spelerId, actief?.bron, lastSyncedAt, haalKeuring]);

  // Signed out and no campaign in sight → this is a plain builder session; show nothing.
  // The one exception is a failed hand-off from the campaign app: then the player IS expecting to be
  // signed in, and silence would be baffling.
  if (!session && !authLaden && !ssoError) return null;
  if (authLaden || (laden && !actief)) return null;

  if (ssoError && !session) {
    return (
      <div style={{ ...box, borderColor: 'rgba(124,43,34,0.45)' }}>
        <div style={{ ...eb, fontSize: 8.5, color: TOW.blood }}>Isle of Celedon</div>
        <p style={{ ...tekst, marginTop: 6 }}>{ssoError}</p>
        <p style={{ ...tekstDim, marginTop: 6 }}>
          Open <b>Settings</b> and sign in with the same email and password you use on the campaign site.
        </p>
      </div>
    );
  }

  if (!actief) {
    // Signed in, but this account has no campaign — e.g. someone who made an account here first.
    if (fout) return null;
    return null;
  }

  const eigen = lijsten.filter((l) => l.campaign && l.campaignSpeler === actief.speler.id);
  const slug = actief.speler.factieSlug;
  // De lijst die bij de huidige factie hoort. Staat er alleen een lijst voor een ANDER leger, dan is de
  // factie verschoven nadat die lijst gemaakt was; dat is geen fout van de speler en moet met één klik
  // te herstellen zijn, want de factie zelf is (terecht) niet in de builder te wijzigen.
  // Staat de INGEDIENDE lijst er nog? Die krijgt voorrang, zodat het slot-label altijd op de lijst
  // zit die de campagne echt vast heeft (11-08). Anders de eerste lijst van de huidige factie.
  const lijst = eigen.find((l) => staatOpSlot(actief, l))
    ?? eigen.find((l) => !slug || l.army === slug)
    ?? null;
  const oudLeger = !lijst ? eigen[0] ?? null : null;
  // Is DEZE lijst de gelockte? `actief.gelockt` alleen zegt dat er érgens een inzending ligt —
  // dat als "deze lijst is op slot" tonen was precies de verwarring van 10/11-08.
  const lijstOpSlot = staatOpSlot(actief, lijst);
  const punten = lijst?.computed ?? null;
  const over = punten != null && punten > actief.puntenCap;
  const regels = actief.compositie.map(ruleName).join(' or ');

  // De keuring, uitgepakt voor de weergave. `ok:false` is geen oordeel over de lijst maar over de
  // verbinding of de vindbaarheid ervan — dat mag nooit als "goedgekeurd" of als lijstfout lezen.
  const oordeel = keuring.keuring?.ok ? keuring.keuring : null;
  const blokkades = oordeel
    ? oordeel.fouten
    : keuring.keuring && keuring.keuring.fout === 'GEEN_CAMPAGNE_LIJST'
      ? ['The campaign has not received this list yet — press "Re-check now" once.']
      : [];
  const kanIndienen = !!syncKey && !!spelerId && !!oordeel && oordeel.mag && !oordeel.gelockt;

  return (
    <div style={box} data-tour="celedon-panel">
      {/* Which campaign — a picker only when there is genuinely something to choose. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep }}>{actief.label}</div>
        <div style={{ flex: 1, height: 1, background: TOW.line, minWidth: 12 }} />
        {campagnes.length > 1 && (
          <div style={{ display: 'flex', gap: 4 }} data-tour="celedon-kiezer">
            {campagnes.map((c) => {
              const aan = c.key === actief.key;
              return (
                <button key={c.key} onClick={() => kiesCampagne(c.key)}
                  style={{
                    padding: '4px 9px', borderRadius: 7, cursor: aan ? 'default' : 'pointer',
                    border: `1px solid ${aan ? TOW.goldDeep : TOW.line}`,
                    background: aan ? 'rgba(138,108,48,0.14)' : 'transparent',
                    fontFamily: towFont.display, fontWeight: 600, fontSize: 11,
                    color: aan ? TOW.gold : TOW.muted,
                  }}>{c.label}</button>
              );
            })}
          </div>
        )}
      </div>

      <h2 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 17, color: TOW.ink, margin: '8px 0 0' }}>
        {lijst ? 'Your campaign army' : 'Build your campaign army'}
      </h2>

      {/* The three rules that are not yours to choose. Stated once, plainly. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0 0' }}>
        <Chip label={actief.bron === 'voorbereiding' ? 'Preparation' : `Act ${actief.fase}`} />
        <Chip label={`${actief.puntenCap} pts`} sterk />
        {actief.speler.factie && <Chip label={actief.speler.factie} />}
        {regels && <Chip label={regels} />}
      </div>

      {oudLeger ? (
        // Er is wél een campagne-lijst, maar voor een ander leger dan de campagne nu zegt — en er zit
        // werk in (anders had de app hem al vervangen). Zijn keuze: die units zijn van hem.
        <>
          <p style={{ ...tekst, marginTop: 10 }}>
            Your campaign list <b style={{ color: TOW.ink }}>{oudLeger.name}</b> is a{' '}
            <b style={{ color: TOW.ink }}>{oudLeger.army.replace(/-/g, ' ')}</b> army, but the campaign now says{' '}
            <b style={{ color: TOW.ink }}>{actief.speler.factie}</b>. Start the right one — the old list stays, as a
            normal list you can keep or delete.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={onHerstel} style={{ ...knop, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(138,108,48,0.14)', color: TOW.gold }}>
              Start a {actief.speler.factie} list
            </button>
            <button onClick={() => onOpen(oudLeger.id)} style={{ ...knop, border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.inkDim }}>
              Look at the old one
            </button>
          </div>
        </>
      ) : !lijst ? (
        // Geen lijst betekent hier NIET "druk op de knop" — die is er niet meer, de lijst maakt
        // zichzelf aan (ListBuilder). Het enige dat dit tegenhoudt is een factie die nog niet vastligt.
        <>
          <p style={{ ...tekst, marginTop: 10 }}>
            {actief.factieVast
              ? 'Setting up your campaign list…'
              : 'Confirm your faction on Isle of Celedon first — then your list appears here by itself, with the right points limit and composition already set.'}
          </p>
        </>
      ) : (
        <>
          <button onClick={() => onOpen(lijst.id)} data-tour="celedon-lijst"
            style={{
              width: '100%', marginTop: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
              textAlign: 'left', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontFamily: towFont.serif, fontSize: 15, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lijst.name}
              </span>
              <span style={{ fontFamily: towFont.serif, fontSize: 11, color: TOW.faint }}>
                {lijstOpSlot ? `Locked for Act ${actief.fase}` : 'Open to change until you lock it'}
              </span>
            </span>
            <span style={{
              fontFamily: towFont.serif, fontSize: 13, fontVariantNumeric: 'tabular-nums',
              color: over ? TOW.blood : TOW.muted, flexShrink: 0,
            }}>
              {punten ?? '…'}/{actief.puntenCap}
            </span>
          </button>
          {over && (
            <p style={{ ...tekst, color: TOW.blood, marginTop: 8 }}>
              Over the Act {actief.fase} cap — Celedon will not accept the list until it fits.
            </p>
          )}
          {lijstOpSlot ? (
            <p style={{ ...tekstDim, marginTop: 8 }}>
              You submitted this list for Act {actief.fase}. You can look at it, but not change it — it opens up again
              when Act {actief.fase + 1} does.
            </p>
          ) : actief.gelockt ? (
            // Er ligt een inzending voor deze Act, maar niet DEZE lijst — bijvoorbeeld omdat de
            // ingediende lijst hernoemd of opnieuw gebouwd is. Bewerken mag, maar Celedon speelt
            // deze Act met wat er al ligt; het slot gaat pas open bij de volgende Act.
            <p style={{ ...tekstDim, marginTop: 8 }}>
              Your Act {actief.fase} list is already submitted, and it is not this one. You can keep working on this
              list, but Celedon plays Act {actief.fase} with the list it received — you can submit again from Act{' '}
              {actief.fase + 1}.
            </p>
          ) : (
            <>
              {/* SUBMITTING now happens HERE, where the list is built — it used to live only on Isle
                  of Celedon, which meant you found out your list broke a campaign rule after leaving
                  this app. The campaign's verdict is shown first and the button follows it: no
                  verdict, or a verdict with errors, and there is nothing to submit. The lock RPC
                  re-judges server-side, so this button can never push through something illegal. */}
              {blokkades.length > 0 && (
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: '11px 0 0', padding: 0, listStyle: 'none' }}>
                  {blokkades.map((f, i) => (
                    <li key={i} style={{
                      borderRadius: 8, border: '1px solid rgba(124,43,34,0.45)', background: 'rgba(124,43,34,0.08)',
                      padding: '7px 9px', fontFamily: towFont.serif, fontSize: 12.5, lineHeight: 1.45, color: TOW.blood,
                    }}>{f}</li>
                  ))}
                </ul>
              )}
              {oordeel && oordeel.waarschuwingen.length > 0 && (
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
                  {oordeel.waarschuwingen.map((w, i) => (
                    <li key={i} style={{ ...tekstDim, fontSize: 11.5 }}>• {w}</li>
                  ))}
                </ul>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 11 }}>
                <button
                  onClick={async () => {
                    if (!spelerId) return;
                    setIndienen('bezig');
                    setIndienFout(null);
                    try {
                      // Push FIRST: the campaign locks whatever version it has in the cloud, and the
                      // debounced auto-sync may not have carried the last keystroke yet.
                      await pushNow();
                      const k = await dienLijstIn(spelerId, actief.bron);
                      setKeuring({ stand: 'klaar', keuring: k });
                      // The lock flips `gelockt` in the context too, which is what puts this panel
                      // (and the builder) into read-only.
                      await verversCampagnes();
                    } catch (e) {
                      setIndienFout(e instanceof Error ? e.message : 'Could not submit the list.');
                      if (spelerId) void haalKeuring(spelerId, actief.bron);
                    } finally {
                      setIndienen('rust');
                    }
                  }}
                  disabled={!kanIndienen || indienen === 'bezig'}
                  style={{
                    ...knop,
                    border: `1px solid ${kanIndienen ? TOW.goldDeep : TOW.line}`,
                    background: kanIndienen ? 'rgba(138,108,48,0.14)' : 'transparent',
                    color: kanIndienen ? TOW.gold : TOW.faint,
                    cursor: kanIndienen && indienen !== 'bezig' ? 'pointer' : 'default',
                  }}
                >
                  {indienen === 'bezig' ? 'Submitting…' : `Submit for Act ${actief.fase}`}
                </button>
                <span style={{ ...tekstDim, margin: 0 }}>
                  {indienFout ? indienFout
                    : !syncKey ? 'Sign in on Settings first — without sync there is nothing to submit.'
                      : keuring.stand === 'laden' ? 'Checking your list against the campaign…'
                        : keuring.stand === 'onbekend' ? 'Could not reach the campaign to check your list.'
                          : blokkades.length > 0 ? 'Fix the problems above first — the campaign will not accept the list.'
                            : 'Your list is legal. Submitting locks it for this Act.'}
                </span>
              </div>

              {/* EEN WOORD BIJ JE LIJST (15-08-2026). Staat onder het indienen, want dat is het moment
                  waarop je weet wat er verandert — en het is geen voorwaarde: dit blokkeert niets. */}
              <div style={{ marginTop: 11 }}>
                <button
                  type="button"
                  onClick={() => { setNotitieOpen((o) => !o); setNotitieFout(null); }}
                  style={{
                    ...knop, padding: '6px 11px', fontSize: 12,
                    border: `1px solid ${bewaardeNotitie ? TOW.goldDeep : TOW.line}`,
                    background: 'transparent', color: bewaardeNotitie ? TOW.gold : TOW.muted,
                  }}
                >
                  {bewaardeNotitie ? 'Edit your note for the chronicle' : 'Add a note for the chronicle'}
                </button>
                {!notitieOpen && bewaardeNotitie && (
                  <p style={{ ...tekstDim, marginTop: 6, fontStyle: 'italic' }}>&ldquo;{bewaardeNotitie}&rdquo;</p>
                )}
                {notitieOpen && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <p style={{ ...tekstDim, margin: 0 }}>
                      What is changing in your host this Act — who is marching in, what you finally had the coin
                      for, what you had to leave behind. Your chronicler uses it, and the veteran who judges the
                      lists reads it alongside your army.
                    </p>
                    <textarea
                      value={notitie}
                      maxLength={2000}
                      rows={4}
                      onChange={(e) => setNotitie(e.target.value)}
                      placeholder="Three score fresh Corsairs out of Karond Kar, and the Hydra is finally fed…"
                      style={{
                        width: '100%', resize: 'vertical', borderRadius: 8, padding: '8px 10px',
                        border: `1px solid ${TOW.line}`, background: TOW.cardLt, color: TOW.ink,
                        fontFamily: towFont.serif, fontSize: 13, lineHeight: 1.5,
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        disabled={notitieBezig || !spelerId}
                        onClick={async () => {
                          if (!spelerId) return;
                          setNotitieBezig(true);
                          setNotitieFout(null);
                          try {
                            await lijstNotitieZet(spelerId, notitie, actief.bron);
                            await haalKeuring(spelerId, actief.bron);
                            setNotitieOpen(false);
                          } catch (e) {
                            setNotitieFout(e instanceof Error ? e.message : 'Could not save your note.');
                          }
                          setNotitieBezig(false);
                        }}
                        style={{
                          ...knop, padding: '7px 13px', fontSize: 12.5,
                          border: `1px solid ${TOW.goldDeep}`, background: 'rgba(138,108,48,0.14)', color: TOW.gold,
                        }}
                      >
                        {notitieBezig ? 'Saving…' : 'Save the note'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setNotitie(bewaardeNotitie ?? ''); setNotitieOpen(false); }}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', ...tekstDim, margin: 0, textDecoration: 'underline' }}
                      >
                        Cancel
                      </button>
                      {notitieFout && <span style={{ ...tekstDim, margin: 0, color: TOW.blood }}>{notitieFout}</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* The auto-sync still runs on every edit; this only says so, so nobody thinks their
                  work is unsaved until they press the button. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 9 }}>
                <button
                  onClick={async () => {
                    setStuur('bezig');
                    try {
                      await pushNow();
                      setStuur('klaar');
                      if (spelerId) await haalKeuring(spelerId, actief.bron);
                    } catch { setStuur('fout'); }
                  }}
                  disabled={!syncKey || stuur === 'bezig'}
                  style={{
                    ...knop, padding: '6px 11px', fontSize: 12,
                    border: `1px solid ${TOW.line}`, background: 'transparent',
                    color: syncKey ? TOW.muted : TOW.faint,
                    cursor: syncKey && stuur !== 'bezig' ? 'pointer' : 'default',
                  }}
                >
                  {stuur === 'bezig' ? 'Checking…' : 'Re-check now'}
                </button>
                <span style={{ ...tekstDim, margin: 0, fontSize: 11.5 }}>
                  {stuur === 'fout'
                    ? 'Could not reach the campaign — check your connection.'
                    : 'Changes save and re-check on their own; this does it straight away.'}
                </span>
              </div>
            </>
          )}
        </>
      )}
      {/* De rondleiding moet ALTIJD terug te vinden zijn, niet alleen op het moment dat je nog geen
          lijst hebt — dat is precies wanneer je er niks aan hebt. */}
      <button onClick={onTour} style={{
        marginTop: 10, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
        fontFamily: towFont.serif, fontSize: 12, color: TOW.muted, textDecoration: 'underline',
      }}>Show me around</button>
      {eigen.length > 1 && (
        <p style={{ ...tekstDim, marginTop: 8 }}>
          You have {eigen.length} lists marked for this campaign; Celedon reads the most recently changed one.
        </p>
      )}
    </div>
  );
}

function Chip({ label, sterk }: { label: string; sterk?: boolean }) {
  return (
    <span style={{
      padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
      border: `1px solid ${sterk ? TOW.goldDeep : TOW.line}`,
      background: sterk ? 'rgba(138,108,48,0.12)' : 'transparent',
      fontFamily: towFont.display, fontWeight: 600, fontSize: 11,
      color: sterk ? TOW.gold : TOW.muted,
    }}>{label}</span>
  );
}

const box: React.CSSProperties = {
  border: `1px solid ${TOW.goldDeep}`, borderRadius: 12, padding: '12px 14px 14px',
  background: 'rgba(138,108,48,0.06)', marginBottom: 18,
};
const tekst: React.CSSProperties = { fontFamily: towFont.serif, fontSize: 13.5, lineHeight: 1.6, color: TOW.inkDim, margin: 0 };
const tekstDim: React.CSSProperties = { ...tekst, fontSize: 12, color: TOW.muted };
const knop: React.CSSProperties = {
  padding: '9px 15px', borderRadius: 9, cursor: 'pointer',
  fontFamily: towFont.display, fontWeight: 700, fontSize: 13, letterSpacing: '0.02em',
};
