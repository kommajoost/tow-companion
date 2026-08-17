import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Wat er misgaat moet je KUNNEN ZIEN.
 *
 *  Joost meldde: "als ik de pagina laad zie ik halve seconde de inhoud maar daarna alles direct op
 *  zwart" (17-08). Dat is geen zwart scherm dat ergens overheen wordt getekend — het is een
 *  onafgevangen fout die de hele React-tree afbreekt, waarna de lege root de donkere body-achtergrond
 *  laat zien. De app had geen enkele error boundary, dus die fout verdween zonder spoor: geen melding,
 *  geen stack, niets om op te sturen. Onreproduceerbaar in een schone browser, want het hangt aan
 *  opgeslagen state of aan een oude service-worker-cache.
 *
 *  Vandaar dit vangnet. Het lost de fout niet op, het maakt hem leesbaar — en biedt de twee dingen
 *  die in de praktijk helpen: de melding zelf (om te kunnen doorgeven) en een knop die caches en
 *  service worker weggooit, want een half bijgewerkte precache is de meest voorkomende oorzaak van
 *  precies dit beeld.
 *
 *  Opgeslagen lijsten worden NIET aangeraakt. Alleen caches en de service worker gaan eruit. */
type Props = { children: ReactNode };
type State = { fout: Error | null; waar: string };

export class Vangnet extends Component<Props, State> {
  state: State = { fout: null, waar: '' };

  static getDerivedStateFromError(fout: Error): Partial<State> {
    return { fout };
  }

  componentDidCatch(fout: Error, info: ErrorInfo): void {
    // In de console laten staan, zodat een devtools-log alsnog de volledige stack toont.
    console.error('OWC liep vast:', fout, info.componentStack);
    this.setState({ waar: (info.componentStack ?? '').split('\n').slice(0, 4).join('\n').trim() });
  }

  private async opnieuw(): Promise<void> {
    try {
      if ('caches' in window) for (const naam of await caches.keys()) await caches.delete(naam);
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      for (const reg of regs ?? []) await reg.unregister();
    } catch { /* niets aan te doen; de reload hieronder is de echte poging */ }
    window.location.reload();
  }

  render(): ReactNode {
    const { fout, waar } = this.state;
    if (!fout) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', padding: '32px 20px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center',
        font: '15px/1.5 ui-sans-serif, system-ui, sans-serif', color: '#e8e2d4', background: '#14120f',
      }}>
        <h1 style={{ font: '600 20px/1.3 ui-serif, Georgia, serif', margin: 0 }}>
          Er ging iets mis bij het laden
        </h1>
        <p style={{ margin: 0, maxWidth: 460, opacity: 0.8 }}>
          Je lijsten staan er nog. Meestal is dit een half bijgewerkte cache — opnieuw ophalen lost het op.
        </p>
        <button
          type="button"
          onClick={() => { void this.opnieuw(); }}
          style={{
            padding: '10px 18px', borderRadius: 8, border: '1px solid #6b5f45',
            background: '#c8b183', color: '#1b1710', font: 'inherit', fontWeight: 600, cursor: 'pointer',
          }}
        >
          Cache wissen en opnieuw laden
        </button>
        <pre style={{
          margin: 0, maxWidth: 'min(680px, 92vw)', overflowX: 'auto', textAlign: 'left',
          padding: 12, borderRadius: 8, background: '#0d0b09', border: '1px solid #302a20',
          font: '12px/1.5 ui-monospace, monospace', color: '#d9c9a3', whiteSpace: 'pre-wrap',
        }}>
          {fout.message}{waar ? `\n\n${waar}` : ''}
        </pre>
      </div>
    );
  }
}
