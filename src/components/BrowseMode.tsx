import { useMemo, useState } from 'react';
import { useData } from '../data';
import { useUI } from '../state';
import type { NavSection } from '../types';

const MAX_RESULTS = 60;

// The Rulebook: browse all sections, with a search box pinned at the top that shows
// live suggestions across every rule as you type (name + body), opening the rule in the
// pop-up sheet. An empty box shows the normal section list.
export function BrowseMode() {
  const { nav, rules, getRule } = useData();
  const { openRule } = useUI();
  const [section, setSection] = useState<NavSection | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');

  // Lower-cased search index over every rule, built once.
  const index = useMemo(
    () =>
      Object.values(rules)
        // Skip empty section stubs and the standalone weapon/chart "(Profile)" entries —
        // those are already shown inline on their parent weapon/rule, so as separate
        // search hits they'd just be noise (e.g. "Grapeshot" + "Grapeshot (Profile)").
        .filter((r) => r.body && !r.slug.endsWith('-profile') && !r.slug.endsWith('-chart'))
        .map((r) => ({
          slug: r.slug,
          name: r.name,
          nameLower: r.name.toLowerCase(),
          hay: (r.name + ' ' + r.bodyIndex).toLowerCase(),
          bodyIndex: r.bodyIndex,
        })),
    [rules],
  );

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (q.length < 2) return [];
    const nameHits: typeof index = [];
    const bodyHits: typeof index = [];
    for (const e of index) {
      if (e.nameLower.includes(q)) nameHits.push(e);
      else if (e.hay.includes(q)) bodyHits.push(e);
    }
    nameHits.sort((a, b) => a.name.length - b.name.length);
    return [...nameHits, ...bodyHits].slice(0, MAX_RESULTS);
  }, [q, index]);

  const SearchBox = (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search all rules… (e.g. panic, charge, miscast)"
        className="w-full rounded-xl border border-border bg-bg px-4 py-3 pr-9 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />
      {query && (
        <button
          onClick={() => setQuery('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-lg text-ink-faint active:bg-surface-2"
        >
          ✕
        </button>
      )}
    </div>
  );

  // ── Search results (live suggestions) replace the section list while typing ──
  if (!section && q.length >= 2) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border-soft px-3 py-2.5">
          <h1 className="mb-2 font-display text-2xl text-gold">Rulebook</h1>
          {SearchBox}
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-28 pt-3">
          <div className="mb-2 px-1 text-xs uppercase tracking-widest text-ink-faint">
            {results.length === 0
              ? 'No matches'
              : `${results.length}${results.length === MAX_RESULTS ? '+' : ''} result${results.length === 1 ? '' : 's'}`}
          </div>
          {results.length === 0 ? (
            <p className="px-1 py-4 text-sm text-ink-faint">No rules match “{query}”.</p>
          ) : (
            <ul className="space-y-1">
              {results.map((e) => (
                <li key={e.slug}>
                  <button
                    onClick={() => openRule(e.slug)}
                    className="flex w-full flex-col gap-0.5 rounded-lg border border-border-soft bg-surface-2 px-3 py-2.5 text-left active:bg-surface-3"
                  >
                    <span className="truncate font-medium text-ink">{e.name}</span>
                    {e.bodyIndex && (
                      <span className="line-clamp-2 text-xs text-ink-faint">
                        {e.bodyIndex.slice(0, 160)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ── Section list (default) ──
  if (!section) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border-soft px-3 py-2.5">
          <h1 className="mb-2 font-display text-2xl text-gold">Rulebook</h1>
          {SearchBox}
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-28 pt-3">
          <ul className="space-y-1.5">
            {nav.map((s) => (
              <li key={s.slug}>
                <button
                  onClick={() => {
                    setSection(s);
                    setFilter('');
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-3 text-left active:bg-surface-3"
                >
                  <span className="min-w-0 flex-1 truncate font-display text-lg text-ink">
                    {s.name}
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">
                    {s.childSlugs.length || '—'}
                  </span>
                  <span className="text-ink-faint">›</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-6 px-1 text-center text-[11px] leading-relaxed text-ink-faint">
            Rules quoted verbatim from{' '}
            <a
              href="https://tow.whfb.app/"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              tow.whfb.app
            </a>
            . Unofficial personal-use aid. Warhammer: The Old World © Games Workshop.
          </p>
        </div>
      </div>
    );
  }

  // ── Inside a section ──
  const f = filter.trim().toLowerCase();
  const children = section.childSlugs.filter((slug) => {
    if (!f) return true;
    const r = getRule(slug);
    return r ? r.name.toLowerCase().includes(f) : false;
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border-soft px-3 py-2">
        <button
          onClick={() => {
            setSection(null);
            setFilter('');
          }}
          className="rounded-lg px-2 py-1.5 text-sm text-ink-dim active:bg-surface-2"
        >
          ‹ All
        </button>
        <span className="truncate font-display text-lg text-gold">{section.name}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-28 pt-3">
        <button
          onClick={() => openRule(section.slug)}
          className="mb-3 w-full rounded-xl border border-border-soft bg-surface-2 px-3 py-2.5 text-left text-sm text-accent active:bg-surface-3"
        >
          Read the “{section.name}” overview ›
        </button>

        {section.childSlugs.length > 12 && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filter ${section.childSlugs.length} rules…`}
            className="mb-3 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
        )}

        <ul className="space-y-1">
          {children.map((slug) => {
            const r = getRule(slug);
            return (
              <li key={slug}>
                <button
                  onClick={() => openRule(slug)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border-soft bg-surface/40 px-3 py-2.5 text-left active:bg-surface-3"
                >
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {r?.name ?? slug}
                  </span>
                  <span className="text-ink-faint">›</span>
                </button>
              </li>
            );
          })}
          {children.length === 0 && (
            <li className="px-1 py-4 text-sm text-ink-faint">No matching rules.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
