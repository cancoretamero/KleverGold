const API_KEY = process.env.NEWS_API_KEY || 'b7376a8668cf442585efad67279e57a4';
const NEWS_ENDPOINT = 'https://newsapi.org/v2/everything';

let cachedFetch = null;

async function getFetch() {
  if (cachedFetch) return cachedFetch;
  if (typeof globalThis.fetch === 'function') {
    cachedFetch = globalThis.fetch.bind(globalThis);
    return cachedFetch;
  }
  const { default: polyfill } = await import('node-fetch');
  cachedFetch = polyfill;
  return cachedFetch;
}

/**
 * Fetches recent gold‑related news articles from the NewsAPI.
 *
 * @param {string} query - Search terms for the NewsAPI request (defaults to gold price and market).
 * @param {number} pageSize - Number of articles to return (max 100).
 * @returns {Promise<Array>} - A promise that resolves to an array of article objects.
 */
export async function fetchGoldNews(query = 'gold price OR gold market', pageSize = 20) {
  const params = new URLSearchParams({
    q: query,
    sortBy: 'publishedAt',
    language: 'en',
    pageSize: String(pageSize),
    apiKey: API_KEY
  });
  const url = `${NEWS_ENDPOINT}?${params.toString()}`;
  const fetchFn = await getFetch();

  let response;
  try {
    response = await fetchFn(url);
  } catch (error) {
    const detail = error?.message || 'Network request failed';
    throw new Error(`NewsAPI request error: ${detail}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    if (!response.ok) {
      const detail = error?.message || response.statusText || 'Unknown error';
      throw new Error(`NewsAPI error: ${response.status} (${detail})`);
    }
    throw new Error('NewsAPI returned invalid JSON');
  }

  if (!response.ok) {
    const detail = data?.message || data?.error || response.statusText || 'Unknown error';
    throw new Error(`NewsAPI error: ${response.status} (${detail})`);
  }
  return (data.articles || []).map((article) => ({
    title: article.title,
    description: article.description,
    url: article.url,
    publishedAt: article.publishedAt,
    source: article.source?.name || '',
    imageUrl: article.urlToImage || null
  }));
}
