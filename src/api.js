// src/api.js — helpers para consumir el backend Express

import { CONFIG } from './config.js';

const BACKEND_BASE = CONFIG.BACKEND_BASE || '';

const backendBaseUrl = (() => {
  if (!BACKEND_BASE) return null;
  try {
    const normalized = BACKEND_BASE.endsWith('/') ? BACKEND_BASE : `${BACKEND_BASE}/`;
    return new URL(normalized);
  } catch (e) {
    console.warn('VITE_BACKEND_BASE inválido, usando mismo origen', e);
    return null;
  }
})();

const withBase = (path) => {
  const relative = path.startsWith('/') ? path.slice(1) : path;
  if (!backendBaseUrl) return relative ? `/${relative}` : '/';
  return new URL(relative, backendBaseUrl).toString();
};

export async function fetchMissingDaysSequential(dates = []) {
  const sorted = Array.from(new Set(dates)).sort();
  const chunks = packIntoRanges(sorted);
  const all = [];
  for (const [from, to] of chunks) {
    const rows = await getRangeFromServer(from, to);
    all.push(...rows);
  }
  return dedupeByDate(all);
}

export async function fetchMissingDaysOptimized(dates = []) {
  const sorted = Array.from(new Set(dates)).sort();
  const chunks = packIntoRanges(sorted);
  const parts = await Promise.all(chunks.map(([from, to]) => getRangeFromServer(from, to)));
  return dedupeByDate(parts.flat());
}

export async function persistRowsToRepo(rows = []) {
  if (!rows.length) return { ok: true, updated: 0 };
  const payload = rows
    .map((r) => ({
      date: toIso(r.date),
      open: num(r.open),
      high: num(r.high),
      low: num(r.low),
      close: num(r.close),
    }))
    .filter((r) => r.date && [r.open, r.high, r.low, r.close].every(Number.isFinite));

  if (!payload.length) {
    throw new Error('Sin filas válidas para guardar');
  }

  const res = await fetch(withBase('/api/update-csv'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    const msg = json?.error || `HTTP ${res.status}`;
    throw new Error(`update-csv fallo: ${msg}`);
  }
  return json;
}

export async function fetchSpotPrice() {
  const res = await fetch(withBase('/api/spot'), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const msg = json?.detail || json?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const price = num(json.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Precio inválido');
  const bid = num(json.bid);
  const ask = num(json.ask);
  const tsValue = Number(json.ts);
  const ts = Number.isFinite(tsValue) ? new Date(tsValue) : new Date();
  return {
    price,
    bid: Number.isFinite(bid) && bid > 0 ? bid : null,
    ask: Number.isFinite(ask) && ask > 0 ? ask : null,
    ts,
    symbol: typeof json.symbol === 'string' && json.symbol ? json.symbol : null,
    currency: typeof json.currency === 'string' && json.currency ? json.currency : null,
  };
}

export async function createEmailSignup(payload = {}) {
  const body = {
    fullName: typeof payload.fullName === 'string' ? payload.fullName.trim() : '',
    email: typeof payload.email === 'string' ? payload.email.trim() : '',
    password: typeof payload.password === 'string' ? payload.password : '',
    referralCode:
      typeof payload.referralCode === 'string' && payload.referralCode.trim()
        ? payload.referralCode.trim()
        : undefined,
  };

  const res = await fetch(withBase('/api/signup/email'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const msg = json?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return { id: json.id };
}

// ===== Helpers =====
function packIntoRanges(dates) {
  if (!dates.length) return [];
  const toDate = (s) => new Date(`${s}T00:00:00Z`);
  const addDay = (d) => {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + 1);
    return x;
  };
  const fmt = (d) => d.toISOString().slice(0, 10);

  const ranges = [];
  let start = toDate(dates[0]);
  let prev = toDate(dates[0]);
  for (let i = 1; i < dates.length; i += 1) {
    const cur = toDate(dates[i]);
    if (+cur - +addDay(prev) > 0) {
      ranges.push([fmt(start), fmt(prev)]);
      start = cur;
    }
    prev = cur;
  }
  ranges.push([fmt(start), fmt(prev)]);
  return ranges;
}

async function getRangeFromServer(from, to) {
  const qs = new URLSearchParams({ from, to });
  const res = await fetch(`${withBase('/api/historical')}?${qs.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const msg = json?.detail || json?.error || `HTTP ${res.status}`;
    throw new Error(`historical fallo: ${msg}`);
  }
  return (json.rows || [])
    .map((r) => {
      const d = new Date(`${String(r.date).slice(0, 10)}T00:00:00Z`);
      const open = num(r.open);
      const high = num(r.high);
      const low = num(r.low);
      const close = num(r.close);
      if (![open, high, low, close].every(Number.isFinite)) return null;
      return {
        date: d,
        open,
        high,
        low,
        close,
        range: Math.abs(high - low),
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
      };
    })
    .filter(Boolean);
}

function dedupeByDate(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
    m.set(k, r);
  }
  return Array.from(m.values()).sort((a, b) => +a.date - +b.date);
}

function toIso(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const str = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : null;
}

function num(x) {
  const s = String(x ?? '').trim();
  if (!s) return NaN;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
