// De statlines uit de Doc de app in.
//
//   node scripts/patch-renegade-stats.mjs            # alle packs
//   node scripts/patch-renegade-stats.mjs cd --droog # alleen tonen wat er zou veranderen
//
// "Bij twijfel: neem de data over van de Renegades list" (Joost) — en dat gold nooit voor de cijfers
// zelf. De compiler las uit een statline-tabel alléén de punten; M/WS/BS/S/T/W/I/A/Ld bleven staan
// zoals de OWB-catalogus ze had. Daardoor hield K'daai Fireborn W2 terwijl de Doc W3 zegt, en dat
// was geen uitzondering: over de zeven packs staan 180 gekleurde statcellen die niemand las.
//
// Dit script schrijft ze weg naar overlay.profiles, waar de app ze overheen legt.
//
// WAT ER BEWUST NIET GEBEURT:
//   · Cellen die geen kaal getal zijn worden overgeslagen. "-" betekent "neemt de waarde van het
//     rijdier over" en "(+2)" is een modifier daarop; als absolute waarde weggeschreven zouden ze
//     een Ogre Loader met 2 wounds opleveren in plaats van de machine +2.
//   · Alleen rijen die de app AL kent worden bijgewerkt. Een rij die nergens bestaat is meestal een
//     crewprofiel dat de catalogus niet als los profiel voert (chariot crews); daar een profiel voor
//     verzinnen zou data toevoegen die niemand geverifieerd heeft. Die blijven in de audit staan.
//   · Doorgestreepte tekst telt niet mee — die heeft de importer al uit `text` gehouden.
import { readFileSync, writeFileSync } from 'node:fs';

const REN = new URL('../public/renegade/', import.meta.url);
const OWB = new URL('../public/owb/', import.meta.url);
const args = process.argv.slice(2);
const droog = args.includes('--droog');
const packs = args.filter((a) => !a.startsWith('--'));
const alle = packs.length ? packs : ['cd', 'de', 'doc', 'lm', 'ok', 'sk', 'vc'];

const kaal = (v) => String(v ?? '').toLowerCase().replace(/\{[^}]*\}/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const STAT_KOLOMMEN = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld', 'Sv'];
const statIndex = JSON.parse(readFileSync(new URL('rules-index.json', OWB), 'utf8'));

