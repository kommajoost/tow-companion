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
} from '../../lib/weaponStats';
import type { ArmyUnit } from '../../types';

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;
const fmtAP = (ap: number) => (ap === 0 ? '–' : String(ap));

// The profile + weapon view of a unit. A small "Loadout" button toggles between the base profile
// and the EFFECTIVE stats for the chosen weapons (effective Strength + an AP column, +1 Attacks
// from an extra hand weapon) and a shooting line whose To Hit comes from the model's Ballistic
// Skill, with the shooting modifiers picked from a compact dropdown.
export function CombatStats({ unit }: { unit: ArmyUnit }) {
  const { rules } = useData();
  const { openRule } = useUI();
  const idx = useMemo(() => getRuleIndex(rules), [rules]);
  const { melee, ranged } = useMemo(() => unitWeapons(unit, rules), [unit, rules]);

  const [on, setOn] = useState(false);
  const [meleeSel, setMeleeSel] = useState(0);
  const [charge, setCharge] = useState(false);
  const [rangedSel, setRangedSel] = useState(0);
  const [mods, setMods] = useState<Record<string, boolean>>({});
  const [custom, setCustom] = useState(0); // extra "to hit" modifier (+ = easier, − = harder)
  const [modsOpen, setModsOpen] = useState(false);

  const mw = melee[meleeSel];
  const rw = ranged[rangedSel];
  const showCharge = melee.some((w) => w.chargeBonus);
  const bs = Math.max(0, ...unit.profiles.map((p) => statValue(p.stats, 'BS') ?? 0));
  // A profile is a weapon-WIELDER (gets the loadout's effective stats) if it has a Leadership and
  // Strength value — i.e. the unit's models including its champion (Reaver/Dread Knight/Herald),
  // but NOT mounts/steeds or a chariot frame (those carry "-" for Ld). Each wielder uses its OWN
  // base S/A, so a champion's +1 Attack stacks with an extra hand weapon's +1.
  const isWielder = (stats: { k: string; v: string }[]) =>
    statValue(stats, 'Ld') != null && statValue(stats, 'S') != null;

  const activeMods = SHOOTING_MODS.filter((m) => mods[m.key]);
  const penalty = activeMods.reduce((n, m) => n + m.penalty, 0) - custom;
  const modCount = activeMods.length + (custom !== 0 ? 1 : 0);
  const hit = bs > 0 ? rangedToHit(bs, penalty) : null;

  // ── small shared chip styles ──
  const chip: React.CSSProperties = { fontFamily: towFont.serif, fontSize: 11.5, padding: '3px 9px', borderRadius: 999, cursor: 'pointer', lineHeight: 1.35, whiteSpace: 'nowrap' };
  const selChip = (sel: boolean): React.CSSProperties => ({ ...chip, border: `1px solid ${sel ? TOW.goldDeep : TOW.line}`, background: sel ? 'rgba(184,134,47,0.14)' : 'transparent', color: sel ? TOW.goldDeep : TOW.parchDim, fontWeight: sel ? 600 : 400 });
  const stepBtn: React.CSSProperties = { width: 24, height: 24, borderRadius: 7, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.parchDim, fontFamily: towFont.display, fontWeight: 700, fontSize: 15, lineHeight: 1 };

  // A weapon's special rule → a tappable chip that opens the rule pop-up (plain if unmatched).
  const ruleChips = (list: string[]) =>
    list.length === 0 ? null : (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {list.map((label, i) => {
          const slug = resolveRuleSlug(label, idx);
          return slug ? (
            <button key={i} onClick={() => openRule(slug)} style={{ ...chip, cursor: 'pointer', border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep }}>{label}</button>
          ) : (
            <span key={i} style={{ ...chip, border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.muted }}>{label}</span>
          );
        })}
      </div>
    );

  const th: React.CSSProperties = { ...eb, fontSize: 8.5, color: TOW.goldDeep, border: `1px solid ${TOW.line}`, padding: '3px 2px', textAlign: 'center', background: 'rgba(184,134,47,0.08)' };
  const td = (hl: boolean): React.CSSProperties => ({ textAlign: 'center', color: hl ? TOW.goldDeep : TOW.ink, fontWeight: hl ? 700 : 400, border: `1px solid ${TOW.line}`, padding: '3px 2px', background: hl ? 'rgba(184,134,47,0.10)' : 'transparent' });

  // One profile row. In loadout mode an AP column is inserted after S; every wielder profile (each
  // model, incl. the champion) shows the chosen weapon's effective S/AP (from its OWN base S) and
  // Attacks; mounts/steeds keep their base S (natural attacks, no AP). Off = verbatim base profile.
  const profileTable = (stats: { k: string; v: string }[]) => {
    const sBase = statValue(stats, 'S');
    const e = on && mw && isWielder(stats) ? effectiveMelee(sBase ?? 0, mw, charge) : null;
    const cols: { k: string; v: string; hl: boolean }[] = [];
    for (const st of stats) {
      const isS = st.k.toUpperCase() === 'S';
      const isA = st.k.toUpperCase() === 'A';
      if (on && isS && e) {
        cols.push({ k: 'S', v: String(e.s), hl: e.s !== sBase });
        cols.push({ k: 'AP', v: fmtAP(e.ap), hl: e.ap !== 0 });
      } else if (on && isS) {
        cols.push({ k: 'S', v: st.v, hl: false });
        cols.push({ k: 'AP', v: '–', hl: false });
      } else if (on && isA && e && e.aMod) {
        const baseA = parseInt(st.v.match(/\d+/)?.[0] ?? '', 10);
        cols.push({ k: 'A', v: Number.isFinite(baseA) ? String(baseA + e.aMod) : st.v, hl: true });
      } else {
        cols.push({ k: st.k, v: st.v, hl: false });
      }
    }
    return (
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: on ? 300 : 280, fontSize: 12.5, fontFamily: towFont.serif }}>
        <thead><tr>{cols.map((c, i) => <th key={i} style={th}>{c.k}</th>)}</tr></thead>
        <tbody><tr>{cols.map((c, i) => <td key={i} style={td(c.hl)}>{c.v}</td>)}</tr></tbody>
      </table>
    );
  };

  return (
    <div style={{ margin: '2px 0 10px' }}>
      {/* Loadout toggle + (when on) the melee weapon picker, all on one compact row. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button
          onClick={() => setOn((o) => !o)}
          style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? goldGrad : 'transparent', color: on ? '#2a1a0a' : TOW.muted }}
        >
          Loadout
        </button>
        {on && melee.map((w, i) => (
          <button key={w.slug} onClick={() => setMeleeSel(i)} style={selChip(i === meleeSel)}>{w.name}</button>
        ))}
        {on && showCharge && (
          <button onClick={() => setCharge((c) => !c)} style={selChip(charge)}>{charge ? '✓ ' : ''}On charge</button>
        )}
      </div>

      {unit.profiles.map((p, pi) => (
        <div key={pi} className="no-scrollbar" style={{ overflowX: 'auto', marginBottom: 8 }}>
          <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.parchDim, marginBottom: 3 }}>{p.label}</div>
          {profileTable(p.stats)}
        </div>
      ))}
      {on && mw && ruleChips(mw.specialRules)}

      {/* Shooting — only in loadout mode and only when the unit has a ranged weapon. */}
      {on && ranged.length > 0 && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${TOW.line}`, paddingTop: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginRight: 2 }}>Ranged</span>
            {ranged.map((w, i) => (
              <button key={w.slug} onClick={() => setRangedSel(i)} style={selChip(i === rangedSel)}>{w.name}</button>
            ))}
          </div>
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
                    <td style={{ ...td(true), fontFamily: towFont.display }}>{!hit ? '—' : hit.impossible ? '—' : `${hit.value}+`}</td>
                  </tr></tbody>
                </table>
              </div>

              {/* Compact modifiers dropdown (check on/off) — keeps the card tidy. */}
              <div style={{ position: 'relative', display: 'inline-block', marginTop: 8 }}>
                <button
                  onClick={() => setModsOpen((o) => !o)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: towFont.serif, fontSize: 12.5, padding: '5px 11px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${modCount ? TOW.goldDeep : TOW.lineStrong}`, background: modCount ? 'rgba(184,134,47,0.10)' : TOW.cardLt, color: modCount ? TOW.goldDeep : TOW.parchDim }}
                >
                  To Hit modifiers{modCount ? ` (${modCount})` : ''}
                  <span style={{ fontSize: 9, opacity: 0.8 }}>{modsOpen ? '▲' : '▼'}</span>
                </button>
                {modsOpen && (
                  <>
                    <div onClick={() => setModsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 41, width: 232, maxWidth: '78vw', background: TOW.panel2, border: `1px solid ${TOW.lineStrong}`, borderRadius: 12, boxShadow: '0 10px 30px rgba(40,24,8,0.22)', padding: 7 }}>
                      <div style={{ ...eb, fontSize: 8, color: TOW.muted, padding: '2px 8px 6px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>To Hit modifiers</span>
                        <span style={{ color: TOW.goldDeep }}>{hit && !hit.impossible ? `${hit.value}+` : '—'}</span>
                      </div>
                      {SHOOTING_MODS.map((m) => {
                        const checked = !!mods[m.key];
                        return (
                          <button key={m.key} onClick={() => setMods((p) => ({ ...p, [m.key]: !p[m.key] }))} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '6px 8px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                            <span style={{ width: 16, height: 16, flexShrink: 0, borderRadius: 4, border: `1px solid ${checked ? TOW.goldDeep : TOW.muted}`, background: checked ? TOW.goldDeep : 'transparent', color: '#fff', fontSize: 11, lineHeight: '15px', textAlign: 'center' }}>{checked ? '✓' : ''}</span>
                            <span style={{ flex: 1, fontFamily: towFont.serif, fontSize: 13, color: TOW.ink }}>{m.label}</span>
                            <span style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.muted }}>−{m.penalty}</span>
                          </button>
                        );
                      })}
                      <div style={{ borderTop: `1px solid ${TOW.line}`, margin: '5px 0' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 8px' }}>
                        <span style={{ flex: 1, fontFamily: towFont.serif, fontSize: 13, color: TOW.ink }}>
                          Custom{custom !== 0 ? ` ${custom > 0 ? `+${custom}` : custom}` : ''}
                        </span>
                        <button onClick={() => setCustom((c) => c - 1)} aria-label="harder to hit" style={stepBtn}>–</button>
                        <button onClick={() => setCustom((c) => c + 1)} aria-label="easier to hit" style={stepBtn}>+</button>
                      </div>
                      <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 10.5, color: TOW.faint, padding: '4px 8px 2px' }}>
                        Custom: + easier · − harder (magic item, army rule)
                      </div>
                    </div>
                  </>
                )}
              </div>
              <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, marginLeft: 8 }}>BS {bs > 0 ? bs : '—'}</span>
              {ruleChips(rw.specialRules)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
