# Anthropic IPO Portfolio Tracker

A Node.js-backed dashboard for tracking an assumed Anthropic (Nasdaq: ANT) position in USD and NPR. The frontend never receives the Finnhub API token: the server reads it from a private `.env` file and proxies REST quote snapshots and the Finnhub trade WebSocket.

## Starting portfolio assumptions
- Shares: 38
- IPO reference cost: USD 83.00/share
- Fixed USD/NPR: NPR 149.21
- Starting cost basis: USD 3,154.00 (NPR 470,608.34)

These are editable assumptions. Confirm actual allocation, executed quantity, fees and cost basis in Revolut.

## Features
- Server-side Finnhub REST quote proxy; API key is not exposed to browsers.
- Server-side Finnhub WebSocket relay for trade ticks where provider entitlements allow.
- Quote timestamp, open, previous close, high, low and volume fields.
- Portfolio value, unrealised P/L, return and daily P/L in USD/NPR.
- Fixed FX conversion of NPR 149.21 per USD.
- Editable shares, average cost, additional-buy planner and blended-cost calculator.
- User-editable bear/base/bull scenarios (not forecasts).
- TradingView chart embed.
- Browser persistence for share count and average cost only.

## Requirements
- Node.js 20 or later.
- Finnhub API token with access to quote snapshots and the relevant US-equity trade stream.
- Hosting that supports a persistent Node.js process and WebSocket upgrades. GitHub Pages alone cannot run this backend or keep API credentials private.

## Setup
1. Clone/download this repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your private environment file:

   Linux/macOS:
   ```bash
   cp .env.example .env
   ```

   Windows PowerShell:
   ```powershell
   Copy-Item .env.example .env
   ```

4. Edit `.env` and replace the placeholder with your real Finnhub token:
   ```dotenv
   FINNHUB_API_KEY=your_actual_finnhub_token
   STOCK_SYMBOL=ANT
   PORT=3000
   QUOTE_REFRESH_SECONDS=30
   ```
5. Start:
   ```bash
   npm start
   ```
6. Open http://localhost:3000.

Use `npm run dev` for Node's watch mode during development.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---:|---|---|
| `FINNHUB_API_KEY` | Yes | — | Private Finnhub token, read only by Node server |
| `STOCK_SYMBOL` | No | `ANT` | Default ticker |
| `PORT` | No | `3000` | HTTP server port |
| `QUOTE_REFRESH_SECONDS` | No | `30` | Snapshot polling interval, clamped to 10–300 seconds |

Never put a real key in `.env.example`, frontend files, GitHub Actions logs or commits. `.env` is excluded by `.gitignore`. For production, add these variables using your hosting provider's private environment-variable/secret settings rather than uploading a local `.env` file.

## Endpoints
- `GET /api/health` — process health.
- `GET /api/config` — safe public configuration only; never returns the key.
- `GET /api/quote?symbol=ANT` — server-side Finnhub quote proxy.
- `/ws?symbol=ANT` — same-origin WebSocket relay for Finnhub trade events.

The server validates ticker syntax, rate-limits quote requests per client IP and applies provider request timeouts.

## Market-data limitations
WebSocket events arrive as the upstream provider publishes them; this does not guarantee millisecond exchange latency or a complete consolidated tape. Real-time/delayed status, symbol availability, rate limits and exchange permissions depend on the Finnhub subscription and applicable Nasdaq market-data entitlements. Confirm that your plan covers Nasdaq/ANT. If Finnhub returns no valid quote, the dashboard displays an error rather than inventing a price. TradingView is an independent source and may have different coverage/delay.

## Calculations and risk
Invested cost = shares × average cost. Market value = latest valid provider price × shares. Unrealised P/L = market value − invested cost. NPR = USD × 149.21. The FX rate is fixed as requested and excludes bank spreads, commissions, taxes and currency costs. The buy planner changes the local calculator only; it does not place a Revolut order or sync holdings. Scenarios are what-if calculations, not price predictions or investment advice. IPO trading can be volatile.
