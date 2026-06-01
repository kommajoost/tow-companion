import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { CompanionData, FlowData, FlowStep, Lore, Rule, RulesData } from './types';

interface DataContextValue extends RulesData {
  // Always provided by the provider (defaulted), so non-optional here.
  lores: Record<string, Lore>;
  loreList: string[];
  getRule: (slug: string | null | undefined) => Rule | undefined;
  getFlow: (slug: string | null | undefined) => FlowStep | undefined;
  /** Look up a Lore of Magic by slug (undefined if not found). */
  getLore: (slug: string | null | undefined) => Lore | undefined;
  /** Steps folded into a parent and hidden from the walkthrough sequence. */
  hiddenSteps: Set<string>;
  /** Curated turn structure for Play (null if not loaded). */
  companion: CompanionData | null;
}

const DataContext = createContext<DataContextValue | null>(null);

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within <DataProvider>');
  return ctx;
}

const BASE = import.meta.env.BASE_URL;

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<RulesData | null>(null);
  const [flow, setFlow] = useState<FlowData>({ steps: {} });
  const [companion, setCompanion] = useState<CompanionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // rules.json is required; flow.json + companion.json are optional (tolerate absence).
    Promise.all([
      fetch(`${BASE}rules.json`).then((r) => {
        if (!r.ok) throw new Error(`rules.json HTTP ${r.status}`);
        return r.json() as Promise<RulesData>;
      }),
      fetch(`${BASE}flow.json`)
        .then((r) => (r.ok ? (r.json() as Promise<FlowData>) : { steps: {} }))
        .catch(() => ({ steps: {} as Record<string, FlowStep> })),
      fetch(`${BASE}companion.json`)
        .then((r) => (r.ok ? (r.json() as Promise<CompanionData>) : null))
        .catch(() => null),
    ])
      .then(([rules, fl, comp]) => {
        if (cancelled) return;
        setData(rules);
        setFlow(fl && fl.steps ? fl : { steps: {} });
        setCompanion(comp && Array.isArray(comp.phases) ? comp : null);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<DataContextValue | null>(() => {
    if (!data) return null;
    const hiddenSteps = new Set(flow.hidden ?? []);
    return {
      ...data,
      lores: data.lores ?? {},
      loreList: data.loreList ?? [],
      getRule: (slug) => (slug ? data.rules[slug] : undefined),
      getFlow: (slug) => (slug ? flow.steps[slug] : undefined),
      getLore: (slug) => (slug ? (data.lores ?? {})[slug] : undefined),
      hiddenSteps,
      companion,
    };
  }, [data, flow, companion]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-2xl text-accent">⚠</div>
        <p className="text-ink-dim">Could not load the rules data.</p>
        <p className="text-xs text-ink-faint">{error}</p>
      </div>
    );
  }

  if (!value) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="font-display text-lg text-gold">Mustering the rules…</p>
      </div>
    );
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
