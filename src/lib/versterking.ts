/**
 * REINFORCEMENT DETACHMENT (23-10-2026) — de versterking van de kleine kant aan een teamtafel.
 *
 * Joost: "Bij een oneven aantal bij de teamtafels (Act 4, Act 7, de Ruin Front) wordt het 2 tegen 3.
 * Elke speler aan de kant met twee mag voor die battle een reinforcement-detachment van de helft van de
 * cap toevoegen, en dat moet uit zijn eigen leger (eigen army book/factie). De regels gelden op basis
 * van wat ze op dat moment spelen (dus op basis van 1250 bij bijvoorbeeld Act 4)."
 *
 * HOE HET ZIT
 *   1. De hoofdlijst blijft de gewone campagnelijst, gevalideerd op de Act-cap.
 *   2. De versterking is een APARTE lijst in `tow:lists`, gemerkt met `versterking: { basis }`: zelfde
 *      army book, zelfde army composition en game mode als de hoofdlijst. `points` is het maximum van
 *      de detachment (de helft van de cap, `helftVan`), `basis` de battle-grootte waarop de
 *      samenstellingsregels gelden. `validate` (owbBuilder.ts) leest dat veld zelf: percentages, Core-
 *      minimum, "0-X per 1000 points", Grand Melee en Combined Arms rekenen met `basis` (1250), alleen
 *      de som wordt tegen `points` (625) gehouden. Niets wordt opgerekt naar 1875.
 *   3. In de battle komt de versterking BOVENOP het leger (`voegVersterkingToe`): de units krijgen een
 *      eigen id (`rf-…`), de vlag `versterking: true`, en GEEN campaignId. Ze tellen dus mee voor VP en
 *      kills aan tafel, maar niet als campagne-unit: geen XP, geen scars, niet in het veteranen-rapport
 *      (veteraanRapport.ts slaat ze over).
 *
 * WANNEER HET MAG
 *   - Campagne-battle: alleen als de server het zegt, via `versterking` op de battle-payload
 *     (`parseVersterking`). De Companion kent zelf geen teamtafels.
 *   - Vrij potje: altijd aan te zetten (de spelers weten zelf of ze met twee tegen drie staan).
 *   - Scenario lab (test-build): een schakelaar.
 *
 * Dit bestand is PUUR (geen fetch, geen React, geen import.meta), zodat de node-tests het laden.
 */
import type { BuilderList, VersterkingMeta } from './owbBuilder';
import type { Army, ArmyUnit } from '../types';

/** Voorvoegsel van een versterkings-unit in het leger: botst nooit met een builder-uid. */
export const VERSTERKING_ID = 'rf-';

/** De punten van een reinforcement detachment bij een battle-grootte: de helft, naar beneden afgerond. */
export const helftVan = (cap: number): number => (Number.isFinite(cap) && cap > 0 ? Math.floor(cap / 2) : 0);

/** Is dit een versterkingslijst (en geen gewone lijst)? */
export function isVersterkingLijst(l: { versterking?: unknown } | null | undefined): l is BuilderList & { versterking: VersterkingMeta } {
  const v = l?.versterking as Partial<VersterkingMeta> | null | undefined;
  return !!v && typeof v === 'object' && typeof v.basis === 'number' && Number.isFinite(v.basis) && v.basis > 0;
}

/** De basis (battle-grootte) van een versterkingslijst, of null bij een gewone lijst. */
export const versterkingBasis = (l: { versterking?: unknown } | null | undefined): number | null =>
  (isVersterkingLijst(l) ? l.versterking.basis : null);

/**
 * Een nieuwe, lege versterkingslijst bij een hoofdlijst: zelfde army book, army composition en game
 * mode, en NOOIT een campagnelijst (geen campagnevelden). `basis` is de battle-grootte (de Act-cap bij
 * een campagnelijst, anders de puntenlimiet van de hoofdlijst).
 */
export function maakVersterkingLijst(
  hoofd: { id: string; name: string; army: string; composition: string; rule: string },
  basis: number,
  id: string,
  nu: number,
): BuilderList & { id: string; name: string; army: string; createdAt: number; updatedAt: number; versterking: VersterkingMeta } {
  const b = Math.max(0, Math.floor(basis));
  return {
    id,
    name: `${(hoofd.name || 'Army').trim()} · Reinforcements`,
    army: hoofd.army,
    composition: hoofd.composition,
    rule: hoofd.rule,
    points: helftVan(b),
    entries: [],
    createdAt: nu,
    updatedAt: nu,
    versterking: { basis: b, voor: hoofd.id },
  };
}

