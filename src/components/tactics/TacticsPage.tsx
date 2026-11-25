import { useCallback, useEffect, useRef, useState } from 'react';
import { TOW, towFont } from '../../design/tow';
import { useBackClose } from '../../lib/backStack';
import { laadTactics, type TacticsData } from '../../lib/tactics';
import { TacticsSources } from './TacticsSources';
import { TacticsLessons, type Laag } from './TacticsLessons';
import { BackButton, EmptyLine, useTacticsWide } from './tacticsUi';

type Tab = 'lessons' | 'sources';

/** Hooguit zoveel lagen boven de themalijst (thema, les, tag, les, ...); daarboven vervangt een
 *  nieuwe laag de bovenste. Er zijn evenveel useBackClose-haken als lagen. */
const MAX_LAGEN = 6;

// De tactiekdatabank (docs/tactics/ontwerp.md). Nog geen hoofdtab: geopend vanuit Settings of via
// `?tactics`. Twee weergaven: Lessons (thema's met subthema's, tags, lessen) en Sources. In Lessons
// staan de geopende lagen op een stapel: thema, les, de lessen met een tag, weer een les. Op de
// telefoon is elke laag een eigen scherm (Back haalt de bovenste weg); vanaf ~760 px staat de lijst
// links en de bovenste laag rechts, en is de onderste laag rechts geen aparte Back-stap.
export function TacticsPage({ onClose }: { onClose: () => void }) {
  const wide = useTacticsWide();
  const [data, setData] = useState<TacticsData | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [selKanaal, setSelKanaal] = useState<string | null>(null);
  const [lagen, setLagen] = useState<Laag[]>([]);
  // Een les die vanuit een kanaal geopend is: terug gaat dan naar Sources.
  const [lesVanuitBronnen, setLesVanuitBronnen] = useState(false);

  useEffect(() => {
    let weg = false;
    void laadTactics().then((d) => {
      if (weg) return;
      setData(d);
      setTab((t) => t ?? (d.lessen.lessen.length > 0 ? 'lessons' : 'sources'));
    });
    return () => { weg = true; };
  }, []);

  const vanuitRef = useRef(false);
  vanuitRef.current = lesVanuitBronnen;
  const lagenRef = useRef<Laag[]>([]);
  lagenRef.current = lagen;

  // Eén laag omhoog. Was dat de les uit Sources, dan terug naar Sources.
  const omhoog = useCallback(() => {
    const rest = lagenRef.current.slice(0, -1);
    setLagen(rest);
    if (rest.length === 0 && vanuitRef.current) { setTab('sources'); setLesVanuitBronnen(false); }
  }, []);

  const diepte = tab !== 'lessons' ? 0 : wide ? Math.max(0, lagen.length - 1) : lagen.length;

  // Back sluit eerst wat open staat: de kanaallaag (alleen telefoon) en elke laag in Lessons apart.
  // Vast aantal haken; elk is actief zolang de stapel minstens zo diep is.
  useBackClose(!wide && selKanaal !== null, () => setSelKanaal(null));
  useBackClose(diepte >= 1, omhoog);
  useBackClose(diepte >= 2, omhoog);
  useBackClose(diepte >= 3, omhoog);
  useBackClose(diepte >= 4, omhoog);
  useBackClose(diepte >= 5, omhoog);
  useBackClose(diepte >= 6, omhoog);

  const kiesTab = (t: Tab) => {
    if (t === tab) return;
    // Wat op de andere tab open stond gaat dicht, zodat Back niet iets onzichtbaars sluit. Een geopend
    // thema blijft bewaard (de lagen tellen alleen op de Lessons-tab); wat erboven lag gaat dicht.
    if (t === 'lessons') setSelKanaal(null);
    else { setLagen((l) => (l[0]?.soort === 'thema' ? [l[0]] : [])); setLesVanuitBronnen(false); }
    setTab(t);
  };

  const duw = (laag: Laag) => setLagen((l) => {
    const boven = l[l.length - 1];
    if (boven && boven.soort === laag.soort && boven.id === laag.id) return l;
    return l.length >= MAX_LAGEN ? [...l.slice(0, -1), laag] : [...l, laag];
  });

  const openLesVanuitBron = (id: string) => {
    setLesVanuitBronnen(true);
    setLagen([{ soort: 'les', id }]);
    setTab('lessons');
  };

  const openLes = (id: string, vanuitLijst: boolean) => {
    if (vanuitLijst) setLagen([{ soort: 'les', id }]);
    else duw({ soort: 'les', id });
  };

  const openTag = (id: string) => duw({ soort: 'tag', id });

  // Een thema openen (uit de lijst of uit een les) begint de stapel opnieuw. Kwam de les uit Sources,
  // dan gaat ook het kanaal dicht: terug loopt vanaf hier door Lessons.
  const openThema = (id: string, sub?: string | null) => {
    setLagen([{ soort: 'thema', id, sub: sub ?? null }]);
    if (vanuitRef.current) { setLesVanuitBronnen(false); setSelKanaal(null); }
  };

  // Eén terugknop in de kop: haalt precies de laag weg die de hardware-Back ook zou weghalen, en
  // sluit daarna de pagina.
  const kanaalOpen = !wide && tab === 'sources' && selKanaal !== null;
  const laagNaam = (laag: Laag | undefined): string => {
    if (!laag) return lesVanuitBronnen ? 'Sources' : 'Lessons';
    if (laag.soort === 'thema') return data?.vocab.themas.find((t) => t.id === laag.id)?.naam ?? 'Theme';
    if (laag.soort === 'tag') return data?.tags.find((t) => t.id === laag.id)?.label ?? 'Tag';
    return 'Lesson';
  };
  const terug = () => {
    if (diepte > 0) omhoog();
    else if (kanaalOpen) setSelKanaal(null);
    else onClose();
  };
  const terugLabel = diepte > 0 ? laagNaam(lagen[lagen.length - 2]) : kanaalOpen ? 'Sources' : 'Back';

  const aantalLessen = data?.lessen.lessen.length ?? 0;
  const aantalKanalen = data?.bronnen?.kanalen.length ?? 0;

  const tabKnop = (t: Tab, label: string, n: number) => {
    const on = tab === t;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => kiesTab(t)}
        style={{
          flex: 1, minHeight: 40, border: 'none', cursor: 'pointer', borderRadius: 9,
          background: on ? TOW.panel2 : 'transparent',
          boxShadow: on ? `0 0 0 1px ${TOW.lineStrong}` : 'none',
          color: on ? TOW.goldDeep : TOW.parchDim,
          fontFamily: towFont.display, fontWeight: 600, fontSize: 14,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        {label}
        <span style={{ fontSize: 12, color: TOW.muted, fontWeight: 500 }}>{n}</span>
      </button>
    );
  };

  let inhoud: React.ReactNode;
  if (!data || !tab) {
    inhoud = <div style={{ padding: '12px 14px' }}><EmptyLine>Loading…</EmptyLine></div>;
  } else if (tab === 'sources') {
    inhoud = data.bronnen ? (
      <TacticsSources
        data={data.bronnen}
        lessen={data.lessen.lessen}
        wide={wide}
        selId={selKanaal}
        onSelect={setSelKanaal}
        onOpenLesson={openLesVanuitBron}
      />
    ) : (
      <div style={{ padding: '12px 14px' }}><EmptyLine>Sources could not be loaded.</EmptyLine></div>
    );
  } else {
    inhoud = (
      <TacticsLessons
        lessen={data.lessen.lessen}
        vocab={data.vocab}
        tags={data.tags}
        bronnen={data.bronnen}
        wide={wide}
        lagen={lagen}
        onOpenThema={openThema}
        onOpenLes={openLes}
        onOpenTag={openTag}
        onTerug={omhoog}
      />
    );
  }

  return (
    <div
      className="tow-field"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: TOW.bg, color: TOW.ink, overflow: 'hidden' }}
    >
      <header
        className="pt-safe"
        style={{ flexShrink: 0, background: TOW.panel, borderBottom: `1px solid ${TOW.lineStrong}`, padding: '6px 12px 10px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: wide ? 'none' : 560, margin: '0 auto' }}>
          <BackButton onClick={terug} label={terugLabel} />
          <h1 style={{ flex: 1, minWidth: 0, margin: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 21, color: TOW.goldDeep, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Tactics
          </h1>
        </div>
        <div
          role="tablist"
          aria-label="Tactics views"
          style={{ display: 'flex', gap: 4, padding: 3, marginTop: 6, borderRadius: 12, background: TOW.bg, border: `1px solid ${TOW.line}`, maxWidth: wide ? 380 : 560, marginLeft: wide ? 0 : 'auto', marginRight: 'auto' }}
        >
          {tabKnop('lessons', 'Lessons', aantalLessen)}
          {tabKnop('sources', 'Sources', aantalKanalen)}
        </div>
      </header>
      <div className="pb-safe" style={{ flex: 1, minHeight: 0, width: '100%', maxWidth: wide ? 'none' : 560, margin: '0 auto' }}>
        {inhoud}
      </div>
    </div>
  );
}