let totaal = 0;
for (const pack of alle) {
  const overlayUrl = new URL(`${pack}-renegade-v2.json`, REN);
  const overlay = JSON.parse(readFileSync(overlayUrl, 'utf8'));
  const reference = JSON.parse(readFileSync(new URL(`${pack}-renegade-v2-reference.json`, REN), 'utf8'));
  overlay.profiles = overlay.profiles ?? {};

  // Waar woont een profielregel? Onder zijn eigen naam soms niet: "Weapon Team Crew" hangt onder de
  // ingang `weapon team`. Deze index onthoudt per rijnaam bij welke INGANG hij hoort, want daar moet
  // de patch landen — schrijven onder de rijnaam zelf maakt een profiel dat niemand opvraagt.
  const woont = new Map();
  const dubbel = new Set();
  const onthoud = (ingangNaam, rij) => {
    const k = kaal(rij?.Name);
    if (!k) return;
    const bestaand = woont.get(k);
    if (bestaand) { if (bestaand.ingang !== kaal(ingangNaam)) dubbel.add(k); return; }
    woont.set(k, { ingang: kaal(ingangNaam), rij });
  };
  for (const [naam, ingang] of Object.entries(statIndex)) for (const r of ingang?.stats ?? []) onthoud(naam, r);
  for (const [naam, prof] of Object.entries(overlay.profiles)) for (const r of prof?.stats ?? []) onthoud(naam, r);

  const posities = (rij) => {
    const uit = []; let x = 0;
    for (const c of rij) { uit.push({ cel: c, x }); x += Math.max(1, Number(c.colspan) || 1); }
    return uit;
  };

  const gewijzigd = [];
  for (const b of reference.blocks) {
    if (b.tableType !== 'statline' || !Array.isArray(b.rows)) continue;
    const kopRij = b.rows[b.headerRowIndex ?? -1];
    if (!kopRij) continue;
    const kolom = new Map();
    for (const { cel, x } of posities(kopRij)) kolom.set(x, String(cel.text ?? '').trim());
    const eersteIsStat = STAT_KOLOMMEN.includes(kolom.get(0));

    for (const rij of b.rows) {
      if (rij === kopRij) continue;
      const cellen = posities(rij);
      const ruw = String(cellen[0]?.cel.text ?? '').trim();
      // Dezelfde twee tabelvormen als in de audit: naam in een eigen kolom, of versmolten met M.
      const gesplitst = eersteIsStat ? /^(.+?)\s+(\d+\+?)$/.exec(ruw) : null;
      const rijNaam = (gesplitst ? gesplitst[1] : ruw).trim()
        .replace(/\s*\(x\s*\d+\)\s*$/i, '').replace(/\s+x\s*\d+$/i, '').trim();
      if (!rijNaam) continue;
      if (gesplitst) cellen[0] = { cel: { text: gesplitst[2] }, x: 0 };
      else if (eersteIsStat) continue;

      const varianten = [rijNaam, `${rijNaam}s`, rijNaam.replace(/s$/, ''), rijNaam.replace(/man$/, 'men')];
      // De rij hoort bij de tabel waarin hij staat, niet bij de eerste unit die toevallig dezelfde
      // rijnaam draagt. Skaven heeft twee units met een rij "Plague Monk Crew" en die verschillen
      // echt (de Plague Furnace-crew heeft BS 0, die van de Plagueclaw BS 3). Zonder dit onderscheid
      // schreven ze over elkaar heen en hing de waarde af van de volgorde in het bestand.
      const ctx = kaal(b.unitContext?.name ?? '');
      const ctxIngang = ctx && (statIndex[ctx] || overlay.profiles[ctx]) ? ctx : null;
      const inCtx = ctxIngang
        ? [...(statIndex[ctxIngang]?.stats ?? []), ...(overlay.profiles[ctxIngang]?.stats ?? [])]
          .find((r) => varianten.some((n) => kaal(r.Name) === kaal(n)))
        : null;
      // Terugval op de globale vondst mag alleen als die rijnaam MAAR OP ÉÉN PLEK voorkomt. De
      // Master Moulder staat niet onder zijn eigen tabelkop maar wel eenduidig ergens; "Plague Monk
      // Crew" staat onder twee verschillende machines met verschillende cijfers, en dan is er geen
      // manier om te weten welke bedoeld is — die blijft over voor de audit.
      // Draagt de index een ingang die ZO HEET als de rij, dan is dat zijn eigen huis — ook als de
      // naam elders nog eens opduikt. "Ancient Stegadon" staat zowel onder `stegadon` als onder zijn
      // eigen ingang; zonder deze voorkeur viel hij als dubbel af en bleef hij op W5 staan.
      const eigenHuis = varianten.map((n) => kaal(n)).find((n) => {
        const rijen = [...(statIndex[n]?.stats ?? []), ...(overlay.profiles[n]?.stats ?? [])];
        return rijen.some((r) => kaal(r.Name) === n || varianten.some((v) => kaal(r.Name) === kaal(v)));
      });
      const uniek = varianten.map((n) => kaal(n)).find((n) => woont.has(n) && !dubbel.has(n));
      const globaal = eigenHuis
        ? {
          ingang: eigenHuis,
          rij: [...(statIndex[eigenHuis]?.stats ?? []), ...(overlay.profiles[eigenHuis]?.stats ?? [])]
            .find((r) => varianten.some((v) => kaal(r.Name) === kaal(v))),
        }
        : (uniek ? woont.get(uniek) : null);
      const thuis = inCtx ? { ingang: ctxIngang, rij: inCtx } : globaal;
      if (!thuis) continue;   // onbekende rij: niet verzinnen, de audit blijft hem melden

      const nieuw = {};
      for (const { cel, x } of cellen) {
        const kol = kolom.get(x);
        if (!STAT_KOLOMMEN.includes(kol)) continue;
        const doc = String(cel.text ?? '').trim();
        if (!/^\d+\+?$/.test(doc)) continue;
        if (String(thuis.rij[kol] ?? '').trim() !== doc) nieuw[kol] = doc;
      }
      if (!Object.keys(nieuw).length) continue;

      const prof = overlay.profiles[thuis.ingang] ?? {};
      prof.stats = prof.stats ?? [];
      const at = prof.stats.findIndex((r) => kaal(r.Name) === kaal(thuis.rij.Name));
      // De hele rij meeschrijven, niet alleen de gewijzigde cel: mergeStatRows vervangt de basisrij
      // in z'n geheel, dus een halve rij zou de rest leegmaken.
      const volledig = { ...thuis.rij, ...nieuw };
      if (at >= 0) prof.stats[at] = { ...prof.stats[at], ...volledig };
      else prof.stats.push(volledig);
      overlay.profiles[thuis.ingang] = prof;
      thuis.rij = volledig;   // vervolgtabellen vergelijken tegen de bijgewerkte waarde

      gewijzigd.push(`${thuis.rij.Name}: ${Object.entries(nieuw).map(([k, v]) => `${k} ${v}`).join(' ')}`);
    }
  }

  for (const r of gewijzigd) console.log(`${pack}/${r}`);
  totaal += gewijzigd.length;
  if (gewijzigd.length && !droog) writeFileSync(overlayUrl, `${JSON.stringify(overlay, null, 2)}\n`);
}
console.log(`${totaal} statwaarde${totaal === 1 ? '' : 'n'} ${droog ? 'zouden worden bijgewerkt' : 'bijgewerkt'}`);
