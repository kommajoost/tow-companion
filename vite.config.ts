import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Build stamp shown in Settings → so you can tell which deploy is live without diffing the JS hash.
// The patch number auto-increments per deploy: it's the git commit count, so every pushed commit
// (= every Vercel deploy) bumps the version (0.1.<count>). major.minor come from package.json.
const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
let buildSha = (process.env.VERCEL_GIT_COMMIT_SHA || '').trim();
try { if (!buildSha) buildSha = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* no git */ }
buildSha = buildSha ? buildSha.slice(0, 7) : 'dev';
let commitCount = '';
try { commitCount = execSync('git rev-list --count HEAD').toString().trim(); } catch { /* no git */ }
const [maj = '0', min = '1'] = pkgVersion.split('.');
const appVersion = commitCount && commitCount !== '0' ? `${maj}.${min}.${commitCount}` : pkgVersion;
const buildDate = new Date().toISOString().slice(0, 10);

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  server: { port: 5174, strictPort: true, host: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo.png'],
      manifest: {
        name: 'Old World Turn Companion',
        short_name: 'OW Companion',
        description:
          'Warhammer: The Old World — turn-by-turn rules companion. Walk through every phase and sub-phase with the full rules at hand.',
        theme_color: '#e2d5b6',
        background_color: '#ece1c7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache only the lightweight app shell + icons so the service worker installs
        // fast and reliably (a precondition for Chrome's "Install" prompt). The big data
        // files (rules.json ~14 MB, companion.json, flow.json) are cached at runtime on
        // first use instead — the app still works offline after one visit.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Take control of the page on the FIRST visit. Without this the SW only controls
        // the page after a reload, and Chrome won't offer "Install" until it does.
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
        // Never let the SW handle navigations to API/auth paths (defensive).
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/realtime\//],
        runtimeCaching: [
          {
            // Supabase game data + realtime REST: always go straight to the network, never
            // cache or buffer. A stale/half-updated SW must not break create/join/sync.
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => /\.(?:json)$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'tow-data',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
