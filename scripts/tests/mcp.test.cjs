// MCP server (api/mcp.js, built from mcp/*.ts): protocol, every tool against the real data files served
// over HTTP by a local static server (scripts/tests/mcp-harness.cjs), response sizes, the tolerant reading
// of tags/sub-themes, and that the compact rules index gives the calculator exactly the same results as
// the full public/rules.json.
//   npm run test:mcp   (runs build-mcp --check first)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const { start } = require('./mcp-harness.cjs');

const root = path.resolve(__dirname, '../..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const MAX_CHARS = 20000; // a tool result must fit comfortably in a chat context
let h;
const sizes = [];

before(async () => { h = await start(); });
after(async () => { await h.close(); });

async function tool(name, args, { allowError = false } = {}) {
  const r = await h.call(name, args);
  sizes.push({ name, args: JSON.stringify(args).slice(0, 80), chars: r.text.length, ms: r.ms });
  if (!allowError) assert.equal(r.isError, false, r.text);
  assert.ok(r.text.length < MAX_CHARS, `${name} returned ${r.text.length} chars`);
  return r.text;
}

// ─────────────────────────── protocol ───────────────────────────
test('initialize: protocol version, server info, instructions with the six rules', async () => {
  const r = await h.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.equal(r.status, 200);
  const res = r.json.result;
  assert.equal(res.protocolVersion, '2025-06-18');
  assert.equal(res.serverInfo.name, 'old-world-companion');
  assert.ok(res.capabilities.tools);
  for (const needle of [/search_tactics/, /own assessment/i, /never use memory/i, /nothing relevant/i, /Renegade V2/, /damage maths only/i, /start from the principles, then the lessons/i, /list_principles/]) assert.match(res.instructions, needle);
  // unknown version → the newest we speak
  const r2 = await h.rpc('initialize', { protocolVersion: '1999-01-01' });
  assert.equal(r2.json.result.protocolVersion, '2025-11-25');
});

test('notifications get 202 without body; ping; unknown method; parse error; batch', async () => {
  const n = await h.rpc(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), null, { raw: true });
  assert.equal(n.status, 202);
  assert.equal(n.text, '');
  assert.deepEqual((await h.rpc('ping', {})).json.result, {});
  assert.equal((await h.rpc('nope/nothing', {})).json.error.code, -32601);
  const bad = await h.rpc('{not json', null, { raw: true });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, -32700);
  const batch = await h.rpc(JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]), null, { raw: true });
  assert.equal(batch.json.length, 2);
  const unknownTool = await h.rpc('tools/call', { name: 'delete_everything', arguments: {} });
  assert.equal(unknownTool.json.error.code, -32602);
});

test('GET → 405 with an info document; OPTIONS → CORS preflight', async () => {
  const g = await fetch(`${h.base}/api/mcp`);
  assert.equal(g.status, 405);
  assert.equal(g.headers.get('access-control-allow-origin'), '*');
  const info = await g.json();
  assert.ok(info.tools.includes('search_tactics'));
  const o = await fetch(`${h.base}/api/mcp`, { method: 'OPTIONS' });
  assert.equal(o.status, 204);
  assert.match(o.headers.get('access-control-allow-headers'), /Mcp-Protocol-Version/);
});

test('tools/list: 12 read-only tools with object schemas', async () => {
  const { tools } = (await h.rpc('tools/list', {})).json.result;
  assert.deepEqual(tools.map((t) => t.name), ['search_tactics', 'get_lesson', 'list_tactics_index', 'list_principles', 'search_rules', 'get_rule', 'list_armies', 'get_army', 'get_unit', 'calculate_attack', 'search', 'fetch']);
  for (const t of tools) {
    assert.equal(t.inputSchema.type, 'object');
    assert.equal(t.annotations.readOnlyHint, true);
    assert.ok(t.description.length < 600, t.name);
  }
});

