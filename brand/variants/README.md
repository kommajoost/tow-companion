# Logo variants — pick one

Three directions for the app logo (replacing the comet/star mark). Each is a
self-contained app-icon style SVG (dark rounded ground + gold mark) plus a 512px
PNG preview. **Nothing here is live yet** — `public/` and production are untouched.

| File | Concept | Reads best |
|------|---------|-----------|
| `variant-1-crest.svg` | **Heraldic crest** — crossed swords behind a shield with a crimson boss | Martial / classic wargaming feel |
| `variant-2-seal.svg` | **Engraved seal** — "OW" monogram in a double ring with cardinal lozenges | Most legible at favicon size; premium, ties to the old "OW" identity |
| `variant-3-standard.svg` | **War standard** — crimson swallowtail banner + gold sword on a crossbar | Most distinctly Warhammer; strong colour |

Notes:
- The `gold` gradient uses `gradientUnits="userSpaceOnUse"` — required so thin
  vertical/horizontal strokes (sword blades, rings) actually paint. Don't switch
  it back to the default `objectBoundingBox` or zero-width strokes vanish.
- Variant 2's monogram uses Cinzel in-app (the previews fall back to a serif).

## To promote one to the live logo
Tell me which variant. I'll then:
1. copy its source to `brand/logo-mark.svg` (+ a maskable version),
2. run `npm run render-brand` to regenerate all `public/` PNG app/PWA icons,
3. stamp the version and deploy.
