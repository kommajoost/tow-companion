import { useEffect, useState } from 'react';
import { TOW, towFont } from '../../design/tow';
import { usePersistentState } from '../../store';
import { useGame } from '../../game';
import { DEFAULT_SHEET, normSheet, type BattleSheet } from '../../lib/battleSheet';
import { GameStart } from './GameStart';
import { NewBattleWizard } from './NewBattleWizard';
import { GameLobby } from './GameLobby';
import { GameView } from './GameView';
import { BattlefieldEditor, BF_STEPS } from './BattlefieldEditor';
import { CampaignBattlePanel } from './CampaignBattlePanel';

// The "Game" tab: set up (host/join) a live battle, then track it turn by turn. Army building and
// the unit catalogue moved to the separate "Army" tab.
//
// DE ROUTE, VAN BUITEN NAAR BINNEN (13-09):
//   1. een openstaande CAMPAGNE-battle wint van alles — die komt van de server en heeft zijn eigen
//      scherm;
//   2. zit je in een potje dat AL LOOPT → de game;
//   3. zit je in een potje dat nog NIET gestart is → de lobby (de host stelt de sheet nog bij, beide
//      spelers kiezen hun leger, de host drukt op Start);
//   4. anders → het startscherm, en de wizard als je die opent.
//
// ONTBREEKT `gestart`, DAN IS HET GESTART. Elke game van vóór vandaag heeft dat veld niet (zie
// GameTracker.gestart in types.ts), en die mensen horen gewoon door te spelen — niet ineens in een
// wachtkamer te belanden voor een potje dat al twee rondes bezig is. De lobby eist daarom een
// EXPLICIETE `false`, en alleen de wizard zet die.
export function GameMode() {
  const { seat, code, tracker, setSheet } = useGame();
  // A pending campaign-battle code (from the ?battle= deep-link, or set elsewhere) takes over the
  // setup screen with the campaign-battle flow — until the user is seated in a game or dismisses it.
  // Normal (no-code) game setup is unchanged.
  const [pendingBattle, setPendingBattle] = usePersistentState<string | null>('tow:campaign-battle', null);
  // STAAT DE WIZARD OPEN? Bewust persistent, net als de draft zelf. GameMode wordt bij elke tabwissel
  // opnieuw gemount (AppShell rendert alleen de actieve tab), dus met gewone `useState` stond je na
  // een uitstapje naar de Army-tab weer op het startscherm — je keuzes waren er nog, maar je moest
  // opnieuw op "New battle" drukken om ze terug te zien. Dat is precies het soort kleine hapering dat
  // deze hele verbouwing moest wegnemen (Joost, 13-09).
  const [nieuw, setNieuw] = usePersistentState<boolean>('tow:battle-wizard-open', false);
  const [sheetBewerken, setSheetBewerken] = useState(false);

  // Zodra je in een potje zit is de wizard klaar — zonder dit zou je na `leaveGame` terugvallen in
  // een wizard die je niet geopend hebt.
  useEffect(() => { if (seat) setNieuw(false); }, [seat]);
  // Buiten de lobby valt er niets bij te stellen; sluit het editor-scherm dus mee.
  useEffect(() => { if (!seat) setSheetBewerken(false); }, [seat]);

  // A pending battle whose code we're NOT already seated in wins over a stale persisted game.
  // Without this, a left-over game (a `seat`/`code` from a previous session) shadowed the battle
  // link: the player would land back in their OLD game and never join the shared code, so both
  // players sat alone (opponent stayed empty). Opening the panel seats them on the shared code and
  // replaces the stale game. If we're already seated in the pending code, keep playing (GameView).
  const pending = pendingBattle ? pendingBattle.trim().toUpperCase() : null;
  const seatedInPending = !!pending && !!code && code.trim().toUpperCase() === pending;
  const showBattlePanel = !!pending && !seatedInPending;
  const inLobby = !!seat && tracker.gestart === false;

  return (
    <div style={{ height: '100%', minHeight: 0 }}>
      {showBattlePanel ? (
        <CampaignBattlePanel code={pending as string} onDismiss={() => setPendingBattle(null)} />
      ) : inLobby && sheetBewerken ? (
        <LobbySheetEditor
          sheet={normSheet(tracker.sheet) ?? DEFAULT_SHEET}
          onSave={(s) => { setSheet(s); setSheetBewerken(false); }}
          onCancel={() => setSheetBewerken(false)}
        />
      ) : inLobby ? (
        <GameLobby onEditSheet={() => setSheetBewerken(true)} />
      ) : seat ? (
        <GameView />
      ) : nieuw ? (
        <NewBattleWizard onBack={() => setNieuw(false)} />
      ) : (
        <GameStart onNewBattle={() => setNieuw(true)} />
      )}
    </div>
  );
}

/** De sheet bijstellen vanuit de LOBBY. Bewust met een eigen concept-kopie en één Save-knop: `setSheet`
 *  schrijft naar de gedeelde game-rij, en bij elke muisbeweging over het terreinbord een write
 *  afvuren zou de tegenstander een flikkerend bord geven én de verbinding onnodig belasten. Eén keer
 *  opslaan als je klaar bent, precies zoals de host het aan tafel ook zou zeggen. */
function LobbySheetEditor({ sheet, onSave, onCancel }: {
  sheet: BattleSheet;
  onSave: (s: BattleSheet) => void;
  onCancel: () => void;
}) {
  const [concept, setConcept] = useState<BattleSheet>(sheet);
  const [stap, setStap] = useState(0);
  const goldGrad = `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`;

  return (
    <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '12px 14px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button onClick={onCancel} aria-label="Back" style={{ height: 32, flexShrink: 0, borderRadius: 8, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5, color: TOW.inkDim, padding: '0 11px' }}>‹ Back</button>
          <h2 style={{ margin: 0, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 20, color: TOW.ink }}>Edit battle sheet</h2>
        </div>

        <BattlefieldEditor sheet={concept} onChange={setConcept} stap={stap} onStap={setStap} />

        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <button
            onClick={() => (stap > 0 ? setStap(stap - 1) : onCancel())}
            style={{ flex: '0 0 auto', padding: '11px 16px', borderRadius: 11, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: 'transparent', color: TOW.inkDim, fontFamily: towFont.display, fontWeight: 600, fontSize: 14 }}
          >{stap > 0 ? '‹ Back' : 'Cancel'}</button>
          {stap < BF_STEPS.length - 1 && (
            <button
              onClick={() => setStap(stap + 1)}
              style={{ flex: '1 1 120px', padding: '11px 16px', borderRadius: 11, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: 'transparent', color: TOW.inkDim, fontFamily: towFont.display, fontWeight: 600, fontSize: 14 }}
            >Next ›</button>
          )}
          <button
            onClick={() => onSave(concept)}
            style={{ flex: '1 1 160px', padding: '13px 18px', borderRadius: 11, border: 'none', background: goldGrad, color: TOW.onGrad, fontFamily: towFont.display, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          >✓ Save battle sheet</button>
        </div>
      </div>
    </div>
  );
}
