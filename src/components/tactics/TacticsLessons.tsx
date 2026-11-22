import { useMemo, useState } from 'react';
import { TOW, towFont } from '../../design/tow';
import { LES_ONDERWERPEN, tijdLabel, type Bron, type BronnenBestand, type Kanaal, type Les, type LesMarkering } from '../../lib/tactics';
import {
  Badge, Chip, ChipRow, EmptyLine, Meta, bodyText, clamp2, inputStyle,
  legerLabel, meervoud, onderwerpLabel, rowButton, rowCard, sectionHead, titleText,
} from './tacticsUi';

const MARKERING_LABEL: Record<LesMarkering['soort'], string> = {
  'verouderd': 'Outdated',
  'renegade-afwijking': 'Renegade difference',
  'regel-afwijking': 'Rules difference',
};

interface Props {
  lessen: Les[];
  bronnen: BronnenBestand | null;
  wide: boolean;
  selId: string | null;
  onSelect: (id: string | null) => void;
}

export function TacticsLessons({ lessen, bronnen, wide, selId, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [onderwerp, setOnderwerp] = useState<string | null>(null);
  // undefined = alle legers; null = algemeen; anders de slug.
  const [leger, setLeger] = useState<string | null | undefined>(undefined);
  const q = query.trim().toLowerCase();

  const bronIndex = useMemo(() => new Map<string, Bron>((bronnen?.bronnen ?? []).map((b) => [b.id, b])), [bronnen]);
  const kanaalIndex = useMemo(() => new Map<string, Kanaal>((bronnen?.kanalen ?? []).map((k) => [k.id, k])), [bronnen]);

  // Alleen de onderwerpen en legers die in de lessen voorkomen, in de vaste volgorde van het ontwerp.
  const onderwerpen = useMemo(() => {
    const aanwezig = new Set(lessen.map((l) => l.onderwerp));
    const vast = LES_ONDERWERPEN.filter((o) => aanwezig.has(o));
    const rest = [...aanwezig].filter((o) => !LES_ONDERWERPEN.includes(o)).sort();
    return [...vast, ...rest];
  }, [lessen]);
  const legers = useMemo(() => {
    const s = new Set<string | null>(lessen.map((l) => l.leger ?? null));
    return [...s].sort((a, b) => (a === null ? -1 : b === null ? 1 : a.localeCompare(b)));
  }, [lessen]);

  const zichtbaar = lessen.filter((l) => {
    if (onderwerp && l.onderwerp !== onderwerp) return false;
    if (leger !== undefined && (l.leger ?? null) !== leger) return false;
    if (!q) return true;
    return [l.titel, l.tekst, ...l.units].some((t) => typeof t === 'string' && t.toLowerCase().includes(q));
  });

  const sel = selId ? lessen.find((l) => l.id === selId) ?? null : null;

  if (lessen.length === 0) {
    return (
      <div style={{ height: '100%', overflowY: 'auto', padding: '12px 14px' }}>
        <EmptyLine>No lessons yet. Sources are being reviewed first.</EmptyLine>
      </div>
    );
  }

  const rij = (l: Les) => {
    const actief = wide && sel?.id === l.id;
    return (
      <li key={l.id} style={{ ...rowCard, borderColor: actief ? TOW.goldDeep : TOW.line, background: actief ? 'rgba(138,108,48,0.10)' : TOW.panel2 }}>
        <button type="button" onClick={() => onSelect(l.id)} style={rowButton} aria-current={actief ? 'true' : undefined}>
          <span style={{ ...titleText, ...clamp2 }}>{l.titel}</span>
          <Meta parts={[
            onderwerpLabel(l.onderwerp),
            legerLabel(l.leger),
            meervoud(l.bronnen.length, 'source', 'sources'),
            l.datum,
          ]} />
          {l.markeringen.length > 0 && (
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
              {l.markeringen.map((m, i) => <Badge key={i} tone="blood">{MARKERING_LABEL[m.soort] ?? m.soort}</Badge>)}
            </span>
          )}
        </button>
      </li>
    );
  };

  const lijst = (
    <div style={{ minWidth: 0 }}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search lessons"
        aria-label="Search lessons"
        style={{ ...inputStyle, marginBottom: 8 }}
      />
      {onderwerpen.length > 1 && (
        <ChipRow label="Topic">
          <Chip on={onderwerp === null} onClick={() => setOnderwerp(null)}>All topics</Chip>
          {onderwerpen.map((o) => (
            <Chip key={o} on={onderwerp === o} onClick={() => setOnderwerp(onderwerp === o ? null : o)}>{onderwerpLabel(o)}</Chip>
          ))}
        </ChipRow>
      )}
      {legers.length > 1 && (
        <ChipRow label="Army">
          <Chip on={leger === undefined} onClick={() => setLeger(undefined)}>All armies</Chip>
          {legers.map((a) => (
            <Chip key={a ?? '~general'} on={leger === a} onClick={() => setLeger(leger === a ? undefined : a)}>{legerLabel(a)}</Chip>
          ))}
        </ChipRow>
      )}
      <div style={{ ...bodyText, fontSize: 13, color: TOW.muted, margin: '8px 2px' }}>
        {zichtbaar.length === lessen.length ? meervoud(lessen.length, 'lesson', 'lessons') : `${zichtbaar.length} of ${lessen.length} lessons`}
      </div>
      {zichtbaar.length === 0 ? (
        <EmptyLine>No lessons match.</EmptyLine>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {zichtbaar.map(rij)}
        </ul>
      )}
    </div>
  );

  const detail = sel && <LesDetail les={sel} bronIndex={bronIndex} kanaalIndex={kanaalIndex} />;

  if (wide) {
    return (
      <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
        <div style={{ width: 380, flexShrink: 0, overflowY: 'auto', padding: '14px 14px 40px', borderRight: `1px solid ${TOW.lineStrong}` }}>
          {lijst}
        </div>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '18px 24px 40px' }}>
          {detail ?? <EmptyLine>Select a lesson.</EmptyLine>}
        </div>
      </div>
    );
  }

  // Telefoon: lijst blijft gemount (verborgen) zodat de scrollpositie bewaard blijft; terug gaat via
  // de knop in de kop van de pagina.
  return (
    <>
      <div style={{ height: '100%', overflowY: 'auto', padding: '12px 12px 40px', display: sel ? 'none' : 'block' }}>{lijst}</div>
      {sel && <div key={sel.id} style={{ height: '100%', overflowY: 'auto', padding: '14px 12px 40px' }}>{detail}</div>}
    </>
  );
}

