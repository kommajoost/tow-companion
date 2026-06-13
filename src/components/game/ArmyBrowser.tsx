import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../data';
import { useUI } from '../../state';
import { TOW, towFont, engraved } from '../../design/tow';
import { getRuleIndex, resolveRuleSlug } from '../../lib/armyRules';

// Proof of concept (Stap 1): browse every army's unit catalogue, sourced from the Old World
// Builder project (public/owb/, synced via `npm run sync-owb`, CC BY 4.0). Read-only — shows
// each unit's points, wargear/options, special rules (tappable → our rule pop-up) and its stat
// profile (looked up by name in OWB's wiki-exported rules index).

const BASE = import.meta.env.BASE_URL;
const eb = engraved as React.CSSProperties;

interface OwbOption { name_en: string; points?: number; perModel?: boolean }
interface OwbUnit {
  name_en: string; id: string; points?: number; minimum?: number; maximum?: number;
  command?: OwbOption[]; equipment?: OwbOption[]; armor?: OwbOption[]; options?: OwbOption[];
  mounts?: OwbOption[]; lores?: OwbOption[]; specialRules?: { name_en?: string };
}
type Category = 'characters' | 'core' | 'special' | 'rare' | 'mercenaries' | 'allies';
type OwbArmy = Record<Category, OwbUnit[]>;
interface ArmyMeta { slug: string; name: string; units: number }
interface StatLine { Name: string; M: string; WS: string; BS: string; S: string; T: string; W: string; I: string; A: string; Ld: string }
interface RuleEntry { stats?: StatLine[]; troopType?: string; page?: string }

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'characters', label: 'Characters' },
  { key: 'core', label: 'Core' },
  { key: 'special', label: 'Special' },
  { key: 'rare', label: 'Rare' },
  { key: 'mercenaries', label: 'Mercenaries' },
  { key: 'allies', label: 'Allies' },
];

// OWB's normalizeRuleName — the rules index is keyed by this (lowercased, parentheticals/brackets
// stripped, kept diacritics & spaces). We add a final-word singular fallback for plurals.
const normRule = (s: string) =>
  (s || '').toLowerCase().replace(/ *\([^)]*\) */g, '').replace(/[{}[\]*]/g, '').replace(/^[0-9]x /g, '').replace(/[“”]/g, '"').trim();

// module-level caches so switching armies doesn't refetch
let statIndexCache: Record<string, RuleEntry> | null = null;
const armyCache: Record<string, OwbArmy> = {};

const STAT_COLS: (keyof StatLine)[] = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld'];

