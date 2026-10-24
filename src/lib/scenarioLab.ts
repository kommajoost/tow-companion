/**
 * HET SCENARIO LAB (23-10-2026) — data en opbouw. Alleen in de TEST-build (zie labModus.ts).
 *
 * Joost: "een aparte pagina in de companion test, waar ik met twee mock armies de verschillende
 * scenario's kan kiezen, en misschien ook de hexplek (…): de battle page, daarna de game zelf, en dan
 * het battle result overzicht." En: "twee vaste mock-legers zijn genoeg. Het gaat meer om alles eromheen."
 *
 * DE SHEETS komen uit de ECHTE generator van de campagne-site (`genereerSlagveld`), vooraf gebakken met
 * een vaste seed per combinatie door `site/scripts/maak-scenario-lab.ts` naar `public/scenario-lab/`:
 * `index.json` (setups, terreinen, Acts met cap) en per Act `act-<n>.json` met
 * `{ "<setup>|<terrein>": BattleSheet }`. Lazy geladen: alleen de Act die je kiest.
 *
 * DE LEGERS zijn twee vaste builder-lijsten (Empire of Man en Orc & Goblin Tribes, rond 1000 punten),
 * in dezelfde vorm als een opgeslagen lijst in `tow:lists`. Ze gaan door precies dezelfde omzetting als
 * een lijst van een speler (ArmyListPicker → builderListToArmy), dus unit-kaarten, statlines en kill-VP
 * zijn de echte. Ze komen NIET in `tow:lists`: het lab geeft ze rechtstreeks aan de picker.
 *
 * HET POTJE zelf is de scenario-test van 22-10 (lib/scenarioTest.ts): code SCENTEST, solo, niets naar
 * de server. Het lab vult alleen de payload (sheet, Act, cap, kanten, legers) en zet de battle klaar.
 */
import type { BuilderList, ListEntry } from './owbBuilder';
import type { ScenarioTestPayload } from './scenarioTest';
import { helftVan } from './versterking';

// Dit bestand is PUUR (geen fetch, geen import.meta), zodat de node-tests het kunnen laden. Het laden van
// de sheets en de catalogus, en het klaarzetten van een battle, staan in scenarioLabLaden.ts.

// ── De sheet-set ───────────────────────────────────────────────────────────────────────────────────

export interface LabSetup { id: string; naam: string; d6?: number; acts: number[]; uitleg?: string }
export interface LabTerrein { id: string; naam: string }
export interface LabAct { act: number; cap: number; bord: string; bestand: string; aantal: number }
export interface LabIndex { versie: number; gemaakt: string; bron: string; setups: LabSetup[]; terreinen: LabTerrein[]; acts: LabAct[] }
export type LabSheets = Record<string, Record<string, unknown>>;

/** Sleutel van één sheet in een act-bestand. */
export const labSheetSleutel = (setup: string, terrein: string): string => `${setup}|${terrein}`;

/** Lees het index-bestand defensief: alleen wat de vorm heeft blijft over. null bij rommel. */
export function leesLabIndex(raw: unknown): LabIndex | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!o || !Array.isArray(o.setups) || !Array.isArray(o.terreinen) || !Array.isArray(o.acts)) return null;
  const setups = (o.setups as unknown[]).flatMap((x): LabSetup[] => {
    const s = x as Partial<LabSetup> | null;
    return s && typeof s.id === 'string' && typeof s.naam === 'string' && Array.isArray(s.acts)
      ? [{ id: s.id, naam: s.naam, d6: typeof s.d6 === 'number' ? s.d6 : undefined, acts: s.acts.filter((n): n is number => typeof n === 'number'), uitleg: typeof s.uitleg === 'string' ? s.uitleg : undefined }]
      : [];
  });
  const terreinen = (o.terreinen as unknown[]).flatMap((x): LabTerrein[] => {
    const t = x as Partial<LabTerrein> | null;
    return t && typeof t.id === 'string' && typeof t.naam === 'string' ? [{ id: t.id, naam: t.naam }] : [];
  });
  const acts = (o.acts as unknown[]).flatMap((x): LabAct[] => {
    const a = x as Partial<LabAct> | null;
    return a && typeof a.act === 'number' && typeof a.cap === 'number' && typeof a.bestand === 'string'
      ? [{ act: a.act, cap: a.cap, bord: typeof a.bord === 'string' ? a.bord : '', bestand: a.bestand, aantal: typeof a.aantal === 'number' ? a.aantal : 0 }]
      : [];
  }).sort((a, b) => a.act - b.act);
  if (!setups.length || !terreinen.length || !acts.length) return null;
  return { versie: typeof o.versie === 'number' ? o.versie : 1, gemaakt: typeof o.gemaakt === 'string' ? o.gemaakt : '', bron: typeof o.bron === 'string' ? o.bron : '', setups, terreinen, acts };
}

