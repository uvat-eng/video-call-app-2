const enc = new TextEncoder();
const dec = new TextDecoder();
const PBKDF2_ITER = 310000;
const CURVE = { name: "ECDH", namedCurve: "P-256" } as const;

export function b64(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function unb64(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function rnd(n: number) {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));
}

type Sealed = { iv: string; c: string };

async function aesEncrypt(key: CryptoKey, data: string): Promise<Sealed> {
  const iv = rnd(12);
  const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(data));
  return { iv: b64(iv), c: b64(c) };
}

async function aesDecrypt(key: CryptoKey, s: Sealed) {
  const p = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(s.iv) }, key, unb64(s.c));
  return dec.decode(p);
}

/* ---------- IndexedDB ---------- */

const STORE = "kv";

function dbName(userId: number) {
  return `rusapp-vault-${userId}`;
}

function openDb(userId: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName(userId), 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idb<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function vaultExists(userId: number) {
  const db = await openDb(userId);
  const meta = await idb<unknown>(db, "readonly", (s) => s.get("meta"));
  db.close();
  return !!meta;
}

export function wipeVault(userId: number) {
  return new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(dbName(userId));
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/* ---------- Защищённое хранилище ---------- */

type Meta = { salt: string; iter: number; check: Sealed };

async function pinKey(pin: string, salt: Uint8Array<ArrayBuffer>, iter: number) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export class Vault {
  private db: IDBDatabase;
  private key: CryptoKey;

  private constructor(db: IDBDatabase, key: CryptoKey) {
    this.db = db;
    this.key = key;
  }

  static async create(userId: number, pin: string) {
    await wipeVault(userId);
    const db = await openDb(userId);
    const salt = rnd(16);
    const key = await pinKey(pin, salt, PBKDF2_ITER);
    const meta: Meta = { salt: b64(salt), iter: PBKDF2_ITER, check: await aesEncrypt(key, "rusapp-ok") };
    await idb(db, "readwrite", (s) => s.put(meta, "meta"));
    return new Vault(db, key);
  }

  static async unlock(userId: number, pin: string) {
    const db = await openDb(userId);
    const meta = await idb<Meta | undefined>(db, "readonly", (s) => s.get("meta"));
    if (!meta) {
      db.close();
      throw new Error("Хранилище не найдено");
    }
    const key = await pinKey(pin, unb64(meta.salt), meta.iter);
    try {
      if ((await aesDecrypt(key, meta.check)) !== "rusapp-ok") throw new Error();
    } catch {
      db.close();
      throw new Error("Неверный код доступа");
    }
    return new Vault(db, key);
  }

  async get<T>(name: string): Promise<T | null> {
    const rec = await idb<Sealed | undefined>(this.db, "readonly", (s) => s.get(name));
    if (!rec) return null;
    return JSON.parse(await aesDecrypt(this.key, rec)) as T;
  }

  async set(name: string, value: unknown) {
    const rec = await aesEncrypt(this.key, JSON.stringify(value));
    await idb(this.db, "readwrite", (s) => s.put(rec, name));
  }

  close() {
    this.db.close();
  }
}

/* ---------- Сквозное шифрование ---------- */

type Identity = { pkcs8: string; pub: string };

export type E2E = {
  vault: Vault;
  pub: string;
  encrypt: (peerPub: string, text: string) => Promise<{ cipher: string; iv: string; senderKey: string }>;
  decrypt: (senderKey: string, cipher: string, iv: string) => Promise<string>;
  seal: (peerPub: string, text: string) => Promise<string>;
  open: (payload: string) => Promise<{ text: string; senderKey: string }>;
};

export async function loadIdentity(vault: Vault): Promise<E2E> {
  let id = await vault.get<Identity>("identity");
  if (!id) {
    const pair = await crypto.subtle.generateKey(CURVE, true, ["deriveBits"]);
    id = {
      pkcs8: b64(await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
      pub: b64(await crypto.subtle.exportKey("raw", pair.publicKey)),
    };
    await vault.set("identity", id);
  }
  const priv = await crypto.subtle.importKey("pkcs8", unb64(id.pkcs8), CURVE, false, ["deriveBits"]);
  const pub = id.pub;
  const cache = new Map<string, Promise<CryptoKey>>();

  const pairKey = (peerPub: string) => {
    let k = cache.get(peerPub);
    if (!k) {
      k = (async () => {
        const peer = await crypto.subtle.importKey("raw", unb64(peerPub), CURVE, false, []);
        const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, priv, 256);
        const hk = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
        return crypto.subtle.deriveKey(
          { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode("rusapp-e2e-v1") },
          hk,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"],
        );
      })();
      cache.set(peerPub, k);
    }
    return k;
  };

  return {
    vault,
    pub,
    encrypt: async (peerPub, text) => {
      const s = await aesEncrypt(await pairKey(peerPub), text);
      return { cipher: s.c, iv: s.iv, senderKey: pub };
    },
    decrypt: async (senderKey, cipher, iv) => aesDecrypt(await pairKey(senderKey), { iv, c: cipher }),
    seal: async (peerPub, text) => {
      const s = await aesEncrypt(await pairKey(peerPub), text);
      return JSON.stringify({ k: pub, ...s });
    },
    open: async (payload) => {
      const p = JSON.parse(payload) as { k: string; iv: string; c: string };
      return { text: await aesDecrypt(await pairKey(p.k), p), senderKey: p.k };
    },
  };
}

export async function safetyCode(a: string, b: string) {
  const [x, y] = [a, b].sort();
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(x + "|" + y)));
  const groups: string[] = [];
  for (let i = 0; i < 6; i++) {
    const n = ((h[i * 4] << 24) | (h[i * 4 + 1] << 16) | (h[i * 4 + 2] << 8) | h[i * 4 + 3]) >>> 0;
    groups.push(String(n % 100000).padStart(5, "0"));
  }
  return groups;
}
