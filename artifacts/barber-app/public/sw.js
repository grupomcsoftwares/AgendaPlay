self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "AgendaPlay";
  const body  = data.body  || "Você tem uma notificação.";
  const icon  = data.icon  || "/favicon.ico";

  // Tell every open tab which sound to play (admin: "new" or "rescheduled")
  const notifyClients = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((list) => {
      for (const client of list) {
        client.postMessage({ type: "PLAY_SOUND", sound: data.sound || "new" });
      }
    });

  const showNotif = self.registration.showNotification(title, {
    body,
    icon,
    badge: icon,
    vibrate: [200, 100, 200, 100, 200],
    tag: data.tag || "agendaplay",
    renotify: true,
    data: { url: data.url || "/" },
    actions: [{ action: "view", title: "Ver agendamento" }],
  });

  event.waitUntil(Promise.all([notifyClients, showNotif]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
