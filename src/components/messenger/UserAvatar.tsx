import { cn } from "@/lib/utils";
import { initials } from "@/lib/messenger-data";
import Icon from "@/components/ui/icon";

export const AVATAR_ICONS = ["Smile", "Rocket", "Cat", "Dog", "Bird", "Flower2", "Sun", "Moon", "Star", "Heart", "Coffee", "Music", "Gamepad2", "Bike", "Mountain", "Anchor"];
export const AVATAR_COLORS = ["#2e9d5b", "#2f6fde", "#f08a3c", "#7a4fd6", "#e8679a", "#1f2328", "#0f8b8d", "#c0392b"];

type Props = {
  user: { id: number; name: string; online?: boolean; avatar?: string | null };
  size?: number;
  className?: string;
  ringClass?: string;
  hideOnline?: boolean;
};

export default function UserAvatar({ user, size = 42, className, ringClass = "border-card", hideOnline }: Props) {
  const dot = Math.max(9, Math.round(size * 0.26));
  const av = user.avatar || "";
  const icon = av.startsWith("icon:") ? av.split(":") : null;
  const photo = av.startsWith("https://") ? av : "";
  const bg = icon ? AVATAR_COLORS[Number(icon[2]) % AVATAR_COLORS.length] : undefined;
  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full font-head font-semibold text-foreground",
        !icon && !photo && (user.id % 2 === 0 ? "bg-tile-a" : "bg-tile-b"),
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.34), background: bg }}
    >
      {photo ? (
        <img src={photo} alt={user.name} className="h-full w-full rounded-full object-cover" loading="lazy" />
      ) : icon ? (
        <Icon name={icon[1]} size={Math.round(size * 0.52)} className="text-white" fallback="Smile" />
      ) : (
        initials(user.name)
      )}
      {user.online && !hideOnline && (
        <i
          className={cn("absolute bottom-0 right-0 rounded-full border-2 bg-online", ringClass)}
          style={{ width: dot, height: dot }}
        />
      )}
    </div>
  );
}
