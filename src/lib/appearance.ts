export type ThemeMode = "light" | "dark" | "system";

export type Look = {
  theme: ThemeMode;
  palette: string;
  scale: number;
  wallpaper: string;
  bubble: string;
  textColor: string;
};

export const DEFAULT_LOOK: Look = {
  theme: "system",
  palette: "sage",
  scale: 1,
  wallpaper: "none",
  bubble: "default",
  textColor: "default",
};

type Pal = { name: string; primary: string; accent: string; accentFg: string; tileA: string; tileB: string; swatch: string };

export const PALETTES: Record<string, Pal> = {
  sage: { name: "Зелёная", primary: "169 100% 25%", accent: "111 91% 91%", accentFg: "202 32% 10%", tileA: "110 81% 92%", tileB: "216 20% 95%", swatch: "#008069" },
  ocean: { name: "Океан", primary: "211 62% 28%", accent: "199 78% 76%", accentFg: "211 70% 12%", tileA: "199 70% 88%", tileB: "210 35% 92%", swatch: "#1b4a7a" },
  sunset: { name: "Закат", primary: "16 70% 38%", accent: "28 92% 76%", accentFg: "16 70% 14%", tileA: "28 90% 88%", tileB: "20 45% 92%", swatch: "#a8431d" },
  lavender: { name: "Лаванда", primary: "262 40% 32%", accent: "258 70% 82%", accentFg: "262 50% 14%", tileA: "258 65% 90%", tileB: "260 30% 93%", swatch: "#4b3375" },
  cherry: { name: "Вишня", primary: "345 60% 32%", accent: "340 75% 82%", accentFg: "345 60% 14%", tileA: "340 70% 91%", tileB: "340 30% 93%", swatch: "#82213f" },
  graphite: { name: "Графит", primary: "220 10% 18%", accent: "45 90% 70%", accentFg: "40 60% 12%", tileA: "220 12% 88%", tileB: "220 8% 92%", swatch: "#292d33" },
};

export const WALLPAPERS: Record<string, { name: string; css: string }> = {
  none: { name: "Классические", css: "" },
  mint: { name: "Мята", css: "linear-gradient(160deg, #e3f1e4 0%, #cfe6d3 100%)" },
  sky: { name: "Небо", css: "linear-gradient(160deg, #e2efff 0%, #c7dcf5 100%)" },
  peach: { name: "Персик", css: "linear-gradient(160deg, #fff0e2 0%, #fbd9c1 100%)" },
  lilac: { name: "Сирень", css: "linear-gradient(160deg, #f0e9ff 0%, #dccff5 100%)" },
  night: { name: "Ночь", css: "linear-gradient(160deg, #1c2430 0%, #0f141b 100%)" },
  dots: {
    name: "Точки",
    css: "radial-gradient(hsl(var(--foreground) / 0.09) 1.2px, transparent 1.2px) 0 0 / 18px 18px, hsl(var(--tile-b))",
  },
  stripes: {
    name: "Полосы",
    css: "repeating-linear-gradient(135deg, hsl(var(--tile-a)) 0 14px, hsl(var(--tile-b)) 14px 28px)",
  },
};

export const BUBBLES: Record<string, { name: string; bg: string; fg: string }> = {
  default: { name: "Как в палитре", bg: "", fg: "" },
  blue: { name: "Синий", bg: "#2f6fde", fg: "#ffffff" },
  green: { name: "Зелёный", bg: "#2e9d5b", fg: "#ffffff" },
  orange: { name: "Оранжевый", bg: "#f08a3c", fg: "#1d1105" },
  purple: { name: "Фиолетовый", bg: "#7a4fd6", fg: "#ffffff" },
  pink: { name: "Розовый", bg: "#e8679a", fg: "#ffffff" },
  dark: { name: "Тёмный", bg: "#1f2328", fg: "#ffffff" },
};

