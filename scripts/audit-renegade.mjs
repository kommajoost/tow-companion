// Wat staat er in het draft, en staat dat ook in de builder?
//
//   node scripts/audit-renegade.mjs de            # één pack
//   node scripts/audit-renegade.mjs de --alles    # ook de regels die al kloppen
//
// DE MAATSTAF (Joost, 17-08): alles wat in de Doc staat hoort in de army builder te zitten, behalve
// de doorgestreepte onderdelen. Die lat is breder dan het coverage-grootboek, dat alleen bijhoudt wat
// de compiler met een GEKLEURD blok heeft gedaan. Ongekleurde blokken zijn meestal al goed omdat de
// OWB-catalogus ze draagt — maar "meestal" is geen controle, en precies daar zaten de Despot en de
// Sorcerers of Hashut.
//
// Daarom toetst dit script tegen de EFFECTIEVE data: basiscatalogus + overlay, zoals de app hem
// samenstelt. Per bronblok wordt gekeken of de inhoud terug te vinden is. Wat niet te toetsen valt
// (proza zonder machinaal aangrijpingspunt) wordt als zodanig gerapporteerd, niet als "goed".
//
// Doorgestreepte tekst telt niet mee: de importer heeft die al uit `text` gehouden en apart in
// `struckText` gezet.
import { readFileSync } from 'node:fs';

const REN = new URL('../public/renegade/', import.meta.url);
const OWB = new URL('../public/owb/', import.meta.url);
const [pack, ...vlaggen] = process.argv.slice(2);
// Zonder pack: alle zeven achter elkaar. "Alles moet gecheckt worden" (Joost, 17-08) is geen
// zeven losse commando's; één samenvatting onderaan maakt zichtbaar of het totaal daalt.
if (!pack || pack === '--alles') {
  const packs = ['cd', 'de', 'doc', 'lm', 'ok', 'sk', 'vc'];
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  // fileURLToPath, niet .pathname: op Windows levert dat laatste "/D:/CLAUDE%20CODE/..." op en
  // start elk kind met een onvindbaar pad. De lus draaide dan zeven keer een crash en telde die
  // exit-codes op als "7 problemen" — een geruststellend ogend getal dat niets betekende.
  const zelf = fileURLToPath(import.meta.url);
  let totaal = 0;
  for (const p of packs) {
    const r = spawnSync(process.execPath, [zelf, p, ...process.argv.slice(2)], { encoding: 'utf8' });
    process.stdout.write(r.stdout ?? '');
    if (r.status === null || r.error) { console.error(`pack ${p} liep vast:`, r.error ?? r.signal); process.exit(2); }
    if (r.stderr) process.stderr.write(r.stderr);
    const m = /TOTAAL: (\d+)/.exec(r.stdout ?? '');
    if (!m) { console.error(`pack ${p} gaf geen totaal terug — audit afgebroken`); process.exit(2); }
    totaal += Number(m[1]);
  }
  console.log(`
══ ${totaal} punt${totaal === 1 ? '' : 'en'} van aandacht over alle zeven packs ══`);
  process.exit(totaal ? 1 : 0);
}
const toonAlles = vlaggen.includes('--alles');

