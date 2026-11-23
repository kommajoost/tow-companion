import { useEffect, useMemo, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import {
  anderTeam, gespeeldeRondes, klok, leegTempo, leesTempo, MAX_RONDES, pasToe, pleinDelta, STANDAARD_INSTELLING,
  tempoBeeld, uurMin, type EindReden, type PleinHouder, type TempoActie, type TempoInstelling,
} from '../../lib/tempo';
import { artefactTeam, raidersVan, TAFEL_TEAMNAMEN, type TafelInfo } from '../../lib/tafel';
import { ARTEFACT_REGELS, AURA_ACT4, SOORT, tabelVoorArtefact } from '../../lib/artefactTabellen';
import type { TrackerPatch } from '../../lib/trackerPatch';
import type { Team } from '../../lib/teams';
import type { GameTracker } from '../../types';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`;
const KLEUR = { groen: '#3f7a3a', oranje: '#b8741a', rood: '#a3271c' } as const;

/** De plein-teller van de sheet (King of the Shrine: `ks-plaza-turn`), of null als het scenario hem niet
 *  heeft. Eén gedeelde teller per tafel, per team bijgehouden op de hoofdstoel (host = Wardens, guest =
 *  Unchained), precies zoals berekenTeamVictory hem leest. */
function pleinPost(info: TafelInfo | null): { id: string; max: number } | null {
  const posten = (info?.scenario?.scenarioBonus as { posten?: { id?: string; soort?: string; kant?: string; max?: number }[] } | undefined)?.posten ?? [];
  const p = posten.find((x) => x.id === 'ks-plaza-turn') ?? posten.find((x) => x.soort === 'per-beurt' && x.kant === 'beide');
  return p?.id ? { id: p.id, max: typeof p.max === 'number' ? p.max : 12 } : null;
}

const REDEN_TEKST: Record<EindReden, string> = {
  'zes-rondes': 'six rounds played',
  eindtijd: 'end time reached',
  anders: 'ended at the table',
};

/**
 * DE TEMPOMETER VAN EEN ACT 4-TAFEL (blok E, 24-11-2026), met de plein-vraag bij elke "Turn done", het
 * raider-vinkje en de artefact-herinnering. Alle vier de telefoons zien dezelfde stand: hij staat op de
 * gedeelde tracker en elke wijziging is een compare-and-set (lib/tempo.ts).
 */
export function TafelTempo({ info, onEinde, compact = false, stoelKnop = null }: { info: TafelInfo | null; onEinde: () => void; compact?: boolean; stoelKnop?: React.ReactNode }) {
  const { tracker, tafelPatch } = useGame();
  const tempo = leesTempo(tracker.tempo);
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNu(Date.now()), 1000); return () => clearInterval(t); }, []);
  const beeld = tempoBeeld(tempo, nu);
  const plein = pleinPost(info);
  const raiders = raidersVan(info);
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  // De beurt waarvoor de plein-vraag open staat, vastgelegd bij het OPENEN. Tikt intussen iemand anders
  // die beurt af (realtime), dan blijft dit de oude beurt en doet bevestigen niets: geen dubbele beurt.
  const [vraagVoor, setVraagVoor] = useState<{ ronde: number; team: Team } | null>(null);
  const [eindeOpen, setEindeOpen] = useState(false);
  const [instOpen, setInstOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [open, setOpen] = useState(true);

  /** Eén actie, als compare-and-set. Bij TEMPO_VERANDERD (iemand anders tikte net) één keer opnieuw op de
   *  verse stand; geldt de actie dan niet meer (die beurt is al afgesloten), dan gebeurt er niets. */
  const voerUit = async (a: TempoActie): Promise<boolean> => {
    setBezig(true);
    setMelding(null);
    try {
      let basis: GameTracker = tracker;
      for (let poging = 0; poging < 3; poging++) {
        const oud = leesTempo(basis.tempo) ?? leegTempo();
        const nieuw = pasToe(oud, a, Date.now());
        if (!nieuw) {
          setMelding(poging === 0 ? 'Nothing to change.' : 'Another player already recorded this.');
          return false;
        }
        const patches: TrackerPatch[] = [{ p: ['tempo'], v: nieuw }];
        // De rondeteller van de BattleBar loopt mee; de losse rondeknop blijft voor een correctie.
        const ronde = nieuw.huidig?.ronde ?? (nieuw.beurten.length ? nieuw.beurten[nieuw.beurten.length - 1].ronde : 1);
        if (ronde !== basis.round) patches.push({ p: ['round'], v: Math.min(MAX_RONDES, ronde) });
        if (plein) {
          const d = pleinDelta(oud, nieuw);
          if (d.A) patches.push({ p: ['bonus', 'host', 'scenario', plein.id], plus: d.A, min: 0, max: plein.max });
          if (d.B) patches.push({ p: ['bonus', 'guest', 'scenario', plein.id], plus: d.B, min: 0, max: plein.max });
        }
        const r = await tafelPatch(patches, oud.rev);
        if (r.ok) return true;
        if (r.fout !== 'TEMPO_VERANDERD' || !r.tracker) {
          setMelding(`Could not save (${r.fout ?? 'unknown'}). Try again.`);
          return false;
        }
        basis = r.tracker;
      }
      setMelding('The table changed while you tapped. Look again and retry.');
      return false;
    } finally {
      setBezig(false);
    }
  };

  const teamNaam = (t: Team | null) => (t ? TAFEL_TEAMNAMEN[t] : 'nobody');
  const kleur = KLEUR[beeld.kleur];
  const achter = Math.round(beeld.achterstandMs / 60000);

  // ── De artefact-herinnering ──
  const tabel = tabelVoorArtefact(info?.artefact);
  const aura = ((info?.scenario?.secLayout as { artefacten?: { aura?: number }[] } | undefined)?.artefacten?.[0]?.aura) ?? AURA_ACT4;
  const controle: Team | null = tempo?.artefactBij !== undefined ? tempo.artefactBij ?? null : artefactTeam(info);
  const opShrine = !!info?.artefact && controle === null;
  const toonArtefact = !!tabel && !!tempo?.huidig && !tempo.einde && (controle === null || tempo.huidig.team === controle);
  const beurtSleutel = tempo?.huidig ? `${tempo.huidig.ronde}-${tempo.huidig.team}` : '';
  const [artefactWeg, setArtefactWeg] = useState<string | null>(null);

  const kaart: React.CSSProperties = { border: `1px solid ${TOW.lineStrong}`, borderRadius: 12, background: TOW.cardLt, padding: compact ? '8px 10px' : '10px 12px' };
  const knop: React.CSSProperties = { border: `1px solid ${TOW.lineStrong}`, borderRadius: 9, background: 'transparent', color: TOW.inkDim, cursor: 'pointer', padding: '7px 11px', fontFamily: display, fontWeight: 600, fontSize: 12.5 };

  if (!open) {
    return (
      <button data-testid="tempo-ingeklapt" onClick={() => setOpen(true)} style={{ ...kaart, width: '100%', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ width: 9, height: 9, borderRadius: 5, background: beeld.gestart && !beeld.klaar ? kleur : TOW.muted, flexShrink: 0 }} />
        <span style={{ flex: 1, fontFamily: display, fontWeight: 700, fontSize: 13, color: TOW.ink }}>
          {!beeld.gestart ? 'Timer: not started' : beeld.klaar ? 'Battle ended' : `Round ${beeld.ronde} · ${teamNaam(beeld.team)} · ${klok(beeld.restMs)}`}
        </span>
        <span style={{ fontFamily: serif, fontSize: 12, color: TOW.muted }}>Show</span>
      </button>
    );
  }

  return (
    <div data-testid="tafel-tempo" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={kaart}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, flex: 1 }}>Table timer · evening {tempo?.instelling.avondStart ?? STANDAARD_INSTELLING.avondStart}–{tempo?.instelling.avondEind ?? STANDAARD_INSTELLING.avondEind}</div>
          {stoelKnop}
          <button onClick={() => setInstOpen((v) => !v)} style={{ ...knop, padding: '3px 8px', fontSize: 11 }}>Times</button>
          {compact && <button onClick={() => setOpen(false)} style={{ ...knop, padding: '3px 8px', fontSize: 11 }}>Hide</button>}
        </div>

        {instOpen && <InstellingForm inst={tempo?.instelling ?? STANDAARD_INSTELLING} bezig={bezig} onOpslaan={async (i) => { if (await voerUit({ soort: 'instelling', instelling: i })) setInstOpen(false); }} onDicht={() => setInstOpen(false)} />}

        {!beeld.gestart && (
          <div style={{ marginTop: 6 }}>
            <p style={{ margin: '0 0 8px', fontFamily: serif, fontSize: 13, color: TOW.parchDim, lineHeight: 1.4 }}>
              Roll off for the first turn (building bonuses count), then the winning side starts the battle. Starting now, about {beeld.haalbaarTot} round{beeld.haalbaarTot === 1 ? '' : 's'} fit before {tempo?.instelling.laatsteRonde ?? STANDAARD_INSTELLING.laatsteRonde}; expected end {beeld.verwachtEind ? uurMin(beeld.verwachtEind) : '?'}.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['A', 'B'] as const).map((t) => (
                <button key={t} data-testid={`tempo-start-${t}`} disabled={bezig} onClick={() => voerUit({ soort: 'start', eersteTeam: t })} style={{ flex: 1, padding: '12px 8px', borderRadius: 11, border: 'none', background: goldGrad, color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  Start battle: {TAFEL_TEAMNAMEN[t]} go first
                </button>
              ))}
            </div>
          </div>
        )}

        {beeld.gestart && !beeld.klaar && tempo?.huidig && (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span data-testid="tempo-ronde" style={{ fontFamily: display, fontWeight: 700, fontSize: compact ? 16 : 19, color: TOW.ink }}>Round {beeld.ronde} · {teamNaam(beeld.team)}</span>
              <span data-testid="tempo-klok" style={{ fontFamily: display, fontWeight: 700, fontSize: compact ? 20 : 26, color: beeld.restMs < 0 ? KLEUR.rood : TOW.ink, fontVariantNumeric: 'tabular-nums' }}>{klok(beeld.restMs)}</span>
              <span style={{ fontFamily: serif, fontSize: 12, color: TOW.muted }}>of {Math.round(beeld.richtMs / 60000)} min{beeld.gepauzeerd ? ' · paused' : ''}</span>
            </div>
            <div data-testid="tempo-schema" style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ padding: '2px 8px', borderRadius: 999, background: kleur, color: '#fff', fontFamily: display, fontWeight: 700, fontSize: 11.5 }}>
                {achter <= 0 ? (achter < 0 ? `${-achter} min ahead` : 'On schedule') : `${achter} min behind`}
              </span>
              <span style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>
                Expected end {beeld.verwachtEind ? uurMin(beeld.verwachtEind) : '?'} · at this pace up to round {beeld.haalbaarTot}
              </span>
            </div>
            {beeld.laatsteRonde && (
              <div data-testid="tempo-laatste-ronde" style={{ marginTop: 6, padding: '6px 9px', borderRadius: 8, background: 'rgba(163,39,28,0.12)', border: `1px solid ${KLEUR.rood}`, fontFamily: serif, fontSize: 13, color: TOW.parch }}>
                Last round: after {tempo.instelling.laatsteRonde} no new round starts. Finish this round.
              </div>
            )}
            <button
              data-testid="tempo-turn-done"
              disabled={bezig}
              onClick={() => tempo?.huidig && setVraagVoor({ ronde: tempo.huidig.ronde, team: tempo.huidig.team })}
              style={{ marginTop: 9, width: '100%', padding: compact ? '12px 10px' : '15px 12px', borderRadius: 12, border: 'none', background: goldGrad, color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: compact ? 15 : 17, cursor: 'pointer' }}
            >
              Turn done: {teamNaam(beeld.team)}
            </button>
            <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
              {tempo.huidig.pauzeSinds
                ? <button data-testid="tempo-hervat" disabled={bezig} onClick={() => voerUit({ soort: 'hervat' })} style={knop}>Resume</button>
                : <button data-testid="tempo-pauze" disabled={bezig} onClick={() => voerUit({ soort: 'pauze' })} style={knop}>Pause</button>}
              <button data-testid="tempo-undo" disabled={bezig || !(tempo.vorige?.length)} onClick={() => voerUit({ soort: 'undo' })} style={knop}>Undo</button>
              {tempo.beurten.length === 0 && (
                <button disabled={bezig} onClick={() => voerUit({ soort: 'eersteTeam', eersteTeam: anderTeam(tempo.huidig!.team) })} style={knop}>{TAFEL_TEAMNAMEN[anderTeam(tempo.huidig.team)]} go first instead</button>
              )}
              <button data-testid="tempo-einde" disabled={bezig} onClick={() => setEindeOpen(true)} style={{ ...knop, color: TOW.blood }}>Battle ended</button>
            </div>
          </div>
        )}

        {beeld.klaar && tempo && (
          <div style={{ marginTop: 4 }}>
            <div data-testid="tempo-klaar" style={{ fontFamily: display, fontWeight: 700, fontSize: 16, color: TOW.ink }}>
              Battle ended after {gespeeldeRondes(tempo)} round{gespeeldeRondes(tempo) === 1 ? '' : 's'}{tempo.einde ? ` · ${REDEN_TEKST[tempo.einde.reden]} · ${uurMin(Date.parse(tempo.einde.tijd))}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
              <button data-testid="tempo-uitslag" onClick={onEinde} style={{ ...knop, background: goldGrad, color: TOW.onGrad, border: 'none' }}>End questions and result</button>
              <button disabled={bezig || !(tempo.vorige?.length)} onClick={() => voerUit({ soort: 'undo' })} style={knop}>Undo</button>
              {tempo.einde && tempo.huidig && <button disabled={bezig} onClick={() => voerUit({ soort: 'heropen' })} style={knop}>Play on</button>}
            </div>
          </div>
        )}

        {melding && <div data-testid="tempo-melding" style={{ marginTop: 6, fontFamily: serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.blood }}>{melding}</div>}

        {tempo && tempo.beurten.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button onClick={() => setLogOpen((v) => !v)} style={{ ...knop, padding: '3px 8px', fontSize: 11 }}>{logOpen ? 'Hide log' : `Turn log (${tempo.beurten.length})`}</button>
            {logOpen && (
              <table data-testid="tempo-log" style={{ width: '100%', marginTop: 6, borderCollapse: 'collapse', fontFamily: serif, fontSize: 12, color: TOW.parchDim }}>
                <thead><tr style={{ textAlign: 'left', color: TOW.muted }}><th>Rnd</th><th>Side</th><th>Start</th><th>End</th><th>Min</th><th>Pause</th><th>Plaza</th></tr></thead>
                <tbody>
                  {tempo.beurten.map((b, i) => {
                    const richt = tempo.instelling.richt[b.ronde - 1] ?? 0;
                    const min = Math.round(b.duurMs / 6000) / 10;
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${TOW.line}` }}>
                        <td>{b.ronde}</td><td>{TAFEL_TEAMNAMEN[b.team]}</td><td>{uurMin(Date.parse(b.start))}</td><td>{uurMin(Date.parse(b.eind))}</td>
                        <td style={{ color: min > richt ? KLEUR.rood : TOW.parchDim }}>{min}/{richt}</td>
                        <td>{Math.round(b.pauzeMs / 6000) / 10}</td>
                        <td>{b.plein ? TAFEL_TEAMNAMEN[b.plein] : 'nobody'}{b.raiders.length ? ' + raider' : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {toonArtefact && tabel && artefactWeg !== beurtSleutel && (
        <div data-testid="artefact-herinnering" style={{ ...kaart, borderColor: TOW.blood, background: 'rgba(160,40,30,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ ...eb, fontSize: 8.5, color: TOW.blood, flex: 1 }}>Start of the turn · {info?.artefact?.naam}</div>
            <button onClick={() => setArtefactWeg(beurtSleutel)} style={{ ...knop, padding: '2px 8px', fontSize: 11 }}>Done</button>
          </div>
          <div style={{ fontFamily: display, fontWeight: 700, fontSize: 14, color: TOW.ink, margin: '3px 0 4px' }}>
            {opShrine
              ? `${teamNaam(tempo?.huidig?.team ?? null)}: roll D6 on the ${tabel.naam} table`
              : `${teamNaam(controle)} control the ${tabel.naam}: roll D6 on its table`}
          </div>
          <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim, lineHeight: 1.4 }}>
            Aura {aura}″ in Act {info?.fase ?? 4}. Every unit within the aura, of both sides, rolls D6: on 4+ it is affected, until the start of this player’s next turn. A unit in combat cannot move: Forward, by His Will, Swift Obedience and Voices of Terror pass it by.
          </div>
          {opShrine && (
            <div data-testid="artefact-aanname" style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12, color: TOW.blood, marginTop: 4 }}>
              The artefact lies on the shrine and nobody controls it, so this reminder shows at the start of every turn: the player whose turn it is rolls. (Assumption of the app, from the rule “If nobody controls it, the player whose turn it is rolls.”)
            </div>
          )}
          <table style={{ width: '100%', marginTop: 6, borderCollapse: 'collapse', fontFamily: serif, fontSize: 12.5, color: TOW.parch }}>
            <tbody>
              {tabel.rijen.map(([soort, naam, effect], i) => (
                <tr key={i} style={{ borderTop: `1px solid ${TOW.line}`, verticalAlign: 'top' }}>
                  <td style={{ width: 22, fontFamily: display, fontWeight: 700, padding: '3px 0' }}>{i + 1}</td>
                  <td style={{ padding: '3px 0' }}>
                    <span style={{ fontFamily: display, fontWeight: 700, fontSize: 10.5, color: soort === 'god' ? '#3f7a3a' : soort === 'wrath' ? TOW.blood : '#7a4a8a', marginRight: 6 }}>{SOORT[soort]}</span>
                    <strong>{naam}</strong> {effect}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <details style={{ marginTop: 6 }}>
            <summary style={{ fontFamily: serif, fontSize: 12, color: TOW.muted, cursor: 'pointer' }}>The artefact rules</summary>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontFamily: serif, fontSize: 12, color: TOW.parchDim }}>
              {ARTEFACT_REGELS.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </details>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: serif, fontSize: 12, color: TOW.muted }}>Controlled now by:</span>
            {([['A', 'Wardens'], ['B', 'Unchained'], [null, 'Nobody']] as [Team | null, string][]).map(([t, label]) => (
              <button key={label} disabled={bezig} onClick={() => voerUit({ soort: 'artefactBij', team: t })} aria-pressed={controle === t} style={{ ...knop, padding: '3px 8px', fontSize: 11, background: controle === t ? TOW.panel : 'transparent' }}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {vraagVoor && (
        <PleinVraag
          team={vraagVoor.team}
          ronde={vraagVoor.ronde}
          alVoorbij={!tempo?.huidig || tempo.huidig.ronde !== vraagVoor.ronde || tempo.huidig.team !== vraagVoor.team}
          raiders={raiders.map((r) => ({ id: r.id, naam: r.naam, team: r.kant === 'wardens' ? 'A' as const : 'B' as const }))}
          bezig={bezig}
          onAnnuleer={() => setVraagVoor(null)}
          onKlaar={async (houder, rd) => {
            const was = vraagVoor;
            const ok = await voerUit({ soort: 'beurtKlaar', verwacht: was, plein: houder, raiders: rd });
            setVraagVoor(null);
            // De laatste beurt van ronde 6: meteen door naar de eindvragen.
            if (ok && was.ronde === MAX_RONDES && was.team !== tempo?.eersteTeam) onEinde();
          }}
        />
      )}

      {eindeOpen && tempo && (
        <EindeVraag
          voorstel={beeld.laatsteRonde || nu > beeld.avondEind ? 'eindtijd' : gespeeldeRondes(tempo) >= MAX_RONDES ? 'zes-rondes' : 'anders'}
          bezig={bezig}
          onAnnuleer={() => setEindeOpen(false)}
          onKlaar={async (reden) => { if (await voerUit({ soort: 'einde', reden })) { setEindeOpen(false); onEinde(); } }}
        />
      )}
    </div>
  );
}

function Venster({ children, onDicht }: { children: React.ReactNode; onDicht: () => void }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onDicht(); }} style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 440, background: TOW.panel, border: `1px solid ${TOW.lineStrong}`, borderRadius: 16, padding: 18, boxSizing: 'border-box' }}>{children}</div>
    </div>
  );
}

/** "Turn done": wie had het plein aan het eind van deze spelerbeurt? Plus het raider-vinkje als het team
 *  met het plein een raider heeft. */
function PleinVraag({ team, ronde, alVoorbij, raiders, bezig, onAnnuleer, onKlaar }: {
  team: Team;
  ronde: number;
  /** Iemand anders heeft deze beurt intussen al afgetikt. */
  alVoorbij: boolean;
  raiders: { id: string; naam: string; team: Team }[];
  bezig: boolean;
  onAnnuleer: () => void;
  onKlaar: (houder: PleinHouder, raiders: string[]) => void;
}) {
  const [houder, setHouder] = useState<PleinHouder | undefined>(undefined);
  const [vink, setVink] = useState<Record<string, boolean>>({});
  const relevant = useMemo(() => raiders.filter((r) => houder && r.team === houder), [raiders, houder]);
  const knop = (aan: boolean): React.CSSProperties => ({ flex: 1, padding: '12px 6px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${aan ? TOW.goldDeep : TOW.lineStrong}`, background: aan ? TOW.cardLt : 'transparent', color: TOW.ink, fontFamily: display, fontWeight: 700, fontSize: 14 });
  return (
    <Venster onDicht={onAnnuleer}>
      <div data-testid="plein-vraag">
        <div style={{ ...eb, fontSize: 9, color: TOW.goldDeep }}>Round {ronde} · end of the {TAFEL_TEAMNAMEN[team]} turn</div>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 18, color: TOW.ink, margin: '4px 0 4px' }}>Who holds the plaza?</div>
        <p style={{ margin: '0 0 10px', fontFamily: serif, fontSize: 12.5, color: TOW.parchDim, lineHeight: 1.4 }}>The side with the most Unit Strength on the plaza (more than half of a unit’s models on it; fleeing units and units that failed a Stupidity test do not count). A tie: nobody.</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button data-testid="plein-A" onClick={() => setHouder('A')} aria-pressed={houder === 'A'} style={knop(houder === 'A')}>Wardens</button>
          <button data-testid="plein-B" onClick={() => setHouder('B')} aria-pressed={houder === 'B'} style={knop(houder === 'B')}>Unchained</button>
          <button data-testid="plein-niemand" onClick={() => setHouder(null)} aria-pressed={houder === null} style={knop(houder === null)}>Nobody</button>
        </div>
        {relevant.map((r) => (
          <label key={r.id} data-testid={`raider-vink-${r.id}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, fontFamily: serif, fontSize: 13.5, color: TOW.parch, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!vink[r.id]} onChange={(e) => setVink((v) => ({ ...v, [r.id]: e.target.checked }))} style={{ marginTop: 3 }} />
            <span>{r.naam} had a unit of Unit Strength 10 or more on the plaza</span>
          </label>
        ))}
        {alVoorbij && (
          <div data-testid="plein-al-voorbij" style={{ marginTop: 10, fontFamily: serif, fontSize: 13, color: TOW.blood }}>Another player already recorded the end of this turn. Close this and look at the timer.</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onAnnuleer} style={{ flex: '0 0 auto', padding: '11px 14px', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: 'transparent', color: TOW.muted, fontFamily: display, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>Cancel</button>
          <button
            data-testid="plein-bevestig"
            disabled={houder === undefined || bezig || alVoorbij}
            onClick={() => onKlaar(houder ?? null, relevant.filter((r) => vink[r.id]).map((r) => r.id))}
            style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: 'none', background: goldGrad, color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: 14.5, cursor: 'pointer', opacity: houder === undefined || alVoorbij ? 0.5 : 1 }}
          >
            {bezig ? 'Saving…' : 'Turn done'}
          </button>
        </div>
      </div>
    </Venster>
  );
}

function EindeVraag({ voorstel, bezig, onAnnuleer, onKlaar }: { voorstel: EindReden; bezig: boolean; onAnnuleer: () => void; onKlaar: (r: EindReden) => void }) {
  const [reden, setReden] = useState<EindReden>(voorstel);
  return (
    <Venster onDicht={onAnnuleer}>
      <div data-testid="einde-vraag">
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 18, color: TOW.ink, marginBottom: 6 }}>End the battle?</div>
        <p style={{ margin: '0 0 8px', fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>Why did it end? This goes into the table log.</p>
        {(['zes-rondes', 'eindtijd', 'anders'] as EindReden[]).map((r) => (
          <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: serif, fontSize: 14, color: TOW.parch, margin: '4px 0', cursor: 'pointer' }}>
            <input type="radio" name="eindreden" checked={reden === r} onChange={() => setReden(r)} />
            {r === 'zes-rondes' ? 'Six rounds played' : r === 'eindtijd' ? 'End time reached' : 'Other (agreed at the table)'}
          </label>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={onAnnuleer} style={{ flex: '0 0 auto', padding: '11px 14px', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: 'transparent', color: TOW.muted, fontFamily: display, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>Cancel</button>
          <button data-testid="einde-bevestig" disabled={bezig} onClick={() => onKlaar(reden)} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: 'none', background: goldGrad, color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}>Battle ended</button>
        </div>
      </div>
    </Venster>
  );
}

/** De tijden van deze battle night. Een instelling op de tafel zelf: alle vier de telefoons volgen hem. */
function InstellingForm({ inst, bezig, onOpslaan, onDicht }: { inst: TempoInstelling; bezig: boolean; onOpslaan: (i: TempoInstelling) => void; onDicht: () => void }) {
  const [c, setC] = useState<TempoInstelling>(inst);
  const veld: React.CSSProperties = { width: 70, borderRadius: 7, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, padding: '4px 6px', fontFamily: display, fontSize: 13 };
  const tijd = (label: string, k: 'avondStart' | 'avondEind' | 'laatsteRonde') => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>
      {label}<input type="time" value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} style={veld} />
    </label>
  );
  return (
    <div data-testid="tempo-instelling" style={{ marginTop: 8, padding: 8, borderRadius: 9, border: `1px dashed ${TOW.lineStrong}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {tijd('Evening starts', 'avondStart')}
        {tijd('Evening ends', 'avondEind')}
        {tijd('No new round after', 'laatsteRonde')}
      </div>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>
        Minutes per side turn, round 1-6:
        {c.richt.map((m, i) => (
          <input key={i} type="number" min={1} max={120} value={m} aria-label={`Round ${i + 1} minutes`} onChange={(e) => { const r = [...c.richt]; r[i] = Math.max(1, Math.min(120, parseInt(e.target.value, 10) || 1)); setC({ ...c, richt: r }); }} style={{ ...veld, width: 46 }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => setC(STANDAARD_INSTELLING)} style={{ border: `1px solid ${TOW.lineStrong}`, borderRadius: 8, background: 'transparent', color: TOW.muted, padding: '5px 10px', fontFamily: display, fontSize: 12, cursor: 'pointer' }}>Defaults</button>
        <button onClick={onDicht} style={{ border: `1px solid ${TOW.lineStrong}`, borderRadius: 8, background: 'transparent', color: TOW.muted, padding: '5px 10px', fontFamily: display, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
        <button disabled={bezig} onClick={() => onOpslaan(c)} style={{ flex: 1, border: 'none', borderRadius: 8, background: goldGrad, color: TOW.onGrad, padding: '5px 10px', fontFamily: display, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Save for this table</button>
      </div>
    </div>
  );
}
