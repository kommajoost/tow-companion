// Stap 2: per video beslissen of hij in de bibliotheek hoort, en welke soort het is.
// Volgorde per video:
//   1. tactics/handmatig.json (met de hand nagekeken, wint altijd)        door: 'hand'
//   2. een eerdere 'hand'-beslissing in selectie.json blijft staan
//   3. de vaste titel- en playlistregels hieronder                          door: 'regel'
// Uitvoer: tactics/selectie.json, gesorteerd per kanaal, met een korte reden per video.
//   node tactics/selectie.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ALLE_SOORTEN, CACHE, TDIR, leesJson, rondeEenKanalen, schrijfJson } from './lib.mjs';

// Legers: patroon in de titel -> slug van de Companion (bestandsnaam in public/owb).
const LEGERS = [
  [/\bdark ?elf|\bdark ?elves|\bdruchii|\bdelves\b/i, 'dark-elves'],
  [/\bwood ?elf|\bwood ?elves|\bwild hunt|\borion/i, 'wood-elf-realms'],
  [/\bhigh ?elf|\bhigh ?elves|\bsea guard|\bphoenix guard|\bsisters?-in-core/i, 'high-elf-realms'],
  [/\bempire\b|\bnuln\b|\bgolden order\b|\bstate troops/i, 'empire-of-man'],
  [/\bbretonnia|\berrantry|\bgreen knight|\bpegas/i, 'kingdom-of-bretonnia'],
  [/\borcs?\b|\bgoblins?\b|\bgreenskins?\b|\bwaaagh|\bnight goblins/i, 'orc-and-goblin-tribes'],
  [/\bdwarfs?\b|\bdwarves|\bdwarfen|\bdawi\b|\bmountain holds/i, 'dwarfen-mountain-holds'],
  [/\btomb kings?|\bkhemri|\bnehekhara/i, 'tomb-kings-of-khemri'],
  [/\bbeastmen|\bbrayherd|\bwild herd|\bdoombull/i, 'beastmen-brayherds'],
  [/\bwarriors of chaos|\bwoc\b|\bmarauders?\b|\bchaos warriors/i, 'warriors-of-chaos'],
  [/\bvampires?\b|\bvampire counts|\bundead\b|\bvc\b/i, 'vampire-counts'],
  [/\bskaven|\bratmen|\bclan\b/i, 'skaven'],
  [/\blizardm[ae]n|\bsaurus|\bslann|\btemple guard/i, 'lizardmen'],
  [/\bcathay\b|\bsky lanterns?/i, 'grand-cathay'],
  [/\bdaemons? of chaos|\bdaemons?\b|\bheralds of darkness/i, 'daemons-of-chaos'],
  [/\bchaos dwarfs?|\bchaos dwarves|\bdawi zharr/i, 'chaos-dwarfs'],
  [/\bogres?\b|\bogre kingdoms/i, 'ogre-kingdoms'],
];

export function legerVan(titel) {
  // Chaos Dwarfs eerst, anders matcht "dwarfs" als Dwarfen Mountain Holds.
  if (/\bchaos dwarfs?|\bchaos dwarves|\bdawi zharr/i.test(titel)) return ['chaos-dwarfs'];
  const gevonden = new Set();
  for (const [re, slug] of LEGERS) if (re.test(titel)) gevonden.add(slug);
  return [...gevonden];
}

// Andere systemen of het pc-spel: niet relevant.
const ANDER_SPEL = /\b40k\b|40,000|warhammer 40|age of sigmar|\baos\b|kill ?team|horus heresy|necromunda|blood ?bowl|middle.earth|mesbg|star wars|legion\b|marvel crisis|bolt action|warcry|underworlds|total war|mohawk|civilization|board ?game review|spearhead|combat patrol|10th edition|11th edition|boarding actions|titanicus|conquest\b|battle ?tome|\bghb\b|general'?s handbook|white dwarf update|hedonites|soulblight|ossiarch|blades of khorne|beasts of chaos|stormcast|kruleboyz|sylvaneth|seraphon|lumineth|idoneth|nighthaunt|gloomspite|ironjawz|disciples of tzeentch|slaves to darkness|maggotkin|fyreslayers|kharadron|cities of sigmar|daughters of khaine|flesh.eater|sons of behemat|ogor mawtribes|orruk|skaventide|flames of war|team yankee|space marines?|astartes|chaos knights|tyranids|necrons|aeldari|t'au|orks\b/i;
const HOBBY = /\bpaint(ing|ed)?\b|unboxing|\bunbox\b|speed ?paint|airbrush|contrast paint|kitbash|conversion|terrain build|how to paint|base?ing tutorial|\bbuild(ing)? the\b|assembl|magneti[sz]/i;
const NIEUWS = /\breacts?\b|\breactions?\b|warcom|\bpreview\b|\breveal(ed|s)?\b|\brumou?rs?\b|\bleak(s|ed)?\b|pre-?order|\bnew (models|miniatures|releases?|kit|armies|faction|edition|rulebook)\b|\breleases?\b|miniatures|\bmodels\b|\bchannel\b|giveaway|announce|\bnews\b|coming|returning|teasers?|scandal|survey|roadmap|\bdrop\b|launch|sculpts?|excit|stole|warhammer community|\bq ?& ?a\b/i;
const UITLEG = /tactics|strateg|guide|how to|any good|good now|\breview|explained|what you need to know|masterclass|deep dive/i;
const LORE = /old world lore|\blore\b.*square based|\bnarrative\b/i;

