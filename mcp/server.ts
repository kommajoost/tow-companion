// Old World Companion MCP server: read-only, stateless, Streamable HTTP (JSON responses, no SSE).
//
// Source of the Vercel function api/mcp.js. That file is GENERATED from this folder by
// `npm run build:mcp` (one self-contained ESM bundle), because Vercel's per-file TypeScript compile does
// not resolve the extensionless imports in src/lib under "type": "module".
//
// JSON-RPC 2.0 methods: initialize, notifications/*, ping, tools/list, tools/call (and empty
// resources/prompts lists). GET returns 405 with a small info document; OPTIONS answers CORS preflight.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { dataBase, loadLog, setBaseFromHost } from './data';
import { getLesson, listPrinciples, listTacticsIndex, principles, principleText, rankLessons, searchTactics, library } from './tactics';
import { getNote, getRule, ruleHits, searchRules } from './rules';
import { getArmy, getUnit, listArmies } from './armies';
import { calculateAttack } from './calc';

export const SERVER_INFO = { name: 'old-world-companion', title: 'Old World Companion', version: '1.0.0' };
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export const INSTRUCTIONS = `Old World Companion: Warhammer: The Old World knowledge for tactical advice. Follow these rules in every answer about the game.
1. Library first: before any tactical, list-building, matchup or army advice, call search_tactics (it lists matching principles above the lessons) or list_principles, and get_lesson for detail. Start from the principles, then the lessons: a principle is a summary of several lessons, so for each piece of advice cite the lessons' channel, video title and timestamped link.
2. Mark your own reasoning separately, e.g. "Own assessment: …". Never blend it into what the sources say.
3. Never use memory for game data: check every unit, weapon, points value, statline and rule you mention with get_unit, get_army, get_rule or search_rules. Quote rule text verbatim; never present your own interpretation as the rule.
4. If the library has nothing relevant, say so plainly.
5. Legacy armies use the Renegade V2 list by default (it takes precedence where it exists). When a lesson is about the official list and the Renegade list differs (points, rules, availability), flag it.
6. calculate_attack is damage maths only (expected wounds). It does not say whether a unit is good; never present it as a verdict.
Answer in the user's language.`;

type Args = Record<string, unknown>;
interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (a: Args) => Promise<string>;
}

const s = (description: string) => ({ type: 'string', description });
const n = (description: string, min?: number, max?: number) => ({ type: 'integer', description, ...(min != null ? { minimum: min } : {}), ...(max != null ? { maximum: max } : {}) });
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined);
const int = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : undefined);
const strArr = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v.trim() ? v.split(',').map((x) => x.trim()) : undefined);

const ARMY = s('Army: name, slug or common short name, e.g. "Dark Elves", "dark-elves", "DE".');
const COMP = s('Composition: omit for the default (Renegade V2 for Legacy armies that have it, else the Grand Army). "official" = Grand Army; "renegade" = Renegade V2; or a composition id from list_armies.');

