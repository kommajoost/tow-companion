import { createContext, useContext } from 'react';

/** Wat het Scenario lab (23-10-2026, test-build) aan de echte battle-schermen meegeeft: terug naar het
 *  lab en het lab-potje opnieuw beginnen. Buiten het lab null, en dan tonen die schermen niets extra. */
export interface LabActies { terug: () => void; herstart: () => void }
export const LabContext = createContext<LabActies | null>(null);
export const useLab = (): LabActies | null => useContext(LabContext);
