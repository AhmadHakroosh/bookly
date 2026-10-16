/*
 * Bookly service worker: Web Push for workspace members (desktop browsers and the installed
 * app). It caches nothing; pages always come from the network. Registered by the admin with
 * scope /admin, so guests' booking pages are never controlled by it.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "" };
  }
  // Safari revokes push for sites that receive one without showing it, so every push is shown.
  event.waitUntil(
    self.registration.showNotification(data.title || "Bookly", {
      body: data.body || "",
      icon: "/logo-mark.png",
      badge: "/logo-mark.png",
      // The notification id: a redelivered push replaces the first instead of stacking.
      tag: data.id || undefined,
      data: { url: data.url || "/admin" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/admin",
    self.location.origin,
  );
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        if (new URL(w.url).origin !== target.origin) continue;
        await w.focus();
        try {
          await w.navigate(target.href);
          return;
        } catch {
          // Not controlled by this worker (opened before it activated): open a fresh window.
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
