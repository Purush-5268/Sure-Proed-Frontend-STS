import axios from "axios";
import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  clearAuthStorage,
} from "../utils/tokenStorage";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

const BASE_URL = import.meta.env.VITE_API_URL || "";

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000, // 15-second timeout to prevent infinite hanging
  headers: {
    "Content-Type": "application/json",
  },
});

export const normalizeListResponse = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.results)) {
    return payload.results;
  }

  if (payload && Array.isArray(payload.items)) {
    return payload.items;
  }

  return [];
};

export const fetchAllPages = async (url, config = {}) => {
  let allResults = [];
  let currentUrl = url;

  while (currentUrl) {
    // If currentUrl is a full URL (from backend next link), use it directly. 
    // Axios handles full URLs gracefully by ignoring the baseURL.
    const response = await apiClient.get(currentUrl, config);

    if (response.data && Array.isArray(response.data.results)) {
      allResults = [...allResults, ...response.data.results];
      if (response.data.next) {
        try {
          const nextUrlObj = new URL(response.data.next);
          currentUrl = nextUrlObj.pathname + nextUrlObj.search;
        } catch (e) {
          // If it's already a relative path or invalid URL, fallback to it directly
          currentUrl = response.data.next;
        }
      } else {
        currentUrl = null;
      }
    } else if (Array.isArray(response.data)) {
      allResults = [...allResults, ...response.data];
      currentUrl = null;
    } else {
      currentUrl = null;
    }
  }

  return allResults;
};

// Request Interceptor: Attach JWT Bearer Token
apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    // Only attach the token if it looks like a real JWT (contains dots)
    // Skip demo/session tokens that are just plain strings
    if (token && token.includes(".")) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);


// Response Interceptor: Handle Token Refresh on 401
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response &&
      error.response.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url.includes(API_ENDPOINTS.AUTH.TOKEN) &&
      !originalRequest.url.includes(API_ENDPOINTS.AUTH.REFRESH)
    ) {
      // 1. Verify this was actually an authenticated request
      const hasAuthHeader = !!originalRequest.headers?.Authorization;
      if (!hasAuthHeader) {
        return Promise.reject(error);
      }

      // 2. Ignore 401s on the public registration flow if a stale token was somehow attached
      if (originalRequest.url.includes(API_ENDPOINTS.USERS.BASE) && !originalRequest.url.includes(API_ENDPOINTS.USERS.ME)) {
        return Promise.reject(error);
      }

      // 3. Stale-token race condition check
      // If the token was refreshed by another concurrent request while this one was in-flight,
      // the sent token will differ from the current stored token.
      const currentToken = getAccessToken();
      const sentToken = originalRequest.headers?.Authorization?.replace("Bearer ", "");
      if (sentToken && currentToken && sentToken !== currentToken) {
        originalRequest._retry = true;
        originalRequest.headers.Authorization = `Bearer ${currentToken}`;
        return apiClient(originalRequest);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest._retry = true;
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearAuthStorage();
        isRefreshing = false;
        window.dispatchEvent(new CustomEvent('sure_session_expired'));
        
        // Retry the request once without the token (for public endpoints)
        delete originalRequest.headers.Authorization;
        if (!originalRequest._publicRetry) {
          originalRequest._publicRetry = true;
          return apiClient(originalRequest);
        }
        
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(
          `${BASE_URL}${API_ENDPOINTS.AUTH.REFRESH}`,
          { refresh: refreshToken }
        );
        setAccessToken(data.access);
        if (data.refresh) {
          setRefreshToken(data.refresh);
        }
        apiClient.defaults.headers.common["Authorization"] = `Bearer ${data.access}`;
        processQueue(null, data.access);
        originalRequest.headers.Authorization = `Bearer ${data.access}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        clearAuthStorage();
        window.dispatchEvent(new CustomEvent('sure_session_expired'));
        
        // Retry the request once without the token (for public endpoints)
        delete originalRequest.headers.Authorization;
        if (!originalRequest._publicRetry) {
          originalRequest._publicRetry = true;
          return apiClient(originalRequest);
        }

        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// --- Request Deduplication ---
// Deduplicate identical GET requests that are fired at the exact same time
// (e.g. from StrictMode double-mounts or multiple components fetching on load)
const originalGet = apiClient.get;
const pendingGets = new Map();

apiClient.get = async function (url, config) {
  // Only deduplicate if it's a simple GET without custom abort signals
  if (!config?.signal) {
    // Generate a unique key for the request URL and params
    const key = `${url}-${JSON.stringify(config?.params || {})}`;
    
    // If an identical request is already pending, return its promise
    if (pendingGets.has(key)) {
      return pendingGets.get(key);
    }
    
    // Fire the original request and store the promise
    const promise = originalGet.call(this, url, config).finally(() => {
      // Keep in cache for a short 100ms window to batch simultaneous component mounts
      setTimeout(() => pendingGets.delete(key), 100);
    });
    
    pendingGets.set(key, promise);
    return promise;
  }
  
  // For requests with signals or complex configs, bypass deduplication
  return originalGet.call(this, url, config);
};

export default apiClient;
