import { useEffect, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { TurnsIcon, MapIcon, FlaskIcon } from '../../design/icons';
import { setPersisted } from '../../store';
import { getCachedCampaign, getCampaignCode } from '../../lib/campaign';
import { myCampaignBattles, type CampaignBattleSummary } from '../../lib/campaignBattle';
import { TEST_BATTLE_CODE, TEST_BATTLE_CONFIG_KEY, testBattleLijsten, testToolsAan } from '../../lib/testBattle';

// HET STARTSCHERM VAN DE GAME-TAB — en verder zo leeg mogelijk.
//
// Joost (13-09): "Bij Game wil je nu de keuze hebben tussen open campaign battle of start a new
// battle." Precies dat, en niets anders. Het oude scherm vroeg meteen om je naam, je lijst, host of
// join, Battle March ja/nee én een battlefield-knop die naar een heel andere wizard leidde — vijf
// beslissingen door elkaar, vóórdat je had gezegd wát je wilde gaan doen. Alles wat daarvan overeind
// moest blijven is verhuisd naar de wizard (NewBattleWizard), die de vragen op volgorde stelt.
//
// WAT HIER WEL BLIJFT:
//  • de speelklare CAMPAGNE-battles (die komen van de server en horen nergens anders thuis), plus een
//    handmatig codeveld voor als je een battlecode doorgestuurd kreeg;
//  • de TESTBATTLE achter `testToolsAan()` — alleen zichtbaar met `?testtools=1`, en dus voor de
//    eigenaar. Hij staat klein en onderaan: het is gereedschap, geen ingang naar een potje.
//
// GEEN "CONTINUE"-KNOP. Die zou hier nooit te zien zijn: zodra `useGame().seat` bestaat routeert
// GameMode je rechtstreeks naar de lobby of de game, dus dit scherm wordt in dat geval niet eens
// gerenderd. Een knop die alleen bestaat om onbereikbaar te zijn, is precies het soort ruis dat we
// hier aan het wegnemen zijn — doorspelen gebeurt vanzelf.

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`;

export function GameStart({ onNewBattle }: { onNewBattle: () => void }) {
  const [campBattles, setCampBattles] = useState<CampaignBattleSummary[]>([]);
  const [battleCode, setBattleCode] = useState('');
  const [testOpen, setTestOpen] = useState(false);
  const [testAanv, setTestAanv] = useState('');
  const [testVerd, setTestVerd] = useState('');
  const testLijsten = testBattleLijsten();
  const myPlayerId = getCachedCampaign()?.context?.speler?.id ?? null;
  const heeftCampagne = !!getCampaignCode() && !!myPlayerId;

  // Speelklare campagne-battles ophalen als deze Companion aan een campagne-profiel gekoppeld is.
  useEffect(() => {
    if (!heeftCampagne || !myPlayerId) return;
    let alive = true;
    myCampaignBattles(myPlayerId).then((bs) => { if (alive) setCampBattles(bs); }).catch(() => {});
    return () => { alive = false; };
  }, [heeftCampagne, myPlayerId]);

  const labelStyle: React.CSSProperties = { ...eb, fontSize: 9, color: TOW.muted, marginBottom: 5, display: 'block' };
  const inputStyle: React.CSSProperties = {
    width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt,
    color: TOW.ink, padding: '10px 12px', fontFamily: towFont.display, fontSize: 15,
    letterSpacing: '0.3em', textTransform: 'uppercase', boxSizing: 'border-box',
  };
  const goldBtn: React.CSSProperties = {
    border: 'none', borderRadius: 11, cursor: 'pointer', padding: '13px 18px', background: goldGrad,
    color: TOW.onGrad, fontFamily: towFont.display, fontWeight: 700, fontSize: 15, width: '100%',
  };

  const openCode = () => {
    const c = battleCode.trim().toUpperCase();
    if (c) setPersisted('tow:campaign-battle', c);
  };

  return (
    <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 40px' }}>
        <h1 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 26, color: TOW.ink, margin: '4px 0 2px' }}>Game</h1>
        <p style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 15, color: TOW.parchDim, margin: '0 0 20px' }}>
          Open a battle from your campaign, or set up a new one.
        </p>

        {/* ── Campagne-battles ─────────────────────────────────────────────────────────────────── */}
        {heeftCampagne && (
          <div style={{ marginBottom: 14, padding: '14px 15px', borderRadius: 14, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.09)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: campBattles.length ? 10 : 6 }}>
              <span aria-hidden style={{ flexShrink: 0, color: TOW.goldDeep }}><TurnsIcon size={20} /></span>
              <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 17, color: TOW.goldDeep }}>Open campaign battle</span>
            </div>

            {campBattles.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {campBattles.map((b) => {
                  const opp = myPlayerId && b.aanvaller.id === myPlayerId ? b.verdediger : b.aanvaller;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setPersisted('tow:campaign-battle', b.code)}
                      style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 11, cursor: 'pointer', border: `1px solid ${TOW.goldDeep}`, background: TOW.cardLt }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontFamily: towFont.display, fontWeight: 700, fontSize: 15, color: TOW.goldDeep }}>vs {opp.naam || 'opponent'}</span>
                        <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted }}>{b.scenarioNaam ? `${b.scenarioNaam} · ` : ''}both armies locked — open to play</span>
                      </span>
                      <span aria-hidden style={{ color: TOW.goldDeep, fontSize: 18, flexShrink: 0 }}>›</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 13, color: TOW.muted, margin: '0 0 12px', lineHeight: 1.4 }}>
                No campaign battle is ready to play right now.
              </div>
            )}

            {/* Een battlecode met de hand. Je krijgt zo'n code doorgestuurd (of je opent 'm normaal via
                de link), en dan wil je niet afhankelijk zijn van of het lijstje hierboven hem al kent. */}
            <label style={labelStyle}>Battle code</label>
            <div style={{ display: 'flex', gap: 7 }}>
              <input
                value={battleCode}
                onChange={(e) => setBattleCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') openCode(); }}
                placeholder="e.g. 4FQ7KP"
                maxLength={12}
                aria-label="Campaign battle code"
                style={inputStyle}
              />
              <button
                onClick={openCode}
                disabled={!battleCode.trim()}
                style={{ flexShrink: 0, padding: '0 16px', borderRadius: 10, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.14)', color: TOW.goldDeep, cursor: battleCode.trim() ? 'pointer' : 'default', opacity: battleCode.trim() ? 1 : 0.5, fontFamily: towFont.display, fontWeight: 600, fontSize: 13.5 }}
              >Open</button>
            </div>
          </div>
        )}

        {/* ── Nieuwe battle ────────────────────────────────────────────────────────────────────── */}
        <button
          onClick={onNewBattle}
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '18px 16px', borderRadius: 14, cursor: 'pointer', border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.14)' }}
        >
          <span aria-hidden style={{ flexShrink: 0, color: TOW.goldDeep }}><MapIcon size={26} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: towFont.display, fontWeight: 700, fontSize: 18, color: TOW.goldDeep }}>New battle</span>
            <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 13, color: TOW.muted, lineHeight: 1.35 }}>
              Solo, host or join · battlefield · armies — one step at a time.
            </span>
          </span>
          <span aria-hidden style={{ color: TOW.goldDeep, fontSize: 20, flexShrink: 0 }}>›</span>
        </button>

        {/* ── Testgereedschap (alleen met ?testtools=1) ────────────────────────────────────────── */}
        {testToolsAan() && testLijsten.length >= 1 && (
          <div style={{ marginTop: 26, paddingTop: 14, borderTop: `1px solid ${TOW.line}` }}>
            <button
              onClick={() => setTestOpen((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 11px', borderRadius: 10, cursor: 'pointer', border: `1px dashed ${TOW.lineStrong}`, background: 'transparent' }}
            >
              <span aria-hidden style={{ flexShrink: 0, color: TOW.muted }}><FlaskIcon size={16} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: towFont.display, fontWeight: 600, fontSize: 13, color: TOW.muted }}>Test campaign battle</span>
              </span>
              <span aria-hidden style={{ color: TOW.faint, fontSize: 15, flexShrink: 0 }}>{testOpen ? '⌄' : '›'}</span>
            </button>
            {testOpen && (
              <div style={{ padding: '12px 4px 0' }}>
                <label style={labelStyle}>Attacker — your list</label>
                <select value={testAanv} onChange={(e) => setTestAanv(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, fontFamily: towFont.serif, fontSize: 13.5, marginBottom: 8 }}>
                  <option value="">Choose a list…</option>
                  {testLijsten.map((tl) => <option key={tl.id} value={tl.id}>{tl.name}</option>)}
                </select>
                <label style={labelStyle}>Defender — the opposing list</label>
                <select value={testVerd} onChange={(e) => setTestVerd(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, fontFamily: towFont.serif, fontSize: 13.5, marginBottom: 8 }}>
                  <option value="">Choose a list…</option>
                  {testLijsten.map((tl) => <option key={tl.id} value={tl.id}>{tl.name}</option>)}
                </select>
                <button
                  disabled={!testAanv || !testVerd}
                  onClick={() => {
                    setPersisted(TEST_BATTLE_CONFIG_KEY, { aanvId: testAanv, verdId: testVerd });
                    setPersisted('tow:campaign-battle', TEST_BATTLE_CODE);
                  }}
                  style={{ ...goldBtn, opacity: (!testAanv || !testVerd) ? 0.45 : 1, cursor: (!testAanv || !testVerd) ? 'default' : 'pointer' }}
                >Open test battle</button>
                <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.muted, margin: '8px 2px 0' }}>
                  Both sides may be the same list — handy for trying the flow on your own. Reporting the
                  result does nothing: the campaign does not know this battle.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
