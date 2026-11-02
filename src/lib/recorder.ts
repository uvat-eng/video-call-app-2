export type RecKind = "voice" | "circle";

const AUDIO_TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
const VIDEO_TYPES = [
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function pickMime(kind: RecKind) {
  if (typeof MediaRecorder === "undefined") return "";
  const list = kind === "voice" ? AUDIO_TYPES : VIDEO_TYPES;
  return list.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
}

export function canRecord() {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function extFor(mime: string) {
  if (mime.includes("mp4")) return mime.startsWith("audio") ? "m4a" : "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export function shrinkWave(levels: number[], bars = 40) {
  if (!levels.length) return Array(bars).fill(4);
  const out: number[] = [];
  const step = levels.length / bars;
  for (let i = 0; i < bars; i++) {
    const from = Math.floor(i * step);
    const to = Math.max(from + 1, Math.floor((i + 1) * step));
    let max = 0;
    for (let j = from; j < to && j < levels.length; j++) max = Math.max(max, levels[j]);
    out.push(max);
  }
  const peak = Math.max(...out, 1);
  return out.map((v) => Math.max(4, Math.round((v / peak) * 31)));
}

export function fmtDur(s: number) {
  const n = Math.max(0, Math.round(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
