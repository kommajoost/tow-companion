import { DataProvider } from './data';
import { UIStateProvider } from './state';
import { GameProvider } from './game';
import { ListSyncProvider } from './listSync';
import { CampaignProvider } from './campaign'; // CAMPAIGN INTEGRATION
import { PwaProvider } from './pwa';
import { AppShell } from './components/AppShell';
import { RuleSheet } from './components/RuleSheet';
import { UpdatePrompt } from './components/UpdatePrompt';

export default function App() {
  return (
    <PwaProvider>
      <DataProvider>
        <UIStateProvider>
          <GameProvider>
            <ListSyncProvider>
              {/* CAMPAIGN INTEGRATION — wraps the shell so the Campaign tab can read shared state */}
              <CampaignProvider>
                <AppShell />
                <RuleSheet />
              </CampaignProvider>
            </ListSyncProvider>
          </GameProvider>
        </UIStateProvider>
        {/* Shows an "Update available" banner; install/updates also live in Settings. */}
        <UpdatePrompt />
      </DataProvider>
    </PwaProvider>
  );
}
