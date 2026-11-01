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
  onNewGroup?: () => void;
  className?: string;
};

type Filter = "all" | "unread" | "groups";

export default function ChatList({ chats, activeId, loaded, onSelect, onNew, onNewGroup, className }: Props) {
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

  const totalUnread = chats.reduce((s, c) => s + c.unread, 0);

  return (
    <aside className={cn("flex min-h-0 flex-col overflow-hidden rounded-[14px] bg-card px-2.5 py-[18px]", className)}>
      <div className="flex items-center justify-between px-2.5 pb-3">
        <h2 className="text-[1.6em] font-semibold tracking-[-0.03em]">Чаты</h2>
        <div className="flex items-center gap-2">
          {totalUnread > 0 && <span className="text-[.8em] text-muted-foreground">{totalUnread} новых</span>}
          {onNewGroup && (
            <button
              onClick={onNewGroup}
              aria-label="Новая группа"
              title="Новая группа"
              className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-secondary-foreground transition-transform hover:scale-105"
            >
              <Icon name="Users" size={16} />
            </button>
          )}
          <button
            onClick={onNew}
            aria-label="Новый чат"
            className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
          >
            <Icon name="Plus" size={16} />
          </button>
        </div>
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
        {!loaded && (
          <div className="grid place-items-center py-10 text-muted-foreground">
            <Icon name="Loader2" size={20} className="animate-spin" />
          </div>
        )}
        {loaded && chats.length === 0 && (
          <div className="px-2.5 py-8 text-center text-[.87em] text-muted-foreground">
            Пока нет чатов.
            <br />
            <button onClick={onNew} className="mt-2 font-medium text-primary underline-offset-2 hover:underline">
              Найти человека по номеру
            </button>
          </div>
        )}
        {loaded && chats.length > 0 && visible.length === 0 && (
          <p className="px-2.5 py-8 text-center text-[.87em] text-muted-foreground">Ничего не найдено</p>
        )}
        {visible.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={cn(
              "grid w-full grid-cols-[42px_1fr_auto] items-center gap-3 rounded-xl p-2.5 text-left transition-colors",
              c.id === activeId ? "bg-background" : "hover:bg-background/60",
            )}
          >
            {c.group ? (
              <span className="grid h-[42px] w-[42px] place-items-center rounded-full bg-gradient-to-br from-tile-a to-tile-b">
                <Icon name="Users" size={18} />
              </span>
            ) : (
              <UserAvatar user={c.peer} />
            )}
            <div className="min-w-0">
              <div className="truncate font-medium">{c.peer.name}</div>
              <div className="truncate text-[.87em] text-muted-foreground">
                {c.lastText ? `${c.lastMine ? "Вы: " : ""}${c.lastText}` : c.group ? `${c.group.members.length} участн.` : "Новый чат"}
              </div>
            </div>
            <div className="text-right text-[.8em] text-muted-foreground">
              {shortTime(c.lastAt)}
              <br />
              {c.unread > 0 && (
                <span className="mt-1 inline-block h-5 min-w-5 rounded-full bg-accent px-1.5 text-center text-[.9em] font-medium leading-5 text-accent-foreground">
                  {c.unread}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
