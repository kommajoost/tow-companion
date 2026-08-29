import { useEffect, useState } from 'react';
import { useGame } from '../../game';
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
 *  Buiten een campagne blijft de lijst leeg, behalve bij een Battle March: daar valt objectivesVoor
 *  terug op troves + landmark bij naam, zodat je niet in een anoniem vrij veld hoeft te typen. */
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

  return objectivesVoor(scenario.scenario, scenario.secondaries, tracker.battleMarch === true);
}
