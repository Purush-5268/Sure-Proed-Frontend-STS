import apiClient from "./apiClient";
import { API_ENDPOINTS } from "../constants/apiEndpoints";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function extractVapidPublicKey(payload) {
  return payload?.public_key || payload?.vapid_public_key || payload?.key || "";
}

async function fetchVapidPublicKey() {
  const endpoint = API_ENDPOINTS.NOTIFICATIONS.PUSH_PUBLIC_KEY;
  let primaryError = null;

  try {
    const { data } = await apiClient.get(endpoint, {
      params: { _ts: Date.now() },
      headers: { "Cache-Control": "no-cache" },
    });
    const key = extractVapidPublicKey(data);
    if (key) return key;
  } catch (error) {
    primaryError = error;
  }

  // A stale frontend deployment can accidentally resolve the API path against
  // the SPA origin and receive index.html. Retry once against the configured API
  // origin without using browser or intermediary caches.
  const apiOrigin = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  if (apiOrigin) {
    const response = await fetch(`${apiOrigin}${endpoint}?_ts=${Date.now()}`, {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      const key = extractVapidPublicKey(await response.json());
      if (key) return key;
    }
  }

  if (primaryError) throw primaryError;
  throw new Error("Backend did not provide a VAPID public key.");
}

export const pushNotificationService = {
  isSupported() {
    return "serviceWorker" in navigator && "PushManager" in window;
  },

  async registerServiceWorker() {
    if (!this.isSupported()) return null;
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js?v=20260913-vapid-media", {
        updateViaCache: "none",
      });
      return registration;
    } catch (error) {
      console.error("Service Worker registration failed:", error);
      return null;
    }
  },

  async subscribe() {
    if (!this.isSupported()) return false;

    try {
      // 1. Get the VAPID public key from the backend
      const vapidPublicKey = await fetchVapidPublicKey();

      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

      // 2. Register service worker if not already
      const registration = await this.registerServiceWorker();
      if (!registration) return false;

      // Wait until the service worker is active
      await navigator.serviceWorker.ready;

      // 3. Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();

      // 4. Subscribe if it doesn't exist
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });
      }

      // 5. Send subscription to backend
      const subscriptionJSON = subscription.toJSON();
      
      await apiClient.post(API_ENDPOINTS.NOTIFICATIONS.PUSH_SUBSCRIBE, {
        endpoint: subscriptionJSON.endpoint,
        keys: subscriptionJSON.keys,
      });

      return true;
    } catch (error) {
      console.error("Failed to subscribe to push notifications:", error);
      return false;
    }
  },

  /**
   * Unsubscribe best-effort before logout.
   * Does not throw errors so logout flow is never trapped.
   */
  async unsubscribe() {
    if (!this.isSupported()) return;
    
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return;

      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;

      // 1. Tell backend to delete the subscription first
      try {
        await apiClient.delete(API_ENDPOINTS.NOTIFICATIONS.PUSH_UNSUBSCRIBE, {
          data: { endpoint: subscription.endpoint }
        });
      } catch (err) {
        console.warn("Backend unsubscribe failed, ignoring:", err);
      }

      // 2. Unsubscribe from the browser PushManager
      await subscription.unsubscribe();
    } catch (error) {
      console.warn("Failed to clean up push subscription on logout:", error);
    }
  },
};