export const TOOLS: Tool[] = [
  {
    name: 'search_tactics',
    title: 'Search the tactics library',
    description: 'Search the curated tactics library (lessons from Old World tactics videos, each with channel, video and timestamped link). Call this FIRST for any tactics, list-building, deployment, matchup or army question. Returns ranked lessons with source citations; general lessons are included with an army filter unless only_army is true.',
    inputSchema: obj({
      query: s('What to look for, in English game terms works best (e.g. "chaff redirect", "flank charge cavalry"). May be empty when filtering only.'),
      army: ARMY,
      only_army: { type: 'boolean', description: 'With army: only that army\'s lessons, no general ones.' },
      theme: s('Theme id or name from list_tactics_index (e.g. "flanks", "chaff").'),
      tag: s('Tag or sub-theme id from list_tactics_index (when the library has tags).'),
      phase: s('Phase id: army-building, deployment, movement, combat, magic-shooting, scenarios.'),
      limit: n('Results per page (default 8, max 25).', 1, 25),
      offset: n('Skip this many results (paging).', 0),
    }),
    run: (a) => searchTactics({ query: str(a.query), army: str(a.army), only_army: bool(a.only_army), theme: str(a.theme), tag: str(a.tag), phase: str(a.phase), limit: int(a.limit), offset: int(a.offset) }),
  },
  {
    name: 'get_lesson',
    title: 'Get one lesson',
    description: 'The full lesson from the tactics library: text, the speaker\'s reasoning, example, caveats, flags (outdated / Renegade differs) and every source with timestamped links and quotes.',
    inputSchema: obj({ id: s('Lesson id from search_tactics.') }, ['id']),
    run: (a) => getLesson({ id: str(a.id) }),
  },
  {
    name: 'list_tactics_index',
    title: 'Browse the tactics library',
    description: 'Themes, sub-themes, phases, armies and tags of the tactics library with lesson counts, to browse or pick filters for search_tactics.',
    inputSchema: obj({}),
    run: () => listTacticsIndex(),
  },
  {
    name: 'list_principles',
    title: 'Key principles of the tactics library',
    description: 'The overarching principles above the lessons: advice several players give independently, each an AI summary of the lessons under it with the number of lessons and distinct channels and the lesson ids. No filter: the top 10 essentials and the debated points. Filter by theme and/or army. Start here, then open the lessons with get_lesson.',
    inputSchema: obj({
      theme: s('Theme id or name from list_tactics_index (e.g. "chaff", "magic").'),
      army: ARMY,
      limit: n('Principles per list (default 10, max 25).', 1, 25),
    }),
    run: (a) => listPrinciples({ theme: str(a.theme), army: str(a.army), limit: int(a.limit) }),
  },
  {
    name: 'search_rules',
    title: 'Search the rules',
    description: 'Search the Warhammer: The Old World rules (verbatim from tow.whfb.app), plus FAQ and errata. Returns rule names, slugs, links and a snippet. With army, rules the Renegade V2 pack replaces show its wording.',
    inputSchema: obj({
      query: s('Rule name or words from the rule text.'),
      army: ARMY,
      composition: COMP,
      include_faq: { type: 'boolean', description: 'Include FAQ and errata entries (default true).' },
      limit: n('Results (default 8, max 20).', 1, 20),
      offset: n('Skip this many results.', 0),
    }, ['query']),
    run: (a) => searchRules({ query: str(a.query), army: str(a.army), composition: str(a.composition), include_faq: bool(a.include_faq), limit: int(a.limit), offset: int(a.offset) }),
  },
  {
    name: 'get_rule',
    title: 'Get a rule',
    description: 'The full verbatim text of one rule (special rule, weapon, spell, lore, section) with its tow.whfb.app link, tables, and the FAQ/errata that reference it. Accepts a slug or a name ("Armour Bane (1)" works). With army, shows the Renegade V2 wording when the pack replaces the rule, next to the official text.',
    inputSchema: obj({
      slug: s('Rule slug (from search_rules) or name.'),
      name: s('Rule name, if no slug.'),
      army: ARMY,
      composition: COMP,
    }),
    run: (a) => getRule({ slug: str(a.slug), name: str(a.name), army: str(a.army), composition: str(a.composition) }),
  },
  {
    name: 'list_armies',
    title: 'List armies',
    description: 'All armies in the Companion with their compositions, which are Legacy, and which have a Renegade V2 list (the default for those).',
    inputSchema: obj({}),
    run: () => listArmies(),
  },
  {
    name: 'get_army',
    title: 'Get an army list',
    description: 'Unit names per category (Characters, Core, Special, Rare, …) with points and restrictions for one army and composition, from the Companion\'s list builder.',
    inputSchema: obj({ army: ARMY, composition: COMP, category: s('Only this category, e.g. "core".') }, ['army']),
    run: (a) => getArmy({ army: str(a.army), composition: str(a.composition), category: str(a.category) }),
  },
  {
    name: 'get_unit',
    title: 'Get a unit',
    description: 'One unit as the Companion knows it: points, size, troop type, statlines, equipment per model, options with costs, mounts, magic-item allowance and special rules, with the Renegade V2 overlay applied for Legacy armies (and what changed vs the official list). Use this instead of memory for any unit fact.',
    inputSchema: obj({ name: s('Unit name, e.g. "Cold One Knights".'), army: ARMY, composition: COMP }, ['name']),
    run: (a) => getUnit({ name: str(a.name), army: str(a.army), composition: str(a.composition) }),
  },
  {
    name: 'calculate_attack',
    title: 'Damage calculator',
    description: 'Expected wounds of one unit attacking another with the Companion\'s calculator: shooting, or a combat exchange (both sides strike in Initiative order). Returns expected wounds, the usual range, the full step chain and what was not counted. DAMAGE ONLY: not a judgement of whether a unit is good.',
    inputSchema: obj({
      attacker: s('Attacking unit name.'),
      army_attacker: ARMY,
      target: s('Target unit name.'),
      army_target: ARMY,
      mode: { type: 'string', enum: ['shooting', 'combat'], description: 'shooting or combat.' },
      models: n('Attacking models (default: unit minimum; 1 for single models).', 1),
      target_models: n('Target models (default: unit minimum).', 1),
      weapon: s('Weapon to use, e.g. "Repeater crossbow"; an option that adds it is taken automatically.'),
      attacker_options: { type: 'array', items: { type: 'string' }, description: 'Option names to take, e.g. ["Dread Knight (champion)", "Full plate armour"] (see get_unit).' },
      target_options: { type: 'array', items: { type: 'string' }, description: 'Option names for the target.' },
      situations: { type: 'object', additionalProperties: { type: 'boolean' }, description: 'Situation toggles by key, e.g. {"charged": true, "long": true}. The result lists the keys offered for the pairing.' },
      width: n('Attacker files (models wide). Default: the calculator\'s default for the troop type.', 1),
      target_width: n('Target files in combat.', 1),
      multiple_shots: { type: 'boolean', description: 'Shooting: fire the Multiple Shots mode (default true when the weapon has it).' },
      to_hit_modifier: n('Extra To Hit modifier not modelled by the toggles, e.g. -1.'),
      composition_attacker: COMP,
      composition_target: COMP,
    }, ['attacker', 'target', 'mode']),
    run: (a) => calculateAttack({
      attacker: str(a.attacker), army_attacker: str(a.army_attacker), composition_attacker: str(a.composition_attacker),
      target: str(a.target), army_target: str(a.army_target), composition_target: str(a.composition_target),
      mode: str(a.mode), models: int(a.models), target_models: int(a.target_models), weapon: str(a.weapon),
      attacker_options: strArr(a.attacker_options), target_options: strArr(a.target_options),
      situations: a.situations && typeof a.situations === 'object' ? Object.fromEntries(Object.entries(a.situations as Args).map(([k, v]) => [k, bool(v) ?? !!v])) : undefined,
      width: int(a.width), target_width: int(a.target_width), multiple_shots: bool(a.multiple_shots), to_hit_modifier: int(a.to_hit_modifier),
    }),
  },
  // Generic pair for clients that expect them (ChatGPT connectors / deep research).
  {
    name: 'search',
    title: 'Search (generic)',
    description: 'Generic search over the tactics library and the rules, for clients that expect search/fetch. Prefer search_tactics and search_rules when available. Returns JSON {results:[{id,title,url}]}.',
    inputSchema: obj({ query: s('Search words.') }, ['query']),
    run: async (a) => {
      const q = str(a.query) ?? '';
      const { hits } = await rankLessons({ query: q });
      const rules = await ruleHits(q, 5);
      const pr = await principles();
      const terms = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const prHits = terms.length ? pr.list.filter((p) => terms.every((w) => `${p.titel} ${p.tekst}`.toLowerCase().includes(w))).slice(0, 3) : [];
      const results = [
        ...prHits.map((p) => ({ id: `principle:${p.id}`, title: `Principle: ${p.titel}`, url: null })),
        ...hits.slice(0, 8).map(({ l }) => ({ id: `lesson:${l.id}`, title: `Lesson: ${l.titel}`, url: l.bronnen[0]?.url ?? null })),
        ...rules.map((r) => ({ id: `${r.kind}:${r.slug}`, title: `${r.kind === 'rule' ? 'Rule' : r.kind === 'faq' ? 'FAQ' : 'Errata'}: ${r.name}`, url: r.url })),
      ];
      return JSON.stringify({ results });
    },
  },
  {
    name: 'fetch',
    title: 'Fetch (generic)',
    description: 'Fetch a document from the generic search by id ("principle:<id>", "lesson:<id>", "rule:<slug>", "faq:<slug>", "errata:<slug>"). Returns JSON {id,title,text,url,metadata}.',
    inputSchema: obj({ id: s('Id from search.') }, ['id']),
    run: async (a) => {
      const id = str(a.id) ?? '';
      const [kind, ...rest] = id.split(':');
      const key = rest.join(':');
      if (kind === 'principle') {
        const p = await principleText(key);
        return JSON.stringify({ id, title: p?.title ?? key, text: p?.text ?? `No principle "${key}". Use list_principles.`, url: null, metadata: { type: 'principle' } });
      }
      if (kind === 'lesson') {
        const lib = await library();
        const l = lib.byId.get(key);
        return JSON.stringify({ id, title: l?.titel ?? key, text: await getLesson({ id: key }), url: l?.bronnen[0]?.url ?? null, metadata: { type: 'lesson', army: l?.leger ?? 'general' } });
      }
      if (kind === 'faq' || kind === 'errata') {
        const text = await getNote(key);
        return JSON.stringify({ id, title: key, text: text ?? `No ${kind} entry "${key}".`, url: null, metadata: { type: kind } });
      }
      const text = await getRule({ slug: key || id });
      const url = text.match(/https:\/\/tow\.whfb\.app\/\S*/)?.[0] ?? null;
      return JSON.stringify({ id, title: text.split('\n')[0], text, url, metadata: { type: 'rule' } });
    },
  },
];

const ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

// ── JSON-RPC ──────────────────────────────────────────────────────────────────────────────────────

interface Req { jsonrpc?: string; id?: string | number | null; method?: string; params?: Args }
type Res = { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown } };

const ok = (id: Req['id'], result: unknown): Res => ({ jsonrpc: '2.0', id: id ?? null, result });
const fail = (id: Req['id'], code: number, message: string): Res => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

export async function handleMessage(m: Req): Promise<Res | null> {
  if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
    return fail(m && typeof m === 'object' ? m.id : null, -32600, 'Invalid Request');
  }
  const isNotification = !('id' in m) || m.id === undefined;
  if (isNotification) return null; // notifications/initialized, cancelled, …: nothing to answer
  const p = (m.params ?? {}) as Args;
  switch (m.method) {
    case 'initialize': {
      const asked = typeof p.protocolVersion === 'string' ? p.protocolVersion : PROTOCOLS[0];
      return ok(m.id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok(m.id, {});
    case 'tools/list':
      return ok(m.id, { tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, ...ANNOTATIONS } })) });
    case 'tools/call': {
      const name = typeof p.name === 'string' ? p.name : '';
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return fail(m.id, -32602, `Unknown tool: ${name}`);
      const args = (p.arguments && typeof p.arguments === 'object' ? p.arguments : {}) as Args;
      try {
        const text = await tool.run(args);
        return ok(m.id, { content: [{ type: 'text', text }], isError: false });
      } catch (e) {
        return ok(m.id, { content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }], isError: true });
      }
    }
    case 'resources/list':
      return ok(m.id, { resources: [] });
    case 'resources/templates/list':
      return ok(m.id, { resourceTemplates: [] });
    case 'prompts/list':
      return ok(m.id, { prompts: [] });
    case 'logging/setLevel':
      return ok(m.id, {});
    default:
      return fail(m.id, -32601, `Method not found: ${m.method}`);
  }
}

