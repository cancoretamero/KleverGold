const NEWS_ENDPOINT = 'https://newsapi.org/v2/everything';

let fetchModulePromise;

function resolveFetch() {
  if (typeof fetch === 'function') return fetch;
  if (!fetchModulePromise) {
    fetchModulePromise = import('node-fetch').then((mod) => mod.default || mod);
  }
  return fetchModulePromise;
}

async function httpFetch(url, options) {
  const impl = await resolveFetch();
  return impl(url, options);
}

function resolveNewsApiKey() {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    throw new Error('NEWS_API_KEY environment variable is not set');
  }
  return apiKey;
}

/**
 * Fetches recent gold‑related news articles from the NewsAPI.
 *
 * @param {string} query - Search terms for the NewsAPI request (defaults to gold price and market).
 * @param {number} pageSize - Number of articles to return (max 100).
 * @returns {Promise<Array>} - A promise that resolves to an array of article objects.
 */
export async function fetchGoldNews(query = 'gold price OR gold market', pageSize = 20) {
  const apiKey = resolveNewsApiKey();
  const params = new URLSearchParams({
    q: query,
    sortBy: 'publishedAt',
    language: 'en',
    pageSize: String(pageSize),
    apiKey,
  });
  const url = `${NEWS_ENDPOINT}?${params.toString()}`;
  const response = await httpFetch(url);
  if (!response.ok) {
    throw new Error(`NewsAPI error: ${response.status}`);
  }
  const data = await response.json();
  return (data.articles || []).map((article) => ({
    title: article.title,
    description: article.description,
    url: article.url,
    publishedAt: article.publishedAt,
    source: article.source?.name || '',
    imageUrl: article.urlToImage || null
  }));
}
