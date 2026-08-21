import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase, TOW_GAMES } from './lib/supabase';
import { usePersistentState } from './store';
import type { BattleVeteranen, VetUnit } from './lib/campaignBattle';
import type { Army, GameRow, GameSummary, GameTracker, GameWeer } from './types';

type Seat = 'host' | 'guest' | 'solo';

/** De gedeelde GAME-REGELS van een potje: welk formaat, en welk weer. Ze horen bij de game en niet bij
 *  een speler, dus ze leven in de tracker (zie GameTracker.battleMarch/weer) — `tow_games` heeft geen
 *  kolom voor game-instellingen. Bij een campagne-battle komen ze van de server; buiten de campagne
 *  zet je ze zelf aan bij het opzetten. */
export interface GameRegels {
  battleMarch?: boolean;
  weer?: GameWeer | null;
}

interface GameContextValue {
  seat: Seat | null;
  code: string | null;
  game: GameRow | null;
  myArmy: Army | null;
  myName: string | null;
  opponentArmy: Army | null;
  opponentName: string | null;
  busy: boolean;
  error: string | null;
  createGame: (name: string, army: Army | null, regels?: GameRegels) => Promise<string | null>;
  joinGame: (code: string, name: string, army: Army | null) => Promise<boolean>;
  /** Open a campaign battle in this app's realtime game mode, keyed by the campaign's sync CODE
   *  (not a freshly-generated one). Seats the user as host (attacker) or guest (defender): if no
   *  tow_games row exists for that code yet it's created with the user in their seat, otherwise the
   *  user joins their seat. Both players thus land in the same realtime game. Returns true on success. */
  openCampaignBattle: (code: string, seat: 'host' | 'guest', name: string, army: Army | null, veteranen?: BattleVeteranen, opponentName?: string, opponentArmy?: Army | null, regels?: GameRegels) => Promise<boolean>;
  /** Recent games (newest first) for the join lobby. */
  listGames: () => Promise<GameSummary[]>;
  startSolo: (army?: Army | null, regels?: GameRegels) => void;
  setMyArmy: (army: Army) => void;
  setOpponentArmy: (army: Army) => void;
  /** Shared battle state (round, VP, per-unit casualties). */
  tracker: GameTracker;
  setTracker: (t: GameTracker) => void;
  leaveGame: () => void;
}

const Ctx = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGame must be used within <GameProvider>');
  return ctx;
}

// Avoid ambiguous characters (0/O, 1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(len = 4): string {
  let c = '';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) c += CODE_ALPHABET[arr[i] % CODE_ALPHABET.length];
  return c;
}

interface Persisted {
  seat: Seat;
  code: string | null;
}

// Supabase/PostgREST errors are plain objects (not Error instances), so String(err) yields
// the useless "[object Object]". Pull out a human-readable message instead.
function supaErr(e: unknown): string {
  if (!e) return 'Something went wrong. Please try again.';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  const o = e as Record<string, unknown>;
  const pick = (k: string) => (typeof o[k] === 'string' && o[k] ? (o[k] as string) : '');
  return (
    pick('message') ||
    pick('error_description') ||
    pick('error') ||
    pick('details') ||
    pick('hint') ||
    (pick('code') ? `Error ${pick('code')}` : '') ||
    JSON.stringify(o)
  );
}

