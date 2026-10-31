import { useMemo, useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { Chat, Contact } from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";

type Props = {
  chats: Chat[];
  contacts: Record<string, Contact>;
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
};

type Filter = "all" | "unread" | "groups";

export default function ChatList({ chats, contacts, activeId, onSelect, className }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats.filter((c) => {
      const name = contacts[c.contactId]?.name.toLowerCase() ?? "";
      if (q && !name.includes(q) && !c.preview.toLowerCase().includes(q)) return false;
      if (filter === "unread" && c.unread === 0) return false;
      if (filter === "groups" && !c.isGroup) return false;
      return true;
    });
  }, [chats, contacts, query, filter]);

  const totalUnread = chats.reduce((s, c) => s + c.unread, 0);

  return (
    <aside className={cn("flex min-h-0 flex-col overflow-hidden rounded-[14px] bg-card px-2.5 py-[18px]", className)}>
      <div className="flex items-baseline justify-between px-2.5 pb-3">
        <h2 className="text-[1.6em] font-semibold tracking-[-0.03em]">Чаты</h2>
        {totalUnread > 0 && <span className="text-[.8em] text-muted-foreground">{totalUnread} новых</span>}
      </div>
      <label className="mx-2.5 mb-2.5 flex h-[38px] items-center gap-2 rounded-full bg-background px-4 text-[.93em] text-muted-foreground">
        <Icon name="Search" size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск"
          className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Очистить">
            <Icon name="X" size={14} />
          </button>
        )}
      </label>
      <div className="mx-2.5 mb-2 flex gap-1.5 text-[.8em]">
        {(
          [
            ["all", "Все"],
            ["unread", "Непрочитанные"],
            ["groups", "Группы"],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-full px-3 py-1 font-medium transition-colors",
              filter === id ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground hover:bg-border",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="scroll-thin -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {visible.length === 0 && (
          <p className="px-2.5 py-8 text-center text-[.87em] text-muted-foreground">Ничего не найдено</p>
        )}
        {visible.map((c) => {
          const contact = contacts[c.contactId];
          if (!contact) return null;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "grid w-full grid-cols-[42px_1fr_auto] items-center gap-3 rounded-xl p-2.5 text-left transition-colors",
                c.id === activeId ? "bg-background" : "hover:bg-background/60",
              )}
            >
              <UserAvatar contact={contact} />
              <div className="min-w-0">
                <div className="truncate font-medium">{contact.name}</div>
                <div className="truncate text-[.87em] text-muted-foreground">{c.preview}</div>
              </div>
              <div className="text-right text-[.8em] text-muted-foreground">
                {c.time}
                <br />
                {c.unread > 0 && (
                  <span className="mt-1 inline-block h-5 min-w-5 rounded-full bg-accent px-1.5 text-center text-[.9em] font-medium leading-5 text-accent-foreground">
                    {c.unread}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
