/**
 * SCENARIO-VP UIT DE BATTLE SHEET (22-10-2026).
 *
 * Vanaf Act 3 heeft elke setup eigen Victory Points (de feature van Command & Control, de Baggage Train,
 * de markers van Strategic Locations, plunderingen en de pot van Plunder, de beurten met de Forge, de
 * puntwaarde in de zone bij Breakthrough). Die bedragen verschillen per Act en zijn een besluit van
 * Joost, dus ze staan NIET hier: de campagne schrijft ze GESTRUCTUREERD in de sheet (`scenarioBonus`)
 * en de Companion leest ze. Contract (versie 1, afgesproken met de campagne-kant):
 *
 *   scenarioBonus: { versie: 1, posten: [{ id, label, kant, soort, vp, max?, potAftrek?, potKoppeling?, uitleg? }] }
 *
 *   kant   'aanvaller' | 'verdediger' | 'beide'  — wie de post kan scoren
 *   soort  'eind'       aan/uit: `vp` als het aan het eind zo is
 *          'per-stuk'   teller (per marker, per kar …) × `vp`, hoogstens `max`
 *          'per-beurt'  teller (per beurt) × `vp`, hoogstens `max`
 *          'pot'        een pot die begint op `vp` en `potAftrek` verliest per keer dat de post
 *                       `potKoppeling` scoort; nooit onder 0. Geen eigen invoer: hij rekent zichzelf.
 *          'puntwaarde' de speler voert punten in; VP = punten × `vp` (in de praktijk 1)
 *
 *   'beide' + 'eind'       één post die aan het eind bij hoogstens één kant hoort (de feature van C&C).
 *   'beide' + een teller   (24-10-2026, C&C per beurt) een GEDEELDE TELLER: elke kant heeft zijn eigen
 *                          teller, samen hoogstens `max`: elk scoringsmoment (het eind van ELKE spelerbeurt, ook die
 *                          van de tegenstander) gaat naar hoogstens één kant. Zie
 *                          `gedeeldeTellers`.
 *
 * DE STAND die de spelers invoeren staat op de tracker, per stoel: `tracker.bonus[host|guest].scenario`
 * (post-id → aantal / 0-1 / punten). Bewust de RUWE stand en niet de VP: de pot hangt af van de teller
 * van de ANDERE kant, en een opgeslagen VP-getal zou daar stil van uit de pas lopen. Host = aanvaller,
 * guest = verdediger (zo vult openCampaignBattle de stoelen).
 *
 * Puur: geen React, geen fetch — los te testen (scripts/tests/scenario-bonus.test.cjs).
 */

export type BonusKant = 'aanvaller' | 'verdediger' | 'beide';
export type BonusSoort = 'eind' | 'per-stuk' | 'per-beurt' | 'pot' | 'puntwaarde';

export interface BonusPost {
  id: string;
  label: string;
  kant: BonusKant;
  soort: BonusSoort;
  /** Per keer; bij 'pot' de startwaarde; bij 'puntwaarde' de vermenigvuldiger (1). */
  vp: number;
  max?: number;
  potAftrek?: number;
  potKoppeling?: string;
  uitleg?: string;
}

export interface ScenarioBonus {
  versie: 1;
  posten: BonusPost[];
}

/** De stoel in OWC. Host = aanvaller, guest = verdediger. */
export type Zijde = 'host' | 'guest';
/** De ruwe invoer van één stoel: post-id → aantal (eind: 0/1, puntwaarde: punten). */
export type ScenarioStand = Record<string, number>;

const KANTEN: BonusKant[] = ['aanvaller', 'verdediger', 'beide'];
const SOORTEN: BonusSoort[] = ['eind', 'per-stuk', 'per-beurt', 'pot', 'puntwaarde'];
const getal = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const tekst = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Eén post van de wire, of null als hij niet bruikbaar is. Een onbekende soort of kant valt weg in
 *  plaats van geraden te worden: liever een post minder dan een verkeerd bedrag. */
function parsePost(v: unknown): BonusPost | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const id = tekst(o.id);
  const label = tekst(o.label);
  const kant = KANTEN.find((k) => k === o.kant);
  const soort = SOORTEN.find((s) => s === o.soort);
  const vp = getal(o.vp);
  if (!id || !label || !kant || !soort || vp == null || vp < 0) return null;
  const post: BonusPost = { id, label, kant, soort, vp };
  const max = getal(o.max);
  if (max != null && max >= 0) post.max = Math.floor(max);
  const aftrek = getal(o.potAftrek);
  if (aftrek != null && aftrek >= 0) post.potAftrek = aftrek;
  const koppeling = tekst(o.potKoppeling);
  if (koppeling) post.potKoppeling = koppeling;
  const uitleg = tekst(o.uitleg);
  if (uitleg) post.uitleg = uitleg;
  return post;
}