/** Past deze setup bij deze Act? Battle March hoort bij Act 1-2, de zes setups bij Act 3-7. */
export const setupPastBijAct = (index: LabIndex, setup: string, act: number): boolean =>
  !!index.setups.find((s) => s.id === setup)?.acts.includes(act);

/**
 * Maak een keuze geldig, zonder verrassingen: de laatst gekozen as wint, de andere schuift mee.
 * Kies je een Act waar de setup niet bij hoort, dan wordt het de eerste setup die er wel bij hoort
 * (of de vorige setup van die soort); kies je een setup die niet bij de Act hoort, dan schuift de Act
 * naar de dichtstbijzijnde Act die wel past.
 */
export function maakKeuzeGeldig(
  index: LabIndex,
  k: { setup: string; act: number; terrein: string },
  gewijzigd: 'setup' | 'act' | 'terrein',
  vorigeAd?: string | null,
): { setup: string; act: number; terrein: string } {
  const terrein = index.terreinen.some((t) => t.id === k.terrein) ? k.terrein : index.terreinen[0].id;
  const setupDef = index.setups.find((s) => s.id === k.setup) ?? index.setups[0];
  const act = index.acts.some((a) => a.act === k.act) ? k.act : index.acts[0].act;
  if (setupDef.acts.includes(act)) return { setup: setupDef.id, act, terrein };
  if (gewijzigd === 'act') {
    const terug = vorigeAd && index.setups.find((s) => s.id === vorigeAd && s.acts.includes(act));
    const eerste = terug || index.setups.find((s) => s.acts.includes(act)) || setupDef;
    return { setup: eerste.id, act, terrein };
  }
  const dichtst = [...setupDef.acts].sort((a, b) => Math.abs(a - act) - Math.abs(b - act))[0] ?? act;
  return { setup: setupDef.id, act: dichtst, terrein };
}

// ── De twee mock-legers ────────────────────────────────────────────────────────────────────────────

/** Een opgeslagen lijst zoals ArmyListPicker hem verwacht (de vorm van `tow:lists`). */
export interface LabLijst extends BuilderList { id: string; name: string; army: string; createdAt: number; updatedAt: number }
export interface MockLeger { id: string; naam: string; factie: string; kleur: string; lijst: LabLijst }

const e = (uid: string, cat: ListEntry['cat'], unitId: string, count: number, opts: string[] = []): ListEntry => ({ uid, cat, unitId, count, opts });

/** Empire of Man, rond 1000 punten: een General te paard, een BSB, halberdiers met full command,
 *  handgunners, militia, Empire Knights, Greatswords, Pistoliers en een Great Cannon. */
const EMPIRE: LabLijst = {
  id: 'lab-mock-empire',
  name: 'Ostermark Muster (mock)',
  army: 'empire-of-man',
  composition: 'empire-of-man',
  rule: 'open-war',
  points: 1000,
  createdAt: 0,
  updatedAt: 0,
  entries: [
    e('lab-emp-general', 'characters', 'general-of-the-empire', 1, ['command/0', 'armor/2', 'options/0', 'mounts/2']),
    e('lab-emp-bsb', 'characters', 'captain-of-the-empire', 1, ['command/1', 'armor/1']),
    e('lab-emp-halberds', 'core', 'state-troops', 20, ['command/0', 'command/1', 'command/2', 'equipment/1']),
    e('lab-emp-handguns', 'core', 'state-missile-troops', 10, ['equipment/1']),
    e('lab-emp-militia', 'core', 'free-company-militia', 10, []),
    e('lab-emp-knights', 'core', 'empire-knights', 5, ['command/0', 'command/1', 'command/2']),
    e('lab-emp-greatswords', 'special', 'empire-greatswords', 15, ['command/0', 'command/1', 'command/2']),
    e('lab-emp-pistoliers', 'special', 'pistoliers', 5, ['command/1']),
    e('lab-emp-cannon', 'special', 'great-cannon', 1, []),
  ],
};

