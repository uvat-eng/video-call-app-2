import { api } from "@/lib/messenger-data";
import { b64, historyKey, unb64, type Vault } from "@/lib/e2e";

const CHUNK = 1024 * 1024;

type Snapshot = { history: unknown; groupKeys: unknown };
type Meta = { urls: string[]; ivs: string[]; gz: boolean };

async function gzip(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer> | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function gunzip(data: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export async function uploadHistory(vault: Vault, token: string) {
  const key = await historyKey(vault);
  if (!key) return;
  const snap: Snapshot = {
    history: (await vault.get("history")) ?? {},
    groupKeys: (await vault.get("groupKeys")) ?? {},
  };
  const raw = new Uint8Array(new TextEncoder().encode(JSON.stringify(snap)));
  const packed = await gzip(raw);
  const body = packed ?? raw;
  const urls: string[] = [];
  const ivs: string[] = [];
  const total = Math.max(1, Math.ceil(body.byteLength / CHUNK));
  if (total > 25) return;
  for (let i = 0; i < total; i++) {
    const part = body.slice(i * CHUNK, (i + 1) * CHUNK);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, part);
    const r = await api<{ url: string }>("file_put", { data: b64(c) }, token);
    urls.push(r.url);
    ivs.push(b64(iv));
  }
  const meta: Meta = { urls, ivs, gz: !!packed };
  await api("history_put", { url: urls[0], meta: JSON.stringify(meta) }, token);
}

export async function downloadHistory(vault: Vault, token: string): Promise<Snapshot | null> {
  const r = await api<{ backup: { url: string; meta: string } | null }>("history_get", {}, token);
  if (!r.backup) return null;
  const key = await historyKey(vault);
  if (!key) return null;
  const meta = JSON.parse(r.backup.meta) as Meta;
  const parts: ArrayBuffer[] = [];
  for (let i = 0; i < meta.urls.length; i++) {
    const res = await fetch(meta.urls[i]);
    if (!res.ok) return null;
    parts.push(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(meta.ivs[i]) }, key, await res.arrayBuffer()));
  }
  let buf = await new Blob(parts).arrayBuffer();
  if (meta.gz) buf = await gunzip(buf);
  return JSON.parse(new TextDecoder().decode(buf)) as Snapshot;
}
