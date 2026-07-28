import { TOW, towFont, engraved } from '../../design/tow';
import { COMPOSITION_RULES } from '../../lib/owbBuilder';
import { useCampagnes, kiesCampagne, type CampaignContext } from '../../lib/campaign';
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
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;
const ruleName = (id: string): string => COMPOSITION_RULES.find((r) => r.id === id)?.name ?? id;

/** One saved list as this panel needs it (kept minimal so ListBuilder stays the owner of the data). */
export interface PanelLijst {
  id: string; name: string; points: number; computed: number | null;
  campaign?: boolean; campaignSpeler?: string;
}

export function CeledonPanel({ lijsten, onOpen, onNieuw, onTour }: {
  lijsten: PanelLijst[];
  onOpen: (id: string) => void;
  onNieuw: (ctx: CampaignContext) => void;
  onTour: () => void;
}) {
  const { campagnes, actief, laden, fout } = useCampagnes();
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
  const lijst = eigen[0] ?? null;
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

      {!lijst ? (
        <>
          <p style={{ ...tekst, marginTop: 10 }}>
            This is the army builder for the campaign. Your list is capped at{' '}
            <b style={{ color: TOW.ink }}>{actief.puntenCap} points</b> for Act {actief.fase}
            {actief.speler.factie ? <> and fixed to <b style={{ color: TOW.ink }}>{actief.speler.factie}</b></> : null}
            {regels ? <>, using the <b style={{ color: TOW.ink }}>{regels}</b> composition</> : null}. Build it here and
            the campaign reads it by itself — there is nothing to send or upload.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => onNieuw(actief)} data-tour="celedon-start"
              style={{ ...knop, border: 'none', background: goldGrad, color: TOW.onGrad }}>
              Start my {actief.label} list
            </button>
            <button onClick={onTour} style={{ ...knop, border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.inkDim }}>
              Show me around
            </button>
          </div>
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
            <p style={{ ...tekstDim, marginTop: 8 }}>
              Changes are saved and picked up by the campaign on their own. Lock the list on Isle of Celedon when
              you are happy with it.
            </p>
          )}
        </>
      )}
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
