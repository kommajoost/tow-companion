// Old World design tokens — ported from the Claude Design v3 handoff (tow-kit.jsx).
// LIGHT parchment skin: warm paper surfaces with dark ink text and deep-gold accents.
// `bg` = page surface, `panel` = slightly deeper chrome band, `ink`/`parch` = dark text.
// Cinzel for display, EB Garamond for body.

export const TOW = {
  ink: '#2c2114', // darkest ink — headings, dice faces
  bg: '#ece1c7', // parchment page surface
  panel: '#e2d5b6', // chrome band (header/rail/footer) — a touch deeper
  panel2: '#f4eedb', // raised card on parchment (lightest)
  line: 'rgba(74,55,22,0.20)',
  lineStrong: 'rgba(74,55,22,0.42)',
  gold: '#c9a24b',
  goldBright: '#e8c977',
  goldDeep: '#8a6c30',
  parch: '#2c2114', // primary body text (dark ink on paper)
  parchDim: '#564833',
  muted: '#867453',
  faint: '#c3ad84',
  blood: '#7c2b22',

  // explicit aliases mirroring the design kit's parchment names
  paper: '#ece1c7',
  paper2: '#e2d5b6',
  cardLt: '#f4eedb',
  inkT: '#2c2114',
  inkDim: '#564833',
  inkMuted: '#867453',
  goldOn: '#8a6c30',
  lineOn: 'rgba(74,55,22,0.20)',
  lineOnStr: 'rgba(74,55,22,0.42)',

  // back-compat chrome aliases (now light)
  leather: '#e2d5b6',
  leatherDark: '#dccca8',
  leatherDeep: 'rgba(74,55,22,0.42)',
  parchEdge: 'rgba(74,55,22,0.42)',
} as const;

export const towFont = {
  display: "'Cinzel', 'Times New Roman', serif",
  serif: "'EB Garamond', Georgia, serif",
} as const;

// Shared "engraved caps" style used for small labels throughout the design.
export const engraved = {
  fontFamily: towFont.display,
  fontWeight: 600,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
} as const;
