// Maakt regels3.mjs uit tactics/selectie.mjs (zelfde regels; importeren kan niet, dat script schrijft bij laden).
import fs from 'node:fs';
const src = fs.readFileSync('D:/CLAUDE CODE/tow-companion/tactics/selectie.mjs', 'utf8');
const start = src.indexOf('const LEGERS = [');
const eind = src.indexOf('const handmatig =');
let body = src.slice(start, eind);
// Renegade Crowns als 18e leger
body = body.replace("  [/\\bogres?\\b|\\bogre kingdoms/i, 'ogre-kingdoms'],\n",
  "  [/\\bogres?\\b|\\bogre kingdoms/i, 'ogre-kingdoms'],\n  [/\\brenegade crowns?|\\brenegades?\\b|\\bmercenar/i, 'renegade-crowns'],\n");
if (!body.includes('renegade-crowns')) throw new Error('renegade patch faalde');
// Kanaalmodus in plaats van vaste GEMENGD-set
body = body.replace("const GEMENGD = new Set(['hammerhobby', 'zen-fox-games', 'facehammer-tv']);", '');
body = body.replace('function regel(kanaalId, v) {', 'export function regel(modus, v) {');
body = body.replace('if (GEMENGD.has(kanaalId) && !OW.test(tp))', "if (modus === 'gemengd' && !OW.test(tp))");
body = body.replace("const pls = v.playlists.join(' | ');", "const pls = (v.playlists ?? []).join(' | ');");
// Shorts: grens 3 minuten in deze ronde
body = body.replace("if (v.duurSec != null && v.duurSec < 120) return { relevant: true, soort: 'other', onderwerp, reden: 'under 2 minutes' };",
  "if (v.duurSec != null && v.duurSec < 180) return { relevant: true, soort: 'other', onderwerp, reden: 'short (under 3 minutes)' };");
body = body.replace('const OW = ', 'export const OW = ');
for (const m of ["modus === 'gemengd'", 'export function regel', 'under 3 minutes', 'export const OW']) if (!body.includes(m)) throw new Error('patch faalde: ' + m);
fs.writeFileSync(new URL('./regels3.mjs', import.meta.url), '// Gegenereerd uit tactics/selectie.mjs door maakregels.mjs\n' + body + '\nexport { ANDER_SPEL };\n', 'utf8');
console.log('regels3.mjs geschreven', body.length);
