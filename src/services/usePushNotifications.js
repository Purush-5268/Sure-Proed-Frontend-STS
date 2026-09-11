import { useState, useEffect, useRef } from 'react';
import apiClient from './apiClient';

// Public VAPID Key URL
const PUBLIC_KEY_URL = '/api/notifications/push/public-key/';
// Subscribe URL
const SUBSCRIBE_URL = '/api/notifications/push/subscribe/';

export function usePushNotifications() {
  const [permission, setPermission] = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [loading, setLoading] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    // Only run this aggressively ONCE per session mount
    if (initialized.current) return;
    initialized.current = true;

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('Push messaging is not supported.');
      setPermission('unsupported');
      return;
    }

    const initPush = async () => {
      try {
        let currentPermission = Notification.permission;
        
        // AGGRESSIVE PROMPT if default
        if (currentPermission === 'default') {
          currentPermission = await Notification.requestPermission();
          setPermission(currentPermission);
        }

        if (currentPermission === 'granted') {
          await ensureSubscription();
        } else if (currentPermission === 'denied') {
          console.warn('Push notifications are blocked by the user.');
        }
      } catch (err) {
        console.error('Failed to initialize push notifications', err);
      }
    };

    initPush();
  }, []);

  const ensureSubscription = async () => {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Fetch VAPID public key
        const response = await apiClient.get(PUBLIC_KEY_URL);
        const { public_key } = response.data;
        
        if (!public_key) throw new Error("Missing VAPID public key");

        // Convert base64 to Uint8Array for PushManager
        const applicationServerKey = urlBase64ToUint8Array(public_key);
        
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
      }

      // Sync subscription with backend
      const subscriptionData = subscription.toJSON();
      await apiClient.post(SUBSCRIBE_URL, {
        endpoint: subscriptionData.endpoint,
        keys: subscriptionData.keys
      });

      console.log('Push subscription synced with backend successfully.');
    } catch (err) {
      console.error('Error ensuring push subscription:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to convert base64 to Uint8Array
  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  return {
    permission,
    loading
  };
}
