import { useMemo, useState } from 'react';
import { useData } from '../../data';
import { useUI } from '../../state';
import { TOW, towFont, engraved } from '../../design/tow';
import { suggestedLores, wizardInfo } from '../../lib/armyRules';
import type { ArmyUnit, Lore } from '../../types';

const eb = engraved as React.CSSProperties;

// Per-wizard spell picker. The chosen spells always show as tappable chips (→ rule pop-up);
// the actual choosing happens in a pop-up opened from a button, so the lore lists don't
// clutter the card. Read-only for an opponent you're not editing.
export function WizardSpells({
  unit,
  editable,
  onChange,
}: {
  unit: ArmyUnit;
  editable: boolean;
  onChange: (patch: Partial<ArmyUnit>) => void;
}) {
  const { lores, loreList } = useData();
  const { openRule } = useUI();
  const [open, setOpen] = useState(false);

  const haveLoreData = loreList.length > 0;
  const { level } = wizardInfo(unit);

  const activeLores = useMemo(
    () => (unit.lores ?? suggestedLores(unit, lores)).filter((s) => lores[s]),
    [unit.lores, lores], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const selected = unit.spells ?? [];

  const setLoresAndSpells = (nextLores: string[], nextSpells: string[]) =>
    onChange({ lores: nextLores, spells: nextSpells });

  const toggleSpell = (spellSlug: string) => {
    const next = selected.includes(spellSlug)
      ? selected.filter((s) => s !== spellSlug)
      : [...selected, spellSlug];
    setLoresAndSpells(activeLores, next);
  };

  const addLore = (slug: string) => {
    if (!slug || activeLores.includes(slug)) return;
    setLoresAndSpells([...activeLores, slug], selected);
  };

  const removeLore = (slug: string) => {
    const lore = lores[slug];
    const loreSpellSlugs = new Set((lore?.spells ?? []).map((sp) => sp.slug));
    const others = activeLores.filter((s) => s !== slug);
    const stillAvailable = new Set(
      others.flatMap((s) => (lores[s]?.spells ?? []).map((sp) => sp.slug)),
    );
    const nextSpells = selected.filter((s) => !loreSpellSlugs.has(s) || stillAvailable.has(s));
    setLoresAndSpells(others, nextSpells);
  };

  // Chips for the chosen spells: active lores' order first, then any selected spell whose
  // lore is no longer active (so nothing silently disappears).
  const spellName = (slug: string): string | undefined => {
    for (const l of Object.values(lores)) {
      const sp = l.spells.find((s) => s.slug === slug);
      if (sp) return sp.name;
    }
    return undefined;
  };
  const chosenChips: { slug: string; name: string }[] = [];
  const pushChip = (slug: string) => {
    if (chosenChips.some((c) => c.slug === slug)) return;
    const name = spellName(slug);
    if (name) chosenChips.push({ slug, name });
  };
  for (const loreSlug of activeLores) {
    for (const sp of lores[loreSlug]?.spells ?? []) {
      if (selected.includes(sp.slug)) pushChip(sp.slug);
    }
  }
  for (const slug of selected) pushChip(slug);

  if (!haveLoreData) return null;

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${TOW.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: chosenChips.length ? 6 : 0 }}>
        <span style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep }}>Spells</span>
        {level != null && (
          <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted }}>Level {level}</span>
        )}
        {editable && (
          <button
            onClick={() => setOpen(true)}
            style={{ marginLeft: 'auto', border: `1px solid ${TOW.goldDeep}`, borderRadius: 999, background: 'transparent', color: TOW.goldDeep, cursor: 'pointer', padding: '4px 12px', fontFamily: towFont.display, fontWeight: 600, fontSize: 12 }}
          >
            {chosenChips.length ? 'Edit spells' : 'Choose spells'}
          </button>
        )}
      </div>

      {chosenChips.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {chosenChips.map((c) => (
            <button
              key={c.slug}
              onClick={() => openRule(c.slug)}
              style={{ fontFamily: towFont.serif, fontSize: 12.5, padding: '4px 10px', borderRadius: 999, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.goldDeep, cursor: 'pointer' }}
            >
              ✦ {c.name}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 12, color: TOW.muted }}>
          {editable ? 'No spells chosen yet — tap “Choose spells”.' : 'No spells chosen yet.'}
        </div>
      )}

      {editable && open && (
        <SpellPicker
          unitName={unit.name}
          level={level}
          lores={lores}
          loreList={loreList}
          activeLores={activeLores}
          selected={selected}
          onToggleSpell={toggleSpell}
          onAddLore={addLore}
          onRemoveLore={removeLore}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// Modal: choose lore(s) and tick the spells you rolled. Rendered as a fixed overlay so it
// escapes the army-list scroll container.
function SpellPicker({
  unitName,
  level,
  lores,
  loreList,
  activeLores,
  selected,
  onToggleSpell,
  onAddLore,
  onRemoveLore,
  onClose,
}: {
  unitName: string;
  level: number | null;
  lores: Record<string, Lore>;
  loreList: string[];
  activeLores: string[];
  selected: string[];
  onToggleSpell: (slug: string) => void;
  onAddLore: (slug: string) => void;
  onRemoveLore: (slug: string) => void;
  onClose: () => void;
}) {
  const addable = loreList.filter((s) => !activeLores.includes(s)).map((s) => lores[s]).filter(Boolean);
  const fullLores = addable.filter((l) => l.spells.length >= 6);
  const sigLores = addable.filter((l) => l.spells.length < 6);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(30,20,8,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tow-field"
        style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: TOW.panel2, borderTopLeftRadius: 18, borderTopRightRadius: 18, border: `1px solid ${TOW.lineStrong}`, boxShadow: '0 -10px 40px rgba(0,0,0,0.25)' }}
      >
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${TOW.line}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>Choose spells{level != null ? ` · Level ${level}` : ''}</div>
            <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 16, color: TOW.ink, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{unitName}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 24, lineHeight: 1, color: TOW.muted, padding: '0 4px' }}>×</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px' }}>
          {activeLores.length === 0 && (
            <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 13, color: TOW.muted, marginBottom: 10 }}>
              Add the lore your Wizard uses, then tick the spells you rolled.
            </div>
          )}

          {activeLores.map((slug) => {
            const lore = lores[slug];
            if (!lore) return null;
            return (
              <div key={slug} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: lore.color || TOW.goldDeep, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 14, color: TOW.ink }}>{lore.name}</span>
                  <button onClick={() => onRemoveLore(slug)} aria-label={`Remove ${lore.name}`} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: TOW.faint, fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {lore.spells.map((sp) => {
                    const on = selected.includes(sp.slug);
                    return (
                      <label key={sp.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 6px', borderRadius: 8, background: on ? 'rgba(184,134,47,0.10)' : 'transparent' }}>
                        <input type="checkbox" checked={on} onChange={() => onToggleSpell(sp.slug)} style={{ accentColor: TOW.goldDeep, width: 17, height: 17, flexShrink: 0 }} />
                        <span style={{ fontFamily: towFont.serif, fontSize: 14, color: TOW.ink }}>
                          <span style={{ color: TOW.muted, marginRight: 7 }}>{sp.signature ? '✦' : sp.number}</span>
                          {sp.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {(fullLores.length > 0 || sigLores.length > 0) && (
            <select
              value=""
              onChange={(e) => { onAddLore(e.target.value); e.currentTarget.value = ''; }}
              style={{ marginTop: 4, width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, padding: '10px 12px', fontFamily: towFont.serif, fontSize: 14 }}
            >
              <option value="">+ Add a lore…</option>
              {fullLores.length > 0 && (
                <optgroup label="Lores (7 spells)">
                  {fullLores.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
                </optgroup>
              )}
              {sigLores.length > 0 && (
                <optgroup label="Signature spells (army lores)">
                  {sigLores.map((l) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
                </optgroup>
              )}
            </select>
          )}
        </div>

        <div style={{ flexShrink: 0, padding: '12px 16px', borderTop: `1px solid ${TOW.line}` }}>
          <button onClick={onClose} style={{ width: '100%', border: 'none', borderRadius: 11, cursor: 'pointer', padding: '12px 18px', background: `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`, color: '#2a1a0a', fontFamily: towFont.display, fontWeight: 700, fontSize: 15 }}>Done</button>
        </div>
      </div>
    </div>
  );
}