// ─────────────────────────── tactics ───────────────────────────
test('search_tactics "chaff": ranked lessons with channel, video, timestamped link and quote', async () => {
  const t = await tool('search_tactics', { query: 'chaff' });
  assert.match(t, /^1\. .*chaff/im);
  assert.match(t, /Source: The 2\+ Podcast — ".+" .*https:\/\/www\.youtube\.com\/watch\?v=[\w-]+&t=\d+s/);
  assert.match(t, /quote: "/);
  assert.match(t, /\[id: [a-z0-9-]+\]/);
});

test('search_tactics "flank" with army filter: only that army and general lessons; only_army narrows', async () => {
  const t = await tool('search_tactics', { query: 'flank', army: 'dark-elves', limit: 25 });
  const armies = [...t.matchAll(/Army: ([^·\n]+)/g)].map((m) => m[1].trim());
  assert.ok(armies.length > 0);
  assert.ok(armies.every((a) => a === 'general' || a === 'Dark Elves'), armies.join(','));
  const only = await tool('search_tactics', { query: '', army: 'Dark Elves', only_army: true, limit: 25 });
  const onlyArmies = [...only.matchAll(/Army: ([^·\n]+)/g)].map((m) => m[1].trim());
  assert.ok(onlyArmies.length > 0 && onlyArmies.every((a) => a === 'Dark Elves'));
  assert.match(only, /Renegade check|RENEGADE DIFFERS/); // a Legacy army with a Renegade list
});

test('search_tactics: synonyms, Dutch words, theme filter, army named in the query, paging', async () => {
  assert.match(await tool('search_tactics', { query: 'redirector' }), /chaff/i);
  assert.match(await tool('search_tactics', { query: 'omleiden' }), /chaff|redirect/i);
  const th = await tool('search_tactics', { query: 'cavalry', theme: 'flanks', limit: 25 });
  assert.ok(!/Showing 1–0/.test(th));
  const vc = await tool('search_tactics', { query: 'Vampire Counts zombies', limit: 3 });
  assert.match(vc, /Army: Vampire Counts/);
  const p1 = await tool('search_tactics', { query: 'chaff', limit: 2 });
  const p2 = await tool('search_tactics', { query: 'chaff', limit: 2, offset: 2 });
  assert.notEqual(p1.match(/\[id: ([^\]]+)\]/)[1], p2.match(/\[id: ([^\]]+)\]/)[1]);
  assert.match(p2, /Showing 3–4/);
});

test('search_tactics with nothing relevant says so explicitly', async () => {
  const t = await tool('search_tactics', { query: 'zxqvbn plorft' });
  assert.match(t, /NO LESSONS FOUND/);
  assert.match(t, /own assessment/i);
});

test('get_lesson: full lesson, every source and extra quotes with their own timestamps', async () => {
  // Round 3 (26-11-2026): chaff-sets-tempo got a third source and the merge dropped its extra quote, so
  // the extra-quote check uses another lesson.
  const l = read('public/tactics/lessen.json').lessen.find((x) => x.id === 'chaff-versatile-specific');
  const t = await tool('get_lesson', { id: 'chaff-versatile-specific' });
  assert.ok(t.includes(l.tekst));
  assert.ok(t.includes(l.waarom));
  for (const b of l.bronnen) assert.ok(t.includes(b.url), b.url);
  assert.match(t, /quote at 12:14: "So, they can go and kill a war machine\." — https:\/\/www\.youtube\.com\/watch\?v=w5Uye9wgycA&t=734s/);
  assert.match(await tool('get_lesson', { id: 'does-not-exist' }), /No lesson/);
});

test('list_tactics_index: themes with counts, phases, armies', async () => {
  const t = await tool('list_tactics_index', {});
  assert.match(t, /- game-plan: Game plan \(\d+\)/);
  assert.match(t, /· flanks-centre: Flanks & centre \(\d+\)/); // sub-themes since the 26-11-2026 re-index
  assert.match(t, /- army-building: Army building \(\d+\)/);
  assert.match(t, /general: \d+/);
});

test('real re-indexed library: tag synonyms and sub-theme filters', async () => {
  // "battle standard bearer" is a synonym of the tag `bsb` in public/tactics/tags.json.
  const byTag = await tool('search_tactics', { query: '', tag: 'battle standard bearer' });
  assert.match(byTag, /Showing 1–\d+ of \d+/);
  assert.doesNotMatch(byTag, /NO LESSONS FOUND/);
  const lessen = read('public/tactics/lessen.json').lessen;
  const n = lessen.filter((x) => (x.subthemas ?? []).includes('flanks-centre')).length;
  const bySub = await tool('search_tactics', { query: '', theme: 'flanks-centre', limit: 50 });
  assert.match(bySub, new RegExp(`of ${n}\\b`));
});