export const TEXT_COLORS: Record<string, { name: string; value: string }> = {
  default: { name: "Обычный", value: "" },
  black: { name: "Чёрный", value: "#0b0b0b" },
  navy: { name: "Тёмно-синий", value: "#13294b" },
  brown: { name: "Коричневый", value: "#3b2618" },
  green: { name: "Тёмно-зелёный", value: "#123b22" },
};

const KEY = "rusapp_look";
const WP_KEY = "rusapp_wallpaper_img";

export function loadLook(): Look {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Look> & { v?: number };
    if (saved.v !== 2) {
      delete saved.theme;
      delete saved.palette;
      delete saved.bubble;
    }
    return { ...DEFAULT_LOOK, ...saved };
  } catch {
    return DEFAULT_LOOK;
  }
}

export function saveLook(look: Look) {
  localStorage.setItem(KEY, JSON.stringify({ ...look, v: 2 }));
}

export function loadWallpaperImage() {
  return localStorage.getItem(WP_KEY) || "";
}

export function saveWallpaperImage(data: string) {
  if (data) localStorage.setItem(WP_KEY, data);
  else localStorage.removeItem(WP_KEY);
}

export function isDark(look: Look) {
  if (look.theme === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches;
  return look.theme === "dark";
}

export function applyLook(look: Look) {
  const root = document.documentElement;
  const dark = isDark(look);
  root.classList.toggle("dark", dark);
  const p = PALETTES[look.palette] ?? PALETTES.sage;
  const vars: Record<string, string> = dark
    ? {
        "--primary": p.accent,
        "--primary-foreground": p.accentFg,
        "--ring": p.accent,
        "--accent": p.primary,
        "--accent-foreground": "0 0% 100%",
      }
    : {
        "--primary": p.primary,
        "--primary-foreground": "0 0% 100%",
        "--ring": p.primary,
        "--accent": p.accent,
        "--accent-foreground": p.accentFg,
        "--tile-a": p.tileA,
        "--tile-b": p.tileB,
      };
  for (const k of ["--primary", "--primary-foreground", "--ring", "--accent", "--accent-foreground", "--tile-a", "--tile-b"])
    root.style.removeProperty(k);
  if (look.palette !== "sage") for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.setProperty("--app-scale", String(look.scale));
  const b = BUBBLES[look.bubble] ?? BUBBLES.default;
  if (b.bg) {
    root.style.setProperty("--bubble-bg", b.bg);
    root.style.setProperty("--bubble-fg", b.fg);
  } else {
    root.style.removeProperty("--bubble-bg");
    root.style.removeProperty("--bubble-fg");
  }
  const t = TEXT_COLORS[look.textColor]?.value;
  if (t && !dark) root.style.setProperty("--chat-fg", t);
  else root.style.removeProperty("--chat-fg");
}

export function wallpaperCss(look: Look) {
  if (look.wallpaper === "custom") {
    const img = loadWallpaperImage();
    return img ? `center / cover no-repeat url(${img})` : "";
  }
  return WALLPAPERS[look.wallpaper]?.css ?? "";
}

export async function shrinkImage(file: File, max: number, quality: number) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function squareImage(file: File, size: number) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas
    .getContext("2d")
    ?.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function deviceName() {
  const ua = navigator.userAgent;
  const os = /iphone/i.test(ua)
    ? "iPhone"
    : /ipad/i.test(ua)
      ? "iPad"
      : /android/i.test(ua)
        ? "Android"
        : /windows/i.test(ua)
          ? "Windows"
          : /mac os/i.test(ua)
            ? "Mac"
            : /linux/i.test(ua)
              ? "Linux"
              : "Устройство";
  const br = /yabrowser/i.test(ua)
    ? "Яндекс Браузер"
    : /edg\//i.test(ua)
      ? "Edge"
      : /firefox/i.test(ua)
        ? "Firefox"
        : /chrome/i.test(ua)
          ? "Chrome"
          : /safari/i.test(ua)
            ? "Safari"
            : "";
  return br ? `${os} · ${br}` : os;
}
