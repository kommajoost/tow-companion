import { useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import type { GameWeer } from '../../types';
import type { FoundItem, Perk, RollOffBron } from '../../lib/campaignBattle';

const eb = engraved as React.CSSProperties;

/** Wat één kant tijdens het potje moet onthouden: zijn gekozen perks, zijn magic items, en de bonus op
 *  de worp om de eerste beurt (van perks én van gebouwen die altijd werken, zoals de Scouting Outpost). */
export interface KantReminders {
  naam: string;
  perks: Perk[];
  items: FoundItem[];
  rollOff: RollOffBron[];
}

const leeg = (k: KantReminders | null | undefined): boolean =>
  !k || (k.perks.length === 0 && k.items.length === 0 && k.rollOff.length === 0);

/** De namen van één kant op één regel: perks, dan items (een consumable krijgt "single use"). */
const namenVan = (k: KantReminders): string =>
  [...k.perks.map((p) => p.label), ...k.items.map((i) => (i.soort === 'consumable' ? `${i.naam} (single use)` : i.naam))].join(', ');

/**
 * DE REMINDER-BALK TIJDENS HET SPEL (Joost 05-10-2026): "een klein balkje met reminders dat zichtbaar
 * blijft", met "een regel met het weather effect".
 *
 * Staat VAST onder de ronde- en VP-balk, dus hij scrollt niet mee met de units. Dicht is hij hooguit
 * twee regels — het weer met z'n effect, en de namen van wat beide kanten meebrengen — zodat de
 * unitlijst eronder zo veel mogelijk ruimte houdt. Eén tik klapt hem open voor de volledige teksten;
 * een tweede tik klapt hem weer dicht. Open is hij begrensd in hoogte en scrollt hij zelf: een lange
 * lijst perks mag de roster er niet onder vandaan duwen.
 *
 * Effecten staan als TEKST, nooit alleen in een tooltip: dit scherm draait op een telefoon, en daar
 * bestaat hover niet.
 *
 * Niets om te tonen (geen weer, geen campagne-reminders) → de balk is er niet.
 */
export function ReminderStrip({ weer, mij, tegen }: {
  weer: GameWeer | null;
  mij: KantReminders | null;
  tegen: KantReminders | null;
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const heeftKanten = !leeg(mij) || !leeg(tegen);
  if (!weer && !heeftKanten) return null;

  const regel: React.CSSProperties = {
    display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0,
  };
  const kop: React.CSSProperties = { ...eb, fontSize: 7.5, color: TOW.muted, flexShrink: 0 };
  const eenRegel: React.CSSProperties = {
    flex: 1, minWidth: 0, fontFamily: towFont.serif, fontSize: 12.5, color: TOW.parchDim,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  };

  /** Dichte samenvatting van beide kanten: "You: … · Opp: …". Een lege kant valt weg. */
  const samenvatting = [mij, tegen]
    .filter((k): k is KantReminders => !!k && (k.perks.length > 0 || k.items.length > 0))
    .map((k) => `${k.naam}: ${namenVan(k)}`)
    .join(' · ');

  const kantBlok = (k: KantReminders | null) => {
    if (!k || leeg(k)) return null;
    const bonus = k.rollOff.reduce((n, b) => n + b.waarde, 0);
    return (
      <div style={{ marginTop: 9 }}>
        <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 13, color: TOW.ink }}>{k.naam}</div>
        {k.rollOff.length > 0 && (
          <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.parch, lineHeight: 1.45, marginTop: 2 }}>
            <span style={{ fontWeight: 700, color: TOW.goldDeep }}>Roll for first turn +{bonus}</span>
            <span style={{ color: TOW.muted }}> — {k.rollOff.map((b) => `${b.label} +${b.waarde}`).join(' · ')}</span>
          </div>
        )}
        {k.perks.map((p, i) => (
          <div key={`p-${p.perk}-${i}`} style={{ marginTop: 5 }}>
            <div style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5, color: TOW.goldDeep }}>{p.label}</div>
            {p.effect && <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.parch, lineHeight: 1.45 }}>{p.effect}</div>}
          </div>
        ))}
        {k.items.map((it, i) => (
          <div key={`i-${it.naam}-${i}`} style={{ marginTop: 5 }}>
            <div style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5, color: TOW.goldDeep }}>
              {it.naam}
              {it.punten ? <span style={{ fontFamily: towFont.serif, fontWeight: 400, color: TOW.muted }}> · {it.punten} pts</span> : null}
              {it.soort === 'consumable' ? <span style={{ ...eb, fontSize: 7.5, color: TOW.muted, marginLeft: 7 }}>Single use</span> : null}
            </div>
            {it.effect && <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.parch, lineHeight: 1.45 }}>{it.effect}</div>}
          </div>
        ))}
      </div>
    );
  };

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box',
        padding: '6px 10px', borderRadius: 10, border: `1px solid ${TOW.line}`, background: TOW.cardLt,
        display: 'flex', alignItems: 'flex-start', gap: 8,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* DICHT: het weer met z'n effect op één regel, en de namen van perks/items op één regel. */}
        {!open && weer && (
          <div style={regel}>
            <span style={kop}>Weather</span>
            <span style={eenRegel}>
              <span style={{ fontWeight: 700, color: TOW.goldDeep }}>{weer.naam}</span>
              {weer.effect ? ` — ${weer.effect}` : ''}
            </span>
          </div>
        )}
        {!open && samenvatting && (
          <div style={regel}>
            <span style={kop}>Reminders</span>
            <span style={eenRegel}>{samenvatting}</span>
          </div>
        )}
        {/* Alleen een first-turn-bonus en verder niets: dan zegt de samenvatting niets, dus noemen we
            hem hier zelf, anders lijkt de balk leeg. */}
        {!open && !samenvatting && heeftKanten && (
          <div style={regel}>
            <span style={kop}>Reminders</span>
            <span style={eenRegel}>Roll for first turn — tap for the bonuses</span>
          </div>
        )}

        {/* OPEN: alles volledig, in een eigen scrollvlak zodat de roster eronder zichtbaar blijft. */}
        {open && (
          <div style={{ maxHeight: '42vh', overflowY: 'auto', paddingRight: 2 }}>
            {weer && (
              <div>
                <div style={kop}>Weather{weer.worp ? ` · roll ${weer.worp}` : ''}</div>
                <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 14, color: TOW.goldDeep, marginTop: 1 }}>{weer.naam}</div>
                {weer.effect && <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.parch, lineHeight: 1.45, marginTop: 2 }}>{weer.effect}</div>}
                <div style={{ ...eb, fontSize: 7, color: TOW.faint, marginTop: 4 }}>In play for the whole game</div>
              </div>
            )}
            {heeftKanten && (
              <div style={{ marginTop: weer ? 10 : 0, borderTop: weer ? `1px solid ${TOW.line}` : 'none', paddingTop: weer ? 2 : 0 }}>
                {kantBlok(mij)}
                {kantBlok(tegen)}
              </div>
            )}
          </div>
        )}
      </div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TOW.muted} strokeWidth="2.6" style={{ flexShrink: 0, marginTop: 3, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s ease' }} aria-hidden>
        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
