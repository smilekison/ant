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


## Dashboard controls and troubleshooting

### Buy planner controls
- **Reset planner** clears only the additional-share quantity and planned purchase price. It preserves the current share count and average cost.
- **Reset portfolio to starting position** asks for confirmation, restores 38 shares at USD 83.00, clears the planned purchase and updates this browser's saved portfolio values.
- **Add planned buy to holdings** applies the hypothetical quantity and price to the local portfolio calculation. It does not submit an order or verify a Revolut fill.

The planner displays planned purchase amount, share count after the hypothetical buy, blended average cost, and total capital including the planned purchase. NPR figures use the fixed NPR 149.21/USD conversion.

### HTTP 502 / price-alert troubleshooting
Open `https://YOUR_DOMAIN/api/health` in a browser. A healthy response is JSON with `ok: true`, plus `storageWritable`, `streamConnected`, `providerConfigured` and `alertsCount`.

- If `/api/health` itself returns **502 Bad Gateway**, the request is not reaching a healthy Node.js process. Check that the service is running, that the reverse proxy points to the correct host/port, and that the service was restarted after deployment.
- If health returns JSON but `storageWritable` is false, make the app's `data/` directory writable by the Node.js service user. Alert rules are stored there.
- If health works but alert creation returns **500**, inspect the Node.js logs for the alert persistence error and check the `data/` directory permissions.
- If alert creation returns **400**, the target price or alert mode/direction is invalid.
- A configured Finnhub token does not prove that quote or WebSocket permissions are enabled. Check the server logs and provider plan for feed errors.

The frontend now displays backend response details and points to `/api/health` instead of showing only a generic failed-request message.


## Fixing `storageWritable: false` / `EACCES`

This health result means the Node.js process can serve HTTP and connect to Finnhub, but the operating-system user running Node cannot create a file in the configured data directory. Telegram being false is a separate setting and does not cause the storage error.

The server now supports an optional `DATA_DIR` environment variable. If omitted, it uses the repository's `data/` directory. `/api/health` reports the resolved `storageDirectory`, and server startup logs whether that directory is writable.

### 1. Identify the storage path and service user

Open `https://YOUR_DOMAIN/api/health` and note `storageDirectory`. On the server, identify how the app is running:

**Docker**
```bash
docker ps
docker exec -it YOUR_CONTAINER_NAME sh -lc 'id; ls -ld /app /app/data 2>/dev/null || true'
```

If your app is not mounted at `/app`, use the application path shown by your deployment. The health endpoint reports the actual resolved data path.

**PM2 / systemd / native Node**
```bash
ps -eo user,group,pid,args | grep '[n]ode server.js'
```

### 2. Grant write permission

**Docker container where the Node process runs as the standard `node` user and data path is `/app/data`:**
```bash
docker exec -u 0 YOUR_CONTAINER_NAME sh -lc 'mkdir -p /app/data && chown -R node:node /app/data && chmod 750 /app/data'
docker restart YOUR_CONTAINER_NAME
```

If `/app/data` is a bind-mounted host directory, the ownership change applies to that mounted directory. If the volume is mounted read-only, change the Docker Compose volume mount to read-write; `chown` cannot fix a read-only mount.

**Native Node/PM2/systemd:** replace `APP_USER`, `APP_GROUP`, and `/absolute/path/to/ant/data` with the user/group running Node and the resolved data directory:
```bash
sudo install -d -o APP_USER -g APP_GROUP -m 750 /absolute/path/to/ant/data
```

### 3. Optional: use a dedicated persistent directory

Add a writable absolute path to the private `.env` file, for example:
```dotenv
DATA_DIR=/var/lib/ant-tracker
```
Create that directory and grant ownership to the Node service user before restarting. For Docker, mount a persistent read-write volume at the same path. Do not put this data directory in a temporary container filesystem if you need alerts and first-trade state to survive container replacement.

### 4. Verify

After restart, open `/api/health` again. The required result is:
- `storageWritable: true`
- `storageError: null`
- `storageDirectory`: the intended persistent path

Then add a low-risk test alert from the dashboard and refresh the page; the alert should still appear. Remove the test alert afterwards.

Do not use `chmod 777` as a permanent fix. Give the Node service user ownership and only the permissions it needs.