/** YouTube-link naar een moment, een paar seconden voor het citaat (zoals de pijplijn de hoofdlink maakt). */
function momentUrl(videoUrl: string, sec: number): string {
  try {
    const u = new URL(videoUrl);
    u.searchParams.set('t', `${Math.max(0, Math.floor(sec) - 3)}s`);
    return u.toString();
  } catch {
    return videoUrl;
  }
}

function LesDetail({ les, bronIndex, kanaalIndex }: { les: Les; bronIndex: Map<string, Bron>; kanaalIndex: Map<string, Kanaal> }) {
  return (
    <article style={{ maxWidth: 680, minWidth: 0 }}>
      <h2 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 20, color: TOW.ink, margin: '0 0 6px', lineHeight: 1.3, overflowWrap: 'anywhere' }}>
        {les.titel}
      </h2>
      <Meta parts={[onderwerpLabel(les.onderwerp), legerLabel(les.leger), les.datum]} style={{ marginBottom: 10 }} />
      {les.tekst && <p style={{ ...bodyText, color: TOW.ink, fontSize: 15, margin: '0 0 12px' }}>{les.tekst}</p>}

      {([['Why', les.waarom], ['Example', les.voorbeeld], ['When not', les.wanneerNiet]] as const).map(([label, inhoud]) =>
        inhoud ? (
          <section key={label} style={{ borderLeft: `2px solid ${TOW.line}`, padding: '2px 0 2px 10px', margin: '0 0 10px' }}>
            <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 12.5, color: TOW.goldDeep, marginBottom: 2 }}>{label}</div>
            <p style={{ ...bodyText, fontSize: 14, margin: 0 }}>{inhoud}</p>
          </section>
        ) : null,
      )}

      {les.markeringen.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {les.markeringen.map((m, i) => (
            <li key={i} style={{ border: `1px solid ${TOW.blood}`, borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 12.5, color: TOW.blood, marginBottom: 2 }}>
                {MARKERING_LABEL[m.soort] ?? m.soort}
              </div>
              <div style={{ ...bodyText, fontSize: 13.5 }}>{m.tekst}</div>
            </li>
          ))}
        </ul>
      )}

      {les.units.length > 0 && (
        <>
          <h3 style={sectionHead}>Units</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {les.units.map((u) => (
              <span key={u} style={{ ...bodyText, fontSize: 13, color: TOW.ink, border: `1px solid ${TOW.line}`, borderRadius: 999, padding: '3px 10px' }}>{u}</span>
            ))}
          </div>
        </>
      )}

      <h3 style={sectionHead}>
        <span>Sources</span>
        <span style={{ color: TOW.muted }}>{les.bronnen.length}</span>
      </h3>
      {les.bronnen.length === 0 ? (
        <EmptyLine>No source.</EmptyLine>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {les.bronnen.map((lb, i) => {
            const bron = bronIndex.get(lb.bronId);
            const kanaal = bron ? kanaalIndex.get(bron.kanaalId) : undefined;
            // Hoofdcitaat plus eventuele extra citaten, elk met een eigen link naar dat moment.
            const citaten = [
              { citaat: lb.citaat, tijd: lb.tijd, href: lb.url || bron?.url },
              ...(lb.extraCitaten ?? []).map((ec) => ({ citaat: ec.citaat, tijd: ec.tijd, href: bron?.url ? momentUrl(bron.url, ec.tijd) : undefined })),
            ];
            return (
              <li key={`${lb.bronId}-${i}`} style={{ ...rowCard, flexDirection: 'column', gap: 4, padding: '10px 12px' }}>
                <Meta parts={[kanaal?.naam ?? 'Unknown channel', bron?.datum]} />
                <span style={{ ...titleText, fontSize: 14.5 }}>{bron?.titel ?? lb.bronId}</span>
                {citaten.map((c, j) => {
                  const tijd = tijdLabel(c.tijd);
                  return (
                    <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingTop: j > 0 ? 6 : 0, borderTop: j > 0 ? `1px solid ${TOW.hairline}` : 'none' }}>
                      {c.citaat && <q style={{ ...bodyText, fontStyle: 'italic', fontSize: 13.5 }}>{c.citaat}</q>}
                      {c.href && (
                        <a
                          href={c.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36,
                            color: TOW.goldDeep, textDecoration: 'none', fontFamily: towFont.display, fontWeight: 600, fontSize: 13.5,
                          }}
                        >
                          {tijd ? `Watch at ${tijd}` : 'Open source'}
                          <span aria-hidden>↗</span>
                        </a>
                      )}
                    </div>
                  );
                })}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
