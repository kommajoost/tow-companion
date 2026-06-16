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
import { useBackClose } from '../../lib/backStack';
import type { ArmyUnit, UnitProfile } from '../../types';

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

  // Default the melee pick to the unit's actual upgrade weapon (cavalry spear, great weapon,
  // two hand weapons, …) rather than the baseline hand weapon, if it has one.
  const defaultMelee = Math.max(0, melee.findIndex((w) => !/^hand weapon$/i.test(w.name)));
  const [on, setOn] = useState(true); // loadout view on by default
  const [meleeSel, setMeleeSel] = useState(defaultMelee);
  const [charge, setCharge] = useState(false);
  const [rangedSel, setRangedSel] = useState(0);
  const [mods, setMods] = useState<Record<string, boolean>>({});
  const [custom, setCustom] = useState(0); // extra "to hit" modifier (+ = easier, − = harder)
  const [modsOpen, setModsOpen] = useState(false);
  const [multiOn, setMultiOn] = useState(true); // fire the multiple-shots mode (−1 To Hit)
  // A small info pop-up for things with no rule page of their own: a magic weapon (flavour + rules)
  // or a mount (its profile + special rules). Both surface here so the player can tap to see them.
  const [info, setInfo] = useState<{ title: string; flavour?: string; profiles?: UnitProfile[]; rules: string[] } | null>(null);

  // In-app Back closes the info pop-up instead of leaving the app.
  useBackClose(info !== null, () => setInfo(null));
  // Magic weapons (Ogre Blade, …) have no rule page, so their picker chip can't open the rule sheet;
  // they carry an eye that opens the info pop-up (flavour + their special rules) instead.
  const isMagic = (w: WeaponProfile) => w.slug.startsWith('magic-weapon:');
  const magicFlavour = (name: string) => unit.magicWeapons?.find((m) => m.name === name)?.flavour;

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
  // The firing model's Strength — used for ranged weapons whose profile S is relative ("S" = use the
  // wielder's Strength, e.g. thrown weapons), so the shooting table shows a number, not an em-dash.
  const shooterS = Math.max(0, ...unit.profiles.filter((p) => isWielder(p.stats)).map((p) => statValue(p.stats, 'S') ?? 0));

  const activeMods = SHOOTING_MODS.filter((m) => mods[m.key]);
  // Firing the multiple-shots mode adds an extra −1 To Hit (the "Multiple Shots" rule).
  const multiActive = !!(rw && rw.multiShots && multiOn);
  const penalty = activeMods.reduce((n, m) => n + m.penalty, 0) - custom + (multiActive ? 1 : 0);
  const modCount = activeMods.length + (custom !== 0 ? 1 : 0);
  const hit = bs > 0 ? rangedToHit(bs, penalty) : null;
  const shotsShown = rw ? (rw.multiShots && multiOn ? rw.multiShots : String(rw.shots)) : '';
  // In rapid-fire mode the weapon switches to its OWN (weaker) profile; ordinary Multiple Shots
  // weapons keep this same profile (only the To Hit penalty applies). `eff` is the profile to show.
  const eff = rw && multiActive && rw.multiProfile ? rw.multiProfile : rw;
  // Effective ranged Strength to display: an absolute value as-is, else the wielder's S (+ any
  // relative modifier); null when the weapon's S is truly variable ("*", e.g. a Hydra's breath).
  const rangedS = !eff ? null : eff.sAbs != null ? eff.sAbs : eff.sMod != null && shooterS > 0 ? shooterS + eff.sMod : null;

  // ── small shared chip styles ──
  const chip: React.CSSProperties = { fontFamily: towFont.serif, fontSize: 11.5, padding: '3px 9px', borderRadius: 999, cursor: 'pointer', lineHeight: 1.35, whiteSpace: 'nowrap' };
  const selChip = (sel: boolean): React.CSSProperties => ({ ...chip, border: `1px solid ${sel ? TOW.goldDeep : TOW.line}`, background: sel ? 'rgba(184,134,47,0.14)' : 'transparent', color: sel ? TOW.goldDeep : TOW.parchDim, fontWeight: sel ? 600 : 400 });
  const stepBtn: React.CSSProperties = { width: 24, height: 24, borderRadius: 7, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.parchDim, fontFamily: towFont.display, fontWeight: 700, fontSize: 15, lineHeight: 1 };

  // A small eye next to a magic-weapon chip → opens its info pop-up (flavour + special rules).
  const infoEye = (w: WeaponProfile) => (
    <button onClick={() => setInfo({ title: w.name, flavour: magicFlavour(w.name), rules: w.specialRules })} aria-label={`${w.name} info`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 23, height: 23, flexShrink: 0, borderRadius: 999, cursor: 'pointer', border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep, padding: 0 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg>
    </button>
  );
  // A weapon chip: the name selects it; magic weapons also carry the info eye.
  const weaponChip = (w: WeaponProfile, selected: boolean, onSelect: () => void) =>
    isMagic(w) ? (
      <span key={w.slug} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        <button onClick={onSelect} style={selChip(selected)}>{w.name}</button>
        {infoEye(w)}
      </span>
    ) : (
      <button key={w.slug} onClick={onSelect} style={selChip(selected)}>{w.name}</button>
    );

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
          title={on ? 'Showing loadout stats — tap for base profile' : 'Show effective loadout stats'}
          style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 7, cursor: 'pointer', border: `1px solid ${on ? 'rgba(184,134,47,0.5)' : TOW.line}`, background: on ? 'rgba(184,134,47,0.12)' : 'transparent', color: on ? TOW.goldDeep : TOW.muted }}
        >
          Loadout
        </button>
        {on && melee.map((w, i) => weaponChip(w, i === meleeSel, () => setMeleeSel(i)))}
        {on && showCharge && (
          <button onClick={() => setCharge((c) => !c)} style={selChip(charge)}>{charge ? '✓ ' : ''}On charge</button>
        )}
      </div>

      {/* Mount(s): tap to see the mount's own profile + special rules (it has no rule page). */}
      {unit.mounts && unit.mounts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginRight: 2 }}>Mount</span>
          {unit.mounts.map((m) => (
            <button key={m.name} onClick={() => setInfo({ title: m.name, profiles: m.profiles, rules: m.specialRules })}
              style={{ ...chip, display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep }}>
              {m.name}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg>
            </button>
          ))}
        </div>
      )}

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
            {ranged.map((w, i) => weaponChip(w, i === rangedSel, () => setRangedSel(i)))}
          </div>
          {rw && (
            <>
              <div className="no-scrollbar" style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: 300, fontSize: 12.5, fontFamily: towFont.serif }}>
                  <thead><tr>{['Range', 'Shots', 'S', 'AP', 'To Hit'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody><tr>
                    <td style={td(false)}>{eff?.range}</td>
                    <td style={td(multiActive)}>{shotsShown}</td>
                    <td style={td(false)}>{rangedS ?? '—'}</td>
                    <td style={td((eff?.ap ?? 0) !== 0)}>{fmtAP(eff?.ap ?? 0)}</td>
                    <td style={{ ...td(true), fontFamily: towFont.display }}>{!hit ? '—' : hit.impossible ? '—' : `${hit.value}+`}</td>
                  </tr></tbody>
                </table>
              </div>

              {/* Firing mode — Multiple Shots / Rapid Fire let the weapon fire 1 OR X shots,
                  the multiple-shot mode costing −1 To Hit. */}
              {rw.multiShots && (
                <div style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 9, background: 'rgba(74,55,22,0.07)', border: `1px solid ${TOW.line}`, marginTop: 8, marginRight: 8 }}>
                  {([['single', `Single shot`], ['multi', `${rw.multiProfile ? 'Rapid fire' : 'Multiple'} (${rw.multiShots}) −1`]] as const).map(([k, label]) => {
                    const sel = (k === 'multi') === multiOn;
                    return (
                      <button key={k} onClick={() => setMultiOn(k === 'multi')} style={{ padding: '4px 10px', borderRadius: 7, cursor: 'pointer', border: 'none', fontFamily: towFont.serif, fontSize: 11.5, background: sel ? goldGrad : 'transparent', color: sel ? TOW.onGrad : TOW.muted, fontWeight: sel ? 600 : 400, whiteSpace: 'nowrap' }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

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
              {ruleChips(eff?.specialRules ?? [])}
            </>
          )}
        </div>
      )}

      {/* Info pop-up for a magic weapon (flavour + rules) or a mount (profile + rules). These have no
          rule page of their own, so this shows their info instead of opening the rule sheet. */}
      {info && (
        <div onClick={() => setInfo(null)} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(30,20,8,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto', background: TOW.panel2, border: `1px solid ${TOW.lineStrong}`, borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(40,24,8,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <h3 style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 16, color: TOW.ink }}>{info.title}</h3>
              <button onClick={() => setInfo(null)} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: TOW.muted, padding: '0 4px' }}>×</button>
            </div>
            {info.flavour && (
              <p style={{ margin: '0 0 6px', fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 13, color: TOW.parchDim, lineHeight: 1.5 }}>{info.flavour}</p>
            )}
            {info.profiles?.map((p, pi) => (
              <div key={pi} className="no-scrollbar" style={{ overflowX: 'auto', marginBottom: 8 }}>
                <div style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.parchDim, marginBottom: 3 }}>{p.label}</div>
                <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: 280, fontSize: 12.5, fontFamily: towFont.serif }}>
                  <thead><tr>{p.stats.map((s, j) => <th key={j} style={th}>{s.k}</th>)}</tr></thead>
                  <tbody><tr>{p.stats.map((s, j) => <td key={j} style={td(false)}>{s.v}</td>)}</tr></tbody>
                </table>
              </div>
            ))}
            {info.rules.length > 0 && ruleChips(info.rules)}
            {info.rules.length === 0 && !info.profiles?.length && (
              <p style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted }}>No special rules listed.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
