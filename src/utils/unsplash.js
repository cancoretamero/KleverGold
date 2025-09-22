const ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || 'dDRMnni-JMRIvgxiQl9vzOwm1fkVUfU5atwljm3vK7c';
const UNSPLASH_ENDPOINT = 'https://api.unsplash.com/search/photos';

/**
 * Searches Unsplash for images related to the given query. Returns a list of image metadata.
 *
 * @param {string} query - Search query (e.g. 'gold bullion' or 'gold price').
 * @param {number} perPage - Number of results to return (default 3).
 * @returns {Promise<Array>} - A promise that resolves to an array of image objects with URL and metadata.
 */
export async function searchUnsplashImages(query = 'gold bullion', perPage = 3) {
  const params = new URLSearchParams({
    query,
    per_page: String(perPage),
    client_id: ACCESS_KEY
  });
  const url = `${UNSPLASH_ENDPOINT}?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unsplash API error: ${response.status}`);
  }
  const data = await response.json();
  return (data.results || []).map((item) => ({
    url: item.urls?.regular || item.urls?.small || '',
    thumbnail: item.urls?.thumb || '',
    alt: item.alt_description || '',
    author: item.user?.name || '',
    authorLink: item.user?.links?.html || '',
    sourceLink: item.links?.html || ''
  }));
}
