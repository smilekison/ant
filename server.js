require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const PORT = Number(process.env.PORT || 3000);
const API_KEY = (process.env.FINNHUB_API_KEY || '').trim();
const DEFAULT_SYMBOL = (process.env.STOCK_SYMBOL || 'ANT').trim().toUpperCase();
const POLL_SECONDS = Math.max(3, Math.min(15, Number(process.env.QUOTE_REFRESH_SECONDS || 5)));
const FX_RATE = 149.21;
const validSymbol = /^[A-Z0-9.-]{1,15}$/;
const requests = new Map();
const clients = new Set();
let providerSocket = null;
let streamConnected = false;
let reconnectTimer = null;
let firstTrade = null;
let lastPrice = null;
let lastCheck = null;
let fxCache={rate:null,date:null,fetchedAt:0};


app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
app.use(express.static(__dirname, { extensions: ['html'], etag: true, maxAge: '1h' }));

function symbolOf(input) {
  const symbol = String(input || DEFAULT_SYMBOL).trim().toUpperCase();
  if (!validSymbol.test(symbol)) throw Error('Invalid stock symbol.');
  return symbol;
}
function broadcast(message) {
  const raw = JSON.stringify(message);
  for (const client of clients) if (client.readyState === WebSocket.OPEN) client.send(raw);
}
async function getQuote(symbol = DEFAULT_SYMBOL) {
  if (!API_KEY) throw Error('FINNHUB_API_KEY is not configured in the server .env file.');
  const url = new URL('https://finnhub.io/api/v1/quote');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('token', API_KEY);
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  const data = await response.json();
  if (!response.ok) throw Error('Finnhub quote request failed with HTTP ' + response.status + '. Check API access and rate limits.');
  if (!data || !Number.isFinite(Number(data.c)) || Number(data.c) <= 0) throw Error('Finnhub has no valid quote for ' + symbol + '. Check symbol coverage and market-data permissions.');
  return data;
}
function markTrade(trade) {
  const price = Number(trade.p);
  const timestamp = Number(trade.t) || Date.now();
  if (!Number.isFinite(price) || price <= 0) return;
  lastPrice = price;
  if (!firstTrade) {
    firstTrade = { price, timestamp: new Date(timestamp).toISOString(), provider: 'Finnhub trade WebSocket' };
    broadcast({ type: 'first_trade', price, timestamp: firstTrade.timestamp });
  }
}
function connectProvider() {
  if (!API_KEY || providerSocket) return;
  console.log('Connecting to Finnhub trade stream for ' + DEFAULT_SYMBOL);
  const ws = new WebSocket('wss://ws.finnhub.io?token=' + encodeURIComponent(API_KEY));
  providerSocket = ws;
  const timeout = setTimeout(() => { if (ws.readyState !== WebSocket.OPEN) ws.terminate(); }, 12000);
  ws.on('open', () => {
    clearTimeout(timeout);
    streamConnected = true;
    ws.send(JSON.stringify({ type: 'subscribe', symbol: DEFAULT_SYMBOL }));
    broadcast({ type: 'connection', connected: true });
    console.log('Finnhub trade stream connected');
  });
  ws.on('message', raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type === 'trade' && Array.isArray(message.data)) {
      for (const trade of message.data) markTrade(trade);
      broadcast(message);
    }
  });
  ws.on('error', error => console.error('Finnhub WebSocket error:', error.message));
  ws.on('close', () => {
    clearTimeout(timeout);
    streamConnected = false;
    providerSocket = null;
    broadcast({ type: 'connection', connected: false });
    if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; connectProvider(); }, 5000);
  });
}
function rateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = requests.get(key) || { start: now, count: 0 };
  if (now - entry.start > 60000) { entry.start = now; entry.count = 0; }
  if (++entry.count > 30) return res.status(429).json({ error: 'Too many requests. Reduce refresh frequency.' });
  requests.set(key, entry);
  next();
}
app.get('/api/health', (_req, res) => res.json({
  ok: true,
  service: 'anthropic-ipo-tracker',
  streamConnected,
  providerConfigured: Boolean(API_KEY),
  refreshSeconds: POLL_SECONDS,
  now: new Date().toISOString()
}));
app.get('/api/config', (_req, res) => res.json({
  symbol: DEFAULT_SYMBOL,
  pollSeconds: POLL_SECONDS,
  provider: 'Finnhub',
  providerConfigured: Boolean(API_KEY),
  fxUsdNpr: FX_RATE
}));
app.get('/api/fx', async (_req, res) => {
  try {
    if (!fxCache.rate || Date.now() - fxCache.fetchedAt > 3600000) {
      const response = await fetch('https://api.frankfurter.dev/v2/rate/usd/eur', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw Error('FX provider returned HTTP ' + response.status);
      const data = await response.json();
      if (!Number.isFinite(Number(data.rate)) || Number(data.rate) <= 0) throw Error('Invalid USD/EUR reference rate');
      fxCache = { rate: Number(data.rate), date: data.date, fetchedAt: Date.now() };
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ base: 'USD', quote: 'EUR', usdEur: fxCache.rate, date: fxCache.date, source: 'Frankfurter reference rates', fetchedAt: new Date(fxCache.fetchedAt).toISOString() });
  } catch (error) {
    console.error('FX reference rate unavailable:', error.message);
    if (fxCache.rate) return res.json({ base: 'USD', quote: 'EUR', usdEur: fxCache.rate, date: fxCache.date, source: 'Frankfurter cached reference rate', stale: true });
    res.status(502).json({ error: 'USD/EUR reference rate unavailable.' });
  }
});
app.get('/api/status', (_req, res) => res.json({
  tradingLive: Boolean(firstTrade),
  firstTrade,
  streamConnected,
  lastCheck,
  monitorIntervalSeconds: POLL_SECONDS,
  lastPrice
}));
app.get('/api/quote', rateLimit, async (req, res) => {
  if (!API_KEY) return res.status(503).json({ error: 'FINNHUB_API_KEY is missing in .env.' });
  let symbol;
  try { symbol = symbolOf(req.query.symbol); } catch (error) { return res.status(400).json({ error: error.message }); }
  try {
    const quote = await getQuote(symbol);
    lastCheck = new Date().toISOString();
    if (!lastPrice && Number(quote.c) > 0) lastPrice = Number(quote.c);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ quote, symbol, source: 'Finnhub', checkedAt: lastCheck });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});
server.on('upgrade', (req, socket, head) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  let symbol;
  try { symbol = symbolOf(url.searchParams.get('symbol')); } catch { socket.destroy(); return; }
  if (symbol !== DEFAULT_SYMBOL) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, client => {
    clients.add(client);
    client.on('close', () => clients.delete(client));
    client.on('error', () => clients.delete(client));
    client.send(JSON.stringify({ type: 'connection', connected: streamConnected }));
    if (firstTrade) client.send(JSON.stringify({ type: 'first_trade', price: firstTrade.price, timestamp: firstTrade.timestamp }));
  });
});
server.listen(PORT, () => {
  console.log('ANT tracker listening on port ' + PORT);
  console.log('Automatic quote refresh: ' + POLL_SECONDS + ' seconds');
  if (!API_KEY) console.warn('FINNHUB_API_KEY missing; market feed disabled.');
  connectProvider();
});
process.on('SIGTERM', () => { if (providerSocket) providerSocket.close(); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { if (providerSocket) providerSocket.close(); server.close(() => process.exit(0)); });
