import { useEffect, useState } from 'react';
import { TOW, towFont, engraved } from '../design/tow';
import { usePwa } from '../pwa';

const eb = engraved as React.CSSProperties;

// A small bottom banner: "Update available" with an Update button (and a one-time
// "offline ready" toast). Install lives in Settings; this is just the proactive nudge.
export function UpdatePrompt() {
  const { needRefresh, updateApp, offlineReady } = usePwa();
  const [dismissed, setDismissed] = useState(false);
  const [showOffline, setShowOffline] = useState(false);

  useEffect(() => {
    if (!offlineReady) return;
    setShowOffline(true);
    const t = setTimeout(() => setShowOffline(false), 4000);
    return () => clearTimeout(t);
  }, [offlineReady]);

  const showUpdate = needRefresh && !dismissed;
  if (!showUpdate && !showOffline) return null;

  const wrap: React.CSSProperties = {
    position: 'fixed',
    left: '50%',
    transform: 'translateX(-50%)',
    bottom: 'max(16px, env(safe-area-inset-bottom))',
    zIndex: 9999,
    width: 'min(440px, calc(100% - 24px))',
  };

  if (showUpdate) {
    return (
      <div style={wrap}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 12px 12px 16px',
            borderRadius: 14,
            background: 'linear-gradient(180deg, #fbf3df, #f1e6c9)',
            border: `1px solid ${TOW.goldDeep}`,
            boxShadow: '0 10px 30px rgba(60,44,18,0.35)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...eb, fontSize: 9, color: TOW.goldDeep }}>Update available</div>
            <div style={{ fontFamily: towFont.serif, fontSize: 14.5, color: TOW.ink, lineHeight: 1.35, marginTop: 2 }}>
              A new version of the companion is ready.
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            style={{ flexShrink: 0, border: 'none', background: 'transparent', color: TOW.muted, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '6px 8px' }}
          >
            ✕
          </button>
          <button
            onClick={updateApp}
            style={{
              flexShrink: 0,
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
              padding: '10px 16px',
              background: `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`,
              color: TOW.onGrad,
              fontFamily: towFont.display,
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: '0.02em',
              boxShadow: '0 3px 10px rgba(122,93,36,0.3)',
            }}
          >
            Update
          </button>
        </div>
      </div>
    );
  }

  // offlineReady toast
  return (
    <div style={wrap}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 16px',
          borderRadius: 14,
          background: 'linear-gradient(180deg, #fbf3df, #f1e6c9)',
          border: `1px solid ${TOW.lineStrong}`,
          boxShadow: '0 8px 24px rgba(60,44,18,0.28)',
        }}
      >
        <span style={{ color: TOW.goldDeep, fontSize: 16 }}>✓</span>
        <div style={{ fontFamily: towFont.serif, fontSize: 14, color: TOW.ink }}>Ready to use offline.</div>
      </div>
    </div>
  );
}
