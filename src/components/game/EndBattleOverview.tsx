import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { useBackClose } from '../../lib/backStack';
import { unitTotalStrength } from '../../lib/armyRules';
import { CampaignResultReporter } from './CampaignResultReporter';
import type { Army, GameTracker } from '../../types';
import type { VpResultaat } from '../../lib/victoryPoints';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;

// Menselijke labels voor de uitslag (Engels UI, net als VpPanel).
const UITSLAG_LABEL: Record<'draw' | 'victory' | 'crushing', string> = {
  draw: 'Draw',
  victory: 'Victory',
  crushing: 'Crushing Victory',
};

// Het einde-battle-overzicht. Full-screen modal over de live battle: dimmed scrim + gecentreerde,
// scrollbare kaart. Leest ALLEEN (VP-uitslag uit `res`, casualties uit de tracker) — muteert de
// tracker nooit. Sluiten keert terug naar de live battle. De legers komen als props binnen (al
// naar absolute host/guest-posities opgelost door de parent), dus we her-mappen niets.
export function EndBattleOverview({
  res,
  hostName,
  guestName,
  hostArmy,
  guestArmy,
  onClose,
}: {
  res: VpResultaat;
  hostName: string;
  guestName: string;
  hostArmy: Army | null;
  guestArmy: Army | null;
  onClose: () => void;
}) {
  // Alleen `tracker` nodig voor de per-unit casualty-uitlezing; de modal muteert 'm niet.
  const { tracker } = useGame();

  // Hardware Back / Escape-nav sluit de modal (parent unmount 'm bij close, dus altijd active).
  useBackClose(true, onClose);

  const winnerName = res.winnaar === 'host' ? hostName : res.winnaar === 'guest' ? guestName : null;
  const uitslagLabel = UITSLAG_LABEL[res.uitslag];
  // Headline-kleur spiegelt de reporter: crushing = goldBright, andere winst = goldDeep, draw = muted.
  const headlineColor = res.uitslag === 'crushing' ? TOW.goldBright : res.winnaar ? TOW.goldDeep : TOW.muted;

  const card: React.CSSProperties = {
    width: '100%',
    maxWidth: 560,
    margin: 'auto',
    background: TOW.panel,
    border: `1px solid ${TOW.lineStrong}`,
    borderRadius: 16,
    padding: '22px 22px 20px',
    boxSizing: 'border-box',
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 16,
        overflowY: 'auto',
      }}
    >
      <div style={card}>
        {/* 1 — Header: eyebrow + uitslag-headline + marge */}
        <div style={{ ...eb, fontSize: 9, color: TOW.goldDeep, marginBottom: 6 }}>Battle ended</div>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 24, lineHeight: 1.1, color: headlineColor }}>
          {winnerName ? `${winnerName} — ${uitslagLabel}` : 'Draw'}
        </div>
        {res.verschil > 0 && (
          <div style={{ fontFamily: serif, fontSize: 13.5, color: TOW.parchDim, marginTop: 3 }}>+{res.verschil} VP</div>
        )}

        {/* 2 — Prominente VP-stand: twee grote score-blokken (ScoreCell-look uit VpPanel) */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginTop: 16 }}>
          <ScoreCell name={hostName} vp={res.hostVp} leads={res.winnaar === 'host'} />
          <ScoreCell name={guestName} vp={res.guestVp} leads={res.winnaar === 'guest'} />
        </div>

        {/* 3 — Casualty-samenvatting per kant (host, dan guest) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <CasualtySide seat="host" name={hostName} army={hostArmy} tracker={tracker} />
          <CasualtySide seat="guest" name={guestName} army={guestArmy} tracker={tracker} />
        </div>

        {/* 4 — Footer: campagne-rapportage (zelf-detecterend; null bij ad-hoc) + Close */}
        <div style={{ marginTop: 16 }}>
          <CampaignResultReporter embedded />
        </div>
        <button
          onClick={onClose}
          style={{
            width: '100%',
            marginTop: 12,
            border: `1px solid ${TOW.lineStrong}`,
            borderRadius: 11,
            background: 'transparent',
            color: TOW.muted,
            cursor: 'pointer',
            padding: '11px 16px',
            fontFamily: display,
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Back to battle
        </button>
      </div>
    </div>
  );
}

// Groot score-blok — kopieert de visuele taal van VpPanel's ScoreCell (dot + naam op één rij,
// daaronder het grote getal; leider gemarkeerd in goldDeep).
function ScoreCell({ name, vp, leads }: { name: string; vp: number; leads: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '12px 14px', borderRadius: 9, background: TOW.cardLt, border: `1px solid ${leads ? TOW.goldDeep : TOW.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: leads ? TOW.goldDeep : TOW.muted, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontFamily: serif, fontSize: 12, color: leads ? TOW.ink : TOW.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      </div>
      <div style={{ fontFamily: display, fontWeight: 700, fontSize: 30, color: leads ? TOW.goldDeep : TOW.ink, lineHeight: 1 }}>{vp}</div>
    </div>
  );
}

// Casualty-blok voor één kant. Toont per unit met verliezen één regel (naam + lost/total + tags),
// plus een tally. Leest tracker.units[`${seat}:${unit.id}`]; leeg/null leger → "No losses".
function CasualtySide({
  seat,
  name,
  army,
  tracker,
}: {
  seat: 'host' | 'guest';
  name: string;
  army: Army | null;
  tracker: GameTracker;
}) {
  const units = army?.units ?? [];
  // Alleen units mét verliezen (gesneuveld, vluchtend, of van tafel).
  const shown = units.filter((u) => {
    const t = tracker.units[`${seat}:${u.id}`];
    return !!t && (t.lost > 0 || t.fleeing || !!t.weg);
  });
  const n = shown.length;

  const tag: React.CSSProperties = { ...eb, fontSize: 7, color: TOW.muted, border: `1px solid ${TOW.line}`, borderRadius: 6, padding: '2px 6px', flexShrink: 0 };
  const destroyedTag: React.CSSProperties = { ...tag, color: TOW.blood, borderColor: TOW.blood };

  return (
    <div style={{ border: `1px solid ${TOW.line}`, borderRadius: 10, padding: '10px 12px', background: 'rgba(0,0,0,0.02)' }}>
      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: n > 0 ? 7 : 4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{name} losses</div>

      {n === 0 ? (
        <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.muted }}>No losses</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {shown.map((u) => {
              const t = tracker.units[`${seat}:${u.id}`]!;
              const total = unitTotalStrength(u);
              return (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ flex: 1, minWidth: 0, fontFamily: serif, fontSize: 13, color: TOW.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</span>
                  <span style={{ fontFamily: serif, fontSize: 12, color: TOW.parchDim, whiteSpace: 'nowrap' }}>{t.lost}/{total} lost</span>
                  {t.fleeing && <span style={tag}>Fleeing</span>}
                  {t.weg && <span style={destroyedTag}>Destroyed</span>}
                </div>
              );
            })}
          </div>
          <div style={{ fontFamily: serif, fontSize: 11.5, color: TOW.muted, marginTop: 8 }}>{n} unit{n === 1 ? '' : 's'} with losses</div>
        </>
      )}
    </div>
  );
}
