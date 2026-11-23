/**
 * DE DRIE ARTEFACT-TABELLEN VAN ACT 4 (blok E, 24-11-2026).
 *
 * LETTERLIJK overgenomen uit de Act 4-briefing (mock `briefing-act4.html`, `TABELLEN` en `SOORT`, en de
 * regelkaart "The artefacts are dangerous"). Wijzigt de briefing, wijzig dit mee. De Companion toont de
 * tabel aan het begin van de beurt van het team dat het artefact heeft (zie TafelTempo).
 */

export type ArtefactSoort = 'wrath' | 'daemon' | 'god';

export const SOORT: Record<ArtefactSoort, string> = { wrath: 'Wrath', daemon: 'Daemon', god: 'God' };

export interface ArtefactTabel {
  /** Interne sleutel, gelijk aan het artefact-id van de campagne. */
  id: string;
  naam: string;
  thema: string;
  /** Zes rijen, D6 = index + 1: [soort, naam, effect]. */
  rijen: [ArtefactSoort, string, string][];
}

export const ARTEFACT_TABELLEN: ArtefactTabel[] = [
  { id: 'ashen-heart', naam: 'Ashen Heart', thema: 'the fight and armour', rijen: [
    ['wrath', 'Searing Wrath', 'D6 Strength 3 hits, no armour save.'],
    ['daemon', 'Red Mist', '-2 WS and -1 BS.'],
    ['daemon', 'Blunted Steel', '-1 S.'],
    ['daemon', 'Forge Heat', 'Armour save 1 worse.'],
    ['god', "Vaul's Anvil", 'Armour save 1 better (max 2+).'],
    ['god', "Vaul's Edge", 'Armour Piercing 1 better (an AP of - becomes -1), and Armour Bane (1).'],
  ] },
  { id: 'whispering-eye', naam: 'Whispering Ring', thema: 'the mind', rijen: [
    ['wrath', 'The Ring Screams', "Roll 2D6. For each point above the unit's Ld it suffers 1 wound, no armour save."],
    ['daemon', 'Lost in Whispers', '-D3 I (min 1).'],
    ['daemon', 'A Thousand Voices', 'Stupidity.'],
    ['daemon', 'Voices of Terror', 'Ld test or flee, as if charged by a unit that causes Terror.'],
    ['god', 'Foresight', 'Strike First.'],
    ['god', "Hoeth's Guidance", 'Re-roll failed rolls To Hit, in shooting and in combat.'],
  ] },
  { id: 'bound-crown', naam: 'Bound Crown', thema: 'orders and leadership', rijen: [
    ['wrath', 'Decimation', 'Ld test. If failed, the unit punishes itself: D6 hits at its own Strength, no armour save.'],
    ['daemon', 'Forward, by His Will', 'The unit moves D6" straight forward, stopping 1" from units and impassable terrain.'],
    ['daemon', 'Slow to Obey', '-D3 M (min 1), and a Ld test to declare a charge.'],
    ['daemon', 'The Broken Chain', 'No Inspiring Presence, and -1 Ld.'],
    ['god', 'Swift Obedience', '+D3 M (max 10).'],
    ['god', "Asuryan's Mandate", 'Unbreakable.'],
  ] },
];

/** De regels uit de briefing-kaart, letterlijk (alleen de **vet**-opmaak eraf). */
export const ARTEFACT_REGELS: string[] = [
  'At the start of each turn of the player who controls the artefact, roll D6 on its table. If nobody controls it, the player whose turn it is rolls.',
  'Every unit within the aura, of both sides, rolls D6: on 4+ it is affected.',
  "The effect lasts until the start of that player's next turn. If control changes, the old effect ends and the new controller rolls.",
  'A unit in combat cannot move: Forward, by His Will, Swift Obedience and Voices of Terror pass it by.',
  'Each table runs the same way: 1 the wrath strikes, 2 to 4 the daemon wins, 5 and 6 the god wins.',
];

/** Aura in inches per Act (Act 4: 6"). De sheet geeft hem per artefact mee (`secLayout.artefacten[].aura`);
 *  dit is de terugval. */
export const AURA_ACT4 = 6;

/** De tabel bij een artefact van de campagne: op id, en anders op naam ("The Whispering Ring"). */
export function tabelVoorArtefact(a: { id?: string | null; naam?: string | null } | null | undefined): ArtefactTabel | null {
  if (!a) return null;
  const opId = ARTEFACT_TABELLEN.find((t) => t.id === a.id);
  if (opId) return opId;
  const naam = (a.naam ?? '').toLowerCase();
  return ARTEFACT_TABELLEN.find((t) => naam.includes(t.naam.toLowerCase())) ?? null;
}
