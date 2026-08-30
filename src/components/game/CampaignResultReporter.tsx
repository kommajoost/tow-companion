import { useEffect, useMemo, useState } from 'react';
import { unitToon, unitToonRegel } from '../../lib/unitNaam';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { unitTotalStrength } from '../../lib/armyRules';
import {
  battleByCode, battleQuests, reportBattleResult, officieleUitslag,
  kroniekMijn, kroniekBattleZet,
  battleFotos, battleFotosZet, battleFotoUpload, battleFotoWis, type BattleFoto,
  RESULTAAT_NAAM, TP_VAN_RESULTAAT, SPIEGEL,
  type CampaignBattle, type BattleResultaat, type ToernooiResultaat, type BattleQuests,
  type Terugtrekker,
} from '../../lib/campaignBattle';
import { berekenVictory, type VpBonus, type Uitslag } from '../../lib/victoryPoints';
import type { Army, ArmyUnit, GameTracker } from '../../types';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;

// De VP-bonussen (general/BSB/standaards/objective) worden door een PARALLELLE taak op de tracker
// gezet als `tracker.bonus.{host,guest}`. Op het moment van schrijven zit dat veld nog niet in het
// GameTracker-type, dus lezen we het via een smalle lokale shape i.p.v. een `any`-cast die de build
// zou breken. Zodra het type wél bestaat blijft dit gewoon compileren (structureel compatibel).
type MetBonus = { bonus?: { host?: VpBonus; guest?: VpBonus } };
function readBonus(tracker: GameTracker | null): { host?: VpBonus; guest?: VpBonus } {
  return (tracker as (GameTracker & MetBonus) | null)?.bonus ?? {};
}

// Engine-uitslag → Engels UI-label.
const uitslagLabel = (u: Uitslag): string => (u === 'crushing' ? 'Crushing Victory' : u === 'victory' ? 'Victory' : 'Draw');

// Supabase-fout (geen Error-instantie, dus e.message viel eerder weg) → leesbare reden. De report-RPC
// raise't o.a. LEGERS_NIET_GELOCKT als niet beide kanten in de campagne-app hun leger gelockt hebben.
function reportFoutTekst(msg: string): string {
  if (/LEGERS_NIET_GELOCKT/.test(msg)) return 'Both armies must be locked in the campaign app first (battle Wizard → List → “Lock army” on both sides), then report again.';
  if (/AL_VERWERKT/.test(msg)) return 'This battle already has a recorded result in the campaign.';
  if (/ONBEKENDE_CODE/.test(msg)) return "This game's code isn't linked to a campaign battle.";
  return msg || 'Could not report the result.';
}

// F5 — report a campaign battle's result back to "De Grensvorsten". Only renders when the active
// game's code actually maps to a campaign battle (we probe with towc_battle_by_code; a normal ad-hoc
// game returns ONBEKENDE_CODE and this renders nothing). The reporter maps host→attacker and
// guest→defender, keys VP + winner on the CAMPAIGN player ids (not host/guest), sends per-unit
// casualties as `kills`, plus optional notes. The campaign stores it as a proposal for the
// grensmaster to approve — applying rewards is not this app's concern.

// Collapse the tracker's per-unit casualties into a compact kills list. We only know lost/fleeing
// per seat:unitId here (no kill-attribution yet), so we report each side's own losses, tagged with
// the unit name so the campaign can read it. side = 'attacker' | 'defender' (host = attacker).
function collectKills(
  tracker: GameTracker,
  hostArmyUnits: { id: string; name: string }[] | undefined,
  guestArmyUnits: { id: string; name: string }[] | undefined,
): { side: 'attacker' | 'defender'; unitId: string; unit: string; lost: number; fleeing: boolean }[] {
  const out: { side: 'attacker' | 'defender'; unitId: string; unit: string; lost: number; fleeing: boolean }[] = [];
  const push = (seat: 'host' | 'guest', side: 'attacker' | 'defender', units?: { id: string; name: string }[]) => {
    for (const u of units ?? []) {
      const t = tracker.units[`${seat}:${u.id}`];
      if (t && (t.lost > 0 || t.fleeing)) out.push({ side, unitId: u.id, unit: unitToonRegel(u), lost: t.lost, fleeing: t.fleeing });
    }
  };
  push('host', 'attacker', hostArmyUnits);
  push('guest', 'defender', guestArmyUnits);
  return out;
}

type Veteraan = NonNullable<BattleResultaat['veteraan']>[number];

// Campagne-relevante per-unit feiten voor ÉÉN leger. De aanroeper doet dit voor BEIDE kanten:
// wie indient, dient voor de hele tafel in (Joost, 29-08). Deed alleen de melder z'n eigen leger,
// dan kreeg de tegenstander geen XP en zelfs geen gespeelde battle — Ferry's zes units stonden na
// battle #2022 nog op nul terwijl er vijf XP openstond. De serverkant kon dit altijd al aan: de
// trigger towc_battle_veteraan_verwerk loopt de hele array langs en matcht unit_id binnen
// (aanvaller, verdediger, proxy), dus hij verwerkt beide legers zodra ze erin staan.
// absolute seat-key ('host'/'guest') waarop de eigen units in de tracker staan — solo mapt naar
// 'host' (zoals GameView's absSeat('me')). De drempels spiegelen de VP-engine (unitVp):
//   remaining = unitTotalStrength − lost.
//   overleefd_50 : remaining ≥ 50% start-US  én  niet fleeing  én  niet weg (removed).
//   scar_trigger : remaining < 25% start-US   óf  weg          óf  fleeing.
// (Grenzen bewust asymmetrisch: ≥50% vs <25%, exact conform de opdracht.)
// De gemelde `unitId` is `u.campaignId` — de gedeelde campagne-sleutel (campaignUnitId in
// owbBuilder.ts, gezet door builderListToArmy). Een geplakt OWB-leger heeft geen campaignId; dan
// valt 'ie terug op de eigen unit-id, zodat de melding altijd een sleutel heeft.
/** Troop types die XP verdienen. Veteran Abilities (p.24) is expliciet: "Any unit whose troop type
 *  is infantry or cavalry (but not swarms or war beasts)". Monstrous Infantry en Monstrous Cavalry
 *  vallen daar gewoon onder — het zijn sub-categorieën van infanterie en cavalerie. Strijdwagens,
 *  monsters, behemoths en war machines niet, en die kregen bij ons tot 30-08 wél XP. */
