import { useEffect, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { stelNamenVoor } from '../../lib/naamForge';
import type { CampaignUnit } from '../../lib/campaign';

// De naam-dialoog van een campagne-unit. Woonde eerst binnenin BuilderWorkspace, maar dat is sinds
// `tow:builder-v2` de FALLBACK-builder — in de standaard-builder (components/builder/BuilderFlow) kon
// je een unit dus helemaal geen naam geven, terwijl de campagne er wel een eist. Vandaar hier, als
// losse component die beide builders gebruiken: één dialoog, één naam-smid, geen twee waarheden.
//
// De naam is geen cosmetiek: De Grensvorsten hangt de veteranen-identiteit eraan (XP, abilities en
// littekens volgen deze naam over lijsten en battles heen). Daarom draft + expliciete Save, en niet
// live meetypen.

const eb = engraved as React.CSSProperties;
// Zelfde lokale gradient-const als de andere dialogen in deze app (CeledonLoginDialog, CombatCalc).
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

export function NaamDialoog({ unitNaam, cat, armySlug, huidig, register, onBewaar, onSluit }: {
  /** De catalogusnaam van de unit ("Witch Elves") — voedt de naam-smid en de placeholder. */
  unitNaam: string;
  /** 'characters' levert persoonsnamen ("Dreth the Cruel"), de rest regimentsnamen. */
  cat?: string;
  /** Army-slug voor de factie-woordbank; onbekend valt terug op de generieke bank. */
  armySlug: string;
  huidig: string;
  /** Bestaande campagne-regimenten om uit te kiezen (met XP) — hiermee koppel je deze entry aan een
   *  regiment dat al een geschiedenis heeft in plaats van per ongeluk een nieuwe te beginnen. */
  register: CampaignUnit[];
  onBewaar: (naam: string) => void;
  onSluit: () => void;
}): React.JSX.Element {
  const [concept, setConcept] = useState(huidig);
  const [suggesties, setSuggesties] = useState<string[]>([]);
  // Meteen een handvol suggesties bij het openen: de knop "Suggest names" eerst moeten vinden is een
  // stap te veel op precies het moment dat je niet weet wat je moet invullen.
  useEffect(() => { setSuggesties(stelNamenVoor(armySlug, unitNaam, 4, cat)); }, [armySlug, unitNaam, cat]);

  const klaar = concept.trim().length > 0;
  const bewaar = () => { if (klaar) onBewaar(concept.trim()); };

  return (
    <div
      onClick={onSluit}
      style={{
        position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(30,20,8,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(ev) => ev.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, background: TOW.panel, borderRadius: 16,
          border: `1px solid ${TOW.lineStrong}`, boxShadow: '0 16px 50px rgba(40,24,8,0.34)',
          padding: 16, animation: 'sheet-pop .18s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ ...eb, fontSize: 8, color: TOW.muted }}>Campaign · {unitNaam}</span>
          <button onClick={onSluit} aria-label="Close" style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', color: TOW.muted, fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 18, color: TOW.ink, marginBottom: 4 }}>
          {cat === 'characters' ? 'Name this character' : 'Name this regiment'}
        </div>
        <div style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.muted, marginBottom: 10 }}>
          Optional. The campaign tracks this regiment's XP, abilities and scars either way — a name just
          makes it yours, and you can change it later without losing any of that.
        </div>
        <input
          value={concept}
          onChange={(ev) => setConcept(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Enter') bewaar(); }}
          placeholder={cat === 'characters' ? `e.g. "Aldric the Grim" (${unitNaam})` : `e.g. "The Blackspears" (${unitNaam})`}
          maxLength={40}
          autoFocus
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: `1.5px solid ${klaar ? TOW.lineStrong : TOW.blood}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 14, color: TOW.ink, outline: 'none' }}
        />
        {register.length > 0 && (
          <select
            value=""
            onChange={(ev) => { if (ev.target.value) setConcept(ev.target.value); }}
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 7, padding: '9px 10px', borderRadius: 9, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 13, color: TOW.ink }}
          >
            <option value="">Pick an existing regiment…</option>
            {register.map((r) => (
              <option key={r.naam} value={r.naam}>
                {r.naam} · {r.xp} XP{r.abilities ? ` · ${r.abilities} abilit${r.abilities === 1 ? 'y' : 'ies'}` : ''}{r.littekens ? ` · ${r.littekens} scar${r.littekens === 1 ? '' : 's'}` : ''}
              </option>
            ))}
          </select>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, alignItems: 'center' }}>
          <button
            onClick={() => setSuggesties(stelNamenVoor(armySlug, unitNaam, 4, cat))}
            style={{ border: `1px solid ${TOW.line}`, background: 'transparent', borderRadius: 7, cursor: 'pointer', color: TOW.goldDeep, padding: '4px 9px', ...eb, fontSize: 7.5 }}
          >
            Reroll names
          </button>
          {suggesties.map((n) => (
            <button
              key={n}
              onClick={() => setConcept(n)}
              style={{ border: `1px solid ${TOW.line}`, background: concept === n ? 'rgba(138,108,48,0.2)' : 'rgba(138,108,48,0.08)', borderRadius: 99, cursor: 'pointer', color: TOW.ink, padding: '4px 10px', fontFamily: towFont.serif, fontSize: 11.5 }}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          onClick={bewaar}
          disabled={!klaar}
          style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 10, border: 'none', cursor: klaar ? 'pointer' : 'default', background: klaar ? goldGrad : TOW.cardLt, color: klaar ? TOW.onGrad : TOW.muted, fontFamily: towFont.display, fontWeight: 700, fontSize: 14, letterSpacing: '0.04em' }}
        >
          Save name
        </button>
      </div>
    </div>
  );
}
