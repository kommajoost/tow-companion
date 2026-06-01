# Old World Turn Companion

A mobile-first companion app for **Warhammer: The Old World**. Walk through a player
turn phase by phase, with the full rules for every sub-phase at hand, plus a searchable
rulebook, favourites, and tap-to-explain pop-ups for cross-referenced rules.

The rules text is taken **verbatim (in English)** from the community wiki
[tow.whfb.app](https://tow.whfb.app/) so it matches the source exactly. This app is an
unofficial, personal-use study aid. Warhammer: The Old World © Games Workshop.

## How it works

- `scripts/scrape.mjs` crawls the wiki (Next.js + Contentful) and writes the entire rule
  set, verbatim, to `public/rules.json` (the app fetches this once and caches it offline).
- The app is a Vite + React + TypeScript PWA, styled with Tailwind CSS v4.
- Inline links in the rules become tappable terms that open the referenced rule in a
  stacked bottom sheet — drill down and step back without losing your place.

## Develop

```bash
npm install
npm run scrape      # refresh public/rules.json from the wiki (optional; already included)
npm run dev         # start the dev server
npm run build       # production build to dist/
npm run typecheck   # type-check only
```

## Features

- **Play** — the four turn phases (Strategy, Movement, Shooting, Combat) plus a Magic tab.
  Each phase lists its ordered steps with check-off boxes (reset per turn) and big
  Prev/Next buttons that walk you straight through to the next phase.
- **Rulebook** — browse every section of the wiki.
- **Search** — full-text search across every rule.
- **Pinned** — star rules for instant access during a game.
- **Offline** — installable to your phone's home screen; works without a connection.

## Data refresh

Re-run `npm run scrape` to pull the latest rules from the wiki, then rebuild/redeploy.
