// netlify/functions/update-csv.js
// Serverless para MERGEAR nuevas filas OHLC en un CSV del repo (GitHub Contents API)

const encoder = (s) => Buffer.from(s, 'utf8').toString('base64');
const decoder = (b64) => Buffer.from(b64, 'base64').toString('utf8');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS, POST',
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS, body: '' };
    }
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
    }

    // --- ENV obligatorios/útiles ---
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const REPO_OWNER   = process.env.REPO_OWNER   || 'cancoretamero';
    const REPO_NAME    = process.env.REPO_NAME    || 'KleverGold';
    const CSV_PATH     = process.env.CSV_PATH     || 'public/data/xauusd_ohlc_clean.csv';
    const CSV_BRANCH   = process.env.CSV_BRANCH   || 'main';

    if (!GITHUB_TOKEN) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok:false, error:'Falta GITHUB_TOKEN en variables de entorno' }) };
    }

    // --- Payload esperado: [{ date:'YYYY-MM-DD', open, high, low, close }, ...]
    let rowsNew = [];
    try {
      rowsNew = JSON.parse(event.body || '[]');
      if (!Array.isArray(rowsNew)) throw new Error('Body debe ser array');
    } catch (e) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok:false, error:'JSON inválido' }) };
    }

    // Normaliza/valida entradas
    const norm = (r) => {
      const d = String(r.date || '').slice(0,10);
      const open  = Number(r.open);
      const high  = Number(r.high);
      const low   = Number(r.low);
      const close = Number(r.close);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
      if (![open,high,low,close].every(Number.isFinite)) return null;
      // sanity high/low
      const hi = Math.max(high, open, close);
      const lo = Math.min(low, open, close);
      return { date:d, open, high:hi, low:lo, close };
    };
    rowsNew = rowsNew.map(norm).filter(Boolean);
    if (!rowsNew.length) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok:false, error:'Sin filas válidas' }) };
    }

    // --- Lee CSV actual de GitHub
    const apiBase = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(CSV_PATH)}`;
    const getRes = await fetch(`${apiBase}?ref=${encodeURIComponent(CSV_BRANCH)}`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'klevergold-bot' }
    });

    let currentCsv = 'date,open,high,low,close\n';
    let currentSha = undefined;

    if (getRes.status === 200) {
      const j = await getRes.json();
      currentCsv = decoder(j.content || '');
      currentSha = j.sha;
    } else if (getRes.status === 404) {
      // No existe el archivo: lo crearemos
      currentCsv = 'date,open,high,low,close\n';
    } else {
      const text = await getRes.text();
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ ok:false, error:`GET CSV fallo ${getRes.status}: ${text}` }) };
    }

    // --- Parse CSV existente a mapa por fecha
    const lines = currentCsv.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const header = (lines[0] || '').toLowerCase();
    const idxStart = header.startsWith('date,') ? 1 : 0; // tolera CSV sin cabecera
    const map = new Map(); // date -> {date,open,high,low,close}

    const parseNum = (x) => {
      const n = Number(String(x).trim().replace(',', '.'));
      return Number.isFinite(n) ? n : NaN;
    };

    for (let i = idxStart; i < lines.length; i++) {
      const [d, o, h, l, c] = lines[i].split(',');
      if (!d) continue;
      const open  = parseNum(o);
      const high  = parseNum(h);
      const low   = parseNum(l);
      const close = parseNum(c);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      if (![open,high,low,close].every(Number.isFinite)) continue;
      const hi = Math.max(high, open, close);
      const lo = Math.min(low, open, close);
      map.set(d, { date:d, open, high:hi, low:lo, close });
    }

    // --- Mergea nuevas filas (sobrescribe por fecha)
    for (const r of rowsNew) map.set(r.date, r);

    // --- Recompone CSV ordenado
    const dates = Array.from(map.keys()).sort();
    const outLines = ['date,open,high,low,close'];
    for (const d of dates) {
      const r = map.get(d);
      outLines.push([
        r.date,
        r.open,
        r.high,
        r.low,
        r.close
      ].join(','));
    }
    const newCsv = outLines.join('\n') + '\n';

    // --- PUT a GitHub (commit)
    const putBody = {
      message: `update-csv: merge ${rowsNew.length} row(s) into ${CSV_PATH}`,
      content: encoder(newCsv),
      branch: CSV_BRANCH,
    };
    if (currentSha) putBody.sha = currentSha;

    const putRes = await fetch(apiBase, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'User-Agent': 'klevergold-bot',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putBody),
    });

    if (!putRes.ok) {
      const txt = await putRes.text();
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ ok:false, error:`PUT CSV fallo ${putRes.status}: ${txt}` }) };
    }

    const lastDate = dates[dates.length - 1] || null;
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok:true, path: CSV_PATH, branch: CSV_BRANCH, added: rowsNew.length, lastDate }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok:false, error: String(e?.message || e) }) };
  }
};
