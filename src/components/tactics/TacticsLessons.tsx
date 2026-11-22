import { useMemo, useState } from 'react';
import { TOW, towFont } from '../../design/tow';
import { tijdLabel, type Bron, type BronnenBestand, type Fase, type Kanaal, type Les, type LesMarkering, type Thema, type ThemasBestand } from '../../lib/tactics';
import {
  BackButton, Badge, EmptyLine, Meta, bodyText, clamp2, inputStyle,
  legerLabel, meervoud, rowButton, rowCard, sectionHead, titleText,
} from './tacticsUi';

const MARKERING_LABEL: Record<LesMarkering['soort'], string> = {
  'verouderd': 'Outdated',
  'renegade-afwijking': 'Renegade difference',
  'regel-afwijking': 'Rules difference',
};

/** Waarde van het legerfilter: '' = alle legers, '~general' = alleen algemene lessen, anders de slug. */
const ALLE = '';
const ALGEMEEN = '~general';

interface Props {
  lessen: Les[];
  vocab: ThemasBestand;
  bronnen: BronnenBestand | null;
  wide: boolean;
  selThema: string | null;
  selId: string | null;
  onOpenThema: (id: string | null) => void;
  /** inThema: de les is geopend vanuit het geopende thema (terug gaat daarheen). */
  onOpenLes: (id: string, inThema: boolean) => void;
}