export function ArmyBrowser() {
  const { rules } = useData();
  const { openRule } = useUI();
  const ruleSlugIdx = useMemo(() => getRuleIndex(rules), [rules]);

  const [armies, setArmies] = useState<ArmyMeta[] | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [army, setArmy] = useState<OwbArmy | null>(null);
  const [statIdx, setStatIdx] = useState<Record<string, RuleEntry> | null>(statIndexCache);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${BASE}owb/index.json`).then((r) => r.json()).then((d) => setArmies(d.armies)).catch(() => setArmies([]));
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancel = false;
    setLoading(true);
    Promise.all([
      armyCache[slug] ? Promise.resolve(armyCache[slug]) : fetch(`${BASE}owb/${slug}.json`).then((r) => r.json()),
      statIndexCache ? Promise.resolve(statIndexCache) : fetch(`${BASE}owb/rules-index.json`).then((r) => r.json()),
    ]).then(([a, idx]) => {
      if (cancel) return;
      armyCache[slug] = a;
      statIndexCache = idx;
      setArmy(a);
      setStatIdx(idx);
      setLoading(false);
    });
    return () => { cancel = true; };
  }, [slug]);

  const statsFor = (name: string): StatLine[] => {
    if (!statIdx) return [];
    const key = normRule(name);
    let e = statIdx[key];
    if (!e?.stats?.length) {
      const w = key.split(' ');
      const last = w[w.length - 1];
      if (/s$/.test(last)) e = statIdx[[...w.slice(0, -1), last.replace(/s$/, '')].join(' ')];
    }
    return e?.stats ?? [];
  };

  const card: React.CSSProperties = { border: `1px solid ${TOW.line}`, borderRadius: 12, background: TOW.panel2 };

  // ── Army picker ──
  if (!slug) {
    return (
      <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '18px 16px 40px' }}>
          <h1 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 24, color: TOW.ink, margin: '2px 0 2px' }}>Browse armies</h1>
          <p style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14, color: TOW.parchDim, margin: '0 0 16px' }}>
            Every army's units — points, wargear and rules. Pick an army to explore.
          </p>
          {!armies ? (
            <p style={{ fontFamily: towFont.serif, color: TOW.muted }}>Loading…</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
              {armies.map((a) => (
                <button key={a.slug} onClick={() => { setSlug(a.slug); setArmy(null); setOpen(null); }}
                  style={{ ...card, cursor: 'pointer', textAlign: 'left', padding: '12px 14px' }}>
                  <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 15, color: TOW.ink }}>{a.name}</div>
                  <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginTop: 3 }}>{a.units} units</div>
                </button>
              ))}
            </div>
          )}
          <p style={{ fontFamily: towFont.serif, fontSize: 11, color: TOW.faint, marginTop: 20, textAlign: 'center', lineHeight: 1.6 }}>
            Unit catalogue from <a href="https://github.com/nthiebes/old-world-builder" target="_blank" rel="noreferrer" className="underline">Old World Builder</a> (CC BY 4.0).
            Unofficial personal-use aid. Warhammer: The Old World © Games Workshop.
          </p>
        </div>
      </div>
    );
  }

  const armyName = armies?.find((a) => a.slug === slug)?.name ?? slug;

  // ── Unit list for the chosen army ──
  return (
    <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '14px 14px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button onClick={() => { setSlug(null); setArmy(null); setOpen(null); }}
            style={{ borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: towFont.serif, fontSize: 14, color: TOW.goldDeep, padding: '4px 6px' }}>‹ Armies</button>
          <h1 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 22, color: TOW.ink, margin: 0 }}>{armyName}</h1>
        </div>

        {loading || !army ? (
          <p style={{ fontFamily: towFont.serif, color: TOW.muted }}>Loading units…</p>
        ) : (
          CATEGORIES.map(({ key, label }) => {
            const units = army[key] ?? [];
            if (units.length === 0) return null;
            return (
              <section key={key} style={{ marginBottom: 16 }}>
                <div style={{ ...eb, fontSize: 9, color: TOW.goldDeep, marginBottom: 6 }}>{label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {units.map((u) => {
                    const isOpen = open === `${key}:${u.id}`;
                    const stats = isOpen ? statsFor(u.name_en) : [];
                    const sr = (u.specialRules?.name_en || '').split(',').map((s) => s.trim()).filter(Boolean);
                    const group = (lbl: string, opts?: OwbOption[]) => {
                      const list = (opts || []).filter((o) => o.name_en);
                      if (!list.length) return null;
                      return (
                        <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.parchDim, margin: '2px 0' }}>
                          <span style={{ ...eb, fontSize: 8, color: TOW.muted, marginRight: 6 }}>{lbl}</span>
                          {list.map((o, i) => (
                            <span key={i}>{i > 0 && <span style={{ color: TOW.faint }}> · </span>}{o.name_en}{o.points ? <span style={{ color: TOW.muted }}> ({o.points})</span> : null}</span>
                          ))}
                        </div>
                      );
                    };
                    return (
                      <div key={u.id} style={card}>
                        <button onClick={() => setOpen(isOpen ? null : `${key}:${u.id}`)}
                          style={{ display: 'flex', alignItems: 'baseline', gap: 8, width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '11px 13px' }}>
                          <span style={{ flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 15, color: TOW.ink }}>{u.name_en}</span>
                          {u.points != null && <span style={{ ...eb, fontSize: 9, color: TOW.goldDeep, whiteSpace: 'nowrap' }}>{u.points} pts</span>}
                          <span style={{ color: TOW.faint, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                        </button>
                        {isOpen && (
                          <div style={{ padding: '0 13px 13px', borderTop: `1px solid ${TOW.line}` }}>
                            {(u.minimum || u.maximum) && (
                              <div style={{ ...eb, fontSize: 8, color: TOW.muted, margin: '8px 0 0' }}>
                                Unit size {u.minimum ?? 1}{u.maximum ? `–${u.maximum}` : '+'}
                              </div>
                            )}
                            {stats.length > 0 && (
                              <div className="no-scrollbar" style={{ overflowX: 'auto', margin: '8px 0' }}>
                                <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: 320, fontSize: 12.5, fontFamily: towFont.serif }}>
                                  <thead><tr>
                                    <th style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, border: `1px solid ${TOW.line}`, padding: '3px 4px', textAlign: 'left', background: 'rgba(184,134,47,0.08)' }}>Model</th>
                                    {STAT_COLS.map((c) => <th key={c} style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, border: `1px solid ${TOW.line}`, padding: '3px 2px', textAlign: 'center', background: 'rgba(184,134,47,0.08)' }}>{c}</th>)}
                                  </tr></thead>
                                  <tbody>
                                    {stats.map((s, i) => (
                                      <tr key={i}>
                                        <td style={{ border: `1px solid ${TOW.line}`, padding: '3px 4px', color: TOW.ink, whiteSpace: 'nowrap' }}>{s.Name}</td>
                                        {STAT_COLS.map((c) => <td key={c} style={{ textAlign: 'center', border: `1px solid ${TOW.line}`, padding: '3px 2px', color: TOW.ink }}>{s[c]}</td>)}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {group('Command', u.command)}
                            {group('Equipment', u.equipment)}
                            {group('Armour', u.armor)}
                            {group('Options', u.options)}
                            {group('Mounts', u.mounts)}
                            {group('Lores', u.lores)}
                            {sr.length > 0 && (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Special rules</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {sr.map((label, i) => {
                                    const ruleSlug = resolveRuleSlug(label, ruleSlugIdx);
                                    const common: React.CSSProperties = { fontFamily: towFont.serif, fontSize: 12, padding: '3px 9px', borderRadius: 999, border: `1px solid ${ruleSlug ? TOW.goldDeep : TOW.line}` };
                                    return ruleSlug ? (
                                      <button key={i} onClick={() => openRule(ruleSlug)} style={{ ...common, cursor: 'pointer', background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep }}>{label}</button>
                                    ) : (
                                      <span key={i} style={{ ...common, background: 'transparent', color: TOW.muted }}>{label}</span>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
