// Local harness for the MCP function (api/mcp.js): one HTTP server that serves public/ as static files and
// routes /api/mcp to the bundled handler, so the function fetches its data over HTTP from "its own host"
// exactly as on Vercel. Used by scripts/tests/mcp.test.cjs; also runnable by hand:
//   node scripts/tests/mcp-harness.cjs search_tactics '{"query":"chaff"}'
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const pub = path.join(root, 'public');

async function start() {
  const { default: handler } = await import(pathToFileURL(path.join(root, 'api/mcp.js')).href);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/mcp') {
      Promise.resolve(handler(req, res)).catch((e) => { res.statusCode = 500; res.end(String(e)); });
      return;
    }
    const file = path.join(pub, decodeURIComponent(url.pathname));
    if (!file.startsWith(pub) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let id = 0;
  async function rpc(method, params, { raw = false, headers = {} } = {}) {
    const body = raw ? method : JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params });
    const r = await fetch(`${base}/api/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body });
    const text = await r.text();
    return { status: r.status, headers: r.headers, text, json: text ? JSON.parse(text) : null };
  }
  async function call(name, args = {}) {
    const t0 = Date.now();
    const r = await rpc('tools/call', { name, arguments: args });
    const ms = Date.now() - t0;
    if (r.json.error) throw new Error(`${name}: ${JSON.stringify(r.json.error)}`);
    return { text: r.json.result.content[0].text, isError: r.json.result.isError, ms, bytes: r.text.length };
  }
  return { base, rpc, call, close: () => new Promise((r) => server.close(r)) };
}

module.exports = { start };

if (require.main === module) {
  (async () => {
    const h = await start();
    const [name, args] = process.argv.slice(2);
    const r = await h.call(name, args ? JSON.parse(args) : {});
    console.log(r.text);
    console.error(`\n[${r.ms} ms, ${r.bytes} bytes, isError=${r.isError}]`);
    await h.close();
  })().catch((e) => { console.error(e); process.exit(1); });
}
