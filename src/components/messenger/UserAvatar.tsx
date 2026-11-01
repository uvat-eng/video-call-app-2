import { cn } from "@/lib/utils";
import { initials } from "@/lib/messenger-data";

type Props = {
  user: { id: number; name: string; online?: boolean };
  size?: number;
  className?: string;
  ringClass?: string;
  hideOnline?: boolean;
};

export default function UserAvatar({ user, size = 42, className, ringClass = "border-card", hideOnline }: Props) {
  const dot = Math.max(9, Math.round(size * 0.26));
  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full font-head font-semibold text-foreground",
        user.id % 2 === 0 ? "bg-tile-a" : "bg-tile-b",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.34) }}
    >
      {initials(user.name)}
      {user.online && !hideOnline && (
        <i
          className={cn("absolute bottom-0 right-0 rounded-full border-2 bg-online", ringClass)}
          style={{ width: dot, height: dot }}
        />
      )}
    </div>
  );
}
