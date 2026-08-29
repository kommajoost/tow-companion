import { useEffect, useState } from 'react';
import { useGame } from '../../game';
import { usePersistentState } from '../../store';
import { DEFAULT_BATTLE, scenarioById, type BattleSetupState } from '../../lib/battle';
import { battleByCode } from '../../lib/campaignBattle';
import { objectivesVoor, type ObjectiveDef } from '../../lib/objectiveVp';

/** Welke objective-VP-posten gelden in deze battle?
 *
 *  Het scenario en de secondaries staan op de CAMPAGNE-battle, niet in de tracker, dus die moet via
 *  de game-code opgehaald worden. Dat deed VpPanel al voor het eindscherm; nu de speler ze ook
 *  tijdens de rondes moet kunnen bijhouden (Joost, 29-08) zou dat een tweede kopie van dezelfde
 *  ophaal-en-afleid-stap worden — en twee kopieën is precies hoe twee schermen uit elkaar gaan lopen
 *  over WELKE objectives er gelden.
 *
 *  BUITEN EEN CAMPAGNE geldt het scenario dat je zelf op het setup-scherm koos. Dat staat lokaal
 *  onder 'tow:battle', want een gewoon potje heeft geen campagne-rij om het op te hangen — maar het
 *  is wél een echte keuze, met echte objectives. Zonder deze terugval bleef het paneel daar leeg en
 *  had je bij Domination of Strategic Locations niets om aan te tikken (Joost, 29-08).
 *
 *  De campagne wint als die er is: dat scenario is door beide spelers gedeeld, de lokale keuze is
 *  per apparaat. In een online potje BUITEN een campagne kiest ieder dus zijn eigen scenario; wijken
 *  die af, dan ziet ieder zijn eigen objectives. Dat is geen nieuw probleem — het setup-scherm was al
 *  per apparaat — maar het is wel de grens van wat dit paneel kan garanderen. */
export function useObjectives(): ObjectiveDef[] {
  const { tracker, code } = useGame();
  const [scenario, setScenario] = useState<{ scenario: string | null; secondaries: string[] }>(
    { scenario: null, secondaries: [] },
  );

  useEffect(() => {
    if (!code) { setScenario({ scenario: null, secondaries: [] }); return; }
    let leeft = true;
    battleByCode(code)
      .then((b) => {
        if (!leeft) return;
        const sc = b?.scenario as Record<string, unknown> | null | undefined;
        setScenario({
          scenario: typeof sc?.scenario === 'string' ? sc.scenario : null,
          secondaries: Array.isArray(sc?.secondaries)
            ? (sc.secondaries as unknown[]).filter((x): x is string => typeof x === 'string')
            : [],
        });
      })
      .catch(() => { if (leeft) setScenario({ scenario: null, secondaries: [] }); });
    return () => { leeft = false; };
  }, [code]);

  // Het lokaal gekozen scenario, voor potjes zonder campagne-rij.
  const [lokaal] = usePersistentState<BattleSetupState>('tow:battle', DEFAULT_BATTLE);
  const uitCampagne = objectivesVoor(scenario.scenario, scenario.secondaries, tracker.battleMarch === true);
  if (uitCampagne.length) return uitCampagne;
  // tracker.battleMarch wordt door de CAMPAGNE gezet. Kies je in een gewoon potje zelf een Battle
  // March-scenario, dan staat die vlag niet aan en zou je juist de treasure troves missen — het
  // voorbeeld waar het om begonnen was. Het scenario zegt zelf al tot welke groep het hoort.
  const lokaalBM = scenarioById(lokaal?.scenario ?? '')?.group === 'battle-march';
  return objectivesVoor(lokaal?.scenario ?? null, lokaal?.secondaries ?? [], tracker.battleMarch === true || lokaalBM);
}
