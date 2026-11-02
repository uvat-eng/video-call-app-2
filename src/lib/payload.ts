export type FileMeta = {
  t: "file";
  name: string;
  size: number;
  mime: string;
  urls: string[];
  ivs: string[];
  key: string;
  w?: number;
  h?: number;
  caption?: string;
  fwd?: boolean;
  kind?: "voice" | "circle";
  dur?: number;
  wave?: number[];
};

export type PollPayload = { t: "poll"; id: string; q: string; options: string[]; multi: boolean };
export type VotePayload = { t: "vote"; poll: string; choice: number[] };
export type EventPayload = { t: "event"; id: string; title: string; when: string; place: string; note: string };
export type RsvpAnswer = "yes" | "maybe" | "no";
export type RsvpPayload = { t: "rsvp"; event: string; answer: RsvpAnswer };
export type ReplyRef = { id: number; author: number; text: string };
export type TextPayload = { t: "text"; text: string; reply?: ReplyRef; fwd?: boolean };

export type DeletePayload = { t: "del"; id: number };

export type Payload = TextPayload | FileMeta | PollPayload | VotePayload | EventPayload | RsvpPayload | DeletePayload;

const PREFIX = "\u0001RA1";

export function encodePayload(p: Payload) {
  if (p.t === "text" && !p.reply && !p.fwd) return p.text;
  return PREFIX + JSON.stringify(p);
}

export function parsePayload(text: string): Payload {
  if (!text.startsWith(PREFIX)) return { t: "text", text };
  try {
    return JSON.parse(text.slice(PREFIX.length)) as Payload;
  } catch {
    return { t: "text", text: "Неподдерживаемое сообщение" };
  }
}

export function isSilent(p: Payload) {
  return p.t === "vote" || p.t === "rsvp" || p.t === "del";
}

export function isSilentText(text: string) {
  return text.startsWith(PREFIX) && isSilent(parsePayload(text));
}

export function previewText(text: string) {
  const p = parsePayload(text);
  switch (p.t) {
    case "text":
      return p.text;
    case "file":
      if (p.kind === "voice") return "Голосовое сообщение";
      if (p.kind === "circle") return "Видеосообщение";
      if (p.mime.startsWith("image/")) return p.caption ? `Фото: ${p.caption}` : "Фото";
      if (p.mime.startsWith("video/")) return "Видео";
      return `Файл: ${p.name}`;
    case "poll":
      return `Опрос: ${p.q}`;
    case "event":
      return `Мероприятие: ${p.title}`;
    default:
      return "";
  }
}

export function uid() {
  const a = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fileSize(n: number) {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

export function deletedIds(list: { id: number; text: string; mine: boolean; from?: number }[], me: number, peer: number) {
  const author = new Map<number, number>();
  for (const m of list) author.set(m.id, m.mine ? me : (m.from ?? peer));
  const out = new Set<number>();
  for (const m of list) {
    if (!m.text.startsWith(PREFIX)) continue;
    const p = parsePayload(m.text);
    if (p.t !== "del") continue;
    const by = m.mine ? me : (m.from ?? peer);
    if (author.get(p.id) === by) out.add(p.id);
  }
  return out;
}

export function forwardText(text: string): string | null {
  const p = parsePayload(text);
  if (p.t === "text") return encodePayload({ t: "text", text: p.text, fwd: true });
  if (p.t === "file") return encodePayload({ ...p, fwd: true });
  return null;
}