/** Één regel uitleg voor bij een versterkingslijst ("Reinforcement detachment · up to 625 pts under the
 *  rules of a 1250-point battle"). */
export function versterkingUitleg(l: { points: number; versterking?: unknown }): string | null {
  const basis = versterkingBasis(l);
  if (basis == null) return null;
  return `Reinforcement detachment · up to ${l.points} pts, built under the rules of a ${basis}-point battle`;
}

// ── In de battle ───────────────────────────────────────────────────────────────────────────────────

/** Het leger zonder versterking (de versterkings-units eruit, de punten terug). */
export function zonderVersterking(army: Army): Army {
  if (!army.versterking && !army.units.some((u) => u.versterking)) return army;
  const units = army.units.filter((u) => !u.versterking);
  // Precies wat `voegVersterkingToe` erbij telde; zonder die notitie de punten van de units zelf.
  const weg = army.versterking?.punten ?? army.units.filter((u) => u.versterking).reduce((s, u) => s + (u.points ?? 0), 0);
  const { versterking: _weg, ...rest } = army;
  void _weg;
  return { ...rest, units, points: army.points != null ? army.points - weg : null };
}

/** De versterking bovenop het leger. Een eerdere versterking wordt eerst vervangen (nooit twee). */
export function voegVersterkingToe(army: Army, rf: Army, max: number | null = null): Army {
  const basis = zonderVersterking(army);
  const units: ArmyUnit[] = rf.units.map((u) => {
    // GEEN campaignId en geen veteraan: deze unit bestaat niet in de campagne en mag er niets van
    // meenemen of naartoe brengen.
    const { campaignId: _c, veteraan: _v, ...rest } = u;
    void _c; void _v;
    return { ...rest, id: `${VERSTERKING_ID}${u.id}`, versterking: true };
  });
  const rfPunten = rf.points ?? units.reduce((s, u) => s + (u.points ?? 0), 0);
  return {
    ...basis,
    units: [...basis.units, ...units],
    points: basis.points != null ? basis.points + rfPunten : basis.points,
    versterking: { naam: rf.name, punten: rfPunten, max: max != null && max > 0 ? max : null },
  };
}

/** Wat er aan versterking bij een leger staat, of null. */
export function versterkingVan(army: Army | null | undefined): { naam: string; punten: number; max: number | null; units: number } | null {
  if (!army) return null;
  const units = army.units.filter((u) => u.versterking);
  if (!units.length) return null;
  const punten = army.versterking?.punten ?? units.reduce((s, u) => s + (u.points ?? 0), 0);
  return { naam: army.versterking?.naam ?? 'Reinforcements', punten, max: army.versterking?.max ?? null, units: units.length };
}

/** Te veel punten voor deze battle? (Alleen te zeggen als de grens bekend is.) */
export const versterkingTeZwaar = (punten: number | null | undefined, max: number | null | undefined): boolean =>
  punten != null && max != null && max > 0 && punten > max;

// ── Het contract met de campagne ───────────────────────────────────────────────────────────────────

/** Per kant: hoeveel punten versterking die kant mag toevoegen (null = geen). */
export interface BattleVersterking { aanvaller: number | null; verdediger: number | null }

const pos = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null);

/**
 * Lees `versterking` van de battle-payload (`towc_battle_by_code`). CONTRACT (23-10-2026, nog niet op de
 * server): `versterking: number` = punten PER SPELER aan de kleine kant, met optioneel
 * `versterkingKant: 'aanvaller' | 'verdediger'` om te zeggen welke kant dat is. Zonder kant mogen beide
 * kanten (de server stuurt het veld alleen aan een tafel die 2 tegen 3 staat). Ook goed: per kant,
 * `versterking: { aanvaller: 625, verdediger: null }`.
 *
 * undefined als het veld ontbreekt (oude server, of geen teamtafel), anders per kant het aantal punten.
 */
export function parseVersterking(d: Record<string, unknown>): BattleVersterking | undefined {
  if (!('versterking' in d)) return undefined;
  const raw = d.versterking;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const b = { aanvaller: pos(o.aanvaller), verdediger: pos(o.verdediger) };
    return b.aanvaller || b.verdediger ? b : undefined;
  }
  const n = pos(raw);
  if (!n) return undefined;
  const kant = d.versterkingKant;
  if (kant === 'aanvaller') return { aanvaller: n, verdediger: null };
  if (kant === 'verdediger') return { aanvaller: null, verdediger: n };
  return { aanvaller: n, verdediger: n };
}

/** De versterking voor één kant van een battle, of null. */
export const versterkingVoorKant = (v: BattleVersterking | null | undefined, kant: 'aanvaller' | 'verdediger'): number | null =>
  v?.[kant] ?? null;
