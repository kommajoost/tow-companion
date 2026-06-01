import { useMemo } from 'react';
import { useData } from '../../data';
import { useUI } from '../../state';
import { TOW, towFont, engraved } from '../../design/tow';
import { buildRuleIndex, resolveRuleSlug, resolveOptionSlug, wizardInfo } from '../../lib/armyRules';
import { WizardSpells } from './WizardSpells';
import type { ArmyUnit } from '../../types';

const eb = engraved as React.CSSProperties;

// One army unit: title + points, options, stat-profile table(s), and tappable
// special-rule chips (chips that resolve to a wiki rule open the pop-up sheet).
// Wizard units also get a spell picker (editable for your own army).
export function UnitCard({
  unit,
  editable = false,
  onChange,
}: {
  unit: ArmyUnit;
  editable?: boolean;
  onChange?: (patch: Partial<ArmyUnit>) => void;
}) {
  const { rules } = useData();
  const { openRule } = useUI();
  const idx = useMemo(() => buildRuleIndex(rules), [rules]);
  const isWizard = wizardInfo(unit).isWizard;

  return (
    <section style={{ border: `1px solid ${TOW.line}`, borderRadius: 12, background: TOW.panel2, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 16, color: TOW.ink }}>
          {unit.count ? <span style={{ color: TOW.goldDeep }}>{unit.count}× </span> : null}
          {unit.name}
        </h3>
        {unit.points != null && (
          <span style={{ ...eb, fontSize: 9, color: TOW.muted, whiteSpace: 'nowrap' }}>{unit.points} pts</span>
        )}
      </div>

      {/* All profiles in a unit share the same column set (M WS BS S T W I A Ld), so we
          use a fixed table layout with equal-width columns for clean, aligned reading. */}
      {unit.profiles.map((p, pi) => (
        <div key={pi} className="no-scrollbar" style={{ overflowX: 'auto', marginBottom: 8 }}>
          <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.parchDim, marginBottom: 3 }}>{p.label}</div>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: 280, fontSize: 12.5, fontFamily: towFont.serif }}>
            <thead>
              <tr>
                {p.stats.map((s, i) => (
                  <th key={i} style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, border: `1px solid ${TOW.line}`, padding: '3px 2px', textAlign: 'center', background: 'rgba(184,134,47,0.08)' }}>{s.k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {p.stats.map((s, i) => (
                  <td key={i} style={{ textAlign: 'center', color: TOW.ink, border: `1px solid ${TOW.line}`, padding: '3px 2px' }}>{s.v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      {unit.options.length > 0 && (
        <div style={{ fontFamily: towFont.serif, fontSize: 13, color: TOW.parchDim, lineHeight: 1.9, margin: '4px 0 8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 4px' }}>
          {unit.options.map((opt, i) => {
            const slug = resolveOptionSlug(opt, idx);
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                {i > 0 && <span style={{ color: TOW.faint, marginRight: 4 }}>·</span>}
                {slug ? (
                  <button
                    onClick={() => openRule(slug)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: towFont.serif, fontSize: 13, color: TOW.goldDeep, borderBottom: `1px dotted ${TOW.goldDeep}` }}
                  >
                    {opt}
                  </button>
                ) : (
                  <span>{opt}</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {unit.specialRules.length > 0 && (
        <div>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 5 }}>Special rules</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {unit.specialRules.map((label, i) => {
              const slug = resolveRuleSlug(label, idx);
              const common: React.CSSProperties = { fontFamily: towFont.serif, fontSize: 12.5, padding: '4px 10px', borderRadius: 999, border: `1px solid ${slug ? TOW.goldDeep : TOW.line}` };
              return slug ? (
                <button key={i} onClick={() => openRule(slug)} style={{ ...common, cursor: 'pointer', background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep }}>{label}</button>
              ) : (
                <span key={i} style={{ ...common, background: 'transparent', color: TOW.muted }}>{label}</span>
              );
            })}
          </div>
        </div>
      )}

      {isWizard && (
        <WizardSpells unit={unit} editable={editable} onChange={onChange ?? (() => {})} />
      )}
    </section>
  );
}
