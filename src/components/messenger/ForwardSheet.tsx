import { useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { ChatItem } from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";

type Props = {
  chats: ChatItem[];
  preview: string;
  onCancel: () => void;
  onSend: (chatIds: number[]) => Promise<void>;
};

export default function ForwardSheet({ chats, preview, onCancel, onSend }: Props) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const q = query.trim().toLowerCase();
  const list = chats.filter((c) => !q || c.peer.name.toLowerCase().includes(q));

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 5 ? p : [...p, id]));

  const names = chats.filter((c) => picked.includes(c.id)).map((c) => c.peer.name.split(" ")[0]);

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-card">
      <header className="pt-safe shrink-0 border-b border-border">
        <div className="flex h-14 items-center gap-2 px-1">
          <button onClick={onCancel} className="grid h-10 w-10 place-items-center rounded-full active:bg-secondary" aria-label="Закрыть">
            <Icon name="X" size={22} />
          </button>
          <div className="min-w-0">
            <h2 className="text-[1.15em] font-medium leading-tight">Переслать</h2>
            <p className="truncate text-[.78em] text-muted-foreground">{preview}</p>
          </div>
        </div>
        <div className="px-4 pb-2">
          <label className="flex h-10 items-center gap-3 rounded-full bg-secondary px-4 text-muted-foreground">
            <Icon name="Search" size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск"
              className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-24">
        <div className="px-4 pb-1 pt-3 text-[.85em] font-medium text-muted-foreground">Недавние чаты</div>
        {list.length === 0 && <p className="px-4 py-8 text-center text-muted-foreground">Ничего не найдено</p>}
        {list.map((c) => {
          const on = picked.includes(c.id);
          return (
            <button key={c.id} onClick={() => toggle(c.id)} className="flex w-full items-center gap-3 px-4 text-left active:bg-secondary">
              <span className="relative">
                {c.group ? (
                  <span className="grid h-[46px] w-[46px] place-items-center rounded-full bg-secondary text-muted-foreground">
                    <Icon name="Users" size={22} />
                  </span>
                ) : (
                  <UserAvatar user={{ ...c.peer, online: false }} size={46} />
                )}
                {on && (
                  <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-card bg-badge text-badge-foreground">
                    <Icon name="Check" size={12} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1 border-b border-border py-3">
                <span className="block truncate font-medium">{c.peer.name}</span>
                <span className="block truncate text-[.85em] text-muted-foreground">
                  {c.group ? `${c.group.members.length} участн.` : c.peer.status || c.peer.phone}
                </span>
              </span>
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full border-2",
                  on ? "border-badge bg-badge text-badge-foreground" : "border-muted-foreground/40",
                )}
              >
                {on && <Icon name="Check" size={14} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
      {picked.length > 0 && (
        <div className="pb-safe absolute inset-x-0 bottom-0 flex items-center gap-3 border-t border-border bg-secondary px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-[.9em]">{names.join(", ")}</span>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSend(picked);
              setBusy(false);
            }}
            aria-label="Отправить"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-badge text-badge-foreground shadow disabled:opacity-60"
          >
            <Icon name={busy ? "Loader2" : "SendHorizontal"} size={21} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      )}
    </div>
  );
}
