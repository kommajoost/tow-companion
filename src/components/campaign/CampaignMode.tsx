// CAMPAIGN INTEGRATION (De Grensvorsten) — added 2026-06-30, extended (Phase B+C) 2026-06-30.
// See CAMPAIGN_INTEGRATION.md. The "Campaign" tab.
//  · Phase A: pick your faction → see territory, gold, fame, battles (read-only).
//  · Phase B: your phase points budget + the army-list slots your buildings unlock + link a saved list.
//  · Phase C: for each battle, the scenario the terrain frames + respond (defend/yield) + record the
//    result back to the campaign (writes via towc_spel_reageer / towc_spel_uitslag).

import { useEffect, useState } from 'react';
import { useCampaign } from '../../campaign';
import { ROSTER_BONUS, puntenBudget, scenarioVoor, type CampBattle, type Uitkomst } from '../../lib/campaign';
import { usePersistentState } from '../../store';
import { TOW, towFont, engraved } from '../../design/tow';

const PHASE_NAMES = ['Landing', 'Exploration', 'Establishment', 'Expansion', 'War', 'Reckoning'];

interface SavedListLite { id: string; name: string; army?: string; points?: number }

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div style={{ height: '100%', overflowY: 'auto', color: TOW.parch }} className="pt-safe">
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '22px 16px 48px' }}>{children}</div>
  </div>
);
const Kop = ({ children }: { children: React.ReactNode }) => (
  <p style={{ ...(engraved as React.CSSProperties), fontSize: 11, color: TOW.gold, marginBottom: 6 }}>{children}</p>
);
function Knop({ active, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      style={{
        border: `1px solid ${active ? TOW.goldDeep : TOW.line}`,
        background: active ? 'rgba(138,108,48,0.13)' : TOW.panel2,
        color: TOW.parch,
        borderRadius: 8,
        padding: '8px 12px',
        cursor: 'pointer',
        fontFamily: towFont.display,
        fontSize: 13,
        ...props.style,
      }}
    />
  );
}

const UITKOMSTEN: { id: Uitkomst; label: (atk: string, def: string) => string }[] = [
  { id: 'aanvaller-major', label: (a) => `${a} — major win` },
  { id: 'aanvaller-minor', label: (a) => `${a} — minor win` },
  { id: 'gelijk', label: () => 'Draw' },
  { id: 'verdediger-minor', label: (_a, d) => `${d} — minor win` },
  { id: 'verdediger-major', label: (_a, d) => `${d} — major win` },
];

