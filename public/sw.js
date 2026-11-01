self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));


const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function unb64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function openDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbGet(db, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction("kv", "readonly").objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function aesEnc(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
  return { iv: b64(iv), c: b64(c) };
}

async function aesDec(key, rec) {
  const p = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.iv) }, key, unb64(rec.c));
  return dec.decode(p);
}

async function vaultRead(db, key, name) {
  const rec = await dbGet(db, name);
  return rec ? JSON.parse(await aesDec(key, rec)) : null;
}

async function vaultWrite(db, key, name, value) {
  await dbPut(db, name, await aesEnc(key, JSON.stringify(value)));
}

let flushing = Promise.resolve();

async function flushQueued(uid, chatId, peerKey) {
  const sdb = await openDb("rusapp-sw");
  const session = await dbGet(sdb, "session");
  sdb.close();
  if (!session || session.userId !== uid) return 0;
  const db = await openDb("rusapp-vault-" + uid);
  try {
    const meta = await dbGet(db, "meta");
    const vkey = await dbGet(db, "devkey");
    if (!meta || !meta.device || !vkey) return 0;
    const outbox = (await vaultRead(db, vkey, "outbox")) || {};
    const queue = outbox[chatId] || [];
    if (!queue.length) return 0;
    const id = await vaultRead(db, vkey, "identity");
    if (!id) return 0;
    const curve = { name: "ECDH", namedCurve: "P-256" };
    const priv = await crypto.subtle.importKey("pkcs8", unb64(id.pkcs8), curve, false, ["deriveBits"]);
    const peer = await crypto.subtle.importKey("raw", unb64(peerKey), curve, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, priv, 256);
    const hk = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
    const pairKey = await crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode("rusapp-e2e-v1") },
      hk,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const history = (await vaultRead(db, vkey, "history")) || {};
    const list = history[chatId] ? history[chatId].slice() : [];
    let sent = 0;
    const left = [];
    for (const msg of queue) {
      if (left.length) {
        left.push(msg);
        continue;
      }
      try {
        const sealed = await aesEnc(pairKey, msg.text);
        const res = await fetch(session.api, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Auth-Token": session.token },
          body: JSON.stringify({ action: "send", chatId, cipher: sealed.c, iv: sealed.iv, senderKey: id.pub }),
        });
        if (!res.ok) throw new Error("send");
        const r = await res.json();
        list.push({ id: r.id, mine: true, text: msg.text, at: r.at, read: false });
        sent++;
      } catch (e) {
        left.push(msg);
      }
    }
    if (left.length) outbox[chatId] = left;
    else delete outbox[chatId];
    list.sort((a, b) => a.id - b.id);
    history[chatId] = list.slice(-3000);
    await vaultWrite(db, vkey, "history", history);
    await vaultWrite(db, vkey, "outbox", outbox);
    return sent;
  } finally {
    db.close();
  }
}

async function notifyClients(msg) {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  list.forEach((c) => c.postMessage(msg));
}

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
      if (data.type === "key_ready") {
        const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        if (wins.some((c) => c.visibilityState === "visible")) {
          await notifyClients({ type: "key-ready", chatId: data.chatId });
          return;
        }
        let sent = 0;
        const job = flushing.then(() => flushQueued(data.uid, data.chatId, data.peerKey));
        flushing = job.catch(() => 0);
        try {
          sent = await job;
        } catch (e) {
          sent = 0;
        }
        await notifyClients({ type: "vault-changed" });
        await self.registration.showNotification(data.title || "RusAPP", {
          body: sent ? "Отправлено сообщений: " + sent : data.body || "",
          icon: "/icon-192.png",
          badge: "/badge-96.png",
          tag: "key-" + data.chatId,
          data: { chatId: data.chatId },
        });
        return;
      }
      const isCall = data.type === "call" || data.type === "group_call";
      if (data.type === "message" && data.badge && self.navigator.setAppBadge) {
        try {
          await self.navigator.setAppBadge(data.badge);
        } catch (e) {}
      }
      if (!isCall && data.type !== "test" && (await hasVisibleClient())) return;
      const options = {
        body: data.body || "",
        icon: "/icon-192.png",
        badge: "/badge-96.png",
        tag: isCall ? data.type + "-" + data.callId : "chat-" + (data.chatId || data.type),
        renotify: true,
        silent: false,
        requireInteraction: isCall,
        vibrate: isCall ? [400, 200, 400, 200, 400, 200, 400] : [200, 100, 200],
        data,
      };
      if (isCall) {
        options.actions = [
          { action: "accept", title: data.type === "group_call" ? "Открыть" : "Ответить" },
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
  if (data.type === "group_call") {
    url = "/?group=" + data.callId + (event.action === "decline" ? "&decline=1" : "");
  } else if (data.type === "call") {
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
