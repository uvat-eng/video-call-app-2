import func2url from "../../backend/func2url.json";

export const API_URL = (func2url as Record<string, string>).messenger;
export const TOKEN_KEY = "rusapp_token";

export type CallKind = "video" | "audio";
export type CallDirection = "in" | "out" | "missed";

export type User = {
  id: number;
  name: string;
  phone: string;
  status: string;
  lastSeen?: string;
  online: boolean;
  publicKey?: string | null;
};

export type ChatItem = {
  id: number;
  peer: User;
  lastAt: string | null;
  unread: number;
  readUpto: number;
  lastText?: string;
  lastMine?: boolean;
};

export type InboxItem = {
  id: number;
  chatId: number;
  cipher: string;
  iv: string;
  senderKey: string;
  at: string;
};

export type Message = {
  id: number;
  mine: boolean;
  text: string;
  at: string;
  read: boolean;
};

export type CallRecord = {
  id: number;
  kind: CallKind;
  direction: CallDirection;
  answered: boolean;
  at: string;
  seconds: number;
  peer: User;
};

export type IncomingCall = {
  id: number;
  kind: CallKind;
  offer: string | null;
  peer: User;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = Record<string, unknown>>(
  action: string,
  body: Record<string, unknown> = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Auth-Token"] = token;
  const res = await fetch(API_URL, { method: "POST", headers, body: JSON.stringify({ action, ...body }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error || "Ошибка сети", res.status);
  return data as T;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function dayDiff(d: Date) {
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((a - b) / 86400000);
}

export function hhmm(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function shortTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = dayDiff(d);
  if (diff === 0) return hhmm(iso);
  if (diff === 1) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function longTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = dayDiff(d);
  if (diff === 0) return `сегодня, ${hhmm(iso)}`;
  if (diff === 1) return `вчера, ${hhmm(iso)}`;
  return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, ${hhmm(iso)}`;
}

export function presence(u: User) {
  if (u.online) return "в сети";
  if (!u.lastSeen) return "не в сети";
  return `был(а) ${longTime(u.lastSeen)}`;
}

export function duration(seconds: number) {
  if (seconds <= 0) return "";
  if (seconds < 60) return `${seconds} сек`;
  return `${Math.round(seconds / 60)} мин`;
}

export type GroupMember = { user: User; state: "invited" | "joined" | "left" | "declined" | "missed" };

export type IncomingGroup = { id: number; kind: CallKind; host: User; total: number };

export type GroupCallRecord = {
  id: number;
  kind: CallKind;
  group: true;
  total: number;
  names: string;
  at: string;
  seconds: number;
  direction: CallDirection;
};
