self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "Agenda Play";
  const body = data.body || "Você tem uma notificação.";
  const icon = data.icon || "/favicon.ico";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      vibrate: [200, 100, 200],
      tag: data.tag || "agendaplay",
      renotify: true,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