export function CampaignMode() {
  const { state, mapTypes, loading, loaded, spelerId, setSpelerId, refresh, respond, record } = useCampaign();
  const [savedLists] = usePersistentState<SavedListLite[]>('tow:lists', []);
  const [campListId, setCampListId] = usePersistentState<string | null>('tow:campaign-list', null);
  const [busy, setBusy] = useState(false);
  const [recordingFor, setRecordingFor] = useState<number | null>(null);

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  const naamVan = (id?: string | null) => state?.spelers.find((s) => s.id === id)?.naam ?? id ?? '';
  const kleurVan = (id?: string | null) => state?.spelers.find((s) => s.id === id)?.kleur ?? TOW.muted;
  const gebouwLabel = (id?: string | null) => state?.gebouwtypes.find((g) => g.id === id)?.label ?? id ?? '';

  const act = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    await fn();
    setBusy(false);
    setRecordingFor(null);
  };

  if (loading && !state) return <Shell><p style={{ color: TOW.muted }}>Loading campaign…</p></Shell>;
  if (loaded && !state) {
    return (
      <Shell>
        <h1 style={{ fontFamily: towFont.display, fontSize: 26, color: TOW.ink }}>Campaign</h1>
        <p style={{ color: TOW.muted, marginTop: 8 }}>No active campaign found on the server yet.</p>
        <Knop onClick={() => void refresh()} style={{ marginTop: 14 }}>Retry</Knop>
      </Shell>
    );
  }
  if (!state) return <Shell><p style={{ color: TOW.muted }}>…</p></Shell>;

  const speler = state.spelers.find((s) => s.id === spelerId) ?? null;

  // ── Pick your faction ──
  if (!speler) {
    return (
      <Shell>
        <h1 style={{ fontFamily: towFont.display, fontSize: 26, color: TOW.ink }}>De Grensvorsten</h1>
        <p style={{ color: TOW.parchDim, marginTop: 8, marginBottom: 16 }}>Pick the faction you play in the campaign. You can change it later.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.spelers.map((s) => (
            <Knop key={s.id} onClick={() => setSpelerId(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
              <span style={{ width: 14, height: 14, borderRadius: 99, background: s.kleur, flexShrink: 0 }} />
              <span style={{ fontWeight: 600 }}>{s.naam}</span>
              <span style={{ color: TOW.muted, marginLeft: 'auto' }}>💰 {s.geld} · ⭐ {s.fame}</span>
            </Knop>
          ))}
        </div>
      </Shell>
    );
  }

  // ── Overview ──
  const mijnBezit = Object.entries(state.bezit).filter(([, b]) => b.speler === spelerId);
  const gebouwd = mijnBezit.filter(([, b]) => b.gebouw);
  const bonuses = gebouwd.map(([, b]) => b.gebouw && ROSTER_BONUS[b.gebouw]).filter(Boolean) as string[];
  const mijnBattles = state.battles.filter((b) => b.aanvaller === spelerId || b.verdediger === spelerId);
  const budget = puntenBudget(state.klok.fase);
  const campList = savedLists.find((l) => l.id === campListId) ?? null;

  const tegenstander = (b: CampBattle) => (b.aanvaller === spelerId ? b.verdediger : b.aanvaller);
  const battleStatus = (b: CampBattle): string => {
    if (b.winnaar) return `${b.winnaar === spelerId ? 'you won' : 'you lost'}${b.opbrengst ? ` · +${b.opbrengst} gold` : ''}`;
    if (b.aanvaller === spelerId) return b.reactie === 'defend' ? 'they will defend — play it' : b.reactie === 'yield' ? 'they yielded' : 'awaiting their response';
    return b.reactie ? 'arrange & play' : 'incoming — respond below';
  };

  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 16, height: 16, borderRadius: 99, background: speler.kleur, flexShrink: 0 }} />
        <h1 style={{ fontFamily: towFont.display, fontSize: 24, color: TOW.ink, flex: 1 }}>{speler.naam}</h1>
        <button onClick={() => setSpelerId(null)} style={{ border: 'none', background: 'none', color: TOW.muted, cursor: 'pointer', fontSize: 12 }}>change</button>
      </div>
      <p style={{ color: TOW.parchDim, marginTop: 4 }}>
        💰 {speler.geld} gold · ⭐ {speler.fame} fame · Phase {state.klok.fase}/6 · {PHASE_NAMES[state.klok.fase - 1] ?? ''} · Week {state.klok.week}/3
      </p>

      {/* Phase B — campaign list */}
      <section style={{ marginTop: 22 }}>
        <Kop>Your campaign list</Kop>
        <p style={{ fontSize: 14 }}>Points budget this phase: <b>{budget} pts</b></p>
        {bonuses.length > 0 && (
          <p style={{ fontSize: 13, color: TOW.parchDim, marginTop: 4 }}>
            Your holdings unlock: {bonuses.join(' · ')}
          </p>
        )}
        <div style={{ marginTop: 10 }}>
          {savedLists.length === 0 ? (
            <p style={{ fontSize: 13, color: TOW.muted }}>No saved lists yet — build one in the Army tab, then link it here.</p>
          ) : (
            <>
              <p style={{ fontSize: 12, color: TOW.muted, marginBottom: 6 }}>Linked list:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {savedLists.map((l) => (
                  <Knop key={l.id} active={l.id === campListId} onClick={() => setCampListId(l.id === campListId ? null : l.id)} style={{ fontSize: 12, padding: '6px 10px' }}>
                    {l.name}{l.points ? ` · ${l.points} pts` : ''}
                  </Knop>
                ))}
              </div>
              {campList && <p style={{ fontSize: 12, color: TOW.faint, marginTop: 6 }}>Edit it in the Army tab; keep it within {budget} pts + your unlocks.</p>}
            </>
          )}
        </div>
      </section>

      {/* Territory */}
      <section style={{ marginTop: 22 }}>
        <Kop>Territory ({mijnBezit.length})</Kop>
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {mijnBezit.map(([hex, b]) => (
            <li key={hex} style={{ color: TOW.parch, fontSize: 14 }}>
              <span style={{ fontWeight: 600 }}>{hex}</span>
              <span style={{ color: TOW.muted }}> · ctrl {b.controle ?? 1}{b.gebouw ? ` · ${gebouwLabel(b.gebouw)}` : ' · empty'}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Phase C — battles + scenario + record */}
      <section style={{ marginTop: 22 }}>
        <Kop>Battles ({mijnBattles.length})</Kop>
        {mijnBattles.length === 0 ? (
          <p style={{ color: TOW.muted, fontSize: 14 }}>No battles involving you.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mijnBattles.map((b) => {
              const sc = scenarioVoor(mapTypes[b.hex]);
              const amIDefender = b.verdediger === spelerId;
              const canRespond = amIDefender && !b.reactie && !b.winnaar;
              const canRecord = !b.winnaar && (b.reactie === 'defend' || b.aanvaller === spelerId);
              return (
                <li key={b.id} style={{ border: `1px solid ${TOW.line}`, borderRadius: 10, padding: '10px 12px', fontSize: 14 }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{b.type === 'raid' ? '🔥 Raid' : '⚔️ Attack'}</span> · plot {b.hex} · vs{' '}
                    <span style={{ color: kleurVan(tegenstander(b)) }}>{naamVan(tegenstander(b))}</span>
                    <span style={{ color: TOW.muted }}> — {battleStatus(b)}</span>
                  </div>
                  <div style={{ marginTop: 6, color: TOW.parchDim, fontSize: 13 }}>
                    <span style={{ color: TOW.gold }}>{b.type === 'raid' ? 'Raid' : sc.naam}</span> — {b.type === 'raid' ? 'A raid for spoils — no land changes hands.' : sc.opzet}
                  </div>

                  {canRespond && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                      <Knop disabled={busy} onClick={() => void act(() => respond(b.id, 'defend'))}>🛡️ Defend</Knop>
                      <Knop disabled={busy} onClick={() => void act(() => respond(b.id, 'yield'))} style={{ color: TOW.muted }}>🏳️ Yield</Knop>
                    </div>
                  )}

                  {canRecord && (
                    recordingFor === b.id ? (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <p style={{ fontSize: 12, color: TOW.muted }}>Record the result:</p>
                        {UITKOMSTEN.map((u) => (
                          <Knop key={u.id} disabled={busy} onClick={() => void act(() => record(b.id, u.id))} style={{ textAlign: 'left' }}>
                            {u.label(naamVan(b.aanvaller), naamVan(b.verdediger))}
                          </Knop>
                        ))}
                        <button onClick={() => setRecordingFor(null)} style={{ border: 'none', background: 'none', color: TOW.muted, cursor: 'pointer', fontSize: 12, alignSelf: 'flex-start' }}>cancel</button>
                      </div>
                    ) : (
                      <Knop disabled={busy} onClick={() => setRecordingFor(b.id)} style={{ marginTop: 8 }}>Record result</Knop>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div style={{ marginTop: 24, display: 'flex', gap: 10, alignItems: 'center' }}>
        <Knop onClick={() => void refresh()} style={{ fontSize: 13 }}>Refresh</Knop>
        <span style={{ color: TOW.faint, fontSize: 12 }}>Battles & results sync live with De Grensvorsten.</span>
      </div>
    </Shell>
  );
}
