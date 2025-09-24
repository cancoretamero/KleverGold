import fetch from 'node-fetch';

const NEWS_ENDPOINT = 'https://newsapi.org/v2/everything';

function resolveNewsApiKey() {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    throw new Error('NEWS_API_KEY environment variable is not set');
  }
  return apiKey;
}

/**
 * Fetches recent gold-related news articles from the NewsAPI.
 *
 * @param {string} query - Search terms for the NewsAPI request.
 * @param {number} pageSize - Number of articles to return (max 100).
 * @returns {Promise<Array>} - A promise that resolves to an array of article objects.
 */
export async function fetchGoldNews(
  query = 'gold OR bullion OR precious metal OR "gold ETF" OR "central bank"',
  pageSize = 40
) {
  const apiKey = resolveNewsApiKey();
  const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const params = new URLSearchParams({
    q: query,
    from: fromDate,
    sortBy: 'publishedAt',
    language: 'en',
    pageSize: String(pageSize),
    apiKey,
  });
  const url = `${NEWS_ENDPOINT}?${params.toString()}`;
  const response = await fetch(url);
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
    imageUrl: article.urlToImage || null,
  }));
}
