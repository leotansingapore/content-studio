// Phone alerts only (supabase/functions/notify). No fetch handler: this
// worker never touches page loads or caching. Registered by src/lib/notify.ts
// when someone switches alerts on in My Playbook.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Content Studio", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || undefined,
      data: { url: typeof data.url === "string" ? data.url : "/home" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Only ever open a page of this app.
  let url = new URL("/home", self.location.origin);
  try {
    const wanted = new URL(event.notification.data?.url || "/home", self.location.origin);
    if (wanted.origin === self.location.origin) url = wanted;
  } catch {
    // keep /home
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of windows) {
        try {
          await w.focus();
          await w.navigate(url.href);
          return;
        } catch {
          // not ours to navigate; open a new window below
        }
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
