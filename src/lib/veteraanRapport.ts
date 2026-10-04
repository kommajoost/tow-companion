import { unitToon } from './unitNaam';
import { unitTotalStrength } from './armyRules';
import type { BattleResultaat } from './campaignBattle';
import type { Army, ArmyUnit, GameTracker } from '../types';

// De veteranen-regels van het battle-rapport (04-10-2026 hierheen verhuisd uit
// CampaignResultReporter.tsx, zodat ze los te testen zijn: scripts/tests/veteraan-rapport.test.cjs).
// Inhoudelijk ongewijzigd, op de regiment-tak na (zie "VERNIETIGD IS VERNIETIGD" hieronder).

/**
 * Hoeveel deze unit verloor, met VAN TAFEL als volledig verlies (Joost 11-09-2026: "van tafel is ook
 * gewoon dood, zelfde als alle wounds of models weg").
 *
 * Zonder deze gelijkschakeling viel een vernietigde unit die met de Removed-knop van tafel ging maar
 * waarvan niemand de wonden bijhield, met `lost: 0` uit de verliezenlijst. Dat gebeurde echt: in
 * battle 9B3F76 stonden Vaelira the Veil-seeker en Vareth the Veil-breaker als Destroyed in het
 * End-Battle-overzicht en telden ze voor 100% mee in de VP, maar ontbraken ze in het rapport dat naar
 * de campagne ging. De VP-motor (victoryPoints.ts) deed het altijd al goed: `weg || remaining <= 0`.
 */
export function verliesVan(unit: ArmyUnit, t: { lost: number; weg?: boolean } | undefined): number {
  if (!t) return 0;
  return t.weg ? unitTotalStrength(unit) : Math.max(0, t.lost);
}

export type Veteraan = NonNullable<BattleResultaat['veteraan']>[number];

// Campagne-relevante per-unit feiten voor ÉÉN leger. De aanroeper doet dit voor BEIDE kanten:
// wie indient, dient voor de hele tafel in (Joost, 29-08). Deed alleen de melder z'n eigen leger,
// dan kreeg de tegenstander geen XP en zelfs geen gespeelde battle — Ferry's zes units stonden na
// battle #2022 nog op nul terwijl er vijf XP openstond. De serverkant kon dit altijd al aan: de
// trigger towc_battle_veteraan_verwerk loopt de hele array langs en matcht unit_id binnen
// (aanvaller, verdediger, proxy), dus hij verwerkt beide legers zodra ze erin staan.
// absolute seat-key ('host'/'guest') waarop de eigen units in de tracker staan — solo mapt naar
// 'host' (zoals GameView's absSeat('me')). De drempels spiegelen de VP-engine (unitVp):
//   remaining = unitTotalStrength − lost.
//   overleefd_50 : remaining ≥ 50% start-US  én  niet fleeing  én  niet dood (weg/0 over/neergehaald).
//   scar_trigger : remaining < 25% start-US   óf  dood          óf  fleeing.
// (Grenzen bewust asymmetrisch: ≥50% vs <25%, exact conform de opdracht.)
// De gemelde `unitId` is `u.campaignId` — de gedeelde campagne-sleutel (campaignUnitId in
// owbBuilder.ts, gezet door builderListToArmy). Een geplakt OWB-leger heeft geen campaignId; dan
// valt 'ie terug op de eigen unit-id, zodat de melding altijd een sleutel heeft.
/** Troop types die XP verdienen. Veteran Abilities (p.24) is expliciet: "Any unit whose troop type
 *  is infantry or cavalry (but not swarms or war beasts)". Monstrous Infantry en Monstrous Cavalry
 *  vallen daar gewoon onder — het zijn sub-categorieën van infanterie en cavalerie. Strijdwagens,
 *  monsters, behemoths en war machines niet, en die kregen bij ons tot 30-08 wél XP. */
const XP_WAARDIG = /^(regular|heavy|monstrous) infantry$|^(light|heavy|monstrous) cavalry$/i;
const isCharacter = (u: ArmyUnit) => /^characters$/i.test(u.category ?? '');
/** De General is in de catalogus een gewone optie op een character (161 keer over alle legers). */
const isGeneral = (u: ArmyUnit) => (u.options ?? []).some((o) => /^general\b/i.test(o.replace(/{[^}]*}/g, '').trim()));