const norm = (v) => String(v ?? '').toLowerCase().replace(/\{[^}]*\}/g, '')
  .replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/[^a-z0-9 ()+/'-]/g, ' ').replace(/\s+/g, ' ').trim();
const tekstVan = (b) => (Array.isArray(b.text) ? b.text.join(' ') : String(b.text ?? '')).replace(/\s+/g, ' ').trim();

const overlay = JSON.parse(readFileSync(new URL(`${pack}-renegade-v2.json`, REN), 'utf8'));
const reference = JSON.parse(readFileSync(new URL(`${pack}-renegade-v2-reference.json`, REN), 'utf8'));
const basis = JSON.parse(readFileSync(new URL(`${overlay.baseArmy}.json`, OWB), 'utf8'));
const magicItems = JSON.parse(readFileSync(new URL('magic-items.json', OWB), 'utf8'));
const magicText = JSON.parse(readFileSync(new URL('magic-item-text.json', OWB), 'utf8'));
const baseRules = JSON.parse(readFileSync(new URL('../rules.json', OWB), 'utf8')).rules;
const statIndex = JSON.parse(readFileSync(new URL('rules-index.json', OWB), 'utf8'));

// ── De statlines zoals de app ze oplevert ───────────────────────────────────────────────────────
// `rules-index.json` draagt OWB's eigen sleutelvorm MET leestekens ("k'daai fireborn"), de overlay
// die zonder. Precies dat verschil liet de W3 van K'daai stilletjes vallen (Joost, 17-08). Hier dus
// dezelfde tolerante koppeling als in src/lib/overlays.ts — anders toetst de audit een andere app
// dan de speler ziet.
const kaal = (v) => String(v ?? '').toLowerCase().replace(/\{[^}]*\}/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const statSleutels = new Map();
for (const k of Object.keys(statIndex)) if (!statSleutels.has(kaal(k))) statSleutels.set(kaal(k), k);
const STAT_KOLOMMEN = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld', 'Sv'];
/** Basisrijen + overlayrijen, samengevoegd op rijnaam — dezelfde regel als mergeStatRows. */
const statsVan = (naam) => {
  const vorm = kaal(naam);
  const basisRijen = statIndex[statSleutels.get(vorm) ?? '']?.stats ?? [];
  const patchRijen = overlay.profiles?.[vorm]?.stats ?? [];
  if (!patchRijen.length) return basisRijen;
  if (!basisRijen.length) return patchRijen;
  const perNaam = new Map(patchRijen.map((r) => [kaal(r.Name), r]));
  const uit = basisRijen.map((r) => perNaam.get(kaal(r.Name)) ?? r);
  const gezien = new Set(basisRijen.map((r) => kaal(r.Name)));
  for (const r of patchRijen) if (!gezien.has(kaal(r.Name))) uit.push(r);
  return uit;
};

// ── De effectieve catalogus, zoals de app hem samenstelt ────────────────────────────────────────
const units = [];
for (const [cat, lijst] of Object.entries(basis)) {
  if (!Array.isArray(lijst)) continue;
  for (const u of lijst) units.push({ cat, unit: u });
}
for (const [cat, lijst] of Object.entries(overlay.addedUnits ?? {})) {
  for (const u of lijst ?? []) units.push({ cat, unit: u, added: true });
}
/** Unit + patch samengevoegd tot wat de speler ziet. */
const effectief = (entry) => {
  const patch = overlay.units[entry.unit.id] ?? {};
  const u = { ...entry.unit, ...(patch.replace ?? {}) };
  if (patch.points != null) u.points = patch.points;
  if (patch.minimum != null) u.minimum = patch.minimum;
  if (patch.maximum != null) u.maximum = patch.maximum;
  if (patch.specialRules) u.specialRules = { name_en: patch.specialRules };
  // Optie-patches per groep toepassen (naam-gebaseerd, net als applyOverlay).
  const groepen = { command: [...(u.command ?? [])], equipment: [...(u.equipment ?? [])],
    armor: [...(u.armor ?? [])], options: [...(u.options ?? [])], mounts: [...(u.mounts ?? [])] };
  for (const p of patch.options ?? []) {
    const lijst = groepen[p.group] ?? [];
    const at = lijst.findIndex((o) => norm(o.name_en) === norm(p.name_en));
    if (at >= 0) lijst[at] = { ...lijst[at], ...(p.points != null ? { points: p.points } : {}), ...(p.renameTo ? { name_en: p.renameTo } : {}), ...(p.option ?? {}) };
    else if (p.action !== 'remove') lijst.push({ name_en: p.name_en, points: p.points });
    groepen[p.group] = lijst;
  }
  Object.assign(u, groepen);
  return u;
};
const alleEffectief = units.map((e) => ({ ...e, u: effectief(e) }));

const enkel = (s) => norm(s).replace(/ies$/, 'y').replace(/men$/, 'man').replace(/s$/, '');
const zoekUnit = (naam) => {
  const w = enkel(naam);
  const raak = alleEffectief.filter((e) => enkel(e.u.name_en) === w
    || enkel(overlay.units[e.unit.id]?.replace?.name_en ?? '') === w);
  if (!raak.length) return null;
  if (new Set(raak.map((e) => e.unit.id)).size === 1) return raak[0];
  // Dezelfde naam op meerdere ids is normaal: OWB zet een unit die in twee categorieën mag staan
  // twee keer neer (Infernal Ironsworn in Core én Special). Zolang ze het eens zijn over punten en
  // maat is er niets aan de hand; verschillen ze, dan is dát het probleem en meldt de audit dat.
  const eens = raak.every((e) => e.u.points === raak[0].u.points
    && (e.u.minimum ?? 1) === (raak[0].u.minimum ?? 1) && (e.u.maximum ?? 0) === (raak[0].u.maximum ?? 0));
  return eens ? raak[0] : null;
};
/** Alle optielabels van een unit, over alle groepen, genest meegerekend. */
const labels = (u) => {
  const uit = [];
  for (const g of ['command', 'equipment', 'armor', 'options', 'mounts']) {
    const loop = (items) => { for (const o of items ?? []) { uit.push({ groep: g, naam: o.name_en, punten: o.points }); loop(o.options); } };
    loop(u[g]);
  }
  return uit;
};

// ── De toets per bronblok ───────────────────────────────────────────────────────────────────────
const bevindingen = [];
const meld = (status, blok, wat, detail) => bevindingen.push({ status, blok, wat, detail });

// Een blok onder een GEDEELDE sectie hoort bij niemand in het bijzonder. De bron zet "Character
// Mounts" als kop voor alle characters samen, maar `unitContext` blijft op de laatste datasheet
// staan — dezelfde anker-drift die de mount-tripwire in de validator bewaakt. Zulke blokken aan die
// unit toetsen levert onzin op ("de Khainite Assassin mist Dark Steed"), terwijl de app juist
// terecht geen mounts geeft.
const GEDEELD = /^(character mounts|magic items|magic weapons|magic armour|talismans|arcane items|enchanted items|magic standards|gifts of khaine|forbidden poisons)$/i;
const inGedeeldeSectie = (b) => (b.headingPath ?? []).some((h) => GEDEELD.test(h.trim()));

const unitVanBlok = (b) => {
  const ctx = b.unitContext;
  if (!ctx?.name) return null;
  if (inGedeeldeSectie(b)) return null;
  return zoekUnit(ctx.name)
    ?? ((ctx.profileNames ?? []).length === 1 ? zoekUnit(ctx.profileNames[0]) : null);
};

for (const b of reference.blocks) {
  if (b.scope !== 'army-list') continue;
  const t = tekstVan(b);
  if (!t) continue;
  const doel = unitVanBlok(b);
  const naam = b.unitContext?.name ?? '-';

  // 1 · STATLINE — elke geprijsde rij moet een unit met die punten opleveren.
  if (b.tableType === 'statline') {
    for (const rij of b.statlineRows ?? []) {
      if (rij.points?.value == null || rij.points?.modifier) continue;
      const u = zoekUnit(rij.name) ?? doel;
      if (!u) { meld('ONTBREEKT', b.id, `unit "${rij.name}" (${rij.points.value} pt)`, 'geen datasheet in de builder'); continue; }
      if (u.u.points !== rij.points.value) meld('AFWIJKEND', b.id, `${u.u.name_en} punten`, `doc ${rij.points.value}, app ${u.u.points}`);
      else if (toonAlles) meld('OK', b.id, `${u.u.name_en} ${rij.points.value} pt`, '');
    }

    // 1b · STATCELLEN — elk cijfer in de tabel tegen wat de app toont.
    //
    // Dit ontbrak, en daardoor bleef K'daai Fireborn op W2 staan terwijl de Doc W3 zegt: de audit
    // controleerde precies dezelfde velden als de compiler en bevestigde zo diens blinde vlek.
    // Er wordt op RIJNAAM gematcht, niet op tabelvolgorde, want de app voegt basisrijen en
    // overlayrijen samen en de champion-rij kan daarbij van plaats wisselen.
    const kop = (b.rows ?? [])[b.headerRowIndex ?? -1];
    if (kop) {
      // Kolommen tellen op COLSPAN, niet op array-index. De titelrij van een statline heeft één cel
      // met colspan 10; wie op index telt schuift daarna alles een kolom op en vergelijkt de naam
      // met de M-waarde. Hier krijgt elke cel dus zijn echte kolompositie.
      const posities = (rij) => {
        const uit = []; let x = 0;
        for (const c of rij) { uit.push({ cel: c, x }); x += Math.max(1, Number(c.colspan) || 1); }
        return uit;
      };
      const kolom = new Map();
      for (const { cel, x } of posities(kop)) kolom.set(x, String(cel.text ?? '').trim());
      const appRijen = statsVan(b.unitContext?.name ?? '');
      for (const rij of b.rows ?? []) {
        if (rij === kop) continue;
        // Twee tabelvormen in dezelfde Doc. Meestal staat de naam in een eigen eerste kolom en begint
        // de kop met een lege cel. Maar soms is de naamkolom met de M-kolom VERSMOLTEN: de kop begint
        // dan meteen bij "M" en de cel leest "Cutthroat 4". Zonder die splitsing vergelijkt de audit
        // de naam met een getal en meldt elke unit als afwijkend.
        const cellen = posities(rij);
        const eersteIsStat = STAT_KOLOMMEN.includes(kolom.get(0));
        const ruw = String(cellen[0]?.cel.text ?? '').trim();
        const gesplitst = eersteIsStat ? /^(.+?)\s+(\d+\+?)$/.exec(ruw) : null;
        const rijNaam = gesplitst ? gesplitst[1].trim() : ruw;
        if (gesplitst) cellen[0] = { cel: { text: gesplitst[2] }, x: 0 };
        else if (eersteIsStat) continue;   // kop zegt stat, cel draagt geen naam: geen profielregel
        if (!rijNaam) continue;
        // Een tabel draagt niet altijd één unit. "Chaos Dwarf Lords" zet Sorcerer-Prophet en
        // Daemonsmith Sorcerer onder één kop, en `unitContext` wijst er maar één aan. Daarom eerst
        // de rij zelf opzoeken — die heeft in de index zijn eigen ingang — en pas daarna terugvallen
        // op de rijen van de context. Enkelvoud/meervoud meegenomen: de tabel schrijft "Sneaky Git",
        // de catalogus "Sneaky Gits".
        const mv = [rijNaam, `${rijNaam}s`, rijNaam.replace(/s$/, ''), rijNaam.replace(/y$/, 'ies'), rijNaam.replace(/man$/, 'men')];
        const eigen = mv.map((n) => statsVan(n)).find((rs) => rs.length);
        const app = (eigen ?? []).find((r) => mv.some((n) => kaal(r.Name) === kaal(n)))
          ?? appRijen.find((r) => mv.some((n) => kaal(r.Name) === kaal(n)));
        if (!app) {
          // Geen appregel is alleen nieuws als de tabel echt cijfers draagt; kop- en tussenregels
          // vallen hier vanzelf buiten omdat ze geen statwaarden hebben.
          const heeftCijfers = cellen.some(({ cel, x }) => STAT_KOLOMMEN.includes(kolom.get(x)) && /^\d/.test(String(cel.text ?? '').trim()));
          if (heeftCijfers) meld('ONTBREEKT', b.id, `statline "${rijNaam}"`, 'de app kent deze profielregel niet');
          continue;
        }
        for (const { cel, x } of cellen) {
          const kol = kolom.get(x);
          if (!STAT_KOLOMMEN.includes(kol)) continue;
          const doc = String(cel.text ?? '').trim();
          // "-" = neemt de waarde van het rijdier/de machine over. "(+2)" = een modifier daarop, geen
          // absolute waarde; de Ogre Loader krijgt +2 wounds bovenop de Iron Daemon. Zulke cellen
          // vergelijken met een absoluut getal levert alleen ruis op.
          if (!doc || doc === '-' || !/^\d+\+?$/.test(doc)) continue;
          const nu = String(app[kol] ?? '').trim();
          if (!nu) meld('ONTBREEKT', b.id, `${rijNaam} ${kol}`, `doc ${doc}, app heeft geen waarde`);
          else if (nu !== doc) meld('AFWIJKEND', b.id, `${rijNaam} ${kol}`, `doc ${doc}, app ${nu}`);
          else if (toonAlles) meld('OK', b.id, `${rijNaam} ${kol} ${doc}`, '');
        }
      }
    }
    continue;
  }

  // 2 · UNIT SIZE
  if (b.entryKind === 'unit-size' && doel) {
    const m = /^Unit Size:\s*(\d+)\s*(?:-\s*(\d+))?\s*(\+)?/i.exec(t);
    if (m) {
      const min = Number(m[1]);
      const max = m[2] ? Number(m[2]) : (m[3] ? 0 : min);
      const eMin = doel.u.minimum ?? 1;
      const eMax = doel.u.maximum ?? 0;
      if (eMin !== min || eMax !== max) meld('AFWIJKEND', b.id, `${doel.u.name_en} unit size`, `doc ${min}${m[2] ? '-' + m[2] : m[3] ? '+' : ''}, app min ${eMin} max ${eMax || '∞'}`);
      else if (toonAlles) meld('OK', b.id, `${doel.u.name_en} unit size`, '');
    }
    continue;
  }

  // 2b · EQUIPMENT — wat de Equipment-regel noemt moet de speler ook ergens zien staan.
  //
  // De Doc schrijft basisbewapening als proza ("Rage and hellfire (counts as hand weapons), heavy
  // armour"); OWB zet het als optie die aanstaat. De vertaling is niet één-op-één, dus er wordt
  // ruim gezocht: over alle optielabels van de unit én over de equipment-regel in het profiel.
  // "Counts as X" telt als X, want dat is de spelregel die telt.
  if (b.entryKind === 'equipment' && doel) {
    const kaleRegel = t.replace(/^Equipment:\s*/i, '');
    const profielTekst = norm((overlay.profiles?.[kaal(b.unitContext?.name ?? '')]?.equipment ?? []).join(' '));
    const hooi = `${labels(doel.u).map((o) => norm(o.naam)).join(' | ')} | ${profielTekst}`;
    const gemist = [];
    for (const deel of kaleRegel.split(/,(?![^(]*\))| and (?=[a-z])/i)) {
      let term = deel.trim();
      if (!term) continue;
      // "Rage and hellfire (counts as hand weapons)" → toets op "hand weapons", niet op de fluff.
      const telt = /\(counts as ([^)]+)\)/i.exec(term);
      if (telt) term = telt[1];
      term = norm(term).replace(/^(a|an|the|two|and)\s+/, '').replace(/\s*\([^)]*\)/g, '').trim();
      if (term.length < 4) continue;
      const enkelvoud = term.replace(/s$/, '');
      if (!hooi.includes(term) && !hooi.includes(enkelvoud)) gemist.push(term);
    }
    if (gemist.length) meld('ONTBREEKT', b.id, `${doel.u.name_en} equipment`, gemist.join(' · '));
    else if (toonAlles) meld('OK', b.id, `${doel.u.name_en} equipment`, '');
    continue;
  }

  // 3 · SPECIAL RULES — elke genoemde regel moet in de regelset staan.
  if (b.entryKind === 'special-rules' && doel) {
    const genoemd = t.replace(/^Special Rules(?:\s*\([^)]*\))?:\s*/i, '')
      .split(',').map((x) => norm(x).replace(/\*/g, '').trim()).filter(Boolean);
    const heeft = norm(doel.u.specialRules?.name_en ?? '').replace(/\*/g, '');
    const mist = genoemd.filter((r) => !heeft.includes(r.split('(')[0].trim()));
    if (mist.length) meld('ONTBREEKT', b.id, `${doel.u.name_en} special rules`, mist.join(' · '));
    else if (toonAlles) meld('OK', b.id, `${doel.u.name_en} special rules`, '');
    continue;
  }

  // 4 · OPTIES — elke "naam +N points" moet als optie bestaan met die prijs.
  if (/\+\s*\d+\s*points?/i.test(t) && doel) {
    const heeft = labels(doel.u);
    for (const seg of t.split(/\s*•\s*/)) {
      const m = /^(.*?)\s*\+(\d+)\s+points?/i.exec(seg.trim());
      if (!m) continue;
      // De bron schrijft een optie als zin ("May take a cavalry spear +2 points"). Pel de aanloop er
      // laag voor laag af — één doorgang liet "take a …" staan en dan lijkt de optie te ontbreken.
      let optieNaam = m[1].replace(/\s*\(see[^)]*\)/ig, '').trim();
      for (let i = 0; i < 4; i++) {
        const korter = optieNaam.replace(/^(?:the entire unit may|any unit may|upgrade one model to|may|can|take|have|be equipped with|purchase|replace|a|an|the)\s+/i, '');
        if (korter === optieNaam) break;
        optieNaam = korter;
      }
      if (!optieNaam || optieNaam.length < 3) continue;
      const kern = norm(optieNaam);
      // De catalogus bundelt wargear in één label ("Hand weapon, Whip, Cavalry spear"), waar het
      // draft de onderdelen los noemt. Splits het label, anders lijkt elk onderdeel te ontbreken.
      const raak = heeft.filter((o) => {
        const delen = norm(o.naam).split(',').map((x) => x.trim());
        if (delen.includes(kern) || norm(o.naam).includes(kern) || kern.includes(norm(o.naam))) return true;
        // Laatste redmiddel: de bron schrijft de optie als handeling ("May replace its Steam
        // Cannonade with a Skullcracker"), de catalogus als ding ("Skullcracker (replaces Steam
        // Cannonade)"). Als het kernwoord van de optie in die zin voorkomt, is het dezelfde keuze.
        const kop = norm(o.naam).split(/[ (]/)[0];
        return kop.length >= 5 && kern.includes(kop);
      });
      // Een unit die een ITEMLIJST mag kopen (Forbidden Poisons, Gifts of Khaine) toont die als
      // sectie met een puntenbudget, niet als losse optieregels. De losse namen daaruit zijn dus
      // geen ontbrekende opties.
      const uitItemLijst = (doel.u.items ?? []).some((sectie) =>
        (magicItems[norm(sectie.name_en).replace(/ /g, '-')] ?? []).some((i) => norm(i.name_en) === kern));
      if (uitItemLijst) { if (toonAlles) meld('OK', b.id, `${doel.u.name_en}: ${optieNaam} via ${'‘'}items${'’'}`, ''); continue; }
      if (!raak.length) meld('ONTBREEKT', b.id, `${doel.u.name_en}: optie "${optieNaam}"`, `+${m[2]} in het draft`);
      else if (!raak.some((o) => o.punten === Number(m[2]))) meld('AFWIJKEND', b.id, `${doel.u.name_en}: optie "${optieNaam}"`, `doc +${m[2]}, app +${raak.map((o) => o.punten).join('/')}`);
      else if (toonAlles) meld('OK', b.id, `${doel.u.name_en}: ${optieNaam} +${m[2]}`, '');
    }
    continue;
  }

  // 5 · MAGIC ITEM — een titel "Naam N points" buiten een unit hoort een item te zijn.
  if (!b.unitContext) {
    const m = /^(.{3,48}?)\*?\s+(\d+)\s+points?\s*$/i.exec(t);
    if (m) {
      const itemNaam = m[1].trim();
      const alle = [...Object.values(magicItems).flat(), ...Object.values(overlay.magicItems ?? {}).flat()];
      const raak = alle.filter((i) => norm(i.name_en) === norm(itemNaam));
      if (!raak.length) meld('ONTBREEKT', b.id, `item "${itemNaam}"`, `${m[2]} pt in het draft`);
      else if (!raak.some((i) => i.points === Number(m[2]))) meld('AFWIJKEND', b.id, `item "${itemNaam}"`, `doc ${m[2]}, app ${raak.map((i) => i.points).join('/')}`);
      else {
        // Exact de sleutel die de app gebruikt (`magicItemId`): élk niet-alfanumeriek teken wordt
        // een streepje, dus "Executioner's Axe" → executioner-s-axe. Met een andere normalisatie
        // meldt de audit tekst als ontbrekend die er gewoon is.
        const sleutel = String(raak[0].name ?? raak[0].name_en).toLowerCase()
          .replace(/\{[^}]*\}/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().replace(/ /g, '-');
        const tekst = overlay.magicItemText?.[sleutel] ?? magicText[sleutel];
        if (!tekst) meld('GEEN TEKST', b.id, `item "${itemNaam}"`, 'staat er wel, maar zonder beschrijving');
        else if (toonAlles) meld('OK', b.id, `item "${itemNaam}" ${m[2]} pt`, '');
      }
      continue;
    }
  }

  // 6 · REGELKOP — een kop buiten een unit hoort een regelpagina te hebben.
  // Een kop die de compiler als GROEPSNAAM op een unit heeft gezet is een overkoepelende term
  // ("Sorcerers Of Hashut", "Dark Elf Nobles"), geen regel. Idem de sectiekoppen en een
  // "<Regel> Table"-kop, die inmiddels in z'n eigen regel is opgenomen.
  const groepsNamen = new Set(Object.values(overlay.units).map((u) => norm(u.group ?? '')).filter(Boolean));
  const SECTIEKOP = /^(characters|core|special|rare|mercenaries|allies|lords|heroes|options|grand army composition list|battle standard bearer|weapons of .*|the daemonic armoury|.* table|.* special rules|.* army list)$/i;
  if (!b.unitContext && (b.type === 'heading' || b.visualHeadingLevel) && t.length <= 60 && !SECTIEKOP.test(t) && !groepsNamen.has(norm(t))) {
    const sleutel = norm(t).replace(/ /g, '-');
    const heeft = overlay.rules?.[sleutel] || baseRules[sleutel]
      || Object.values(overlay.rules ?? {}).some((r) => norm(r.name_en) === norm(t))
      || Object.values(baseRules).some((r) => norm(r.name) === norm(t));
    if (!heeft) meld('GEEN REGELPAGINA', b.id, `"${t}"`, 'kop in het draft zonder regel in de app');
    else if (toonAlles) meld('OK', b.id, `regel "${t}"`, '');
    continue;
  }

  if (toonAlles) meld('PROZA', b.id, naam === '-' ? t.slice(0, 60) : `${naam}: ${t.slice(0, 50)}`, 'niet machinaal toetsbaar');
}

// ── Rapport ─────────────────────────────────────────────────────────────────────────────────────
const perStatus = new Map();
for (const b of bevindingen) {
  if (!perStatus.has(b.status)) perStatus.set(b.status, []);
  perStatus.get(b.status).push(b);
}
const volgorde = ['ONTBREEKT', 'AFWIJKEND', 'GEEN TEKST', 'GEEN REGELPAGINA', 'OK', 'PROZA'];
console.log(`\n══ AUDIT ${pack} — draft ${reference.version} ══`);
for (const status of volgorde) {
  const lijst = perStatus.get(status);
  if (!lijst?.length) continue;
  console.log(`\n── ${status} (${lijst.length}) ──`);
  for (const b of lijst) console.log(`  [${b.blok}] ${b.wat}${b.detail ? '  →  ' + b.detail : ''}`);
}
const problemen = volgorde.slice(0, 4).reduce((n, s) => n + (perStatus.get(s)?.length ?? 0), 0);
console.log(`\nTOTAAL: ${problemen} punt${problemen === 1 ? '' : 'en'} van aandacht`);
