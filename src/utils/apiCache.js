import apiClient from "../services/apiClient";

const cache = new Map();
const pendingRequests = new Map();

/**
 * Lightweight GET request deduplication and caching.
 * @param {string} url - The API endpoint
 * @param {object} config - Axios config (params, etc.)
 * @param {number} ttl - Cache time-to-live in milliseconds (default 5 mins)
 * @param {boolean} forceRefresh - If true, bypasses cache and fetches fresh data
 */
export const fetchWithCache = async (url, config = {}, ttl = 300000, forceRefresh = false) => {
  const cacheKey = url + JSON.stringify(config.params || {});

  if (!forceRefresh && cache.has(cacheKey)) {
    const { data, timestamp } = cache.get(cacheKey);
    if (Date.now() - timestamp < ttl) {
      return data;
    }
    cache.delete(cacheKey);
  }

  // Deduplicate in-flight requests (only for same cacheKey without signals)
  // Note: AbortController signals shouldn't perfectly deduplicate if one aborts, but for our lightweight cache it's okay, 
  // or we can ignore deduplication if a signal is provided.
  if (pendingRequests.has(cacheKey) && !config.signal) {
    return pendingRequests.get(cacheKey);
  }

  const requestPromise = apiClient.get(url, config)
    .then(response => {
      if (ttl > 0) {
        cache.set(cacheKey, { data: response.data, timestamp: Date.now() });
      }
      return response.data;
    })
    .finally(() => {
      if (!config.signal) {
        pendingRequests.delete(cacheKey);
      }
    });

  if (!config.signal) {
    pendingRequests.set(cacheKey, requestPromise);
  }
  return requestPromise;
};

export const clearApiCache = () => {
  cache.clear();
};
