self.addEventListener("push", function (event) {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    const title = data.title || "SURE ProEd Notification";
    const options = {
      body: data.message || "You have a new notification.",
      icon: "/Sure-icon.png",
      badge: "/Sure-icon.png",
      data: {
        url: new URL(data.action_url || "/", self.location.origin).href,
      },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error("Error processing push event:", err);
  }
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
