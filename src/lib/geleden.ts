// Relatieve tijd voor de sync-status (28-10-2026). "Synced · 28-10-26 14:02" zei niet of dat nu net
// was of eergisteren — en precies dat wil je weten als je twijfelt of je telefoon bij is. Dus:
// "Synced · 3 minutes ago", met de exacte tijd in de tooltip (`wanneerVol`).

// Een Postgres-tijd ("2026-10-28 10:00:00.12+00") snapt niet elke browser (Safari niet): eerst naar ISO.
const tijdstip = (t: string | number): number => (typeof t === 'number' ? t
  : Date.parse(t.trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')));

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "2 days ago"; daarna een datum.
 *  Een tijd in de toekomst (de klok van de server loopt net voor op die van het apparaat) telt als
 *  "just now". */
export function geleden(t: string | number, nu: number = Date.now()): string {
  const ms = tijdstip(t);
  if (!Number.isFinite(ms)) return '';
  const s = Math.max(0, Math.round((nu - ms) / 1000));
  if (s < 45) return 'just now';
  const min = Math.round(s / 60);
  if (min < 60) return min <= 1 ? '1 minute ago' : `${min} minutes ago`;
  const uur = Math.round(min / 60);
  if (uur < 24) return uur <= 1 ? '1 hour ago' : `${uur} hours ago`;
  const dag = Math.round(uur / 24);
  if (dag <= 1) return 'yesterday';
  if (dag < 30) return `${dag} days ago`;
  return `on ${new Date(ms).toLocaleDateString([], { dateStyle: 'medium' })}`;
}

/** De exacte datum + tijd, voor een `title`-attribuut naast `geleden`. */
export function wanneerVol(t: string | number): string {
  const ms = tijdstip(t);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
