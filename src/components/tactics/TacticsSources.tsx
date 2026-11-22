import { useMemo, useState } from 'react';
import { TOW, towFont } from '../../design/tow';
import type { Bron, BronnenBestand, Kanaal, Les, Waardering } from '../../lib/tactics';
import {
  Badge, Chip, ChipRow, EmptyLine, ExternalButton, ExternalIcon, Meta,
  TYPE_LABEL, WAARDERING_LABEL, bodyText, clamp2, inputStyle, meervoud, rowButton, rowCard,
  sectionHead, titleText,
} from './tacticsUi';

type Ronde = 'all' | 'first' | 'dark-elves';
type Groep = { key: string; titel: string; letter: Waardering | null; kanalen: Kanaal[] };

const isVideo = (k: Kanaal) => k.type === 'youtube';
const itemWoord = (k: Kanaal, n: number) => (isVideo(k) ? meervoud(n, 'video', 'videos') : meervoud(n, 'article', 'articles'));
const waarderingVan = (k: Kanaal) => k.waarderingTekst ?? k.waardering;
/** "2026-11-19" krijgt een label; een tekst als "Stopped 2025-10" staat op zichzelf. */
const uploadLabel = (v: string | null, lang: boolean) => {
  if (!v) return null;
  if (!/^[0-9]/.test(v)) return v;
  return lang ? `Latest upload ${v}` : `Latest ${v}`;
};

interface Props {
  data: BronnenBestand;
  lessen: Les[];
  wide: boolean;
  selId: string | null;
  onSelect: (id: string | null) => void;
  onOpenLesson: (id: string) => void;
}