// TWEE REGELSETS, en dat was tot 30-08 het grootste gat: characters volgden de unit-regel.
//
//   UNITS — Veteran Abilities (p.24): +1 als het overleefde op ≥50% start-Unit-Strength, +1 per
//   vernietigde vijandelijke unit of trofee. Alleen infanterie en cavalerie.
//
//   CHARACTERS — Seasoned Commanders (p.25): +1 voor OVERLEVEN — "any character that was not
//   removed from play as a casualty and is not fleeing" — dus zonder 50%-drempel, want een
//   character is één model. Een zwaargewonde held verdient gewoon. Plus +1 per kill, en de
//   General van het winnende leger krijgt er nog 1 bij.
//
// SCARS lopen ook uiteen. Battlefield Losses (p.24) geldt voor een unit onder 25%, vernietigd of
// vluchtend. Death & Dishonour (p.25) geldt alleen als een character IS GESNEUVELD OF VLUCHT — geen
// 25%-clausule, die deden wij wel, waardoor een gewonde held onterecht op de dodentabel rolde.
/** Eén veteraan-regel: wat er naar de campagne gaat, PLUS waaruit die XP is opgebouwd.
 *
 *  Beide komen uit dezelfde functie, met opzet. "+2 XP" zegt niet waarvóór, en bij een kill niet
 *  op wie (Joost, 30-08). Zou de uitleg apart berekend worden, dan kan hij van de som afwijken —
 *  en een verklaring die niet klopt is erger dan geen verklaring. */
export interface VetRegel { vet: Veteraan; redenen: string[] }

