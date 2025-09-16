// server/index.js
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import emailSignupRouter from './routes/emailSignup.js';

// Configuración por variables de entorno
const PORT = process.env.PORT || 8080;
const GOLDAPI_KEY = process.env.GOLDAPI_KEY || '';
const GOLDAPI_BASE = (process.env.GOLDAPI_BASE || 'https://www.goldapi.io/api').replace(/\/$/, '');
const SYMBOL_RAW = process.env.SYMBOL || 'XAUUSD';
const DEFAULT_CSV_PATH = path.resolve(process.cwd(), 'public', 'data', 'xauusd_ohlc_clean.csv');
const CSV_PATH = process.env.CSV_PATH ? path.resolve(process.env.CSV_PATH) : DEFAULT_CSV_PATH;

const toPositiveNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const SPOT_CACHE_TTL_MS = toPositiveNumber(process.env.SPOT_CACHE_TTL_MS, 60_000);
const HISTORICAL_CACHE_TTL_MS = toPositiveNumber(process.env.HISTORICAL_CACHE_TTL_MS, 5 * 60_000);
const GOLDAPI_MIN_INTERVAL_MS = toPositiveNumber(process.env.GOLDAPI_MIN_INTERVAL_MS, 250);

function parseSymbolPair(input = 'XAUUSD') {
  const str = String(input || '').toUpperCase();
  // Admite variantes como XAU/USD, XAU-USD o simplemente XAUUSD
  const compact = str.replace(/[^A-Z]/g, '');
  if (compact.length >= 6) {
    const currency = compact.slice(-3);
    const metal = compact.slice(0, compact.length - 3);
    return {
      pair: `${metal}${currency}`,
      metal,
      currency,
    };
  }
  return { pair: 'XAUUSD', metal: 'XAU', currency: 'USD' };
}

const SYMBOL_INFO = parseSymbolPair(SYMBOL_RAW);

const HTTP_TIMEOUT_MS = Number(process.env.GOLDAPI_TIMEOUT_MS || 15_000);

const axiosConfig = {
  baseURL: GOLDAPI_BASE,
  timeout: HTTP_TIMEOUT_MS,
  headers: {
    'x-access-token': GOLDAPI_KEY,
    Accept: 'application/json',
  },
};

const goldApiClient = axios.create(axiosConfig);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let goldApiQueue = Promise.resolve();
let lastGoldApiCallTs = 0;

const scheduleGoldApiRequest = (fn) => {
  const task = goldApiQueue.then(async () => {
    if (GOLDAPI_MIN_INTERVAL_MS > 0) {
      const now = Date.now();
      const elapsed = now - lastGoldApiCallTs;
      if (elapsed < GOLDAPI_MIN_INTERVAL_MS) {
        await delay(GOLDAPI_MIN_INTERVAL_MS - elapsed);
      }
      lastGoldApiCallTs = Date.now();
    }
    return fn();
  });
  goldApiQueue = task.catch(() => undefined);
  return task;
};

const goldApiGet = (path) => scheduleGoldApiRequest(() => goldApiClient.get(path));