/** `sheet.scenarioBonus` → de definitie, of null (geen veld, onbekende versie, geen bruikbare post). */
export function parseScenarioBonus(v: unknown): ScenarioBonus | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o.versie !== 1) return null;
  const gezien = new Set<string>();
  const posten = (Array.isArray(o.posten) ? o.posten : [])
    .map(parsePost)
    .filter((p): p is BonusPost => {
      if (!p || gezien.has(p.id)) return false;
      gezien.add(p.id);
      return true;
    });
  return posten.length ? { versie: 1, posten } : null;
}

export const kantVanZijde = (z: Zijde): 'aanvaller' | 'verdediger' => (z === 'host' ? 'aanvaller' : 'verdediger');

/** Mag deze stoel deze post scoren? */
export const postGeldtVoor = (p: BonusPost, z: Zijde): boolean => p.kant === 'beide' || p.kant === kantVanZijde(z);

/** De posten die deze stoel kan scoren, in de volgorde van de sheet. */
export const postenVoor = (def: ScenarioBonus | null | undefined, z: Zijde): BonusPost[] =>
  (def?.posten ?? []).filter((p) => postGeldtVoor(p, z));

/** Een ingevoerde waarde netjes binnen de grenzen van de post: eind 0/1, tellers 0..max, punten ≥ 0. */
export function klemStand(p: BonusPost, n: number): number {
  const v = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  if (p.soort === 'eind') return v > 0 ? 1 : 0;
  if (p.soort === 'pot') return 0;
  if ((p.soort === 'per-stuk' || p.soort === 'per-beurt') && p.max != null) return Math.min(p.max, v);
  return v;
}

