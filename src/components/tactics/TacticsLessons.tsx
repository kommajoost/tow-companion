import { useEffect, useMemo, useState } from 'react';
import { TOW, towFont } from '../../design/tow';
import {
  lesThemas, tijdLabel, type Bron, type BronnenBestand, type Fase, type Kanaal, type Les, type LesMarkering, type Principe,
  type PrincipesBestand, type Subthema, type Tag, type Thema, type ThemasBestand,
} from '../../lib/tactics';
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
/** Subthema-sleutel voor lessen zonder (bekend) subthema. */
const OVERIG = '~other';
/** Een thema met meer lessen dan dit opent met alleen de eerste secties uitgeklapt. */
const LANG_THEMA = 24;
const OPEN_SECTIES = 3;

/** Een laag boven de lijst: een principe, een thema (eventueel met het subthema waarop het opende), de
 *  lessen met een tag, of een les. TacticsPage beheert de stapel; de bovenste laag is wat je ziet. */
export type Laag =
  | { soort: 'principe'; id: string }
  | { soort: 'thema'; id: string; sub?: string | null }
  | { soort: 'tag'; id: string }
  | { soort: 'les'; id: string };

interface Props {
  lessen: Les[];
  vocab: ThemasBestand;
  tags: Tag[];
  bronnen: BronnenBestand | null;
  principes: PrincipesBestand;
  wide: boolean;
  lagen: Laag[];
  /** vanuitLijst: geopend uit de lijst (vervangt de stapel), anders bovenop de huidige laag. */
  onOpenPrincipe: (id: string, vanuitLijst: boolean) => void;
  /** Een thema openen vanuit de lijst of vanuit een les (vervangt de stapel). */
  onOpenThema: (id: string, sub?: string | null) => void;
  /** vanuitLijst: geopend uit de zoektreffers (vervangt de stapel), anders bovenop de huidige laag. */
  onOpenLes: (id: string, vanuitLijst: boolean) => void;
  onOpenTag: (id: string) => void;
  /** Een laag terug (de terugknop boven het rechterpaneel). */
  onTerug: () => void;
}

const kleine = (s: string) => s.toLowerCase();
const escRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Een zoekwoord in een tekst: korte woorden (ap, bsb) alleen als heel woord, langere overal. */
function bevat(hooi: string, woord: string): boolean {
  if (woord.length >= 3) return hooi.includes(woord);
  return new RegExp(`(^|[^a-z0-9])${escRegex(woord)}([^a-z0-9]|$)`).test(hooi);
}

const tagTermen = (t: Tag) => [t.label, t.id.replace(/-/g, ' '), ...t.synonyms].map(kleine);
/** Past een zoekwoord op een tag (label, id of synoniem)? */
const tagPast = (t: Tag, woord: string) => tagTermen(t).some((x) => x === woord || (woord.length >= 3 && x.includes(woord)));

