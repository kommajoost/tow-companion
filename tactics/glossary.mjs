// Stap 3a: tactics/glossary.json bouwen uit de eigen spelgegevens van de Companion.
// Alleen-lezen op public/owb, public/rules.json. De lijst met verbasterde vormen ("garbled") staat
// in tactics/garbled.json en wordt met de hand bijgehouden: alleen vormen die echt in de
// automatische ondertitels zijn gezien.
//   node tactics/glossary.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, TDIR, leesJson, schrijfJson } from './lib.mjs';

const owb = path.join(ROOT, 'public', 'owb');
const index = leesJson(path.join(owb, 'rules-index.json'), {});

const units = new Set();
const regels = new Set();
const spreuken = new Set();
for (const [naam, v] of Object.entries(index)) {
  const soort = String(v?.url ?? '').split('/')[0];
  if (soort === 'unit') units.add(naam);
  else if (soort === 'special-rules') regels.add(naam);
  else if (soort === 'spell') spreuken.add(naam);
}

// Weergavenamen van units uit de legerboeken (hoofdletters zoals in de app).
const legers = [];
const unitWeergave = new Map();
for (const f of fs.readdirSync(owb)) {
  if (!f.endsWith('.json')) continue;
  const d = leesJson(path.join(owb, f));
  if (!d || !Array.isArray(d.characters)) continue;
  const slug = f.replace(/\.json$/, '');
  legers.push(slug);
  for (const groep of ['characters', 'core', 'special', 'rare', 'mercenaries', 'allies']) {
    for (const u of d[groep] ?? []) {
      if (u?.name_en) unitWeergave.set(u.name_en.toLowerCase(), u.name_en);
    }
  }
}

// Gangbare termen uit het spel (de regelnamen staan al in `regels`).
const termen = [
  'chaff', 'flank', 'flank charge', 'rear charge', 'overrun', 'pursuit', 'reform', 'redirect', 'march',
  'march test', 'rally', 'flee', 'fleeing', 'break test', 'combat result', 'combat resolution', 'rank bonus',
  'fighting rank', 'supporting attacks', 'close order', 'open order', 'skirmishers', 'line of sight',
  'arc of sight', 'vanguard', 'scouts', 'ambushers', 'frenzy', 'hatred', 'fear', 'terror', 'panic test',
  'insane courage', 'general', 'battle standard bearer', 'wizard', 'miscast', 'dispel', 'remains in play',
  'magic missile', 'magic vortex', 'enchantment', 'hex', 'flying', 'swiftstride', 'fire and flee',
  'stand and shoot', 'hold', 'charge reaction', 'disrupt', 'impact hits', 'stomp attacks', 'monster',
  'monstrous infantry', 'monstrous cavalry', 'heavy infantry', 'regular infantry', 'light cavalry',
  'heavy cavalry', 'war machine', 'chariot', 'swarm', 'drilled', 'detachment', 'lone character',
  'unit strength', 'press of battle', 'secondary objectives', 'baggage train', 'deployment zone',
];

const garbled = leesJson(path.join(TDIR, 'garbled.json'), { vormen: {} });

schrijfJson(path.join(TDIR, 'glossary.json'), {
  bron: 'public/owb/rules-index.json + public/owb/<army>.json (alleen gelezen)',
  legers: legers.sort(),
  units: [...units].sort(),
  unitWeergave: Object.fromEntries([...unitWeergave].sort()),
  regels: [...regels].sort(),
  spreuken: [...spreuken].sort(),
  termen,
  garbled: garbled.vormen,
});
console.log(`glossary: ${legers.length} legers, ${units.size} units, ${regels.size} regels, ${spreuken.size} spreuken, ${Object.keys(garbled.vormen).length} verbasterde vormen`);
