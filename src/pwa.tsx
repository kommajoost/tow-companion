import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { registerSW } from 'virtual:pwa-register';

// Chrome's beforeinstallprompt event (not in the standard lib types).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaContextValue {
  /** A native install prompt is available (Chrome/Android/desktop). */
  canInstall: boolean;
  /** The app is already running installed (standalone display mode). */
  installed: boolean;
  /** Trigger the native install prompt; resolves true if the user accepted. */
  promptInstall: () => Promise<boolean>;
  /** A new app version is ready to activate. */
  needRefresh: boolean;
  /** Activate the waiting service worker and reload into the new build. */
  updateApp: () => void;
  /** True once the SW has cached the shell for offline use. */
  offlineReady: boolean;
  /** Manually check the server for a newer deployment. */
  checkForUpdate: () => void;
}

const Ctx = createContext<PwaContextValue | null>(null);

export function usePwa(): PwaContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePwa must be used within <PwaProvider>');
  return ctx;
}

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true);

export function PwaProvider({ children }: { children: ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(isStandalone);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const updateSWRef = useRef<((reload?: boolean) => Promise<void>) | null>(null);
  const regRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  // A waiting update is ready to activate — mirrored in a ref so the visibility/focus
  // listeners (registered once) always see the current value.
  const needRefreshRef = useRef(false);
  // Guard so we apply-and-reload at most once (updateSW reloads the page; without this a
  // rapid visible→hidden→visible could fire a second reload before the first lands).
  const appliedRef = useRef(false);

  // Activate the waiting service worker and reload into the new build. Safe to call more
  // than once — only the first call does anything.
  const applyUpdate = useCallback(() => {
    if (appliedRef.current || !needRefreshRef.current) return;
    appliedRef.current = true;
    updateSWRef.current?.(true);
  }, []);

  // Capture the install prompt + installed state.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onDisplay = () => setInstalled(isStandalone());
    mq?.addEventListener?.('change', onDisplay);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      mq?.removeEventListener?.('change', onDisplay);
    };
  }, []);

  // Register the service worker (single source of truth for update state).
  useEffect(() => {
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true);
        needRefreshRef.current = true;
        // If the app is in the background when the new build arrives, apply it right away
        // so the user lands on the fresh version the moment they return. While the app is
        // visible we DON'T yank the page mid-use — the return-to-foreground handler below
        // (or the "Update available" banner) applies it at a safe moment instead.
        if (document.visibilityState !== 'visible') applyUpdate();
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
      onRegisteredSW(_swUrl, reg) {
        regRef.current = reg;
        if (reg) setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
      },
    });
    updateSWRef.current = update;
  }, [applyUpdate]);

  // Keep the app fresh "on use": every time it comes to the foreground, check the server
  // for a newer deploy and — if one is already waiting — silently activate it and reload.
  // Coming back to the app is a natural safe boundary, so this never interrupts active play.
  useEffect(() => {
    const onForeground = () => {
      if (document.visibilityState !== 'visible') return;
      regRef.current?.update().catch(() => {}); // pull in a just-shipped deploy
      applyUpdate(); // apply one that's already waiting
    };
    document.addEventListener('visibilitychange', onForeground);
    window.addEventListener('focus', onForeground);
    return () => {
      document.removeEventListener('visibilitychange', onForeground);
      window.removeEventListener('focus', onForeground);
    };
  }, [applyUpdate]);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome === 'accepted';
  }, [deferred]);

  const updateApp = useCallback(() => {
    applyUpdate();
  }, [applyUpdate]);

  const checkForUpdate = useCallback(() => {
    regRef.current?.update().catch(() => {});
  }, []);

  const value = useMemo<PwaContextValue>(
    () => ({
      canInstall: !!deferred && !installed,
      installed,
      promptInstall,
      needRefresh,
      updateApp,
      offlineReady,
      checkForUpdate,
    }),
    [deferred, installed, promptInstall, needRefresh, updateApp, offlineReady, checkForUpdate],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
