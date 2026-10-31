import { useEffect, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { lijstNaarLegerAsync } from '../../lib/lijstNaarLeger';
import type { DeelbareLijst } from '../../lib/listShare';
import type { Army, ArmyUnit } from '../../types';
import { UnitCard } from './UnitCard';

// HET LEGER VAN JE TEGENSTANDER ALS ECHTE UNITKAARTEN (31-10-2026).
//
// "om hem te bekijken in de Companion, met alle rules enzo, alsof je hem in de armybuilder hebt"
// (Joost, 31-10-2026). Het kale roster van LockedListView (naam + aantal) beantwoordt dat niet: aan
// tafel wil je zijn statlines, uitrusting, special rules, magic items, mounts en spreuken kunnen
// openen. Die staan allemaal al op de UnitCard van de Game-tab, dus dit scherm toont precies díé
// kaart — gebouwd met hetzelfde recept (`lijstNaarLegerAsync`: catalogus + compositie-overlay +
// statlines + magic-item- en mount-tekst), zodat je hier exact ziet wat er straks aan tafel staat.
//
// PUUR LEZEN. De kaart krijgt bewust GEEN van de schrijvende koppelingen: geen `onChange`, geen
// `onSetLost`/`onRemoved`/`onFlee`/`onSetKills`/`onSetKillDetail` (dus geen WoundTracker), geen
// `scenarioKnoppen`, en `editable={false}` (dus geen "Choose spells"/lore-keuze in WizardSpells).
// Wat overblijft opent alleen regels en infobladen, of verandert iets dat lokaal in de kaart zelf
// leeft (de Loadout-rekenhulp, het mount-tabje). Niets daarvan komt in `tow:lists` of in een game.
//
// Alleen voor de tegenstander-modus; de gedeelde lijst en de campagne-lock houden hun roster.

const eb = engraved as React.CSSProperties;

type Staat = { soort: 'laden' } | { soort: 'fout'; tekst: string } | { soort: 'klaar'; leger: Army };

export function TegenLegerKaarten({ lijst }: { lijst: DeelbareLijst }) {
  const [staat, setStaat] = useState<Staat>({ soort: 'laden' });
  // Dicht/open per unit, standaard dicht — zoals de roster in de Game-tab. Lokale state: het is een
  // leesscherm, er hoeft niets van bewaard te worden.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [mountTab, setMountTab] = useState<{ id: string; i: number } | null>(null);

  useEffect(() => {
    let weg = false;
    setStaat({ soort: 'laden' });
    lijstNaarLegerAsync({
      name: lijst.name, army: lijst.army, composition: lijst.composition,
      rule: lijst.rule, points: lijst.points, entries: lijst.entries,
    })
      .then((leger) => { if (!weg) setStaat({ soort: 'klaar', leger }); })
      .catch((e: unknown) => {
        if (weg) return;
        console.warn('[tegenlijst] unitkaarten', e);
        const m = e instanceof Error && e.message.trim() ? e.message.trim() : 'Could not build the unit cards for this army.';
        setStaat({ soort: 'fout', tekst: m });
      });
    return () => { weg = true; };
  }, [lijst]);

  if (staat.soort === 'laden') {
    return <p style={{ fontFamily: towFont.serif, fontSize: 14, color: TOW.muted, margin: '8px 0' }}>Loading the unit cards…</p>;
  }
  if (staat.soort === 'fout') {
    return <p style={{ fontFamily: towFont.serif, fontSize: 14, lineHeight: 1.6, color: TOW.blood, margin: '8px 0' }}>{staat.tekst}</p>;
  }

  const leger = staat.leger;
  if (leger.units.length === 0) {
    return <p style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14, color: TOW.muted }}>This list is empty.</p>;
  }

  // Zelfde groepering en koppen als `groups` in GameView: per categorie, in de volgorde waarin de
  // units binnenkomen, en een versterkings-unit onder een eigen kop.
  const groepen: { category: string; units: ArmyUnit[] }[] = [];
  for (const u of leger.units) {
    const kop = u.versterking ? `Reinforcements · ${u.category}` : u.category;
    let g = groepen.find((x) => x.category === kop);
    if (!g) { g = { category: kop, units: [] }; groepen.push(g); }
    g.units.push(u);
  }

  const allesOpen = leger.units.every((u) => open.has(u.id));
  const wissel = (id: string) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 0 2px' }}>
        <button
          type="button"
          onClick={() => setOpen(allesOpen ? new Set() : new Set(leger.units.map((u) => u.id)))}
          style={{ border: `1px solid ${TOW.line}`, borderRadius: 999, background: 'transparent', color: TOW.muted, cursor: 'pointer', padding: '3px 11px', fontFamily: towFont.display, fontWeight: 600, fontSize: 12 }}
        >
          {allesOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      {groepen.map((g) => (
        <div key={g.category} style={{ marginBottom: 8 }}>
          <div style={{ ...eb, fontSize: 9, color: TOW.goldDeep, margin: '12px 2px 8px' }}>{g.category}</div>
          {g.units.map((u) => (
            <UnitCard
              key={u.id}
              unit={u}
              faction={leger.faction}
              editable={false}
              collapsed={!open.has(u.id)}
              onToggleCollapse={() => wissel(u.id)}
              toonMount={mountTab?.id === u.id ? mountTab.i : null}
              onToonMount={(i) => setMountTab(i == null ? null : { id: u.id, i })}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
