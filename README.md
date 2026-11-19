# Anthropic ANT Portfolio Tracker

A simple Node.js dashboard for monitoring the ANT market price and your portfolio. The page refreshes quote and trading-status details automatically every 5 seconds. The live chart receives trade events through a persistent Finnhub WebSocket connection.

## Requirements
- Node.js 20 or later.
- Finnhub API token with access to ANT quote data and the relevant real-time US equity trade stream.
- Hosting that keeps a Node.js process running and supports WebSocket upgrades. GitHub Pages alone cannot run the backend.

## Setup
```bash
npm install
cp .env.example .env
```
Edit `.env`:
```dotenv
FINNHUB_API_KEY=your_actual_finnhub_token
STOCK_SYMBOL=ANT
PORT=3000
QUOTE_REFRESH_SECONDS=5
```
Start:
```bash
npm start
```
Open the website. It refreshes automatically; no manual refresh is needed.

## Environment variables
| Variable | Default | Purpose |
|---|---|---|
| `FINNHUB_API_KEY` | required | Private Finnhub token |
| `STOCK_SYMBOL` | `ANT` | Ticker symbol |
| `PORT` | `3000` | HTTP server port |
| `QUOTE_REFRESH_SECONDS` | `5` | Automatic quote/status refresh interval, clamped to 3–15 seconds |

Never commit the real `.env` file. For hosted deployment, configure these as private environment variables.

## How updates work
- Quote snapshot, portfolio valuation and trading status refresh automatically every 5 seconds by default.
- The live chart receives Finnhub WebSocket trade events as the provider sends them.
- The browser automatically reconnects to the app's WebSocket if its connection drops.
- The server maintains one upstream Finnhub WebSocket connection and shares its trade events with connected dashboard pages.
- The quote polling rate is 12 requests per minute per open dashboard page at the 5-second setting. Confirm your Finnhub plan permits the required quote access and real-time ANT trade stream.

The site no longer includes price alerts, Telegram notifications, alert storage or bot configuration. No storage directory or write permission is required.

## Trading status
The dashboard marks the first trade only after receiving an actual trade event from Finnhub's trade WebSocket. A quote snapshot alone is not treated as proof of the first executed trade. The first-trade record is held in memory and will reset if the Node.js process restarts. A first-trade indication does not mean your broker order has executed; check Revolut for order status and fills.

## Portfolio assumptions
Default editable position: 38 shares at USD 83.00/share. The transaction history panel also records the additional 16.39493019-share purchase at USD 108.88 and its full sale at USD 94.52, showing the realised loss and the combined realised/unrealised result at the current market price. Fixed FX: NPR 149.21/USD. Confirm actual allocation, fills, fees and cost basis in Revolut. The buy planner is hypothetical and does not place orders. The scenario calculator is a what-if tool, not investment advice.

## Data limitations
A five-second quote refresh means the dashboard requests a new snapshot every five seconds; it does not guarantee that Finnhub's underlying quote changes that frequently or is exchange-real-time. The chart updates on trade events but depends on Finnhub entitlements, symbol coverage and delivery latency. Neither this app nor a WebSocket guarantees millisecond exchange latency or a complete consolidated tape.


## EUR conversion
The dashboard also displays portfolio market value, invested cost, unrealised P/L and selling-calculator P/L in EUR. The server fetches the USD/EUR reference rate from Frankfurter's v2 API (no API key required) and caches it for one hour. The UI displays the reference-rate date. This is a central-bank/reference rate, not a live executable FX quote; Revolut's actual conversion rate and fees may differ. The existing USD/NPR conversion remains fixed at NPR 149.21 per USD.


## Currency converter
The dashboard includes an interactive multi-currency converter with editable amounts, currency selectors and a swap control. The server retrieves supported currencies from Frankfurter and reference rates from its v2 rates endpoint. Currency lists are cached for 24 hours and rates per base currency for one hour. The converter displays the rate date and source. These are reference rates, not executable bank, card or broker rates. The existing USD/NPR portfolio valuation remains fixed at NPR 149.21 per USD.


## Chart controls and selling planner
The live chart buffers incoming trade events and redraws every 3 or 5 seconds, selectable in the chart header. The price-axis labels are rounded to whole USD values for readability. The old scenario calculator and single-price selling calculator have been removed. The Selling Planner supports multiple hypothetical limit orders, calculates combined proceeds, allocated average-cost basis, estimated realised profit/loss, fees, and remaining shares. It is a planning tool only and does not submit orders.


## Live portfolio P/L and trade pressure
Portfolio unrealised P/L is recalculated on every valid incoming Finnhub trade tick. The latest quote snapshot remains the fallback when trade ticks are unavailable and updates the same calculation. The portfolio card shows the update time and data source. Buying/selling pressure is estimated from tick-rule trade direction and volume, with rolling 60-second and 5-minute views; it is not confirmed aggressor-side volume or full order-book depth.
