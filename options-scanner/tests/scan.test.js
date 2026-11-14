'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseOcc, evaluate, scan } = require('../lib/scan');
const { demo } = require('../lib/providers');

const now = new Date('2026-11-16T15:00:00Z');
const snap = { symbol: 'NVDA261120C00190000', bid: 0.8, ask: 0.9, delta: 0.2, theta: -0.3, iv: 0.5 };

test('parseOcc', () => {
  assert.deepStrictEqual(parseOcc('NVDA261120C00190000'), { root: 'NVDA', expiry: '2026-11-20', type: 'call', strike: 190 });
  assert.strictEqual(parseOcc('garbage'), null);
});
test('evaluate accepts OTM call and sizes position', () => {
  const r = evaluate(snap, 180, { budget: 1000 }, now);
  assert.ok(r); assert.strictEqual(r.contracts, 11); assert.strictEqual(r.breakeven, 190.9);
  assert.ok(r.probProfitPct > 0 && r.probProfitPct < 50);
});
test('evaluate rejects ITM, wide spread, and out-of-range delta', () => {
  assert.strictEqual(evaluate(snap, 200, {}, now), null);
  assert.strictEqual(evaluate({ ...snap, bid: 0.2 }, 180, {}, now), null);
  assert.strictEqual(evaluate({ ...snap, delta: 0.6 }, 180, {}, now), null);
});
test('demo chain produces ranked results', async () => {
  const p = demo(); const chain = await p.chain('SPY', { maxDte: 5 });
  assert.ok(scan(chain, await p.spot('SPY')).length > 0);
});
