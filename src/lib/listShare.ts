import { supabase } from './supabase';
import { getPersisted, setPersisted } from '../store';
import { cleanKey, makeSyncKey } from './listSync';
import type { ListEntry } from './owbBuilder';

// EEN ARMY LIST DELEN OM TE LATEN BEKIJKEN — niet om te laten bewerken.
//
// "ik wil de mogelijkheid om een armylist van mij te delen met iemand anders. Dat ik bv een code
// doorstuur die ik aan iemand anders geef en dat die dan ook de lijst kan bekijken in companion.
// maar alleen bekijken, niet aanpassen." (Joost, 12-09)
//
// De hele beveiliging zit in de database: `tow_gedeelde_lijst` staat op RLS-slot en is alleen
// bereikbaar via vier SECURITY DEFINER-functies. Dit bestand doet niets anders dan die functies
// aanroepen en het antwoord in een vorm gieten waar de UI iets mee kan. Het rekent niets uit en
// kent geen spelregels.
//
// TWEE SOORTEN SLEUTELS, EN DAT VERSCHIL IS DE KERN:
//   • de CODE (6 tekens) is wat je doorstuurt. Wie hem heeft mag KIJKEN.
//   • de EIGENAARSSLEUTEL (zie `eigenaarSleutel`) blijft op je eigen apparaat. Hij geeft GEEN
//     leesrecht — hij bepaalt alleen wie een share mag BIJWERKEN of INTREKKEN.
// Ze staan dus nooit samen in één link, en een ontvanger kan met de code niets aan jouw kant.

/** De velden die de kijker nodig heeft, en verder niets. Zie `schoneKopie` voor het waarom. */
export interface DeelbareLijst {
  id: string;
  name: string;
  army: string;
  composition: string;
  rule: string;
  points: number;
  entries: ListEntry[];
  /** De doorgerekende puntensom, als de builder hem al had. Puur informatief mee. */
  computedPoints?: number;
}

/** Wat de eigenaar over één gedeelde lijst te zien krijgt. */
export interface DeelStatus {
  code: string;
  bijgewerktOp: string;
  keerBekeken: number;
}

/** Een opgehaalde gedeelde lijst, zoals de ontvanger hem krijgt. */
export interface GedeeldeLijst {
  code: string;
  naam: string;
  leger: string;
  lijst: DeelbareLijst;
  gedeeldOp: string;
  bijgewerktOp: string;
}

/** Waar de zelfgemaakte eigenaarssleutel staat als er geen list-sync is ingericht. */
const EIGEN_SLEUTEL = 'tow:share-key';

/** De tekens waaruit een code bestaat (server en client houden dezelfde set aan): geen 0/O/1/I. */
const CODE_TEKENS = /^[A-Z0-9]{1,12}$/;

/**
 * De sleutel waarmee DIT apparaat zijn eigen shares beheert.
 *
 * Eerst de list-sync-key, als de speler die heeft: dan beheert elk van zijn apparaten dezelfde
 * shares, wat precies is wat je verwacht — je deelt een lijst op je telefoon en trekt hem op je
 * laptop weer in. Heeft hij geen sync, dan maken we één keer een eigen sleutel en bewaren die
 * lokaal, zodat delen OOK werkt zonder account en zonder sync.
 *
 * DEZE SLEUTEL GEEFT GEEN LEESRECHT. `tow_lijst_open` kijkt er niet naar; hij bepaalt alleen wie
 * een bestaande share mag bijwerken of stoppen. Hij hoort dus nooit in een deel-link, maar het is
 * ook geen ramp als hij ergens opduikt: het ergste dat iemand ermee kan is jouw eigen shares
 * intrekken.
 *
 * GEVOLG VAN DE VOLGORDE: richt iemand LATER alsnog list-sync in, dan verschuift zijn
 * eigenaarssleutel en raakt hij het beheer over eerder gemaakte codes kwijt (die codes blijven wel
 * gewoon werken). Dat is de prijs voor "werkt ook zonder account"; omgekeerd zou een vaste lokale
 * sleutel betekenen dat je op je tweede apparaat je eigen shares niet ziet, en dat is de vervelendere
 * van de twee.
 */
export function eigenaarSleutel(): string {
  const sync = cleanKey(getPersisted<string | null>('tow:syncKey', null) ?? '');
  if (sync) return sync;
  const eigen = cleanKey(getPersisted<string | null>(EIGEN_SLEUTEL, null) ?? '');
  if (eigen) return eigen;
  const vers = cleanKey(makeSyncKey());
  setPersisted(EIGEN_SLEUTEL, vers);
  return vers;
}

