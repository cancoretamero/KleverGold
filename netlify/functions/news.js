const Parser = require('rss-parser');
const fetch = require('node-fetch'); // v2
const metascraper = require('metascraper')([
  require('metascraper-url')(),
  require('metascraper-image')(),
]);

const FEEDS = [
  'https://news.google.com/rss/search?q=gold%20OR%20XAUUSD&hl=en-US&gl=US&ceid=US:en',
  'https://www.kitco.com/rss/news.rss',
];

const parser = new Parser();

// --------- helpers ---------
function normalizeItem(i, sourceName) {
  const title = (i.title || '').trim();
  const url = i.link || i.url || '';
  const publishedAt = i.isoDate || i.pubDate || i.date || new Date().toISOString();
  const summary = (i.contentSnippet || i.content || i.summary || '').toString().trim();
  if (!title || !url) return null;
  return { title, url, source: sourceName || i.source || '', publishedAt, summary };
}

function recencyWeight(iso) {
  const mins = (Date.now() - new Date(iso).getTime()) / 60000;
  return Math.max(0, 1 - mins / (24 * 60));
}

function impactToNum(x='medio') {
  const v = (x || '').toLowerCase();
  if (v === 'alto' || v === 'high') return 1;
  if (v === 'medio' || v === 'medium' || v === 'moderado') return 0.6;
  return 0.25;
}

// Heurística (fallback IA) para no depender de GPU/LLM en serverless
function naiveAssess(text) {
  const t = (text || '').toLowerCase();
  let sentiment = 'neutro', impact = 'medio';
  if (/(usd|dólar|dolar).* (cae|débil|debil)/.test(t)) sentiment = 'alcista';
  if (/(usd|dólar|dolar).* (sube|fuerte|alza)/.test(t)) sentiment = 'bajista';
  if (/(fed|fomc|cpi|ipc|rendim|yield|banco central|etf)/.test(t)) impact = 'alto';
  return { impact, sentiment, confidence: 0.45, reason: 'Reglas: USD, rendimientos, Fed/CPI, ETF, bancos centrales.' };
}

async function fetchOgImage(url) {
  try {
    const html = await (await fetch(url, { timeout: 8000 })).text();
    const meta = await metascraper({ html, url });
    return meta.image || null;
  } catch { return null; }
}

// --------- handler ---------
exports.handler = async () => {
  try {
    const items = [];
    for (const url of FEEDS) {
      try {
        const feed = await parser.parseURL(url);
        const sourceName = (feed.title || '').replace('RSS', '').trim();
        for (const it of feed.items || []) {
          const norm = normalizeItem(it, sourceName);
          if (norm) items.push(norm);
        }
      } catch {}
    }
    // dedup por URL
    const seen = new Set();
    const dedup = items.filter(i => {
      const k = (i.url || '').toLowerCase();
      if (seen.has(k)) return false; seen.add(k); return true;
    });

    const out = [];
    for (const it of dedup.slice(0, 60)) {
      const ai = naiveAssess(`${it.title}. ${it.summary || ''}`);
      const rec = recencyWeight(it.publishedAt);
      const score = 0.6 * impactToNum(ai.impact) + 0.3 * rec + 0.1 * (ai.confidence || 0.5);
      const image = await fetchOgImage(it.url);
      out.push({ ...it, image, ...ai, impact_score: Number(score.toFixed(3)) });
    }

    out.sort((a,b) => b.impact_score - a.impact_score);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=60' },
      body: JSON.stringify({ items: out.slice(0, 20) }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