export function collectVeteraan(
  tracker: GameTracker,
  ownArmy: Army | null,
  ownSeat: 'host' | 'guest',
  gewonnen: boolean,
  vijand: Army | null,
): VetRegel[] {
  // Slachtoffers op naam. `killDetails[].unit` draagt de id van de vijandelijke unit; die staat in
  // het leger van de tegenpartij.
  const vijandNaam = new Map<string, string>();
  // ...en op CAMPAGNE-sleutel: de campagne kent een unit als `campaignId ?? id` (zie campaignUnitId
  // in owbBuilder.ts), dus een kill-regel moet naar diezelfde sleutel wijzen — anders kan de
  // campagne het slachtoffer niet terugvinden in `towc_spel_unit`.
  const vijandSleutel = new Map<string, string>();
  for (const u of vijand?.units ?? []) {
    vijandNaam.set(u.id, unitToon(u).primair || u.name);
    vijandSleutel.set(u.id, u.campaignId ?? u.id);
  }

  /**
   * WIE DE TEGENSTANDER HEEFT NEERGEHAALD (12-09-2026).
   *
   * `dood` kwam tot nu toe uitsluitend uit MIJN eigen tracker: `weg || remaining <= 0`. Dat gaat mis
   * zodra de tegenstander wel een kill op mijn unit aantikt maar ik die unit zelf nooit van tafel heb
   * gehaald of zijn wonden niet heb bijgehouden -- dan staat hij bij mij doodleuk als overlevend.
   *
   * Dat gebeurde echt: in battle 2027 haalden Arnolds Kroxigors in beurt 4 Arjens General Bragtar
   * neer (het staat in hun killDetails), maar Bragtars eigen regel meldde `dood: false`,
   * `overleefd_50: true`. Dat leverde hem een XP op die niet bestond (de +1 voor overleven). De +1
   * voor "General, army won" hield hij terecht: die hangt aan de winst, niet aan overleven.
   * Over de hele campagne stonden negen units in vijf battles zo verkeerd.
   *
   * De kill-log van de tegenpartij is hier de betrouwbaarste bron: die wijst een slachtoffer AAN, en
   * dat is een positieve bewering. Een lege eigen tracker is dat niet -- dat is net zo goed "vergeten
   * in te vullen". Dus: staat mijn unit in iemands killDetails, dan is hij dood.
   */
  const vijandSeat = ownSeat === 'host' ? 'guest' : 'host';
  const neergehaald = new Set<string>();
  for (const vu of vijand?.units ?? []) {
    for (const d of tracker.units[`${vijandSeat}:${vu.id}`]?.killDetails ?? []) {
      if (d.unit) neergehaald.add(d.unit);
    }
  }

  const out: VetRegel[] = [];
  for (const u of ownArmy?.units ?? []) {
    const t = tracker.units[`${ownSeat}:${u.id}`];
    const ts = unitTotalStrength(u);
    const fleeing = t?.fleeing ?? false;
    const weg = t?.weg ?? false;
    // Van tafel = alles kwijt (zie verliesVan). Zo klopt ook `verloren` in het veteranen-rapport:
    // een vernietigd karakter meldde anders "dood, 0 verloren" en dat las de campagne als "lost 0 of 3".
    const lost = verliesVan(u, t);
    const remaining = ts - lost;
    // Zie `neergehaald` hierboven: de kill-log van de tegenstander telt net zo hard als mijn eigen
    // tracker. Wie daar als slachtoffer in staat, is dood -- ook als ik hem zelf nooit weggehaald heb.
    const dood = weg || remaining <= 0 || neergehaald.has(u.id);
    const unitId = u.campaignId ?? u.id;
    const kills = Math.max(0, t?.kills ?? 0);
    const redenen: string[] = [];

    // De kills op naam, zover ze zijn vastgelegd. Wie wel een kill aantikte maar geen slachtoffer
    // koos, krijgt de kale telling — de XP klopt dan nog steeds, alleen de naam ontbreekt.
    const genoemd = (t?.killDetails ?? [])
      .map((d) => (d.unit ? vijandNaam.get(d.unit) : null))
      .filter((n): n is string => !!n);
    const killReden = (n: number): string[] => {
      if (n <= 0) return [];
      if (genoemd.length >= n) return genoemd.slice(0, n).map((naam) => `+1 destroyed ${naam}`);
      const rest = n - genoemd.length;
      return [
        ...genoemd.map((naam) => `+1 destroyed ${naam}`),
        `+${rest} kill${rest === 1 ? '' : 's'}/troph${rest === 1 ? 'y' : 'ies'}`,
      ];
    };

    // Dezelfde kills, maar als DATA voor de campagne: beurt + de campagne-sleutel van het
    // slachtoffer + zijn naam. Regels zonder aangewezen slachtoffer laten we weg — een kill-regel
    // zonder doel is geen feit; `kills` houdt het aantal, dus de XP blijft kloppen.
    const killDetails = (t?.killDetails ?? [])
      .filter((d): d is { unit: string; turn?: number } => typeof d.unit === 'string' && !!d.unit)
      .map((d) => ({
        turn: typeof d.turn === 'number' ? d.turn : null,
        unitId: vijandSleutel.get(d.unit) ?? d.unit,
        naam: vijandNaam.get(d.unit) ?? null,
      }));

    if (isCharacter(u)) {
      const leeft = !dood && !fleeing;
      // De General-bonus hangt aan de WINST, niet aan overleven. Letterlijk (Seasoned Commanders,
      // tow.whfb.app/campaign-battles/seasoned-commanders): "An army's General earns 1XP if their army
      // won the game." Er staat geen overlevingsvoorwaarde bij -- die geldt alleen voor de aparte
      // "1XP for surviving the game". Hier stond `leeft &&`, waardoor een General die viel terwijl
      // zijn leger won zijn punt misliep (Joost, 13-09-2026: "hoezo hij heeft wel gewonnen toch").
      const generaal = gewonnen && isGeneral(u);
      if (leeft) redenen.push('+1 survived');
      redenen.push(...killReden(kills));
      if (generaal) redenen.push('+1 General, army won');
      out.push({
        vet: {
          unitId,
          naam: u.name,
          overleefd_50: leeft,
          kills,
          bonusXp: generaal ? 1 : 0,
          scar_trigger: dood || fleeing,
          verloren: lost,
          sterkte: ts,
          dood,
          gevlucht: fleeing,
          troopType: u.troopType ?? null,
          character: true,
          general: isGeneral(u),
          killDetails,
          redenen,
        },
        redenen,
      });
      continue;
    }

    // Verdient deze unit überhaupt XP? Zo niet, dan melden we hem WEL — hij speelde de battle mee en
    // kan nog steeds een scar oplopen — maar met nul te verdienen.
    const verdient = XP_WAARDIG.test(u.troopType ?? '');
    // VERNIETIGD IS VERNIETIGD (04-10-2026, C9). De regiment-tak keek voor overleven en de scar alleen
    // naar MIJN tracker (remaining/weg/fleeing), terwijl `dood` sinds 12-09 ook de kill-log van de
    // tegenstander meeneemt. Stond mijn regiment daar als slachtoffer maar had ik zelf geen verliezen
    // ingevuld, dan meldde het "+1 survived above half strength" en GEEN scar. Nu telt `dood` hier
    // net zo hard als bij de characters: geen overlevings-XP, wel een scar-worp.
    const overleefd = verdient && !dood && remaining >= ts * 0.5 && !fleeing;
    if (!verdient) redenen.push(`no XP — ${u.troopType || 'this troop type'} is not infantry or cavalry`);
    else if (overleefd) redenen.push('+1 survived above half strength');
    else if (dood) redenen.push('destroyed, no survival XP');
    if (verdient) redenen.push(...killReden(kills));
    out.push({
      vet: {
        unitId,
        naam: u.name,
        overleefd_50: overleefd,
        kills: verdient ? kills : 0,
        bonusXp: 0,
        scar_trigger: dood || remaining < ts * 0.25 || fleeing,
        verloren: lost,
        sterkte: ts,
        dood,
        gevlucht: fleeing,
        troopType: u.troopType ?? null,
        character: false,
        // Een niet-character kan de General-optie niet dragen, maar we leiden het af i.p.v. het te
        // beweren — dan blijft het veld één betekenis houden over alle regels heen.
        general: isGeneral(u),
        killDetails,
        redenen,
      },
      redenen,
    });
  }
  return out;
}
