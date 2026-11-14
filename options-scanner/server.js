'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pick } = require('./lib/providers');
const { scan, DEFAULTS } = require('./lib/scan');

// Optional .env file (ALPACA_KEY, ALPACA_SECRET, PORT)
try {
  for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(l);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env */ }

const provider = pick(process.env);
const PORT = Number(process.env.PORT) || 8787;
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.js': 'text/javascript' };
const DEFAULT_WATCH = 'SPY,QQQ,IWM,NVDA,TSLA,AAPL,AMD,META,AMZN,PLTR,MSFT,GOOGL,COIN,MSTR';

async function handleScan(url) {
  const q = url.searchParams;
  const symbols = (q.get('symbols') || DEFAULT_WATCH).toUpperCase().split(',').map((s) => s.trim()).filter((s) => /^[A-Z.]{1,6}$/.test(s)).slice(0, 25);
  const num = (k) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : undefined);
  const opts = Object.fromEntries(Object.entries({
    budget: num('budget'), maxDte: num('maxDte'), maxAsk: num('maxAsk'), maxSpreadPct: num('maxSpreadPct'),
    minAbsDelta: num('minAbsDelta'), maxAbsDelta: num('maxAbsDelta'),
  }).filter(([, v]) => v !== undefined));
  const full = { ...DEFAULTS, ...opts };
  const results = [], errors = [];
  await Promise.all(symbols.map(async (s) => {
    try {
      const spot = await provider.spot(s);
      const chain = await provider.chain(s, full);
      results.push(...scan(chain, spot, full));
    } catch (e) { errors.push(`${s}: ${e.message}`); }
  }));
  results.sort((a, b) => b.score - a.score);
  return { provider: provider.name, asOf: new Date().toISOString(), opts: full, count: results.length, results: results.slice(0, 40), errors };
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/scan') {
      const body = JSON.stringify(await handleScan(url));
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(body);
    }
    const f = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  } catch (e) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
}).listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`Options scanner [${provider.name} data] — open on your iPhone (same Wi-Fi):`);
  ips.forEach((ip) => console.log(`  http://${ip}:${PORT}`));
  if (provider.name === 'demo') console.log('DEMO MODE: synthetic data. Add ALPACA_KEY / ALPACA_SECRET to .env for live quotes.');
});
