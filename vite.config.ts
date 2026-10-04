import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Build stamp shown in Settings → so you can tell which deploy is live without diffing the JS hash.
// The version (0.1.<commit count>) is baked into package.json by `npm run stamp-version`, run
// before each deploy — Vercel shallow-clones, so a build-time `git rev-list --count` is unreliable
// there; we read the locally-stamped package.json instead. The sha/date are still build-time.
const appVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
let buildSha = (process.env.VERCEL_GIT_COMMIT_SHA || '').trim();
try { if (!buildSha) buildSha = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* no git */ }
buildSha = buildSha ? buildSha.slice(0, 7) : 'dev';
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
        name: 'Old World Companion',
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
        // files (rules.json ~16 MB, companion.json, owb/*, renegade/*) are cached at runtime on
        // first use instead — the app still works offline after one visit.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Take control of the page on the FIRST visit. Without this the SW only controls
        // the page after a reload, and Chrome won't offer "Install" until it does.
        clientsClaim: true,
        // skipWaiting stays OFF on purpose. With registerType 'prompt' the NEW service
        // worker must WAIT (not self-activate) so we can apply it at a safe moment —
        // updateApp()/return-to-foreground posts SKIP_WAITING then reloads (see pwa.tsx).
        // skipWaiting:true here would activate the new SW under the still-running old
        // bundle, evict its hashed chunks, and break lazy-loads — the "update goes bad"
        // bug. First install still activates immediately (no old worker to wait behind).
        skipWaiting: false,
        navigateFallback: 'index.html',
        // Never let the SW handle navigations to API/auth paths (defensive). Ook robots.txt niet
        // (04-10-2026): wie hem in een tab met een actieve SW opent, kreeg anders index.html terug.
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/realtime\//, /^\/robots\.txt$/],
        runtimeCaching: [
          {
            // Supabase game data + realtime REST: always go straight to the network, never
            // cache or buffer. A stale/half-updated SW must not break create/join/sync.
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
          {
            // De PDF-fonts (public/pdf-fonts/*.ttf, ~1,5 MB samen). Ze zitten NIET in de precache:
            // dat zou de installatie van de service worker onnodig zwaar maken voor iedereen, terwijl
            // alleen wie op PDF drukt ze nodig heeft. Wél cachen zodra ze één keer opgehaald zijn,
            // want zonder de fontbestanden valt de PDF-knop offline terug op het printvenster.
            // CacheFirst met een ruime houdbaarheid: een fontbestand verandert niet.
            urlPattern: ({ url }) => /\.ttf$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tow-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // DE DATABESTANDEN (rules.json ~16 MB, companion.json, owb/*.json, renegade/*.json).
            //
            // NetworkFirst, sinds 04-10-2026 (G9). Hiervoor StaleWhileRevalidate: die levert EERST de
            // oude kopie uit de cache en ververst pas op de achtergrond, dus na een data-deploy zag een
            // speler bij de eerstvolgende keer laden nog de oude regels/catalogus, en de lopende sessie
            // ving de nieuwe nooit op. Nu gaat elke load eerst naar het netwerk en is de cache alleen
            // de terugval: offline, of als er na `networkTimeoutSeconds` nog geen antwoord is (dan
            // wint de cache, en vult het netwerkantwoord de cache alsnog voor de volgende keer).
            //
            // Waarom geen ?v=<hash> in de URL of CacheFirst op een gehashte naam:
            //  - Vercel serveert deze bestanden met `max-age=0, must-revalidate` + ETag, dus de
            //    netwerkstap is bij ongewijzigde data een 304 van een paar honderd bytes; een
            //    versieparameter maakt het niet verser en zou ~30 fetch-plekken raken.
            //  - CacheFirst op een hash bindt de data aan de app-shell. Met registerType 'prompt' blijft
            //    een open tab bij herladen op de oude shell (de nieuwe SW wacht), en dus op de oude
            //    data: precies de klacht. NetworkFirst geeft ook die tab de nieuwe data.
            //  - Eén sleutel per bestand (de kale URL) houdt er één kopie per bestand in de cache; een
            //    sleutel per versie zou bij elke deploy een extra kopie van 16 MB achterlaten.
            // Kosten: het opstarten wacht nu op die (meestal 304-)ronde naar de server in plaats van
            // direct uit de cache te lezen; na een echte data-wijziging wacht het op de download.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\.(?:json)$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tow-data',
              networkTimeoutSeconds: 6,
              // Ruim genoeg voor alle databestanden (rules + companion + ~25 owb + 7 overlays + de
              // check-pagina); een te krappe grens gooide offline-kopieën weg die nog nodig waren.
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
