// Service worker for the shuttle team: shows push notifications even when the site
// is closed, and opens (or focuses) the shuttle page on the waiting customer.

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/pwa-icon/192",
      badge: "/pwa-icon/96",
      tag: data.tag, // one notification per customer, replaced rather than stacked
      renotify: true,
      requireInteraction: true, // stays on screen until the driver reacts
      vibrate: [200, 100, 200],
      data: { url: data.url || "/navette" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Only a page of this site: an absolute URL to another site falls back to the shuttle page.
  const url = new URL(event.notification.data?.url || "/navette", self.location.origin);
  const target = url.origin === self.location.origin ? url.href : new URL("/navette", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Reuse an open shuttle tab if there is one, otherwise open a new window.
      const open = windows.find((w) => new URL(w.url).pathname.startsWith("/navette"));
      if (open) return open.navigate(target).then((w) => (w || open).focus());
      return self.clients.openWindow(target);
    }),
  );
});
