import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePersistentState } from './store';

interface UIState {
  // Favourites
  favorites: string[];
  isFavorite: (slug: string) => boolean;
  toggleFavorite: (slug: string) => void;

  // Per-step checkboxes (key = step slug)
  isChecked: (slug: string) => boolean;
  toggleChecked: (slug: string) => void;
  clearChecked: (slugs: string[]) => void;
  countChecked: (slugs: string[]) => number;

  // Rule pop-up stack (slugs); the top one is shown in the bottom sheet
  sheetStack: string[];
  openRule: (slug: string) => void;
  closeTopRule: () => void;
  closeAllRules: () => void;
}

const Ctx = createContext<UIState | null>(null);

export function useUI(): UIState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useUI must be used within <UIStateProvider>');
  return ctx;
}

export function UIStateProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = usePersistentState<string[]>('tow:favorites', []);
  const [checked, setChecked] = usePersistentState<Record<string, boolean>>(
    'tow:checked',
    {},
  );
  const [sheetStack, setSheetStack] = useState<string[]>([]);

  const isFavorite = useCallback((slug: string) => favorites.includes(slug), [favorites]);
  const toggleFavorite = useCallback(
    (slug: string) =>
      setFavorites((prev) =>
        prev.includes(slug) ? prev.filter((s) => s !== slug) : [slug, ...prev],
      ),
    [setFavorites],
  );

  const isChecked = useCallback((slug: string) => !!checked[slug], [checked]);
  const toggleChecked = useCallback(
    (slug: string) =>
      setChecked((prev) => {
        const next = { ...prev };
        if (next[slug]) delete next[slug];
        else next[slug] = true;
        return next;
      }),
    [setChecked],
  );
  const clearChecked = useCallback(
    (slugs: string[]) =>
      setChecked((prev) => {
        const next = { ...prev };
        for (const s of slugs) delete next[s];
        return next;
      }),
    [setChecked],
  );
  const countChecked = useCallback(
    (slugs: string[]) => slugs.reduce((n, s) => (checked[s] ? n + 1 : n), 0),
    [checked],
  );

  const openRule = useCallback((slug: string) => setSheetStack((s) => [...s, slug]), []);
  const closeTopRule = useCallback(() => setSheetStack((s) => s.slice(0, -1)), []);
  const closeAllRules = useCallback(() => setSheetStack([]), []);

  const value = useMemo<UIState>(
    () => ({
      favorites,
      isFavorite,
      toggleFavorite,
      isChecked,
      toggleChecked,
      clearChecked,
      countChecked,
      sheetStack,
      openRule,
      closeTopRule,
      closeAllRules,
    }),
    [
      favorites,
      isFavorite,
      toggleFavorite,
      isChecked,
      toggleChecked,
      clearChecked,
      countChecked,
      sheetStack,
      openRule,
      closeTopRule,
      closeAllRules,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