/**
 * De SCHOONGEMAAKTE kopie die de deur uit gaat — een snapshot, geen live koppeling.
 *
 * Bewust alleen wat een kijker nodig heeft om de lijst te lezen en te laten doorrekenen. Wat er
 * expres UIT blijft:
 *   • `campaign`, `campaignSpeler`, `campaignNaam`, `campaignFase`, `campaignKey` — die zeggen iets
 *     over de campagne waarin de deler speelt, niet over de lijst. Een tegenstander die je lijst
 *     bekijkt heeft niets te maken met jouw speler-id in De Grensvorsten, en een kijker die zelf in
 *     een campagne zit moet zo'n lijst zeker niet als campagne-lijst te zien krijgen.
 *   • `groupId` — de map op JOUW apparaat. Betekenisloos bij de ontvanger.
 *   • `createdAt` / `updatedAt` — tijdstempels van jouw apparaat. De server houdt zelf
 *     `gedeeld_op` en `bijgewerkt_op` bij; dat zijn de enige twee die de kijker iets zeggen.
 */
function schoneKopie(l: DeelbareLijst): DeelbareLijst {
  const uit: DeelbareLijst = {
    id: l.id,
    name: l.name,
    army: l.army,
    composition: l.composition,
    rule: l.rule,
    points: l.points,
    entries: Array.isArray(l.entries) ? l.entries : [],
  };
  if (typeof l.computedPoints === 'number') uit.computedPoints = l.computedPoints;
  return uit;
}

/** Eén Error met een leesbare `message`, zodat elke aanroeper hem gewoon kan tonen. Het ruwe
 *  antwoord gaat naar `console.warn` — daar hoort het thuis, niet op het scherm van de speler. */
function deelFout(e: unknown, terugval: string): Error {
  console.warn('[share]', e);
  const m = (e as { message?: unknown } | null)?.message;
  return new Error(typeof m === 'string' && m.trim() ? m.trim() : terugval);
}

/** Een RPC die `setof` teruggeeft levert een array; pak de eerste rij (of niets). */
function eersteRij<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return (data as T) ?? null;
}

/** Een ingetypte of geplakte code opschonen. De server is al hoofdletterongevoelig en negeert
 *  streepjes/spaties; dit is puur zodat de code die we tonen en in de URL zetten er altijd
 *  hetzelfde uitziet. */
