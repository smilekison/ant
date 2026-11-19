# Anthropic IPO Portfolio Tracker

A static, single-page dashboard for tracking a personal ANT share position in USD and NPR.

## Starting portfolio assumptions

- Shares held: 38
- Reference average cost: USD 83.00/share
- Fixed USD/NPR conversion: NPR 149.21
- Starting cost basis: USD 3,154 (NPR 470,608 at the fixed FX rate)

All holdings and cost-basis inputs are editable in the dashboard.

## Features

- Finnhub REST quote snapshot for current/open/previous-close/high/low fields.
- Finnhub WebSocket trade stream for provider-published trade ticks where the account plan and symbol support it.
- Profit/loss, market value, return, daily movement and cost basis in USD and NPR.
- Editable share count and average cost.
- Buy planner for modelling additional shares and a blended average cost. Applying a planned buy changes only the local calculator; it does not place an order.
- Editable bear/base/bull what-if scenarios. These are scenario calculations, not forecasts or investment advice.
- TradingView chart embed.
- Connection status and provider timestamps.

## Run locally or host statically

Open `index.html` in a modern browser, or publish it with GitHub Pages or any static hosting provider. No backend or database is needed.

## Connect market data

1. Register with [Finnhub](https://finnhub.io/) and obtain an API token.
2. Open the dashboard and enter the token under **Live data connection**.
3. Confirm the symbol in the dashboard (default: `ANT`).
4. Click **Connect / save**.

The app attempts:
- `wss://ws.finnhub.io` to receive provider trade events.
- `https://finnhub.io/api/v1/quote` for quote snapshots.

**Important market-data limits:** A WebSocket can deliver events as the provider publishes them, but it does not guarantee millisecond exchange latency. Updates are constrained by exchange permissions, provider coverage, subscription tier, provider throttling, browser/network latency and whether the symbol is actually covered. REST snapshots are polled separately (minimum 10 seconds). The app does not fabricate a price when no valid response is returned. A guaranteed real-time Nasdaq feed requires appropriate Nasdaq market-data licensing and an approved distribution/API arrangement. Verify symbol availability and data entitlements with your provider before relying on the tracker.

## Security

This is a static browser app. The API token is stored in this browser's `localStorage` and sent to Finnhub directly. Anyone using the same browser profile can inspect it, and a public static deployment cannot keep a token secret. Do not enter a paid/private key into a public deployment. For public sharing, move provider calls behind a serverless/API proxy and store credentials server-side.

## Currency conversion

USD/NPR is fixed at **149.21**, as requested. It is not dynamically fetched from Nepal Rastra Bank. This fixed-rate calculation excludes bank spreads, trading commissions, taxes and other fees.

## Trading and risk

This is an informational portfolio calculator, not a broker. It cannot access Revolut holdings, submit orders, guarantee IPO allocation, or predict opening/closing prices. IPO opening auctions can be volatile; scenario prices are editable what-if assumptions only. Confirm actual executions, fees and cost basis in your brokerage account.