export function TacticsSources({ data, lessen, wide, selId, onSelect, onOpenLesson }: Props) {
  const [ronde, setRonde] = useState<Ronde>('all');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  // Per kanaal de video's/artikelen, per bron de lessen die hem noemen.
  const bronnenPer = useMemo(() => {
    const m = new Map<string, Bron[]>();
    for (const b of data.bronnen) {
      const l = m.get(b.kanaalId);
      if (l) l.push(b); else m.set(b.kanaalId, [b]);
    }
    return m;
  }, [data.bronnen]);
  const lessenPerBron = useMemo(() => {
    const m = new Map<string, Les[]>();
    for (const les of lessen) {
      for (const lb of les.bronnen) {
        const l = m.get(lb.bronId);
        if (!l) m.set(lb.bronId, [les]);
        else if (!l.includes(les)) l.push(les);
      }
    }
    return m;
  }, [lessen]);
  const lessenVanKanaal = (k: Kanaal) => {
    const s = new Set<string>();
    for (const b of bronnenPer.get(k.id) ?? []) for (const les of lessenPerBron.get(b.id) ?? []) s.add(les.id);
    return s.size;
  };

  const totalen = useMemo(() => {
    const yt = data.kanalen.filter(isVideo);
    return {
      A: yt.filter((k) => k.waardering === 'A').length,
      B: yt.filter((k) => k.waardering === 'B').length,
      C: yt.filter((k) => k.waardering === 'C').length,
      written: data.kanalen.length - yt.length,
      items: data.bronnen.length,
    };
  }, [data]);

  const inRonde = (k: Kanaal) => {
    if (ronde === 'first') return k.ronde === 1;
    if (ronde === 'dark-elves') return k.ronde === 2 || (bronnenPer.get(k.id) ?? []).some((b) => b.onderwerp === 'dark-elves');
    return true;
  };
  const titelTreffers = (k: Kanaal) => (q ? (bronnenPer.get(k.id) ?? []).filter((b) => b.titel.toLowerCase().includes(q)) : []);
  const zichtbaar = (k: Kanaal) => inRonde(k) && (!q || k.naam.toLowerCase().includes(q) || titelTreffers(k).length > 0);

  const groepen: Groep[] = useMemo(() => {
    const g: Groep[] = (['A', 'B', 'C'] as Waardering[]).map((w) => ({
      key: w, titel: WAARDERING_LABEL[w], letter: w, kanalen: data.kanalen.filter((k) => isVideo(k) && k.waardering === w),
    }));
    g.push({ key: 'written', titel: 'Written', letter: null, kanalen: data.kanalen.filter((k) => !isVideo(k)) });
    return g;
  }, [data.kanalen]);

  const sel = selId ? data.kanalen.find((k) => k.id === selId) ?? null : null;

  // ── Lijst ────────────────────────────────────────────────────────────────
  const rij = (k: Kanaal) => {
    const n = (bronnenPer.get(k.id) ?? []).length;
    const treffers = titelTreffers(k);
    const actief = wide && sel?.id === k.id;
    return (
      <li key={k.id} style={{ ...rowCard, borderColor: actief ? TOW.goldDeep : TOW.line, background: actief ? 'rgba(138,108,48,0.10)' : TOW.panel2 }}>
        <button type="button" onClick={() => onSelect(k.id)} style={rowButton} aria-current={actief ? 'true' : undefined}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ ...titleText, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.naam}</span>
            {!isVideo(k) && <Badge>{waarderingVan(k)}</Badge>}
          </span>
          {k.omschrijving && <span style={{ ...bodyText, fontSize: 13, ...clamp2 }}>{k.omschrijving}</span>}
          <Meta parts={[
            TYPE_LABEL[k.type] ?? k.type,
            uploadLabel(k.laatsteUpload, false),
            itemWoord(k, n),
            meervoud(lessenVanKanaal(k), 'lesson', 'lessons'),
            k.ronde === 1 ? 'First round' : k.ronde === 2 ? 'Dark Elves' : null,
          ]} />
          {treffers.slice(0, 2).map((b) => (
            <span key={b.id} style={{ ...bodyText, fontSize: 12.5, color: TOW.goldDeep, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {b.titel}
            </span>
          ))}
          {treffers.length > 2 && <span style={{ ...bodyText, fontSize: 12, color: TOW.muted }}>+{treffers.length - 2} more</span>}
        </button>
        {k.url && <ExternalIcon href={k.url} label={`Open ${k.naam}`} />}
      </li>
    );
  };

  const zichtbareGroepen = groepen.map((g) => ({ ...g, kanalen: g.kanalen.filter(zichtbaar) })).filter((g) => g.kanalen.length > 0);

  const lijst = (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...bodyText, fontSize: 13, color: TOW.muted, margin: '2px 2px 10px' }}>
        {[
          `${totalen.A} core`, `${totalen.B} useful`, `${totalen.C} marginal`, `${totalen.written} written`,
          meervoud(totalen.items, 'video', 'videos'),
        ].join(' · ')}
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search channels and titles"
        aria-label="Search channels and titles"
        style={{ ...inputStyle, marginBottom: 8 }}
      />
      <ChipRow label="Round">
        <Chip on={ronde === 'all'} onClick={() => setRonde('all')}>All</Chip>
        <Chip on={ronde === 'first'} onClick={() => setRonde('first')}>First round</Chip>
        <Chip on={ronde === 'dark-elves'} onClick={() => setRonde('dark-elves')}>Dark Elves</Chip>
      </ChipRow>
      {zichtbareGroepen.length === 0 && <EmptyLine>No sources match.</EmptyLine>}
      {zichtbareGroepen.map((g) => (
        <section key={g.key}>
          <h2 style={sectionHead}>
            {g.letter && <Badge>{g.letter}</Badge>}
            <span>{g.titel}</span>
            <span style={{ color: TOW.muted }}>{g.kanalen.length}</span>
          </h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {g.kanalen.map(rij)}
          </ul>
        </section>
      ))}
    </div>
  );

  // ── Kanaal open ──────────────────────────────────────────────────────────
  const detail = sel && (
    <KanaalDetail
      kanaal={sel}
      items={bronnenPer.get(sel.id) ?? []}
      lessenPerBron={lessenPerBron}
      aantalLessen={lessenVanKanaal(sel)}
      onOpenLesson={onOpenLesson}
    />
  );

  if (wide) {
    return (
      <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
        <div style={{ width: 380, flexShrink: 0, overflowY: 'auto', padding: '14px 14px 40px', borderRight: `1px solid ${TOW.lineStrong}` }}>
          {lijst}
        </div>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '18px 24px 40px' }}>
          {detail ?? <EmptyLine>Select a channel.</EmptyLine>}
        </div>
      </div>
    );
  }

  // Telefoon: de lijst blijft gemount (verborgen) terwijl een kanaal open is, zodat je na terug op
  // dezelfde scrollpositie staat. Terug gaat via de knop in de kop van de pagina.
  return (
    <>
      <div style={{ height: '100%', overflowY: 'auto', padding: '12px 12px 40px', display: sel ? 'none' : 'block' }}>{lijst}</div>
      {sel && <div key={sel.id} style={{ height: '100%', overflowY: 'auto', padding: '14px 12px 40px' }}>{detail}</div>}
    </>
  );
}

