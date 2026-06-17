import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data';
import { useUI } from '../../state';
import { getRuleIndex, resolveRuleSlug } from '../../lib/armyRules';
import { useBackClose } from '../../lib/backStack';
import { useSwipeToDismiss, DragHandle } from '../../lib/useSwipeToDismiss';
import { TOW, towFont, engraved } from '../../design/tow';
import type { UnitProfile } from '../../types';

const eb = engraved as React.CSSProperties;

// What an InfoSheet shows: a title, optional flavour line, optional stat profile(s) (mounts), and a
// list of special-rule labels — short rule names render as tappable chips (each opens its rule page),
// while a magic item's prose effect text renders as a wrapped paragraph.
export interface InfoSheetData {
  title: string;
  flavour?: string;
  profiles?: UnitProfile[];
  rules: string[];
}

// A modal for things that have no rule page of their own — a magic item (flavour + rules) or a mount
// (profile + rules). On phones it's a bottom sheet (matching the rule sheet); on wide screens a small
// centred dialog. Shared by the unit card so every "tap a magic item / mount" looks the same.
export function InfoSheet({ info, onClose }: { info: InfoSheetData | null; onClose: () => void }) {
  const { rules } = useData();
  const { openRule } = useUI();
  const idx = useMemo(() => getRuleIndex(rules), [rules]);
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 800);
  useEffect(() => {
    const on = () => setWide(window.innerWidth >= 800);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // In-app Back closes the sheet instead of leaving the app.
  useBackClose(info !== null, onClose);
  const { handleProps, sheetStyle } = useSwipeToDismiss(onClose);
  if (!info) return null;

  const th: React.CSSProperties = { ...eb, fontSize: 8.5, color: TOW.goldDeep, border: `1px solid ${TOW.line}`, padding: '3px 2px', textAlign: 'center', background: 'rgba(184,134,47,0.08)' };
  const td: React.CSSProperties = { textAlign: 'center', color: TOW.ink, border: `1px solid ${TOW.line}`, padding: '3px 2px' };
  const chip: React.CSSProperties = { fontFamily: towFont.serif, fontSize: 12, padding: '3px 9px', borderRadius: 999, lineHeight: 1.35, whiteSpace: 'nowrap' };

  // Rules that resolve to a rule page → tappable chips; the rest (a magic item's prose effect) →
  // wrapped paragraphs, so a long sentence reads normally instead of one horizontally-scrolling line.
  const chips = info.rules.filter((r) => resolveRuleSlug(r, idx));
  const prose = info.rules.filter((r) => !resolveRuleSlug(r, idx));

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(30,20,8,0.45)', display: 'flex', alignItems: wide ? 'center' : 'flex-end', justifyContent: 'center', padding: wide ? 16 : 0 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: wide ? 440 : '100%', maxHeight: '85vh', overflowY: 'auto', background: TOW.panel2, border: `1px solid ${TOW.lineStrong}`, borderRadius: wide ? 16 : '18px 18px 0 0', padding: 16, paddingTop: wide ? 16 : 4, paddingBottom: wide ? 16 : 'max(16px, env(safe-area-inset-bottom))', boxShadow: '0 -10px 40px rgba(0,0,0,0.25)', ...sheetStyle }}
      >
        {!wide && <DragHandle {...handleProps} />}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <h3 style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 16, color: TOW.ink }}>{info.title}</h3>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: TOW.muted, padding: '0 4px' }}>×</button>
        </div>

        {info.flavour && (
          <p style={{ margin: '0 0 6px', fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 13, color: TOW.parchDim, lineHeight: 1.5 }}>{info.flavour}</p>
        )}

        {info.profiles?.map((p, pi) => (
          <div key={pi} className="no-scrollbar" style={{ overflowX: 'auto', marginBottom: 8 }}>
            <div style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.parchDim, marginBottom: 3 }}>{p.label}</div>
            <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: 280, fontSize: 12.5, fontFamily: towFont.serif }}>
              <thead><tr>{p.stats.map((s, j) => <th key={j} style={th}>{s.k}</th>)}</tr></thead>
              <tbody><tr>{p.stats.map((s, j) => <td key={j} style={td}>{s.v}</td>)}</tr></tbody>
            </table>
          </div>
        ))}

        {chips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {chips.map((label, i) => (
              <button key={i} onClick={() => openRule(resolveRuleSlug(label, idx)!)} style={{ ...chip, cursor: 'pointer', border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep }}>{label}</button>
            ))}
          </div>
        )}

        {prose.map((label, i) => (
          <p key={i} style={{ margin: '8px 0 0', fontFamily: towFont.serif, fontSize: 13, color: TOW.ink, lineHeight: 1.5 }}>{label}</p>
        ))}

        {chips.length === 0 && prose.length === 0 && !info.profiles?.length && (
          <p style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted }}>No special rules listed.</p>
        )}
      </div>
    </div>
  );
}
