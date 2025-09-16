// netlify/functions/news-feed.js
// Recolector de titulares públicos relevantes para XAU/USD.
// Combina feeds abiertos (dominio público u open) y devuelve metadatos JSON.
// Licencia: MIT (sin dependencias copyleft).

const { XMLParser } = require('fast-xml-parser');
const crypto = require('crypto');

const H = {
  json(status, data) {
    return {
      statusCode: status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(data),
    };
  },
  cors204() {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
      },
      body: '',
    };
  },
};

const SOURCES = [
  {
    id: 'fed',
    name: 'Federal Reserve',
    url: 'https://www.federalreserve.gov/feeds/press_all.xml',
  },
  {
    id: 'bls',
    name: 'Bureau of Labor Statistics',
    url: 'https://www.bls.gov/feed/news_release.rss',
  },
  {
    id: 'bea',
    name: 'Bureau of Economic Analysis',
    url: 'https://apps.bea.gov/rss/rss.xml?feed=gdp',
  },
  {
    id: 'treasury',
    name: 'U.S. Treasury',
    url: 'https://home.treasury.gov/news/press-releases/feed',
  },
  {
    id: 'worldbank',
    name: 'World Bank',
    url: 'https://www.worldbank.org/en/news/all?format=rss',
  },
  {
    id: 'imf',
    name: 'IMF Blog',
    url: 'https://blogs.imf.org/feed/',
  },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'text',
  trimValues: true,
});

const dateRegex = /(\d{4}-\d{2}-\d{2})/;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return H.cors204();
  if (event.httpMethod !== 'GET') return H.json(405, { ok: false, error: 'Method Not Allowed' });

  const aggregated = [];
  const failures = [];

  await Promise.all(
    SOURCES.map(async (src) => {
      try {
        const res = await fetch(src.url, {
          headers: {
            'User-Agent': 'KleverGold/1.0 (+https://klevergold.example)',
            Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const doc = parser.parse(xml);
        const items = normalizeItems(doc, src);
        for (const item of items) aggregated.push(item);
      } catch (err) {
        failures.push({ source: src.id, error: err.message || String(err) });
      }
    })
  );

  if (!aggregated.length) {
    return H.json(502, { ok: false, error: 'Sin datos disponibles', failures });
  }

  const map = new Map();
  for (const item of aggregated) {
    const key = (item.link || item.title || '').toLowerCase();
    if (!key) continue;
    if (!map.has(key)) map.set(key, item);
  }

  const list = Array.from(map.values())
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .slice(0, 40);

  return H.json(200, { ok: true, items: list, failures });
};

function normalizeItems(doc, src) {
  if (!doc) return [];
  const items = [];

  if (doc.rss && doc.rss.channel) {
    const channel = doc.rss.channel;
    const arr = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
    for (const entry of arr) items.push(mapRssItem(entry, src));
  } else if (doc.feed && doc.feed.entry) {
    const arr = Array.isArray(doc.feed.entry) ? doc.feed.entry : [doc.feed.entry];
    for (const entry of arr) items.push(mapAtomEntry(entry, src));
  }

  return items.filter(Boolean);
}

function mapRssItem(entry, src) {
  if (!entry) return null;
  const title = textOf(entry.title);
  const link = pickLink(entry);
  const dateRaw = textOf(entry.pubDate) || textOf(entry.published) || textOf(entry.updated);
  const summary = textOf(entry.description) || textOf(entry.summary) || '';
  return buildItem({ title, link, dateRaw, summary, src });
}

function mapAtomEntry(entry, src) {
  if (!entry) return null;
  const title = textOf(entry.title);
  const link = pickLink(entry);
  const dateRaw = textOf(entry.updated) || textOf(entry.published) || textOf(entry.created);
  const summary = textOf(entry.summary) || textOf(entry.content) || '';
  return buildItem({ title, link, dateRaw, summary, src });
}

function buildItem({ title, link, dateRaw, summary, src }) {
  if (!title) return null;
  const cleanSummary = summarize(summary, title);
  const idBase = link || `${src.id}:${title}`;
  const id = crypto.createHash('sha1').update(idBase).digest('hex');
  const publishedAt = normalizeDate(dateRaw);
  return {
    id,
    title: title.trim(),
    link: link || '',
    publishedAt,
    source: src.name,
    summaryHint: cleanSummary,
  };
}

function pickLink(entry) {
  if (!entry) return '';
  if (typeof entry.link === 'string') return entry.link;
  if (Array.isArray(entry.link)) {
    const alt = entry.link.find((l) => typeof l === 'string');
    if (alt) return alt;
    const obj = entry.link.find((l) => typeof l === 'object' && l.href);
    if (obj) return obj.href;
  }
  if (entry.link && typeof entry.link === 'object') {
    if (entry.link.href) return entry.link.href;
    if (entry.link['@_href']) return entry.link['@_href'];
  }
  if (entry.guid && entry.guid.text) return entry.guid.text;
  if (entry.guid && typeof entry.guid === 'string') return entry.guid;
  return '';
}

function textOf(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (node.text) return node.text;
  if (node['#text']) return node['#text'];
  return '';
}

function normalizeDate(dateRaw) {
  if (!dateRaw) {
    return new Date().toISOString().slice(0, 10);
  }
  const trimmed = dateRaw.trim();
  if (dateRegex.test(trimmed)) {
    const match = trimmed.match(dateRegex);
    if (match) return match[1];
  }
  const d = new Date(trimmed);
  if (Number.isFinite(+d)) {
    return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function summarize(summary, title) {
  const raw = summary && summary.length > 0 ? summary : title;
  const clean = stripHtml(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  if (clean.length <= 240) return clean;
  return `${clean.slice(0, 237)}...`;
}

function stripHtml(text) {
  if (!text) return '';
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

