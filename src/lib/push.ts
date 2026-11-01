import { api } from "@/lib/messenger-data";

export type PushState = "unsupported" | "ios-install" | "default" | "granted" | "denied";

function urlB64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushState(): PushState {
  if (!("serviceWorker" in navigator)) return "unsupported";
  if (!("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  }
  if (isIos() && !isStandalone()) return "ios-install";
  return Notification.permission as PushState;
}

export async function registerSw() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function subscribePush(token: string, ask: boolean) {
  const state = pushState();
  if (state === "unsupported" || state === "ios-install" || state === "denied") return state;
  if (state === "default") {
    if (!ask) return state;
    const res = await Notification.requestPermission();
    if (res !== "granted") return res as PushState;
  }
  const reg = (await registerSw()) && (await navigator.serviceWorker.ready);
  if (!reg) return "unsupported";
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await api<{ publicKey: string }>("push_key", {}, token);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(publicKey),
    });
  }
  await api("push_subscribe", { subscription: sub.toJSON() }, token);
  return "granted" as PushState;
}

export async function unsubscribePush(token: string) {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api("push_unsubscribe", { endpoint: sub.endpoint }, token).catch(() => null);
  await sub.unsubscribe().catch(() => null);
}
