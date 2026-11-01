self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function hasVisibleClient() {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return list.some((c) => c.visibilityState === "visible" && c.focused);
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "RusAPP", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      const isCall = data.type === "call";
      if (!isCall && (await hasVisibleClient())) return;
      const options = {
        body: data.body || "",
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        tag: isCall ? "call-" + data.callId : "chat-" + data.chatId,
        renotify: true,
        requireInteraction: isCall,
        vibrate: isCall ? [400, 200, 400, 200, 400, 200, 400] : [200],
        data,
      };
      if (isCall) {
        options.actions = [
          { action: "accept", title: "Ответить" },
          { action: "decline", title: "Отклонить" },
        ];
      }
      await self.registration.showNotification(data.title || "RusAPP", options);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  let url = "/";
  if (data.type === "call") {
    url = "/?call=" + data.callId + (event.action === "decline" ? "&decline=1" : "");
  } else if (data.chatId) {
    url = "/?chat=" + data.chatId;
  }
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of list) {
        if ("focus" in c) {
          c.postMessage({ type: "notification-click", data, action: event.action || "" });
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
