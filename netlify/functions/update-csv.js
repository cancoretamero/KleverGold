// netlify/functions/update-csv.js
export const config = { runtime: 'nodejs18' };

const CSV_PATH   = process.env.CSV_PATH || 'data/xauusd_ohlc_clean.csv';
const GITHUB_REPO = process.env.GITHUB_REPO; // "owner/repo"
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GH = 'https://api.github.com';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Use POST' });
    }
    const token = process.env.GITHUB_TOKEN;
    if (!token) return res.status(500).json({ error: 'Missing GITHUB_TOKEN' });
    if (!GITHUB_REPO) return res.status(500).json({ error: 'Missing GITHUB_REPO (owner/repo)' });

    const rowsNew = await readJson(req);
    if (!Array.isArray(rowsNew) || rowsNew.length === 0) {
      return res.status(200).json({ ok: true, updated: 0, reason: 'no rows' });
    }

    const [owner, repo] = GITHUB_REPO.split('/');
    // 1) Leer CSV actual
    const getResp = await fetch(`${GH}/repos/${owner}/${repo}/contents/${encodeURIComponent(CSV_PATH)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'netlify-fn' }
    });
    if (!getResp.ok) {
      const t = await getResp.text();
      return res.status(500).json({ error: 'GET content failed', detail: t });
    }
    const getJson = await getResp.json();
    const sha = getJson.sha;
    const csvBase64 = getJson.content;
    const csvText = Buffer.from(csvBase64, 'base64').toString('utf-8');

    // 2) Parse y merge por fecha (YYYY-MM-DD)
    const current = csvToMap(csvText); // Map<string, Row>
    let updated = 0;
    for (const r of rowsNew) {
      const k = toISO(r?.date);
      if (!k) continue;
      const row = sanitizeRow(r);
      if (!row) continue;
      // sobrescribe si es nuevo o si trae mejor info
      const ex = current.get(k);
      if (!ex || needsUpdate(ex, row)) {
        current.set(k, row);
        updated++;
      }
    }
    if (updated === 0) {
      return res.status(200).json({ ok: true, updated: 0 });
    }

    // 3) Re-escribir CSV
    const newCsv = mapToCsv(current);
    const newContent = Buffer.from(newCsv, 'utf-8').toString('base64');

    // 4) PUT commit
    const putResp = await fetch(`${GH}/repos/${owner}/${repo}/contents/${encodeURIComponent(CSV_PATH)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'netlify-fn', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `chore: append OHLC ${updated} rows via Netlify fn`,
        content: newContent,
        sha,
        branch: GITHUB_BRANCH,
      })
    });
    if (!putResp.ok) {
      const t = await putResp.text();
      return res.status(500).json({ error: 'PUT content failed', detail: t });
    }
    return res.status(200).json({ ok: true, updated });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function readJson(req) {
  try {
    const txt = await getRawBody(req);
    return JSON.parse(txt);
  } catch { return []; }
}
function getRawBody(req){ return new Promise((resolve)=>{ let b=''; req.on('data',c=>b+=c); req.on('end',()=>resolve(b)); }); }

function toISO(d){
  try { const dt = (d instanceof Date) ? d : new Date(d); return dt.toISOString().slice(0,10); } catch { return null; }
}
function sanitizeRow(r){
  const k = toISO(r?.date); if(!k) return null;
  const open  = num(r.open), high=num(r.high), low=num(r.low), close=num(r.close);
  if (![open,high,low,close].every(Number.isFinite)) return null;
  return { date:k, open, high, low, close };
}
function num(x){ const n=Number(x); return Number.isFinite(n)? n : NaN; }

function csvToMap(text){
  const m = new Map(); // key=date -> row
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift();
  for (const line of lines) {
    const [date, open, high, low, close] = line.split(',');
    const r = sanitizeRow({ date, open, high, low, close });
    if (r) m.set(r.date, r);
  }
  return m;
}
function mapToCsv(m){
  const rows = Array.from(m.values()).sort((a,b)=> a.date.localeCompare(b.date));
  const lines = ['date,open,high,low,close', ...rows.map(r => `${r.date},${r.open},${r.high},${r.low},${r.close}`)];
  return lines.join('\n') + '\n';
}
function needsUpdate(ex, row){
  // sobrescribe si el nuevo tiene valores válidos donde el anterior no, o si difiere
  return (!isFinite(ex.open) || !isFinite(ex.high) || !isFinite(ex.low) || !isFinite(ex.close)) ||
         (ex.open!==row.open || ex.high!==row.high || ex.low!==row.low || ex.close!==row.close);
}
