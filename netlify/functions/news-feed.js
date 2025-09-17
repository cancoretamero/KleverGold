import { XMLParser } from 'fast-xml-parser';
import crypto from 'node:crypto';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { Buffer } from 'node:buffer';
import { URL as NodeURL } from 'node:url';

const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  '';

const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : null;

const FEED_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, text/html;q=0.7, */*;q=0.5',
};

const ARTICLE_HEADERS = {
  'User-Agent': FEED_HEADERS['User-Agent'],
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
};


const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: 'text',
  trimValues: true,
});

const dateRegex = /(\d{4}-\d{2}-\d{2})/;
const MAX_ITEMS = 60;
const IMAGE_FETCH_LIMIT = 18;
const IMAGE_HTML_LIMIT = 200000;
const CACHE_LIMIT = 256;

const imageCache = new Map();

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
    urls: ['https://www.federalreserve.gov/feeds/press_all.xml'],
    site: 'https://www.federalreserve.gov',
    logo: 'https://logo.clearbit.com/federalreserve.gov',
    category: 'Política monetaria',
  },
  {
    id: 'bls',
    name: 'Bureau of Labor Statistics',
    urls: ['https://www.bls.gov/feed/news_release.rss'],
    fallbackQuery: 'site:bls.gov "News Release"',
    site: 'https://www.bls.gov',
    logo: 'https://logo.clearbit.com/bls.gov',
    category: 'Mercado laboral',
  },
  {
    id: 'bea',
    name: 'Bureau of Economic Analysis',
    urls: ['https://apps.bea.gov/rss/rss.xml?feed=gdp'],
    site: 'https://www.bea.gov',
    logo: 'https://logo.clearbit.com/bea.gov',
    category: 'Crecimiento',
  },
  {
    id: 'treasury',
    name: 'U.S. Treasury',
    urls: ['https://home.treasury.gov/news/press-releases/feed', 'https://home.treasury.gov/rss/press-releases'],
    fallbackQuery: 'site:home.treasury.gov "Press Release"',
    site: 'https://home.treasury.gov',
    logo: 'https://logo.clearbit.com/treasury.gov',
    category: 'Deuda pública',
  },
  {
    id: 'worldbank',
    name: 'World Bank',
    urls: ['https://www.worldbank.org/en/news/all?format=rss'],
    site: 'https://www.worldbank.org',
    logo: 'https://logo.clearbit.com/worldbank.org',
    category: 'Desarrollo global',
  },
  {
    id: 'imf',
    name: 'IMF Blog',
    urls: ['https://blogs.imf.org/feed/'],
    site: 'https://www.imf.org',
    logo: 'https://logo.clearbit.com/imf.org',
    category: 'Macro global',
  },
  {
    id: 'marketwatch',
    name: 'MarketWatch Commodities',
    urls: ['https://www.marketwatch.com/feeds/section/commodities', 'https://feeds.marketwatch.com/marketwatch/commodities'],
    fallbackQuery: 'site:marketwatch.com commodities',
    site: 'https://www.marketwatch.com/markets/commodities',
    logo: 'https://logo.clearbit.com/marketwatch.com',
    category: 'Mercados',
  },
  {
    id: 'reuters',
    name: 'Reuters Commodities',
    urls: [
      'https://www.reuters.com/markets/commodities/rss',
      'https://www.reuters.com/rssFeed/commoditiesNews',
      'https://feeds.reuters.com/reuters/commoditiesNews',
    ],
    fallbackQuery: 'site:reuters.com (commodities OR metals OR gold)',
    site: 'https://www.reuters.com/markets/commodities',
    logo: 'https://logo.clearbit.com/reuters.com',
    category: 'Cobertura global',
  },
  {
    id: 'kitco',
    name: 'Kitco Metals',
    urls: ['https://www.kitco.com/rss/metals.xml', 'https://www.kitco.com/rss/gold.xml'],
    fallbackQuery: 'site:kitco.com gold',
    site: 'https://www.kitco.com',
    logo: 'https://logo.clearbit.com/kitco.com',
    category: 'Metales preciosos',
  },
  {
    id: 'mining',
    name: 'MINING.com',
    urls: ['https://www.mining.com/feed/', 'https://www.mining.com/category/gold/feed/'],
    fallbackQuery: 'site:mining.com (gold OR bullion)',
    site: 'https://www.mining.com',
    logo: 'https://logo.clearbit.com/mining.com',
    category: 'Minería',
  },
  {
    id: 'cftc',
    name: 'CFTC Press',
    urls: ['https://www.cftc.gov/PressRoom/PressReleases/rss'],
    fallbackQuery: 'site:cftc.gov "Press Release"',
    site: 'https://www.cftc.gov',
    logo: 'https://logo.clearbit.com/cftc.gov',
    category: 'Regulación',
  },
  {
    id: 'bis',
    name: 'Bank for International Settlements',
    urls: ['https://www.bis.org/rss/press.xml', 'https://www.bis.org/rss/index.xml'],
    fallbackQuery: 'site:bis.org press',
    site: 'https://www.bis.org',
    logo: 'https://logo.clearbit.com/bis.org',
    category: 'Supervisión',
  },
];

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return H.cors204();
  if (event.httpMethod !== 'GET') return H.json(405, { ok: false, error: 'Method Not Allowed' });

  const aggregated = [];
  const failures = [];

  await Promise.all(
    SOURCES.map(async (src) => {
      try {
        const items = await loadSource(src);
        for (const item of items) aggregated.push(item);
      } catch (err) {
        failures.push({ source: src.id, name: src.name, error: err.message || String(err) });
      }
    })
  );

  if (!aggregated.length) {
    return H.json(502, { ok: false, error: 'Sin datos disponibles', failures });
  }

  const map = new Map();
  for (const item of aggregated) {
    const key = `${item.sourceId}:${(item.link || item.title || '').toLowerCase()}`;
    if (!key) continue;
    if (!map.has(key)) map.set(key, item);
  }

  const nowMs = Date.now();
  const horizonMs = nowMs - 1000 * 60 * 60 * 24 * 14;

  const filtered = Array.from(map.values())
    .filter((item) => !item.publishedAtMs || item.publishedAtMs >= horizonMs)
    .sort((a, b) => (b.publishedAtMs || 0) - (a.publishedAtMs || 0));

  const perSourceCap = 8;
  const grouped = new Map();
  for (const item of filtered) {
    const key = item.sourceId || 'unknown';
    const bucket = grouped.get(key);
    if (bucket) bucket.push(item);
    else grouped.set(key, [item]);
  }

  const buckets = Array.from(grouped.values())
    .map((items) => items.slice(0, perSourceCap))
    .filter((arr) => arr.length > 0)
    .sort((a, b) => (b[0]?.publishedAtMs || 0) - (a[0]?.publishedAtMs || 0));

  const staged = [];
  for (let index = 0; staged.length < MAX_ITEMS; index += 1) {
    let appended = false;
    for (const bucket of buckets) {
      if (bucket[index]) {
        staged.push(bucket[index]);
        appended = true;
        if (staged.length >= MAX_ITEMS) break;
      }
    }
    if (!appended) break;
  }

  const list = staged.sort((a, b) => (b.publishedAtMs || 0) - (a.publishedAtMs || 0));

  await enrichImages(list);

  return H.json(200, { ok: true, items: list, failures });
};

async function loadSource(src) {
  const urls = Array.isArray(src.urls) && src.urls.length ? src.urls : src.url ? [src.url] : [];
  const errors = [];

  for (const url of urls) {
    try {
      const { data } = await requestText(url, 'feed');
      if (!data) throw new Error('Respuesta vacía');
      const doc = parser.parse(data);
      const items = normalizeItems(doc, src);
      if (items.length) return items;
      errors.push(`${shorten(url)} sin ítems`);
    } catch (err) {
      errors.push(`${shorten(url)} ${err.message || err}`);
    }
  }

  if (src.fallbackQuery) {
    try {
      const fallbackUrl = buildGoogleNewsUrl(src.fallbackQuery);
      const { data } = await requestText(fallbackUrl, 'feed');
      if (data) {
        const doc = parser.parse(data);
        const items = normalizeItems(doc, src);
        if (items.length) return items;
      }
      errors.push('Fallback Google sin ítems');
    } catch (err) {
      errors.push(`Fallback Google ${err.message || err}`);
    }
  }

  throw new Error(errors.join(' | '));
}

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
  const link = normalizeLink(pickLink(entry));
  const dateRaw = textOf(entry.pubDate) || textOf(entry.published) || textOf(entry.updated);
  const summary = textOf(entry.description) || textOf(entry.summary) || '';
  return buildItem({ title, link, dateRaw, summary, src, entry });
}

function mapAtomEntry(entry, src) {
  if (!entry) return null;
  const title = textOf(entry.title);
  const link = normalizeLink(pickLink(entry));
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
  const imageHint = extractImage(entry, summary, link || src.site || '');
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
    const obj = entry.link.find((l) => typeof l === 'object' && (l.href || l.url || l.text));
    if (obj) return obj.href || obj.url || obj.text || '';
  }
  if (entry.link && typeof entry.link === 'object') {
    if (entry.link.href) return entry.link.href;
    if (entry.link.url) return entry.link.url;
    if (entry.link['@_href']) return entry.link['@_href'];
  }
  if (entry.guid && entry.guid.text) return entry.guid.text;
  if (entry.guid && typeof entry.guid === 'string') return entry.guid;
  return '';
}

function normalizeLink(link) {
  if (!link) return '';
  let trimmed = String(link).trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('//')) trimmed = `https:${trimmed}`;

  try {
    const url = new NodeURL(trimmed);
    if (url.hostname === 'news.google.com') {
      const direct = url.searchParams.get('url') || url.searchParams.get('u');
      if (direct) return normalizeLink(decodeURIComponentSafe(direct));
      const segments = url.pathname.split('/');
      const last = segments[segments.length - 1];
      if (last) {
        const base64Candidate = last.split('?')[0];
        const decoded = decodeGoogleBase64(base64Candidate);
        if (decoded) return normalizeLink(decoded);
      }
    }
    if (/^https?:$/i.test(url.protocol)) return url.toString();
    return '';
  } catch {
    const decoded = decodeURIComponentSafe(trimmed);
    if (decoded !== trimmed) return normalizeLink(decoded);
    return '';
  }
}

function decodeGoogleBase64(value) {
  if (!value) return '';
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const buf = Buffer.from(padded, 'base64');
    const text = buf.toString('utf8');
    if (/^https?:\/\//i.test(text)) return text;
  } catch {}
  return '';
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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

function extractImage(entry, summary, baseUrl) {
  if (!entry) return '';
  const candidates = [];
  const enqueue = (value) => {
    const absolute = absolutizeUrl(value, baseUrl);
    if (isLikelyImageUrl(absolute)) candidates.push(absolute);
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
      if (node['@_src']) enqueue(node['@_src']);
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

  const fromContent = extractImageFromHtml(entry['content:encoded'] || entry.content, baseUrl);
  if (fromContent) enqueue(fromContent);
  const fromSummary = extractImageFromHtml(summary, baseUrl);
  if (fromSummary) enqueue(fromSummary);

  return candidates.find(Boolean) || '';
}

function extractImageFromHtml(html, baseUrl) {
  if (!html) return '';
  const str = String(html);
  const imgMatch = str.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && imgMatch[1]) {
    const abs = absolutizeUrl(imgMatch[1].trim(), baseUrl);
    return isLikelyImageUrl(abs) ? abs : '';
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

async function requestText(url, type = 'feed') {
  if (!url) return { data: '', finalUrl: '' };
  const headers = type === 'article' ? ARTICLE_HEADERS : FEED_HEADERS;
  try {
    const res = await undiciFetch(url, {
      method: 'GET',
      headers,
      redirect: 'follow',
      dispatcher: proxyAgent ?? undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (typeof text !== 'string') throw new Error('Respuesta inválida');
    return { data: text, finalUrl: res.url || url };
  } catch (err) {
    if (err instanceof Error) {
      const causeCode = typeof err.cause === 'object' && err.cause && 'code' in err.cause ? err.cause.code : null;
      if (causeCode) throw new Error(String(causeCode));
      if ('code' in err && err.code) throw new Error(String(err.code));
      throw err;
    }
    throw new Error(String(err));
  }
}

function buildGoogleNewsUrl(query, days = 14) {
  const base = (query || '').trim();
  const parts = [base];
  if (!/when:\d+d/i.test(base)) parts.push(`when:${days}d`);
  const q = encodeURIComponent(parts.filter(Boolean).join(' '));
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

function shorten(url) {
  if (!url) return '';
  if (url.length <= 96) return url;
  return `${url.slice(0, 93)}...`;
}

function absolutizeUrl(value, base) {
  if (!value || typeof value !== 'string') return '';
  if (value.startsWith('data:')) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (!base) return '';
  try {
    return new NodeURL(value, base).toString();
  } catch {
    return '';
  }
}

function isLikelyImageUrl(value) {
  if (!value || typeof value !== 'string') return false;
  if (!/^https?:\/\//i.test(value)) return false;
  const clean = value.split('?')[0].split('#')[0];
  if (/(\.jpe?g|\.png|\.webp|\.gif|\.avif)$/i.test(clean)) return true;
  return (
    clean.includes('wp-content') ||
    clean.includes('/media/') ||
    clean.includes('/images/') ||
    clean.includes('cdn')
  );
}

async function enrichImages(items) {
  if (!Array.isArray(items) || !items.length) return;
  const seen = new Set();
  const targets = [];

  for (const item of items) {
    if (!item) continue;
    if (item.imageHint && isLikelyImageUrl(item.imageHint)) continue;
    if (!item.link || !/^https?:\/\//i.test(item.link)) continue;

    const cached = imageCache.get(item.link);
    if (cached) {
      if (cached.image && !item.imageHint) item.imageHint = cached.image;
      if (!item.sourceLogo && cached.logo) item.sourceLogo = cached.logo;
      continue;
    }

    if (seen.has(item.link)) continue;
    seen.add(item.link);
    targets.push(item);
    if (targets.length >= IMAGE_FETCH_LIMIT) break;
  }

  if (!targets.length) return;

  let index = 0;
  const concurrency = Math.min(4, targets.length);
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const currentIndex = index++;
        if (currentIndex >= targets.length) break;
        await fetchAndAssignImage(targets[currentIndex]);
      }
    })
  );
}

async function fetchAndAssignImage(item) {
  try {
    const { data, finalUrl } = await requestText(item.link, 'article');
    if (!data) {
      cacheImage(item.link, { image: '', logo: '' });
      return;
    }
    const html = data.slice(0, IMAGE_HTML_LIMIT);
    const { image, logo } = extractImagesFromHtml(html, finalUrl || item.link);
    if (image) item.imageHint = image;
    if (!item.sourceLogo && logo) item.sourceLogo = logo;
    cacheImage(item.link, { image: image || '', logo: logo || '' });
  } catch {
    cacheImage(item.link, { image: '', logo: '' });
  }
}

function extractImagesFromHtml(html, baseUrl) {
  if (!html) return { image: '', logo: '' };

  let image = absolutizeUrl(
    extractMetaTagContent(html, [
      'property="og:image:secure_url"',
      'property="og:image"',
      'name="og:image"',
      'property="og:image:url"',
      'name="twitter:image:src"',
      'property="twitter:image:src"',
      'name="twitter:image"',
      'property="twitter:image"',
      'itemprop="image"',
      'name="thumbnail"',
    ]),
    baseUrl
  );

  let logo = absolutizeUrl(
    extractMetaTagContent(html, [
      'property="og:logo"',
      'name="og:logo"',
      'itemprop="logo"',
    ]),
    baseUrl
  );

  const jsonLd = extractFromJsonLd(html);
  if (!image && jsonLd.image) {
    const candidate = absolutizeUrl(jsonLd.image, baseUrl);
    if (isLikelyImageUrl(candidate)) image = candidate;
  }
  if (!logo && jsonLd.logo) {
    const candidate = absolutizeUrl(jsonLd.logo, baseUrl);
    if (isLikelyImageUrl(candidate)) logo = candidate;
  }

  if (!image) {
    const fallback = extractImageFromHtml(html, baseUrl);
    if (fallback) image = fallback;
  }

  if (image && !isLikelyImageUrl(image)) image = '';
  if (logo && !isLikelyImageUrl(logo)) logo = '';

  return { image, logo };
}

function extractMetaTagContent(html, matchers) {
  if (!html) return '';
  for (const matcher of matchers) {
    const regex = new RegExp(`<meta[^>]+${matcher}[^>]*>`, 'i');
    const match = html.match(regex);
    if (match) {
      const content = extractMetaValue(match[0], 'content') || extractMetaValue(match[0], 'value');
      if (content) return content;
    }
  }
  const linkMatch = html.match(/<link[^>]+rel=["'](?:image_src|thumbnail)["'][^>]*>/i);
  if (linkMatch) {
    const href = extractMetaValue(linkMatch[0], 'href');
    if (href) return href;
  }
  return '';
}

function extractMetaValue(tag, attr) {
  if (!tag) return '';
  const doubleRegex = new RegExp(`${attr}\\s*=\\s*"([^"\\r\\n]+)"`, 'i');
  const doubleMatch = tag.match(doubleRegex);
  if (doubleMatch && doubleMatch[1]) return doubleMatch[1].trim();
  const singleRegex = new RegExp(`${attr}\\s*=\\s*'([^'\\r\\n]+)'`, 'i');
  const singleMatch = tag.match(singleRegex);
  if (singleMatch && singleMatch[1]) return singleMatch[1].trim();
  return '';
}

function extractFromJsonLd(html) {
  const result = { image: '', logo: '' };
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const block = match[1];
    if (!block) continue;
    const cleaned = block.trim();
    if (!cleaned) continue;
    try {
      const json = JSON.parse(cleaned);
      if (!result.image) {
        const img = collectFromJson(json, ['image', 'thumbnail', 'thumbnailUrl', 'contentUrl']);
        if (img && isLikelyImageUrl(img)) result.image = img;
      }
      if (!result.logo) {
        const logo = collectFromJson(json, ['logo', 'brand', 'publisher']);
        if (logo && isLikelyImageUrl(logo)) result.logo = logo;
      }
      if (result.image && result.logo) break;
    } catch {
      continue;
    }
  }
  return result;
}

function collectFromJson(node, keys) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = collectFromJson(item, keys);
      if (found) return found;
    }
    return '';
  }
  if (typeof node === 'object') {
    for (const key of keys) {
      if (node[key]) {
        const found = collectFromJson(node[key], keys);
        if (found) return found;
      }
    }
    if (node.url && typeof node.url === 'string') return node.url;
    if (node.contentUrl && typeof node.contentUrl === 'string') return node.contentUrl;
  }
  return '';
}

function cacheImage(link, value) {
  if (!link) return;
  imageCache.set(link, value);
  if (imageCache.size > CACHE_LIMIT) {
    const firstKey = imageCache.keys().next().value;
    if (firstKey) imageCache.delete(firstKey);
  }
}
