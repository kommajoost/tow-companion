// Old World design tokens — ported from the Claude Design v3 handoff (tow-kit.jsx).
// Every token now resolves through a CSS custom property so the whole app can
// flip between the LIGHT "Ivory" skin (default) and the DARK "Slate Night" skin
// at runtime. The actual colour/font values live in src/index.css (`:root` for
// Ivory, `:root[data-theme="dark"]` for Slate Night); the runtime toggle lives
// in src/theme.tsx. Keep these keys stable — components read TOW.* directly.

export const TOW = {
  ink: 'var(--tow-ink)', // darkest ink — headings, dice faces
  bg: 'var(--tow-bg)', // parchment page surface
  panel: 'var(--tow-panel)', // chrome band (header/rail/footer) — a touch deeper
  panel2: 'var(--tow-panel2)', // raised card on parchment (lightest)
  line: 'var(--tow-line)',
  lineStrong: 'var(--tow-line-strong)',
  gold: 'var(--tow-gold)',
  goldBright: 'var(--tow-gold-bright)',
  goldDeep: 'var(--tow-gold-deep)',
  parch: 'var(--tow-parch)', // primary body text
  parchDim: 'var(--tow-parch-dim)',
  muted: 'var(--tow-muted)',
  faint: 'var(--tow-faint)',
  blood: 'var(--tow-blood)',

  // text/icon colour that sits ON the accent (gold/crimson) gradient buttons —
  // pale on the light crimson, dark on the dark brass, so labels stay readable.
  onGrad: 'var(--tow-on-grad)',

  // explicit aliases mirroring the design kit's parchment names
  paper: 'var(--tow-paper)',
  paper2: 'var(--tow-paper2)',
  cardLt: 'var(--tow-card-lt)',
  inkT: 'var(--tow-ink-t)',
  inkDim: 'var(--tow-ink-dim)',
  inkMuted: 'var(--tow-ink-muted)',
  goldOn: 'var(--tow-gold-on)',
  lineOn: 'var(--tow-line-on)',
  lineOnStr: 'var(--tow-line-on-str)',

  // back-compat chrome aliases
  leather: 'var(--tow-leather)',
  leatherDark: 'var(--tow-leather-dark)',
  leatherDeep: 'var(--tow-leather-deep)',
  parchEdge: 'var(--tow-parch-edge)',
} as const;

export const towFont = {
  display: 'var(--tow-font-display)',
  serif: 'var(--tow-font-serif)',
} as const;

// Shared "engraved caps" style used for small labels throughout the design.
export const engraved = {
  fontFamily: towFont.display,
  fontWeight: 600,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
} as const;
