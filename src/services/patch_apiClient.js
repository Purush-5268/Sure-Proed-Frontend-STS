const originalGet = apiClient.get;
const pendingGets = new Map();

apiClient.get = async function (url, config) {
  if (!config?.signal) {
    const key = `${url}-${JSON.stringify(config?.params || {})}`;
    if (pendingGets.has(key)) {
      return pendingGets.get(key);
    }
    
    const promise = originalGet.call(this, url, config).finally(() => {
      // Keep in cache for 100ms to batch simultaneous component mounts
      setTimeout(() => pendingGets.delete(key), 100);
    });
    pendingGets.set(key, promise);
    return promise;
  }
  return originalGet.call(this, url, config);
};
