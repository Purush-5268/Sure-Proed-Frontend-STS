self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  if (!event.data) return;
  
  let data = {};
  try {
    data = event.data.json();
  } catch (err) {
    // If payload is not valid JSON, treat it as a raw string message
    data = { message: event.data.text() };
  }

  const title = data.title || data.notification_title || "SURE ProEd Notification";
  const body = data.message || data.notification_message || data.body || "You have a new notification.";
  const icon = data.icon || "/sure-logo.jpg";
  const url = data.action_url || data.url || "/";

  const options = {
    body: body,
    icon: icon,
    badge: icon,
    data: {
      url: new URL(`/?notification_action=${url}`, self.location.origin).href,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const targetUrl = event.notification.data.url;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it and navigate to the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url && "focus" in client) {
          client.focus();
          return client.navigate(targetUrl);
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
