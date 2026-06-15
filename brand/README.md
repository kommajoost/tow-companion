# Battle Companion — Brand Kit

The visual identity for **Battle Companion**, a Warhammer: The Old World turn companion PWA.

## What's in this folder

| File | Purpose |
| --- | --- |
| `logo-mark.svg` | Primary emblem — the comet on a dark ground in a rounded square. Source for the app / PWA icons. |
| `logo-maskable.svg` | Full-bleed variant sized for the Android maskable safe-zone (artwork stays clear of the edges that platforms crop). |
| `logo-glyph.svg` | The comet only, on a transparent ground. For mono / small use where the ring and ground would muddy. |
| `wordmark.svg` | Horizontal lockup — the comet beside the words "Battle Companion". |

## The emblem

A gold **twin-tailed comet** — the emblem of the Old World / Sigmar — set within a heraldic ring. It reads as a single device at any size and anchors every other asset.

## Palette

| Role | Colour |
| --- | --- |
| Heraldic crimson (light "Ivory" accent) | `#9c2b2b` |
| Antique gold (dark "Slate Night" accent) | `#cda64f` → `#b08a37` |
| Ground | `#1a1714` |
| Ground (deeper) | `#100d0b` |
| Parchment | `#f7f4ee` |

**Fonts:** Cinzel (display) · EB Garamond / Spectral (body).

## UI icon set

The in-app icons live in [`src/design/icons.tsx`](../src/design/icons.tsx) — a cohesive family on a 24px grid with a 1.7 stroke, shared by both the wide nav rail and the phone bottom bar so the artwork is identical everywhere.

## Regenerating the PNG assets

After editing any `brand/*.svg`, regenerate the raster assets in `public/`:

```bash
npm run render-brand
```

This runs `scripts/render-brand.mjs` (uses [`sharp`](https://github.com/lovell/sharp)) and writes:

- `logo.png`
- `pwa-192.png` / `pwa-512.png`
- `apple-touch-icon.png`
- `favicon.png`
- `maskable-512.png`
