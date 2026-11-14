'use strict';
// Lottery-ticket options scanner: short-dated, out-of-the-money, cheap contracts.
// Pure functions only (no I/O) so they are easy to test.

const DEFAULTS = {
  budget: 1000,
  maxDte: 7,
  minDte: 0,
  minAbsDelta: 0.08,
  maxAbsDelta: 0.35,
  minAsk: 0.05,
  maxAsk: 3.0,
  maxSpreadPct: 0.3,
  minIv: 0.05,
};

function erf(x) {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

// OCC symbol, e.g. NVDA251121C00150000
function parseOcc(sym) {
  const m = /^([A-Z.]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(sym);
  if (!m) return null;
  return {
    root: m[1],
    expiry: `20${m[2]}-${m[3]}-${m[4]}`,
    type: m[5] === 'C' ? 'call' : 'put',
    strike: parseInt(m[6], 10) / 1000,
  };
}

function dteFrom(expiry, now = new Date()) {
  const exp = Date.parse(`${expiry}T20:00:00Z`); // ~4pm ET close
  return Math.max(0, (exp - now.getTime()) / 86400000);
}

// snap: { symbol, bid, ask, delta, theta, iv }
function evaluate(snap, spot, opts = {}, now = new Date()) {
  const o = { ...DEFAULTS, ...opts };
  const occ = parseOcc(snap.symbol);
  if (!occ || !(spot > 0)) return null;
  const { bid, ask, delta, iv } = snap;
  if (!(ask > 0) || !(bid >= 0) || !(iv >= o.minIv)) return null;

  const dte = dteFrom(occ.expiry, now);
  if (dte > o.maxDte + 1 || dte < o.minDte) return null;
  const isCall = occ.type === 'call';
  const otm = isCall ? occ.strike > spot : occ.strike < spot;
  if (!otm) return null;

  const absDelta = Math.abs(delta ?? NaN);
  if (!(absDelta >= o.minAbsDelta && absDelta <= o.maxAbsDelta)) return null;
  if (ask < o.minAsk || ask > o.maxAsk) return null;
  const mid = (bid + ask) / 2;
  const spreadPct = (ask - bid) / mid;
  if (spreadPct > o.maxSpreadPct) return null;

  const T = Math.max(dte, 0.05) / 365;
  const em = iv * Math.sqrt(T) * spot; // 1-sigma expected move ($)
  const breakeven = isCall ? occ.strike + ask : occ.strike - ask;
  const moveNeeded = Math.abs(breakeven - spot);
  const z = moveNeeded / em;
  const probProfit = 1 - normCdf(z); // terminal probability under the IV-implied model

  const payoffAt = (sigmas) => {
    const px = isCall ? spot + sigmas * em : spot - sigmas * em;
    const intrinsic = isCall ? Math.max(0, px - occ.strike) : Math.max(0, occ.strike - px);
    return { price: px, multiple: intrinsic / ask };
  };
  const p1 = payoffAt(1), p15 = payoffAt(1.5), p2 = payoffAt(2);
  const contracts = Math.max(0, Math.floor(o.budget / (ask * 100)));

  // Rank: reward multiple at a 1.5σ move × realistic odds, penalise wide spreads.
  const score = (p15.multiple * probProfit) * (1 - Math.min(spreadPct, 0.5));

  return {
    contract: snap.symbol, underlying: occ.root, type: occ.type, strike: occ.strike,
    expiry: occ.expiry, dte: +dte.toFixed(2), spot,
    bid, ask, mid: +mid.toFixed(3), spreadPct: +(spreadPct * 100).toFixed(1),
    costPerContract: +(ask * 100).toFixed(2), contracts, totalCost: +(contracts * ask * 100).toFixed(2),
    breakeven: +breakeven.toFixed(2), movePct: +((moveNeeded / spot) * 100).toFixed(2),
    expectedMove: +em.toFixed(2), sigmasToBreakeven: +z.toFixed(2),
    probProfitPct: +(probProfit * 100).toFixed(1),
    delta: +delta.toFixed(3), theta: snap.theta ?? null, ivPct: +(iv * 100).toFixed(0),
    scenarios: { s1: p1, s15: p15, s2: p2 },
    score: +score.toFixed(3),
  };
}

function scan(snaps, spot, opts, now) {
  return snaps.map((s) => evaluate(s, spot, opts, now)).filter(Boolean);
}

module.exports = { DEFAULTS, parseOcc, dteFrom, evaluate, scan, normCdf };