/** Orc & Goblin Tribes, rond 1000 punten: een Warboss op een War Boar, een Night Goblin Bigboss, twee
 *  Orc Mobs, Night Goblins met shortbows, Black Orcs, Boar Boyz, Trolls, een Boar Chariot en een Rock Lobber. */
const ORCS: LabLijst = {
  id: 'lab-mock-orcs',
  name: 'Tuskgore Warband (mock)',
  army: 'orc-and-goblin-tribes',
  composition: 'orc-and-goblin-tribes',
  rule: 'open-war',
  points: 1000,
  createdAt: 0,
  updatedAt: 0,
  entries: [
    e('lab-orc-warboss', 'characters', 'orc-warboss', 1, ['command/0', 'armor/1', 'options/0', 'mounts/1']),
    e('lab-orc-bigboss', 'characters', 'night-goblin-bigboss', 1, []),
    e('lab-orc-mob', 'core', 'orc-mob', 20, ['command/0', 'command/1', 'command/2', 'options/0']),
    e('lab-orc-archers', 'core', 'orc-mob', 10, ['equipment/1']),
    e('lab-orc-nightgobbos', 'core', 'night-goblin-mob', 20, ['command/1', 'command/2', 'equipment/2']),
    e('lab-orc-blackorcs', 'special', 'black-orc-mob', 12, ['command/0', 'command/1']),
    e('lab-orc-boarboyz', 'special', 'orc-boar-boy-mob', 5, ['command/0', 'command/1', 'equipment/1']),
    e('lab-orc-trolls', 'special', 'common-troll-mob-special', 3, []),
    e('lab-orc-chariot', 'special', 'orc-boar-chariots', 1, []),
    e('lab-orc-lobber', 'rare', 'goblin-rock-lobber', 1, []),
  ],
};

export const MOCK_LEGERS: MockLeger[] = [
  { id: 'empire', naam: 'Ostermark Muster', factie: 'Empire of Man', kleur: '#8a6c30', lijst: EMPIRE },
  { id: 'orcs', naam: 'Tuskgore Warband', factie: 'Orc & Goblin Tribes', kleur: '#4a6b3f', lijst: ORCS },
];
export const mockLeger = (id: string | null | undefined): MockLeger | null => MOCK_LEGERS.find((m) => m.id === id) ?? null;

// ── De mock-versterkingen (23-10-2026) ─────────────────────────────────────────────────────────────
// REINFORCEMENT DETACHMENT (lib/versterking.ts): per mock-leger een vaste versterking van rond de 450-
// 490 punten, uit hetzelfde army book en dezelfde composition. Net als de mock-legers zelf "points not
// to scale": ze zijn gebouwd onder de regels van een 1000-punten-battle (de grootte van de mock-legers),
// dus ze passen binnen de helft van de cap vanaf Act 3. In Act 1-2 zijn ze te zwaar, en dan zie je de
// melding die een speler ook zou krijgen.

/** Empire of Man: halberdiers met full command, handgunners, militia, Empire Knights en een Great Cannon. */
const EMPIRE_RF: LabLijst = {
  id: 'lab-mock-empire-rf',
  name: 'Ostermark Reinforcements (mock)',
  army: 'empire-of-man',
  composition: 'empire-of-man',
  rule: 'open-war',
  points: 500,
  versterking: { basis: 1000, voor: 'lab-mock-empire' },
  createdAt: 0,
  updatedAt: 0,
  entries: [
    e('lab-emprf-halberds', 'core', 'state-troops', 20, ['command/0', 'command/1', 'command/2']),
    e('lab-emprf-handguns', 'core', 'state-missile-troops', 10, ['equipment/0']),
    e('lab-emprf-militia', 'core', 'free-company-militia', 10, []),
    e('lab-emprf-knights', 'core', 'empire-knights', 5, ['command/0', 'command/1', 'command/2']),
    e('lab-emprf-cannon', 'special', 'great-cannon', 1, []),
  ],
};

