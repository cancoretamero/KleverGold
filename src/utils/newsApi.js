import fetch from 'node-fetch';

const API_KEY = process.env.NEWS_API_KEY || 'b7376a8668cf442585efad67279e57a4';
const NEWS_ENDPOINT = 'https://newsapi.org/v2/everything';

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
    imageUrl: article.urlToImage || null
  }));
}
