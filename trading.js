const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

function createTradingRouter({ getQuote, symbol }) {
  const router = express.Router();
  const stateFile = process.env.TRADING_STATE_FILE || path.join(process.env.DATA_DIR || __dirname, 'data', 'paper-trading.json');
  const limits = {
    maxOrderQty: positiveEnv('PAPER_MAX_ORDER_QTY', 1000),
    maxOrderNotional: positiveEnv('PAPER_MAX_ORDER_NOTIONAL', 100000),
    dailyLossLimit: positiveEnv('PAPER_DAILY_LOSS_LIMIT', 1000)
  };
  let state = loadState();
  let lastPrice = null;
  let botBusy = false;

  function positiveEnv(key, fallback) {
    const n = Number(process.env[key]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }
  function emptyState() {
    return {
      mode: 'PAPER',
      killSwitch: false,
      cash: 100000,
      positions: {},
      orders: [],
      bot: { running: false, side: 'BUY', quantity: 1, triggerPrice: 0, condition: 'at_or_below', symbol, lastAction: null },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  function loadState() {
    try {
      const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (parsed && parsed.mode === 'PAPER' && Number.isFinite(parsed.cash) && Array.isArray(parsed.orders)) return parsed;
    } catch {}
    return emptyState();
  }
  function save() {
    state.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(stateFile), { recursive: true, mode: 0o700 });
    const temp = stateFile + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(temp, stateFile);
  }
  function num(v) { return Number.isFinite(Number(v)) ? Number(v) : NaN; }
  function dayStart() { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }
  function realisedToday() {
    return state.orders.filter(o => o.status === 'FILLED' && o.side === 'SELL' && Date.parse(o.filledAt || 0) >= dayStart()).reduce((sum,o) => sum + Number(o.realisedPnl || 0), 0);
  }
  function dailyPnl() { const p=positionFor(symbol); return realisedToday() + (Number.isFinite(lastPrice) ? p.quantity * (lastPrice - p.averageCost) : 0); }
  function positionFor(sym) {
    return state.positions[sym] || { symbol: sym, quantity: 0, averageCost: 0, realisedPnl: 0 };
  }
  function portfolioSnapshot() {
    const positions = Object.values(state.positions).map(p => ({...p, marketPrice: p.symbol === symbol ? lastPrice : null, marketValue: p.symbol === symbol && lastPrice ? p.quantity * lastPrice : null, unrealisedPnl: p.symbol === symbol && lastPrice ? p.quantity * (lastPrice - p.averageCost) : null }));
    const marketValue = positions.reduce((s,p) => s + (Number(p.marketValue) || 0), 0);
    return { mode: 'PAPER', cash: state.cash, positions, orders: state.orders.slice(-100).reverse(), bot: state.bot, killSwitch: state.killSwitch, realisedToday: realisedToday(), dailyPnl: dailyPnl(), dailyLossLimit: limits.dailyLossLimit, limits, marketValue, equity: state.cash + marketValue, updatedAt: state.updatedAt };
  }
  function validate(input) {
    const side = String(input.side || '').toUpperCase();
    const type = String(input.type || 'MARKET').toUpperCase();
    const sym = String(input.symbol || symbol).trim().toUpperCase();
    const quantity = num(input.quantity);
    const limitPrice = input.limitPrice == null || input.limitPrice === '' ? null : num(input.limitPrice);
    if (!['BUY','SELL'].includes(side)) throw Error('Side must be BUY or SELL.');
    if (!['MARKET','LIMIT'].includes(type)) throw Error('Order type must be MARKET or LIMIT.');
    if (sym !== symbol) throw Error('This paper adapter currently supports only ' + symbol + '.');
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > limits.maxOrderQty) throw Error('Quantity must be greater than zero and no more than ' + limits.maxOrderQty + '.');
    if (type === 'LIMIT' && (!Number.isFinite(limitPrice) || limitPrice <= 0)) throw Error('A valid positive limit price is required.');
    if (type === 'MARKET' && limitPrice !== null) throw Error('Market orders must not include a limit price.');
    return { side, type, symbol: sym, quantity, limitPrice };
  }
  function previewOrder(input, price) {
    const order = validate(input);
    const reference = order.type === 'LIMIT' ? order.limitPrice : price;
    if (!Number.isFinite(reference) || reference <= 0) throw Error('No valid market quote is available for this symbol.');
    const notional = reference * order.quantity;
    if (notional > limits.maxOrderNotional) throw Error('Order value exceeds the paper limit of $' + limits.maxOrderNotional.toLocaleString() + '.');
    if (order.side === 'BUY' && notional > state.cash) throw Error('Insufficient paper cash for this market order.');
    if (order.side === 'SELL' && order.quantity > positionFor(order.symbol).quantity) throw Error('Insufficient paper shares for this sell order.');
    if (dailyPnl() <= -limits.dailyLossLimit) throw Error('Daily realised-loss limit reached. Trading is blocked until the next day.');
    if (state.killSwitch) throw Error('Kill switch is active. Disable it before submitting paper orders.');
    return { ...order, referencePrice: reference, estimatedNotional: notional, estimatedFees: 0, warning: 'Paper simulation only. This does not route to a broker or execute a real trade.' };
  }
  function fill(order, price) {
    const p = positionFor(order.symbol);
    const notional = order.quantity * price;
    if (order.side === 'BUY') {
      if (notional > state.cash) { order.status = 'REJECTED'; order.reason = 'Insufficient paper cash at fill price.'; return; }
      const newQty = p.quantity + order.quantity;
      p.averageCost = newQty ? ((p.quantity * p.averageCost) + notional) / newQty : price;
      p.quantity = newQty;
      state.cash -= notional;
    } else {
      if (order.quantity > p.quantity) { order.status = 'REJECTED'; order.reason = 'Insufficient paper shares at fill time.'; return; }
      const cost = order.quantity * p.averageCost;
      p.quantity -= order.quantity;
      p.realisedPnl += notional - cost;
      order.realisedPnl = notional - cost;
      state.cash += notional;
      if (p.quantity <= 1e-8) { p.quantity = 0; p.averageCost = 0; }
    }
    state.positions[order.symbol] = p;
    order.status = 'FILLED';
    order.averageFillPrice = price;
    order.filledAt = new Date().toISOString();
  }
  function matchLimits(price) {
    if (!Number.isFinite(price) || price <= 0) return;
    lastPrice = price;
    let changed = false;
    for (const order of state.orders) {
      if (order.status !== 'PENDING' || order.type !== 'LIMIT') continue;
      const crossed = order.side === 'BUY' ? price <= order.limitPrice : price >= order.limitPrice;
      if (!crossed) continue;
      try {
        if (order.side === 'BUY' && order.quantity * price > state.cash) { order.status = 'REJECTED'; order.reason = 'Insufficient paper cash when limit became eligible.'; }
        else fill(order, price);
      } catch (e) { order.status = 'REJECTED'; order.reason = e.message; }
      changed = true;
    }
    if (changed) save();
    runBot(price);
  }
  function runBot(price) {
    const b = state.bot;
    if (!b.running || botBusy || state.killSwitch || !Number.isFinite(price)) return;
    const triggered = b.condition === 'at_or_above' ? price >= b.triggerPrice : price <= b.triggerPrice;
    if (!triggered) return;
    botBusy = true;
    try {
      const draft = { side: b.side, type: 'MARKET', symbol: b.symbol, quantity: b.quantity };
      const check = previewOrder(draft, price);
      const order = { id: 'P-' + Date.now() + '-' + Math.random().toString(36).slice(2,7), ...check, status: 'SUBMITTED', createdAt: new Date().toISOString(), source: 'PAPER_BOT' };
      fill(order, price);
      state.orders.push(order);
      state.bot.running = false;
      state.bot.lastAction = { at: new Date().toISOString(), price, status: order.status, orderId: order.id };
      save();
    } catch (e) {
      state.bot.running = false;
      state.bot.lastAction = { at: new Date().toISOString(), price, status: 'BLOCKED', reason: e.message };
      save();
    } finally { botBusy = false; }
  }

  router.get('/state', (_req,res) => res.json(portfolioSnapshot()));
  router.post('/orders/preview', async (req,res) => {
    try {
      const q = await getQuote(symbol);
      res.json({ preview: previewOrder(req.body || {}, Number(q.c)), marketPrice: Number(q.c) });
    } catch(e) { res.status(400).json({ error: e.message }); }
  });
  router.post('/orders', async (req,res) => {
    try {
      const q = await getQuote(symbol);
      const check = previewOrder(req.body || {}, Number(q.c));
      const order = { id: 'P-' + Date.now() + '-' + Math.random().toString(36).slice(2,7), ...check, status: 'SUBMITTED', createdAt: new Date().toISOString(), source: 'MANUAL' };
      state.orders.push(order);
      if (order.type === 'MARKET') fill(order, Number(q.c));
      else order.status = 'PENDING';
      save();
      res.status(201).json({ order, state: portfolioSnapshot() });
    } catch(e) { res.status(400).json({ error: e.message }); }
  });
  router.post('/orders/:id/cancel', (req,res) => {
    const order = state.orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.status !== 'PENDING') return res.status(409).json({ error: 'Only pending paper orders can be cancelled.' });
    order.status = 'CANCELLED'; order.cancelledAt = new Date().toISOString(); save();
    res.json({ order, state: portfolioSnapshot() });
  });
  router.post('/bot', (req,res) => {
    try {
      const action = String(req.body.action || '').toUpperCase();
      if (action === 'STOP') state.bot.running = false;
      else if (action === 'START') {
        const side = String(req.body.side || 'BUY').toUpperCase();
        const condition = String(req.body.condition || 'at_or_below');
        const quantity = num(req.body.quantity), triggerPrice = num(req.body.triggerPrice);
        if (!['BUY','SELL'].includes(side)) throw Error('Bot side must be BUY or SELL.');
        if (!['at_or_below','at_or_above'].includes(condition)) throw Error('Invalid trigger condition.');
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > limits.maxOrderQty) throw Error('Bot quantity is outside the allowed range.');
        if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) throw Error('Enter a valid trigger price.');
        state.bot = { ...state.bot, running: true, side, condition, quantity, triggerPrice, symbol, lastAction: null };
      } else throw Error('Action must be START or STOP.');
      save(); res.json({ state: portfolioSnapshot() });
    } catch(e) { res.status(400).json({ error: e.message }); }
  });
  router.post('/kill-switch', (req,res) => {
    state.killSwitch = req.body.active !== false;
    if (state.killSwitch) { state.bot.running = false; for (const order of state.orders) if (order.status === 'PENDING') { order.status = 'CANCELLED'; order.cancelledAt = new Date().toISOString(); order.reason = 'Cancelled by kill switch.'; } }
    save(); res.json({ state: portfolioSnapshot() });
  });
  router.post('/reset', (req,res) => {
    if (String(req.body.confirm || '') !== 'RESET PAPER ACCOUNT') return res.status(400).json({ error: 'Confirmation phrase did not match.' });
    state = emptyState(); save(); res.json({ state: portfolioSnapshot() });
  });
  return { router, onPrice: matchLimits };
}
module.exports = { createTradingRouter };
