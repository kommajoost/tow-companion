/**
 * DE SLEUTEL-OMLEIDING VAN HET SCENARIO LAB (23-10-2026) — puur, zonder vlag, zodat hij testbaar is.
 * De vlag en de aansluiting op de store staan in labModus.ts; waarom het zo moet staat daar.
 */

/** Voorvoegsel van de lab-kopie van een sleutel. Lab-eigen sleutels (keuze, scherm) gebruiken het ook. */
export const LAB_PREFIX = 'tow:lab:';

/** De battle-sleutels die in het lab een eigen kopie krijgen. Alles wat een potje, een briefing, de
 *  wizard of het scherm onthoudt; gebruikersdata (`tow:lists`, sync, account) blijft gedeeld en wordt
 *  door het lab alleen gelezen. `tow:solo-host2`/`tow:solo-guest2` (Joost 28-10-2026, 2v2-legers) horen
 *  erbij: anders zou `leaveGame` in het lab de bondgenoot van een echt lopend 2v2-potje wissen. */
const OMGELEID = new Set([
  'tow:game', 'tow:solo-mine', 'tow:solo-opp', 'tow:solo-tracker', 'tow:solo-host2', 'tow:solo-guest2',
  'tow:campaign-battle', 'tow:battle-wizard-open', 'tow:battle', 'tow:battle-draft',
  'tow:scenario-test', 'tow:test-battle', 'tow:screen', 'tow:tab', 'tow:c:phase', 'tow:c:sub',
]);
const OMGELEID_PREFIX = ['tow:wrath:'];

/** De lab-kopie van een battle-sleutel, anders de sleutel zelf. */
export function labSleutel(key: string): string {
  if (key.startsWith(LAB_PREFIX)) return key;
  if (OMGELEID.has(key) || OMGELEID_PREFIX.some((p) => key.startsWith(p))) return LAB_PREFIX + key.slice('tow:'.length);
  return key;
}
