import { useMemo, useState } from 'react';
import { useData } from '../../data';
import { useUI } from '../../state';
import { TOW, towFont, engraved } from '../../design/tow';
import { buildRuleIndex, resolveRuleSlug, resolveOptionSlug, wizardInfo, unitTotalStrength, unitArmourSave } from '../../lib/armyRules';
import { unitWeapons } from '../../lib/weaponStats';
import { abilityLabel, abilityEffect, scarLabel } from '../../lib/campaignBattle';
import { CombatStats } from './CombatStats';
import { InfoSheet, type InfoSheetData } from './InfoSheet';
import { WizardSpells } from './WizardSpells';
import { WoundTracker } from './WoundTracker';
import type { ArmyUnit, UnitProfile } from '../../types';

const eb = engraved as React.CSSProperties;

// One army unit: title + points, options, stat-profile table(s), tappable special-rule
// chips (open the pop-up sheet), a wizard spell picker, and a strength/casualty tracker.
// When the unit is wiped out it shows "Destroyed" and dims.
export function UnitCard({
  unit,
  faction,
  editable = false,
  onChange,
  lost,
  weg,
  fleeing,
  kills,
  onSetLost,
  onRemoved,
  onFlee,
  onSetKills,
  collapsed = false,
  onToggleCollapse,
}: {
  unit: ArmyUnit;
  /** The army's faction, used to pick the right faction-variant of an ambiguously-named rule
   *  (e.g. the War Hydra's "Fiery breath" → Dark Elves variant, not Lizardmen/Renegade). */
  faction?: string;
  editable?: boolean;
  onChange?: (patch: Partial<ArmyUnit>) => void;
  /** Casualty tracking (only wired in the game roster). When `onSetLost` is given the card renders
   *  the WoundTracker and dims when the unit is wiped out or Removed. */
  lost?: number;
  weg?: boolean;
  fleeing?: boolean;
  /** Enemy units destroyed + trophies captured by this unit (feeds campaign veteran XP). */
  kills?: number;
  /** Absolute setter for total lost wounds (WoundTracker's two counters reduce to this). */
  onSetLost?: (lost: number) => void;
  /** Toggle the unit's Removed (destroyed / off-table → 100% VP) state. */
  onRemoved?: () => void;
  /** Toggle the unit's Fleeing state. */
  onFlee?: () => void;
  /** Absolute setter for the unit's kill count (min 0). */
  onSetKills?: (kills: number) => void;
  /** In the game roster, units are collapsed by default; the header toggles open to show the card. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { rules } = useData();
  const { openRule } = useUI();
  const idx = useMemo(() => buildRuleIndex(rules), [rules]);
  const isWizard = wizardInfo(unit).isWizard;
  const armour = useMemo(() => unitArmourSave(unit), [unit]);
  const weapons = useMemo(() => unitWeapons(unit, rules), [unit, rules]);
  const hasWeapons = weapons.melee.length > 0 || weapons.ranged.length > 0;
  const tracked = onSetLost != null; // casualty-UI is alleen gewired in de game-roster
  const dead = tracked && ((lost ?? 0) >= unitTotalStrength(unit) || (weg ?? false));
  // Chosen magic items (weapons, armour, talismans, runes, banners, …) have no rule page; tapping one
  // in the loadout line opens its info sheet (flavour + special rules) instead of the rule sheet.
  const [info, setInfo] = useState<InfoSheetData | null>(null);
  const magicByName = useMemo(() => {
    const m = new Map<string, { specialRules: string[]; flavour?: string }>();
    for (const mi of unit.magicItems ?? []) m.set(mi.name.toLowerCase(), mi);
    return m;
  }, [unit.magicItems]);
  // A chosen mount also appears in the loadout line; tapping it opens its profile + special rules.
  const mountByName = useMemo(() => {
    const m = new Map<string, { profiles: UnitProfile[]; specialRules: string[]; troopType?: string; details?: string[] }>();
    for (const mt of unit.mounts ?? []) m.set(mt.name.toLowerCase(), mt);
    return m;
  }, [unit.mounts]);

  return (
    <section style={{ border: `1px solid ${TOW.line}`, borderRadius: 12, background: dead ? 'rgba(74,55,22,0.03)' : TOW.panel2, padding: collapsed ? '11px 14px' : 14, marginBottom: 8, opacity: dead ? 0.7 : 1 }}>
      <div
        onClick={onToggleCollapse}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: collapsed ? 0 : 8, cursor: onToggleCollapse ? 'pointer' : 'default' }}
      >
        {onToggleCollapse && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={TOW.muted} strokeWidth="2.6" style={{ flexShrink: 0, transform: collapsed ? 'none' : 'rotate(90deg)', transition: 'transform .18s ease' }} aria-hidden="true"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 16, color: TOW.ink, textDecoration: dead ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: collapsed ? 'nowrap' : 'normal' }}>
            {unit.count ? <span style={{ color: TOW.goldDeep }}>{unit.count}× </span> : null}
            {unit.name}
          </h3>
          {unit.troopType && (
            <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginTop: 2 }}>{unit.troopType}</div>
          )}
        </div>
        {unit.points != null && (
          <span style={{ ...eb, fontSize: 9, color: TOW.muted, whiteSpace: 'nowrap' }}>{unit.points} pts</span>
        )}
      </div>

      {!collapsed && (<>
      {/* All profiles share the column set (M WS BS S T W I A Ld). When the unit has weapons,
          CombatStats owns the profile display + a small "Loadout" toggle for effective stats;
          otherwise we just show the base profile table(s). */}
      {hasWeapons ? (
        <CombatStats unit={unit} />
      ) : (
        unit.profiles.map((p, pi) => (
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
                    <td
                      key={i}
                      title={s.modified ? `${s.base} ${s.source ? `+ ${s.source}` : 'modified'}` : undefined}
                      style={{
                        textAlign: 'center',
                        color: s.modified ? TOW.goldDeep : TOW.ink,
                        fontWeight: s.modified ? 700 : 400,
                        background: s.modified ? 'rgba(184,134,47,0.10)' : 'transparent',
                        border: `1px solid ${TOW.line}`,
                        padding: '3px 2px',
                      }}
                    >{s.v}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ))
      )}

      {armour && (
        <div style={{ margin: '4px 0 10px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px' }}>
            <button
              onClick={() => openRule('determining-armour-value')}
              title="How armour value is determined"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '3px 10px', borderRadius: 999, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', cursor: 'pointer' }}
            >
              <span style={{ ...eb, fontSize: 8, color: TOW.muted }}>Armour Save</span>
              <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 15, color: TOW.goldDeep, lineHeight: 1 }}>{armour.save}+</span>
            </button>
            <span style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.parchDim }}>
              {armour.parts.join(' · ')}{armour.capped ? ' · max 2+' : ''}
            </span>
          </div>
          {armour.conditional?.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 4 }}>
              <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 13.5, color: TOW.goldDeep, lineHeight: 1 }}>{c.save}+</span>
              <span style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.parchDim }}>{c.when}</span>
            </div>
          ))}
          {armour.notes?.map((n, i) => (
            <div key={i} style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.muted, marginTop: 4 }}>{n}</div>
          ))}
        </div>
      )}

      {unit.options.length > 0 && (
        <div style={{ fontFamily: towFont.serif, fontSize: 13, color: TOW.parchDim, lineHeight: 1.9, margin: '4px 0 8px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 4px' }}>
          {unit.options.map((opt, i) => {
            // A magic item or a mount → open its info sheet; otherwise a wargear rule → the rule sheet.
            const mi = magicByName.get(opt.toLowerCase());
            const mt = !mi ? mountByName.get(opt.toLowerCase()) : undefined;
            const slug = mi || mt ? null : resolveOptionSlug(opt, idx, faction);
            // Drop a "{faction}" tag from the visible label (resolution uses the faction prop).
            const shown = opt.replace(/\s*\{[^}]*\}/g, '').trim();
            const onClick = mi
              ? () => setInfo({ title: shown, flavour: mi.flavour, rules: mi.specialRules })
              : mt
                ? () => setInfo({ title: shown, profiles: mt.profiles, rules: mt.specialRules, troopType: mt.troopType, details: mt.details })
                : slug ? () => openRule(slug) : null;
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                {i > 0 && <span style={{ color: TOW.faint, marginRight: 4 }}>·</span>}
                {onClick ? (
                  <button
                    onClick={onClick}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: towFont.serif, fontSize: 13, color: TOW.goldDeep, borderBottom: `1px dotted ${TOW.goldDeep}` }}
                  >
                    {shown}
                  </button>
                ) : (
                  <span>{shown}</span>
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
              const slug = resolveRuleSlug(label, idx, faction);
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

      {/* Campagne-veteraan (De Grensvorsten): gewonnen veteran-abilities + battle-scars, read-only.
          Alleen getoond als de unit gematcht is en er iets te tonen valt (ability of scar). Effect
          hangt als tooltip aan de chip; scars zijn een bloedkleurige badge. */}
      {unit.veteraan && (unit.veteraan.abilities.length > 0 || unit.veteraan.littekens > 0) && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 5 }}>Veteran abilities</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {unit.veteraan.abilities.map((a, i) => {
              const eff = abilityEffect(a.t);
              return (
                <span
                  key={i}
                  title={eff || undefined}
                  style={{ fontFamily: towFont.serif, fontSize: 12.5, padding: '4px 10px', borderRadius: 999, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep, cursor: eff ? 'help' : 'default' }}
                >
                  {abilityLabel(a.t)}{a.keuze ? ` · ${a.keuze.toUpperCase()}` : ''}
                </span>
              );
            })}
            {unit.veteraan.littekens > 0 && (
              <span
                title="Battle scars carried from the campaign"
                style={{ fontFamily: towFont.serif, fontSize: 12.5, padding: '4px 10px', borderRadius: 999, border: `1px solid ${TOW.blood}`, background: 'transparent', color: TOW.blood, cursor: 'help' }}
              >
                {scarLabel(unit.veteraan.littekens)}
              </span>
            )}
          </div>
        </div>
      )}

      {isWizard && (
        <WizardSpells unit={unit} editable={editable} onChange={onChange ?? (() => {})} />
      )}

      {tracked && (
        <WoundTracker
          unit={unit}
          lost={lost ?? 0}
          onSetLost={onSetLost!}
          fleeing={fleeing ?? false}
          onFlee={onFlee ?? (() => {})}
          weg={weg ?? false}
          onRemoved={onRemoved ?? (() => {})}
          kills={kills ?? 0}
          onSetKills={onSetKills ?? (() => {})}
          editable={editable}
        />
      )}
      </>)}

      <InfoSheet info={info} onClose={() => setInfo(null)} />
    </section>
  );
}
