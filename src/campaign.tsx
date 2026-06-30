// CAMPAIGN INTEGRATION (De Grensvorsten) — added 2026-06-30, extended (Phase B+C) 2026-06-30.
// See CAMPAIGN_INTEGRATION.md. Holds the shared campaign state + map terrain + which faction this
// device plays, and exposes the two write actions (respond to / record a battle). Lazy: nothing is
// fetched until the Campaign tab calls refresh(), so non-campaign users pay nothing.

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { usePersistentState } from './store';
import {
  fetchCampaign,
  fetchMapTypes,
  reageerBattle,
  recordUitslag,
  type CampState,
  type Uitkomst,
} from './lib/campaign';

interface CampaignCtx {
  state: CampState | null;
  mapTypes: Record<string, string>;
  loading: boolean;
  loaded: boolean;
  /** towc_spel_speler.id this device represents (persisted), or null if not joined. */
  spelerId: string | null;
  setSpelerId: (id: string | null) => void;
  refresh: () => Promise<void>;
  /** Defender response (Phase C). Returns false on failure. */
  respond: (battle: number, reactie: 'defend' | 'yield') => Promise<boolean>;
  /** Record the tabletop result back to the campaign (Phase C). Returns false on failure. */
  record: (battle: number, uitkomst: Uitkomst) => Promise<boolean>;
}

const Ctx = createContext<CampaignCtx | null>(null);

export function useCampaign(): CampaignCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCampaign must be used within CampaignProvider');
  return c;
}

export function CampaignProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CampState | null>(null);
  const [mapTypes, setMapTypes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [spelerId, setSpelerId] = usePersistentState<string | null>('tow:campaign-player', null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [s, t] = await Promise.all([fetchCampaign(), fetchMapTypes()]);
    setState(s);
    setMapTypes(t);
    setLoaded(true);
    setLoading(false);
  }, []);

  const respond = useCallback(
    async (battle: number, reactie: 'defend' | 'yield') => {
      if (!spelerId) return false;
      const ok = await reageerBattle(spelerId, battle, reactie);
      if (ok) await refresh();
      return ok;
    },
    [spelerId, refresh],
  );

  const record = useCallback(
    async (battle: number, uitkomst: Uitkomst) => {
      if (!spelerId) return false;
      const ok = await recordUitslag(spelerId, battle, uitkomst);
      if (ok) await refresh();
      return ok;
    },
    [spelerId, refresh],
  );

  return (
    <Ctx.Provider value={{ state, mapTypes, loading, loaded, spelerId, setSpelerId, refresh, respond, record }}>
      {children}
    </Ctx.Provider>
  );
}
