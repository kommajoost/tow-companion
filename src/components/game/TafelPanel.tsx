import { useEffect, useMemo, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { getCachedCampaign } from '../../lib/campaign';
import { isTestBattleCode } from '../../lib/testBattle';
import { isScenarioTestCode } from '../../lib/scenarioTest';
import { mockLeger } from '../../lib/scenarioLab';
import {
  alleGenerals, bewaarTafel, isTafelTestCode, KANT_NAAM, stoelLabel, stoelVoor, tafelAlsBattle, tafelByCode, tafelInfo,
  type TafelGeneral, type TafelInfo, type TafelKantSleutel,
} from '../../lib/tafel';
import { ArmyListPicker } from './ArmyListPicker';
import { CampaignBattlePanel } from './CampaignBattlePanel';
import { ScenarioKaart } from './CampaignScenarioBits';
import type { Army, TeamStoel } from '../../types';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`;

/**
 * ACT 4 (blok E, 24-11-2026): een campagnecode openen. Is het een Act 4-tafel (`towc_tafel_by_code` ok),
 * dan gaat dit toestel aan die tafel zitten (de gedeelde battle op de TAFELCODE) en kiest de speler
 * daarna zijn stoel. Anders is het een gewone battle en neemt het bestaande briefing-scherm het over.
 * De testbattle en de scenario-test slaan de vraag over: die zijn nooit een tafel.
 */
export function TafelOfCampagne({ code, onDismiss }: { code: string; onDismiss: () => void }) {
  const { openTafel, code: huidigeCode, seat } = useGame();
  const nooitTafel = isTestBattleCode(code) || isScenarioTestCode(code);
  const [geenTafel, setGeenTafel] = useState(nooitTafel);

  useEffect(() => {
    if (nooitTafel) return;
    let leeft = true;
    tafelByCode(code)
      .then((info) => {
        if (!leeft) return;
        const tafelCode = isTafelTestCode(code) ? code.trim().toUpperCase() : info.code;
        // Zit dit toestel al aan deze tafel (de link van je eigen battle, terwijl je al speelt)? Dan niets
        // opnieuw openen: alleen de link wegklikken.
        if (!(seat === 'tafel' && huidigeCode === tafelCode)) openTafel(info, tafelCode);
        onDismiss();
      })
      .catch(() => { if (leeft) setGeenTafel(true); });
    return () => { leeft = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, nooitTafel]);

  if (geenTafel) return <CampaignBattlePanel code={code} onDismiss={onDismiss} />;
  return (
    <div className="tow-field" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: serif, fontStyle: 'italic', color: TOW.muted }}>
      Loading the battle…
    </div>
  );
}

/** Het leger van een general: in de tafeltest het mock-leger van het scenario lab, anders zijn eigen
 *  gelockte campagne-lijst op dit toestel (dezelfde picker als bij een 1-tegen-1-battle). */
function LegerLader({ g, onPick }: { g: TafelGeneral; onPick: (a: Army) => void }) {
  const mock = g.mock ? mockLeger(g.mock) : null;
  if (mock) {
    return <ArmyListPicker key={`mock-${g.id}`} onPick={onPick} lijsten={[mock.lijst]} lockedListName={mock.lijst.name} lockedListArmy={mock.lijst.army} autoPick stil />;
  }
  return (
    <ArmyListPicker
      key={`lijst-${g.id}`}
      onPick={onPick}
      label={`Choose ${g.naam}'s army list for this battle`}
      lockedListName={g.lijst?.naam ?? null}
      lockedListArmy={g.lijst?.leger ?? null}
      campaignPlayerId={g.id}
      autoPick
      stil
    />
  );
}

const FOUT_TEKST: Record<string, string> = {
  STOEL_BEZET: 'Someone else already sits here on another device.',
  GENERAL_AL_GEZETEN: 'This general is already seated on another device.',
  GEEN_CODE: 'This table has no code.',
};

/**
 * DE STOELKEUZE (blok E). Elke speler kiest op zijn eigen telefoon zijn general uit de vier en een van
 * de twee plekken van zijn kant (wie first is, beslissen de spelers aan tafel). Wie waar zit staat live
 * in beeld (realtime op `tow_games.stoelen`); een stoel van een ander toestel neem je alleen over na
 * een tweede, expliciete tik.
 */
