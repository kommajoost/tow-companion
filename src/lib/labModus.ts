/**
 * LABMODUS (23-10-2026) — de schakelaar van het Scenario lab, ALLEEN in de TEST-build.
 *
 * `?lab=1` in de URL zet deze pagina-sessie in het lab: App toont de lab-schil
 * (components/lab/ScenarioLab.tsx) in plaats van AppShell, en elke battle-sleutel in localStorage krijgt
 * een eigen voorvoegsel (`tow:lab:`, zie labSleutels.ts). Zo kan een lab-battle nooit het lopende
 * solo-potje, een campagne-battle of de wizard-draft van de echte app overschrijven: het lab leest en
 * schrijft een parallelle set sleutels.
 *
 * WAAROM IN DE STORE EN NIET PER COMPONENT. De battle-keten (GameProvider, GameMode, CampaignBattlePanel,
 * de Wrath-keuze, de objectives) praat via `usePersistentState`/`getPersisted`/`setPersisted` met vaste
 * sleutels, en het lab moet precies die echte componenten draaien. Eén omleiding in de store dekt ze
 * allemaal, ook de sleutels die buiten React worden gezet.
 *
 * VAST PER PAGINALADING. De vlag wordt één keer gelezen, en main.tsx importeert deze module als EERSTE,
 * vóór App: de omleiding staat dus al voordat een module-niveau `setPersisted` (AppShell) of de eerste
 * `usePersistentState` een sleutel aanmaakt. Wisselen tussen lab en app = een andere URL = een nieuwe
 * paginalading. Op een productiebundel (IS_TEST_DB false) is de vlag altijd uit en doet `?lab=1` niets.
 */
import { IS_TEST_DB } from './supabase';
import { zetSleutelOmleiding } from '../store';
import { labSleutel } from './labSleutels';

function leesVlag(): boolean {
  if (!IS_TEST_DB || typeof window === 'undefined') return false;
  try {
    const v = new URLSearchParams(window.location.search).get('lab');
    return v !== null && v !== '0' && v.toLowerCase() !== 'false';
  } catch {
    return false;
  }
}

/** Staat deze paginalading in het Scenario lab? Alleen ooit true op de test-build. */
export const LAB_ACTIEF = leesVlag();

if (LAB_ACTIEF) zetSleutelOmleiding(labSleutel);

/** De URL van het lab (zelfde origin), voor de knop in de test-build. */
export const LAB_URL = '/?lab=1';
