// server/index.js
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Configuración por variables de entorno
const PORT = process.env.PORT || 8080;
const GOLDAPI_KEY  = process.env.GOLDAPI_KEY  || ''; // por ejemplo goldapi-goo8sm5s2xwpc-io
const GOLDAPI_BASE = process.env.GOLDAPI_BASE || 'https://www.goldapi.io/api';
const SYMBOL       = process.env.SYMBOL       || 'XAUUSD'; // par metal-divisa por defecto
const CSV_PATH     = process.env.CSV_PATH     || path.join('public', 'data', 'xauusd_ohlc_clean.csv');

const app = express();
app.use(cors());
app.use(express.json());

/**
 * GET /api/spot
 * Devuelve el precio spot en vivo consultando GoldAPI.
 * Respuesta: { price, ts } (USD por XAU y timestamp en ms).
 */
app.get('/api/spot', async (req, res) => {
  if (!GOLDAPI_KEY) {
    return res.status(500).json({ ok: false, error: 'Falta GOLDAPI_KEY' });
  }
  try {
    const url = `${GOLDAPI_BASE}/${SYMBOL.slice(0, -3)}/${SYMBOL.slice(-3)}`;
    const r = await axios.get(url, {
      headers: { 'x-access-token': GOLDAPI_KEY },
    });
    const data = r.data;
    const price = Number(data.price);
    const ts    = data.timestamp ? Number(data.timestamp) * 1000 : Date.now();
    if (!Number.isFinite(price)) throw new Error('Precio no válido');
    res.json({ ok: true, price, ts });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'No se pudo obtener el spot', detail: e.message });
  }
});

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
  const todayIso = new Date().toISOString().slice(0, 10);
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  // Validación básica y ajuste de fechas
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    from = to = d.toISOString().slice(0,10);
  }
  if (to >= todayIso) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    to = d.toISOString().slice(0,10);
  }
  if (from > to) from = to;

  // Iterar día a día
  try {
    const start = new Date(`${from}T00:00:00Z`);
    const end   = new Date(`${to}T00:00:00Z`);
    const rows = [];
    for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const yyyymmdd = d.toISOString().slice(0,10).replace(/-/g,'');
      const url = `${GOLDAPI_BASE}/${SYMBOL.slice(0, -3)}/${SYMBOL.slice(-3)}/${yyyymmdd}`;
      const r = await axios.get(url, {
        headers: { 'x-access-token': GOLDAPI_KEY },
      });
      const j = r.data;
      if (j && Number.isFinite(j.price)) {
        const { open_price, high_price, low_price, price } = j;
        rows.push({
          date: d.toISOString().slice(0,10),
          open: Number(open_price),
          high: Number(high_price),
          low:  Number(low_price),
          close: Number(price),
        });
      }
    }
    if (!rows.length) throw new Error('Datos vacíos');
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'Error en histórico', detail: e.message });
  }
});

/**
 * POST /api/update-csv
 * Recibe un array de filas OHLC en el body y las fusiona con el CSV local.
 * Body: [{date, open, high, low, close}]
 */
app.post('/api/update-csv', async (req, res) => {
  const incoming = req.body;
  if (!Array.isArray(incoming) || !incoming.length) {
    return res.status(400).json({ ok: false, error: 'Cuerpo inválido' });
  }

  // Leer CSV actual
  const csvPath = path.resolve(CSV_PATH);
  let content = '';
  try {
    content = fs.readFileSync(csvPath, 'utf-8');
  } catch {
    content = '';
  }

  // Construir mapa con filas existentes
  const map = new Map();
  if (content.trim()) {
    const lines = content.trim().split(/\r?\n/);
    // Ignorar cabecera
    for (let i = 1; i < lines.length; i++) {
      const [date, symbol, open, high, low, close] = lines[i].split(',');
      map.set(date, { date, symbol, open: Number(open), high: Number(high), low: Number(low), close: Number(close) });
    }
  }

  // Añadir las nuevas filas, reemplazando si existe misma fecha
  for (const r of incoming) {
    const d = String(r.date).slice(0,10);
    map.set(d, {
      date: d,
      symbol: SYMBOL,
      open: Number(r.open),
      high: Number(r.high),
      low:  Number(r.low),
      close: Number(r.close),
    });
  }

  // Ordenar y reconstruir CSV
  const rows = Array.from(map.values()).sort((a,b) => a.date.localeCompare(b.date));
  const header = 'date,symbol,open,high,low,close';
  const out    = [header, ...rows.map(r => `${r.date},${r.symbol},${r.open},${r.high},${r.low},${r.close}`)].join('\n') + '\n';

  try {
    fs.writeFileSync(csvPath, out, 'utf-8');
    res.json({ ok: true, added: incoming.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Error al escribir CSV', detail: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor de KleverGold escuchando en http://localhost:${PORT}`);
});