export function TafelStoelKiezer() {
  const { code, stoelen, claimStoel, busy, leaveGame } = useGame();
  const [info, setInfo] = useState<TafelInfo | null>(() => tafelInfo(code));
  const test = isTafelTestCode(code);

  // Een echte tafel opnieuw ophalen: tussen de eerste keer openen en nu kunnen er legers gelockt zijn.
  useEffect(() => {
    if (!code || test) return;
    let leeft = true;
    tafelByCode(code).then((i) => { if (leeft) { setInfo(i); bewaarTafel(i); } }).catch(() => { /* de bewaarde blijft staan */ });
    return () => { leeft = false; };
  }, [code, test]);

  const generals = useMemo(() => (info ? alleGenerals(info) : []), [info]);
  // Wie ben ik? De gekoppelde campagnespeler, als die aan deze tafel zit.
  const ikId = getCachedCampaign()?.context?.speler.id ?? null;
  const [gekozen, setGekozen] = useState<string | null>(null);
  useEffect(() => {
    if (gekozen || !generals.length) return;
    if (ikId && generals.some((g) => g.id === ikId)) setGekozen(ikId);
  }, [generals, ikId, gekozen]);
  const g = generals.find((x) => x.id === gekozen) ?? null;
  const kant: TafelKantSleutel | null = g ? g.kant : null;

  const bezetDoor = (s: TeamStoel) => stoelen[s];
  const zitOp = (id: string): TeamStoel | null => (Object.entries(stoelen).find(([, b]) => b?.general === id)?.[0] as TeamStoel | undefined) ?? null;
  const [plek, setPlek] = useState<1 | 2 | null>(null);
  // Standaard de eerste vrije plek van de eigen kant (of de plek waar deze general al zit).
  useEffect(() => {
    if (!g || !kant) { setPlek(null); return; }
    const al = zitOp(g.id);
    if (al) { setPlek(al === 'host' || al === 'guest' ? 1 : 2); return; }
    setPlek(!bezetDoor(stoelVoor(kant, 1)) ? 1 : !bezetDoor(stoelVoor(kant, 2)) ? 2 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gekozen]);
  const stoel = kant && plek ? stoelVoor(kant, plek) : null;

  const [leger, setLeger] = useState<Army | null>(null);
  useEffect(() => { setLeger(null); }, [gekozen]);
  const [fout, setFout] = useState<{ code: string; door?: string } | null>(null);

  if (!code) return null;
  if (!info) {
    return (
      <Wrap>
        <p style={{ fontFamily: serif, color: TOW.parch }}>This table could not be loaded. Open the battle link from the campaign again.</p>
        <button onClick={leaveGame} style={knopLicht}>Back</button>
      </Wrap>
    );
  }

  const neemPlaats = async (actie: 'claim' | 'overnemen') => {
    if (!g || !stoel) return;
    setFout(null);
    const r = await claimStoel(stoel, { id: g.id, naam: g.naam }, leger, g.veteranen, actie);
    if (!r.ok) setFout({ code: r.fout ?? 'ONBEKEND', door: r.door?.naam || undefined });
  };

  const battle = tafelAlsBattle(info, code);
  const meerDanTwee = (['wardens', 'unchained'] as const).filter((k) => info.kanten[k].generals.length > 2);

  return (
    <Wrap>
      <div style={{ ...eb, fontSize: 9, color: TOW.goldDeep }}>Act {info.fase} · The Battle for the Districts · Table {info.tafel}</div>
      <h2 style={{ margin: '4px 0 2px', fontFamily: display, fontWeight: 700, fontSize: 22, color: TOW.ink }}>{info.district.naam}</h2>
      <p style={{ margin: '0 0 12px', fontFamily: serif, fontSize: 13.5, color: TOW.parchDim, lineHeight: 1.45 }}>
        Two against two, {info.cap} points per general. One shared battle for the whole table: every player keeps track of his own army on his own phone, and everyone sees the same round, timer and score.
        {test && <strong style={{ color: '#b45309' }}> Table test: nothing goes to the campaign.</strong>}
      </p>

      <ScenarioKaart battle={battle} mySeat={kant === 'wardens' ? 'host' : kant === 'unchained' ? 'guest' : null} />

      <Kop>1 · Who are you?</Kop>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {(['wardens', 'unchained'] as const).map((k) => (
          <div key={k} style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 4 }}>{KANT_NAAM[k]}</div>
            {info.kanten[k].generals.map((gen) => {
              const s = zitOp(gen.id);
              const aan = gen.id === gekozen;
              return (
                <button key={gen.id} data-testid={`tafel-general-${gen.id}`} onClick={() => setGekozen(gen.id)} aria-pressed={aan} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginBottom: 5, padding: '9px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', border: `1px solid ${aan ? TOW.goldDeep : TOW.line}`, background: aan ? TOW.cardLt : 'transparent' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: gen.kleur, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: display, fontWeight: 700, fontSize: 14.5, color: TOW.ink }}>{gen.naam}{gen.raider ? ' · raider' : ''}</span>
                    <span style={{ display: 'block', fontFamily: serif, fontSize: 12, color: TOW.muted }}>
                      {gen.factie.replace(/-/g, ' ')}{gen.gelockt ? '' : ' · army not locked yet'}{s ? ` · seated: ${stoelLabel(s).split(' · ')[1]}` : ''}
                    </span>
                  </span>
                </button>
              );
            })}
            {info.kanten[k].generals.length < 2 && (
              <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12, color: TOW.muted }}>Only {info.kanten[k].generals.length} general on this side: the other seat stays empty.</div>
            )}
          </div>
        ))}
      </div>
      {meerDanTwee.length > 0 && (
        <p style={{ fontFamily: serif, fontSize: 12.5, color: TOW.blood }}>More than two generals on the {meerDanTwee.map((k) => KANT_NAAM[k]).join(' and ')} side: the Companion has two seats per side.</p>
      )}

      {g && kant && (
        <>
          <Kop>2 · Which seat?</Kop>
          <p style={{ margin: '0 0 6px', fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>The players at the table decide who is the first general of the {KANT_NAAM[kant]}.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {([1, 2] as const).map((p) => {
              const s = stoelVoor(kant, p);
              const b = bezetDoor(s);
              const aan = plek === p;
              return (
                <button key={p} data-testid={`tafel-plek-${s}`} onClick={() => setPlek(p)} aria-pressed={aan} style={{ flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer', border: `1px ${b && b.general !== g.id ? 'dashed' : 'solid'} ${aan ? TOW.goldDeep : TOW.line}`, background: aan ? TOW.cardLt : 'transparent', textAlign: 'left' }}>
                  <span style={{ display: 'block', fontFamily: display, fontWeight: 700, fontSize: 14, color: TOW.ink }}>{p === 1 ? '1st general' : '2nd general'}</span>
                  <span style={{ display: 'block', fontFamily: serif, fontSize: 12, color: b ? TOW.parchDim : TOW.muted }}>{b ? `Taken by ${b.naam || 'someone'}` : 'Free'}</span>
                </button>
              );
            })}
          </div>

          <Kop>3 · Your army</Kop>
          {!info.alleGelockt && !test && (
            <p style={{ margin: '0 0 6px', fontFamily: serif, fontSize: 12.5, color: TOW.blood }}>Not every general at this table has locked his army yet. The result can only be reported once all four are locked.</p>
          )}
          <LegerLader g={g} onPick={setLeger} />
          <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.muted, margin: '6px 0 0' }}>
            {leger ? `${leger.name}: ${leger.units.length} units loaded.` : 'Loading the army…'}
          </div>

          {fout && (
            <div data-testid="tafel-stoel-fout" style={{ marginTop: 10, padding: '9px 11px', borderRadius: 10, border: `1px solid ${TOW.blood}`, background: 'rgba(160,40,30,0.08)', fontFamily: serif, fontSize: 13, color: TOW.parch }}>
              {FOUT_TEKST[fout.code] ?? fout.code}{fout.door ? ` (${fout.door})` : ''}
              {(fout.code === 'STOEL_BEZET' || fout.code === 'GENERAL_AL_GEZETEN') && (
                <div style={{ marginTop: 6 }}>
                  Changed phones, or is the other device gone? Then take the seat over. The other device stops tracking this seat.
                  <button data-testid="tafel-overnemen" onClick={() => neemPlaats('overnemen')} disabled={busy} style={{ ...knopLicht, marginTop: 6, color: TOW.blood, borderColor: TOW.blood }}>Take over this seat</button>
                </div>
              )}
            </div>
          )}

          <button
            data-testid="tafel-neem-plaats"
            onClick={() => neemPlaats('claim')}
            disabled={busy || !stoel}
            style={{ marginTop: 14, width: '100%', padding: '13px 18px', borderRadius: 11, border: 'none', background: goldGrad, color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: busy || !stoel ? 0.5 : 1 }}
          >
            {busy ? 'Taking the seat…' : stoel ? `Sit down: ${stoelLabel(stoel)}${leger ? '' : ' (army later)'}` : 'Pick a seat'}
          </button>
        </>
      )}

      <button onClick={leaveGame} style={{ ...knopLicht, marginTop: 18 }}>Leave this table</button>
    </Wrap>
  );
}

const knopLicht: React.CSSProperties = { border: `1px solid ${TOW.lineStrong}`, borderRadius: 9, background: 'transparent', color: TOW.muted, cursor: 'pointer', padding: '7px 12px', fontFamily: display, fontSize: 12.5 };

function Kop({ children }: { children: React.ReactNode }) {
  return <div style={{ ...eb, fontSize: 9, color: TOW.goldDeep, margin: '18px 0 8px' }}>{children}</div>;
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '18px 16px 40px' }}>{children}</div>
    </div>
  );
}
