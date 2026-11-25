# MCP server: Old World Companion knowledge for any AI

A read-only [Model Context Protocol](https://modelcontextprotocol.io) server at
`https://oldworldcompanion.vercel.app/api/mcp`. Any AI client (Claude Code, Claude desktop/web/mobile via a
custom connector, ChatGPT via a connector) can search the tactics library and check units, points, rules
and damage against the Companion's own data instead of model memory. The skill
`~/.claude/skills/old-world-tactics/SKILL.md` tells Claude when and how to use it.

## Answer rules (sent as server `instructions` on `initialize`)

1. Search the tactics library first; cite channel, video and timestamped link per piece of advice.
2. Mark own reasoning separately as own assessment.
3. Check every unit, weapon, points value, statline and rule with the tools; quote rules verbatim.
4. Say so when the library has nothing.
5. Legacy armies default to Renegade V2; flag lessons about the official list where Renegade differs.
6. `calculate_attack` is damage maths only, never a verdict on a unit.

## Files

| Path | What |
|---|---|
| `mcp/server.ts` | JSON-RPC 2.0 over Streamable HTTP (JSON responses, stateless), tool registry, HTTP handler |
| `mcp/tactics.ts` | `search_tactics`, `get_lesson`, `list_tactics_index` |
| `mcp/rules.ts` | `search_rules`, `get_rule` (+ Renegade rule overlay) |
| `mcp/armies.ts` | `list_armies`, `get_army`, `get_unit`; army/composition resolution; game units for the calculator |
| `mcp/calc.ts` | `calculate_attack` (wraps `berekenAanval` / `berekenGevecht`) |
| `mcp/data.ts` | fetches the app's static JSON over HTTPS, in-memory cache per warm instance (30 min TTL) |
| `mcp/text.ts` | tokenising, light stemmer, synonyms (incl. a few Dutch words), trimming |
| `mcp/entry.ts` | bundle entry (default export only) |
| `api/mcp.js` | **generated** single-file ESM bundle = the Vercel function |
| `public/mcp/rules-compact.json` | **generated** compact rules index (1.9 MB instead of 16 MB) |
| `scripts/build-mcp.mjs` | builds both generated files; `--check` fails when they are stale |
| `scripts/tests/mcp.test.cjs`, `mcp-harness.cjs` | tests against a local server that serves `public/` |

Why a bundle: Vercel compiles `api/*.ts` file by file, and with `"type": "module"` the extensionless
imports inside `src/lib` do not resolve at runtime. `api/mcp.js` is one self-contained file (rolldown,
which ships with Vite), so there is nothing to resolve. **After changing `mcp/*.ts` or a `src/lib` module
the calculator uses (mathhammer, weaponStats, armyRules, overlays, owbBuilder, builderToArmy, …), run
`npm run build:mcp`.** Data changes (tactics library, catalogues, Renegade packs) need no rebuild: the
function reads the deployed JSON. A change to `public/rules.json` needs `npm run build:mcp` for the compact
index. `npm run test:mcp` fails if either generated file is stale.

The data is read from the request's own host (production, a preview of this project, or localhost), with
production as fallback. `TOW_MCP_DATA_DIR=<dir>` reads from disk; `TOW_MCP_DATA_BASE=<url>` forces a base.

## Tools

| Tool | Input | Returns |
|---|---|---|
| `search_tactics` | `query`, `army?`, `only_army?`, `theme?`, `tag?`, `phase?`, `limit?` (8, max 25), `offset?` | ranked lessons: title, text, why, caveats, army/phase/themes/tags, first source (channel, video, timestamp link, quote), flags; "NO LESSONS FOUND" when empty |
| `get_lesson` | `id` | full lesson with every source and extra quotes (each with its own timestamp link) |
| `list_tactics_index` | – | themes (+ sub-themes), phases, armies, tags, channels, with counts |
| `search_rules` | `query`, `army?`, `composition?`, `include_faq?`, `limit?`, `offset?` | rule names, slugs, tow.whfb.app links, snippets; FAQ/errata labelled |
| `get_rule` | `slug?` or `name?`, `army?`, `composition?` | verbatim text, tables, weapon profile, sub-rules, referencing FAQ/errata; with army: Renegade wording + official wording |
| `list_armies` | – | armies, Legacy flag, compositions, Renegade V2 availability |
| `get_army` | `army`, `composition?`, `category?` | units per category with points and restrictions |
| `get_unit` | `name`, `army?`, `composition?` | points, size, troop type, statlines, equipment per model, options, mounts, magic allowance, special rules, Renegade-vs-official changes, datasheet link |
| `calculate_attack` | `attacker`, `target`, `mode` (shooting/combat), `army_attacker?`, `army_target?`, `models?`, `target_models?`, `weapon?`, `attacker_options?`, `target_options?`, `situations?`, `width?`, `target_width?`, `multiple_shots?`, `to_hit_modifier?`, `composition_attacker?`, `composition_target?` | expected wounds, usual range (10th–90th percentile), step chain, counted / not counted, situations; combat = full exchange in Initiative order |
| `search` / `fetch` | `query` / `id` | generic JSON pair for ChatGPT connectors |

Compositions: omitted = Renegade V2 for the seven Legacy armies that have it, else the Grand Army;
`"official"` = Grand Army; `"renegade"` = Renegade V2; or any id from `list_armies`.

Tags and sub-themes (from the tactics re-index) are read when present: `tags` on a lesson (strings or
`{id,naam}`), sub-themes under `subthemas`/`subthemes` on a theme in `themas.json` or on a lesson, and
`public/tactics/tags.json` as a list, `{tags:[…]}` or an id map, with `synoniemen`/`synonyms` feeding the
search. Without them everything works on words.

## Test locally

```
npm run build:mcp      # regenerate api/mcp.js and public/mcp/rules-compact.json
npm run typecheck:mcp  # tsc over mcp/ and the src/lib it imports
npm run test:mcp       # stale check + 24 tests over HTTP against public/
node scripts/tests/mcp-harness.cjs get_unit '{"name":"Cold One Knights","army":"dark-elves"}'
```

## Test with curl (after deploy)

```
U=https://oldworldcompanion.vercel.app/api/mcp
curl -s $U -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
curl -s $U -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
curl -s $U -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_tactics","arguments":{"query":"chaff","limit":3}}}'
curl -s $U -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"calculate_attack","arguments":{"attacker":"Dark Riders","army_attacker":"dark-elves","target":"Dark Elf Warriors","army_target":"dark-elves","mode":"shooting","models":5,"target_models":20,"weapon":"repeater crossbow"}}}'
curl -si $U | head -1   # GET → 405 with a small info document
```

Or interactively: `npx @modelcontextprotocol/inspector` → transport "Streamable HTTP" → the URL above.

## Connect

- Claude Code: `claude mcp add --transport http old-world https://oldworldcompanion.vercel.app/api/mcp` (`--scope user` for all projects).
- Claude desktop/web/mobile: Settings → Connectors → Add custom connector → the URL, no authentication.
- ChatGPT: Settings → Apps & Connectors → Advanced → Developer mode → Create connector → the URL, "No authentication".

## Limits

- Public and read-only: no auth, no writes, nothing personal. Responses are `no-store`; the data files
  themselves are cached by the CDN and in the function's memory.
- Results are capped (~14k characters for a search page) and paged with `offset`.
- Measured locally (data over HTTP from disk): first `search_tactics` ≈ 0.26 s (loads lessen + bronnen
  + themas), first `get_rule` ≈ 40 ms, first `get_unit` in one army ≈ 50 ms, `get_unit` across all 18
  armies ≈ 0.23 s; warm calls 1–40 ms. On Vercel add the CDN fetches (gzip: lessen.json ≈ 170 kB in
  ~0.13 s from here).