const BR = /battle ?report|bat ?rep|batrep|tournament game\b|\bgame \d\b|\bround \d\b(?!.*pairings)|final round/i;
const META = /results|lists? reviews?|lists? analysis|list grading|tier list|meta watch|meta movers|statistic|\bstats\b|win ?rates?|top lists|winning list|tournament (list|watch|review|washup|recap)|\bgt\b|player'?s? pack|pairings|list reveal|list breakdown|tournament meta|tournament report|army breakdown|\brtt\b|grand tournament|palm springs open|state of the game|meta reboot/i;
const LIJST = /list ?building|build(ing)? (good |better |effective )?(army )?lists?|army lists?|write (an )?(effective )?(army )?lists?|writing lists?|\b\d[,.]?\d{3} ?(pts|points)\b|battalion box|\bstart(ing)? (an? )?.*army\b|how to build/i;
const REGELS = /explained|explaining|\brules?\b|\bhow (does|do) .* work|\bhow \w+ works\b|what you need to know|what happens|mechanics?|beginner'?s? guide|learn to play|troop types?|press of battle|matched play/i;
const PRAAT = /\bchats?\b|podcast|2\+ #|2\+ \d|2\+\+|twoplus|interview|player perspective|perpsective/i;
const ITEMS = /magic items?|\bitems?\b|item combos|\bcombos\b/i;
const UNITREVIEW = /\bunits?\b|unit type|big guys|shooters|overcosted|underrated|playable/i;
const TACTIEK = /tactics?|strateg|\bhow to (win|play|use|beat|deploy)|\btips\b|\bdeploy|movement|\bmarch(ing)?\b|charg|chaff|flank|screen|redirect|reform|overrun|pursu|flee|magic|shooting|combat|challeng|objectives?|scenario|mission|terrain|skirmish|ambush|vanguard|scouts?|positioning|zoning|bait|hedging|shepherd|lumbering|cover\b|matchup|plan\b|mistakes|archetypes|how small units|win more games|infantry|cavalry|monsters?|chariots?|war machines?|characters?|dragons?|fbigo|frenzy|random move|baggage|death ?stars?|vortex/i;
const REVIEW = /\bunits?\b|review|\bbest\b|\bworst\b|good\b|\bplay(ing)? (the |your )?[a-z]+\b|how to use|faction|army guide|can they compete|hidden heroes|overcosted|underrated|playable|unplayable/i;
const OPINIE = /\bchats?\b|podcast|2\+ #|2\+ \d|twoplus|interview|hobby or a game|which type of .* player|feels? (good|bad)|vibe|enjoy|culture|future|should know better|power creep|failure|replace legacy|games workshop|\bgw\b|is .* (really|still) warhammer|anti-warhammer|boring|personality|newsletter|my first tournament|what it takes to run|losers|\bchannel\b|spirit of the game|patreon|good or bad/i;

/** Eerste ronde: alles van deze kanalen is Old World, behalve wat ANDER_SPEL raakt.
 *  Bij gemengde kanalen moet de titel of playlist Old World noemen, anders 'unclear'. */
const GEMENGD = new Set(['hammerhobby', 'zen-fox-games', 'facehammer-tv']);
const OW = /old ?world|\btow\b|warhammer fantasy|\bwhfb\b|renegade crowns|battle march|arcane journal|\bravening hordes|forces of fantasy|razing of westerland|march of chaos/i;

