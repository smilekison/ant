# Anthropic ANT IPO Portfolio Tracker

A personal Node.js dashboard for the assumed 38-share position, with a persistent Finnhub trade WebSocket, one-minute quote checks for November 19, 2026, live trade chart, first-trade detection, and server-persisted price alerts.

## Install and run
```bash
npm install
cp .env.example .env
# edit .env and add your Finnhub API key
npm start
``
Open http://localhost:3000. Use Node.js 20+ and a host that keeps a Node process alive and supports outbound WebSockets. GitHub Pages alone cannot run this server.

## .env variables
```dotenv
FINNHUB_API_KEY=your_finnhub_api_token
STOCK_SYMBOL=ANT
PORT=3000
QUOTE_REFRESH_SECONDS=60
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
``
The server reads the Finnhub key privately. Never commit .env. For hosted deployment, set these as private environment variables in the hosting provider.

## Telegram alerts setup (recommended)
1. Create a Finnhub account at https://finnhub.io/, open your dashboard, copy your API token, and confirm that your plan includes real-time US/Nasdaq trade WebSocket access and ANT symbol coverage. A key being present does not mean this permission is enabled.\n2. In Telegram, open **@BotFather**, send `/newbot`, follow the prompts and copy the bot token.
3. Open your new bot's chat and press **Start** (or send `/start`).
4. To obtain your chat ID, open `https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates` in a browser after sending the bot a message. Find `message.chat.id` in the JSON response.
5. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the private `.env` file, then restart the app.
6. Never share the token or commit it. Test with a price alert close to the current price, then remove it.

## Today's monitoring
The server keeps one Finnhub trade WebSocket connection open independently of the browser. The first valid ANT trade event is persisted in `data/market-state.json` and triggers a Telegram alert (if configured) and a browser event. A one-minute REST quote check runs only on November 19, 2026 during the US regular session, 9:30 a.m.–4:00 p.m. America/New_York. This quote polling is a fallback for prices/thresholds; **first-trade confirmation is based on an actual provider trade event**, not a quote, listing record or indicative price.

The first-trade event means a trade was reported by Finnhub. It does not confirm that a user's Revolut order executed. Confirm execution in Revolut.

## Price alerts
Add above/below thresholds in the dashboard. Alerts are saved to `data/alerts.json` on the server and evaluated against incoming trade ticks and one-minute quote snapshots. Once alerts trigger once; repeat alerts trigger again on a new crossing. Data files are local to the host; back them up if needed.

## Live chart
The intraday chart is drawn from incoming Finnhub trade events using Chart.js. It updates when events arrive. It will remain empty until a real trade event is received; no synthetic prices or pre-market indications are drawn as executed trades.

## Market data and Yahoo Finance
Yahoo Finance does not offer a documented public real-time developer API. Its web endpoints are unofficial, can change, and may be subject to Yahoo's terms and rate limits. Do not rely on them for execution decisions. Finnhub's trade WebSocket is the current provider integration; confirm your Finnhub plan includes real-time Nasdaq/ANT trades and quote access. Provider delivery is not a guarantee of exchange-level millisecond latency or a complete consolidated tape.

## Portfolio assumptions and risk
Default editable holding: 38 shares at USD 83.00/share. Fixed FX: NPR 149.21/USD. These are assumptions; verify allocation, fills, fees and average cost in Revolut. The planner does not place orders or connect to Revolut. IPO opening prices can be highly volatile, with wide spreads and trading halts. Consider limit orders and confirm current broker availability, order rules and market status before trading.

## Yahoo Finance API note
Yahoo Finance does not publish a documented public developer API for real-time equity streaming. Some third-party libraries call undocumented Yahoo endpoints; those can change, be rate-limited, and are not a dependable licensed real-time execution feed. There is no official Yahoo API key to request for this setup. Keep Finnhub as the market-data source and confirm its Nasdaq real-time entitlements instead. See Yahoo's public developer/API information and its terms before using any unofficial collection method.
