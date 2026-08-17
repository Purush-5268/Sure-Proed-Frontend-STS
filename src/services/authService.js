import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";
import {
  setAccessToken,
  setRefreshToken,
  setUserInfo,
  clearAuthStorage,
  parseJwt,
} from "../utils/tokenStorage";

export const authService = {
  // Login with email/username and password
  async login(identifier, password) {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.TOKEN, {
      email: identifier,
      username: identifier,
      password,
    });
    const { access, refresh } = response.data;
    setAccessToken(access);
    setRefreshToken(refresh);

    // Decode token payload for basic info
    const decoded = parseJwt(access);
    if (decoded) {
      setUserInfo(decoded);
    }

    return response.data;
  },

  // Refresh token
  async refreshToken(refresh) {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.REFRESH, {
      refresh,
    });
    setAccessToken(response.data.access);
    return response.data;
  },

  // LinkedIn OAuth Connect URL
  async getLinkedInConnectUrl() {
    const response = await apiClient.get(API_ENDPOINTS.AUTH.LINKEDIN_CONNECT);
    return response.data;
  },

  // LinkedIn OAuth Callback
  async handleLinkedInCallback(code, state) {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.LINKEDIN_CALLBACK, {
      code,
      state,
    });
    return response.data;
  },

  // Disconnect LinkedIn
  async disconnectLinkedIn() {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.LINKEDIN_DISCONNECT);
    return response.data;
  },

  // GitHub OAuth Connect URL
  async getGithubConnectUrl() {
    const response = await apiClient.get(API_ENDPOINTS.AUTH.GITHUB_CONNECT);
    return response.data;
  },

  // GitHub OAuth Callback
  async handleGithubCallback(code, state) {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.GITHUB_CALLBACK, {
      code,
      state,
    });
    return response.data;
  },

  // Disconnect GitHub
  async disconnectGithub() {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.GITHUB_DISCONNECT);
    return response.data;
  },

  // Logout
  logout() {
    clearAuthStorage();
  },

  // Register
  async register(payload) {
    const response = await apiClient.post(API_ENDPOINTS.USERS.BASE, payload);
    return response.data;
  },

  // Forgot Password
  async forgotPassword(email) {
    const response = await apiClient.post(`${API_ENDPOINTS.USERS.BASE}forgot_password_request/`, { email });
    return response.data;
  },

  // Verify OTP (Backend verifies this together with the new password)
  async verifyOtp(email, otp) {
    return { success: true };
  },

  // Reset Password OTP
  async resetPasswordOtp(email, otp, newPassword) {
    const response = await apiClient.post(`${API_ENDPOINTS.USERS.BASE}forgot_password_confirm/`, {
      email,
      otp,
      new_password: newPassword,
    });
    return response.data;
  },
};
