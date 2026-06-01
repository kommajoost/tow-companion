import { useCallback, useEffect, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { parseArmyList } from '../../lib/armyParser';
import { OwbInstructions } from './OwbInstructions';
import type { Army, GameSummary } from '../../types';

const eb = engraved as React.CSSProperties;

// The join lobby (list of current games) is fully built and working, but hidden for now.
// Flip this to `true` to show it again — no other change needed.
const SHOW_LOBBY = false;

// First screen of the Game tab: enter a name, paste your army list, then host a new game
// (get a code to share) or join one with a code. Also a solo/local fallback (offline).
export function GameSetup() {
  const { createGame, joinGame, listGames, startSolo, busy, error } = useGame();
  const [name, setName] = useState('');
  const [paste, setPaste] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'host' | 'join'>('host');
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [loadingGames, setLoadingGames] = useState(false);

  const army: Army | null = paste.trim() ? parseArmyList(paste) : null;

  const loadGames = useCallback(async () => {
    setLoadingGames(true);
    const g = await listGames();
    setGames(g);
    setLoadingGames(false);
  }, [listGames]);

  // Load the lobby when the player switches to "Join a game" (only when it's shown).
  useEffect(() => {
    if (SHOW_LOBBY && mode === 'join') loadGames();
  }, [mode, loadGames]);

  const inputStyle: React.CSSProperties = { width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: '#fffdf6', color: TOW.ink, padding: '10px 12px', fontFamily: towFont.serif, fontSize: 15, boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { ...eb, fontSize: 9, color: TOW.muted, marginBottom: 5, display: 'block' };
  const goldBtn: React.CSSProperties = { border: 'none', borderRadius: 11, cursor: 'pointer', padding: '13px 18px', background: `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`, color: '#2a1a0a', fontFamily: towFont.display, fontWeight: 700, fontSize: 15, width: '100%' };

  return (
    <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 40px' }}>
        <h1 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 26, color: TOW.ink, margin: '4px 0 2px' }}>Start a game</h1>
        <p style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 15, color: TOW.parchDim, margin: '0 0 18px' }}>
          Paste your army list to see each unit's profile and special rules, and to share the match with your opponent.
        </p>

        <label style={labelStyle}>Your name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Joost" style={{ ...inputStyle, marginBottom: 14 }} />

        <label style={labelStyle}>Army list (Old World Builder export) — optional</label>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste the full export here… (you can also add it later)" rows={7} style={{ ...inputStyle, resize: 'vertical', fontSize: 13, lineHeight: 1.4 }} />
        {army && (
          <div style={{ fontFamily: towFont.serif, fontSize: 13.5, color: TOW.goldDeep, margin: '8px 0 0' }}>
            ✓ {army.name}{army.points != null ? ` · ${army.points} pts` : ''} · {army.units.length} units
          </div>
        )}

        <OwbInstructions defaultOpen={!paste.trim()} />

        <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 11, background: 'rgba(74,55,22,0.06)', border: `1px solid ${TOW.line}`, margin: '18px 0 14px' }}>
          {(['host', 'join'] as const).map((m) => {
            const on = m === mode;
            return (
              <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', border: 'none', fontFamily: towFont.display, fontWeight: 600, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', background: on ? `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 60%, ${TOW.goldDeep})` : 'transparent', color: on ? '#2a1a0a' : TOW.muted }}>
                {m === 'host' ? 'Host a game' : 'Join a game'}
              </button>
            );
          })}
        </div>

        {mode === 'host' ? (
          <button onClick={() => createGame(name, army)} disabled={busy} style={{ ...goldBtn, opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Creating…' : 'Create game & get code'}
          </button>
        ) : (
          <div>
            <label style={labelStyle}>Game code</label>
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="e.g. K7Q4" maxLength={6} style={{ ...inputStyle, marginBottom: 12, letterSpacing: '0.3em', textTransform: 'uppercase', fontFamily: towFont.display }} />
            <button onClick={() => joinCode.trim() && joinGame(joinCode, name, army)} disabled={!joinCode.trim() || busy} style={{ ...goldBtn, opacity: !joinCode.trim() || busy ? 0.5 : 1 }}>
              {busy ? 'Joining…' : 'Join game'}
            </button>

            {SHOW_LOBBY && (
              <>
            {/* Lobby: recent games you can join directly */}
            <div style={{ display: 'flex', alignItems: 'center', margin: '22px 0 8px' }}>
              <span style={{ ...labelStyle, margin: 0 }}>Current games</span>
              <button
                onClick={loadGames}
                disabled={loadingGames}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontFamily: towFont.serif, fontSize: 12.5, color: TOW.goldDeep, textDecoration: 'underline', opacity: loadingGames ? 0.5 : 1 }}
              >
                {loadingGames ? 'Refreshing…' : '↻ Refresh'}
              </button>
            </div>

            {loadingGames && games === null ? (
              <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 13.5, color: TOW.muted }}>Loading…</div>
            ) : games && games.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {games.map((g) => {
                  const full = !!(g.guest_name && g.guest_name.trim());
                  return (
                    <div key={g.code} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${TOW.line}`, borderRadius: 11, background: TOW.panel2, padding: '10px 12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: towFont.serif, fontSize: 14, color: TOW.ink, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          <span style={{ fontWeight: 600 }}>{g.host_name || 'Host'}</span>
                          <span style={{ color: TOW.faint, margin: '0 6px' }}>vs</span>
                          {full ? (
                            <span style={{ fontWeight: 600 }}>{g.guest_name}</span>
                          ) : (
                            <span style={{ fontStyle: 'italic', color: TOW.muted }}>waiting…</span>
                          )}
                        </div>
                        <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginTop: 3 }}>Code {g.code}</div>
                      </div>
                      <button
                        onClick={() => !full && !busy && joinGame(g.code, name, army)}
                        disabled={full || busy}
                        style={{
                          flexShrink: 0,
                          border: `1px solid ${full ? TOW.line : TOW.goldDeep}`,
                          borderRadius: 9,
                          cursor: full ? 'default' : 'pointer',
                          padding: '8px 16px',
                          background: full ? 'transparent' : 'rgba(184,134,47,0.12)',
                          color: full ? TOW.muted : TOW.goldDeep,
                          fontFamily: towFont.display,
                          fontWeight: 600,
                          fontSize: 13,
                        }}
                      >
                        {full ? 'In progress' : 'Join'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 13.5, color: TOW.muted }}>
                No open games right now. Enter a code above, or host one.
              </div>
            )}
              </>
            )}
          </div>
        )}

        {error && <div style={{ fontFamily: towFont.serif, fontSize: 13.5, color: TOW.blood, marginTop: 12 }}>{error}</div>}

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button onClick={startSolo} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: towFont.serif, fontSize: 13.5, color: TOW.muted, textDecoration: 'underline' }}>
            or set up both armies on this device (offline)
          </button>
        </div>
      </div>
    </div>
  );
}
