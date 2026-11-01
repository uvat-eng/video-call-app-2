import { useRef } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  DEFAULT_LOOK,
  BUBBLES,
  PALETTES,
  TEXT_COLORS,
  WALLPAPERS,
  saveWallpaperImage,
  shrinkImage,
  wallpaperCss,
  type Look,
} from "@/lib/appearance";

type Props = { look: Look; onChange: (look: Look) => void };

function Title({ children }: { children: React.ReactNode }) {
  return <div className="mb-2.5 mt-6 font-head font-semibold first:mt-0">{children}</div>;
}

export default function AppearanceSection({ look, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Look>) => onChange({ ...look, ...patch });

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      saveWallpaperImage(await shrinkImage(f, 1400, 0.78));
      set({ wallpaper: "custom" });
    } catch {
      return;
    }
  };

  const chip = (active: boolean) =>
    cn(
      "rounded-full px-4 py-2 font-medium transition-colors",
      active ? "bg-primary text-primary-foreground" : "bg-background hover:bg-secondary",
    );

  return (
    <div>
      <Title>Тема</Title>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["light", "Светлая", "Sun"],
            ["dark", "Тёмная", "Moon"],
            ["system", "Как в системе", "MonitorSmartphone"],
          ] as const
        ).map(([id, label, icon]) => (
          <button key={id} onClick={() => set({ theme: id })} className={cn(chip(look.theme === id), "flex items-center gap-2")}>
            <Icon name={icon} size={16} />
            {label}
          </button>
        ))}
      </div>

      <Title>Цветовая палитра</Title>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {Object.entries(PALETTES).map(([id, p]) => (
          <button
            key={id}
            onClick={() => set({ palette: id })}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl p-2.5 text-[.8em] font-medium",
              look.palette === id ? "bg-background ring-2 ring-primary" : "bg-background/60 hover:bg-background",
            )}
          >
            <span className="flex h-9 w-full overflow-hidden rounded-lg">
              <span className="flex-1" style={{ background: p.swatch }} />
              <span className="flex-1" style={{ background: `hsl(${p.accent})` }} />
              <span className="flex-1" style={{ background: `hsl(${p.tileA})` }} />
            </span>
            {p.name}
          </button>
        ))}
      </div>

      <Title>Размер текста</Title>
      <div className="flex items-center gap-3 rounded-xl bg-background p-4">
        <span className="text-[.8em]">A</span>
        <input
          type="range"
          min={0.85}
          max={1.35}
          step={0.05}
          value={look.scale}
          onChange={(e) => set({ scale: Number(e.target.value) })}
          className="flex-1 accent-primary"
        />
        <span className="text-[1.4em] font-semibold">A</span>
        <span className="w-12 text-right text-[.85em] tabular-nums text-muted-foreground">{Math.round(look.scale * 100)}%</span>
      </div>

      <Title>Обои в чате</Title>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {Object.entries(WALLPAPERS).map(([id, w]) => (
          <button
            key={id}
            onClick={() => set({ wallpaper: id })}
            className={cn(
              "flex aspect-[3/4] items-end justify-center overflow-hidden rounded-xl border border-border p-1.5 text-[.75em] font-medium",
              look.wallpaper === id && "ring-2 ring-primary",
            )}
            style={{ background: w.css || "hsl(var(--card))" }}
          >
            <span className="rounded-full bg-card/85 px-2 py-0.5 text-foreground">{w.name}</span>
          </button>
        ))}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={upload} />
        <button
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex aspect-[3/4] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-dashed border-border p-1.5 text-[.75em] font-medium",
            look.wallpaper === "custom" && "ring-2 ring-primary",
          )}
          style={look.wallpaper === "custom" ? { background: wallpaperCss(look) } : undefined}
        >
          <span className="flex flex-col items-center gap-1 rounded-xl bg-card/85 px-2 py-1 text-foreground">
            <Icon name="ImagePlus" size={18} />
            Своё фото
          </span>
        </button>
      </div>

      <Title>Цвет ваших сообщений</Title>
      <div className="flex flex-wrap gap-2">
        {Object.entries(BUBBLES).map(([id, b]) => (
          <button
            key={id}
            onClick={() => set({ bubble: id })}
            className={cn(
              "rounded-2xl px-3.5 py-2 text-[.9em] font-medium",
              look.bubble === id && "ring-2 ring-primary ring-offset-2 ring-offset-card",
            )}
            style={
              b.bg
                ? { background: b.bg, color: b.fg }
                : { background: "hsl(var(--accent))", color: "hsl(var(--accent-foreground))" }
            }
          >
            {b.name}
          </button>
        ))}
      </div>

      <Title>Цвет текста собеседника</Title>
      <div className="flex flex-wrap gap-2">
        {Object.entries(TEXT_COLORS).map(([id, t]) => (
          <button key={id} onClick={() => set({ textColor: id })} className={chip(look.textColor === id)}>
            <span style={t.value && look.textColor !== id ? { color: t.value } : undefined}>{t.name}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[.8em] text-muted-foreground">В тёмной теме текст всегда светлый, чтобы его было легко читать.</p>

      <Title>Предпросмотр</Title>
      <div
        className="app-text flex flex-col gap-2 rounded-[14px] p-4"
        style={{ background: wallpaperCss(look) || "hsl(var(--background) / 0.6)" }}
      >
        <div className="bubble-peer max-w-[75%] self-start rounded-2xl px-3.5 py-2.5">Привет! Как тебе новые обои?</div>
        <div className="bubble-mine max-w-[75%] self-end rounded-2xl px-3.5 py-2.5">Отлично смотрится!</div>
      </div>

      <button
        onClick={() => onChange(DEFAULT_LOOK)}
        className="mt-5 text-[.85em] text-muted-foreground hover:text-foreground hover:underline"
      >
        Сбросить оформление
      </button>
    </div>
  );
}