// Lessons: zoekveld, dan Essentials (de top 10 principes en de debatten), dan de thema's. Met een
// legerfilter staan de principes van dat leger bovenaan. Een principe open toont de samenvatting en de
// lessen eronder; een thema open toont eerst zijn kernprincipes en dan zijn subthema's als secties met
// de lessen eronder; een tag open toont alle lessen met die tag; tijdens het zoeken staat er een platte
// lijst met treffers. Breed staat de lijst links en de bovenste laag rechts.
export function TacticsLessons({ lessen, vocab, tags, bronnen, principes, wide, lagen, onOpenPrincipe, onOpenThema, onOpenLes, onOpenTag, onTerug }: Props) {
  const [query, setQuery] = useState('');
  const [leger, setLeger] = useState<string>(ALLE);
  // Uit- of ingeklapte secties per thema ("thema:subthema" -> open), alleen waar de gebruiker tikte.
  const [klap, setKlap] = useState<Map<string, boolean>>(() => new Map());
  const q = query.trim().toLowerCase();

  const bronIndex = useMemo(() => new Map<string, Bron>((bronnen?.bronnen ?? []).map((b) => [b.id, b])), [bronnen]);
  const kanaalIndex = useMemo(() => new Map<string, Kanaal>((bronnen?.kanalen ?? []).map((k) => [k.id, k])), [bronnen]);
  const themaIndex = useMemo(() => new Map<string, Thema>(vocab.themas.map((t) => [t.id, t])), [vocab]);
  const faseIndex = useMemo(() => new Map<string, Fase>(vocab.fases.map((f) => [f.id, f])), [vocab]);
  const tagIndex = useMemo(() => new Map<string, Tag>(tags.map((t) => [t.id, t])), [tags]);
  const principeIndex = useMemo(() => new Map<string, Principe>(principes.principes.map((p) => [p.id, p])), [principes]);
  const lesIndex = useMemo(() => new Map<string, Les>(lessen.map((l) => [l.id, l])), [lessen]);
  const principesVan = (ids: string[] | undefined) => (ids ?? []).map((id) => principeIndex.get(id)).filter((p): p is Principe => !!p);
  /** Kanaalnamen van een les (uniek), voor de regel onder een les in een principe. */
  const lesKanalen = (l: Les) => [...new Set(l.bronnen.map((b) => bronIndex.get(b.bronId)?.kanaalId).filter((k): k is string => !!k))]
    .map((k) => kanaalIndex.get(k)?.naam ?? k).join(', ');
  const faseVolgorde = (id: string) => faseIndex.get(id)?.volgorde ?? 1000;
  const subNaam = (thema: string, sub: string | null) =>
    (sub && themaIndex.get(thema)?.subthemas.find((s) => s.id === sub)?.naam) || null;

  // Zoektekst per les: alle teksten, units, tags met synoniemen en de namen van thema en subthema.
  const hooiberg = useMemo(() => new Map(lessen.map((l) => [l.id, kleine([
    l.titel, l.tekst, l.waarom, l.voorbeeld, l.wanneerNiet, ...l.units,
    ...(l.tags ?? []).flatMap((id) => { const t = tagIndex.get(id); return t ? tagTermen(t) : [id]; }),
    ...lesThemas(l).flatMap((lt) => [themaIndex.get(lt.thema)?.naam, subNaam(lt.thema, lt.subthema)]),
  ].filter((x): x is string => typeof x === 'string').join('\n'))])), [lessen, tagIndex, themaIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Het legerfilter verschijnt alleen als er lessen voor meer dan één leger zijn (algemeen telt mee).
  const legers = useMemo(() => {
    const s = new Set<string | null>(lessen.map((l) => l.leger ?? null));
    return [...s].sort((a, b) => (a === null ? -1 : b === null ? 1 : a.localeCompare(b)));
  }, [lessen]);
  const legerPast = (l: Les) => leger === ALLE || (leger === ALGEMEEN ? l.leger == null : l.leger === leger);
  const gefilterd = lessen.filter(legerPast);

  // Zoeken: elk woord moet ergens in de les staan. Eerst lessen met een tag die op de hele zoekterm
  // past ("march block"), dan treffers in de titel, dan tags die op een los woord passen.
  const woorden = q ? q.split(/\s+/).filter(Boolean) : [];
  const lesTags = (l: Les) => (l.tags ?? []).map((id) => tagIndex.get(id)).filter((t): t is Tag => !!t);
  const frasePast = (t: Tag) => tagPast(t, q);
  /** Tags om bij een treffer te tonen: die op de hele zoekterm passen, anders die op een los woord. */
  const gevondenTags = (l: Les) => {
    const frase = woorden.length > 1 ? lesTags(l).filter(frasePast) : [];
    return frase.length ? frase : lesTags(l).filter((t) => woorden.some((w) => tagPast(t, w)));
  };
  const treffers = woorden.length
    ? gefilterd
      .filter((l) => woorden.every((w) => bevat(hooiberg.get(l.id) ?? '', w)))
      .map((l, i) => {
        const titel = kleine(l.titel);
        const score = (lesTags(l).some(frasePast) ? 4 : 0) + (woorden.every((w) => bevat(titel, w)) ? 3 : 0)
          + (gevondenTags(l).length ? 1 : 0);
        return { l, i, score };
      })
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((x) => x.l)
    : [];

  // Principes die bij het legerfilter passen: algemene altijd, een legerprincipe alleen bij dat leger.
  const principePast = (p: Principe) => p.leger == null || leger === ALLE || p.leger === leger;
  const principeTreffers = woorden.length
    ? principes.principes.filter((p) => principePast(p) && woorden.every((w) => bevat(kleine(`${p.titel} ${p.tekst}`), w)))
    : [];
  const legerPrincipes = leger !== ALLE && leger !== ALGEMEEN ? principesVan(principes.perLeger[leger]) : [];
  const essentials = principesVan(principes.top10);
  const debatten = principesVan(principes.debat);

  const themas = vocab.themas
    .map((t) => ({ t, n: gefilterd.filter((l) => l.themas.includes(t.id)).length }))
    .filter((x) => x.n > 0);

  const faseNaam = (id: string) => faseIndex.get(id)?.naam ?? null;
  const specifiekLeger = (l: Les) => (l.leger ? legerLabel(l.leger) : null);
  const opFase = (a: Les, b: Les) => faseVolgorde(a.fase) - faseVolgorde(b.fase);

  if (lessen.length === 0) {
    return (
      <div style={{ height: '100%', overflowY: 'auto', padding: '12px 14px' }}>
        <EmptyLine>No lessons yet. Sources are being reviewed first.</EmptyLine>
      </div>
    );
  }

  const top = lagen.length ? lagen[lagen.length - 1] : null;
  const lijstStijl: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 };

  const lesRij = (l: Les, meta: (string | null)[], vanuitLijst: boolean, extra?: React.ReactNode) => {
    const actief = wide && top?.soort === 'les' && top.id === l.id;
    return (
      <li key={l.id} style={{ ...rowCard, borderColor: actief ? TOW.goldDeep : TOW.line, background: actief ? 'rgba(138,108,48,0.10)' : TOW.panel2 }}>
        <button type="button" onClick={() => onOpenLes(l.id, vanuitLijst)} style={rowButton} aria-current={actief ? 'true' : undefined}>
          <span style={{ ...titleText, ...clamp2 }}>{l.titel}</span>
          <Meta parts={meta} />
          {(l.markeringen.length > 0 || extra) && (
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
              {l.markeringen.map((m, i) => <Badge key={i} tone="blood">{MARKERING_LABEL[m.soort] ?? m.soort}</Badge>)}
              {extra}
            </span>
          )}
        </button>
      </li>
    );
  };

  const bewijs = (p: { aantalLessen: number; aantalKanalen: number }) =>
    [meervoud(p.aantalLessen, 'lesson', 'lessons'), meervoud(p.aantalKanalen, 'channel', 'channels')];

  /** Een principe als kaart (titel, uitleg, bewijs) of compact (titel, bewijs). rang = plaats in de top 10. */
  const principeRij = (p: Principe, opties: { rang?: number; compact?: boolean; vanuitLijst: boolean }) => {
    const actief = wide && opties.vanuitLijst && lagen[0]?.soort === 'principe' && lagen[0].id === p.id;
    return (
      <li key={p.id} style={{ ...rowCard, borderColor: actief ? TOW.goldDeep : TOW.line, background: actief ? 'rgba(138,108,48,0.10)' : TOW.panel2 }}>
        <button
          type="button"
          onClick={() => onOpenPrincipe(p.id, opties.vanuitLijst)}
          aria-current={actief ? 'true' : undefined}
          style={{ ...rowButton, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}
        >
          {opties.rang != null && (
            <span aria-hidden style={{ flexShrink: 0, minWidth: 16, fontFamily: towFont.display, fontWeight: 700, fontSize: 15, lineHeight: 1.3, color: TOW.goldDeep }}>
              {opties.rang}
            </span>
          )}
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={titleText}>{p.titel}</span>
            {!opties.compact && p.tekst && <span style={{ ...bodyText, fontSize: 13.5, ...clamp2 }}>{p.tekst}</span>}
            <Meta parts={[...bewijs(p), p.soort === 'debat' ? meervoud(p.kanten?.length ?? 0, 'side', 'sides') : null]} />
          </span>
        </button>
      </li>
    );
  };

  const lijstKop = (tekst: string, n: number | null, eerste = false) => (
    <h3 style={{ ...sectionHead, ...(eerste ? { marginTop: 4 } : {}) }}>
      <span style={{ flex: 1, minWidth: 0 }}>{tekst}</span>
      {n != null && <span style={{ color: TOW.muted }}>{n}</span>}
    </h3>
  );

  const filterLabel = leger !== ALLE ? (leger === ALGEMEEN ? 'General only' : legerLabel(leger)) : null;
  const kop = (tekst: string, ondertitel?: string | null) => (
    <h2 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 21, color: TOW.ink, margin: '0 0 4px', lineHeight: 1.25, overflowWrap: 'anywhere' }}>
      {ondertitel && <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: TOW.muted, marginBottom: 2 }}>{ondertitel}</span>}
      {tekst}
    </h2>
  );

  // ── Lijst: zoeken + thema's (of treffers) ──────────────────────────────────
  const lijst = (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, minWidth: 0 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search lessons and tags"
          aria-label="Search lessons and tags"
          style={{ ...inputStyle, flex: 1 }}
        />
        {legers.length > 1 && (
          <select
            value={leger}
            onChange={(e) => setLeger(e.target.value)}
            aria-label="Army"
            style={{
              flexShrink: 0, width: 118, minHeight: 40, padding: '0 6px', borderRadius: 11, cursor: 'pointer',
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

      {woorden.length ? (
        <>
          {principeTreffers.length > 0 && (
            <>
              {lijstKop('Principles', principeTreffers.length, true)}
              <ul style={{ ...lijstStijl, marginBottom: 12 }}>{principeTreffers.map((p) => principeRij(p, { compact: true, vanuitLijst: true }))}</ul>
            </>
          )}
          <div style={{ ...bodyText, fontSize: 13, color: TOW.muted, margin: '0 2px 8px' }}>
            {meervoud(treffers.length, 'lesson', 'lessons')}
          </div>
          {treffers.length === 0
            ? <EmptyLine>No lessons match.</EmptyLine>
            : (
              <ul style={lijstStijl}>
                {treffers.map((l) => {
                  const gevonden = gevondenTags(l);
                  return lesRij(l, [faseNaam(l.fase), specifiekLeger(l)], true,
                    gevonden.length ? gevonden.map((t) => <Badge key={t.id} tone="muted">{t.label}</Badge>) : null);
                })}
              </ul>
            )}
        </>
      ) : themas.length === 0 ? (
        <EmptyLine>No lessons for this army.</EmptyLine>
      ) : (
        <>
          {legerPrincipes.length > 0 && (
            <>
              {lijstKop(`${legerLabel(leger)} principles`, legerPrincipes.length, true)}
              <ul style={lijstStijl}>{legerPrincipes.map((p) => principeRij(p, { vanuitLijst: true }))}</ul>
            </>
          )}
          {essentials.length > 0 && (
            <>
              {lijstKop('Essentials', null, legerPrincipes.length === 0)}
              <ul style={lijstStijl}>{essentials.map((p, i) => principeRij(p, { rang: i + 1, vanuitLijst: true }))}</ul>
            </>
          )}
          {debatten.length > 0 && (
            <>
              {lijstKop('Debated', debatten.length)}
              <ul style={lijstStijl}>{debatten.map((p) => principeRij(p, { compact: true, vanuitLijst: true }))}</ul>
            </>
          )}
          {(essentials.length > 0 || legerPrincipes.length > 0) && lijstKop('Themes', themas.length)}
          <ul style={lijstStijl}>
            {themas.map(({ t, n }) => {
              const actief = wide && lagen[0]?.soort === 'thema' && lagen[0].id === t.id;
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
        </>
      )}
    </div>
  );

  // ── Principe open: samenvatting en de lessen eronder (bij een debat per kant) ───
  const principeView = (id: string) => {
    const p = principeIndex.get(id);
    if (!p) return <EmptyLine>Principle not found.</EmptyLine>;
    const thema = themaIndex.get(p.thema);
    const rijen = (ids: string[]) => ids.map((x) => lesIndex.get(x)).filter((l): l is Les => !!l)
      .map((l) => lesRij(l, [lesKanalen(l), faseNaam(l.fase), specifiekLeger(l)], false));
    const soortLabel = p.soort === 'debat' ? 'Debated' : p.leger ? `${legerLabel(p.leger)} principle` : 'Principle';
    return (
      <article style={{ maxWidth: 680, minWidth: 0 }}>
        {kop(p.titel, soortLabel)}
        <Meta parts={bewijs(p)} />
        <p style={{ ...bodyText, fontSize: 12.5, color: TOW.muted, margin: 0 }}>{p.kanalen.map((k) => kanaalIndex.get(k)?.naam ?? k).join(', ')}</p>
        {thema && (
          <button
            type="button"
            onClick={() => onOpenThema(thema.id)}
            style={{
              minHeight: 36, padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', maxWidth: '100%',
              color: TOW.goldDeep, fontFamily: towFont.display, fontWeight: 600, fontSize: 13, overflowWrap: 'anywhere',
              textDecoration: 'underline', textDecorationColor: TOW.line, textUnderlineOffset: 3,
            }}
          >
            {thema.naam}
          </button>
        )}
        <p style={{ ...bodyText, color: TOW.ink, fontSize: 15, margin: '6px 0 2px' }}>{p.tekst}</p>
        <p style={{ ...bodyText, fontSize: 12, color: TOW.muted, margin: 0 }}>Summary of the lessons below</p>
        {p.soort === 'debat' && p.kanten?.length ? p.kanten.map((k, i) => (
          <section key={i}>
            <h3 style={{ ...titleText, fontSize: 14.5, margin: '18px 2px 2px' }}>{k.standpunt}</h3>
            <Meta style={{ margin: '0 2px 8px' }} parts={bewijs(k)} />
            <ul style={lijstStijl}>{rijen(k.lessen)}</ul>
          </section>
        )) : (
          <>
            <h3 style={sectionHead}>
              <span>Lessons</span>
              <span style={{ color: TOW.muted }}>{p.lessen.length}</span>
            </h3>
            <ul style={lijstStijl}>{rijen(p.lessen)}</ul>
          </>
        )}
      </article>
    );
  };

  // ── Thema open: subthema's als secties ─────────────────────────────────────
  const themaView = (laag: Extract<Laag, { soort: 'thema' }>) => {
    const thema = themaIndex.get(laag.id);
    if (!thema) return <EmptyLine>Theme not found.</EmptyLine>;
    const van = gefilterd.filter((l) => l.themas.includes(thema.id));
    const subVan = (l: Les) => lesThemas(l).find((x) => x.thema === thema.id)?.subthema ?? null;
    const bekend = new Set(thema.subthemas.map((s) => s.id));
    const secties: { sub: Subthema | null; key: string; lessen: Les[] }[] = thema.subthemas
      .map((s) => ({ sub: s, key: s.id, lessen: van.filter((l) => subVan(l) === s.id).sort(opFase) }))
      .filter((g) => g.lessen.length > 0);
    const overig = van.filter((l) => { const s = subVan(l); return !s || !bekend.has(s); });
    if (overig.length) secties.push({ sub: null, key: OVERIG, lessen: overig.sort(opFase) });
    // Een lang thema opent met de eerste sectie plus de volgende zolang er samen niet meer dan
    // LANG_THEMA lessen open staan (hooguit OPEN_SECTIES), zodat de overige koppen zichtbaar blijven.
    const lang = van.length > LANG_THEMA;
    const standaardOpen = new Set<string>();
    let opgeteld = 0;
    secties.forEach((g, i) => {
      if (!lang || i === 0 || (i < OPEN_SECTIES && opgeteld + g.lessen.length <= LANG_THEMA && standaardOpen.size === i)) {
        standaardOpen.add(g.key);
        opgeteld += g.lessen.length;
      }
    });
    // Kernprincipes: met een legerfilter eerst die van het leger in dit thema, dan de algemene.
    const kern = [
      ...legerPrincipes.filter((p) => p.thema === thema.id),
      ...principesVan(principes.perThema[thema.id]),
    ];
    const isOpen = (key: string, _i: number) => klap.get(`${thema.id}:${key}`) ?? (standaardOpen.has(key) || key === laag.sub);
    const wissel = (key: string, i: number) => setKlap((m) => new Map(m).set(`${thema.id}:${key}`, !isOpen(key, i)));
    return (
      <div style={{ maxWidth: 680, minWidth: 0 }}>
        {kop(thema.naam)}
        {thema.omschrijving && <p style={{ ...bodyText, margin: '0 0 4px' }}>{thema.omschrijving}</p>}
        <Meta parts={[meervoud(van.length, 'lesson', 'lessons'), meervoud(secties.length, 'section', 'sections'), filterLabel]} />
        {kern.length > 0 && (
          <>
            <h3 style={sectionHead}>
              <span>Key principles</span>
              <span style={{ color: TOW.muted }}>{kern.length}</span>
            </h3>
            <ul style={lijstStijl}>{kern.map((p) => principeRij(p, { compact: true, vanuitLijst: false }))}</ul>
          </>
        )}
        {van.length === 0 && <EmptyLine>No lessons for this army.</EmptyLine>}
        {secties.map((g, i) => {
          const open = isOpen(g.key, i);
          return (
            <section key={g.key} id={`sectie-${thema.id}-${g.key}`} style={{ scrollMarginTop: 8 }}>
              <h3 style={{ margin: 0 }}>
                <button
                  type="button"
                  onClick={() => wissel(g.key, i)}
                  aria-expanded={open}
                  title={g.sub?.omschrijving || undefined}
                  style={{
                    ...sectionHead, width: '100%', minHeight: 40, margin: '10px 0 4px', padding: '0 2px', border: 'none',
                    borderBottom: `1px solid ${TOW.hairline}`, background: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{g.sub?.naam ?? 'Other'}</span>
                  <span style={{ color: TOW.muted }}>{g.lessen.length}</span>
                  <span aria-hidden style={{ color: TOW.muted, fontSize: 16, lineHeight: 1, width: 12, textAlign: 'center', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
                </button>
              </h3>
              {open && <ul style={{ ...lijstStijl, marginTop: 6 }}>{g.lessen.map((l) => lesRij(l, [faseNaam(l.fase), specifiekLeger(l)], false))}</ul>}
            </section>
          );
        })}
      </div>
    );
  };

  // ── Tag open: alle lessen met die tag ──────────────────────────────────────
  const tagView = (id: string) => {
    const tag = tagIndex.get(id);
    const van = gefilterd.filter((l) => (l.tags ?? []).includes(id));
    const hoofd = (l: Les) => {
      const lt = lesThemas(l)[0];
      return lt ? (subNaam(lt.thema, lt.subthema) ?? themaIndex.get(lt.thema)?.naam ?? null) : null;
    };
    return (
      <div style={{ maxWidth: 680, minWidth: 0 }}>
        {kop(tag?.label ?? id, 'Tag')}
        <Meta parts={[meervoud(van.length, 'lesson', 'lessons'), filterLabel]} />
        {van.length === 0
          ? <EmptyLine>No lessons for this army.</EmptyLine>
          : <ul style={{ ...lijstStijl, marginTop: 12 }}>{van.map((l) => lesRij(l, [hoofd(l), specifiekLeger(l)], false))}</ul>}
      </div>
    );
  };

  const lesView = (id: string) => {
    const les = lessen.find((l) => l.id === id);
    if (!les) return <EmptyLine>Lesson not found.</EmptyLine>;
    return (
      <LesDetail
        les={les}
        bronIndex={bronIndex}
        kanaalIndex={kanaalIndex}
        faseNaam={faseNaam(les.fase)}
        themas={lesThemas(les).map((lt) => ({ thema: themaIndex.get(lt.thema), sub: subNaam(lt.thema, lt.subthema), subId: lt.subthema }))
          .filter((x): x is { thema: Thema; sub: string | null; subId: string | null } => !!x.thema)}
        tags={(les.tags ?? []).map((t) => tagIndex.get(t)).filter((t): t is Tag => !!t)}
        onOpenThema={(t, sub) => {
          if (sub) setKlap((m) => new Map(m).set(`${t}:${sub}`, true));
          onOpenThema(t, sub);
        }}
        onOpenTag={onOpenTag}
      />
    );
  };

  const laagView = (laag: Laag) => (laag.soort === 'thema' ? <ThemaScroll laag={laag}>{themaView(laag)}</ThemaScroll>
    : laag.soort === 'principe' ? principeView(laag.id)
      : laag.soort === 'tag' ? tagView(laag.id) : lesView(laag.id));

  /** Naam van de laag onder de bovenste (voor de terugknop). */
  const laagNaam = (laag: Laag | undefined): string => {
    if (!laag) return 'Lessons';
    if (laag.soort === 'thema') return themaIndex.get(laag.id)?.naam ?? 'Theme';
    if (laag.soort === 'tag') return tagIndex.get(laag.id)?.label ?? 'Tag';
    if (laag.soort === 'principe') return 'Principle';
    return 'Lesson';
  };

  if (wide) {
    return (
      <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
        <div style={{ width: 380, flexShrink: 0, overflowY: 'auto', padding: '14px 14px 40px', borderRight: `1px solid ${TOW.lineStrong}` }}>
          {lijst}
        </div>
        <div key={top ? `${lagen.length}-${top.soort}-${top.id}` : 'leeg'} style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '14px 24px 40px' }}>
          {top ? (
            <>
              {lagen.length > 1 && <div style={{ margin: '0 0 6px -4px' }}><BackButton onClick={onTerug} label={laagNaam(lagen[lagen.length - 2])} /></div>}
              {laagView(top)}
            </>
          ) : <EmptyLine>{essentials.length ? 'Select a principle or theme.' : 'Select a theme.'}</EmptyLine>}
        </div>
      </div>
    );
  }

  // Telefoon: elke laag blijft gemount (verborgen) zodat de scrollpositie bewaard blijft; terug gaat
  // via de knop in de kop van de pagina of de hardware-Back.
  return (
    <>
      <div style={{ height: '100%', overflowY: 'auto', padding: '12px 12px 40px', display: top ? 'none' : 'block' }}>{lijst}</div>
      {lagen.map((laag, i) => (
        <div
          key={`${i}-${laag.soort}-${laag.id}`}
          style={{ height: '100%', overflowY: 'auto', padding: '14px 12px 40px', display: i === lagen.length - 1 ? 'block' : 'none' }}
        >
          {laagView(laag)}
        </div>
      ))}
    </>
  );
}

/** Scrolt bij het openen naar het subthema waarmee het thema geopend werd (een tik in een les). */
function ThemaScroll({ laag, children }: { laag: Extract<Laag, { soort: 'thema' }>; children: React.ReactNode }) {
  useEffect(() => {
    if (!laag.sub) return;
    document.getElementById(`sectie-${laag.id}-${laag.sub}`)?.scrollIntoView({ block: 'start' });
  }, [laag.id, laag.sub]);
  return <>{children}</>;
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

const chipKnop: React.CSSProperties = {
  minHeight: 36, padding: '0 12px', borderRadius: 999, cursor: 'pointer', maxWidth: '100%',
  border: `1px solid ${TOW.lineStrong}`, background: 'transparent', color: TOW.goldDeep,
  fontFamily: towFont.display, fontWeight: 600, fontSize: 13, overflowWrap: 'anywhere', textAlign: 'left',
};

function LesDetail({ les, bronIndex, kanaalIndex, faseNaam, themas, tags, onOpenThema, onOpenTag }: {
  les: Les;
  bronIndex: Map<string, Bron>;
  kanaalIndex: Map<string, Kanaal>;
  faseNaam: string | null;
  themas: { thema: Thema; sub: string | null; subId: string | null }[];
  tags: Tag[];
  onOpenThema: (id: string, sub?: string | null) => void;
  onOpenTag: (id: string) => void;
}) {
  return (
    <article style={{ maxWidth: 680, minWidth: 0 }}>
      <h2 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 20, color: TOW.ink, margin: '0 0 2px', lineHeight: 1.3, overflowWrap: 'anywhere' }}>
        {les.titel}
      </h2>
      <Meta style={{ marginBottom: 4 }} parts={[faseNaam, legerLabel(les.leger), les.datum]} />
      <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 0, marginBottom: 8 }}>
        {themas.map(({ thema, sub, subId }) => (
          <button
            key={thema.id}
            type="button"
            onClick={() => onOpenThema(thema.id, subId)}
            style={{
              minHeight: 36, padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', maxWidth: '100%',
              color: TOW.goldDeep, fontFamily: towFont.display, fontWeight: 600, fontSize: 13, overflowWrap: 'anywhere',
              textDecoration: 'underline', textDecorationColor: TOW.line, textUnderlineOffset: 3,
            }}
          >
            {sub ? `${thema.naam}: ${sub}` : thema.naam}
          </button>
        ))}
      </div>
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

      {tags.length > 0 && (
        <>
          <h3 style={sectionHead}>Tags</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.map((t) => (
              <button key={t.id} type="button" onClick={() => onOpenTag(t.id)} style={chipKnop}>{t.label}</button>
            ))}
          </div>
        </>
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
