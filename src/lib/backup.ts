import { b64, unb64, type Vault } from "@/lib/e2e";

const MAGIC = "RUSAPP-BACKUP-1";
const ITER = 310000;
const SKIP = new Set(["meta", "devkey"]);
const enc = new TextEncoder();
const dec = new TextDecoder();

type Header = { magic: string; userId: number; createdAt: string; salt: string; iv: string; iter: number };
type Manifest = { data: Record<string, unknown>; media: [string, number][] };

async function passKey(password: string, salt: Uint8Array<ArrayBuffer>, iter: number) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function u32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}

export async function createBackup(
  vault: Vault,
  userId: number,
  password: string,
  onProgress?: (text: string) => void,
) {
  onProgress?.("Собираю переписку…");
  const keys = (await vault.keys()).filter((k) => !SKIP.has(k));
  const data: Record<string, unknown> = {};
  const media: [string, number][] = [];
  const blobs: ArrayBuffer[] = [];
  let i = 0;
  for (const k of keys) {
    if (k.startsWith("media:")) {
      const bytes = await vault.getBytes(k).catch(() => null);
      if (bytes) {
        media.push([k, bytes.byteLength]);
        blobs.push(bytes);
      }
      i++;
      if (i % 5 === 0) onProgress?.(`Добавляю файлы: ${i}`);
    } else {
      const v = await vault.get(k).catch(() => null);
      if (v !== null) data[k] = v;
    }
  }
  const manifest = enc.encode(JSON.stringify({ data, media } satisfies Manifest));
  const plain = new Blob([u32(manifest.byteLength), manifest, ...blobs]);
  onProgress?.("Шифрую копию…");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passKey(password, salt, ITER);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, await plain.arrayBuffer());
  const header: Header = {
    magic: MAGIC,
    userId,
    createdAt: new Date().toISOString(),
    salt: b64(salt),
    iv: b64(iv),
    iter: ITER,
  };
  const h = enc.encode(JSON.stringify(header));
  return {
    blob: new Blob([u32(h.byteLength), h, cipher], { type: "application/octet-stream" }),
    files: media.length,
    size: plain.size,
  };
}

export async function readBackupHeader(file: Blob) {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const len = new DataView(head.buffer).getUint32(0);
  if (len > 4096) throw new Error("Это не файл резервной копии RusAPP");
  const header = JSON.parse(dec.decode(await file.slice(4, 4 + len).arrayBuffer())) as Header;
  if (header.magic !== MAGIC) throw new Error("Это не файл резервной копии RusAPP");
  return { header, offset: 4 + len };
}

export async function restoreBackup(file: Blob, userId: number, password: string, vault: Vault) {
  const { header, offset } = await readBackupHeader(file);
  if (header.userId !== userId) throw new Error("Эта копия сделана в другом аккаунте");
  const key = await passKey(password, unb64(header.salt), header.iter);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(header.iv) }, key, await file.slice(offset).arrayBuffer());
  } catch {
    throw new Error("Неверный пароль копии");
  }
  const view = new DataView(plain);
  const mlen = view.getUint32(0);
  const manifest = JSON.parse(dec.decode(new Uint8Array(plain, 4, mlen))) as Manifest;
  const keep = new Set(["identity", "applock", "biometric"]);
  for (const [k, v] of Object.entries(manifest.data)) if (!keep.has(k)) await vault.set(k, v);
  let pos = 4 + mlen;
  for (const [k, size] of manifest.media) {
    await vault.putBytes(k, plain.slice(pos, pos + size));
    pos += size;
  }
  return { createdAt: header.createdAt, files: manifest.media.length };
}

export async function saveBackupFile(blob: Blob) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const name = `RusAPP-копия-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.rusapp`;
  const file = new File([blob], name, { type: "application/octet-stream" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (/android|iphone|ipad/i.test(navigator.userAgent) && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Резервная копия RusAPP" });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "downloaded";
}

export function sizeText(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}
