// DE LOBBY — het scherm tussen "code aangemaakt" en "we spelen".
//
// Joost (13-09): "het geheel moet gewoon veel duidelijker en gestructureerd worden voor mensen om
// samen een potje te starten." Dit is het gat dat daar zat. Je maakte een game aan en stond meteen
// in het roster-scherm: de code hing in een hoekje, je zag niet of de ander al binnen was, je zag
// niet wat er op tafel lag, en het potje was al "begonnen" terwijl er nog niemand zat.
//
// Wat er hier dus gebeurt, in de volgorde waarin je het nodig hebt:
//   1. de CODE — die moet je doorgeven voor er iets anders kan;
//   2. WIE ER ZIT — de enige vraag tussen doorgeven en beginnen;
//   3. de BATTLE SHEET — waar spelen we op (de host mag 'm nog bijstellen);
//   4. JE LEGER — dat kun je hier al kiezen in plaats van straks in het potje;
//   5. START — en pas dán begint het.
//
// WIE DE BAAS IS: de HOST (Joost, 13-09). Hij beheert de sheet en hij drukt op Start. Buiten de
// campagne is er geen server die arbitreert, dus zonder die afspraak overschrijven twee spelers
// elkaars scenario. De gast ziet hetzelfde blad, maar leest het alleen.
//
// Dit scherm bewaart NIETS van zichzelf: alles komt uit `useGame()` en gaat daar weer heen. De
// realtime-sync van `tow_games` was er al — de gast ziet de sheet van de host en het `gestart`-
// vlaggetje binnenkomen zonder dat hier iets voor nodig is.
import { useLayoutEffect, useRef, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { normSheet } from '../../lib/battleSheet';
import { ArmyListPicker } from './ArmyListPicker';
import { BattleSheetView } from './BattleSheetView';
import type { Army } from '../../types';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

const kaart: React.CSSProperties = {
  border: `1px solid ${TOW.line}`, borderRadius: 12, background: TOW.panel2, padding: '12px 14px',
};

/** Eén speler op een rij: naam boven, wat hij meebrengt eronder. `wachten` is de stand waarin er nog
 *  geen speler IS — dat is iets anders dan een speler zonder leger, en dat verschil is precies waar
 *  je in een lobby naar zit te kijken. */
function SpelerRij({ naam, leger, jij, wachten }: {
  naam: string | null;
  leger: Army | null;
  jij: boolean;
  wachten?: boolean;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, border: `1px solid ${jij ? TOW.goldDeep : TOW.line}`, background: jij ? 'rgba(184,134,47,0.08)' : 'transparent' }}>
      <span style={{ width: 8, height: 8, flexShrink: 0, borderRadius: 99, background: wachten ? TOW.faint : TOW.goldDeep }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: display, fontWeight: 600, fontSize: 14.5, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {naam || (wachten ? 'Opponent' : 'Player')}{jij ? ' · you' : ''}
        </div>
        <div style={{ fontFamily: serif, fontSize: 12.5, color: leger ? TOW.parchDim : TOW.muted, fontStyle: leger ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {wachten
            ? 'waiting to join…'
            : leger
              ? `${leger.faction || leger.name}${leger.points != null ? ` · ${leger.points} pts` : ''}`
              : 'no army yet'}
        </div>
      </div>
    </div>
  );
}

export function GameLobby({ onEditSheet }: { onEditSheet?: () => void } = {}): React.JSX.Element {
  const {
    seat, code, myName, myArmy, opponentName, opponentArmy,
    tracker, setMyArmy, setOpponentArmy, startBattle, leaveGame,
  } = useGame();
  const [gekopieerd, setGekopieerd] = useState(false);
  const [kopieFout, setKopieFout] = useState(false);

  // Breedte van het PANEEL, niet van het venster — hetzelfde patroon als GameView, want dit scherm
  // staat naast de globale rail en is dus smaller dan de window.
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

  const solo = seat === 'solo';
  const host = seat === 'host';
  // De sheet gaat pas bij het LEZEN door `normSheet` (schrijven doet de wizard): een rij uit de cloud
  // kan van een andere appversie komen, en een halve sheet moet hier een leeg blok worden en geen crash.
  const sheet = normSheet(tracker.sheet);
  // Mag IK op Start drukken? De host beslist, en in solo is er niemand anders — de gast wacht.
  const magStarten = host || solo;
  // Zonder ook maar één leger is er niets om te tracken; dan is Start een lege handeling.
  const geenLeger = !myArmy && !opponentArmy;

  const kopieer = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setKopieFout(false);
      setGekopieerd(true);
      window.setTimeout(() => setGekopieerd(false), 1800);
    } catch {
      // Klembord geweigerd (iOS zonder gebruikersgebaar, of een strenge browser). Zeg dat, in plaats
      // van niets te doen — de code staat er groot genoeg bij om 'm over te tikken.
      setKopieFout(true);
    }
  };

  // ── de blokken, één keer gebouwd en in beide indelingen hergebruikt ───────────────────────────

  const codeBlok = !solo && code && (
    <div style={{ ...kaart, textAlign: 'center' }}>
      <div style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>Game code</div>
      <button
        onClick={kopieer}
        title="Copy the code"
        style={{ display: 'block', width: '100%', border: 'none', background: 'none', cursor: 'pointer', padding: '4px 0 2px', fontFamily: display, fontWeight: 700, fontSize: 40, letterSpacing: '0.22em', color: TOW.goldDeep, lineHeight: 1.1 }}
      >
        {code}
      </button>
      <div style={{ fontFamily: serif, fontSize: 12.5, color: kopieFout ? TOW.blood : TOW.muted, lineHeight: 1.4 }}>
        {kopieFout ? 'Could not copy — type the code over by hand.' : gekopieerd ? 'Copied to your clipboard.' : 'Share this with your opponent — tap to copy.'}
      </div>
    </div>
  );

  const spelersBlok = (
    <div style={kaart}>
      <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 8 }}>Players</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <SpelerRij naam={myName} leger={myArmy} jij />
        {/* In solo speel je beide kanten op dit apparaat: er valt niemand te verwachten, dus die kant
            is nooit "waiting". Online wél, tot de ander de code invoert. */}
        <SpelerRij naam={opponentName} leger={opponentArmy} jij={false} wachten={!solo && !opponentName} />
      </div>
    </div>
  );

  const legerBlok = (!myArmy || (solo && !opponentArmy)) && (
    <div style={kaart}>
      {/* De kop hoort bij het BLOK eronder, niet bij de kaart: heb je je eigen leger al en mis je in
          solo alleen dat van de tegenstander, dan zou "Your army" boven een lege plek staan. */}
      {!myArmy && (
        <>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 8 }}>Your army</div>
          <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.muted, lineHeight: 1.45, marginBottom: 8 }}>
            Pick one of your saved lists. You can also add or paste one once the battle has started.
          </div>
          <ArmyListPicker onPick={setMyArmy} />
        </>
      )}
      {/* SOLO: beide kanten staan op dit apparaat, dus je kiest ze hier allebei. Online doet de
          tegenstander dat zelf — die kant hoort hier niet te staan. */}
      {solo && !opponentArmy && (
        <div style={{ marginTop: myArmy ? 0 : 14 }}>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 8 }}>Opponent army</div>
          <ArmyListPicker onPick={setOpponentArmy} />
        </div>
      )}
    </div>
  );

  const sheetBlok = (
    <div style={kaart}>
      {sheet ? (
        <BattleSheetView
          sheet={sheet}
          titel="Battle sheet"
          rechts={host && onEditSheet ? (
            <button
              onClick={onEditSheet}
              style={{ padding: '8px 13px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.goldDeep, fontFamily: display, fontWeight: 600, fontSize: 12.5 }}
            >
              Edit battlefield
            </button>
          ) : undefined}
        />
      ) : (
        <>
          <div style={{ fontFamily: display, fontWeight: 700, fontSize: 18, color: TOW.ink, marginBottom: 5 }}>Battle sheet</div>
          <div style={{ fontFamily: serif, fontSize: 13, color: TOW.muted, lineHeight: 1.45 }}>
            No battlefield has been set for this game yet.
          </div>
          {host && onEditSheet && (
            <button
              onClick={onEditSheet}
              style={{ marginTop: 10, padding: '9px 14px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.goldDeep, fontFamily: display, fontWeight: 600, fontSize: 13 }}
            >
              Set the battlefield
            </button>
          )}
        </>
      )}
      {/* De gast mag het blad lezen maar niet wijzigen. Dat zeggen is vriendelijker dan een knop die
          er niet is: anders lijkt het alsof zijn app iets mist. */}
      {!host && !solo && sheet && (
        <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.muted, marginTop: 10 }}>
          The host sets the battlefield for this game.
        </div>
      )}
    </div>
  );

  const startBlok = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {magStarten ? (
        <>
          <button
            onClick={startBattle}
            disabled={geenLeger}
            style={{ width: '100%', border: 'none', borderRadius: 12, cursor: geenLeger ? 'default' : 'pointer', padding: '14px 18px', background: goldGrad, color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: 16, opacity: geenLeger ? 0.5 : 1 }}
          >
            Start battle
          </button>
          <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.muted, lineHeight: 1.45, textAlign: 'center' }}>
            {geenLeger
              ? 'Pick an army first — there is nothing to track without one.'
              : solo
                ? 'Both sides are tracked on this device.'
                : 'Starts the battle for both players. Your opponent can still join afterwards.'}
          </div>
        </>
      ) : (
        <div style={{ ...kaart, textAlign: 'center' }}>
          <div style={{ fontFamily: display, fontWeight: 700, fontSize: 15, color: TOW.ink }}>Waiting for the host to start…</div>
          <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.muted, lineHeight: 1.45, marginTop: 4 }}>
            You will drop into the battle as soon as they do. Pick your army in the meantime.
          </div>
        </div>
      )}
      <button
        onClick={leaveGame}
        style={{ width: '100%', padding: '11px 16px', borderRadius: 11, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: 'transparent', color: TOW.muted, fontFamily: display, fontWeight: 600, fontSize: 13.5 }}
      >
        Leave
      </button>
    </div>
  );

  const kop = (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep }}>{solo ? 'Solo game' : host ? 'You are hosting' : 'You joined'}</div>
      <div style={{ fontFamily: display, fontWeight: 700, fontSize: 24, color: TOW.ink, lineHeight: 1.1, marginTop: 3 }}>Ready to fight</div>
    </div>
  );

  // ════════════════ WIDE — sheet links, spelers + acties rechts ════════════════
  if (wide) {
    return (
      <div ref={rootRef} className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
        <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 28px 48px' }}>
          {kop}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
            <div style={{ flex: 1, minWidth: 0 }}>{sheetBlok}</div>
            <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {codeBlok}
              {spelersBlok}
              {legerBlok}
              {startBlok}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════ PHONE — één kolom, in de volgorde waarin je het nodig hebt ════════════════
  return (
    <div ref={rootRef} className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '16px 14px 36px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {kop}
        {codeBlok}
        {spelersBlok}
        {sheetBlok}
        {legerBlok}
        {startBlok}
      </div>
    </div>
  );
}
