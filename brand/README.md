# Old World Companion — Brand Kit

The visual identity for the Warhammer: The Old World turn companion PWA.

## The emblem

A gold **sun rising over an open book, pierced by a vertical spire** — knowledge and radiance, with
a blade down the centre. It reads as a single device at any size and anchors every app icon.

The artwork is a textured (foil) raster, so it is **not** reduced to flat SVG. The canonical source is:

| File | Purpose |
| --- | --- |
| `logo-master.png` | The emblem on a transparent ground, 892×892. **Source for all app / PWA icons.** Replace this file to change the logo, then regenerate (below). |

The `logo-*.svg`, `wordmark.svg` and `variants/` files are the **superseded** earlier (twin-tailed
comet) identity, kept only for reference; nothing builds from them anymore.

## Palette

| Role | Colour |
| --- | --- |
| Antique gold (emblem) | `#a9803a` (textured) |
| Ground | `#000000` |
| Parchment (light theme) | `#f7f4ee` |

**Fonts:** Cinzel (display) · EB Garamond / Spectral (body).

## UI icon set

The in-app icons live in [`src/design/icons.tsx`](../src/design/icons.tsx) — a cohesive family on a
24px grid with a 1.7 stroke, shared by both the wide nav rail and the phone bottom bar.

## Regenerating the PNG assets

After replacing `logo-master.png`, regenerate the raster assets in `public/`:

```bash
npm run render-brand
```

This runs `scripts/render-brand.mjs` (uses [`sharp`](https://github.com/lovell/sharp)): it trims the
master, then composites the emblem centred on a black ground at each size and writes:

- `logo.png` (header / home / nav, shown as a rounded square)
- `pwa-192.png` / `pwa-512.png`
- `apple-touch-icon.png`
- `favicon.png`
- `maskable-512.png` (extra safe-zone padding for the Android maskable crop)
