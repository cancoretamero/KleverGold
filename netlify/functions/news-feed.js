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
    site: 'https://www.federalreserve.gov',
    logo: 'https://logo.clearbit.com/federalreserve.gov',
    category: 'Política monetaria',
  },
  {
    id: 'bls',
    name: 'Bureau of Labor Statistics',
    url: 'https://www.bls.gov/feed/news_release.rss',
    site: 'https://www.bls.gov',
    logo: 'https://logo.clearbit.com/bls.gov',
    category: 'Mercado laboral',
  },
  {
    id: 'bea',
    name: 'Bureau of Economic Analysis',
    url: 'https://apps.bea.gov/rss/rss.xml?feed=gdp',
    site: 'https://www.bea.gov',
    logo: 'https://logo.clearbit.com/bea.gov',
    category: 'Crecimiento',
  },
  {
    id: 'treasury',
    name: 'U.S. Treasury',
    url: 'https://home.treasury.gov/news/press-releases/feed',
    site: 'https://home.treasury.gov',
    logo: 'https://logo.clearbit.com/treasury.gov',
    category: 'Deuda pública',
  },
  {
    id: 'worldbank',
    name: 'World Bank',
    url: 'https://www.worldbank.org/en/news/all?format=rss',
    site: 'https://www.worldbank.org',
    logo: 'https://logo.clearbit.com/worldbank.org',
    category: 'Desarrollo global',
  },
  {
    id: 'imf',
    name: 'IMF Blog',
    url: 'https://blogs.imf.org/feed/',
    site: 'https://www.imf.org',
    logo: 'https://logo.clearbit.com/imf.org',
    category: 'Macro global',
  },
  {
    id: 'marketwatch',
    name: 'MarketWatch Commodities',
    url: 'https://feeds.marketwatch.com/marketwatch/commodities',
    site: 'https://www.marketwatch.com/markets/commodities',
    logo: 'https://logo.clearbit.com/marketwatch.com',
    category: 'Mercados',
  },
  {
    id: 'reuters',
    name: 'Reuters Commodities',
    url: 'https://feeds.reuters.com/reuters/commoditiesNews',
    site: 'https://www.reuters.com/markets/commodities',
    logo: 'https://logo.clearbit.com/reuters.com',
    category: 'Cobertura global',
  },
  {
    id: 'kitco',
    name: 'Kitco Metals',
    url: 'https://www.kitco.com/rss/metals.xml',
    site: 'https://www.kitco.com',
    logo: 'https://logo.clearbit.com/kitco.com',
    category: 'Metales preciosos',
  },
  {
    id: 'mining',
    name: 'MINING.com',
    url: 'https://www.mining.com/feed/',
    site: 'https://www.mining.com',
    logo: 'https://logo.clearbit.com/mining.com',
    category: 'Minería',
  },
  {
    id: 'cftc',
    name: 'CFTC Press',
    url: 'https://www.cftc.gov/PressRoom/PressReleases/rss',
    site: 'https://www.cftc.gov',
    logo: 'https://logo.clearbit.com/cftc.gov',
    category: 'Regulación',
  },
  {
    id: 'bis',
    name: 'Bank for International Settlements',
    url: 'https://www.bis.org/rss/press.xml',
    site: 'https://www.bis.org',
    logo: 'https://logo.clearbit.com/bis.org',
    category: 'Supervisión',
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
        failures.push({ source: src.id, name: src.name, error: err.message || String(err) });
      }
    })
  );

  if (!aggregated.length) {
    //return H.json(502, { ok: false, error: 'Sin datos disponibles', failures });
    return H.json(200, { items: [], failures });
  }

  const map = new Map();
  for (const item of aggregated) {
    const key = `${item.sourceId}:${(item.link || item.title || '').toLowerCase()}`;
    if (!key) continue;
    if (!map.has(key)) map.set(key, item);
  }

  const nowMs = Date.now();
  const horizonMs = nowMs - 1000 * 60 * 60 * 24 * 14; // 14 días hacia atrás.

  const list = Array.from(map.values())
    .filter((item) => !item.publishedAtMs || item.publishedAtMs >= horizonMs)
    .sort((a, b) => (b.publishedAtMs || 0) - (a.publishedAtMs || 0))
    .slice(0, 60);

  //return H.json(200, { ok: true, items: list, failures });
  return H.json(200, { items: list, failures });
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
  return buildItem({ title, link, dateRaw, summary, src, entry });
}

