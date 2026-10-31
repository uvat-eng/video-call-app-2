// Update this page (the content is just a fallback if you fail to update the page)

import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

// Dotted cube that tumbles: 7×7×7 points spin around an in-plane axis and,
// every half turn, face the viewer for an instant as a flat square. Pure CSS
// 3D, no JS: it moves as soon as the HTML arrives, on the compositor, and the
// page's own scripts never wait for it. Dots always face the viewer; depth
// dims them through dark planes between the layers of the cube; perspective
// fades out towards the flat square. Plain HTML string: 343 JSX elements would
// bloat the page with editor markup.
const STEP = [-56, -37.3, -18.7, 0, 18.7, 37.3, 56];
const FOG = [
  [64, 0.14],
  [38.4, 0.163],
  [12.8, 0.195],
  [-12.8, 0.242],
  [-38.4, 0.32],
  [-64, 0.471],
];
// One turn takes 5 s; within each quarter the speed eases (fast through the
// flat square, slow in 3D), the in-plane spin is steady.
const AXIS = "0.93969, -0.34202, 0";
const turn = (sign: number) =>
  [0, 25, 50, 75, 100]
    .map(
      (at, i) =>
        `${at}% { transform: rotate3d(${AXIS}, ${sign * 90 * i}deg); animation-timing-function: cubic-bezier(${i % 2 ? "0.4, 0.15, 0.6, 0.35" : "0.4, 0.65, 0.6, 0.85"}); }`,
    )
    .join(" ");
const place = (selector: string, axis: (v: number) => string) =>
  STEP.map((v, i) => `${selector}:nth-child(${i + 1}) { translate: ${axis(v)}; }`).join("\n");

const CUBE_CSS = `
.pp-cube { position: relative; width: 300px; height: 300px; }
.pp-cube * { position: absolute; }
.pp-cube div { inset: 0; transform-style: preserve-3d; }
.pp-cube b { inset: -10px; background: #1A1A1A; }
.pp-cube i { left: 148px; top: 148px; width: 4px; height: 4px; border-radius: 50%; background: #fff; box-shadow: 0 0 4px rgba(255, 255, 255, 0.3); opacity: 0.95; animation: pp-face 5s infinite; }
${place(".pp-turn > div", (v) => `${v}px 0`)}
${place(".pp-turn > div > div", (v) => `0 ${v}px`)}
${place(".pp-cube i", (v) => `0 0 ${v}px`)}
.pp-view { animation: pp-persp 2.5s linear infinite; }
.pp-turn { animation: pp-tilt 5s infinite, pp-spin 5s linear infinite; }
@keyframes pp-tilt { ${turn(-1)} }
@keyframes pp-face { ${turn(1)} }
@keyframes pp-spin { to { rotate: -90deg; } }
@keyframes pp-persp {
  0%, 100% { transform: perspective(100000px); }
  7.934%, 92.066% { transform: perspective(975.6px); }
  16.716%, 83.284% { transform: perspective(528px); }
  28.136%, 71.864% { transform: perspective(404.1px); }
  50% { transform: perspective(373.3px); }
}
@media (prefers-reduced-motion: reduce) {
  .pp-cube .pp-view, .pp-cube .pp-turn, .pp-cube i { animation-delay: -0.6s; animation-play-state: paused; }
}`;

const CUBE_HTML =
  `<style>${CUBE_CSS}</style><div class="pp-view">` +
  FOG.map(([z, opacity]) => `<b style="transform: translateZ(${z}px); opacity: ${opacity}"></b>`).join("") +
  `<div class="pp-turn">${`<div>${`<div>${"<i></i>".repeat(7)}</div>`.repeat(7)}</div>`.repeat(7)}</div></div>`;

const Cube = () => <div aria-hidden className="pp-cube" dangerouslySetInnerHTML={{ __html: CUBE_HTML }} />;

function Index() {
  // Tell the editor this is only the placeholder, so it hides the editing
  // tools: there is nothing to edit yet. Sent after load (the editor resets
  // the flag on every load) and withdrawn once the page is replaced.
  useEffect(() => {
    const say = (placeholder: boolean) =>
      window.parent?.postMessage({ type: "pp-placeholder", placeholder }, "*");
    const onLoad = () => say(true);
    if (document.readyState === "complete") say(true);
    else window.addEventListener("load", onLoad);
    return () => {
      window.removeEventListener("load", onLoad);
      say(false);
    };
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-[#1A1A1A] px-6 text-center">
      <Cube />
      {/* Dot grid backdrop, fading towards the edges. Over the cube: the
          cube's dark planes would hide it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:32px_32px] bg-center [mask-image:radial-gradient(ellipse_at_center,#000_40%,transparent_100%)]"
      />
      <p className="relative mt-1 text-base font-medium text-white">Здесь появится ваш проект</p>
      <p className="relative mt-2 max-w-[340px] text-sm text-[#969696]">Подождите пару минут</p>
    </div>
  );
}
