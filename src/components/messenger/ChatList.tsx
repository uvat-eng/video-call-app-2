import { useMemo, useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { shortTime, type ChatItem } from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";

type Props = {
  chats: ChatItem[];
  activeId: number | null;
  loaded: boolean;
  onSelect: (id: number) => void;
  onNew: () => void;
  className?: string;
};

type Filter = "all" | "unread" | "groups";

export default function ChatList({ chats, activeId, loaded, onSelect, onNew, className }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats.filter((c) => {
      if (q && !c.peer.name.toLowerCase().includes(q) && !(c.lastText ?? "").toLowerCase().includes(q)) return false;
      if (filter === "unread" && c.unread === 0) return false;
      if (filter === "groups" && !c.group) return false;
      return true;
    });
  }, [chats, query, filter]);

  const unreadChats = chats.filter((c) => c.unread > 0).length;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col bg-card", className)}>
      <div className="px-4 pb-2">
        <label className="flex h-10 items-center gap-3 rounded-full bg-secondary px-4 text-muted-foreground">
          <Icon name="Search" size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Очистить">
              <Icon name="X" size={16} />
            </button>
          )}
        </label>
        <div className="mt-2.5 flex gap-2 text-[.88em]">
          {(
            [
              ["all", "Все"],
              ["unread", unreadChats ? `Непрочитанное ${unreadChats}` : "Непрочитанное"],
              ["groups", "Группы"],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={cn(
                "rounded-full px-3.5 py-1.5 font-medium transition-colors",
                filter === id ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-24">
        {!loaded && (
          <div className="grid place-items-center py-10 text-muted-foreground">
            <Icon name="Loader2" size={22} className="animate-spin" />
          </div>
        )}
        {loaded && chats.length === 0 && (
          <div className="px-8 py-12 text-center text-muted-foreground">
            Пока нет чатов
            <br />
            <button onClick={onNew} className="mt-3 font-medium text-primary">
              Найти человека по номеру
            </button>
          </div>
        )}
        {loaded && chats.length > 0 && visible.length === 0 && (
          <p className="px-4 py-10 text-center text-muted-foreground">Ничего не найдено</p>
        )}
        {visible.map((c) => {
          const unread = c.unread > 0;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "flex w-full items-center gap-3 px-4 text-left transition-colors active:bg-secondary",
                c.id === activeId ? "bg-secondary" : "hover:bg-secondary/60",
              )}
            >
              {c.group ? (
                <span className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                  <Icon name="Users" size={24} />
                </span>
              ) : (
                <UserAvatar user={c.peer} size={50} ringClass="border-card" />
              )}
              <div className="min-w-0 flex-1 border-b border-border py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[1.03em] font-medium">{c.peer.name}</span>
                  <span className={cn("shrink-0 text-[.75em]", unread ? "font-medium text-badge" : "text-muted-foreground")}>
                    {shortTime(c.lastAt)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 truncate text-[.9em] text-muted-foreground">
                    {c.lastMine && c.lastText && <Icon name="CheckCheck" size={16} className="shrink-0" />}
                    <span className="truncate">
                      {c.lastText ?? (c.group ? `${c.group.members.length} участн.` : "Новый чат")}
                    </span>
                  </span>
                  {unread && (
                    <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-badge px-1.5 text-[.72em] font-semibold text-badge-foreground">
                      {c.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
        {loaded && chats.length > 0 && (
          <p className="flex items-center justify-center gap-1.5 px-6 py-5 text-center text-[.78em] text-muted-foreground">
            <Icon name="Lock" size={12} />
            Ваши личные сообщения защищены сквозным шифрованием
          </p>
        )}
      </div>
    </div>
  );
}