const standVan = (s: ScenarioStand | null | undefined, id: string): number => {
  const v = s?.[id];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

/** Een teller die BEIDE kanten scoren (24-10-2026): Command & Control per spelerbeurt, en straks bv. de
 *  shrine van Act 4. Elke stoel houdt zijn eigen teller bij (in zijn eigen `scenario`-stand), elk 0..max,
 *  en de twee samen nooit meer dan `max` (12 spelerbeurten zijn er maar). */
export const isGedeeldeTeller = (p: BonusPost): boolean =>
  p.kant === 'beide' && (p.soort === 'per-stuk' || p.soort === 'per-beurt');

/**
 * DE TWEE TELLERS VAN EEN GEDEELDE POST, zoals ze meetellen.
 *
 * De invoer WEIGERT al wat over de grens gaat (de plus staat uit zodra samen `max` bereikt is, zie
 * `ruimteVoor`). Toch kan de tracker er overheen staan: twee telefoons die tegelijk tikken, of een oude
 * stand van vóór het plafond. Dan geen voorkeur voor een kant (wie het laatst schreef weet niemand):
 * elke kant telt hoogstens `max` min de ander, dus BEIDE leveren het teveel in en samen blijft het
 * binnen `max`. `teVeel` zegt het scherm dat er iets recht te zetten valt.
 */
export function gedeeldeTellers(p: BonusPost, host: ScenarioStand | null | undefined, guest: ScenarioStand | null | undefined): { host: number; guest: number; ruwHost: number; ruwGuest: number; teVeel: boolean } {
  const h = klemStand(p, standVan(host, p.id));
  const g = klemStand(p, standVan(guest, p.id));
  if (p.max == null || h + g <= p.max) return { host: h, guest: g, ruwHost: h, ruwGuest: g, teVeel: false };
  return { host: Math.max(0, Math.min(h, p.max - g)), guest: Math.max(0, Math.min(g, p.max - h)), ruwHost: h, ruwGuest: g, teVeel: true };
}

/** Hoeveel deze stoel er bij een gedeelde teller nog bij mag tikken (Infinity zonder plafond). Bij een
 *  gewone teller: tot zijn eigen `max`. */
export function ruimteVoor(p: BonusPost, z: Zijde, host: ScenarioStand | null | undefined, guest: ScenarioStand | null | undefined): number {
  if (p.max == null) return Infinity;
  const eigen = klemStand(p, standVan(z === 'host' ? host : guest, p.id));
  if (!isGedeeldeTeller(p)) return Math.max(0, p.max - eigen);
  const ander = klemStand(p, standVan(z === 'host' ? guest : host, p.id));
  return Math.max(0, p.max - eigen - ander);
}

/** Een nieuwe waarde voor de teller van deze stoel, binnen de grenzen: `klemStand`, en bij een gedeelde
 *  teller hoogstens wat de ander overlaat. Omlaag mag altijd (ook als de stand al te hoog stond). */
export function klemInvoer(p: BonusPost, z: Zijde, n: number, host: ScenarioStand | null | undefined, guest: ScenarioStand | null | undefined): number {
  const v = klemStand(p, n);
  if (!isGedeeldeTeller(p) || p.max == null) return v;
  const ander = klemStand(p, standVan(z === 'host' ? guest : host, p.id));
  const eigen = klemStand(p, standVan(z === 'host' ? host : guest, p.id));
  return v <= eigen ? v : Math.min(v, Math.max(eigen, p.max - ander));
}

/** De stand waarmee een post voor één stoel rekent (gedeelde tellers via `gedeeldeTellers`). */
function telStand(p: BonusPost, z: Zijde, host: ScenarioStand | null | undefined, guest: ScenarioStand | null | undefined): number {
  if (isGedeeldeTeller(p)) return gedeeldeTellers(p, host, guest)[z];
  return klemStand(p, standVan(z === 'host' ? host : guest, p.id));
}

/** Hoe vaak de gekoppelde post (de plunderingen) gescoord is, over alle stoelen die hem mogen scoren. */
function koppelKeer(def: ScenarioBonus, pot: BonusPost, host: ScenarioStand | null | undefined, guest: ScenarioStand | null | undefined): number {
  const k = pot.potKoppeling ? def.posten.find((p) => p.id === pot.potKoppeling) : undefined;
  if (!k) return 0;
  let n = 0;
  if (postGeldtVoor(k, 'host')) n += telStand(k, 'host', host, guest);
  if (postGeldtVoor(k, 'guest')) n += telStand(k, 'guest', host, guest);
  return n;
}

/** De pot uitgerekend: start, aftrek per keer, hoe vaak, en wat er over is (nooit onder 0). */
export function potStand(def: ScenarioBonus, pot: BonusPost, host: ScenarioStand | null | undefined, guest: ScenarioStand | null | undefined): { start: number; aftrek: number; keer: number; vp: number } {
  const start = Math.max(0, Math.round(pot.vp));
  const aftrek = Math.max(0, pot.potAftrek ?? 0);
  const keer = koppelKeer(def, pot, host, guest);
  return { start, aftrek, keer, vp: Math.max(0, Math.round(start - aftrek * keer)) };
}

/** De VP die één post voor één stoel oplevert. */
export function postVp(def: ScenarioBonus, p: BonusPost, z: Zijde, host: ScenarioStand | null | undefined, guest: ScenarioStand | null | undefined): number {
  if (!postGeldtVoor(p, z)) return 0;
  if (p.soort === 'pot') return potStand(def, p, host, guest).vp;
  return Math.max(0, Math.round(telStand(p, z, host, guest) * p.vp));
}

/** Alle scenario-VP per stoel. Zonder definitie: nul (een oude sheet, of een vrij potje). */
export function scenarioVp(def: ScenarioBonus | null | undefined, host: ScenarioStand | null | undefined, guest: ScenarioStand | null | undefined): { host: number; guest: number } {
  if (!def) return { host: 0, guest: 0 };
  let h = 0;
  let g = 0;
  for (const p of def.posten) {
    h += postVp(def, p, 'host', host, guest);
    g += postVp(def, p, 'guest', host, guest);
  }
  return { host: h, guest: g };
}

/** "per marker", "per turn" … voor achter het bedrag. */
export function eenheidTekst(p: BonusPost): string {
  if (p.soort === 'eind') return 'at the end';
  if (p.soort === 'per-beurt') return 'per turn';
  if (p.soort === 'per-stuk') return 'each';
  if (p.soort === 'puntwaarde') return 'VP per point';
  return 'pot';
}

/** Wie het scoort, voor in een lijst. */
export const kantTekst = (k: BonusKant): string => (k === 'aanvaller' ? 'Attacker' : k === 'verdediger' ? 'Defender' : 'Either side');

/** Eén regel samenvatting van een post, bv. "40 VP per turn, max 12" of "Pot 150, −15 per plunder". */
export function postSamenvatting(def: ScenarioBonus, p: BonusPost): string {
  if (p.soort === 'pot') {
    const k = p.potKoppeling ? def.posten.find((x) => x.id === p.potKoppeling) : undefined;
    return `Starts at ${p.vp} VP${p.potAftrek ? `, −${p.potAftrek} VP each time ${k ? `"${k.label}" scores` : 'the linked post scores'}` : ''}, never below 0`;
  }
  if (p.soort === 'puntwaarde') return p.vp === 1 ? 'VP equal to the points entered' : `${p.vp} VP per point entered`;
  const max = p.max != null ? `, max ${p.max}${isGedeeldeTeller(p) ? ' for both sides together' : ''}` : '';
  if (p.soort === 'eind') return `${p.vp} VP at the end`;
  return `${p.vp} VP ${p.soort === 'per-beurt' ? 'per turn' : 'each'}${max}`;
}
