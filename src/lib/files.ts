import { api } from "@/lib/messenger-data";
import { b64, unb64 } from "@/lib/e2e";
import type { FileMeta } from "@/lib/payload";

export const MAX_FILE = 25 * 1024 * 1024;
const CHUNK = 1024 * 1024;

const cache = new Map<string, Promise<Blob>>();

export async function compressImage(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  if (file.type === "image/gif" || file.type === "image/svg+xml") return { blob: file, w: 0, h: 0 };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size > file.size) return { blob: file, w, h };
    return { blob, w, h };
  } catch {
    return { blob: file, w: 0, h: 0 };
  }
}

export async function uploadEncrypted(
  blob: Blob,
  name: string,
  mime: string,
  token: string,
  onProgress?: (p: number) => void,
): Promise<FileMeta> {
  if (blob.size > MAX_FILE) throw new Error("Файл больше 25 МБ");
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const urls: string[] = [];
  const ivs: string[] = [];
  const total = Math.max(1, Math.ceil(blob.size / CHUNK));
  for (let i = 0; i < total; i++) {
    const part = await blob.slice(i * CHUNK, (i + 1) * CHUNK).arrayBuffer();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, part);
    const r = await api<{ url: string }>("file_put", { data: b64(enc) }, token);
    urls.push(r.url);
    ivs.push(b64(iv));
    onProgress?.((i + 1) / total);
  }
  return {
    t: "file",
    name,
    size: blob.size,
    mime,
    urls,
    ivs,
    key: b64(await crypto.subtle.exportKey("raw", key)),
  };
}

export function loadDecrypted(meta: FileMeta): Promise<Blob> {
  const id = meta.urls[0];
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const key = await crypto.subtle.importKey("raw", unb64(meta.key), "AES-GCM", false, ["decrypt"]);
      const parts: ArrayBuffer[] = [];
      for (let i = 0; i < meta.urls.length; i++) {
        const res = await fetch(meta.urls[i]);
        if (!res.ok) throw new Error("Файл недоступен");
        const data = await res.arrayBuffer();
        parts.push(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(meta.ivs[i]) }, key, data));
      }
      return new Blob(parts, { type: meta.mime || "application/octet-stream" });
    })();
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
