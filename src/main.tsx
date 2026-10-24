import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
// Het Scenario lab (alleen test-build, `?lab=1`) moet zijn sleutel-omleiding in de store zetten VÓÓR App
// en z'n modules geladen worden (AppShell schrijft al op module-niveau naar de store). Zie lib/labModus.ts.
import './lib/labModus';
import App from './App';
import { Vangnet } from './components/Vangnet';

// The service worker is registered inside <UpdatePrompt>, which also surfaces the
// "Update available" banner and the offline-ready toast.

// Opruimen (04-10-2026): localStorage-sleutels die niets meer doen. `tow:builder-v2` was de vlag voor
// de oude builder (BuilderWorkspace, verwijderd): wie hem op false had staan, krijgt gewoon de enige
// builder die er nog is. `tow:campaignCode` is de losse koppelcode uit de tijd vóór de account-
// koppeling; getCampaignCode() leest hem niet meer.
for (const sleutel of ['tow:builder-v2', 'tow:campaignCode']) {
  try { localStorage.removeItem(sleutel); } catch { /* geen opslag beschikbaar: niets op te ruimen */ }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Vangnet>
      <App />
    </Vangnet>
  </StrictMode>,
);
