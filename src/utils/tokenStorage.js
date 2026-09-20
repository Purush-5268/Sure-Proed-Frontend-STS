const ACCESS_TOKEN_KEY = "sure_access_token";
const REFRESH_TOKEN_KEY = "sure_refresh_token";
const USER_INFO_KEY = "sure_user_info";
const REMEMBER_ME_KEY = "sure_remember_me";
const SESSION_EXPIRES_AT_KEY = "sure_session_expires_at";

const configuredIdleMinutes = Number(
  import.meta.env?.VITE_SESSION_IDLE_TIMEOUT_MINUTES
);
const configuredWarningMinutes = Number(
  import.meta.env?.VITE_SESSION_WARNING_MINUTES
);

export const SESSION_IDLE_TIMEOUT_MS =
  (Number.isFinite(configuredIdleMinutes) && configuredIdleMinutes > 0
    ? configuredIdleMinutes
    : 60) * 60 * 1000;
export const SESSION_WARNING_BEFORE_MS =
  (Number.isFinite(configuredWarningMinutes) && configuredWarningMinutes > 0
    ? configuredWarningMinutes
    : 5) * 60 * 1000;

// Determine storage based on user's choice
const getStorage = () => {
  try {
    const remember = localStorage.getItem(REMEMBER_ME_KEY) === "true";
    return remember ? localStorage : sessionStorage;
  } catch (e) {
    // Fallback to a dummy storage object if access is denied
    return {
      getItem: () => null,
      setItem: () => { },
      removeItem: () => { },
    };
  }
};

export const setRememberMe = (value) => {
  try {
    localStorage.setItem(REMEMBER_ME_KEY, value);
  } catch (e) { }
};

export const getAccessToken = () => getStorage().getItem(ACCESS_TOKEN_KEY);
export const setAccessToken = (token) => {
  getStorage().setItem(ACCESS_TOKEN_KEY, token);
  if (!token) return;

  try {
    if (!localStorage.getItem(SESSION_EXPIRES_AT_KEY)) {
      localStorage.setItem(
        SESSION_EXPIRES_AT_KEY,
        String(Date.now() + SESSION_IDLE_TIMEOUT_MS)
      );
    }
  } catch {
    // Browser privacy settings may block storage; token validation still applies.
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sure_session_started"));
  }
};
export const removeAccessToken = () => {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch (e) { }
};

export const getRefreshToken = () => getStorage().getItem(REFRESH_TOKEN_KEY);
export const setRefreshToken = (token) => getStorage().setItem(REFRESH_TOKEN_KEY, token);
export const removeRefreshToken = () => {
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch (e) { }
};

export const getUserInfo = () => {
  const data = getStorage().getItem(USER_INFO_KEY);
  try {
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

export const setUserInfo = (user) => getStorage().setItem(USER_INFO_KEY, JSON.stringify(user));
export const removeUserInfo = () => {
  try {
    localStorage.removeItem(USER_INFO_KEY);
    sessionStorage.removeItem(USER_INFO_KEY);
  } catch {
    // Browser privacy settings may block storage.
  }
};

export const getSessionExpiresAt = () => {
  try {
    const value = Number(localStorage.getItem(SESSION_EXPIRES_AT_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

export const extendSession = () => {
  const expiresAt = Date.now() + SESSION_IDLE_TIMEOUT_MS;
  try {
    localStorage.setItem(SESSION_EXPIRES_AT_KEY, String(expiresAt));
  } catch {
    // Browser privacy settings may block storage.
  }
  return expiresAt;
};

export const clearSessionExpiry = () => {
  try {
    localStorage.removeItem(SESSION_EXPIRES_AT_KEY);
  } catch {
    // Browser privacy settings may block storage.
  }
};

export const getSessionRemainingMs = () => {
  const expiresAt = getSessionExpiresAt();
  return expiresAt ? Math.max(0, expiresAt - Date.now()) : 0;
};

export const isSessionExpired = () => {
  const expiresAt = getSessionExpiresAt();
  return Boolean(expiresAt && Date.now() >= expiresAt);
};

export const clearAuthStorage = () => {
  removeAccessToken();
  removeRefreshToken();
  removeUserInfo();
  clearSessionExpiry();
};

export const parseJwt = (token) => {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
};

export const isTokenExpired = (token) => {
  if (!token || typeof token !== "string" || !token.includes(".")) return true;
  try {
    const decoded = parseJwt(token);
    if (!decoded || !decoded.exp) return false;
    // Buffer of 10 seconds to avoid edge-of-expiry race conditions
    return Date.now() >= (decoded.exp * 1000 - 10000);
  } catch (e) {
    return true;
  }
};
