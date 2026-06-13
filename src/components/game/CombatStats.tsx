import { useMemo, useState } from 'react';
import { useData } from '../../data';
import { useUI } from '../../state';
import { TOW, towFont, engraved } from '../../design/tow';
import { getRuleIndex, resolveRuleSlug } from '../../lib/armyRules';
import {
  unitWeapons,
  effectiveMelee,
  rangedToHit,
  statValue,
  SHOOTING_MODS,
  type WeaponProfile,
} from '../../lib/weaponStats';
import type { ArmyUnit } from '../../types';

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;
const fmtAP = (ap: number) => (ap === 0 ? '–' : String(ap));

// The "Loadout" view of a unit: pick a melee / ranged weapon and see the EFFECTIVE stats —
// effective Strength + an AP column on the profile, and a shooting line with shots / S / AP and
// the To Hit from the model's Ballistic Skill (with the standard shooting modifiers).
export function CombatStats({ unit }: { unit: ArmyUnit }) {
  const { rules } = useData();
  const { openRule } = useUI();
  const idx = useMemo(() => getRuleIndex(rules), [rules]);
  const { melee, ranged } = useMemo(() => unitWeapons(unit, rules), [unit, rules]);

  const [meleeSel, setMeleeSel] = useState(0);
  const [charge, setCharge] = useState(false);
  const [rangedSel, setRangedSel] = useState(0);
  const [mods, setMods] = useState<Record<string, boolean>>({});

  const mw = melee[meleeSel];
  const rw = ranged[rangedSel];
  const showCharge = melee.some((w) => w.chargeBonus);
  const baseS = statValue(unit.profiles[0]?.stats ?? [], 'S') ?? 0;
  const bs = Math.max(0, ...unit.profiles.map((p) => statValue(p.stats, 'BS') ?? 0));
  const eff = mw ? effectiveMelee(baseS, mw, charge) : null;

  // A weapon's special rule → a tappable chip that opens the rule pop-up (plain if unmatched).
  const ruleChips = (list: string[]) =>
    list.length === 0 ? null : (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {list.map((label, i) => {
          const slug = resolveRuleSlug(label, idx);
          const common: React.CSSProperties = { fontFamily: towFont.serif, fontSize: 12, padding: '3px 9px', borderRadius: 999, border: `1px solid ${slug ? TOW.goldDeep : TOW.line}` };
          return slug ? (
            <button key={i} onClick={() => openRule(slug)} style={{ ...common, cursor: 'pointer', background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep }}>{label}</button>
          ) : (
            <span key={i} style={{ ...common, background: 'transparent', color: TOW.muted }}>{label}</span>
          );
        })}
      </div>
    );

  // Weapon selector chips (single-select within a category).
  const weaponChips = (list: WeaponProfile[], sel: number, onSel: (i: number) => void) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      {list.map((w, i) => {
        const on = i === sel;
        return (
          <button
            key={w.slug}
            onClick={() => onSel(i)}
            style={{ fontFamily: towFont.serif, fontSize: 12.5, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? goldGrad : 'transparent', color: on ? '#2a1a0a' : TOW.parchDim, fontWeight: on ? 700 : 400 }}
          >
            {w.name}
          </button>
        );
      })}
    </div>
  );

  const th: React.CSSProperties = { ...eb, fontSize: 8.5, color: TOW.goldDeep, border: `1px solid ${TOW.line}`, padding: '3px 2px', textAlign: 'center', background: 'rgba(184,134,47,0.08)' };
  const td = (hl: boolean): React.CSSProperties => ({ textAlign: 'center', color: hl ? TOW.goldDeep : TOW.ink, fontWeight: hl ? 700 : 400, border: `1px solid ${TOW.line}`, padding: '3px 2px', background: hl ? 'rgba(184,134,47,0.10)' : 'transparent' });

  // One profile row, with an AP column inserted after S. The main model (pi 0) shows the chosen
  // melee weapon's effective S + AP; mounts/crew keep their base S (natural attacks, no AP).
  const profileTable = (stats: { k: string; v: string }[], main: boolean) => {
    const cols: { k: string; v: string; hl: boolean }[] = [];
    for (const st of stats) {
      const isS = st.k.toUpperCase() === 'S';
      if (isS && main && eff) {
        cols.push({ k: 'S', v: String(eff.s), hl: eff.s !== baseS });
        cols.push({ k: 'AP', v: fmtAP(eff.ap), hl: eff.ap !== 0 });
      } else if (isS) {
        cols.push({ k: 'S', v: st.v, hl: false });
        cols.push({ k: 'AP', v: '–', hl: false });
      } else {
        cols.push({ k: st.k, v: st.v, hl: false });
      }
    }
    return (
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: 300, fontSize: 12.5, fontFamily: towFont.serif }}>
        <thead><tr>{cols.map((c, i) => <th key={i} style={th}>{c.k}</th>)}</tr></thead>
        <tbody><tr>{cols.map((c, i) => <td key={i} style={td(c.hl)}>{c.v}</td>)}</tr></tbody>
      </table>
    );
  };

  return (
    <div style={{ margin: '2px 0 10px' }}>
      {/* ───────── Melee ───────── */}
      {melee.length > 0 && (
        <>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 6 }}>Melee weapon</div>
          {weaponChips(melee, meleeSel, setMeleeSel)}
          {showCharge && (
            <button
              onClick={() => setCharge((c) => !c)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 8, padding: '4px 11px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${charge ? TOW.goldDeep : TOW.line}`, background: charge ? 'rgba(184,134,47,0.14)' : 'transparent', color: charge ? TOW.goldDeep : TOW.muted, fontFamily: towFont.display, fontWeight: 600, fontSize: 12 }}
            >
              <span style={{ width: 13, height: 13, borderRadius: 4, border: `1px solid ${charge ? TOW.goldDeep : TOW.muted}`, background: charge ? TOW.goldDeep : 'transparent', color: '#fff', fontSize: 10, lineHeight: '12px', textAlign: 'center' }}>{charge ? '✓' : ''}</span>
              On the charge
            </button>
          )}
        </>
      )}
      {unit.profiles.map((p, pi) => (
        <div key={pi} className="no-scrollbar" style={{ overflowX: 'auto', marginBottom: 8 }}>
          <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.parchDim, marginBottom: 3 }}>{p.label}</div>
          {profileTable(p.stats, pi === 0)}
        </div>
      ))}
      {mw && ruleChips(mw.specialRules)}

      {/* ───────── Shooting ───────── */}
      {ranged.length > 0 && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${TOW.line}`, paddingTop: 12 }}>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 6 }}>Ranged weapon</div>
          {weaponChips(ranged, rangedSel, setRangedSel)}
          {rw && (
            <>
              <div className="no-scrollbar" style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: 300, fontSize: 12.5, fontFamily: towFont.serif }}>
                  <thead><tr>{['Range', 'Shots', 'S', 'AP', 'To Hit'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody><tr>
                    <td style={td(false)}>{rw.range}</td>
                    <td style={td(rw.shots > 1)}>{rw.shots}</td>
                    <td style={td(false)}>{rw.sAbs ?? '—'}</td>
                    <td style={td(rw.ap !== 0)}>{fmtAP(rw.ap)}</td>
                    {(() => {
                      const penalty = SHOOTING_MODS.reduce((n, m) => (mods[m.key] ? n + m.penalty : n), 0);
                      const hit = bs > 0 ? rangedToHit(bs, penalty) : null;
                      return (
                        <td style={{ ...td(true), fontFamily: towFont.display }}>
                          {!hit ? '—' : hit.impossible ? '—' : `${hit.value}+`}
                        </td>
                      );
                    })()}
                  </tr></tbody>
                </table>
              </div>
              <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, margin: '6px 0 4px' }}>
                To Hit uses BS {bs > 0 ? bs : '—'}. Tap the conditions that apply:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SHOOTING_MODS.map((m) => {
                  const on = !!mods[m.key];
                  return (
                    <button
                      key={m.key}
                      onClick={() => setMods((prev) => ({ ...prev, [m.key]: !prev[m.key] }))}
                      style={{ fontFamily: towFont.serif, fontSize: 12, padding: '3px 9px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'rgba(184,134,47,0.14)' : 'transparent', color: on ? TOW.goldDeep : TOW.muted }}
                    >
                      {m.label} −{m.penalty}
                    </button>
                  );
                })}
              </div>
              {ruleChips(rw.specialRules)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
