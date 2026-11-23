import { useMemo, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { getCachedCampaign } from '../../lib/campaign';
import {
  alleGenerals, generalOpId, isTafelTestCode, killsVoorStoel, raidersVan, TAFEL_TEAMNAMEN, TEAM_VAN_KANT, tafelInfo,
  tafelUitslagMelden, veteraanVoorStoel, type TafelUitkomst, type TafelUitslag,
} from '../../lib/tafel';
import { gespeeldeRondes, leesTempo, raiderBeurten, tempoLogboek, type EindReden } from '../../lib/tempo';
import { TEAM_STOELEN, teamVan, type Team } from '../../lib/teams';
import type { VpResultaat } from '../../lib/victoryPoints';
import type { Army, TeamStoel } from '../../types';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`;

const FOUT_TEKST: Record<string, string> = {
  AL_VERWERKT: 'This table already has a recorded result in the campaign.',
  LEGERS_NIET_GELOCKT: 'Not every general at this table has locked his army in the campaign app yet. Lock all four, then report again.',
  ONGELDIGE_VP: 'The Victory Points could not be read. Check the score and try again.',
  ONBEKENDE_CODE: "This table's code isn't known to the campaign.",
  GEEN_TAFEL: 'This code is not an Act 4 table.',
};

/**
 * HET EINDE VAN EEN ACT 4-TAFEL (blok E, 24-11-2026): de eindvragen en de melding bij de campagne
 * (contract 2, `towc_tafel_uitslag_companion`).
 *
 * Eindvragen: wie heeft het plein aan het eind (150 VP), wie controleert het artefact (welke general, of
 * niemand; 200 VP voor zijn kant), en per raider of hij aan het eind een unit van Unit Strength 10 of
 * meer op het plein had. Het plein en het artefact zetten meteen de scenario-posten `ks-plaza-end` en
 * `ks-artefact` op de gedeelde tracker, dus de VP hierboven lopen mee en alle vier de telefoons zien het.
 *
 * Melden doet de rapporteur van de tafel (contract 1 `rapporteur`); een andere speler aan tafel mag het
 * ook, na een extra bevestiging. In de tafeltest wordt er NIETS verstuurd: je ziet het object dat zou gaan.
 */
export function TafelEinde({ res, legers }: { res: VpResultaat; legers: Record<TeamStoel, Army | null> }) {
  const { code, tracker, setTracker, stoelen, stoel } = useGame();
  const info = tafelInfo(code);
  const test = isTafelTestCode(code);
  const tempo = leesTempo(tracker.tempo);
  const einde = tracker.tafelEinde ?? {};
  const [melden, setMelden] = useState<'idle' | 'bezig' | 'klaar'>('idle');
  const [fout, setFout] = useState<string | null>(null);
  const [uitkomst, setUitkomst] = useState<TafelUitkomst | null>(null);
  const [bevestigd, setBevestigd] = useState(false);
  const [toonObject, setToonObject] = useState(test);

  const heeftPost = (id: string) => !!(info?.scenario?.scenarioBonus as { posten?: { id?: string }[] } | undefined)?.posten?.some((p) => p.id === id);
  const pleinEind: Team | null | undefined = (tracker.bonus?.host?.scenario?.['ks-plaza-end'] ?? 0) > 0 ? 'A' : (tracker.bonus?.guest?.scenario?.['ks-plaza-end'] ?? 0) > 0 ? 'B' : einde.plein === null ? null : undefined;

  /** Een eind-post op het ene team aan, op het andere uit (aan het eind hoort hij bij hoogstens één kant). */
  const zetEindPost = (id: string, team: Team | null, extra: Partial<NonNullable<typeof tracker.tafelEinde>>) => {
    const bonus = { ...(tracker.bonus ?? {}) };
    for (const [st, t] of [['host', 'A'], ['guest', 'B']] as const) {
      bonus[st] = { ...(bonus[st] ?? {}), scenario: { ...(bonus[st]?.scenario ?? {}), [id]: team === t ? 1 : 0 } };
    }
    setTracker({ ...tracker, bonus, tafelEinde: { ...einde, ...extra } });
  };

  const generals = info ? alleGenerals(info) : [];
  const raiders = raidersVan(info);
  const eindReden: EindReden = tempo?.einde?.reden ?? 'anders';
  const rondes = Math.max(gespeeldeRondes(tempo), tracker.round ?? 0);

  // Wie zit waar: de campagne-speler per stoel (uit de stoelen-kolom).
  const spelerVan = (s: TeamStoel): string | null => stoelen[s]?.general ?? null;
  const winnaarTeam: Team | null = res.winnaar === 'host' ? 'A' : res.winnaar === 'guest' ? 'B' : null;

  const uitslag: TafelUitslag = useMemo(() => {
    const kills: Record<string, unknown>[] = [];
    const veteraan: Record<string, unknown>[] = [];
    for (const s of TEAM_STOELEN) {
      const speler = spelerVan(s);
      if (!speler || !legers[s]) continue;
      for (const k of killsVoorStoel(tracker, legers[s], s)) kills.push({ ...k, speler });
      for (const r of veteraanVoorStoel(tracker, legers, s, winnaarTeam === teamVan(s))) veteraan.push({ ...r.vet, redenen: r.redenen, speler });
    }
    const rd: TafelUitslag['raiders'] = {};
    for (const r of raiders) rd[r.id] = { beurten: raiderBeurten(tempo, r.id), eind: einde.raiders?.[r.id] === true };
    return {
      vp: { wardens: res.hostVp, unchained: res.guestVp },
      artefactControleur: einde.artefact ?? null,
      raiders: rd,
      rondes,
      eindReden,
      tempo: tempoLogboek(tempo),
      kills,
      veteraan,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracker, legers, stoelen, res.hostVp, res.guestVp, winnaarTeam]);

  if (!info) return null;

  // Wie meldt: de rapporteur. Ben ik dat? (mijn stoel → mijn general; of mijn gekoppelde campagnespeler)
  const mijnGeneral = (stoel ? spelerVan(stoel) : null) ?? getCachedCampaign()?.context?.speler.id ?? null;
  const rapporteur = generalOpId(info, info.rapporteur);
  const ikMeld = !!mijnGeneral && mijnGeneral === info.rapporteur;
  const legersCompleet = TEAM_STOELEN.filter((s) => !!spelerVan(s)).every((s) => !!legers[s]);
  const vragenKlaar = pleinEind !== undefined && (!heeftPost('ks-artefact') || einde.artefact !== undefined);

  const meld = async () => {
    if (!code) return;
    if (test) { setToonObject(true); setMelden('klaar'); return; }
    setMelden('bezig');
    setFout(null);
    try {
      const r = await tafelUitslagMelden(code, uitslag);
      if (!r.ok) { setFout(FOUT_TEKST[r.fout ?? ''] ?? r.fout ?? 'Could not report the result.'); setMelden('idle'); return; }
      setUitkomst(r);
      setMelden('klaar');
    } catch (e) {
      setFout((e as Error).message || 'Could not report the result.');
      setMelden('idle');
    }
  };

  const keuze = (aan: boolean): React.CSSProperties => ({ flex: '1 1 0', minWidth: 0, padding: '9px 6px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${aan ? TOW.goldDeep : TOW.lineStrong}`, background: aan ? TOW.cardLt : 'transparent', color: TOW.ink, fontFamily: display, fontWeight: 700, fontSize: 13 });

  return (
    <div data-testid="tafel-einde" style={{ border: `1px solid ${TOW.lineStrong}`, borderRadius: 12, padding: 12, background: TOW.panel }}>
      <div style={{ ...eb, fontSize: 9, color: TOW.goldDeep }}>Table {info.tafel} · {info.district.naam}</div>
      <div style={{ fontFamily: display, fontWeight: 700, fontSize: 17, color: TOW.ink, margin: '3px 0 8px' }}>End of the battle</div>

      <Vraag titel="Who holds the plaza at the end? (150 VP)">
        <div style={{ display: 'flex', gap: 6 }}>
          <button data-testid="eind-plein-A" onClick={() => zetEindPost('ks-plaza-end', 'A', { plein: 'A' })} aria-pressed={pleinEind === 'A'} style={keuze(pleinEind === 'A')}>Wardens</button>
          <button data-testid="eind-plein-B" onClick={() => zetEindPost('ks-plaza-end', 'B', { plein: 'B' })} aria-pressed={pleinEind === 'B'} style={keuze(pleinEind === 'B')}>Unchained</button>
          <button data-testid="eind-plein-niemand" onClick={() => zetEindPost('ks-plaza-end', null, { plein: null })} aria-pressed={pleinEind === null} style={keuze(pleinEind === null)}>Nobody</button>
        </div>
      </Vraag>

      {heeftPost('ks-artefact') && (
        <Vraag titel={`Who controls ${info.artefact?.naam ?? 'the artefact'} at the end? (200 VP)`}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {generals.map((g) => (
              <button key={g.id} data-testid={`eind-artefact-${g.id}`} onClick={() => zetEindPost('ks-artefact', TEAM_VAN_KANT[g.kant], { artefact: g.id })} aria-pressed={einde.artefact === g.id} style={{ ...keuze(einde.artefact === g.id), flex: '1 1 40%' }}>
                {g.naam} <span style={{ fontWeight: 400, color: TOW.muted }}>· {TAFEL_TEAMNAMEN[TEAM_VAN_KANT[g.kant]]}</span>
              </button>
            ))}
            <button data-testid="eind-artefact-niemand" onClick={() => zetEindPost('ks-artefact', null, { artefact: null })} aria-pressed={einde.artefact === null} style={{ ...keuze(einde.artefact === null), flex: '1 1 40%' }}>Nobody</button>
          </div>
          <div style={{ fontFamily: serif, fontSize: 11.5, color: TOW.muted, marginTop: 4 }}>Like an objective: the closest unit within 6″; with several, the highest Unit Strength.</div>
        </Vraag>
      )}

      {raiders.map((r) => (
        <Vraag key={r.id} titel={`${r.naam} (raider)`}>
          <label data-testid={`eind-raider-${r.id}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: serif, fontSize: 13.5, color: TOW.parch, cursor: 'pointer' }}>
            <input type="checkbox" checked={einde.raiders?.[r.id] === true} onChange={(e) => setTracker({ ...tracker, tafelEinde: { ...einde, raiders: { ...(einde.raiders ?? {}), [r.id]: e.target.checked } } })} style={{ marginTop: 3 }} />
            <span>At the end, his side held the plaza and he had a unit of Unit Strength 10 or more on it. Turns counted during the battle: {raiderBeurten(tempo, r.id)}.</span>
          </label>
        </Vraag>
      ))}

      <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim, margin: '8px 0' }}>
        Wardens {res.hostVp} VP · Unchained {res.guestVp} VP · {rondes} round{rondes === 1 ? '' : 's'} · {eindReden === 'zes-rondes' ? 'six rounds played' : eindReden === 'eindtijd' ? 'end time reached' : 'ended at the table'}
        {!tempo?.einde && ' (the timer is still running: press Battle ended there to log why it ended)'}
      </div>

      {test && (
        <div data-testid="tafeltest-melding" style={{ padding: '7px 9px', borderRadius: 8, background: 'rgba(180,83,9,0.12)', border: '1px solid #b45309', fontFamily: serif, fontSize: 12.5, color: TOW.parch, marginBottom: 8 }}>
          Table test: nothing is sent to the campaign. “Report” shows the object that a real table would send.
        </div>
      )}
      {!legersCompleet && <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.blood, marginBottom: 6 }}>Not every seated general has an army in this battle yet: their kills and veterans are left out.</div>}
      {!vragenKlaar && <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.muted, marginBottom: 6 }}>Answer the end questions first.</div>}

      {melden === 'klaar' && !test ? (
        <div data-testid="tafel-gemeld" style={{ fontFamily: serif, fontSize: 13.5, color: TOW.parch, lineHeight: 1.5 }}>
          <strong>Reported to the campaign.</strong> {uitkomst?.res ? `Result: ${uitkomst.res}. ` : ''}
          {uitkomst?.district ? `The district goes to the ${uitkomst.district === 'stoppen' ? 'Wardens' : uitkomst.district === 'bevrijden' ? 'Unchained' : String(uitkomst.district)}. ` : 'A draw: the district does not change hands. '}
          {uitkomst?.artefactNaar ? `The artefact goes to ${generalOpId(info, uitkomst.artefactNaar)?.naam ?? uitkomst.artefactNaar}. ` : ''}
          {uitkomst?.fame && Object.keys(uitkomst.fame).length > 0 && (
            <span>Fame: {Object.entries(uitkomst.fame).map(([id, f]) => `${generalOpId(info, id)?.naam ?? id} ${f >= 0 ? '+' : ''}${f}`).join(', ')}.</span>
          )}
        </div>
      ) : (
        <>
          {!ikMeld && !test && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: serif, fontSize: 13, color: TOW.parchDim, marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={bevestigd} onChange={(e) => setBevestigd(e.target.checked)} style={{ marginTop: 3 }} />
              <span>The reporter for this table is {rapporteur?.naam ?? 'another general'}. Report anyway, because everyone at the table agrees with this result.</span>
            </label>
          )}
          <button
            data-testid="tafel-meld"
            disabled={melden === 'bezig' || !vragenKlaar || (!ikMeld && !test && !bevestigd)}
            onClick={meld}
            style={{ width: '100%', padding: '12px 16px', borderRadius: 11, border: 'none', background: goldGrad, color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: melden === 'bezig' || !vragenKlaar || (!ikMeld && !test && !bevestigd) ? 0.5 : 1 }}
          >
            {melden === 'bezig' ? 'Reporting…' : test ? 'Report (table test: show what would be sent)' : 'Report the result to the campaign'}
          </button>
          {fout && <div data-testid="tafel-meld-fout" style={{ marginTop: 6, fontFamily: serif, fontSize: 13, color: TOW.blood }}>{fout}</div>}
        </>
      )}

      <button onClick={() => setToonObject((v) => !v)} style={{ marginTop: 8, border: 'none', background: 'none', color: TOW.muted, fontFamily: serif, fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
        {toonObject ? 'Hide' : 'Show'} what is sent
      </button>
      {toonObject && (
        <pre data-testid="tafel-uitslag-object" style={{ marginTop: 6, maxHeight: 280, overflow: 'auto', fontSize: 10.5, lineHeight: 1.35, background: TOW.cardLt, border: `1px solid ${TOW.line}`, borderRadius: 8, padding: 8, color: TOW.ink, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {JSON.stringify(uitslag, null, 2)}
        </pre>
      )}
    </div>
  );
}

function Vraag({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: display, fontWeight: 600, fontSize: 13.5, color: TOW.ink, marginBottom: 5 }}>{titel}</div>
      {children}
    </div>
  );
}
