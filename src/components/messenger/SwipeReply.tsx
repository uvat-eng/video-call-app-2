import { useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const TRIGGER = 64;
const MAX = 90;

type Props = {
  onReply: () => void;
  className?: string;
  children: React.ReactNode;
};

export default function SwipeReply({ onReply, className, children }: Props) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; lock: "h" | "v" | null } | null>(null);
  const fired = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, lock: null };
    fired.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current;
    if (!s) return;
    const t = e.touches[0];
    const x = t.clientX - s.x;
    const y = t.clientY - s.y;
    if (!s.lock) {
      if (Math.abs(x) < 8 && Math.abs(y) < 8) return;
      s.lock = Math.abs(x) > Math.abs(y) && x > 0 ? "h" : "v";
    }
    if (s.lock !== "h") return;
    const next = Math.max(0, Math.min(MAX, x * 0.6));
    if (next >= TRIGGER && !fired.current) {
      fired.current = true;
      navigator.vibrate?.(15);
    }
    setDx(next);
  };

  const onTouchEnd = () => {
    if (fired.current) onReply();
    start.current = null;
    fired.current = false;
    setDx(0);
  };

  return (
    <div
      className={cn("group relative w-full touch-pan-y", className)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onDoubleClick={onReply}
    >
      <span
        className="pointer-events-none absolute left-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-card/90 text-muted-foreground shadow"
        style={{ opacity: Math.min(1, dx / TRIGGER), transform: `translateY(-50%) scale(${0.6 + Math.min(1, dx / TRIGGER) * 0.4})` }}
      >
        <Icon name="Reply" size={16} />
      </span>
      <div
        className={cn("flex w-full", dx === 0 && "transition-transform duration-200")}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
