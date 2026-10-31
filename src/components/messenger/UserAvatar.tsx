import { cn } from "@/lib/utils";
import type { Contact } from "@/lib/messenger-data";

type Props = {
  contact: Pick<Contact, "initials" | "tone" | "online">;
  size?: number;
  className?: string;
  ringClass?: string;
};

export default function UserAvatar({ contact, size = 42, className, ringClass = "border-card" }: Props) {
  const dot = Math.max(9, Math.round(size * 0.26));
  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full font-head font-semibold text-foreground",
        contact.tone === "a" ? "bg-tile-a" : "bg-tile-b",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.34) }}
    >
      {contact.initials}
      {contact.online && (
        <i
          className={cn("absolute bottom-0 right-0 rounded-full border-2 bg-online", ringClass)}
          style={{ width: dot, height: dot }}
        />
      )}
    </div>
  );
}
