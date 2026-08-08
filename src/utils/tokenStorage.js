const ACCESS_TOKEN_KEY = "sure_access_token";
const REFRESH_TOKEN_KEY = "sure_refresh_token";
const USER_INFO_KEY = "sure_user_info";
const REMEMBER_ME_KEY = "sure_remember_me";

// Determine storage based on user's choice
const getStorage = () => {
  const remember = localStorage.getItem(REMEMBER_ME_KEY) === "true";
  return remember ? localStorage : sessionStorage;
};

export const setRememberMe = (value) => {
  localStorage.setItem(REMEMBER_ME_KEY, value);
};

export const getAccessToken = () => getStorage().getItem(ACCESS_TOKEN_KEY);
export const setAccessToken = (token) => getStorage().setItem(ACCESS_TOKEN_KEY, token);
export const removeAccessToken = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
};

export const getRefreshToken = () => getStorage().getItem(REFRESH_TOKEN_KEY);
export const setRefreshToken = (token) => getStorage().setItem(REFRESH_TOKEN_KEY, token);
export const removeRefreshToken = () => {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
};

export const getUserInfo = () => {
  const data = getStorage().getItem(USER_INFO_KEY);
  try {
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
};

export const setUserInfo = (user) => getStorage().setItem(USER_INFO_KEY, JSON.stringify(user));
export const removeUserInfo = () => {
  localStorage.removeItem(USER_INFO_KEY);
  sessionStorage.removeItem(USER_INFO_KEY);
};

export const clearAuthStorage = () => {
  removeAccessToken();
  removeRefreshToken();
  removeUserInfo();
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
