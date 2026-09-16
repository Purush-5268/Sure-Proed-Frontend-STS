import { createContext, useContext, useState, useEffect } from "react";
import { authService } from "../services/authService";
import { pushNotificationService } from "../services/pushNotificationService";
import apiClient from "../services/apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";
import {
  getAccessToken,
  getRefreshToken,
  getUserInfo,
  setUserInfo,
  setAccessToken,
  setRefreshToken,
  clearAuthStorage,
  parseJwt,
  setRememberMe,
  isTokenExpired,
  extendSession,
  getSessionExpiresAt,
  isSessionExpired,
  SESSION_WARNING_BEFORE_MS,
} from "../utils/tokenStorage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: restore user from stored token and securely verify state
  useEffect(() => {
    let isMounted = true;

    const handleSessionExpired = () => {
      clearAuthStorage();
      if (isMounted) {
        setUser(null);
        setLoading(false);
      }
    };

    window.addEventListener("sure_session_expired", handleSessionExpired);

    const initAuth = async () => {
      const token = getAccessToken();
      const refreshToken = getRefreshToken();
      const storedUser = getUserInfo();

      if (!token && !refreshToken) {
        if (isMounted) setLoading(false);
        return;
      }

      // If both access token and refresh token are expired or missing, clean up dead credentials
      if (isTokenExpired(token) && (!refreshToken || isTokenExpired(refreshToken))) {
        clearAuthStorage();
        if (isMounted) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      const decoded = (token && !isTokenExpired(token)) ? parseJwt(token) : (refreshToken ? parseJwt(refreshToken) : {});
      
      // OPTIMISTIC RENDER: Unblock UI immediately only if access token is still active
      if (isMounted && token && !isTokenExpired(token) && (storedUser || decoded?.email)) {
        setUser(storedUser || {
          email: decoded.email,
          role: decoded.role || "STUDENT",
          id: decoded.user_id || decoded.id
        });
        setLoading(false);
      }

      try {
        const res = await apiClient.get(API_ENDPOINTS.USERS.ME);
        if (isMounted && res.data) {
          // Stabilize user object reference by checking for deep equality
          setUser(prev => JSON.stringify(prev) === JSON.stringify(res.data) ? prev : res.data);
          setUserInfo(res.data);
        }
      } catch (err) {
        // If apiClient fails, the interceptor handles token refresh and clearing storage on 401.
        if (isMounted) {
          if (!getAccessToken()) {
            setUser(null);
          }
        }
      }
      
      if (isMounted) setLoading(false);
    };

    initAuth();
    return () => {
      isMounted = false;
      window.removeEventListener("sure_session_expired", handleSessionExpired);
    };
  }, []);

  // Enforce a real browser-session boundary even while the refresh token is valid.
  // Activity is intentionally limited to user input; background polling must not keep
  // an abandoned dashboard signed in forever.
  useEffect(() => {
    let warningTimer;
    let expiryTimer;
    let lastActivityWrite = 0;

    const clearTimers = () => {
      window.clearTimeout(warningTimer);
      window.clearTimeout(expiryTimer);
    };

    const expireSession = () => {
      clearTimers();
      clearAuthStorage();
      setUser(null);
      setLoading(false);
      window.dispatchEvent(new CustomEvent("sure_session_expired"));
    };

    const scheduleSessionTimers = () => {
      clearTimers();
      if (!getAccessToken() && !getRefreshToken()) return;

      const expiresAt = getSessionExpiresAt() || extendSession();
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        expireSession();
        return;
      }

      const warningDelay = remainingMs - SESSION_WARNING_BEFORE_MS;
      if (warningDelay <= 0) {
        window.dispatchEvent(
          new CustomEvent("sure_session_expiring", {
            detail: { remainingMs },
          })
        );
      } else {
        warningTimer = window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("sure_session_expiring", {
              detail: { remainingMs: SESSION_WARNING_BEFORE_MS },
            })
          );
        }, warningDelay);
      }

      expiryTimer = window.setTimeout(expireSession, remainingMs);
    };

    const recordActivity = () => {
      if (!getAccessToken() && !getRefreshToken()) return;
      const now = Date.now();
      if (now - lastActivityWrite < 30_000) return;
      lastActivityWrite = now;
      extendSession();
      scheduleSessionTimers();
      window.dispatchEvent(new CustomEvent("sure_session_extended"));
    };

    const handleStorage = (event) => {
      if (event.key === "sure_session_expires_at") {
        if (event.newValue) {
          scheduleSessionTimers();
          window.dispatchEvent(new CustomEvent("sure_session_extended"));
        } else {
          expireSession();
        }
      }
    };

    const handleSessionStarted = () => scheduleSessionTimers();

    const activityEvents = ["pointerdown", "keydown", "touchstart", "wheel"];
    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, recordActivity, { passive: true })
    );
    window.addEventListener("storage", handleStorage);
    window.addEventListener("sure_session_started", handleSessionStarted);
    scheduleSessionTimers();

    return () => {
      clearTimers();
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, recordActivity)
      );
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("sure_session_started", handleSessionStarted);
    };
  }, []);

  const updateUser = (updatedFields) => {
    setUser((prevUser) => {
      const updated = { ...prevUser, ...updatedFields };
      setUserInfo(updated);
      return updated;
    });
  };

  /**
   * Fetch the authenticated user's profile from the backend
   * after a successful JWT login if not already included.
   */
  const fetchUserProfile = async () => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.USERS.ME);
      return response.data;
    } catch (err) {
      console.warn("Could not fetch /api/users/me/:", err.message);
      return null;
    }
  };

  const login = async (identifier, password, rememberMe = true, role = null) => {
    // 1. Instantly trigger the native prompt on the synchronous click event, 
    // bypassing strict browser spam-blocking rules (Edge/Chrome).
    let permissionPromise = null;
    if ("Notification" in window && Notification.permission === "default") {
      permissionPromise = Notification.requestPermission().catch(console.warn);
    }

    setLoading(true);
    const cleanId = (identifier || "").trim().toLowerCase();
    
    // Save remember me preference before saving any tokens
    setRememberMe(rememberMe);

    try {
      const data = await authService.login(cleanId, password, role);

      let userObj;
      if (data?.user) {
        userObj = {
          id: data.user.id,
          email: data.user.email,
          first_name: data.user.first_name || "",
          last_name: data.user.last_name || "",
          firstName: data.user.first_name || "",
          lastName: data.user.last_name || "",
          phone_number: data.user.phone_number || "",
          phoneNumber: data.user.phone_number || "",
          role: data.user.role || "STUDENT",
          gender: data.user.gender || null,
          admin_category: data.user.admin_category || null,
          is_active: data.user.is_active,
          permissions: data.user.permissions || [],
          has_dual_access: data.user.has_dual_access || false,
          linked_account_role: data.user.linked_account_role || null,
        };
      } else {
        const profile = await fetchUserProfile();
        if (profile) {
          userObj = {
            id: profile.id,
            email: profile.email,
            first_name: profile.first_name || "",
            last_name: profile.last_name || "",
            firstName: profile.first_name || "",
            lastName: profile.last_name || "",
            phone_number: profile.phone_number || "",
            phoneNumber: profile.phone_number || "",
            role: profile.role || "STUDENT",
            gender: profile.gender || null,
            admin_category: profile.admin_category || null,
            is_active: profile.is_active,
            permissions: profile.permissions || [],
            has_dual_access: profile.has_dual_access || false,
            linked_account_role: profile.linked_account_role || null,
          };
        } else {
          const decoded = parseJwt(data.access) || {};
          userObj = {
            email: decoded.email || cleanId,
            role: decoded.role || "STUDENT",
            user_id: decoded.user_id,
            has_dual_access: decoded.has_dual_access || false,
            linked_account_role: decoded.linked_account_role || null,
          };
        }
      }

      setUser(userObj);
      setUserInfo(userObj);
      setAccessToken(data.access);
      setRefreshToken(data.refresh);
      extendSession();
      window.dispatchEvent(new CustomEvent("sure_session_started"));
      setLoading(false);
      
      // Subscribe to web push notifications right after successful login
      const setupPush = async () => {
        if (permissionPromise) {
          const perm = await permissionPromise;
          if (perm === "granted") await pushNotificationService.subscribe();
        } else if ("Notification" in window && Notification.permission === "granted") {
          await pushNotificationService.subscribe();
        }
      };
      
      setupPush().catch(err => {
        console.warn("Failed to subscribe to web push notifications on login:", err);
      });

      return { ...data, user: userObj };
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    // Attempt best-effort push unsubscribe before deleting JWT
    await pushNotificationService.unsubscribe();

    clearAuthStorage();
    authService.logout();
    setUser(null);
  };

  const value = {
    user,
    role: user?.role || "STUDENT",
    isAuthenticated:
      !!user &&
      !isSessionExpired() &&
      (!isTokenExpired(getAccessToken()) || !isTokenExpired(getRefreshToken())),
    loading,
    login,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
