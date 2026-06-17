import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../data';
import { useBackClose } from '../../lib/backStack';
import { RichText } from '../../lib/RichText';
import { COMPOSITION_RULE_SLUGS, GRAND_ARMY, CATEGORIES, type Category } from '../../lib/owbBuilder';
import { TOW, towFont, engraved } from '../../design/tow';

const eb = engraved as React.CSSProperties;

const CAT_LABEL: Record<Category, string> = {
  characters: 'Characters', core: 'Core', special: 'Special', rare: 'Rare', mercenaries: 'Mercenaries', allies: 'Allied contingents',
};

// Explains a composition rule (Open War / Combined Arms / Grand Melee / …) with its verbatim rulebook
// text. Rendered ABOVE the new-list and settings modals (z 95), styled like the rule sheet: a bottom
// sheet on phones, a centred dialog on wide screens. The "Combined Arms + Grand Melee" option shows
// both rule pages, since its restrictions are the union of the two.
export function CompositionInfo({ ruleId, onClose }: { ruleId: string | null; onClose: () => void }) {
  const { getRule } = useData();
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 800);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= 800);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useBackClose(ruleId !== null, onClose);
  if (!ruleId) return null;

  const slugs = COMPOSITION_RULE_SLUGS[ruleId] ?? [ruleId];

  // Portal to <body>: the picker often lives inside a transform-animated modal, which would otherwise
  // make this fixed overlay resolve against the modal box instead of the viewport.
  return createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(30,20,8,0.5)', display: 'flex', alignItems: wide ? 'center' : 'flex-end', justifyContent: 'center', padding: wide ? 16 : 0 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: wide ? 520 : '100%', maxHeight: '85vh', overflowY: 'auto', background: TOW.panel, border: `1px solid ${TOW.lineStrong}`, borderRadius: wide ? 16 : '18px 18px 0 0', padding: 18, paddingBottom: wide ? 18 : 'max(18px, env(safe-area-inset-bottom))', boxShadow: '0 -10px 40px rgba(0,0,0,0.28)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>Composition rule</span>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: TOW.muted, padding: '0 4px' }}>×</button>
        </div>

        {/* The base army-list limits (Grand Army percentages) that matched-play compositions build on.
            Battle March has its own mustering rules, so the percentages don't apply there. */}
        {ruleId !== 'battle-march' && (
          <div style={{ marginBottom: 10 }}>
            <h3 style={{ margin: '0 0 4px', fontFamily: towFont.display, fontWeight: 700, fontSize: 16, color: TOW.gold }}>Army list limits</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontFamily: towFont.serif, fontSize: 13.5, color: TOW.ink, lineHeight: 1.6 }}>
              {CATEGORIES.map((c) => {
                const lim = GRAND_ARMY[c];
                const parts: string[] = [];
                if (lim?.minPercent != null) parts.push(`at least ${lim.minPercent}%`);
                if (lim?.maxPercent != null) parts.push(`up to ${lim.maxPercent}%`);
                return parts.length ? <li key={c}><strong>{CAT_LABEL[c]}</strong> — {parts.join(', ')} of total points</li> : null;
              })}
            </ul>
            <p style={{ margin: '6px 0 0', fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 12, color: TOW.muted }}>Plus the restrictions of your chosen army composition list, and the rule below.</p>
          </div>
        )}

        {slugs.map((s, i) => {
          const rule = getRule(s);
          return (
            <div key={s} style={{ marginTop: i ? 14 : 0, paddingTop: i ? 14 : 0, borderTop: i ? `1px solid ${TOW.line}` : 'none' }}>
              <h3 style={{ margin: '0 0 6px', fontFamily: towFont.display, fontWeight: 700, fontSize: 18, color: TOW.gold }}>{rule?.name ?? s}</h3>
              {rule?.body ? (
                <RichText doc={rule.body} />
              ) : rule?.bodyIndex ? (
                <p style={{ fontFamily: towFont.serif, fontSize: 13.5, color: TOW.ink, lineHeight: 1.55 }}>{rule.bodyIndex}</p>
              ) : (
                <p style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 13, color: TOW.muted }}>See the rulebook for the full rules.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
