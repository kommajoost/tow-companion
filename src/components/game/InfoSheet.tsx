import { useMemo } from 'react';
import { useData } from '../../data';
import { useUI } from '../../state';
import { getRuleIndex, resolveRuleSlug } from '../../lib/armyRules';
import { useBackClose } from '../../lib/backStack';
import { TOW, towFont, engraved } from '../../design/tow';
import type { UnitProfile } from '../../types';

const eb = engraved as React.CSSProperties;

// What an InfoSheet shows: a title, optional flavour line, optional stat profile(s) (mounts), and a
// list of special-rule labels rendered as tappable chips (each opens its rule pop-up when one exists).
export interface InfoSheetData {
  title: string;
  flavour?: string;
  profiles?: UnitProfile[];
  rules: string[];
}

// A small modal for things that have no rule page of their own — a magic item (flavour + rules) or a
// mount (profile + rules). Shared by the unit card and the combat-stats panel so they look identical.
export function InfoSheet({ info, onClose }: { info: InfoSheetData | null; onClose: () => void }) {
  const { rules } = useData();
  const { openRule } = useUI();
  const idx = useMemo(() => getRuleIndex(rules), [rules]);

  // In-app Back closes the sheet instead of leaving the app.
  useBackClose(info !== null, onClose);
  if (!info) return null;

  const th: React.CSSProperties = { ...eb, fontSize: 8.5, color: TOW.goldDeep, border: `1px solid ${TOW.line}`, padding: '3px 2px', textAlign: 'center', background: 'rgba(184,134,47,0.08)' };
  const td: React.CSSProperties = { textAlign: 'center', color: TOW.ink, border: `1px solid ${TOW.line}`, padding: '3px 2px' };
  const chip: React.CSSProperties = { fontFamily: towFont.serif, fontSize: 12, padding: '3px 9px', borderRadius: 999, lineHeight: 1.35, whiteSpace: 'nowrap' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(30,20,8,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto', background: TOW.panel2, border: `1px solid ${TOW.lineStrong}`, borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(40,24,8,0.3)' }}>
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

        {info.rules.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {info.rules.map((label, i) => {
              const slug = resolveRuleSlug(label, idx);
              return slug ? (
                <button key={i} onClick={() => openRule(slug)} style={{ ...chip, cursor: 'pointer', border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep }}>{label}</button>
              ) : (
                <span key={i} style={{ ...chip, border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.muted }}>{label}</span>
              );
            })}
          </div>
        ) : (
          !info.profiles?.length && <p style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted }}>No special rules listed.</p>
        )}
      </div>
    </div>
  );
}