export const schoonCode = (code: string): string => (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Wat de gebruiker in het codeveld plakt is net zo vaak de hele LINK als de code zelf — beide
 *  knoppen staan naast elkaar in de deel-sheet. Herken `?lijst=<code>` dus en pak daar de code uit,
 *  in plaats van de speler te laten uitzoeken welke helft hij had moeten kopiëren. */
export function codeUitInvoer(invoer: string): string {
  const uitLink = /[?&]lijst=([^&\s#]+)/i.exec(invoer || '');
  return schoonCode(uitLink ? uitLink[1] : invoer);
}

/**
 * Deel een lijst (of werk een bestaande share bij met de huidige versie).
 *
 * Dezelfde (eigenaar, lijst-id) levert ALTIJD dezelfde code, dus "Update shared copy" verandert
 * niets aan de link die je al hebt rondgestuurd.
 */
export async function deelLijst(lijst: DeelbareLijst): Promise<DeelStatus> {
  try {
    const { data, error } = await supabase.rpc('tow_lijst_deel', {
      p_key: eigenaarSleutel(),
      p_lijst_id: lijst.id,
      p_lijst: schoneKopie(lijst),
    });
    if (error) throw error;
    const rij = eersteRij<{ code?: string; bijgewerkt_op?: string; keer_bekeken?: number }>(data);
    if (!rij?.code) throw new Error('Sharing did not return a code.');
    return {
      code: schoonCode(rij.code),
      bijgewerktOp: rij.bijgewerkt_op ?? '',
      keerBekeken: Number(rij.keer_bekeken ?? 0),
    };
  } catch (e) {
    throw deelFout(e, 'Could not share this list. Check your connection and try again.');
  }
}

/** Trek de share van één lijst in. De code werkt daarna nergens meer. */
export async function stopDelen(lijstId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('tow_lijst_deel_stop', {
      p_key: eigenaarSleutel(),
      p_lijst_id: lijstId,
    });
    if (error) throw error;
    return data === true;
  } catch (e) {
    throw deelFout(e, 'Could not stop sharing. Check your connection and try again.');
  }
}

/** Alles wat deze eigenaar gedeeld heeft, als `lijst_id → status`. Leeg = niets gedeeld. */
export async function deelStatus(): Promise<Map<string, DeelStatus>> {
  try {
    const { data, error } = await supabase.rpc('tow_lijst_deel_status', { p_key: eigenaarSleutel() });
    if (error) throw error;
    const uit = new Map<string, DeelStatus>();
    const rijen = (Array.isArray(data) ? data : []) as {
      lijst_id?: string; code?: string; bijgewerkt_op?: string; keer_bekeken?: number;
    }[];
    for (const r of rijen) {
      if (!r?.lijst_id || !r.code) continue;
      uit.set(r.lijst_id, {
        code: schoonCode(r.code),
        bijgewerktOp: r.bijgewerkt_op ?? '',
        keerBekeken: Number(r.keer_bekeken ?? 0),
      });
    }
    return uit;
  } catch (e) {
    throw deelFout(e, 'Could not load your shared lists.');
  }
}

/**
 * Haal een gedeelde lijst op met zijn code. Gooit met een leesbare melding als de code niet (meer)
 * bestaat — een lege uitslag en een netwerkfout zijn voor de kijker hetzelfde soort probleem, maar
 * verdienen wél verschillende woorden.
 */
export async function openGedeeldeLijst(code: string): Promise<GedeeldeLijst> {
  const schoon = codeUitInvoer(code);
  if (!schoon || !CODE_TEKENS.test(schoon)) throw new Error('That does not look like a share code.');
  let rij: { naam?: string; leger?: string; lijst?: unknown; gedeeld_op?: string; bijgewerkt_op?: string } | null;
  try {
    const { data, error } = await supabase.rpc('tow_lijst_open', { p_code: schoon });
    if (error) throw error;
    rij = eersteRij(data);
  } catch (e) {
    throw deelFout(e, 'Could not open that shared list. Check your connection and try again.');
  }
  // Geen rij = de code bestaat niet meer (of heeft nooit bestaan). Geen `deelFout`: dit is geen
  // storing maar een normaal antwoord, en "probeer het opnieuw" zou hier onzin zijn.
  if (!rij || !rij.lijst) throw new Error('No shared list found for that code. It may have been withdrawn.');
  const l = rij.lijst as Partial<DeelbareLijst>;
  if (!l || typeof l !== 'object' || !Array.isArray(l.entries) || !l.army) {
    throw new Error('That shared list could not be read.');
  }
  return {
    code: schoon,
    naam: rij.naam ?? l.name ?? 'Shared list',
    leger: rij.leger ?? l.army,
    // Nog één keer schoonmaken aan DEZE kant: een rij die ooit door een oudere versie is geschreven
    // kan campagne-velden bevatten, en die mogen dit apparaat niet binnenkomen.
    lijst: schoneKopie({
      id: l.id ?? `shared-${schoon}`,
      name: l.name ?? rij.naam ?? 'Shared list',
      army: l.army,
      composition: l.composition ?? l.army,
      rule: l.rule ?? 'open-war',
      points: Number(l.points ?? 0),
      entries: l.entries,
      computedPoints: l.computedPoints,
    }),
    gedeeldOp: rij.gedeeld_op ?? '',
    bijgewerktOp: rij.bijgewerkt_op ?? '',
  };
}

/** De link die je doorstuurt. `BASE_URL` erin, want de app kan onder een subpad staan. */
export const deelLink = (code: string): string =>
  `${window.location.origin}${import.meta.env.BASE_URL}?lijst=${schoonCode(code)}`;

/**
 * Lees `?lijst=<code>` uit de URL en HAAL DE PARAMETER ER METEEN UIT.
 *
 * Exact dezelfde vorm als `?army=` en `?battle=` in AppShell: lezen, en daarna met
 * `history.replaceState` alleen die ene parameter wissen (niet de hele query, want een andere
 * deep-link kan nog aan het werk zijn). Zo her-triggert een reload hem niet, en blijft er geen
 * code van een ander in je adresbalk hangen.
 *
 * Staat hier en niet in AppShell omdat het scherm dat de lijst kán tonen (ListBuilder) ook degene
 * is die de code nodig heeft; de ROUTERING naar de Army-tab regelt AppShell zelf.
 *
 * ONTHOUDT WAT HIJ GEVONDEN HEEFT. Er zijn straks twee afnemers van dezelfde parameter — AppShell
 * om naar de Army-tab te springen, dit scherm om de lijst op te halen — en wie als eerste kijkt,
 * wist hem uit de adresbalk. Zonder dit geheugen zou de tweede met lege handen staan, puur afhankelijk
 * van de volgorde waarin React de effecten draait. Roep deze functie dus aan beide kanten aan, niet
 * `searchParams.get('lijst')`.
 */
let gevondenCode: string | null = null;
export function gedeeldeCodeUitUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const raw = url.searchParams.get('lijst');
  if (raw === null) return gevondenCode;
  url.searchParams.delete('lijst');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  gevondenCode = schoonCode(raw) || null;
  return gevondenCode;
}

/**
 * Zoals hierboven, maar hij VERBRUIKT de code: een tweede aanroep levert niets meer.
 *
 * Dit is de kant die de lijst daadwerkelijk ophaalt. ListBuilder wordt bij ELKE tabwissel opnieuw
 * gemount (AppShell rendert hem alleen op de Army-tab), en zonder verbruiken zou het geheugen uit
 * `gedeeldeCodeUitUrl` bij elke terugkeer dezelfde gedeelde lijst opnieuw openen — ook nadat je hem
 * had weggeklikt. Eén link, één keer openen.
 */
export function neemGedeeldeCode(): string | null {
  const code = gedeeldeCodeUitUrl();
  gevondenCode = null;
  return code;
}
