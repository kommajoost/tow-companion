import { DataProvider } from './data';
import { UIStateProvider } from './state';
import { GameProvider } from './game';
import { ListSyncProvider } from './listSync';
import { PwaProvider } from './pwa';
import { AppShell } from './components/AppShell';
import { RuleSheet } from './components/RuleSheet';
import { SyncConflictSheet } from './components/SyncConflictSheet';
import { UpdatePrompt } from './components/UpdatePrompt';

export default function App() {
  return (
    <PwaProvider>
      <DataProvider>
        <UIStateProvider>
          <GameProvider>
            <ListSyncProvider>
              <AppShell />
              <RuleSheet />
              {/* Vraagt welke kopie je houdt als synchroniseren lijsten zou wissen. Binnen de provider,
                  want hij leest de botsing daaruit; app-breed, want hij mag geen enkel scherm missen. */}
              <SyncConflictSheet />
            </ListSyncProvider>
          </GameProvider>
        </UIStateProvider>
        {/* Shows an "Update available" banner; install/updates also live in Settings. */}
        <UpdatePrompt />
      </DataProvider>
    </PwaProvider>
  );
}
