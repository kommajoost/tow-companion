import { useEffect, useMemo, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { COMPOSITION_RULES, type OwbArmy, type ListEntry, type MagicItemsData } from '../../lib/owbBuilder';
import { compName as compNameFor } from '../../lib/armies';
import { importOwbText } from '../../lib/owbImport';
import { OwbInstructions } from './OwbInstructions';
import { CompositionInfo } from './CompositionInfo';
import { CompositionRulePicker } from './CompositionRulePicker';
import { useCampagnes } from '../../lib/campaign';

// OWB-style "new list" setup, shown before the builder opens: pick the army (faction), a name,
// army composition, points target and composition rule. Choosing the army swaps which compositions
// are offered AND which catalogue the "Paste an OWB list" import matches against (fetched here, so
// the dialog doesn't depend on the parent's single catalogue). The values chosen are stored on the
// list and stay editable later from the workspace's ⚙ panel.

const eb = engraved as React.CSSProperties;
const BASE = import.meta.env.BASE_URL;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;
const POINT_PRESETS = [500, 750, 1000, 1500, 2000, 2500];

// Leesbare naam voor een compositie-rule-id (uit COMPOSITION_RULES), val terug op de id zelf.
const ruleName = (id: string): string => COMPOSITION_RULES.find((r) => r.id === id)?.name ?? id;
// De door de campagne toegestane compositie-regels deze fase, defensief tegen onbekende ids.
// Fase 1-2 levert doorgaans ["battle-march"]; fase 3+ ["combined-arms","grand-melee"].
const allowedCampaignRules = (compositie: string[]): string[] => {
  const known = compositie.filter((id) => COMPOSITION_RULES.some((r) => r.id === id));
  return known.length ? known : compositie; // leeg/onbekend ⇒ geef door wat er is (kan leeg zijn)
};

export interface NewListValues {
  name: string; army: string; composition: string; points: number; rule: string; entries: ListEntry[];
  // Campagne-koppeling (De Grensvorsten) — alleen gezet als de "Campaign list"-toggle aan stond.
  campaign?: boolean; campaignSpeler?: string; campaignNaam?: string; campaignFase?: number;
}

export function NewListSetup({ armies, compsByArmy, defaultArmy, defaultName, onCancel, onCreate, itemsData, itemListsByArmy, forceCampaign }: {
  armies: { slug: string; name: string }[];
  compsByArmy: Record<string, string[]>;
  defaultArmy: string;
  defaultName: string;
  onCancel: () => void;
  onCreate: (v: NewListValues) => void;
  itemsData?: MagicItemsData;
  itemListsByArmy?: Record<string, string[]>; // army slug → its magic-item list ids
  /** Opened from the campaign panel: this IS the campaign list, so the toggle is on and gone. */
  forceCampaign?: boolean;
}) {
  const [name, setName] = useState(defaultName);
  const [army, setArmy] = useState(defaultArmy);
  const comps = compsByArmy[army] ?? [army];
  const [composition, setComposition] = useState(comps[0] ?? army);
  const [points, setPoints] = useState(2000);
  const [rule, setRule] = useState('open-war');
  const [compInfo, setCompInfo] = useState<string | null>(null);
  const [mode, setMode] = useState<'empty' | 'import'>('empty');
  const [paste, setPaste] = useState('');
  // The selected army's catalogue, fetched here so the import matches against THIS army's units.
  const [catalogue, setCatalogue] = useState<OwbArmy | null>(null);

  // ── Campagne (Isle of Celedon) ──────────────────────────────────────────────────────────────
  // Sinds de account-koppeling (28-07-2026) is een campagne "beschikbaar" als het INGELOGDE account
  // er een heeft — geen code meer, en de context staat al in de store. `forceCampaign` betekent dat
  // de speler op "start mijn campagne-lijst" drukte: dan is dit de campagne-lijst, punt.
  const { actief: campaignCtx } = useCampagnes();
  const [campaign, setCampaign] = useState(!!forceCampaign);

  const armyName = armies.find((a) => a.slug === army)?.name ?? army;

  // When the army changes, reset the composition to its first comp and (re)load its catalogue.
  useEffect(() => {
    const list = compsByArmy[army] ?? [army];
    setComposition(list[0] ?? army);
  }, [army, compsByArmy]);
  useEffect(() => {
    let cancelled = false;
    setCatalogue(null);
    fetch(`${BASE}owb/${army}.json`).then((r) => r.json()).then((c) => { if (!cancelled) setCatalogue(c); }).catch(() => { if (!cancelled) setCatalogue(null); });
    return () => { cancelled = true; };
  }, [army]);

  // Houd de rule binnen de campagne-set zolang de lock actief is (bv. een import zette 'm net op een
  // niet-toegestane rule, of de fase-compositie verschoof). Buiten de campagne: geen bemoeienis.
  useEffect(() => {
    if (!campaign || !campaignCtx) return;
    const allowed = allowedCampaignRules(campaignCtx.compositie);
    if (allowed.length && !allowed.includes(rule)) setRule(allowed[0]);
  }, [campaign, campaignCtx, rule]);

  const preview = useMemo(() => (mode === 'import' && paste.trim() && catalogue ? importOwbText(paste, catalogue, itemsData, itemListsByArmy?.[army] ?? []) : null), [mode, paste, catalogue, itemsData, itemListsByArmy, army]);
  // Adopt the export's name/points/rule into the editable fields above.
  useEffect(() => {
    if (!preview) return;
    if (preview.header.name) setName(preview.header.name);
    if (preview.header.points != null) setPoints(preview.header.points);
    if (preview.header.rule) setRule(preview.header.rule);
  }, [preview]);

  // Campagne-modus aanzetten: puntenlimiet op de fase-cap (en op slot), de compositie-rule binnen de
  // toegestane set, en het leger op de campagne-factie. Bij uitzetten laten we de huidige waarden
  // staan (minder verrassend) en gaat het slot eraf.
  const zetCampagne = (aan: boolean) => {
    setCampaign(aan);
    if (!aan || !campaignCtx) return;
    setPoints(campaignCtx.puntenCap);
    // Fase 1-2 ⇒ battle-march; fase 3+ ⇒ combined-arms als default.
    const allowed = allowedCampaignRules(campaignCtx.compositie);
    if (allowed.length && !allowed.includes(rule)) setRule(allowed[0]);
    // De factie komt als catalogus-slug mee (server-side afgeleid van de weergavenaam). Alleen bij een
    // echte match kiezen — 'realms-of-men' bestaat niet in OWC, dan houdt de speler de vrije keuze.
    const slug = campaignCtx.speler.factieSlug;
    if (slug && armies.some((a) => a.slug === slug)) setArmy(slug);
  };

  // Vanaf de campagne-band binnengekomen: meteen in campagne-modus, zodra de legers geladen zijn
  // (de factie-preselectie heeft die lijst nodig).
  useEffect(() => {
    if (!forceCampaign || !campaignCtx || armies.length === 0) return;
    zetCampagne(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceCampaign, campaignCtx, armies.length]);

  const label: React.CSSProperties = { ...eb, fontSize: 8.5, color: TOW.muted };
  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 14, color: TOW.ink, outline: 'none' };
  const pointsLocked = campaign; // punten-veld staat vast op de fase-cap zolang de campagne-toggle aan is

  // Compositie-rule-lock (campagne). Als de toggle aan is, beperken we de rule tot ctx.compositie:
  //   • 1 optie  ⇒ vast (select disabled), toelichting "Campaign phase X — <naam>";
  //   • meerdere ⇒ select toont alleen die opties, toelichting "Campaign phase X — A or B".
  const campaignRules = campaign && campaignCtx ? allowedCampaignRules(campaignCtx.compositie) : [];
  const ruleLocked = campaignRules.length > 0; // er is een geldige campagne-set om op te locken
  const ruleLockNote = ruleLocked && campaignCtx
    ? `Campaign phase ${campaignCtx.fase} — ${campaignRules.map(ruleName).join(' or ')}`
    : '';

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(30,20,8,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto', background: TOW.panel, borderRadius: 16, border: `1px solid ${TOW.lineStrong}`, boxShadow: '0 16px 50px rgba(40,24,8,0.34)', padding: 18, animation: 'sheet-pop .18s ease-out' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <h2 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 20, color: TOW.ink, margin: 0 }}>New list</h2>
          <button onClick={onCancel} aria-label="Close" style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', color: TOW.muted, fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ ...label, marginBottom: 6 }}>List name</div>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus style={{ ...field, fontFamily: towFont.display, fontWeight: 600, fontSize: 15 }} />

        <div style={{ ...label, margin: '16px 0 6px' }}>Army (faction)</div>
        <select value={army} onChange={(e) => setArmy(e.target.value)} style={field}>
          {armies.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
        </select>

        <div style={{ ...label, margin: '16px 0 6px' }}>Start from</div>
        <select value={mode} onChange={(e) => setMode(e.target.value as 'empty' | 'import')} style={field}>
          <option value="empty">Empty list</option>
          <option value="import">Paste an Old World Builder list</option>
        </select>

        {mode === 'import' && (
          <div style={{ marginTop: 10 }}>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste the full Old World Builder export here…" rows={7} style={{ ...field, resize: 'vertical', fontFamily: towFont.serif, fontSize: 13, lineHeight: 1.45 }} />
            <OwbInstructions defaultOpen={!paste.trim()} />
            {preview && (
              <div style={{ marginTop: 9, padding: '9px 11px', borderRadius: 9, border: `1px solid ${preview.matched ? TOW.line : 'rgba(124,43,34,0.4)'}`, background: 'rgba(74,55,22,0.05)' }}>
                <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: preview.matched ? TOW.parchDim : TOW.blood }}>
                  Matched <strong>{preview.matched}</strong> of {preview.total} unit{preview.total === 1 ? '' : 's'}.
                </div>
                {preview.unmatched.length > 0 && (
                  <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.muted, marginTop: 4, lineHeight: 1.5 }}>
                    Not in the {armyName} catalogue (skipped): {preview.unmatched.join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ ...label, margin: '16px 0 6px' }}>Army composition</div>
        <select value={composition} onChange={(e) => setComposition(e.target.value)} style={field}>
          {comps.map((c) => <option key={c} value={c}>{compNameFor(c, army)}</option>)}
        </select>

        {/* Campagne-lijst — alleen als het ingelogde account een campagne heeft. Aanzetten zet de
            puntenlimiet op de fase-cap, kiest de campagne-factie en beperkt de compositie-regel.
            Kwam de speler via "start mijn campagne-lijst", dan is er niets te kiezen: dan staat er
            een vaste regel i.p.v. een schakelaar. */}
        {campaignCtx && (
          <>
            <div style={{ ...label, margin: '16px 0 6px' }}>Campaign</div>
            {forceCampaign ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 9, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(138,108,48,0.10)' }}>
                <span style={{ flex: 1, fontFamily: towFont.serif, fontSize: 13.5, color: TOW.ink }}>{campaignCtx.label}</span>
                <span style={{ ...eb, fontSize: 8, color: TOW.muted }}>Act {campaignCtx.fase} · {campaignCtx.puntenCap} pts</span>
              </div>
            ) : (
              <button onClick={() => zetCampagne(!campaign)} aria-pressed={campaign}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', border: `1px solid ${campaign ? TOW.goldDeep : TOW.line}`, background: campaign ? 'rgba(138,108,48,0.10)' : TOW.cardLt }}>
                <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 5, border: `1.5px solid ${campaign ? TOW.goldDeep : TOW.lineStrong}`, background: campaign ? TOW.goldDeep : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {campaign && <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2.5 6.4l2.2 2.2 4.8-5" stroke="#f4eedb" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                <span style={{ flex: 1, fontFamily: towFont.serif, fontSize: 13.5, color: TOW.ink }}>{campaignCtx.label} list</span>
                <span style={{ ...eb, fontSize: 8, color: TOW.muted }}>Act {campaignCtx.fase} · {campaignCtx.puntenCap} pts</span>
              </button>
            )}
          </>
        )}

        <div style={{ ...label, margin: '16px 0 7px' }}>Points limit</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 7 }}>
          {POINT_PRESETS.map((t) => { const on = points === t; return <button key={t} disabled={pointsLocked} onClick={() => setPoints(t)} style={{ flex: '1 1 28%', minWidth: 44, padding: '9px 2px', borderRadius: 8, border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, cursor: pointsLocked ? 'default' : 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5, background: on ? 'rgba(138,108,48,0.14)' : TOW.cardLt, color: on ? TOW.gold : TOW.muted, opacity: pointsLocked ? 0.5 : 1 }}>{t}</button>; })}
        </div>
        <input type="number" inputMode="numeric" min={0} step={50} disabled={pointsLocked} value={points} onChange={(e) => setPoints(Math.max(0, Math.floor(Number(e.target.value) || 0)))} aria-label="Custom points" style={{ ...field, fontFamily: towFont.display, fontWeight: 600, opacity: pointsLocked ? 0.6 : 1 }} />
        {pointsLocked && campaignCtx && <div style={{ ...label, marginTop: 6 }}>Campaign phase {campaignCtx.fase} cap</div>}

        <div style={{ ...label, margin: '16px 0 6px' }}>Composition rule</div>
        {ruleLocked ? (
          <>
            {/* Campagne: rule vast op de fase-compositie. Bij 1 optie disabled; bij meerdere een select
                beperkt tot die opties (andere rules zijn hier niet kiesbaar). */}
            <select
              value={campaignRules.includes(rule) ? rule : campaignRules[0]}
              disabled={campaignRules.length === 1}
              onChange={(e) => setRule(e.target.value)}
              style={{ ...field, opacity: campaignRules.length === 1 ? 0.6 : 1, cursor: campaignRules.length === 1 ? 'default' : 'pointer' }}
            >
              {campaignRules.map((id) => <option key={id} value={id}>{ruleName(id)}</option>)}
            </select>
            <div style={{ ...label, marginTop: 6 }}>{ruleLockNote}</div>
          </>
        ) : (
          <CompositionRulePicker value={rule} onChange={setRule} onInfo={setCompInfo} fieldStyle={field} />
        )}
        <CompositionInfo ruleId={compInfo} onClose={() => setCompInfo(null)} />

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 12, borderRadius: 10, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.inkDim, fontFamily: towFont.display, fontWeight: 600, fontSize: 13, letterSpacing: '0.03em' }}>Cancel</button>
          <button onClick={() => onCreate({ name: name.trim() || defaultName, army, composition, points, rule, entries: mode === 'import' ? (preview?.entries ?? []) : [],
            campaign: campaign || undefined,
            campaignSpeler: campaign ? campaignCtx?.speler.id : undefined,
            campaignNaam: campaign ? campaignCtx?.speler.naam : undefined,
            campaignFase: campaign ? campaignCtx?.fase : undefined })} style={{ flex: 1.4, padding: 12, borderRadius: 10, cursor: 'pointer', border: 'none', background: goldGrad, color: TOW.onGrad, fontFamily: towFont.display, fontWeight: 700, fontSize: 13.5, letterSpacing: '0.03em' }}>{mode === 'import' ? 'Import list' : 'Create list'}</button>
        </div>
      </div>
      <style>{`@keyframes sheet-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
