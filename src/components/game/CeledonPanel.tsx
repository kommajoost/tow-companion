import { useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { COMPOSITION_RULES } from '../../lib/owbBuilder';
import { useCampagnes, kiesCampagne } from '../../lib/campaign';
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
  const { pushNow, key: syncKey } = useListSync();
  const [stuur, setStuur] = useState<'rust' | 'bezig' | 'klaar' | 'fout'>('rust');
  const { session, loading: authLaden, ssoError } = useAuth();

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
  const lijst = eigen.find((l) => !slug || l.army === slug) ?? null;
  const oudLeger = !lijst ? eigen[0] ?? null : null;
  const punten = lijst?.computed ?? null;
  const over = punten != null && punten > actief.puntenCap;
  const regels = actief.compositie.map(ruleName).join(' or ');

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
        <Chip label={`Act ${actief.fase}`} />
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
                {actief.gelockt ? `Locked for Act ${actief.fase}` : 'Open to change until you lock it'}
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
          {actief.gelockt ? (
            <p style={{ ...tekstDim, marginTop: 8 }}>
              You submitted this list for Act {actief.fase}. You can look at it, but not change it — it opens up again
              when Act {actief.fase + 1} does.
            </p>
          ) : (
            <>
              {/* SEND NOW, not "submit". The campaign already receives every change on its own — the
                  list sync pushes on each local edit, debounced — so this button does not unlock a step
                  that was missing; it makes the invisible visible, pushing immediately and saying when
                  it landed. Naming it "Submit" would be a lie in the other direction: submitting a list
                  for an Act means LOCKING it, and that lives on Isle of Celedon. There is no RPC here
                  that can do it (the campaign side exposes read, rename-unit and delete-unit only), so
                  a button claiming to would do nothing and report success. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 10 }}>
                <button
                  onClick={async () => {
                    setStuur('bezig');
                    try { await pushNow(); setStuur('klaar'); } catch { setStuur('fout'); }
                  }}
                  disabled={!syncKey || stuur === 'bezig'}
                  style={{
                    ...knop,
                    border: `1px solid ${syncKey ? TOW.goldDeep : TOW.line}`,
                    background: syncKey ? 'rgba(138,108,48,0.14)' : 'transparent',
                    color: syncKey ? TOW.gold : TOW.faint,
                    cursor: syncKey && stuur !== 'bezig' ? 'pointer' : 'default',
                  }}
                >
                  {stuur === 'bezig' ? 'Sending…' : 'Send to campaign now'}
                </button>
                <span style={{ ...tekstDim, margin: 0 }}>
                  {!syncKey
                    ? 'Sign in on Settings first — without sync there is nothing to send to.'
                    : stuur === 'klaar' ? 'Sent. The campaign has this version.'
                      : stuur === 'fout' ? 'Could not send — check your connection and try again.'
                        : 'Normally automatic; this pushes it straight away.'}
                </span>
              </div>
              <p style={{ ...tekstDim, marginTop: 8 }}>
                Changes are saved and picked up by the campaign on their own. Lock the list on Isle of Celedon when
                you are happy with it.
              </p>
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