function regel(kanaalId, v) {
  const t = v.titel;
  const pls = v.playlists.join(' | ');
  const tp = `${t} | ${pls}`;
  const legers = legerVan(t);
  const onderwerp = legers.length === 1 ? legers[0] : 'general';

  if (ANDER_SPEL.test(tp) && !OW.test(tp)) return { relevant: false, soort: 'other', reden: 'other game or system' };
  if (GEMENGD.has(kanaalId) && !OW.test(tp)) return { relevant: false, soort: 'other', reden: 'mixed channel, no Old World in title or playlist' };
  if (HOBBY.test(t)) return { relevant: false, soort: 'other', reden: 'painting or hobby' };
  if (v.duurSec != null && v.duurSec < 120) return { relevant: true, soort: 'other', onderwerp, reden: 'under 2 minutes' };

  if (BR.test(tp) || /battle reports?/i.test(pls)) return { relevant: true, soort: 'battle-report', onderwerp: 'general', reden: 'battle report in title or playlist' };
  if (legers.length === 1 && /army review/i.test(t)) return { relevant: true, soort: 'army-review', onderwerp, reden: 'army review in title' };
  if (META.test(t)) return { relevant: true, soort: 'meta', onderwerp, reden: 'tournament results or list reviews' };
  if (LORE.test(t)) return { relevant: true, soort: 'other', onderwerp, reden: 'lore or narrative' };
  if (legers.length === 1 && /good now|any good|army guide|overview/i.test(t)) return { relevant: true, soort: 'army-review', onderwerp, reden: 'faction review in title' };
  if (/arcane journal/i.test(t) && !/preorder|pre-order|revealed|\bnews\b/i.test(t)) return { relevant: true, soort: 'army-review', onderwerp, reden: 'arcane journal review' };
  if (NIEUWS.test(t) && !UITLEG.test(t)) return { relevant: true, soort: 'other', onderwerp, reden: 'news, release or preview' };
  if (/square based show/i.test(t) && !UITLEG.test(t) && !/\bfaq\b/i.test(t)) return { relevant: true, soort: 'other', onderwerp, reden: 'talk show episode' };
  if (PRAAT.test(t) && !/tactics|strategy|guide|how to/i.test(t)) return { relevant: true, soort: 'other', onderwerp, reden: 'podcast, chat or interview' };
  if (/\bfaq\b|errata/i.test(t)) return { relevant: true, soort: 'rules-explained', onderwerp, reden: 'FAQ or errata in title' };
  if (OPINIE.test(t) && !/tactics|strategy|guide/i.test(t)) return { relevant: true, soort: 'other', onderwerp, reden: 'discussion or opinion episode' };
  if (ITEMS.test(t)) return { relevant: true, soort: 'list-building', onderwerp, reden: 'magic item choices in title' };
  if (LIJST.test(t) || (/list building/i.test(pls) && !/tactics/i.test(pls))) return { relevant: true, soort: 'list-building', onderwerp, reden: 'list building in title or playlist' };
  if (REGELS.test(t) && !/tactics/i.test(pls)) return { relevant: true, soort: 'rules-explained', onderwerp, reden: 'rules or mechanics in title' };
  if (legers.length === 1 && !/tactics|strateg|how to win|deploy/i.test(t)) return { relevant: true, soort: 'army-review', onderwerp, reden: 'one faction in title' };
  if (legers.length === 0 && UNITREVIEW.test(t) && !/tactics/i.test(tp)) return { relevant: true, soort: 'army-review', onderwerp, reden: 'unit review across factions' };
  if (TACTIEK.test(t) || /tactics/i.test(pls)) return { relevant: true, soort: 'tactics', onderwerp, reden: 'tactics topic in title or playlist' };
  return { relevant: true, soort: 'other', onderwerp, reden: 'no tactical topic in title' };
}

const handmatig = leesJson(path.join(TDIR, 'handmatig.json'), {});
const vorig = leesJson(path.join(TDIR, 'selectie.json'), { videos: {} }).videos ?? {};
const videos = {};
const telling = {};

for (const k of rondeEenKanalen()) {
  const d = leesJson(path.join(CACHE, `videos-${k.id}.json`));
  if (!d) { console.log(`${k.id}: geen cache, eerst node tactics/lijst.mjs`); continue; }
  telling[k.id] = { totaal: 0 };
  for (const v of d.videos) {
    let b;
    const h = handmatig[v.id];
    if (h) b = { door: 'hand', ...h };
    else if (vorig[v.id]?.door === 'hand') b = vorig[v.id];
    else b = { door: 'regel', ...regel(k.id, v) };
    if (!ALLE_SOORTEN.includes(b.soort)) throw new Error(`${v.id}: onbekende soort ${b.soort}`);
    if (!b.relevant) b.soort = 'other';
    if (b.onderwerp == null) b.onderwerp = legerVan(v.titel).length === 1 ? legerVan(v.titel)[0] : 'general';
    videos[v.id] = { kanaalId: k.id, titel: v.titel, relevant: b.relevant, soort: b.soort, onderwerp: b.onderwerp, reden: b.reden, door: b.door };
    const t = telling[k.id];
    t.totaal++;
    const sleutel = b.relevant ? b.soort : 'not-relevant';
    t[sleutel] = (t[sleutel] ?? 0) + 1;
  }
}

schrijfJson(path.join(TDIR, 'selectie.json'), {
  uitleg: 'Per video: relevant = over het tafelspel Warhammer: The Old World; soort = tactics | list-building | army-review | rules-explained | battle-report | meta | other. door = regel (titel/playlist) of hand (tactics/handmatig.json).',
  telling,
  videos,
});
console.table(telling);
if (process.argv.includes('--print')) {
  const k = process.argv.find((a) => a.startsWith('--kanaal='))?.split('=')[1];
  for (const [id, v] of Object.entries(videos)) {
    if (k && v.kanaalId !== k) continue;
    console.log(`${id} ${v.relevant ? v.soort : 'NOT'} ${v.onderwerp === 'general' ? '' : v.onderwerp + ' '}| ${v.titel}`);
  }
}