// ── HTTP (Vercel Node function signature) ─────────────────────────────────────────────────────────

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Max-Age': '86400',
};

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  res.statusCode = status;
  for (const [k, v] of Object.entries({ ...CORS, ...extra })) res.setHeader(k, v);
  if (body === undefined) { res.end(); return; }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  const pre = req.body;
  if (pre !== undefined && pre !== null && !(typeof pre === 'string' && !pre.length)) {
    if (typeof pre === 'string') return JSON.parse(pre);
    if (pre instanceof Uint8Array) return JSON.parse(Buffer.from(pre).toString('utf8'));
    return pre;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    const b = typeof c === 'string' ? Buffer.from(c) : (c as Buffer);
    size += b.length;
    if (size > 1_000_000) throw new Error('too large');
    chunks.push(b);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text.trim() ? JSON.parse(text) : undefined;
}

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse): Promise<void> {
  const fwdProto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim();
  setBaseFromHost(String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim(), fwdProto || undefined);
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'OPTIONS') return send(res, 204, undefined);
  if (method !== 'POST') {
    return send(res, 405, {
      name: SERVER_INFO.title,
      description: 'Read-only MCP server (Streamable HTTP, JSON responses) for Warhammer: The Old World: tactics library, rules, units, damage calculator. POST JSON-RPC 2.0 to this URL.',
      tools: TOOLS.map((t) => t.name),
      data: dataBase(),
      docs: 'docs/mcp.md in the repository',
    }, { Allow: 'POST, OPTIONS', 'Cache-Control': 'public, max-age=300' });
  }
  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    return send(res, 400, fail(null, -32700, 'Parse error'));
  }
  if (body === undefined) return send(res, 400, fail(null, -32600, 'Empty body'));
  const debug: Record<string, string> = String(req.headers['x-tow-debug'] ?? '') === '1' ? { 'X-Tow-Data': dataBase(), 'X-Tow-Loads': String(loadLog.length) } : {};
  if (Array.isArray(body)) {
    if (!body.length) return send(res, 400, fail(null, -32600, 'Empty batch'));
    const out = (await Promise.all(body.map((m) => handleMessage(m as Req)))).filter((x): x is Res => x != null);
    return out.length ? send(res, 200, out, { 'Cache-Control': 'no-store', ...debug }) : send(res, 202, undefined);
  }
  const out = await handleMessage(body as Req);
  return out ? send(res, 200, out, { 'Cache-Control': 'no-store', ...debug }) : send(res, 202, undefined);
}
