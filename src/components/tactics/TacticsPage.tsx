import { useCallback, useEffect, useRef, useState } from 'react';
import { TOW, towFont } from '../../design/tow';
import { useBackClose } from '../../lib/backStack';
import { laadTactics, type TacticsData } from '../../lib/tactics';
import { TacticsSources } from './TacticsSources';
import { TacticsLessons } from './TacticsLessons';
import { BackButton, EmptyLine, useTacticsWide } from './tacticsUi';

type Tab = 'lessons' | 'sources';

// De tactiekdatabank (docs/tactics/ontwerp.md). Nog geen hoofdtab: geopend vanuit Settings of via
// `?tactics`. Twee weergaven: Lessons en Sources. Op de telefoon opent een kanaal of les als eigen
// scherm (Back sluit het eerst); vanaf ~760 px staat het geopende item rechts naast de lijst.
export function TacticsPage({ onClose }: { onClose: () => void }) {
  const wide = useTacticsWide();
  const [data, setData] = useState<TacticsData | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [selKanaal, setSelKanaal] = useState<string | null>(null);
  const [selLes, setSelLes] = useState<string | null>(null);
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
  const sluitLes = useCallback(() => {
    setSelLes(null);
    if (vanuitRef.current) setTab('sources');
    setLesVanuitBronnen(false);
  }, []);

  // Back sluit eerst het geopende kanaal of de les (alleen op de telefoon; breed staan ze naast de
  // lijst). Elk op zich, zodat een les die vanuit een kanaal geopend is terugkeert naar dat kanaal.
  useBackClose(!wide && selKanaal !== null, () => setSelKanaal(null));
  useBackClose(!wide && selLes !== null, sluitLes);

  const kiesTab = (t: Tab) => {
    if (t === tab) return;
    // Wat op de andere tab open stond gaat dicht, zodat Back niet iets onzichtbaars sluit.
    if (t === 'lessons') setSelKanaal(null);
    else { setSelLes(null); setLesVanuitBronnen(false); }
    setTab(t);
  };

  const openLesVanuitBron = (id: string) => {
    setLesVanuitBronnen(true);
    setSelLes(id);
    setTab('lessons');
  };

  // Eén terugknop in de kop. Op de telefoon sluit hij eerst het geopende kanaal of de les (precies
  // wat de hardware-Back doet), daarna de pagina. Zo gaat er per tik één laag van de back-stack af.
  const lesOpen = !wide && tab === 'lessons' && selLes !== null;
  const kanaalOpen = !wide && tab === 'sources' && selKanaal !== null;
  const terug = () => {
    if (lesOpen) sluitLes();
    else if (kanaalOpen) setSelKanaal(null);
    else onClose();
  };
  const terugLabel = lesOpen ? (lesVanuitBronnen ? 'Sources' : 'Lessons') : kanaalOpen ? 'Sources' : 'Back';

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
        bronnen={data.bronnen}
        wide={wide}
        selId={selLes}
        onSelect={(id) => (id === null ? sluitLes() : setSelLes(id))}
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
