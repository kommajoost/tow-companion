import { useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { usePersistentState } from '../../store';
import { ArmyListPicker } from './ArmyListPicker';
import type { BuilderList } from '../../lib/owbBuilder';
import type { Army } from '../../types';
import { isVersterkingLijst, versterkingTeZwaar } from '../../lib/versterking';

// REINFORCEMENT DETACHMENT (23-10-2026) — kies de versterking die deze battle bij je leger komt.
// Zie lib/versterking.ts voor de regel en het waarom. Twee plekken gebruiken dit: de campagne-briefing
// (alleen als de server een versterking voor jouw kant meegeeft) en het potje zelf (GameView), waar je
// hem bij een vrij potje ook kunt toevoegen.
//
// De lijst komt uit je eigen lijsten (`tow:lists`), alleen versterkingslijsten van HETZELFDE army book
// als je leger. Het omzetten naar een Army doet ArmyListPicker, precies zoals bij je hoofdlijst.

const eb = engraved as React.CSSProperties;
const serif = towFont.serif;
const display = towFont.display;

/** "Orc & Goblin Tribes" -> "orc-and-goblin-tribes", zoals de catalogus-slugs heten. */
const factieSlug = (naam: string): string =>
  naam.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

interface SavedList extends BuilderList { id: string; name: string; army: string; createdAt: number; updatedAt: number }

/** Het blok onder je leger: wat er bij staat, of een knop om er een te kiezen. */
export function VersterkingKiezer({
  max, leger, factie = null, gekozen, onPick, onWeg, lijsten = null, autoPick = false, open: openInit = false, testid = 'versterking',
}: {
  /** De puntengrens van deze battle (helft van de cap), of null als die niet bekend is (vrij potje). */
  max: number | null;
  /** Army slug van je leger; alleen versterkingen van dit army book. null = niet bekend → alles tonen. */
  leger: string | null;
  /** Zonder slug (in het potje): de leesbare factienaam van het leger ("Orc & Goblin Tribes"). */
  factie?: string | null;
  /** Wat er nu als versterking klaarstaat (naam + punten), of null. */
  gekozen: { naam: string; punten: number | null } | null;
  onPick: (a: Army) => void;
  onWeg: () => void;
  /** Het Scenario lab geeft zijn mock-versterking mee in plaats van je eigen lijsten. */
  lijsten?: SavedList[] | null;
  /** Met precies één versterking: meteen laden (het lab). */
  autoPick?: boolean;
  open?: boolean;
  testid?: string;
}) {
  const [opgeslagen] = usePersistentState<SavedList[]>('tow:lists', []);
  const [open, setOpen] = useState(openInit);
  // Na "Remove" niet meteen opnieuw automatisch laden (het lab): dan kies je zelf.
  const [handmatig, setHandmatig] = useState(false);
  const auto = autoPick && !handmatig;
  const weg = () => { setHandmatig(true); setOpen(true); onWeg(); };
  const bron = lijsten ?? opgeslagen;
  const alle = bron.filter((l) => isVersterkingLijst(l));
  // Zelfde army book: op slug als die bekend is, anders op de factienaam ("Orc & Goblin Tribes" ->
  // "orc-and-goblin-tribes"). Past er dan niets, dan alle versterkingslijsten: liever kiezen dan vastzitten.
  const slug = leger || (factie ? factieSlug(factie) : null);
  const passend = slug ? alle.filter((l) => l.army === slug) : alle;
  const kandidaten = !leger && passend.length === 0 ? alle : passend;
  const teZwaar = versterkingTeZwaar(gekozen?.punten, max);

  return (
    <div data-testid={testid} style={{ border: `1px solid ${TOW.goldDeep}`, borderRadius: 10, padding: '10px 12px', background: 'rgba(184,134,47,0.07)', marginBottom: 12 }}>
      <div style={{ ...eb, fontSize: 8, color: TOW.goldDeep }}>Reinforcement detachment{max ? ` · up to ${max} pts` : ''}</div>
      {gekozen ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span data-testid={`${testid}-naam`} style={{ flex: 1, minWidth: 0, fontFamily: display, fontWeight: 700, fontSize: 14, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gekozen.naam}</span>
            <span data-testid={`${testid}-punten`} style={{ flexShrink: 0, fontFamily: serif, fontSize: 13, color: teZwaar ? TOW.blood : TOW.parchDim, fontVariantNumeric: 'tabular-nums' }}>
              {gekozen.punten ?? '—'}{max ? ` / ${max}` : ''} pts
            </span>
            <button type="button" onClick={weg} style={{ flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', fontFamily: serif, fontSize: 12.5, color: TOW.muted, textDecoration: 'underline' }}>Remove</button>
          </div>
          {teZwaar && (
            <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.blood, marginTop: 4 }}>
              Over the limit for this battle by {(gekozen.punten ?? 0) - (max ?? 0)} pts — trim the reinforcement list.
            </div>
          )}
          <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12, color: TOW.muted, marginTop: 4, lineHeight: 1.45 }}>
            Joins your army for this battle only: it counts for Victory Points, but earns no XP or scars and is not part of your campaign list.
          </div>
        </>
      ) : !open && !auto ? (
        <>
          <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim, marginTop: 4, lineHeight: 1.45 }}>
            Outnumbered (2 vs 3)? Each general on the smaller side may add a reinforcement of half the cap, from their own army book.
          </div>
          <button type="button" data-testid={`${testid}-open`} onClick={() => setOpen(true)}
            style={{ marginTop: 8, padding: '8px 13px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${TOW.goldDeep}`, background: TOW.cardLt, color: TOW.ink, fontFamily: display, fontWeight: 700, fontSize: 12.5 }}>
            Add a reinforcement detachment
          </button>
        </>
      ) : kandidaten.length === 0 ? (
        <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim, marginTop: 4, lineHeight: 1.45 }}>
          No reinforcement list for this army on this device yet. Make one in Lists: open your army, then
          List settings › New reinforcement detachment.
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <ArmyListPicker
            onPick={onPick}
            lijsten={kandidaten}
            label="Choose your reinforcement list"
            lockedListName={auto && kandidaten.length === 1 ? kandidaten[0].name : null}
            lockedListArmy={auto && kandidaten.length === 1 ? kandidaten[0].army : null}
            autoPick={auto}
            stil={auto}
          />
        </div>
      )}
    </div>
  );
}