/** Orc & Goblin Tribes: een Orc Mob met full command, Orc-bogen, Night Goblins, Boar Boyz en een Rock Lobber. */
const ORCS_RF: LabLijst = {
  id: 'lab-mock-orcs-rf',
  name: 'Tuskgore Reinforcements (mock)',
  army: 'orc-and-goblin-tribes',
  composition: 'orc-and-goblin-tribes',
  rule: 'open-war',
  points: 500,
  versterking: { basis: 1000, voor: 'lab-mock-orcs' },
  createdAt: 0,
  updatedAt: 0,
  entries: [
    e('lab-orcrf-mob', 'core', 'orc-mob', 20, ['command/0', 'command/1', 'command/2']),
    e('lab-orcrf-archers', 'core', 'orc-mob', 15, ['equipment/1']),
    e('lab-orcrf-nightgobbos', 'core', 'night-goblin-mob', 20, ['command/1', 'command/2']),
    e('lab-orcrf-boarboyz', 'special', 'orc-boar-boy-mob', 5, ['command/0', 'command/1']),
    e('lab-orcrf-lobber', 'rare', 'goblin-rock-lobber', 1, []),
  ],
};

const MOCK_VERSTERKING: Record<string, LabLijst> = { empire: EMPIRE_RF, orcs: ORCS_RF };
/** De mock-versterking bij een mock-leger (id uit MOCK_LEGERS), of null. */
export const mockVersterking = (id: string | null | undefined): LabLijst | null => (id ? MOCK_VERSTERKING[id] ?? null : null);

// ── Een lab-battle klaarzetten ─────────────────────────────────────────────────────────────────────

export interface LabKeuze {
  setup: string; act: number; terrein: string; aanvaller: string; verdediger: string;
  /** Roll-off-modifiers voor de eerste beurt meegeven (standaard aan), zoals de server ze uit de gebouwen
   *  van beide kanten afleidt. Dan zie je de stap "Roll for first turn" in de briefing, en dat hij wegvalt
   *  in de setups waar de eerste beurt vastligt (Breakthrough, Plunder, The Forge). */
  rollOff?: boolean;
  /** REINFORCEMENT DETACHMENT (23-10-2026): welke kant met twee tegen drie staat en dus een versterking
   *  van de helft van de cap mag toevoegen. Weglaten of 'uit' = geen. */
  versterking?: 'uit' | 'aanvaller' | 'verdediger' | 'beide';
}

/** De voorbeeld-modifiers: een Scouting Outpost voor de aanvaller, een Watchtower en een Outpost voor
 *  de verdediger — dezelfde als de testbattle (lib/testBattle.ts). */
export const LAB_ROLL_OFF: NonNullable<ScenarioTestPayload['rollOff']> = {
  aanvaller: [{ bron: 'ranger-outpost', label: 'Scouting Outpost', waarde: 1 }],
  verdediger: [
    { bron: 'watchtower', label: 'Watchtower', waarde: 3 },
    { bron: 'ranger-outpost', label: 'Scouting Outpost', waarde: 1 },
  ],
};

/** De payload van de scenario-test voor deze keuze. `aanvLijst`/`verdLijst` vult `startLabBattle` (scenarioLabLaden.ts). */
export function labPayload(sheet: Record<string, unknown>, act: LabAct, k: LabKeuze): ScenarioTestPayload {
  const a = mockLeger(k.aanvaller) ?? MOCK_LEGERS[0];
  const v = mockLeger(k.verdediger) ?? MOCK_LEGERS[1];
  return {
    // De Act van de keuze is leidend (de sheet draagt hem ook, maar zo kan er niets uit de pas lopen).
    sheet: { ...sheet, fase: act.act },
    fase: act.act,
    cap: act.cap,
    aanvaller: { naam: a.naam, factie: a.lijst.army, kleur: a.kleur },
    verdediger: { naam: v.naam, factie: v.lijst.army, kleur: v.kleur },
    rollOff: k.rollOff === false ? null : LAB_ROLL_OFF,
    geladen: new Date().toISOString(),
    legers: { aanvaller: a.id, verdediger: v.id },
    versterking: labVersterking(k, act.cap),
  };
}

/** De versterking van de lab-keuze, in de vorm van het server-contract (per kant de punten per speler):
 *  de helft van de cap van de gekozen Act. null als hij uit staat. */
export function labVersterking(k: Pick<LabKeuze, 'versterking'>, cap: number): ScenarioTestPayload['versterking'] {
  const w = k.versterking ?? 'uit';
  if (w === 'uit') return null;
  const n = helftVan(cap);
  return { aanvaller: w === 'aanvaller' || w === 'beide' ? n : null, verdediger: w === 'verdediger' || w === 'beide' ? n : null };
}