function mapAtomEntry(entry, src) {
  if (!entry) return null;
  const title = textOf(entry.title);
  const link = pickLink(entry);
  const dateRaw = textOf(entry.updated) || textOf(entry.published) || textOf(entry.created);
  const summary = textOf(entry.summary) || textOf(entry.content) || '';
  return buildItem({ title, link, dateRaw, summary, src, entry });
}

function buildItem({ title, link, dateRaw, summary, src, entry }) {
  if (!title) return null;
  const cleanSummary = summarize(summary, title);
  const idBase = link || `${src.id}:${title}`;
  const id = crypto.createHash('sha1').update(idBase).digest('hex');
  const { displayDate, timestamp, isoDate } = normalizeDate(dateRaw);
  const imageHint = extractImage(entry, summary);
  return {
    id,
    title: title.trim(),
    link: link || '',
    publishedAt: displayDate,
    publishedAtIso: isoDate,
    publishedAtMs: timestamp,
    source: src.name,
    sourceId: src.id,
    sourceLogo: src.logo || '',
    sourceCategory: src.category || 'General',
    sourceSite: src.site || '',
    summaryHint: cleanSummary,
    imageHint,
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
  const fallback = new Date();
  if (!dateRaw) {
    return formatDateParts(fallback);
  }
  const trimmed = String(dateRaw).trim();
  let parsed = null;
  if (dateRegex.test(trimmed)) {
    const match = trimmed.match(dateRegex);
    if (match && match[1]) {
      const candidate = new Date(match[1]);
      if (Number.isFinite(+candidate)) parsed = candidate;
    }
  }
  if (!parsed) {
    const candidate = new Date(trimmed);
    if (Number.isFinite(+candidate)) parsed = candidate;
  }
  if (!parsed) {
    const candidate = new Date(Number(trimmed));
    if (Number.isFinite(+candidate)) parsed = candidate;
  }
  if (!parsed) parsed = fallback;
  return formatDateParts(parsed);
}

function formatDateParts(date) {
  const iso = date.toISOString();
  return {
    displayDate: iso.slice(0, 10),
    timestamp: date.getTime(),
    isoDate: iso,
  };
}

function extractImage(entry, summary) {
  if (!entry) return '';
  const candidates = [];
  const enqueue = (value) => {
    if (typeof value === 'string' && isLikelyImageUrl(value)) candidates.push(value);
  };

  const walkNode = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach((sub) => walkNode(sub));
      return;
    }
    if (typeof node === 'object') {
      if (node.url) enqueue(node.url);
      if (node.href) enqueue(node.href);
      if (node.link) enqueue(node.link);
      if (node['@_url']) enqueue(node['@_url']);
      if (node['@_href']) enqueue(node['@_href']);
      Object.keys(node).forEach((key) => {
        if (typeof node[key] === 'object') walkNode(node[key]);
      });
    } else if (typeof node === 'string') {
      enqueue(node);
    }
  };

  walkNode(entry.enclosure);
  walkNode(entry['media:content']);
  walkNode(entry['media:thumbnail']);
  walkNode(entry['media:group']);
  walkNode(entry.image);

  const fromContent = extractImageFromHtml(entry['content:encoded'] || entry.content);
  if (fromContent) enqueue(fromContent);
  const fromSummary = extractImageFromHtml(summary);
  if (fromSummary) enqueue(fromSummary);

  return candidates.find(Boolean) || '';
}

function isLikelyImageUrl(value) {
  if (!value || typeof value !== 'string') return false;
  if (!/^https?:\/\//i.test(value)) return false;
  const clean = value.split('?')[0];
  if (/\.(jpe?g|png|webp|gif|avif)$/i.test(clean)) return true;
  return clean.includes('wp-content') || clean.includes('/media/') || clean.includes('cdn');
}

function extractImageFromHtml(html) {
  if (!html) return '';
  const match = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match && match[1]) {
    const src = match[1].trim();
    return isLikelyImageUrl(src) ? src : '';
  }
  return '';
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

