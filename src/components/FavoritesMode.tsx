import { useData } from '../data';
import { useUI } from '../state';

export function FavoritesMode() {
  const { getRule } = useData();
  const { favorites, openRule, toggleFavorite } = useUI();

  return (
    <div className="flex-1 overflow-y-auto px-3 pb-28 pt-3">
      <h1 className="mb-3 font-display text-2xl text-gold">Favourites</h1>

      {favorites.length === 0 ? (
        <p className="rounded-xl border border-border-soft bg-surface-2 p-4 text-sm text-ink-faint">
          Tap the ★ on any rule to pin it here for quick access during a game.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {favorites.map((slug) => {
            const r = getRule(slug);
            return (
              <li key={slug}>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-3">
                  <button
                    onClick={() => openRule(slug)}
                    className="min-w-0 flex-1 truncate text-left font-display text-lg text-ink"
                  >
                    {r?.name ?? slug}
                  </button>
                  <button
                    aria-label="Remove favourite"
                    onClick={() => toggleFavorite(slug)}
                    className="shrink-0 px-2 text-xl text-gold active:scale-95"
                  >
                    ★
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