// Lessons: zoekveld + thema's. Een thema open toont zijn lessen per fase; tijdens het zoeken staat er
// een platte lijst met treffers. Breed staat de lijst links en het thema of de les rechts.
export function TacticsLessons({ lessen, vocab, bronnen, wide, selThema, selId, onOpenThema, onOpenLes }: Props) {
  const [query, setQuery] = useState('');
  const [leger, setLeger] = useState<string>(ALLE);
  const q = query.trim().toLowerCase();

  const bronIndex = useMemo(() => new Map<string, Bron>((bronnen?.bronnen ?? []).map((b) => [b.id, b])), [bronnen]);
  const kanaalIndex = useMemo(() => new Map<string, Kanaal>((bronnen?.kanalen ?? []).map((k) => [k.id, k])), [bronnen]);
  const themaIndex = useMemo(() => new Map<string, Thema>(vocab.themas.map((t) => [t.id, t])), [vocab]);
  const faseIndex = useMemo(() => new Map<string, Fase>(vocab.fases.map((f) => [f.id, f])), [vocab]);

  // Het legerfilter verschijnt alleen als er lessen voor meer dan één leger zijn (algemeen telt mee).
  const legers = useMemo(() => {
    const s = new Set<string | null>(lessen.map((l) => l.leger ?? null));
    return [...s].sort((a, b) => (a === null ? -1 : b === null ? 1 : a.localeCompare(b)));
  }, [lessen]);
  const legerPast = (l: Les) => leger === ALLE || (leger === ALGEMEEN ? l.leger == null : l.leger === leger);
  const gefilterd = lessen.filter(legerPast);

  const treffers = q
    ? gefilterd.filter((l) => [l.titel, l.tekst, l.waarom, l.voorbeeld, l.wanneerNiet, ...l.units]
      .some((t) => typeof t === 'string' && t.toLowerCase().includes(q)))
    : [];

  const themas = vocab.themas
    .map((t) => ({ t, n: gefilterd.filter((l) => l.themas.includes(t.id)).length }))
    .filter((x) => x.n > 0);

  const thema = selThema ? themaIndex.get(selThema) ?? null : null;
  const sel = selId ? lessen.find((l) => l.id === selId) ?? null : null;
  const faseNaam = (id: string) => faseIndex.get(id)?.naam ?? null;

  if (lessen.length === 0) {
    return (
      <div style={{ height: '100%', overflowY: 'auto', padding: '12px 14px' }}>
        <EmptyLine>No lessons yet. Sources are being reviewed first.</EmptyLine>
      </div>
    );
  }

  const lesRij = (l: Les, meta: (string | null)[], inThema: boolean) => {
    const actief = wide && sel?.id === l.id;
    return (
      <li key={l.id} style={{ ...rowCard, borderColor: actief ? TOW.goldDeep : TOW.line, background: actief ? 'rgba(138,108,48,0.10)' : TOW.panel2 }}>
        <button type="button" onClick={() => onOpenLes(l.id, inThema)} style={rowButton} aria-current={actief ? 'true' : undefined}>
          <span style={{ ...titleText, ...clamp2 }}>{l.titel}</span>
          <Meta parts={meta} />
          {l.markeringen.length > 0 && (
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
              {l.markeringen.map((m, i) => <Badge key={i} tone="blood">{MARKERING_LABEL[m.soort] ?? m.soort}</Badge>)}
            </span>
          )}
        </button>
      </li>
    );
  };

  const lijstStijl: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 };
  const specifiekLeger = (l: Les) => (l.leger ? legerLabel(l.leger) : null);

  // ── Lijst: zoeken + thema's (of treffers) ──────────────────────────────────
  const lijst = (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, minWidth: 0 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search lessons"
          aria-label="Search lessons"
          style={{ ...inputStyle, flex: 1 }}
        />
        {legers.length > 1 && (
          <select
            value={leger}
            onChange={(e) => setLeger(e.target.value)}
            aria-label="Army"
            style={{
              flexShrink: 0, width: 128, minHeight: 40, padding: '0 6px', borderRadius: 11, cursor: 'pointer',
              border: `1px solid ${leger === ALLE ? TOW.lineStrong : TOW.goldDeep}`, background: TOW.bg,
              color: leger === ALLE ? TOW.parchDim : TOW.goldDeep, fontFamily: towFont.display, fontWeight: 600, fontSize: 13,
              textOverflow: 'ellipsis',
            }}
          >
            <option value={ALLE}>All armies</option>
            {legers.map((a) => <option key={a ?? ALGEMEEN} value={a ?? ALGEMEEN}>{legerLabel(a)}</option>)}
          </select>
        )}
      </div>

      {q ? (
        <>
          <div style={{ ...bodyText, fontSize: 13, color: TOW.muted, margin: '0 2px 8px' }}>
            {meervoud(treffers.length, 'lesson', 'lessons')}
          </div>
          {treffers.length === 0
            ? <EmptyLine>No lessons match.</EmptyLine>
            : <ul style={lijstStijl}>{treffers.map((l) => lesRij(l, [faseNaam(l.fase), specifiekLeger(l)], false))}</ul>}
        </>
      ) : themas.length === 0 ? (
        <EmptyLine>No lessons for this army.</EmptyLine>
      ) : (
        <ul style={lijstStijl}>
          {themas.map(({ t, n }) => {
            const actief = wide && selThema === t.id;
            return (
              <li key={t.id} style={{ ...rowCard, borderColor: actief ? TOW.goldDeep : TOW.line, background: actief ? 'rgba(138,108,48,0.10)' : TOW.panel2 }}>
                <button
                  type="button"
                  onClick={() => onOpenThema(t.id)}
                  aria-current={actief ? 'true' : undefined}
                  style={{ ...rowButton, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50 }}
                >
                  <span style={{ ...titleText, flex: 1, minWidth: 0 }}>{t.naam}</span>
                  <span style={{ ...bodyText, fontSize: 14, color: TOW.muted }}>{n}</span>
                  <span aria-hidden style={{ color: TOW.muted, fontSize: 18, lineHeight: 1 }}>›</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  // ── Thema open: lessen per fase ────────────────────────────────────────────
  const themaView = thema && (() => {
    const van = gefilterd.filter((l) => l.themas.includes(thema.id));
    const groepen = vocab.fases
      .map((f) => ({ key: f.id, naam: f.naam, lessen: van.filter((l) => l.fase === f.id) }))
      .filter((g) => g.lessen.length > 0);
    const overig = van.filter((l) => !faseIndex.has(l.fase));
    if (overig.length) groepen.push({ key: '~other', naam: 'Other', lessen: overig });
    return (
      <div style={{ maxWidth: 680, minWidth: 0 }}>
        <h2 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 21, color: TOW.ink, margin: '0 0 4px', lineHeight: 1.25, overflowWrap: 'anywhere' }}>
          {thema.naam}
        </h2>
        {thema.omschrijving && <p style={{ ...bodyText, margin: '0 0 4px' }}>{thema.omschrijving}</p>}
        <Meta parts={[meervoud(van.length, 'lesson', 'lessons'), leger !== ALLE ? (leger === ALGEMEEN ? 'General only' : legerLabel(leger)) : null]} />
        {van.length === 0 && <EmptyLine>No lessons for this army.</EmptyLine>}
        {groepen.map((g) => (
          <section key={g.key}>
            <h3 style={sectionHead}>
              <span>{g.naam}</span>
              <span style={{ color: TOW.muted }}>{g.lessen.length}</span>
            </h3>
            <ul style={lijstStijl}>{g.lessen.map((l) => lesRij(l, [specifiekLeger(l)], true))}</ul>
          </section>
        ))}
      </div>
    );
  })();

  const detail = sel && (
    <LesDetail
      key={sel.id}
      les={sel}
      bronIndex={bronIndex}
      kanaalIndex={kanaalIndex}
      faseNaam={faseNaam(sel.fase)}
      themas={sel.themas.map((id) => themaIndex.get(id)).filter((t): t is Thema => !!t)}
      onOpenThema={onOpenThema}
    />
  );

  if (wide) {
    return (
      <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
        <div style={{ width: 380, flexShrink: 0, overflowY: 'auto', padding: '14px 14px 40px', borderRight: `1px solid ${TOW.lineStrong}` }}>
          {lijst}
        </div>
        <div key={sel ? `les-${sel.id}` : `thema-${thema?.id ?? ''}`} style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '14px 24px 40px' }}>
          {sel ? (
            <>
              {thema && <div style={{ margin: '0 0 6px -4px' }}><BackButton onClick={() => onOpenThema(thema.id)} label={thema.naam} /></div>}
              {detail}
            </>
          ) : themaView ?? <EmptyLine>Select a theme.</EmptyLine>}
        </div>
      </div>
    );
  }

  // Telefoon: lijst en thema blijven gemount (verborgen) zodat de scrollpositie bewaard blijft; terug
  // gaat via de knop in de kop van de pagina of de hardware-Back.
  return (
    <>
      <div style={{ height: '100%', overflowY: 'auto', padding: '12px 12px 40px', display: thema || sel ? 'none' : 'block' }}>{lijst}</div>
      {thema && <div key={thema.id} style={{ height: '100%', overflowY: 'auto', padding: '14px 12px 40px', display: sel ? 'none' : 'block' }}>{themaView}</div>}
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

function LesDetail({ les, bronIndex, kanaalIndex, faseNaam, themas, onOpenThema }: {
  les: Les;
  bronIndex: Map<string, Bron>;
  kanaalIndex: Map<string, Kanaal>;
  faseNaam: string | null;
  themas: Thema[];
  onOpenThema: (id: string) => void;
}) {
  return (
    <article style={{ maxWidth: 680, minWidth: 0 }}>
      <h2 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 20, color: TOW.ink, margin: '0 0 2px', lineHeight: 1.3, overflowWrap: 'anywhere' }}>
        {les.titel}
      </h2>
      <Meta
        style={{ alignItems: 'center', marginBottom: 8 }}
        parts={[
          faseNaam,
          ...themas.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpenThema(t.id)}
              style={{
                minHeight: 36, padding: 0, border: 'none', background: 'none', cursor: 'pointer',
                color: TOW.goldDeep, fontFamily: towFont.display, fontWeight: 600, fontSize: 13,
                textDecoration: 'underline', textDecorationColor: TOW.line, textUnderlineOffset: 3,
              }}
            >
              {t.naam}
            </button>
          )),
          legerLabel(les.leger),
          les.datum,
        ]}
      />
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