const iso = (d) => new Date(d).toISOString().slice(0, 10);
const toNumber = (value, fallback = NaN) => {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const spotCache = {
  payload: null,
  expiresAt: 0,
  promise: null,
};

const historicalCache = new Map();
const historicalCacheKey = (from, to) => `${from}::${to}`;

function normalizeOhlc(row, defaults = {}) {
  const date = String(row?.date || defaults.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const openRaw = toNumber(row?.open, defaults.open);
  const closeRaw = toNumber(row?.close, defaults.close);
  const highRaw = toNumber(row?.high, defaults.high);
  const lowRaw = toNumber(row?.low, defaults.low);

  if (!Number.isFinite(openRaw) || !Number.isFinite(closeRaw)) return null;

  const highCandidates = [highRaw, openRaw, closeRaw].filter(Number.isFinite);
  const lowCandidates = [lowRaw, openRaw, closeRaw].filter(Number.isFinite);
  const high = highCandidates.length ? Math.max(...highCandidates) : Math.max(openRaw, closeRaw);
  const low = lowCandidates.length ? Math.min(...lowCandidates) : Math.min(openRaw, closeRaw);

  return {
    date,
    open: openRaw,
    high,
    low,
    close: closeRaw,
    symbol: row?.symbol || defaults.symbol || SYMBOL_INFO.pair,
  };
}

function readCsvAsMap(csvPath) {
  const map = new Map();
  if (!fs.existsSync(csvPath)) return map;
  const content = fs.readFileSync(csvPath, 'utf-8');
  if (!content.trim()) return map;
  const lines = content.trim().split(/\r?\n/);
  const startIdx = lines[0]?.toLowerCase().startsWith('date') ? 1 : 0;
  for (let i = startIdx; i < lines.length; i += 1) {
    const [date, symbol, open, high, low, close] = lines[i].split(',');
    const normalized = normalizeOhlc({ date, symbol, open, high, low, close });
    if (normalized) {
      map.set(normalized.date, normalized);
    }
  }
  return map;
}

function writeMapToCsv(map, csvPath) {
  const header = 'date,symbol,open,high,low,close';
  const rows = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  const out = [header, ...rows.map((r) => `${r.date},${r.symbol || SYMBOL_INFO.pair},${r.open},${r.high},${r.low},${r.close}`)].join('\n');
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(csvPath, `${out}\n`, 'utf-8');
  return rows;
}

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/signup', emailSignupRouter);

/**
 * GET /api/spot
 * Devuelve el precio spot en vivo consultando GoldAPI.
 * Respuesta: { price, bid, ask, ts } (USD por XAU, precios bid/ask y timestamp en ms).
 */
app.get('/api/spot', async (req, res) => {
  if (!GOLDAPI_KEY) {
    return res.status(500).json({ ok: false, error: 'Falta GOLDAPI_KEY' });
  }

  const now = Date.now();
  if (spotCache.payload && spotCache.expiresAt > now) {
    return res.json({ ok: true, ...spotCache.payload, cached: true });
  }

  if (!spotCache.promise) {
    spotCache.promise = (async () => {
      const response = await goldApiGet(`/${SYMBOL_INFO.metal}/${SYMBOL_INFO.currency}`);
      const data = response.data || {};
      if (data?.error) throw new Error(data.error);
      const price = toNumber(data.price);
      if (!Number.isFinite(price) || price <= 0) throw new Error('Precio no válido');
      const bidRaw = toNumber(data.bid ?? data.bid_price, NaN);
      const askRaw = toNumber(data.ask ?? data.ask_price, NaN);
      const tsSec = toNumber(data.timestamp);
      const ts = Number.isFinite(tsSec) ? tsSec * 1000 : Date.now();
      const payload = {
        price,
        bid: Number.isFinite(bidRaw) && bidRaw > 0 ? bidRaw : null,
        ask: Number.isFinite(askRaw) && askRaw > 0 ? askRaw : null,
        ts,
        fetchedAt: Date.now(),
        symbol: data.symbol || SYMBOL_INFO.pair,
        currency: data.currency || SYMBOL_INFO.currency,
      };
      spotCache.payload = payload;
      spotCache.expiresAt = payload.fetchedAt + SPOT_CACHE_TTL_MS;
      return payload;
    })();
    spotCache.promise.finally(() => {
      spotCache.promise = null;
    });
  }

  try {
    const payload = await spotCache.promise;
    return res.json({ ok: true, ...payload, cached: false });
  } catch (error) {
    const detail = error?.response?.data?.error || error?.message || 'Error desconocido';
    if (spotCache.payload) {
      return res.json({
        ok: true,
        ...spotCache.payload,
        cached: true,
        stale: true,
        detail,
      });
    }
    return res.status(502).json({ ok: false, error: 'No se pudo obtener el spot', detail });
  }
});

const fetchHistoricalRange = async (from, to) => {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const rows = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const yyyymmdd = iso(cursor).replace(/-/g, '');
    try {
      const response = await goldApiGet(`/${SYMBOL_INFO.metal}/${SYMBOL_INFO.currency}/${yyyymmdd}`);
      const data = response.data || {};
      if (data?.error) throw new Error(data.error);
      const base = {
        date: iso(cursor),
        open: toNumber(data.open_price, data.price),
        high: toNumber(data.high_price, data.price),
        low: toNumber(data.low_price, data.price),
        close: toNumber(data.price ?? data.close_price, data.price),
        symbol: SYMBOL_INFO.pair,
      };
      const normalized = normalizeOhlc(base);
      if (normalized) {
        rows.push({
          date: normalized.date,
          open: normalized.open,
          high: normalized.high,
          low: normalized.low,
          close: normalized.close,
        });
      }
    } catch (error) {
      const status = error?.response?.status;
      if (status === 404 || status === 422) {
        console.warn(`GoldAPI sin datos para ${iso(cursor)} (${status})`);
        continue;
      }
      throw error;
    }
  }
  if (!rows.length) throw new Error('Datos vacíos');
  return rows;
};

/**
 * GET /api/historical?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Devuelve filas OHLC entre ambas fechas consultando GoldAPI.
 * Respuesta: { ok:true, rows:[{date,open,high,low,close}] }
 */
app.get('/api/historical', async (req, res) => {
  if (!GOLDAPI_KEY) {
    return res.status(500).json({ ok: false, error: 'Falta GOLDAPI_KEY' });
  }
  let { from, to } = req.query;
  const todayIso = iso(new Date());
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  if (!dateRegex.test(from || '') || !dateRegex.test(to || '')) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    from = to = iso(d);
  }

  if (to >= todayIso) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    to = iso(d);
  }

  if (from > to) from = to;

  const key = historicalCacheKey(from, to);
  let entry = historicalCache.get(key);
  const now = Date.now();

  if (entry?.payload && entry.expiresAt > now) {
    return res.json({ ok: true, rows: entry.payload.rows, cached: true });
  }

  if (!entry) {
    entry = { payload: null, expiresAt: 0, promise: null };
    historicalCache.set(key, entry);
  }

  if (!entry.promise) {
    entry.promise = (async () => {
      const rows = await fetchHistoricalRange(from, to);
      const payload = { rows, fetchedAt: Date.now() };
      entry.payload = payload;
      entry.expiresAt = payload.fetchedAt + HISTORICAL_CACHE_TTL_MS;
      return payload;
    })();
    entry.promise.finally(() => {
      entry.promise = null;
    });
  }

  try {
    const payload = await entry.promise;
    return res.json({ ok: true, rows: payload.rows, cached: false });
  } catch (error) {
    const detail = error?.response?.data?.error || error?.message || 'Error desconocido';
    if (entry.payload) {
      return res.json({
        ok: true,
        rows: entry.payload.rows,
        cached: true,
        stale: true,
        detail,
      });
    }
    return res.status(502).json({ ok: false, error: 'Error en histórico', detail });
  }
});

