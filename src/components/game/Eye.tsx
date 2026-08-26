import { TOW } from '../../design/tow';

/** Het "bekijk de regels"-knopje. Stond twee keer los gedefinieerd (BuilderWorkspace en
 *  UnitOptions); nu de unitkaart hem ook nodig heeft zou dat een derde kopie worden. Deze module is
 *  de gedeelde versie voor het spel-scherm.
 *
 *  stopPropagation zit in de knop zelf en niet bij de aanroeper: dit ding staat vrijwel altijd in
 *  een rij die zelf al iets doet (uitklappen, selecteren), en dat één keer vergeten levert een knop
 *  op die precies het tegenovergestelde doet van wat je verwacht. */
export const Eye = ({ onClick, title = 'Show rule' }: { onClick: () => void; title?: string }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    aria-label={title}
    title={title}
    style={{
      flexShrink: 0, width: 24, height: 24, borderRadius: 7, border: `1px solid ${TOW.line}`,
      background: 'transparent', cursor: 'pointer', color: TOW.muted,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    }}
  >
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  </button>
);
