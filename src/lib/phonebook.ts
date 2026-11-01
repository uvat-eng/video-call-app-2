import { api, type User } from "@/lib/messenger-data";

export type PhoneContact = { name: string; phones: string[] };
export type BookEntry = { name: string; phone: string; user?: User };

export function normPhone(p: string) {
  let d = p.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return d.length >= 10 && d.length <= 15 ? "+" + d : "";
}

async function sha256(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type ContactsApi = {
  select: (props: string[], opts: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]>;
};

function contactsApi(): ContactsApi | null {
  const nav = navigator as Navigator & { contacts?: ContactsApi };
  return nav.contacts && "ContactsManager" in window ? nav.contacts : null;
}

export function canPickContacts() {
  return !!contactsApi();
}

type NativeBridge = {
  requestContacts: () => void;
  hasContactsPermission: () => boolean;
};

type NativeWindow = Window & {
  RuChatNative?: NativeBridge;
  __ruchatContacts?: (json: string | null) => void;
};

function nativeBridge(): NativeBridge | null {
  const w = window as NativeWindow;
  return w.RuChatNative && typeof w.RuChatNative.requestContacts === "function" ? w.RuChatNative : null;
}

export function hasNativeContacts() {
  return !!nativeBridge();
}

export function nativeContactsGranted() {
  try {
    return !!nativeBridge()?.hasContactsPermission();
  } catch {
    return false;
  }
}

export function readNativeContacts(): Promise<PhoneContact[]> {
  const bridge = nativeBridge();
  if (!bridge) return Promise.reject(new Error("unsupported"));
  return new Promise((resolve, reject) => {
    const w = window as NativeWindow;
    w.__ruchatContacts = (json) => {
      w.__ruchatContacts = undefined;
      if (json === null) return reject(new Error("denied"));
      try {
        const raw = JSON.parse(json) as { name?: string; phones?: string[] }[];
        resolve(raw.map((c) => ({ name: c.name ?? "", phones: c.phones ?? [] })).filter((c) => c.phones.length));
      } catch {
        reject(new Error("parse"));
      }
    };
    bridge.requestContacts();
  });
}

export async function pickContacts(): Promise<PhoneContact[]> {
  const api = contactsApi();
  if (!api) return [];
  const res = await api.select(["name", "tel"], { multiple: true });
  return res.map((c) => ({ name: c.name?.[0] ?? "", phones: c.tel ?? [] }));
}

function unfold(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function decodeQP(v: string) {
  try {
    const bytes = v
      .replace(/=\n/g, "")
      .split(/(=[0-9A-F]{2})/i)
      .flatMap((part) => (/^=[0-9A-F]{2}$/i.test(part) ? [parseInt(part.slice(1), 16)] : Array.from(new TextEncoder().encode(part))));
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return v;
  }
}

export function parseVcf(text: string): PhoneContact[] {
  const out: PhoneContact[] = [];
  const cards = unfold(text).split(/BEGIN:VCARD/i).slice(1);
  for (const card of cards) {
    let name = "";
    const phones: string[] = [];
    for (const line of card.split("\n")) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const key = line.slice(0, idx).toUpperCase();
      let val = line.slice(idx + 1).trim();
      if (key.includes("QUOTED-PRINTABLE")) val = decodeQP(val);
      if (key.startsWith("FN") || (key.match(/(^|\.)FN/) && !name)) name = val;
      else if ((key.startsWith("N;") || key === "N") && !name) name = val.split(";").filter(Boolean).reverse().join(" ");
      else if (key.includes("TEL")) phones.push(val);
    }
    if (phones.length) out.push({ name, phones });
  }
  return out;
}

export async function matchContacts(token: string, list: PhoneContact[]) {
  const entries = new Map<string, BookEntry>();
  for (const c of list) {
    for (const raw of c.phones) {
      const phone = normPhone(raw);
      if (phone && !entries.has(phone)) entries.set(phone, { name: c.name || phone, phone });
    }
  }
  const byHash = new Map<string, string>();
  await Promise.all(
    [...entries.keys()].map(async (phone) => {
      byHash.set(await sha256(phone), phone);
    }),
  );
  const hashes = [...byHash.keys()];
  for (let i = 0; i < hashes.length; i += 2000) {
    const r = await api<{ matches: { hash: string; user: User }[] }>(
      "match_contacts",
      { hashes: hashes.slice(i, i + 2000) },
      token,
    );
    for (const m of r.matches) {
      const phone = byHash.get(m.hash);
      const e = phone ? entries.get(phone) : undefined;
      if (e) e.user = m.user;
    }
  }
  return [...entries.values()].sort((a, b) => {
    if (!!a.user !== !!b.user) return a.user ? -1 : 1;
    return a.name.localeCompare(b.name, "ru");
  });
}