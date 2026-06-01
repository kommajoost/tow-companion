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
import type { Army, GameRow, GameSummary } from './types';

type Seat = 'host' | 'guest' | 'solo';

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
  createGame: (name: string, army: Army | null) => Promise<string | null>;
  joinGame: (code: string, name: string, army: Army | null) => Promise<boolean>;
  /** Recent games (newest first) for the join lobby. */
  listGames: () => Promise<GameSummary[]>;
  startSolo: () => void;
  setMyArmy: (army: Army) => void;
  setOpponentArmy: (army: Army) => void;
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

export function GameProvider({ children }: { children: ReactNode }) {
  const [persisted, setPersisted] = usePersistentState<Persisted | null>('tow:game', null);
  const [game, setGame] = useState<GameRow | null>(null);
  const [soloOpponent, setSoloOpponent] = useState<Army | null>(null);
  const [soloMine, setSoloMine] = useState<Army | null>(null);
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
    async (name: string, army: Army | null): Promise<string | null> => {
      setBusy(true);
      setError(null);
      try {
        for (let attempt = 0; attempt < 5; attempt++) {
          const c = makeCode();
          const { data, error: err } = await withTimeout(
            supabase
              .from(TOW_GAMES)
              .insert({ code: c, host_name: name || 'Host', host_army: army ?? null })
              .select()
              .single(),
            15000,
            'Creating the game took too long — check your connection and try again.',
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
          'Joining took too long — check your connection and try again.',
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
          'Joining took too long — check your connection and try again.',
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

  const startSolo = useCallback(() => {
    setError(null);
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

  const leaveGame = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setGame(null);
    setSoloMine(null);
    setSoloOpponent(null);
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
      listGames,
      startSolo,
      setMyArmy,
      setOpponentArmy,
      leaveGame,
    };
  }, [
    seat,
    code,
    game,
    soloMine,
    soloOpponent,
    busy,
    error,
    createGame,
    joinGame,
    listGames,
    startSolo,
    setMyArmy,
    setOpponentArmy,
    leaveGame,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