function KanaalDetail({ kanaal, items, lessenPerBron, aantalLessen, onOpenLesson }: {
  kanaal: Kanaal;
  items: Bron[];
  lessenPerBron: Map<string, Les[]>;
  aantalLessen: number;
  onOpenLesson: (id: string) => void;
}) {
  return (
    <div style={{ maxWidth: 680, minWidth: 0 }}>
      <h2 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 21, color: TOW.ink, margin: '0 0 6px', lineHeight: 1.25, overflowWrap: 'anywhere' }}>
        {kanaal.naam}
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Badge>{waarderingVan(kanaal)} · {WAARDERING_LABEL[kanaal.waardering]}</Badge>
        <Meta parts={[
          TYPE_LABEL[kanaal.type] ?? kanaal.type,
          kanaal.ronde === 1 ? 'First round' : kanaal.ronde === 2 ? 'Dark Elves round' : 'Not planned',
        ]} />
      </div>
      {kanaal.omschrijving && <p style={{ ...bodyText, margin: '0 0 6px' }}>{kanaal.omschrijving}</p>}
      <Meta parts={[
        uploadLabel(kanaal.laatsteUpload, true),
        itemWoord(kanaal, items.length),
        meervoud(aantalLessen, 'lesson', 'lessons'),
      ]} style={{ marginBottom: 12 }} />
      <div style={{ marginBottom: 6 }}>
        {kanaal.url
          ? <ExternalButton href={kanaal.url}>{isVideo(kanaal) ? 'Open channel' : 'Open site'}</ExternalButton>
          : <span style={{ ...bodyText, fontSize: 13, color: TOW.muted }}>No link known.</span>}
      </div>

      <h3 style={sectionHead}>
        <span>{isVideo(kanaal) ? 'Videos' : 'Articles'}</span>
        <span style={{ color: TOW.muted }}>{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <EmptyLine>{isVideo(kanaal) ? 'No videos listed yet.' : 'No articles listed yet.'}</EmptyLine>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((b) => {
            const uit = lessenPerBron.get(b.id) ?? [];
            return (
              <li key={b.id} style={{ ...rowCard, flexDirection: 'column', gap: 0 }}>
                <a
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...rowButton, flexDirection: 'row', alignItems: 'center', gap: 10, textDecoration: 'none', minHeight: 44 }}
                >
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ ...titleText, fontSize: 14.5 }}>{b.titel}</span>
                    <Meta parts={[
                      b.datum,
                      b.status === 'processed' ? 'Processed' : 'Candidate',
                      b.onderwerp === 'dark-elves' ? 'Dark Elves' : 'General',
                      meervoud(uit.length, 'lesson', 'lessons'),
                    ]} />
                  </span>
                  <span aria-hidden style={{ color: TOW.goldDeep, flexShrink: 0, fontSize: 15 }}>↗</span>
                </a>
                {uit.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: 0, padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {uit.map((les) => (
                      <li key={les.id}>
                        <button
                          type="button"
                          onClick={() => onOpenLesson(les.id)}
                          style={{
                            width: '100%', minHeight: 36, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
                            border: 'none', borderTop: `1px solid ${TOW.hairline}`, background: 'none', cursor: 'pointer', textAlign: 'left',
                            ...bodyText, fontSize: 13, color: TOW.ink,
                          }}
                        >
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{les.titel}</span>
                          <span aria-hidden style={{ color: TOW.muted }}>›</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