// Guard a Supabase call against hanging forever (e.g. a request stuck "pending"): reject
// with a clear message after `ms`.
function withTimeout<T>(p: PromiseLike<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

// Campagne-veteranen (De Grensvorsten) op het te openen leger stempelen: elke unit met een
// `campaignId` die matcht op een `VetUnit.unitId` van MIJN kant krijgt z'n XP, abilities + scars mee.
// Zo reist de veteraan-info via `tow_games` (host_army/guest_army) mee naar beide spelers en toont
// de UnitCard ze read-only. Puur additief + immutable (nieuwe army/units — de bron blijft ongemoeid).
//
// XP GING HIER VERLOREN (20-08-2026): `towc_battle_by_code` levert per veteraan-unit óók `xp` (zie
// VetUnit in lib/campaignBattle.ts), maar dit stempel kopieerde alleen abilities + littekens. Aan tafel
// is de XP juist het getal dat zegt hoe hard deze unit ná het potje op de veteran-tabel rolt.
function annotateArmyWithVets(army: Army | null, vets: VetUnit[] | undefined): Army | null {
  if (!army || !vets || vets.length === 0) return army;
  const byId = new Map(vets.map((v) => [v.unitId, v]));
  return {
    ...army,
    units: army.units.map((u) => {
      const v = u.campaignId ? byId.get(u.campaignId) : undefined;
      return v ? { ...u, veteraan: { xp: v.xp, abilities: v.abilities, littekens: v.littekens } } : u;
    }),
  };
}

const EMPTY_TRACKER: GameTracker = { round: 1, vp: {}, units: {} };
// The DB default is `{}`, so fill in any missing fields before use.
/**
 * Normaliseer de tracker uit de cloud: `round`, `vp` en `units` moeten altijd de juiste vorm hebben
 * (oude en handmatig aangeraakte rijen kunnen ze missen), de rest blijft ONGEMOEID.
 *
 * Die laatste regel is de correctie (02-08). Deze functie somde alleen de velden op die er tóén waren
 * en herbouwde de tracker daaruit — dus alles wat er later bij kwam werd bij het LEZEN weggegooid,
 * terwijl `setTracker` het wél naar de database schreef. Dat sloopte twee dingen stil:
 *   • `quests` — je tikte een battle-quest aan, de schrijfactie ging door, maar de UI las 'm nooit
 *     terug. Het vinkje bleef leeg en de knop leek dood (Joost: "ik kan de quests niet aanklikken").
 *   • `report` — dezelfde oorzaak, dus de dubbele goedkeuring kon in principe nooit blijven staan.
 * Daarom nu eerst spreaden en daarna alleen de drie verplichte velden overschrijven: een nieuw
 * tracker-veld overleeft dit voortaan zonder dat iemand hieraan hoeft te denken.
 */
function normTracker(t: GameTracker | null | undefined): GameTracker {
  if (!t || typeof t !== 'object') return { round: 1, vp: {}, units: {} };
  const uit: GameTracker = {
    ...t,
    round: typeof t.round === 'number' ? t.round : 1,
    vp: t.vp && typeof t.vp === 'object' ? t.vp : {},
    units: t.units && typeof t.units === 'object' ? t.units : {},
  };
  // `bonus` mag geen rommel zijn: de VP-engine leest 'm defensief, maar een string i.p.v. een object
  // hier doorlaten zou een fout verplaatsen naar de plek waar 'ie moeilijker te vinden is.
  if (uit.bonus && typeof uit.bonus !== 'object') delete uit.bonus;
  // 21-08: de game-regels (Battle March + weer). Zelfde redenering als bij `bonus` — alleen de juiste
  // VORM mag door, anders zou een halve `weer` verderop een leeg kaartje of een crash geven. Een oude
  // game zonder deze velden houdt ze simpelweg niet: `battleMarch` afwezig = gewone Warhammer Battles,
  // `weer` afwezig = geen weer-regel tonen.
  if (typeof uit.battleMarch !== 'boolean') delete uit.battleMarch;
  uit.weer = normWeer(uit.weer);
  if (uit.weer === null && !('weer' in t)) delete uit.weer;
  return uit;
}

/** Alleen een volledig weer-object overleeft; al de rest wordt null (= geen weer). */
function normWeer(w: unknown): GameWeer | null {
  if (!w || typeof w !== 'object') return null;
  const o = w as Record<string, unknown>;
  const naam = typeof o.naam === 'string' ? o.naam : '';
  if (!naam) return null;
  return {
    worp: typeof o.worp === 'number' && Number.isFinite(o.worp) ? o.worp : 0,
    naam,
    effect: typeof o.effect === 'string' ? o.effect : '',
  };
}

/** Zijn dit twee keer hetzelfde weer? (Voor "alleen schrijven als het afwijkt".) */
const zelfdeWeer = (a: GameWeer | null | undefined, b: GameWeer | null | undefined): boolean =>
  (!a && !b) || (!!a && !!b && a.worp === b.worp && a.naam === b.naam && a.effect === b.effect);

/**
 * Stempel de game-regels op een BESTAANDE tracker zonder ooit voortgang weg te gooien.
 *
 * Waarom dit een aparte functie is: `openCampaignBattle` wordt door BEIDE spelers aangeroepen, en ook
 * opnieuw als iemand halverwege de battle de app herlaadt of z'n leger bijwerkt. Een tracker die
 * gewoon overschreven wordt zou dan de round, de casualties, de VP-bonussen en de goedkeuringen van
 * het lopende potje wissen. Daarom: spreiden bovenop wat er staat, en `null` teruggeven als er niets
 * te veranderen is — dan slaat de aanroeper de schrijfactie helemaal over.
 */
function metRegels(huidig: GameTracker, regels: GameRegels | undefined): GameTracker | null {
  if (!regels) return null;
  const wilBm = regels.battleMarch;
  const wilWeer = regels.weer;
  const bmNodig = typeof wilBm === 'boolean' && huidig.battleMarch !== wilBm;
  // `undefined` (de server weet het niet) laat het bestaande weer staan; een expliciete null wist het.
  const weerNodig = wilWeer !== undefined && !zelfdeWeer(huidig.weer, normWeer(wilWeer));
  if (!bmNodig && !weerNodig) return null;
  const uit: GameTracker = { ...huidig };
  if (bmNodig) uit.battleMarch = wilBm;
  if (weerNodig) uit.weer = normWeer(wilWeer);
  return uit;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [persisted, setPersisted] = usePersistentState<Persisted | null>('tow:game', null);
  const [game, setGame] = useState<GameRow | null>(null);
  const [soloOpponent, setSoloOpponent] = useState<Army | null>(null);
  const [soloMine, setSoloMine] = useState<Army | null>(null);
  const [soloTracker, setSoloTracker] = useState<GameTracker>(EMPTY_TRACKER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const seat = persisted?.seat ?? null;
  const code = persisted?.code ?? null;

  // ── realtime subscription to the active game row ──
  useEffect(() => {
    if (!code) return;
    let cancelled = false;

    // Merge a freshly-fetched row into local state without ever dropping an army we
    // already hold locally for a column the server momentarily returns as null. This
    // protects against any race/truncation where a partial row would wipe an army.
    const applyRow = (row: GameRow | null) => {
      if (!row || cancelled) return;
      setGame((prev) => {
        if (!prev) return row;
        return {
          ...row,
          host_army: row.host_army ?? prev.host_army,
          guest_army: row.guest_army ?? prev.guest_army,
          host_name: row.host_name ?? prev.host_name,
          guest_name: row.guest_name ?? prev.guest_name,
          tracker: row.tracker ?? prev.tracker,
        };
      });
    };

    const fetchRow = async () => {
      const { data } = await supabase.from(TOW_GAMES).select('*').eq('code', code).maybeSingle();
      applyRow(data as GameRow | null);
    };
    fetchRow();

    const channel = supabase
      .channel(`tow_game_${code}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TOW_GAMES, filter: `code=eq.${code}` },
        () => {
          // Realtime can truncate large jsonb payloads, so don't trust payload.new —
          // re-fetch the full authoritative row instead.
          fetchRow();
        },
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [code]);

  const createGame = useCallback(
    async (name: string, army: Army | null, regels?: GameRegels): Promise<string | null> => {
      setBusy(true);
      setError(null);
      // De game-regels leven in de tracker (zie GameRegels): bij een NIEUWE game is er nog geen
      // voortgang, dus hier mag de tracker gewoon in één keer geschreven worden.
      const startTracker = metRegels(EMPTY_TRACKER, regels) ?? EMPTY_TRACKER;
      try {
        for (let attempt = 0; attempt < 5; attempt++) {
          const c = makeCode();
          const { data, error: err } = await withTimeout(
            supabase
              .from(TOW_GAMES)
              .insert({ code: c, host_name: name || 'Host', host_army: army ?? null, tracker: startTracker })
              .select()
              .single(),
            15000,
            'Creating the game timed out. Please reload the app and try again.',
          );
          if (!err && data) {
            setGame(data as GameRow);
            setPersisted({ seat: 'host', code: c });
            return c;
          }
          if (err && !/duplicate|unique/i.test(err.message || '')) throw err;
        }
        throw new Error('Could not allocate a game code, please try again.');
      } catch (e) {
        setError(supaErr(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [setPersisted],
  );

  const joinGame = useCallback(
    async (joinCode: string, name: string, army: Army | null): Promise<boolean> => {
      setBusy(true);
      setError(null);
      const c = joinCode.trim().toUpperCase();
      try {
        const { data, error: err } = await withTimeout(
          supabase.from(TOW_GAMES).select('*').eq('code', c).maybeSingle(),
          15000,
          'Joining timed out. Please reload the app and try again.',
        );
        if (err) throw err;
        if (!data) throw new Error('No game found with that code.');
        const { data: updated, error: uerr } = await withTimeout(
          supabase
            .from(TOW_GAMES)
            .update({ guest_name: name || 'Guest', guest_army: army ?? null })
            .eq('code', c)
            .select()
            .single(),
          15000,
          'Joining timed out. Please reload the app and try again.',
        );
        if (uerr) throw uerr;
        setGame(updated as GameRow);
        setPersisted({ seat: 'guest', code: c });
        return true;
      } catch (e) {
        setError(supaErr(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [setPersisted],
  );

  // Open (create-or-join) a game on a FIXED code — the campaign battle's sync code — with the user
  // seated as host (attacker) or guest (defender). Unlike createGame this never allocates a random
  // code; unlike joinGame it creates the row on first open. Both participants call this with their
  // own seat, so they meet in the same realtime game. Writes only the user's own seat columns.
  const openCampaignBattle = useCallback(
    async (battleCode: string, mySeat: 'host' | 'guest', name: string, army: Army | null, veteranen?: BattleVeteranen, opponentName?: string, opponentArmy?: Army | null, regels?: GameRegels): Promise<boolean> => {
      setBusy(true);
      setError(null);
      const c = battleCode.trim().toUpperCase();
      const nameCol = mySeat === 'host' ? 'host_name' : 'guest_name';
      const armyCol = mySeat === 'host' ? 'host_army' : 'guest_army';
      const fallbackName = mySeat === 'host' ? 'Host' : 'Guest';
      const oppCol = mySeat === 'host' ? 'guest_name' : 'host_name';
      // The campaign knows both players by name, so the other seat can be pre-filled instead of reading
      // "Opponent" until they happen to open the battle themselves. Only ever as a DEFAULT: it is written
      // when that column is still empty, never over a name the opponent has already put there.
      const seedOpp = (row: Record<string, unknown> | null | undefined) =>
        (opponentName && !String(row?.[oppCol] ?? '').trim() ? { [oppCol]: opponentName } : {});
      // Host = aanvaller, guest = verdediger. Stempel MIJN kant z'n campagne-veteranen op het leger
      // vóór we het naar `tow_games` schrijven, zodat de info met de army mee-synct naar beide spelers.
      const mySide = mySeat === 'host' ? 'aanvaller' : 'verdediger';
      const army2 = annotateArmyWithVets(army, veteranen?.[mySide]);
      // Tegenstander-leger meegeven (30-07): een door de campagne bestuurde AI opent deze battle nooit
      // op een eigen device, dus zonder dit blijft de tegenstander-kant van de tracker leeg en moet JIJ
      // hun lijst erbij zoeken. Net als de naam-seed: alleen als die kolom nog leeg is — nooit over een
      // leger dat een echte tegenstander er al in heeft gezet.
      const oppSide = mySeat === 'host' ? 'verdediger' : 'aanvaller';
      const oppArmy2 = annotateArmyWithVets(opponentArmy ?? null, veteranen?.[oppSide]);
      const seedOppArmy = (row: Record<string, unknown> | null | undefined) =>
        (oppArmy2 && !row?.[armyCol === 'host_army' ? 'guest_army' : 'host_army']
          ? { [armyCol === 'host_army' ? 'guest_army' : 'host_army']: oppArmy2 }
          : {});
      try {
        const { data: existing, error: selErr } = await withTimeout(
          supabase.from(TOW_GAMES).select('*').eq('code', c).maybeSingle(),
          15000,
          'Opening the battle timed out. Please reload the app and try again.',
        );
        if (selErr) throw selErr;

        if (!existing) {
          // First to open this battle → create the row seated on our side.
          const { data: created, error: insErr } = await withTimeout(
            supabase
              .from(TOW_GAMES)
              .insert({ code: c, [nameCol]: name || fallbackName, [armyCol]: army2 ?? null, ...seedOpp(null), ...seedOppArmy(null), tracker: metRegels(EMPTY_TRACKER, regels) ?? EMPTY_TRACKER })
              .select()
              .single(),
            15000,
            'Opening the battle timed out. Please reload the app and try again.',
          );
          // A race (opponent created it a beat earlier) surfaces as a unique violation — fall through
          // to the update path instead of failing.
          if (insErr && !/duplicate|unique/i.test(insErr.message || '')) throw insErr;
          if (created) {
            setGame(created as GameRow);
            setPersisted({ seat: mySeat, code: c });
            return true;
          }
        }

        // Row exists (or we just lost the create race) → write our own seat columns.
        const { data: updated, error: updErr } = await withTimeout(
          supabase
            .from(TOW_GAMES)
            .update({ [nameCol]: name || fallbackName, [armyCol]: army2 ?? null, ...seedOpp(existing as Record<string, unknown> | null), ...seedOppArmy(existing as Record<string, unknown> | null) })
            .eq('code', c)
            .select()
            .single(),
          15000,
          'Opening the battle timed out. Please reload the app and try again.',
        );
        if (updErr) throw updErr;
        const row = updated as GameRow;
        setGame(row);
        setPersisted({ seat: mySeat, code: c });
        // GAME-REGELS OP EEN BESTAANDE RIJ (21-08-2026). Battle March + het weer horen in de tracker,
        // maar die tracker kan de VOORTGANG van een lopend potje bevatten — en dit pad wordt ook
        // gelopen als je halverwege herlaadt of je leger bijwerkt. Daarom drie voorzorgen:
        //   1. we merken op de VERSE tracker uit de update-respons hierboven, niet op de `existing` van
        //      vóór de write (die kan verouderd zijn als de tegenstander er net iets in zette, en bij
        //      een verloren create-race is 'ie zelfs null);
        //   2. `metRegels` spreidt bovenop wat er staat, dus round/casualties/bonus/report/quests
        //      blijven per definitie staan;
        //   3. staat het er al goed in, dan geeft `metRegels` null en schrijven we NIETS — geen
        //      overbodige write die met de andere speler kan botsen.
        const gemerged = metRegels(normTracker(row.tracker), regels);
        if (gemerged) {
          const { data: metTracker, error: trErr } = await withTimeout(
            supabase.from(TOW_GAMES).update({ tracker: gemerged }).eq('code', c).select().single(),
            15000,
            'Opening the battle timed out. Please reload the app and try again.',
          );
          if (trErr) throw trErr;
          if (metTracker) setGame(metTracker as GameRow);
        }
        return true;
      } catch (e) {
        setError(supaErr(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [setPersisted],
  );

  const startSolo = useCallback((army?: Army | null, regels?: GameRegels) => {
    setError(null);
    if (army) setSoloMine(army); // seed "my army" when a saved/pasted list was chosen at setup
    // Solo speelt lokaal, dus de regels gaan in de lokale tracker (zelfde vorm als online).
    setSoloTracker((t) => metRegels(t, regels) ?? t);
    setPersisted({ seat: 'solo', code: null });
  }, [setPersisted]);

  // List recent games (last 2 days) for the join lobby. Only lightweight columns — never the
  // army payloads — so it stays small and fast.
  const listGames = useCallback(async (): Promise<GameSummary[]> => {
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error: err } = await supabase
      .from(TOW_GAMES)
      .select('code, host_name, guest_name, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(40);
    if (err) return [];
    return (data ?? []) as GameSummary[];
  }, []);

  const setMyArmy = useCallback(
    (army: Army) => {
      if (seat === 'solo') {
        setSoloMine(army);
        return;
      }
      if (!code || !seat) return;
      const col = seat === 'host' ? 'host_army' : 'guest_army';
      setGame((g) => (g ? { ...g, [col]: army } : g)); // optimistic
      supabase
        .from(TOW_GAMES)
        .update({ [col]: army })
        .eq('code', code)
        .then(({ error: err }) => {
          if (err) setError(supaErr(err));
        });
    },
    [seat, code],
  );

  // Edit the opponent's army. Solo: local state. Online: write the opponent's column so
  // their spell/army edits made on this device persist and sync (last write wins).
  const setOpponentArmy = useCallback(
    (army: Army) => {
      if (seat === 'solo') {
        setSoloOpponent(army);
        return;
      }
      if (!code || !seat) return;
      const col = seat === 'host' ? 'guest_army' : 'host_army';
      setGame((g) => (g ? { ...g, [col]: army } : g)); // optimistic
      supabase
        .from(TOW_GAMES)
        .update({ [col]: army })
        .eq('code', code)
        .then(({ error: err }) => {
          if (err) setError(supaErr(err));
        });
    },
    [seat, code],
  );

  // Update the shared battle tracker (round, VP, casualties). Solo: local state.
  // Online: write the `tracker` column so both players see the same battle state.
  const setTracker = useCallback(
    (t: GameTracker) => {
      if (seat === 'solo') {
        setSoloTracker(t);
        return;
      }
      if (!code || !seat) return;
      setGame((g) => (g ? { ...g, tracker: t } : g)); // optimistic
      supabase
        .from(TOW_GAMES)
        .update({ tracker: t })
        .eq('code', code)
        .then(({ error: err }) => {
          if (err) setError(supaErr(err));
        });
    },
    [seat, code],
  );

  const leaveGame = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setGame(null);
    setSoloMine(null);
    setSoloOpponent(null);
    setSoloTracker(EMPTY_TRACKER);
    setPersisted(null);
  }, [setPersisted]);

  const value = useMemo<GameContextValue>(() => {
    let myArmy: Army | null = null;
    let opponentArmy: Army | null = null;
    let myName: string | null = null;
    let opponentName: string | null = null;

    if (seat === 'solo') {
      myArmy = soloMine;
      opponentArmy = soloOpponent;
      myName = 'You';
      opponentName = 'Opponent';
    } else if (game && seat === 'host') {
      myArmy = game.host_army;
      opponentArmy = game.guest_army;
      myName = game.host_name;
      opponentName = game.guest_name;
    } else if (game && seat === 'guest') {
      myArmy = game.guest_army;
      opponentArmy = game.host_army;
      myName = game.guest_name;
      opponentName = game.host_name;
    }

    return {
      seat,
      code,
      game,
      myArmy,
      myName,
      opponentArmy,
      opponentName,
      busy,
      error,
      createGame,
      joinGame,
      openCampaignBattle,
      listGames,
      startSolo,
      setMyArmy,
      setOpponentArmy,
      tracker: seat === 'solo' ? soloTracker : normTracker(game?.tracker),
      setTracker,
      leaveGame,
    };
  }, [
    seat,
    code,
    game,
    soloMine,
    soloOpponent,
    soloTracker,
    busy,
    error,
    createGame,
    joinGame,
    openCampaignBattle,
    listGames,
    startSolo,
    setMyArmy,
    setOpponentArmy,
    setTracker,
    leaveGame,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
