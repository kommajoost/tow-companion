import { TOW, towFont, engraved } from '../design/tow';
import { Ornament } from '../design/glyphs';
import { LogoMark } from './LogoMark';
import { TurnsIcon, ArmyIcon, RulebookIcon } from '../design/icons';

const eb = engraved as React.CSSProperties;

// Heraldic cover screen (Claude Design v3, variant A): a ceremonial title page with the
// twin-tailed comet emblem, the app name, a short line of flavour, and two large stacked
// actions — Begin a Battle (→ turn tracker) and Open the Rulebook (→ reference).
export function HomeCover({
  onBegin,
  onArmy,
  onRulebook,
}: {
  onBegin: () => void;
  onArmy: () => void;
  onRulebook: () => void;
}) {
  const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

  return (
    <div
      className="tow-field"
      style={{
        height: '100%',
        overflowY: 'auto',
        color: TOW.ink,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '40px 24px',
        paddingTop: 'max(40px, env(safe-area-inset-top))',
        paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
      }}
    >
      <div style={{ maxWidth: 420, width: '100%', margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* emblem */}
        <LogoMark size={120} radius={22} />

        <div style={{ ...eb, fontSize: 10, color: TOW.muted, marginTop: 22 }}>
          Warhammer · The Old World
        </div>
        <h1
          style={{
            fontFamily: towFont.display,
            fontWeight: 700,
            fontSize: 38,
            lineHeight: 1.05,
            color: TOW.ink,
            margin: '8px 0 0',
            letterSpacing: '0.01em',
          }}
        >
          Battle
          <br />
          Companion
        </h1>

        <Ornament w={200} color={TOW.goldDeep} style={{ display: 'block', margin: '18px 0 0', opacity: 0.65 }} />

        <p
          style={{
            fontFamily: towFont.serif,
            fontStyle: 'italic',
            fontSize: 16,
            lineHeight: 1.5,
            color: TOW.parchDim,
            margin: '18px 0 30px',
            maxWidth: 340,
          }}
        >
          Your guide through every turn — phase by phase, with the full rules at hand.
        </p>

        {/* actions */}
        <button
          onClick={onBegin}
          style={{
            width: '100%',
            border: 'none',
            borderRadius: 13,
            cursor: 'pointer',
            padding: '16px 20px',
            background: goldGrad,
            color: TOW.onGrad,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            boxShadow: '0 6px 18px rgba(122,93,36,0.3)',
          }}
        >
          <TurnsIcon size={22} color={TOW.onGrad} />
          <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 17, letterSpacing: '0.02em' }}>
            Begin a Battle
          </span>
        </button>

        <button
          onClick={onArmy}
          style={{
            width: '100%',
            marginTop: 12,
            borderRadius: 13,
            cursor: 'pointer',
            padding: '16px 20px',
            background: TOW.panel2,
            border: `1px solid ${TOW.lineStrong}`,
            color: TOW.ink,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <ArmyIcon size={22} color={TOW.goldDeep} />
          <span style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 17, letterSpacing: '0.02em' }}>
            Muster Your Army
          </span>
        </button>

        <button
          onClick={onRulebook}
          style={{
            width: '100%',
            marginTop: 12,
            borderRadius: 13,
            cursor: 'pointer',
            padding: '16px 20px',
            background: TOW.panel2,
            border: `1px solid ${TOW.lineStrong}`,
            color: TOW.ink,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <RulebookIcon size={22} color={TOW.goldDeep} />
          <span style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 17, letterSpacing: '0.02em' }}>
            Open the Rulebook
          </span>
        </button>
      </div>
    </div>
  );
}
