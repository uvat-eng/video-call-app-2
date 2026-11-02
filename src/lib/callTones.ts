type Tone = "ringback" | "ringtone" | "end";

let ctx: AudioContext | null = null;
let stopCurrent: (() => void) | null = null;
let unlockBound = false;

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => null);
  return ctx;
}

export function unlockCallAudio() {
  if (typeof window === "undefined" || unlockBound) return;
  unlockBound = true;
  const unlock = () => {
    const c = getCtx();
    if (!c) return;
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, 22050);
    s.connect(c.destination);
    s.start(0);
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("touchend", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

function beep(c: AudioContext, out: AudioNode, freqs: number[], start: number, dur: number, vol: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.02);
  g.gain.setValueAtTime(vol, start + dur - 0.03);
  g.gain.linearRampToValueAtTime(0, start + dur);
  g.connect(out);
  freqs.forEach((f) => {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    o.connect(g);
    o.start(start);
    o.stop(start + dur + 0.05);
  });
}

const RING_NOTES = [880, 1046.5, 1318.5, 1046.5];

export function stopCallTone() {
  stopCurrent?.();
  stopCurrent = null;
}

export function playCallTone(tone: Tone) {
  stopCallTone();
  const c = getCtx();
  if (!c) return;
  const out = c.createGain();
  out.connect(c.destination);

  if (tone === "end") {
    const t = c.currentTime + 0.05;
    for (let i = 0; i < 3; i++) beep(c, out, [425], t + i * 0.4, 0.2, 0.18);
    window.setTimeout(() => out.disconnect(), 1500);
    return;
  }

  const period = tone === "ringback" ? 4 : 3;
  let next = c.currentTime + 0.1;
  const pump = () => {
    while (next < c.currentTime + period + 0.5) {
      if (tone === "ringback") {
        beep(c, out, [425], next, 1, 0.18);
      } else {
        RING_NOTES.forEach((f, i) => beep(c, out, [f, f * 2], next + i * 0.18, 0.16, 0.1));
        RING_NOTES.forEach((f, i) => beep(c, out, [f, f * 2], next + 0.9 + i * 0.18, 0.16, 0.1));
        navigator.vibrate?.([700, 300, 700]);
      }
      next += period;
    }
  };
  pump();
  const timer = window.setInterval(pump, 1000);
  stopCurrent = () => {
    window.clearInterval(timer);
    out.gain.setValueAtTime(0, c.currentTime);
    out.disconnect();
    if (tone === "ringtone") navigator.vibrate?.(0);
  };
}