/**
 * POST /api/update-csv
 * Recibe un array de filas OHLC en el body y las fusiona con el CSV local.
 * Body: [{date, open, high, low, close}]
 */
app.post('/api/update-csv', async (req, res) => {
  const incoming = Array.isArray(req.body) ? req.body : [];
  if (!incoming.length) {
    return res.status(400).json({ ok: false, error: 'Cuerpo inválido' });
  }

  const csvPath = CSV_PATH;
  const map = readCsvAsMap(csvPath);

  let changes = 0;
  for (const rawRow of incoming) {
    const normalized = normalizeOhlc({
      date: rawRow?.date,
      open: rawRow?.open,
      high: rawRow?.high,
      low: rawRow?.low,
      close: rawRow?.close,
      symbol: rawRow?.symbol,
    });
    if (!normalized) continue;
    const prev = map.get(normalized.date);
    if (!prev || prev.open !== normalized.open || prev.high !== normalized.high || prev.low !== normalized.low || prev.close !== normalized.close) {
      changes += 1;
    }
    map.set(normalized.date, { ...prev, ...normalized, symbol: normalized.symbol || prev?.symbol || SYMBOL_INFO.pair });
  }

  if (!map.size) {
    return res.status(400).json({ ok: false, error: 'Sin datos válidos para guardar' });
  }

  try {
    const rows = writeMapToCsv(map, csvPath);
    const last = rows[rows.length - 1];
    res.json({ ok: true, updated: changes, totalRows: rows.length, lastDate: last?.date || null });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Error al escribir CSV', detail: error?.message || String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor de KleverGold escuchando en http://localhost:${PORT}`);
});
