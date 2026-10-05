import { useEffect, useState } from 'react';
import { battleByCode, type CampaignBattle } from '../../lib/campaignBattle';
import { isVrijPotjeCode } from '../../lib/battleCode';

/** DE CAMPAGNE-BATTLE ACHTER EEN LOPEND POTJE, één keer opgehaald (05-10-2026).
 *
 *  Tijdens het spel willen drie plekken iets van de campagne weten: de objectives-teller en het
 *  VP-paneel (welke objectives gelden) en sinds vandaag de reminder-balk (welk weer, welke perks,
 *  welke items). Elk riep `battleByCode` zelf aan — dus bij het openen van een potje gingen er drie
 *  identieke verzoeken naar de server, en die server-functie doet bij elke aanroep ook nog een
 *  schrijfactie (`towc_battle_lijst_verrijk`). Vandaar één belofte per code, gedeeld.
 *
 *  WAAROM NIET IN `battleByCode` ZELF. Het briefing-scherm vóór de start POLT diezelfde functie elke
 *  drie seconden, juist om de verse start-stand te zien. Een cache daar zou dat stilzetten. Hier gaat
 *  het om gegevens die tijdens het spel niet veranderen (scenario, perks, items, weer), dus één keer
 *  ophalen is precies goed.
 *
 *  Een VRIJ POTJE (vier tekens, zie `isVrijPotjeCode`) heeft geen campagne-rij. Daar vroegen we tot nu
 *  toe tóch naar — en kregen dan steeds ONBEKENDE_CODE terug. Nu slaan we dat verzoek over. */
const cache = new Map<string, Promise<CampaignBattle | null>>();

function haal(code: string): Promise<CampaignBattle | null> {
  const sleutel = code.trim().toUpperCase();
  let p = cache.get(sleutel);
  if (!p) {
    p = battleByCode(sleutel).catch(() => {
      // Een mislukte poging niet vasthouden: bij de volgende keer dat het potje opent mag het
      // gewoon opnieuw (geen netwerk aan tafel is geen reden om het voor de hele sessie op te geven).
      cache.delete(sleutel);
      return null;
    });
    cache.set(sleutel, p);
  }
  return p;
}

/** De campagne-battle van dit potje, of null (vrij potje, nog bezig met laden, of niet te vinden). */
export function useCampaignBattle(code: string | null | undefined): CampaignBattle | null {
  const [battle, setBattle] = useState<CampaignBattle | null>(null);
  useEffect(() => {
    if (!code || isVrijPotjeCode(code)) { setBattle(null); return; }
    let leeft = true;
    haal(code).then((b) => { if (leeft) setBattle(b); });
    return () => { leeft = false; };
  }, [code]);
  return battle;
}
