import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../data';
import { useUI } from '../state';
import { TOW } from '../design/tow';
import type { NavSection } from '../types';
import { QuickRollButton, QuickRollSheet } from './CombatCalc';

const MAX_RESULTS = 60;

// The Rulebook: search across every rule + browse the wiki sections. Phone is a single
// column; wide screens get a TOC + search sidebar beside a reading pane (the design's
// two-pane reference). Rules open in the stacked pop-up sheet.
export function BrowseMode() {
  const { nav, rules, getRule } = useData();
  const { openRule } = useUI();
  const [section, setSection] = useState<NavSection | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);

  const quickBtn = <QuickRollButton onClick={() => setQuickOpen(true)} />;

  const rootRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(420);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  const wide = w >= 700;

  // Lower-cased search index over every rule, built once.
  const index = useMemo(
    () =>
      Object.values(rules)
        // Skip empty section stubs and the standalone weapon/chart "(Profile)" entries —
        // those are already shown inline on their parent weapon/rule.
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

  const f = filter.trim().toLowerCase();
  const children = section
    ? section.childSlugs.filter((slug) => {
        if (!f) return true;
        const r = getRule(slug);
        return r ? r.name.toLowerCase().includes(f) : false;
      })
    : [];

  const SearchBox = (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search all rules…"
        className="w-full rounded-xl border border-border bg-bg px-4 py-3 pr-9 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />
      {query && (
        <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-lg text-ink-faint active:bg-surface-2">
          ✕
        </button>
      )}
    </div>
  );

  const resultsList = (
    <>
      <div className="mb-2 px-1 text-xs uppercase tracking-widest text-ink-faint">
        {results.length === 0 ? 'No matches' : `${results.length}${results.length === MAX_RESULTS ? '+' : ''} result${results.length === 1 ? '' : 's'} for “${query.trim()}”`}
      </div>
      {results.length === 0 ? (
        <p className="px-1 py-4 text-sm text-ink-faint">No rules match “{query}”.</p>
      ) : (
        <ul className="space-y-1">
          {results.map((e) => (
            <li key={e.slug}>
              <button onClick={() => openRule(e.slug)} className="flex w-full flex-col gap-0.5 rounded-lg border border-border-soft bg-surface-2 px-3 py-2.5 text-left active:bg-surface-3">
                <span className="truncate font-medium text-ink">{e.name}</span>
                {e.bodyIndex && <span className="line-clamp-2 text-xs text-ink-faint">{e.bodyIndex.slice(0, 160)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const sectionContent = section && (
    <>
      <button onClick={() => openRule(section.slug)} className="mb-3 w-full rounded-xl border border-border-soft bg-surface-2 px-3 py-2.5 text-left text-sm text-accent active:bg-surface-3">
        Read the “{section.name}” overview ›
      </button>
      {section.childSlugs.length > 12 && (
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${section.childSlugs.length} rules…`} className="mb-3 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none" />
      )}
      <ul className="space-y-1">
        {children.map((slug) => {
          const r = getRule(slug);
          return (
            <li key={slug}>
              <button onClick={() => openRule(slug)} className="flex w-full items-center gap-2 rounded-lg border border-border-soft bg-surface/40 px-3 py-2.5 text-left active:bg-surface-3">
                <span className="min-w-0 flex-1 truncate text-ink">{r?.name ?? slug}</span>
                <span className="text-ink-faint">›</span>
              </button>
            </li>
          );
        })}
        {children.length === 0 && <li className="px-1 py-4 text-sm text-ink-faint">No matching rules.</li>}
      </ul>
    </>
  );

  const sourceNote = (
    <p className="mt-6 px-1 text-center text-[11px] leading-relaxed text-ink-faint">
      Rules quoted verbatim from{' '}
      <a href="https://tow.whfb.app/" target="_blank" rel="noreferrer" className="underline">tow.whfb.app</a>. Unofficial personal-use aid. Warhammer: The Old World © Games Workshop.
    </p>
  );

  // ════════════════ WIDE — TOC/search sidebar + reading pane ════════════════
  let body: React.ReactNode;
  if (wide) {
    body = (
      <div ref={rootRef} className="flex h-full">
        <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${TOW.lineStrong}`, background: TOW.panel }} className="flex flex-col">
          <div className="px-4 pt-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h1 className="font-display text-2xl text-gold">Rulebook</h1>
              {quickBtn}
            </div>
            {SearchBox}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div className="mb-2 px-1 font-display text-[9px] uppercase tracking-widest text-ink-faint">Sections</div>
            <ul className="space-y-1">
              {nav.map((s) => {
                const active = section?.slug === s.slug && q.length < 2;
                return (
                  <li key={s.slug}>
                    <button
                      onClick={() => { setSection(s); setFilter(''); setQuery(''); }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left"
                      style={{ background: active ? 'rgba(138,108,48,0.12)' : 'transparent', color: active ? TOW.goldDeep : TOW.ink }}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm" style={{ fontWeight: active ? 600 : 400 }}>{s.name}</span>
                      <span className="shrink-0 text-xs text-ink-faint">{s.childSlugs.length || '—'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-7 py-7">
            {q.length >= 2 ? (
              resultsList
            ) : section ? (
              <>
                <h2 className="mb-4 font-display text-2xl text-gold">{section.name}</h2>
                {sectionContent}
              </>
            ) : (
              <div className="py-16 text-center">
                <p className="font-display text-lg text-ink-dim">Pick a section on the left, or search above.</p>
                {sourceNote}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ════════════════ PHONE — single column ════════════════
  // Search results replace the section list while typing.
  else if (!section && q.length >= 2) {
    body = (
      <div ref={rootRef} className="flex h-full flex-col">
        <div className="border-b border-border-soft px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h1 className="font-display text-2xl text-gold">Rulebook</h1>
            {quickBtn}
          </div>
          {SearchBox}
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-28 pt-3">{resultsList}</div>
      </div>
    );
  } else if (!section) {
    body = (
      <div ref={rootRef} className="flex h-full flex-col">
        <div className="border-b border-border-soft px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h1 className="font-display text-2xl text-gold">Rulebook</h1>
            {quickBtn}
          </div>
          {SearchBox}
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-28 pt-3">
          <ul className="space-y-1.5">
            {nav.map((s) => (
              <li key={s.slug}>
                <button onClick={() => { setSection(s); setFilter(''); }} className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-3 text-left active:bg-surface-3">
                  <span className="min-w-0 flex-1 truncate font-display text-lg text-ink">{s.name}</span>
                  <span className="shrink-0 text-xs text-ink-faint">{s.childSlugs.length || '—'}</span>
                  <span className="text-ink-faint">›</span>
                </button>
              </li>
            ))}
          </ul>
          {sourceNote}
        </div>
      </div>
    );
  } else {
    body = (
      <div ref={rootRef} className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border-soft px-3 py-2">
          <button onClick={() => { setSection(null); setFilter(''); }} className="rounded-lg px-2 py-1.5 text-sm text-ink-dim active:bg-surface-2">‹ All</button>
          <span className="min-w-0 flex-1 truncate font-display text-lg text-gold">{section.name}</span>
          {quickBtn}
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-28 pt-3">{sectionContent}</div>
      </div>
    );
  }

  return (
    <>
      {body}
      <QuickRollSheet open={quickOpen} onClose={() => setQuickOpen(false)} />
    </>
  );
}