const XP_WAARDIG = /^(regular|heavy|monstrous) infantry$|^(light|heavy|monstrous) cavalry$/i;
const isCharacter = (u: ArmyUnit) => /^characters$/i.test(u.category ?? '');
/** De General is in de catalogus een gewone optie op een character (161 keer over alle legers). */
const isGeneral = (u: ArmyUnit) => (u.options ?? []).some((o) => /^general/i.test(o.replace(/{[^}]*}/g, '').trim()));

// Campagne-relevante per-unit feiten voor ÉÉN leger. De aanroeper doet dit voor BEIDE kanten.
//
// TWEE REGELSETS, en dat was tot 30-08 het grootste gat: characters volgden de unit-regel.
//
//   UNITS — Veteran Abilities (p.24): +1 als het overleefde op ≥50% start-Unit-Strength, +1 per
//   vernietigde vijandelijke unit of trofee. Alleen infanterie en cavalerie.
//
//   CHARACTERS — Seasoned Commanders (p.25): +1 voor OVERLEVEN — "any character that was not
//   removed from play as a casualty and is not fleeing" — dus zonder 50%-drempel, want een
//   character is één model. Een zwaargewonde held verdient gewoon. Plus +1 per kill, en de
//   General van het winnende leger krijgt er nog 1 bij.
//
// SCARS lopen ook uiteen. Battlefield Losses (p.24) geldt voor een unit onder 25%, vernietigd of
// vluchtend. Death & Dishonour (p.25) geldt alleen als een character IS GESNEUVELD OF VLUCHT — geen
// 25%-clausule, die deden wij wel, waardoor een gewonde held onterecht op de dodentabel rolde.
function collectVeteraan(
  tracker: GameTracker,
  ownArmy: Army | null,
  ownSeat: 'host' | 'guest',
  gewonnen: boolean,
): Veteraan[] {
  const out: Veteraan[] = [];
  for (const u of ownArmy?.units ?? []) {
    const t = tracker.units[`${ownSeat}:${u.id}`];
    const ts = unitTotalStrength(u);
    const lost = Math.max(0, t?.lost ?? 0);
    const remaining = ts - lost;
    const fleeing = t?.fleeing ?? false;
    const weg = t?.weg ?? false;
    const dood = weg || remaining <= 0;
    const unitId = u.campaignId ?? u.id;
    const kills = Math.max(0, t?.kills ?? 0);

    if (isCharacter(u)) {
      const leeft = !dood && !fleeing;
      out.push({
        unitId,
        naam: u.name,
        overleefd_50: leeft,
        kills,
        bonusXp: leeft && gewonnen && isGeneral(u) ? 1 : 0,
        scar_trigger: dood || fleeing,
      });
      continue;
    }

    // Verdient deze unit überhaupt XP? Zo niet, dan melden we hem WEL — hij speelde de battle mee en
    // kan nog steeds een scar oplopen — maar met nul te verdienen.
    const verdient = XP_WAARDIG.test(u.troopType ?? '');
    out.push({
      unitId,
      naam: u.name,
      overleefd_50: verdient && remaining >= ts * 0.5 && !fleeing && !weg,
      kills: verdient ? kills : 0,
      bonusXp: 0,
      scar_trigger: remaining < ts * 0.25 || weg || fleeing,
    });
  }
  return out;
}

