'use strict';
// Data providers. "alpaca" uses Alpaca's official market-data API (free key,
// "indicative" options feed). "demo" generates synthetic chains so the UI works offline.

const { parseOcc } = require('./scan');

async function getJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function alpaca(env) {
  const headers = { 'APCA-API-KEY-ID': env.ALPACA_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_SECRET, accept: 'application/json' };
  const base = 'https://data.alpaca.markets';
  return {
    name: 'alpaca',
    async spot(sym) {
      const j = await getJson(`${base}/v2/stocks/${sym}/snapshot?feed=iex`, headers);
      return j.latestTrade?.p ?? j.dailyBar?.c;
    },
    async chain(sym, { maxDte }) {
      const lte = new Date(Date.now() + (maxDte + 1) * 86400000).toISOString().slice(0, 10);
      const gte = new Date().toISOString().slice(0, 10);
      const out = [];
      let token = '';
      for (let page = 0; page < 10; page++) {
        const url = `${base}/v1beta1/options/snapshots/${sym}?feed=indicative&limit=1000&expiration_date_gte=${gte}&expiration_date_lte=${lte}${token ? `&page_token=${token}` : ''}`;
        const j = await getJson(url, headers);
        for (const [symbol, s] of Object.entries(j.snapshots || {})) {
          out.push({
            symbol, bid: s.latestQuote?.bp, ask: s.latestQuote?.ap,
            delta: s.greeks?.delta, theta: s.greeks?.theta, iv: s.impliedVolatility,
          });
        }
        token = j.next_page_token;
        if (!token) break;
      }
      return out;
    },
  };
}

function demo() {
  const spots = { SPY: 600, QQQ: 520, NVDA: 180, TSLA: 350, AAPL: 230 };
  return {
    name: 'demo',
    async spot(sym) { return spots[sym] ?? 100; },
    async chain(sym, { maxDte }) {
      const spot = spots[sym] ?? 100, out = [];
      for (let d = 0; d <= Math.min(maxDte, 5); d++) {
        const dt = new Date(Date.now() + d * 86400000);
        const ymd = dt.toISOString().slice(2, 10).replace(/-/g, '');
        for (const type of ['C', 'P']) for (let k = -10; k <= 10; k++) {
          const strike = Math.round(spot * (1 + k * 0.01));
          const iv = 0.35 + Math.abs(k) * 0.01, T = Math.max(d, 0.3) / 365;
          const dist = (type === 'C' ? strike - spot : spot - strike) / (spot * iv * Math.sqrt(T));
          const px = Math.max(0.03, spot * iv * Math.sqrt(T) * 0.4 * Math.exp(-0.5 * Math.max(dist, 0) ** 2));
          out.push({
            symbol: `${sym}${ymd}${type}${String(strike * 1000).padStart(8, '0')}`,
            bid: +(px * 0.95).toFixed(2), ask: +(px * 1.05 + 0.01).toFixed(2),
            delta: (type === 'C' ? 1 : -1) * Math.max(0.01, 0.5 * Math.exp(-0.5 * Math.max(dist, 0) ** 2) * 0.8),
            theta: -px / 2, iv,
          });
        }
      }
      return out.filter((s) => parseOcc(s.symbol));
    },
  };
}

function pick(env) {
  return env.ALPACA_KEY && env.ALPACA_SECRET ? alpaca(env) : demo();
}

module.exports = { pick, alpaca, demo };
