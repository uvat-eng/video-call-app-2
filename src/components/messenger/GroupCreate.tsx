import { useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";

type Props = {
  contacts: User[];
  onCancel: () => void;
  onCreate: (title: string, users: User[]) => Promise<string | null>;
};

export default function GroupCreate({ contacts, onCancel, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const q = query.trim().toLowerCase();
  const list = contacts.filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q));

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = async () => {
    setError("");
    if (!title.trim()) return setError("Придумайте название группы");
    if (!selected.length) return setError("Выберите хотя бы одного участника");
    setBusy(true);
    const err = await onCreate(
      title.trim(),
      contacts.filter((c) => selected.includes(c.id)),
    );
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-foreground/40 backdrop-blur-sm sm:place-items-center">
      <div className="app-text flex max-h-[92dvh] w-full max-w-[460px] flex-col overflow-hidden rounded-t-[14px] bg-card text-foreground sm:rounded-[14px]">
        <div className="flex items-center justify-between gap-3 p-5 pb-3">
          <h2 className="text-[1.4em] font-semibold tracking-[-0.03em]">Новая группа</h2>
          <button onClick={onCancel} aria-label="Закрыть" className="rounded-full bg-background p-2">
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="mx-5 mb-3 flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-tile-a to-tile-b">
            <Icon name="Users" size={22} />
          </span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="Название группы"
            className="h-12 w-full rounded-xl bg-background px-4 text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20"
          />
        </div>
        <label className="mx-5 mb-2 flex h-[38px] items-center gap-2 rounded-full bg-background px-4 text-muted-foreground">
          <Icon name="Search" size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск участников"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <p className="mx-5 mb-1 text-[.85em] text-muted-foreground">Участники: {selected.length}</p>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3">
          {list.length === 0 && (
            <p className="py-8 text-center text-[.87em] text-muted-foreground">
              {contacts.length ? "Никого не найдено" : "Сначала добавьте контакты"}
            </p>
          )}
          {list.map((c) => {
            const on = selected.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className={cn(
                  "grid w-full grid-cols-[42px_1fr_auto] items-center gap-3 rounded-xl p-2.5 text-left transition-colors",
                  on ? "bg-background" : "hover:bg-background/60",
                )}
              >
                <UserAvatar user={c} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="truncate text-[.85em] text-muted-foreground">
                    {c.publicKey ? c.phone : "получит сообщения, когда зайдёт в RuChat"}
                  </div>
                </div>
                <span
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-full border-2",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {on && <Icon name="Check" size={14} />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="border-t border-border p-4">
          {error && <p className="mb-2 text-center text-[.87em] text-destructive">{error}</p>}
          <button
            disabled={busy}
            onClick={submit}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-head font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Icon name={busy ? "Loader2" : "Users"} size={18} className={busy ? "animate-spin" : ""} />
            Создать группу
          </button>
        </div>
      </div>
    </div>
  );
}
