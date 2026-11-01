import { API_URL } from "./messenger-data";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("rusapp-sw", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(value: unknown) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    if (value === null) tx.objectStore("kv").delete("session");
    else tx.objectStore("kv").put(value, "session");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function saveSwSession(token: string, userId: number) {
  return put({ token, userId, api: API_URL }).catch(() => undefined);
}

export function clearSwSession() {
  return put(null).catch(() => undefined);
}
