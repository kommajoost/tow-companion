import { DataProvider } from './data';
import { UIStateProvider } from './state';
import { GameProvider } from './game';
import { ListSyncProvider } from './listSync';
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
              <AppShell />
              <RuleSheet />
            </ListSyncProvider>
          </GameProvider>
        </UIStateProvider>
        {/* Shows an "Update available" banner; install/updates also live in Settings. */}
        <UpdatePrompt />
      </DataProvider>
    </PwaProvider>
  );
}
