# Options Scanner (iPhone web app)

Local app that ranks short-dated (0-7 DTE), out-of-the-money, cheap option contracts by a
model-based payoff/odds score and shows the exact OCC contract, cost, breakeven and scenarios.

## Run
1. `cp .env.example .env` and add free Alpaca API keys (no keys = synthetic demo data).
2. `node server.js` (Node 18+). It prints a URL like `http://192.168.x.x:8787`.
3. On your iPhone (same Wi-Fi) open it in Safari, Share -> Add to Home Screen.

Test: `npm test`. Keys never leave your computer; the phone only talks to your local server.

Cheap short-dated OTM options mostly expire worthless. "Model P(profit)" is derived from implied
volatility, not a forecast. Not financial advice.
