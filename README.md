# Old World Turn Companion

A mobile-first companion app for **Warhammer: The Old World**. Walk through a player
turn phase by phase with the full rules for every sub-phase at hand, browse a searchable
rulebook, pin rules, and set up a match with both players' army lists.

**Live:** https://oldworldcompanion.vercel.app

The rules text is taken **verbatim (in English)** from the community wiki
[tow.whfb.app](https://tow.whfb.app/) so it matches the source exactly. This app is an
unofficial, personal-use study aid. Warhammer: The Old World © Games Workshop.

## How it works

- `scripts/scrape.mjs` crawls the wiki (Next.js + Contentful) and writes the entire rule
  set — including weapon profiles and every Lore of Magic spell — verbatim to
  `public/rules.json` (the app fetches this once and caches it offline).
- The app is a Vite + React + TypeScript PWA, styled with Tailwind CSS v4.
- Inline links in the rules become tappable terms that open the referenced rule in a
  stacked bottom sheet — drill down and step back without losing your place.

## Features

- **Turns** — the four turn phases (Strategy, Movement, Shooting, Combat) plus Magic, each
  with ordered steps, check-off boxes, and an instant hover-popup on the phase chips.
- **Rulebook** — browse and search every section of the wiki; tap any term for its rule.
- **Armies** — paste an [Old World Builder](https://old-world-builder.com/) export to see
  each unit's profile, options, and special rules. Per Wizard, pick the lore(s) and tick
  the spells you rolled (they open the spell's rules). Play solo or share the match with a
  short code; a lobby lists current games to join directly.
- **Pinned** — star rules for instant access during a game (stored locally per device).
- **Settings** — install the app, check for updates, and send feedback.
- **Offline** — installable to your phone's home screen; works without a connection.

## Develop

```bash
npm install
npm run scrape      # refresh public/rules.json from the wiki (optional; already included)
npm run dev         # start the dev server
npm run build       # production build to dist/
npm run typecheck   # type-check only
```

## Deploy

The Vercel project is connected to this GitHub repo: **pushing to `main` auto-deploys to
production** (https://oldworldcompanion.vercel.app). Keep changes flowing through Git so the
repo always matches what's live.

To refresh the rules, re-run `npm run scrape`, then commit `public/rules.json` and push.