test('tags and sub-themes are used when the re-indexed library has them (tolerant shapes)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tow-mcp-'));
  fs.mkdirSync(path.join(dir, 'tactics'));
  const lessen = read('public/tactics/lessen.json');
  const themas = read('public/tactics/themas.json');
  // Since the 26-11-2026 re-index the real library HAS tags and sub-themes; strip them so this test keeps
  // checking the tolerant reading of a differently shaped (nested) library on its own.
  for (const l of lessen.lessen) { delete l.tags; delete l.subthemas; }
  for (const th of themas.themas) delete th.subthemas;
  // Sub-themes nested in a theme; tags as strings on lessons; tags.json as { tags: [...] } with synonyms.
  themas.themas[1].subthemas = [{ id: 'speed-bumps', naam: 'Speed bumps' }];
  const tagged = lessen.lessen.find((x) => x.id === 'speed-bump-close-order');
  tagged.tags = ['speed-bump', 'overrun-direction'];
  tagged.subthemas = ['speed-bumps'];
  fs.writeFileSync(path.join(dir, 'tactics/lessen.json'), JSON.stringify(lessen));
  fs.writeFileSync(path.join(dir, 'tactics/themas.json'), JSON.stringify(themas));
  fs.copyFileSync(path.join(root, 'public/tactics/bronnen.json'), path.join(dir, 'tactics/bronnen.json'));
  fs.writeFileSync(path.join(dir, 'tactics/tags.json'), JSON.stringify({ tags: [{ id: 'speed-bump', naam: 'Speed bump', synoniemen: ['tarpit delay'] }, { id: 'overrun-direction', naam: 'Overrun direction' }] }));
  process.env.TOW_MCP_DATA_DIR = dir;
  try {
    const idx = await tool('list_tactics_index', {});
    assert.match(idx, /· speed-bumps: Speed bumps \(1\)/);
    assert.match(idx, /speed-bump \(1\)/);
    const byTag = await tool('search_tactics', { query: '', tag: 'speed bump' });
    assert.match(byTag, /\[id: speed-bump-close-order\]/);
    assert.match(byTag, /Tags: Speed bump, Overrun direction/);
    assert.match(byTag, /Showing 1–1 of 1/);
    const bySub = await tool('search_tactics', { query: '', theme: 'speed-bumps' });
    assert.match(bySub, /Showing 1–1 of 1/);
    // No principes.json in this folder: the tool says so, search still works without a principles block.
    assert.match(await tool('list_principles', {}), /no principles yet/);
    assert.doesNotMatch(bySub, /Principles that match/);
  } finally {
    delete process.env.TOW_MCP_DATA_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('list_principles: essentials with counts and lesson ids, theme and army filters; search_tactics and fetch show principles', async () => {
  const pr = read('public/tactics/principes.json');
  const byId = new Map(pr.principes.map((p) => [p.id, p]));
  const lessonIds = new Set(read('public/tactics/lessen.json').lessen.map((l) => l.id));
  for (const p of pr.principes) for (const id of p.lessen) assert.ok(lessonIds.has(id), `${p.id}: ${id}`);
  assert.ok(pr.top10.length > 0);

  // No filter: the top 10 in order, each with its counts, channels and lesson ids; then the debates.
  const all = await tool('list_principles', {});
  assert.match(all, /Start from the principles, then cite the lessons/);
  let last = -1;
  for (const id of pr.top10) {
    const at = all.indexOf(`[principle: ${id}]`);
    assert.ok(at > last, `top10 order: ${id}`);
    last = at;
  }
  const first = byId.get(pr.top10[0]);
  assert.ok(all.includes(first.titel));
  assert.ok(all.includes(`Backed by ${first.aantalLessen} lessons from ${first.aantalKanalen} channels`));
  assert.ok(all.includes(first.lessen[0]));
  for (const id of pr.debat) assert.ok(all.includes(`DEBATED: ${byId.get(id).titel}  [principle: ${id}]`), id);

  // Theme filter: that theme's general principles only.
  const [themeId, themeIds] = Object.entries(pr.perThema)[0];
  const byTheme = await tool('list_principles', { theme: themeId, limit: 30 });
  for (const id of themeIds) assert.ok(byTheme.includes(`[principle: ${id}]`), id);
  const other = pr.principes.find((p) => p.leger == null && p.thema !== themeId);
  if (other) assert.ok(!byTheme.includes(`[principle: ${other.id}]`), other.id);

  // Army filter: the army's own principles first, then the general ones.
  const armyEntry = Object.entries(pr.perLeger)[0];
  if (armyEntry) {
    const [army, armyIds] = armyEntry;
    const byArmy = await tool('list_principles', { army, limit: 30 });
    for (const id of armyIds) assert.ok(byArmy.includes(`[principle: ${id}]`), id);
    assert.ok(byArmy.indexOf(`[principle: ${armyIds[0]}]`) < byArmy.indexOf('General principles'));
  }

  // search_tactics puts a matching principle above the lessons (first page only).
  const s = await tool('search_tactics', { query: first.titel });
  const at = s.indexOf(`[principle: ${first.id}]`);
  assert.ok(at > -1 && at < s.indexOf('\nLessons:'), s.slice(0, 600));
  const page2 = await tool('search_tactics', { query: first.titel, offset: 2 });
  assert.doesNotMatch(page2, /Principles that match/);

  // Generic search/fetch know principles too.
  const gs = JSON.parse(await tool('search', { query: first.titel }));
  assert.ok(gs.results.some((r) => r.id === `principle:${first.id}`));
  const f = JSON.parse(await tool('fetch', { id: `principle:${first.id}` }));
  assert.equal(f.metadata.type, 'principle');
  assert.ok(f.text.includes(first.lessen[0]) && f.text.includes(first.tekst));
});

// ─────────────────────────── rules ───────────────────────────
test('get_rule "Armour Bane": verbatim bodyIndex from rules.json and the tow.whfb.app link', async () => {
  const rule = read('public/rules.json').rules['armour-bane'];
  for (const q of [{ slug: 'armour-bane' }, { name: 'Armour Bane' }, { name: 'Armour Bane (1)' }]) {
    const t = await tool('get_rule', q);
    assert.ok(t.includes(rule.bodyIndex.trim()), JSON.stringify(q));
    assert.match(t, /https:\/\/tow\.whfb\.app\/special-rules\/armour-bane/);
  }
});

test('get_rule: weapon page with its profile table; FAQ references; Renegade wording next to the official text', async () => {
  const w = await tool('get_rule', { slug: 'repeater-crossbow' });
  assert.match(w, /\| 24" \| 3 \| - \| Armour Bane \(1\), Multiple Shots \(2\) \|/);
  const m = await tool('get_rule', { name: 'Murderous', army: 'dark elves' });
  assert.match(m, /Renegade V2, Renegade Legacy Pack/);
  assert.match(m, /Official rulebook wording/);
  const off = await tool('get_rule', { name: 'Murderous' });
  assert.doesNotMatch(off, /Renegade/);
  assert.match(await tool('get_rule', { name: 'no such rule qqq' }), /No rule found|closest/i);
});

test('search_rules: the named rule ranks first; FAQ entries are labelled', async () => {
  const t = await tool('search_rules', { query: 'armour bane' });
  assert.match(t.split('\n').find((l) => l.startsWith('- ')), /\[slug: armour-bane\]/);
  assert.match(t, /- FAQ: /);
  const s = await tool('search_rules', { query: 'stupidity' });
  assert.match(s.split('\n').find((l) => l.startsWith('- ')), /\[slug: stupidity\]/);
});

// ─────────────────────────── units & armies ───────────────────────────
test('get_unit Cold One Knights (Dark Elves): Renegade V2 by default, with what changed; official on request', async () => {
  const t = await tool('get_unit', { name: 'Cold One Knights', army: 'Dark Elves' });
  assert.match(t, /composition: Renegade V2/);
  assert.match(t, /Points: 31 pts per model, min 5/);
  assert.match(t, /Cold One Knight: M- WS5 BS4 S4 T4 W1 I5 A1 Ld9/);
  assert.match(t, /Special rules: .*Counter Charge/);
  assert.match(t, /Renegade V2 vs official: .*special-rules/);
  assert.match(t, /Datasheet: https:\/\/tow\.whfb\.app\/unit\/cold-one-knights/);
  const off = await tool('get_unit', { name: 'Cold One Knights', army: 'DE', composition: 'official' });
  assert.match(off, /Grand Army \(official\)/);
  assert.doesNotMatch(off, /Counter Charge/);
});

test('get_unit Renegade points: a repriced unit shows old → new', async () => {
  const ov = read('public/renegade/ok-renegade-v2.json');
  const [id, patch] = Object.entries(ov.units).find(([, p]) => typeof p.points === 'number' && typeof p._was === 'number');
  const cat = read('public/owb/ogre-kingdoms.json');
  const unit = Object.values(cat).flat().find((u) => u && u.id === id);
  const t = await tool('get_unit', { name: unit.name_en.replace(/\s*\{[^}]*\}/g, ''), army: 'ogre-kingdoms' });
  assert.match(t, new RegExp(`points ${patch._was} → ${patch.points}`));
});

test('get_unit without army finds it anywhere; unknown unit is reported', async () => {
  assert.match(await tool('get_unit', { name: 'Skink Skirmishers' }), /Lizardmen/);
  assert.match(await tool('get_unit', { name: 'Flying Spaghetti Monster', army: 'empire' }), /No unit/);
});

test('list_armies and get_army', async () => {
  const l = await tool('list_armies', {});
  assert.match(l, /Dark Elves \[dark-elves\] · Legacy · Renegade V2 available \(default\)/);
  assert.match(l, /Empire of Man \[empire-of-man\] · compositions:/);
  const a = await tool('get_army', { army: 'empire', category: 'core' });
  assert.match(a, /Core \(\d+\):/);
  assert.doesNotMatch(a, /Rare \(/);
  const o = await tool('get_army', { army: 'ogres', composition: 'official' });
  assert.match(o, /Grand Army \(official\)/);
  assert.match(await tool('get_army', { army: 'skaven', composition: 'renegade' }), /Renegade V2/);
  assert.match(await tool('get_army', { army: 'empire', composition: 'renegade' }), /no Renegade V2 list/);
});

// ─────────────────────────── calculator ───────────────────────────
test('calculate_attack: 5 Dark Riders shoot 20 Dark Elf Warriors (official) = the mathhammer test value', async () => {
  const t = await tool('calculate_attack', { attacker: 'Dark Riders', army_attacker: 'dark-elves', target: 'Dark Elf Warriors', army_target: 'dark-elves', mode: 'shooting', models: 5, target_models: 20, weapon: 'repeater crossbow', composition_attacker: 'official', composition_target: 'official' });
  const expected = 5 * (2 / 6 * 4 / 6 + 1 / 6 * 5 / 6); // scripts/tests/mathhammer.test.cjs
  assert.match(t, new RegExp(`Result: ${(Math.round(expected * 100) / 100).toString().replace('.', '\\.')} expected wounds \\(usually \\d+–\\d+`));
  assert.match(t, /^DAMAGE ONLY/);
  assert.match(t, /Reminder: damage only/);
  assert.match(t, /To Hit 4\+/);
  assert.match(t, /Not counted \(check by hand\):/);
  assert.match(t, /Situations used/);
});

test('calculate_attack combat: Cold One Knights charge Dark Elf Warriors (exchange, strike order, both sides)', async () => {
  const t = await tool('calculate_attack', { attacker: 'Cold One Knights', army_attacker: 'dark-elves', target: 'Dark Elf Warriors', army_target: 'dark-elves', mode: 'combat', models: 5, target_models: 20, situations: { charged: true } });
  assert.match(t, /Strike order: I8 attacker: Cold One Knight · Lance/);
  assert.match(t, /Attacker inflicts: [\d.]+ expected wounds/);
  assert.match(t, /Target strikes back: [\d.]+ expected wounds/);
  assert.match(t, /charged=on/);
  assert.match(t, /DAMAGE ONLY/);
});

test('calculate_attack: options by name, bad weapon, bad mode, unknown situation keys', async () => {
  const t = await tool('calculate_attack', { attacker: 'Cold One Knights', army_attacker: 'dark-elves', target: 'Dark Elf Warriors', army_target: 'dark-elves', mode: 'combat', models: 5, attacker_options: ['Dread Knight', 'Full plate armour'], situations: { charged: true, flying: true } });
  assert.match(t, /Dread Knight/);
  assert.match(t, /not offered for this pairing and ignored: flying/);
  assert.match(await tool('calculate_attack', { attacker: 'Dark Elf Warriors', army_attacker: 'dark-elves', target: 'Dark Riders', army_target: 'dark-elves', mode: 'shooting', weapon: 'cannon' }), /has no ranged weapon "cannon"/);
  assert.match(await tool('calculate_attack', { attacker: 'Dark Riders', target: 'Dark Elf Warriors', mode: 'dancing' }), /mode must be/);
});

// ─────────────────────────── generic search/fetch ───────────────────────────
test('search / fetch (ChatGPT-style): JSON results and documents', async () => {
  const s = JSON.parse(await tool('search', { query: 'chaff' }));
  assert.ok(s.results.length >= 5);
  assert.ok(s.results.some((r) => r.id.startsWith('lesson:')));
  // Matching principles come first (start from the principles); lessons follow.
  const f = JSON.parse(await tool('fetch', { id: s.results.find((x) => x.id.startsWith('lesson:')).id }));
  assert.ok(f.text.includes('Sources'));
  const r = JSON.parse(await tool('fetch', { id: 'rule:armour-bane' }));
  assert.equal(r.url, 'https://tow.whfb.app/special-rules/armour-bane');
});

// ─────────────────────────── compact rules == full rules for the calculator ───────────────────────────
test('compact rules index: identical calculator results to the full rules.json over many real units', async () => {
  require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, f);
  const mh = require(path.join(root, 'src/lib/mathhammer.ts'));
  const bt = require(path.join(root, 'src/lib/builderToArmy.ts'));
  const ov = require(path.join(root, 'src/lib/overlays.ts'));
  const tt = require(path.join(root, 'src/lib/troopTypes.ts'));
  const mcpRules = require(path.join(root, 'mcp/rules.ts'));
  process.env.TOW_MCP_DATA_DIR = path.join(root, 'public');
  let compact;
  try { compact = await mcpRules.baseRules(); } finally { delete process.env.TOW_MCP_DATA_DIR; }
  const full = read('public/rules.json').rules;
  assert.deepEqual(Object.keys(compact).sort(), Object.keys(full).sort());
  const statsIdx = read('public/owb/rules-index.json');
  const mountText = read('public/owb/mount-text.json');
  const build = (army, faction, u, count) => bt.builderListToArmy({ name: 't', composition: '', rule: '', points: 0, entries: [{ uid: u.id, cat: u._cat, unitId: u.id, count, opts: [] }] }, read(`public/owb/${army}.json`),
    (n) => ov.overlayStatsFor(statsIdx, n, null), { faction, troopTypeFor: tt.makeTroopTypeLookup(statsIdx), mountText }).units[0];
  const target = (() => { const c = read('public/owb/empire-of-man.json'); const u = c.core.find((x) => x.name_en === 'Empire Swordsmen') ?? c.core[0]; return build('empire-of-man', 'Empire of Man', { ...u, _cat: 'core' }, 20); })();
  let compared = 0;
  for (const [army, faction] of [['dark-elves', 'Dark Elves'], ['empire-of-man', 'Empire of Man'], ['wood-elf-realms', 'Wood Elf Realms'], ['dwarfen-mountain-holds', 'Dwarfen Mountain Holds'], ['orc-and-goblin-tribes', 'Orc and Goblin Tribes'], ['skaven', 'Skaven']]) {
    const cat = read(`public/owb/${army}.json`);
    for (const c of ['characters', 'core', 'special', 'rare']) {
      for (const u of (cat[c] || []).slice(0, 8)) {
        const unit = build(army, faction, { ...u, _cat: c }, Math.max(1, u.minimum || 1));
        if (!unit) continue;
        for (const soort of ['schieten', 'combat']) {
          const o = { soort, modellen: unit.count ?? 1, situaties: { charged: true } };
          const a = JSON.stringify(mh.berekenAanval(unit, target, o, full));
          const b = JSON.stringify(mh.berekenAanval(unit, target, o, compact));
          assert.equal(b, a, `${army} ${u.name_en} ${soort}`);
          compared++;
        }
      }
    }
  }
  assert.ok(compared > 100, `compared ${compared}`);
});

test('sizes and timings (diagnostic)', (t) => {
  const max = sizes.reduce((m, s) => (s.chars > m.chars ? s : m), { chars: 0 });
  t.diagnostic(`calls: ${sizes.length}; largest result: ${max.name} ${max.chars} chars`);
  for (const s of sizes) t.diagnostic(`${s.name.padEnd(18)} ${String(s.chars).padStart(6)} chars ${String(s.ms).padStart(5)} ms  ${s.args}`);
});
