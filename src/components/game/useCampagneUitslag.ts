/**
 * useCampagneUitslag — de OFFICIELE campagne-uitslag van een campagne-battle, opgehaald bij de server.
 *
 * WAAROM DIT BESTAAT (Joost 21-08-2026, met een screenshot: "waarom staat er crushing victory?").
 * OWC toonde de kale rulebook-regel: VP-verschil >= 100 is een victory, en heeft de winnaar minstens
 * twee keer zoveel VP als de verliezer, dan is het een Crushing Victory. Die regel is SCHAALLOOS. Op een
 * Battle March-tafel van 500 punten is 150 tegen 50 dus een "Crushing Victory", terwijl de campagne
 * dezelfde battle met de Tournament-Points-tabel afrekende. Twee verdicts op hetzelfde scherm.
 *
 * Bij een campagne-battle is de campagne-tabel de waarheid, en die vragen we op bij de SERVER
 * (`towc_vp_resultaat` via officieleUitslag) — bewust geen kopie van de tabel in OWC, want er staan al
 * twee exemplaren (campagne-DB + campagne-frontend) en een derde gaat onvermijdelijk uit de pas lopen.
 *
 * Geen campagne-battle, of een server zonder punten-cap? Dan geeft de hook null terug en valt de UI
 * terug op de kale rulebook-uitslag uit `berekenVictory` — voor een los potje is die immers juist.
 */
import { useEffect, useState } from 'react';
import { useGame } from '../../game';
import {
  battleByCode, officieleUitslag, RESULTAAT_NAAM, SPIEGEL, TP_VAN_RESULTAAT,
  type CampaignBattle, type ToernooiResultaat, type Terugtrekker,
} from '../../lib/campaignBattle';
import type { VpResultaat } from '../../lib/victoryPoints';

export interface CampagneUitslag {
  /** De trede vanuit de AANVALLER (= host) gezien. */
  tp: ToernooiResultaat;
  /** Leesbare naam vanuit de WINNAAR gezien ('Crushing Victory', 'Draw', …). */
  label: string;
  winnaar: 'host' | 'guest' | null;
  /** Tournament Points (= Fame) per kant. */
  tpHost: number;
  tpGuest: number;
  /** De punten-cap van de Act, voor de uitleg-regel ("500 pt bracket"). */
  cap: number;
  /** Is dit de zwaarste trede? (Voor de kleur van de headline.) */
  zwaar: boolean;
}

export function useCampagneUitslag(res: VpResultaat): CampagneUitslag | null {
  const { code, tracker } = useGame();
  const [battle, setBattle] = useState<CampaignBattle | null>(null);
  const [tp, setTp] = useState<ToernooiResultaat | null>(null);

  useEffect(() => {
    if (!code) { setBattle(null); return; }
    let alive = true;
    battleByCode(code).then((b) => { if (alive) setBattle(b); }).catch(() => { if (alive) setBattle(null); });
    return () => { alive = false; };
  }, [code]);

  // Host = aanvaller, guest = verdediger — de campagne denkt in rollen, OWC in seats. Zelfde vertaling
  // als in CampaignResultReporter; terugtrekken legt de trede vast op minimaal Resounding.
  const withdrew = tracker?.withdrew ?? null;
  const terugtrokken: Terugtrekker = withdrew === 'host' ? 'aanvaller' : withdrew === 'guest' ? 'verdediger' : null;
  const cap = battle?.cap ?? null;
  const hostVp = res.hostVp;
  const guestVp = res.guestVp;

  useEffect(() => {
    if (!cap) { setTp(null); return; }
    let alive = true;
    officieleUitslag(hostVp, guestVp, cap, terugtrokken)
      .then((r) => { if (alive) setTp(r); })
      .catch(() => { if (alive) setTp(null); });
    return () => { alive = false; };
  }, [cap, hostVp, guestVp, terugtrokken]);

  if (!tp || !cap) return null;
  const winnaar = tp === 'D' ? null : TP_VAN_RESULTAAT[tp] > 3 ? 'host' : 'guest';
  const vanuitWinnaar = winnaar === 'guest' ? SPIEGEL[tp] : tp;
  return {
    tp,
    label: RESULTAAT_NAAM[vanuitWinnaar],
    winnaar,
    tpHost: TP_VAN_RESULTAAT[tp],
    tpGuest: TP_VAN_RESULTAAT[SPIEGEL[tp]],
    cap,
    zwaar: tp === 'CV' || tp === 'CD',
  };
}
