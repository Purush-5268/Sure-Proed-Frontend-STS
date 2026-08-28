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
  setRememberMe
} from "../utils/tokenStorage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: restore user from stored token and securely verify state
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      const token = getAccessToken();
      const storedUser = getUserInfo();

      if (!token) {
        if (isMounted) setLoading(false);
        return;
      }

      const decoded = parseJwt(token);
      try {
        const res = await apiClient.get(API_ENDPOINTS.USERS.ME);
        if (isMounted && res.data) {
          // Stabilize user object reference by checking for deep equality
          setUser(prev => JSON.stringify(prev) === JSON.stringify(res.data) ? prev : res.data);
          setUserInfo(res.data);
        }
      } catch (err) {
        // If apiClient fails, the interceptor handles token refresh and clearing storage on 401.
        // We fallback to stored data ONLY if the token is still present (network error/500).
        if (isMounted) {
          if (getAccessToken()) {
            setUser(storedUser || decoded);
          } else {
            setUser(null);
          }
        }
      }
      
      if (isMounted) setLoading(false);
    };

    initAuth();
    return () => { isMounted = false; };
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

  const login = async (identifier, password, rememberMe = true) => {
    setLoading(true);
    const cleanId = (identifier || "").trim().toLowerCase();
    
    // Save remember me preference before saving any tokens
    setRememberMe(rememberMe);

    try {
      const data = await authService.login(cleanId, password);

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
          };
        } else {
          const decoded = parseJwt(data.access) || {};
          userObj = {
            email: decoded.email || cleanId,
            role: decoded.role || "STUDENT",
            user_id: decoded.user_id,
          };
        }
      }

      setUser(userObj);
      setUserInfo(userObj);
      setAccessToken(data.access);
      setRefreshToken(data.refresh);
      setLoading(false);
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
    isAuthenticated: !!user || !!getAccessToken(),
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
