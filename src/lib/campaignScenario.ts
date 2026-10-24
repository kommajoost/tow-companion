/**
 * WAT DE COMPANION UIT EEN CAMPAGNE-SHEET AFLEEST OVER HET SCENARIO (22-10-2026).
 *
 * Kleine, pure helpers die zowel de briefing vóór de battle (CampaignBattlePanel) als het
 * scenario-overzicht tijdens het spel nodig hebben. Alles leest de sheet; niets wordt nagerekend.
 */
import { parseScenarioBonus, type ScenarioBonus } from './scenarioBonus';

type Sheet = Record<string, unknown> | null | undefined;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * LIGT DE EERSTE BEURT VAST? In Breakthrough en Plunder begint de verdediger, in The Forge de
 * aanvaller (campagne, 20-10-2026). Dan is er geen roll-off voor de eerste beurt, en ook geen
 * roll-off-modifier die iets uitmaakt.
 *
 * We lezen het uit de TEKST van de sheet ("… and takes the first turn", "The attacker takes the first
 * turn.") en NIET uit het scenario-id: `ad-loot-cart` en `ad-special-feature` betekenden vóór 20-10
 * iets anders (Loot Cart, Special Feature), en een oude sheet met dat id hoort de oude regel te houden.
 * Geen zin gevonden = niets ligt vast = de gewone roll-off.
 */
export function eersteBeurtVast(sheet: Sheet): 'aanvaller' | 'verdediger' | null {
  for (const veld of [sheet?.deployNote, sheet?.gameEnd, sheet?.blurb]) {
    const t = str(veld);
    if (!t) continue;
    for (const zin of t.split(/[.!?]\s+/)) {
      const m = /\b(attacker|defender)\b[^.]*?\btakes? the first turn\b/i.exec(zin);
      if (m) return m[1].toLowerCase() === 'attacker' ? 'aanvaller' : 'verdediger';
    }
  }
  return null;
}

/** De scenario-posten van deze sheet (Act 3+), of null. */
export const scenarioBonusVan = (sheet: Sheet): ScenarioBonus | null => parseScenarioBonus(sheet?.scenarioBonus);

/**
 * De attacker/defender-objectives van de campagne (Act 3+). KOPIE van de naam en de uitleg uit
 * SECONDARY_OBJECTIVES in de campagne-repo (site/src/data/battlefield.ts); de naam zonder het
 * "— defender's ground"-staartje. Wat ze opleveren staat niet hier maar in `scenarioBonus` van de sheet.
 * Wijzigt de campagne de tekst, wijzig hem hier mee.
 */
export const CAMPAGNE_OBJECTIVES: Record<string, { naam: string; uitleg: string }> = {
  'strategic-3-def': {
    naam: 'Strategic Locations',
    uitleg: "Three objective markers 4″ beyond the defender's deployment zone, at a quarter, half and three quarters of the table width. Never within 3″ of terrain or on a low wall. The defender holds them with a Core unit (Unit Strength 10+) within 6″; the attacker can only destroy them.",
  },
  // 23-10-2026: de kar heet Baggage Train (de TOW-regel Baggage Trains); het id 'loot-cart' blijft.
  'loot-cart': {
    naam: 'Baggage Train',
    uitleg: "One Baggage Train (60×100 mm) wholly inside the defender's deployment zone, at least 3″ from every table edge. The defender controls it with a unit of Unit Strength 10+ within 6″; the attacker wins big by destroying it.",
  },
  'special-feature-def': {
    naam: "Special Feature (defender's half)",
    uitleg: "An impassable landmark on the defender's half; hold it with a Core unit.",
  },
};