// embedded = gerenderd binnen het einde-battle-overzicht (form direct open, geen eigen rand).
export function CampaignResultReporter({ embedded = false }: { embedded?: boolean } = {}) {
  const { code, game, tracker, seat, myArmy, setTracker } = useGame();
  const [battle, setBattle] = useState<CampaignBattle | null>(null);
  const [open, setOpen] = useState(embedded);
  // Geen winnaar-keuze meer (30-07): de uitslag volgt uit de Victory Points via de officiële
  // Tournament-Points-tabel. We vragen die aan de SERVER op, zodat OWC en de campagne per definitie
  // hetzelfde zeggen. null = nog niet opgehaald / oudere server zonder cap.
  const [tpRes, setTpRes] = useState<ToernooiResultaat | null>(null);
  const [notes, setNotes] = useState('');
  // De chronicler (13-08-2026). PERSOONLIJK verslag van dit gevecht, los van het gedeelde Notes-veld
  // hierboven: dat hoort bij de battle, dit hoort bij jou. Beide spelers kunnen dus hun eigen versie
  // schrijven, en het staat los van wie de uitslag indient.
  const [kroniek, setKroniek] = useState('');
  const [kroniekOpgeslagen, setKroniekOpgeslagen] = useState('');
  const [kroniekBezig, setKroniekBezig] = useState(false);
  const [kroniekMelding, setKroniekMelding] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Battle-foto's (24-08-2026): max 3 per kant, voer voor de chronicles. `fotos` is de HELE lijst
  // van de battle (beide kanten); wat van mij is filtert op mijn campagne-speler-id.
  const [fotos, setFotos] = useState<BattleFoto[]>([]);
  const [fotoBezig, setFotoBezig] = useState(false);
  const [fotoFout, setFotoFout] = useState<string | null>(null);

  // De openstaande battle-quest van BEIDE kanten (01-08). Battle-quests zijn tafel-feiten, dus de
  // twee spelers vinken ze hier samen af; de campagne-app kan ze niet zelf verifiëren.
  const [quests, setQuests] = useState<BattleQuests>({ aanvaller: null, verdediger: null });

  // Probe once per code: is this game a campaign battle? Silent on the "not a campaign battle" path.
  useEffect(() => {
    if (!code) { setBattle(null); return; }
    let alive = true;
    battleByCode(code)
      .then((b) => { if (alive) setBattle(b); })
      .catch(() => { if (alive) setBattle(null); });
    battleQuests(code)
      .then((q) => { if (alive) setQuests(q); })
      .catch(() => { if (alive) setQuests({ aanvaller: null, verdediger: null }); });
    battleFotos(code)
      .then((f) => { if (alive) setFotos(f); })
      .catch(() => { /* geen foto's is geen fout */ });
    return () => { alive = false; };
  }, [code]);

  // Al eerder iets over DEZE battle geschreven? Dan staat het er bij terugkomst gewoon weer.
  useEffect(() => {
    const id = battle?.id;
    if (!id) return;
    let alive = true;
    kroniekMijn()
      .then((stukken) => {
        if (!alive) return;
        const stuk = stukken.find((k) => k.soort === 'battle' && k.battle === id);
        setKroniek(stuk?.tekst ?? '');
        setKroniekOpgeslagen(stuk?.tekst ?? '');
      })
      .catch(() => { /* geen kroniek is geen fout — het veld blijft gewoon leeg */ });
    return () => { alive = false; };
  }, [battle?.id]);

  const bewaarKroniek = async () => {
    const id = battle?.id;
    if (!id || kroniekBezig) return;
    setKroniekBezig(true);
    setKroniekMelding(null);
    try {
      await kroniekBattleZet(kroniek.trim(), battle?.fase ?? null, id);
      setKroniekOpgeslagen(kroniek.trim());
      setKroniekMelding(kroniek.trim() ? 'Your chronicler has it.' : 'Entry withdrawn.');
    } catch (e) {
      setKroniekMelding((e as Error).message === 'NIET_INGELOGD'
        ? 'Sign in to the campaign account to write.'
        : 'Could not save — try again.');
    } finally {
      setKroniekBezig(false);
    }
  };

  // VP via de rules-kritieke engine (kill-VP uit Dead-or-Fled + handmatige bonussen), NIET meer ruw
  // uit tracker.vp. Bonussen defensief gelezen (zie readBonus). Engine verdraagt afwezige velden.
  const res = useMemo(() => {
    const b = readBonus(tracker);
    return berekenVictory(game?.host_army ?? null, game?.guest_army ?? null, tracker, b.host, b.guest);
  }, [tracker, game?.host_army, game?.guest_army]);
  const vpHost = res.hostVp;
  const vpGuest = res.guestVp;
  const attackerId = battle?.aanvaller.id ?? null;
  const defenderId = battle?.verdediger.id ?? null;

  // TERUGTREKKEN (17-08-2026). Een leger dat zich terugtrekt redt zijn units — geen verwondings-worpen,
  // geen Battlefield Losses — maar geeft de battle weg: de tegenstander wint met minimaal een
  // Resounding Victory. Dat kan de VP-telling niet zien, dus het is het enige feit over de UITSLAG dat
  // de spelers hier zelf melden. Staat op de TRACKER (net als de quest-vinkjes), dus het synct naar de
  // andere speler en loopt mee in de report-sig. Host = aanvaller, guest = verdediger; de campagne
  // denkt in rollen, dus we vertalen hier één keer.
  const withdrew = tracker.withdrew ?? null;
  const terugtrokken: Terugtrekker = withdrew === 'host' ? 'aanvaller' : withdrew === 'guest' ? 'verdediger' : null;

  // Officiële uitslag ophalen zodra de VP (of de battle) veranderen. De cap komt uit de campagne mee;
  // ontbreekt 'ie (oudere server), dan tonen we alleen de kale VP en laat de campagne het uitrekenen.
  useEffect(() => {
    const cap = battle?.cap;
    if (!battle || !cap) { setTpRes(null); return; }
    let alive = true;
    officieleUitslag(vpHost, vpGuest, cap, terugtrokken)
      .then((r) => { if (alive) setTpRes(r); })
      .catch(() => { if (alive) setTpRes(null); });
    return () => { alive = false; };
  }, [battle, vpHost, vpGuest, terugtrokken]);

  // Quest-vinkjes staan op de TRACKER, niet in lokale state: zo synct realtime ze naar de andere
  // speler en lopen ze mee in de report-sig (zie hieronder).
  const questAanvOk = tracker.quests?.host === true;
  const questVerdOk = tracker.quests?.guest === true;
  const zetQuest = (zijde: 'host' | 'guest', aan: boolean) =>
    setTracker({ ...tracker, quests: { ...(tracker.quests ?? {}), [zijde]: aan || undefined } });

  const zetWithdrew = (zijde: 'host' | 'guest' | null) =>
    setTracker({ ...tracker, withdrew: zijde ?? undefined });

  const kills = useMemo(
    () => (battle ? collectKills(tracker, game?.host_army?.units, game?.guest_army?.units) : []),
    [battle, tracker, game?.host_army, game?.guest_army],
  );

  // Eigen seat-key: host/guest direct; solo → 'host' (zoals GameView's absSeat('me')).
  const ownSeat: 'host' | 'guest' = seat === 'guest' ? 'guest' : 'host';
  // In solo is er geen game-rij; dan is het eigen leger de enige kant die bestaat.
  const hostArmy = game?.host_army ?? (ownSeat === 'host' ? myArmy : null);
  const guestArmy = game?.guest_army ?? (ownSeat === 'guest' ? myArmy : null);
  // dat dit NIET dubbel gebeurt bij "Report again" (we bouwen 'm elke submit vers uit `notes`).
  // Wie won volgens de officiële tabel? CV/RV/MV = de aanvaller (host), MD/RD/CD = de verdediger,
  // D = niemand. Zonder tpRes vallen we terug op de VP-engine, zodat melden altijd mogelijk blijft.
  const tpWinnaar: 'host' | 'guest' | null =
    tpRes === null ? res.winnaar
      : tpRes === 'D' ? null
      : tpRes === 'CV' || tpRes === 'RV' || tpRes === 'MV' ? 'host' : 'guest';

  const veteraanPerZijde = useMemo(() => (battle ? [
    { seat: 'host' as const, naam: game?.host_name || 'Host', items: collectVeteraan(tracker, hostArmy, 'host', tpWinnaar === 'host') },
    { seat: 'guest' as const, naam: game?.guest_name || 'Guest', items: collectVeteraan(tracker, guestArmy, 'guest', tpWinnaar === 'guest') },
  ].filter((z) => z.items.length) : []),
  [battle, tracker, hostArmy, guestArmy, game?.host_name, game?.guest_name, tpWinnaar]);
  const veteraan = useMemo(() => veteraanPerZijde.flatMap((z) => z.items), [veteraanPerZijde]);
  // Weergave-namen per gemelde unitId. collectVeteraan sleutelt op `campaignId ?? id`, dus hier ook —
  // anders vindt de lookup niets zodra een unit een campagne-sleutel heeft.
  const toonPerUnit = useMemo(() => {
    const m = new Map<string, ReturnType<typeof unitToon>>();
    for (const u of [...(hostArmy?.units ?? []), ...(guestArmy?.units ?? [])]) m.set(u.campaignId ?? u.id, unitToon(u));
    return m;
  }, [hostArmy, guestArmy]);
  const toonVan = (id: string) => toonPerUnit.get(id) ?? { primair: '', secundair: null };

  // ── Dubbele goedkeuring (30-07) ──────────────────────────────────────────────────────────────
  // Beide spelers vullen samen dezelfde cijfers in (de tracker is al realtime gedeeld) en moeten de
  // uitslag allebei goedkeuren vóór er iemand mag indienen. `sig` is de vingerafdruk van de cijfers:
  // wijzigt er daarna nog iets, dan klopt de opgeslagen sig niet meer en vervallen beide vinkjes.
  const solo = seat === 'solo' || !game?.guest_army;
  // Tegen een door de campagne bestuurde AI is er niemand die kan goedkeuren (30-07). Dat viel eerder
  // automatisch onder `solo`, omdat de tegenstander-kolom leeg bleef — maar sinds het AI-leger wél
  // wordt meegeschreven (zodat je niet meer zelf hun lijst moet kiezen) is dat niet langer waar, en
  // stond de dubbele goedkeuring een AI-battle in de weg. Expliciet op de ai-vlag uit de campagne dus.
  const tegenIsAi = ownSeat === 'host' ? battle?.verdediger.ai === true : battle?.aanvaller.ai === true;
  const geenTegenpartij = solo || tegenIsAi;
  const sig = useMemo(
    // 01-08: de quest-vinkjes zitten IN de sig. Anders kon iemand na de goedkeuring van de ander nog
    // een quest aanvinken en glipte dat langs de dubbele controle.
    // 17-08: `withdrew` hoort er net zo goed in — die vlag verandert de trede, dus omzetten ná de
    // goedkeuring van de ander moet beide vinkjes laten vervallen.
    () => JSON.stringify([vpHost, vpGuest, kills.map((k) => [k.side, k.unitId, k.lost, k.fleeing]), questAanvOk, questVerdOk, withdrew]),
    [vpHost, vpGuest, kills, questAanvOk, questVerdOk, withdrew],
  );
  const rapport = tracker.report;
  const sigGeldig = !!rapport && rapport.sig === sig;
  const hostOk = sigGeldig && !!rapport?.host;
  const guestOk = sigGeldig && !!rapport?.guest;
  const ikOk = ownSeat === 'host' ? hostOk : guestOk;
  const tegenOk = ownSeat === 'host' ? guestOk : hostOk;
  // Solo/zonder tegenstander is er niemand om het mee eens te worden → direct indienbaar. (Zonder deze
  // uitzondering zou de submit-knop daar permanent op slot staan, want de goedkeurknop rendert niet.)
  const beidenAkkoord = geenTegenpartij ? true : hostOk && guestOk;

  /** Mijn goedkeuring aan/uit zetten. Bij een gewijzigde sig beginnen we schoon (de ander moet dan
   *  opnieuw kijken — dat is precies de bedoeling). */
  const zetAkkoord = (akkoord: boolean) => {
    const basis = sigGeldig ? rapport : undefined;
    setTracker({
      ...tracker,
      report: { sig, host: basis?.host, guest: basis?.guest, [ownSeat]: akkoord || undefined },
    });
  };

  if (!code || !battle) return null; // not a campaign battle → nothing to report

  const hostName = game?.host_name || battle.aanvaller.naam || 'Attacker';
  const guestName = game?.guest_name || battle.verdediger.naam || 'Defender';

  // Marge-regel voor de campagne: er is geen apart marge-veld, dus we hangen één nette Engelse regel
  // aan de notes zodat de grensmaster minor (Victory) vs major (Crushing Victory) ziet. Bij een draw
  // vermelden we de VP-swing (verschil). We appenden aan de door de speler getypte notes en zorgen

  const marginLine = (): string => {
    if (!tpRes) {
      if (res.winnaar === null) return `Result: Draw (${res.verschil} VP swing)`;
      const wn = res.winnaar === 'host' ? hostName : guestName;
      return `Result: ${uitslagLabel(res.uitslag)} — ${wn} +${res.verschil} VP`;
    }
    if (tpRes === 'D') return `Result: Draw (${res.verschil} VP difference) — 3 Fame each`;
    const winRes = tpWinnaar === 'host' ? tpRes : SPIEGEL[tpRes];
    const winName = tpWinnaar === 'host' ? hostName : guestName;
    // Trok iemand zich terug, dan wijkt de trede bewust af van het VP-verschil. Dat hoort in de notes,
    // anders leest de grensmaster straks een Resounding bij 80 VP verschil en snapt hij er niets van.
    const wLine = withdrew ? ` · ${withdrew === 'host' ? hostName : guestName} withdrew` : '';
    return `Result: ${RESULTAAT_NAAM[winRes]} — ${winName} (+${res.verschil} VP)${wLine} · Fame ${TP_VAN_RESULTAAT[winRes]}–${TP_VAN_RESULTAAT[SPIEGEL[winRes]]}`;
  };

  const submit = async () => {
    if (!attackerId || !defenderId) { setErr('This battle is missing its campaign players.'); return; }
    setBusy(true);
    setErr(null);
    const winnaar = tpWinnaar === 'host' ? attackerId : tpWinnaar === 'guest' ? defenderId : null;
    // Notes = wat de speler typte + de marge-regel; null alleen als beide leeg zijn.
    const notities = [notes.trim(), marginLine()].filter(Boolean).join('\n') || null;
    const resultaat: BattleResultaat = {
      winnaar,
      vp: { [attackerId]: vpHost, [defenderId]: vpGuest },
      kills,
      notities,
      veteraan,
      questAanv: questAanvOk || undefined,
      questVerd: questVerdOk || undefined,
      terugtrokken: terugtrokken ?? undefined,
    };
    try {
      await reportBattleResult(code, resultaat);
      setDone(true);
      setOpen(false);
    } catch (e) {
      setErr(reportFoutTekst((e as { message?: string })?.message || (e instanceof Error ? e.message : '') || ''));
    } finally {
      setBusy(false);
    }
  };

  const box: React.CSSProperties = { border: `1px solid ${TOW.goldDeep}`, borderRadius: 12, background: 'rgba(184,134,47,0.08)', padding: '13px 14px' };
  // Ingebed levert het overzicht zelf de kaart; dan geen eigen rand/achtergrond/padding.
  const formWrap: React.CSSProperties = embedded ? {} : box;

  if (done) {
    return (
      <div style={formWrap}>
        <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 4 }}>Result reported</div>
        <div style={{ fontFamily: serif, fontSize: 13.5, color: TOW.ink }}>Reported — the campaign grensmaster approves it.</div>
        <button onClick={() => { setDone(false); setOpen(true); }} style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: serif, fontSize: 12.5, color: TOW.muted, textDecoration: 'underline' }}>Report again</button>
      </div>
    );
  }

  if (!open && !embedded) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...box, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: display, fontWeight: 700, fontSize: 14, color: TOW.goldDeep }}>Report result to campaign</span>
          <span style={{ display: 'block', fontFamily: serif, fontSize: 12, color: TOW.muted }}>Send winner, VP and casualties back to De Grensvorsten — fill in the roster first: losses, Fleeing, Removed and Kills all count</span>
        </span>
        <span aria-hidden style={{ color: TOW.goldDeep, fontSize: 18, flexShrink: 0 }}>›</span>
      </button>
    );
  }

  return (
    <div style={formWrap}>
      <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 8 }}>Report result · {code}</div>

      <div style={{ border: `1px solid ${TOW.goldDeep}`, borderRadius: 9, background: 'rgba(184,134,47,0.08)', padding: '8px 10px', marginBottom: 12 }}>
        <div style={{ ...eb, fontSize: 8, color: TOW.goldDeep, marginBottom: 3 }}>Before you send</div>
        <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim, lineHeight: 1.5 }}>
          The numbers below are calculated from what you filled in on the roster, so fill it in
          completely: <strong style={{ color: TOW.ink }}>models and wounds lost</strong>,
          {' '}<strong style={{ color: TOW.ink }}>Fleeing</strong> and{' '}
          <strong style={{ color: TOW.ink }}>Removed</strong>, the{' '}
          <strong style={{ color: TOW.ink }}>General / BSB / standards</strong> boxes and any{' '}
          <strong style={{ color: TOW.ink }}>objective VP</strong>. Those decide the Victory Points and
          therefore the result and the Fame. And <strong style={{ color: TOW.ink }}>Kills</strong> per unit
          decide the Veteran XP your units take home — an empty counter is a unit that learned nothing.
          Once the result is in, none of it can be corrected.
        </div>
      </div>

      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Victory points (calculated)</div>
      <div style={{ fontFamily: serif, fontSize: 13.5, color: TOW.ink, marginBottom: 4 }}>
        {hostName}: <strong>{vpHost}</strong> · {guestName}: <strong>{vpGuest}</strong>
        {kills.length > 0 && <span style={{ color: TOW.muted }}> · {kills.length} unit{kills.length === 1 ? '' : 's'} with losses</span>}
      </div>

      {/* TERUGTREKKEN (17-08-2026) — het enige feit over de uitslag dat de VP-telling niet kan zien.
          Staat vóór de uitslag, want het verandert 'm: de trede wordt minimaal Resounding voor de
          andere kant. Drie knoppen in plaats van een vinkje per kant, zodat "beiden trokken zich
          terug" niet eens te klikken is. */}
      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Did an army withdraw?</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: withdrew ? 6 : 12 }}>
        {([null, 'host', 'guest'] as const).map((keuze) => {
          const actief = withdrew === keuze || (keuze === null && !withdrew);
          const label = keuze === null ? 'Neither' : keuze === 'host' ? `${hostName} withdrew` : `${guestName} withdrew`;
          return (
            <button
              key={keuze ?? 'geen'}
              onClick={() => zetWithdrew(keuze)}
              style={{
                cursor: 'pointer', borderRadius: 8, padding: '5px 9px',
                fontFamily: serif, fontSize: 12.5,
                border: `1px solid ${actief ? TOW.goldDeep : TOW.line}`,
                background: actief ? 'rgba(184,134,47,0.16)' : 'transparent',
                color: actief ? TOW.ink : TOW.muted,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      {withdrew && (
        <div style={{ fontFamily: serif, fontSize: 12, color: TOW.muted, lineHeight: 1.45, marginBottom: 12 }}>
          A withdrawing army saves its units — no wound rolls, no Battlefield Losses — but hands over the
          battle: the result below is fixed at <strong style={{ color: TOW.ink }}>at least a Resounding
          Victory</strong> for the other side. A Crushing against the withdrawing army still stands.
        </div>
      )}

      {/* De uitslag wordt niet meer gekozen: het VP-verschil bepaalt 'm via de officiële
          Tournament-Points-tabel, en die Tournament Points zijn de Fame die de campagne uitkeert. */}
      {tpRes ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: display, fontWeight: 700, fontSize: 13, color: tpRes === 'D' ? TOW.muted : TOW.goldBright }}>
            {tpRes === 'D'
              ? `Draw · ${res.verschil} VP difference`
              : `${RESULTAAT_NAAM[tpWinnaar === 'host' ? tpRes : SPIEGEL[tpRes]]} — ${tpWinnaar === 'host' ? hostName : guestName}`}
          </div>
          <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.muted, marginTop: 2 }}>
            {res.verschil} VP difference · Fame {hostName} <strong style={{ color: TOW.ink }}>{TP_VAN_RESULTAAT[tpRes]}</strong>
            {' · '}{guestName} <strong style={{ color: TOW.ink }}>{TP_VAN_RESULTAAT[SPIEGEL[tpRes]]}</strong>
          </div>
        </div>
      ) : (
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 13, color: res.winnaar ? TOW.goldDeep : TOW.muted, marginBottom: 12 }}>
          {uitslagLabel(res.uitslag)} · +{res.verschil} VP
        </div>
      )}

      {veteraanPerZijde.length > 0 && (
        <>
          {/* BEIDE legers, niet alleen dat van de melder. Wie indient, dient in voor de tafel —
              anders loopt de tegenstander zijn XP mis zonder dat iemand het merkt. */}
          <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Veterans · XP earned</div>
          {veteraanPerZijde.map((zijde) => (
            <div key={zijde.seat} style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: display, fontWeight: 600, fontSize: 12, color: TOW.goldDeep, marginBottom: 3 }}>{zijde.naam}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {zijde.items.map((v, i) => {
                  const xp = (v.overleefd_50 ? 1 : 0) + v.kills + (v.bonusXp ?? 0);
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: serif, fontSize: 13, color: TOW.ink }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {/* Datasheet primair, de eigen naam erachter: bij een leger vol eigennamen zie je
                            anders niet meer welke unit welke XP pakt. */}
                        {toonVan(v.unitId).primair || v.naam || v.unitId}
                        {toonVan(v.unitId).secundair ? (
                          <span style={{ color: TOW.muted, fontStyle: 'italic' }}> · {toonVan(v.unitId).secundair}</span>
                        ) : null}
                      </span>
                      <span style={{ flexShrink: 0, fontFamily: display, fontWeight: 600, fontSize: 12, color: xp > 0 ? TOW.goldDeep : TOW.muted }}>
                        {xp > 0 ? `+${xp} XP` : '—'}{v.scar_trigger ? ' · scar risk' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.muted, marginBottom: 12 }}>
            +1 XP for surviving above 50% strength, +1 per kill/trophy — applied to both armies’ campaign veterans once the grensmaster approves.
          </div>
        </>
      )}

      {/* Battle-quests (01-08). Tafel-feiten die de campagne-app niet kan verifiëren, dus vinken de twee
          spelers ze hier samen af — beiden zien beide quests en beiden mogen ze zetten. De vinkjes
          staan op de tracker (realtime gedeeld) en zitten in de report-sig, dus een wijziging laat de
          goedkeuringen vervallen. Alleen battle-quests komen hier binnen; realm-quests worden
          server-side geverifieerd bij het afsluiten van de Act. */}
      {(quests.aanvaller || quests.verdediger) && (
        <>
          <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Battle quests — did they pull it off?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {([['host', quests.aanvaller, hostName, questAanvOk] as const, ['guest', quests.verdediger, guestName, questVerdOk] as const])
              .filter(([, q]) => !!q)
              .map(([kant, q, naam, ok]) => (
                // Een NIET-aangevinkte quest stond volledig in TOW.muted: titel, opdracht en beloning
                // allemaal grijs, op een grijze rand, zonder achtergrond. Dat leest als disabled
                // terwijl dit juist de knop is die je moet indrukken (Joost, 02-08). Ongevinkt is nu
                // een gewone actieve kaart met een zichtbaar leeg vakje; alleen de BELONING blijft
                // gedempt, want die is nog niet verdiend.
                <button
                  key={kant}
                  type="button"
                  aria-pressed={ok}
                  onClick={() => zetQuest(kant, !ok)}
                  style={{
                    textAlign: 'left', cursor: 'pointer', borderRadius: 9, padding: '9px 11px',
                    border: `1px solid ${ok ? TOW.goldDeep : TOW.lineStrong}`,
                    background: ok ? TOW.cardLt : TOW.panel2,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                    <span
                      aria-hidden
                      style={{
                        flexShrink: 0, width: 15, height: 15, borderRadius: 4, alignSelf: 'center',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        border: `1px solid ${ok ? TOW.gold : TOW.lineStrong}`,
                        background: ok ? TOW.gold : 'transparent',
                        color: TOW.onGrad, fontSize: 11, lineHeight: 1,
                      }}
                    >
                      {ok ? '✓' : ''}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontFamily: display, fontSize: 13, color: TOW.ink }}>
                      {q!.naam}
                      <span style={{ fontFamily: serif, fontWeight: 400, color: TOW.muted }}> — {naam}</span>
                    </span>
                  </div>
                  <div style={{ fontFamily: serif, fontSize: 12, color: TOW.inkDim, marginTop: 3 }}>{q!.opdracht}</div>
                  <div style={{ fontFamily: serif, fontSize: 11.5, color: ok ? TOW.gold : TOW.muted, marginTop: 2, fontStyle: 'italic' }}>
                    {ok ? `+${q!.fame} Fame, +${q!.goud} gold` : `+${q!.fame} Fame, +${q!.goud} gold if achieved — tap to mark it done`}
                  </div>
                </button>
              ))}
          </div>
        </>
      )}

      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Notes (optional)</div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything the campaign should know…" style={{ width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, padding: '9px 11px', fontFamily: serif, fontSize: 13, boxSizing: 'border-box', resize: 'vertical', marginBottom: 12 }} />

      {/* Battle-foto's (24-08-2026, Joost): max 3 per kant, aan de battle gekoppeld. Ze verschijnen
          in de Battle Log van de campagne en zijn het beeldmateriaal voor de chronicles. Uploaden mag
          vóór en ná het indienen van de uitslag; verwijderen kan alleen je eigen foto's. */}
      {battle && (() => {
        const mijnSpelerId = ownSeat === 'host' ? battle.aanvaller.id : battle.verdediger.id;
        const mijnFotos = fotos.filter((f) => f.speler === mijnSpelerId);
        const hunFotos = fotos.filter((f) => f.speler !== mijnSpelerId);
        const kiesFotos = async (files: FileList | null) => {
          if (!files || fotoBezig) return;
          setFotoBezig(true);
          setFotoFout(null);
          try {
            const ruimte = 3 - mijnFotos.length;
            const nieuw2: string[] = [];
            for (const f of Array.from(files).slice(0, Math.max(0, ruimte))) {
              nieuw2.push(await battleFotoUpload(battle.id, mijnSpelerId, f));
            }
            if (nieuw2.length === 0) { setFotoFout('Three photos is the limit — remove one first.'); return; }
            setFotos(await battleFotosZet(code!, mijnSpelerId, [...mijnFotos.map((f) => f.url), ...nieuw2]));
          } catch (e) {
            setFotoFout(e instanceof Error ? e.message : String(e));
          } finally {
            setFotoBezig(false);
          }
        };
        const wisFoto = async (url: string) => {
          if (fotoBezig) return;
          setFotoBezig(true);
          setFotoFout(null);
          try {
            setFotos(await battleFotosZet(code!, mijnSpelerId, mijnFotos.map((f) => f.url).filter((u) => u !== url)));
            void battleFotoWis(url);
          } catch (e) {
            setFotoFout(e instanceof Error ? e.message : String(e));
          } finally {
            setFotoBezig(false);
          }
        };
        const thumb = (f: BattleFoto, vanMij: boolean) => (
          <div key={f.url} style={{ position: 'relative', width: 74, height: 74, borderRadius: 9, overflow: 'hidden', border: `1px solid ${TOW.lineStrong}` }}>
            <a href={f.url} target="_blank" rel="noreferrer">
              <img src={f.url} alt="Battle photo" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </a>
            {vanMij && (
              <button
                type="button"
                onClick={() => void wisFoto(f.url)}
                aria-label="Remove photo"
                style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 10, border: 'none', background: 'rgba(20,14,8,0.75)', color: '#e8dcc4', fontSize: 12, lineHeight: '20px', padding: 0, cursor: 'pointer' }}
              >
                ×
              </button>
            )}
          </div>
        );
        return (
          <div style={{ borderRadius: 12, border: `1px solid ${TOW.line}`, padding: '11px 12px', marginBottom: 12 }}>
            <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Battle photos (up to 3)</div>
            <div style={{ fontFamily: serif, fontSize: 12, color: TOW.muted, lineHeight: 1.45, marginBottom: 8 }}>
              Upload the three best moments of this battle — the most characteristic or the most epic.
              They are kept with the battle in the campaign's Battle Log, and the chronicles are written
              from them.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {mijnFotos.map((f) => thumb(f, true))}
              {mijnFotos.length < 3 && (
                <label style={{ width: 74, height: 74, borderRadius: 9, border: `1px dashed ${TOW.goldDeep}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: fotoBezig ? 'default' : 'pointer', color: TOW.gold, fontFamily: serif, fontSize: 11.5, textAlign: 'center', opacity: fotoBezig ? 0.5 : 1 }}>
                  {fotoBezig ? 'Uploading…' : 'Add photo'}
                  <input type="file" accept="image/*" multiple disabled={fotoBezig} style={{ display: 'none' }} onChange={(e) => { void kiesFotos(e.target.files); e.target.value = ''; }} />
                </label>
              )}
            </div>
            {hunFotos.length > 0 && (
              <div style={{ marginTop: 9 }}>
                <div style={{ fontFamily: serif, fontSize: 11, color: TOW.muted, marginBottom: 5 }}>From the other side of the table:</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{hunFotos.map((f) => thumb(f, false))}</div>
              </div>
            )}
            {fotoFout && <div style={{ fontFamily: serif, fontSize: 12, color: TOW.blood, marginTop: 7 }}>{fotoFout}</div>}
          </div>
        );
      })()}

      {/* De chronicler. Persoonlijk, niet gedeeld: dit stuk hangt aan JOU, niet aan de battle, dus
          beide kanten kunnen hun eigen versie van hetzelfde gevecht schrijven. Eigen opslaan-knop,
          want wie de uitslag indient doet er niet toe — en het mag ook nog ná het indienen. */}
      {battle && (
        <div style={{ borderRadius: 12, border: `1px solid ${TOW.line}`, padding: '11px 12px', marginBottom: 12 }}>
          <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Your chronicler (optional)</div>
          <div style={{ fontFamily: serif, fontSize: 12, color: TOW.muted, lineHeight: 1.45, marginBottom: 7 }}>
            How did your house tell this battle? Write it in your own words — it is yours alone, and it
            becomes part of the story of Celedon.
          </div>
          <textarea
            value={kroniek}
            onChange={(e) => setKroniek(e.target.value.slice(0, 8000))}
            rows={5}
            placeholder="What your chronicler should remember about this battle…"
            style={{ width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, padding: '9px 11px', fontFamily: serif, fontSize: 13, boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 7, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void bewaarKroniek()}
              disabled={kroniekBezig || kroniek.trim() === kroniekOpgeslagen}
              style={{
                borderRadius: 9, border: `1px solid ${TOW.goldDeep}`, background: 'transparent',
                color: TOW.ink, padding: '6px 12px', fontFamily: serif, fontSize: 12.5,
                cursor: kroniekBezig || kroniek.trim() === kroniekOpgeslagen ? 'default' : 'pointer',
                opacity: kroniekBezig || kroniek.trim() === kroniekOpgeslagen ? 0.4 : 1,
              }}
            >
              {kroniekBezig ? 'Writing…' : kroniekOpgeslagen ? 'Update the entry' : 'Give it to your chronicler'}
            </button>
            <span style={{ fontFamily: serif, fontSize: 11, color: TOW.muted }}>{kroniek.length} characters</span>
            {kroniekMelding && <span style={{ fontFamily: serif, fontSize: 11, color: TOW.muted }}>{kroniekMelding}</span>}
          </div>
        </div>
      )}

      {/* Beide spelers moeten akkoord gaan. Wijzigt iemand daarna nog een cijfer, dan klopt de sig niet
          meer en staan beide vinkjes vanzelf weer uit. Tegen een AI (of solo) is er niemand om het mee
          eens te worden: dan geen vinkjes-blok, want een knop die op niemand kan wachten is een val. */}
      {!geenTegenpartij && (
        <>
          <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Both players must agree</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            {([['host', hostName, hostOk], ['guest', guestName, guestOk]] as const).map(([kant, naam, ok]) => (
              <div
                key={kant}
                style={{
                  flex: 1, minWidth: 0, borderRadius: 9, padding: '8px 10px',
                  border: `1px solid ${ok ? TOW.goldDeep : TOW.line}`,
                  background: ok ? TOW.cardLt : 'transparent',
                  fontFamily: serif, fontSize: 12.5, color: ok ? TOW.ink : TOW.muted,
                  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                }}
              >
                {ok ? '✓ ' : '○ '}{naam}
                {kant === ownSeat && <span style={{ color: TOW.muted }}> (you)</span>}
              </div>
            ))}
          </div>
          <button
            onClick={() => zetAkkoord(!ikOk)}
            style={{
              width: '100%', marginBottom: 10, borderRadius: 10, cursor: 'pointer', padding: '10px 14px',
              border: `1px solid ${ikOk ? TOW.lineStrong : TOW.goldDeep}`,
              background: ikOk ? 'transparent' : TOW.cardLt,
              color: ikOk ? TOW.muted : TOW.ink, fontFamily: display, fontWeight: 600, fontSize: 13.5,
            }}
          >
            {ikOk ? 'Withdraw my approval' : 'I agree with this result'}
          </button>
          <div style={{ fontFamily: serif, fontSize: 12, color: TOW.muted, marginBottom: 12 }}>
            {beidenAkkoord
              ? 'Both approved — either player can send it to the campaign now.'
              : ikOk
                ? `Waiting for ${ownSeat === 'host' ? guestName : hostName} to approve.`
                : tegenOk
                  ? `${ownSeat === 'host' ? guestName : hostName} approved — check the numbers and approve to unlock sending.`
                  : 'Change any number and both approvals reset, so you always agree on the same result.'}
          </div>
        </>
      )}

      {/* Wel een tegenstander, maar een AI: zeg waarom er niets goed te keuren valt. Anders lijkt het
          alsof de dubbele goedkeuring stuk is. */}
      {tegenIsAi && (
        <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.muted, marginBottom: 12 }}>
          {(ownSeat === 'host' ? battle?.verdediger.naam : battle?.aanvaller.naam) || 'Your opponent'} is run by the
          campaign, so there is no second approval — check the numbers and send it in.
        </div>
      )}

      {err && <div style={{ fontFamily: serif, fontSize: 13, color: TOW.blood, marginBottom: 10 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={submit}
          disabled={busy || !beidenAkkoord}
          style={{
            flex: 1, border: 'none', borderRadius: 10, cursor: busy || !beidenAkkoord ? 'not-allowed' : 'pointer',
            padding: '11px 16px', background: `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`,
            color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: 14,
            opacity: busy || !beidenAkkoord ? 0.45 : 1,
          }}
        >
          {busy ? 'Reporting…' : beidenAkkoord ? 'Report to campaign' : 'Both must approve first'}
        </button>
        {!embedded && <button onClick={() => setOpen(false)} style={{ border: `1px solid ${TOW.lineStrong}`, borderRadius: 10, background: 'transparent', color: TOW.muted, cursor: 'pointer', padding: '11px 14px', fontFamily: display, fontSize: 13 }}>Cancel</button>}
      </div>
    </div>
  );
}
