import { useState } from "react";
import Icon from "@/components/ui/icon";
import { presence, type CallKind, type User } from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";

type Props = {
  contacts: User[];
  onCall: (user: User, kind: CallKind) => void;
  onMessage: (user: User) => void;
  onAdd: (phone: string) => Promise<string | null>;
};

export default function ContactsView({ contacts, onCall, onMessage, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [phone, setPhone] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const q = query.trim().toLowerCase();
  const list = contacts.filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q));
  const online = contacts.filter((c) => c.online).length;
  const selected = contacts.find((c) => c.id === selectedId) ?? contacts[0];

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setAdding(true);
    setAddError("");
    const error = await onAdd(phone);
    setAdding(false);
    if (error) setAddError(error);
    else setPhone("");
  };

  return (
    <>
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-[14px] bg-card px-2.5 py-[18px]">
        <div className="flex items-baseline justify-between px-2.5 pb-3">
          <h2 className="text-[1.6em] font-semibold tracking-[-0.03em]">Контакты</h2>
          <span className="text-[.8em] text-muted-foreground">{online} в сети</span>
        </div>
        <label className="mx-2.5 mb-2.5 flex h-[38px] items-center gap-2 rounded-full bg-background px-4 text-[.93em] text-muted-foreground">
          <Icon name="Search" size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти контакт"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {contacts.length === 0 && (
            <p className="px-2.5 py-8 text-center text-[.87em] text-muted-foreground">
              Добавьте первого человека по номеру телефона
            </p>
          )}
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`grid w-full grid-cols-[42px_1fr] items-center gap-3 rounded-xl p-2.5 text-left transition-colors ${
                selected?.id === c.id ? "bg-background" : "hover:bg-background/60"
              }`}
            >
              <UserAvatar user={c} />
              <div className="min-w-0">
                <div className="truncate font-medium">{c.name}</div>
                <div className="truncate text-[.85em] text-muted-foreground">{presence(c)}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="grid min-h-0 auto-rows-min gap-2.5 overflow-y-auto md:grid-cols-2">
        <form onSubmit={add} className="rounded-[14px] bg-gradient-to-br from-tile-a to-tile-b p-5 md:col-span-2 lg:p-6">
          <div className="font-head text-[1.1em] font-semibold">Добавить контакт</div>
          <p className="mb-3 text-[.85em] text-muted-foreground">Человек должен быть зарегистрирован в RusAPP</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              placeholder="+7 900 000-00-00"
              className="h-[42px] min-w-0 flex-1 rounded-full bg-card px-[18px] outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20"
            />
            <button
              disabled={adding}
              className="inline-flex h-[42px] items-center gap-2 rounded-full bg-primary px-[18px] font-head font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Icon name={adding ? "Loader2" : "UserPlus"} size={16} className={adding ? "animate-spin" : ""} />
              Добавить
            </button>
          </div>
          {addError && <p className="mt-2 text-[.85em] text-destructive">{addError}</p>}
        </form>

        {selected && (
          <>
            <div className="flex flex-col items-start gap-4 rounded-[14px] bg-card p-6 md:col-span-2 lg:p-7">
              <UserAvatar user={selected} size={84} />
              <div>
                <h1 className="hero-title">{selected.name}</h1>
                <p className="mt-2 text-muted-foreground">{presence(selected)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onCall(selected, "video")}
                  className="inline-flex h-[38px] items-center gap-2 rounded-full bg-primary px-[18px] font-head font-semibold text-primary-foreground"
                >
                  <Icon name="Video" size={16} />
                  Видеозвонок
                </button>
                <button
                  onClick={() => onCall(selected, "audio")}
                  className="inline-flex h-[38px] items-center gap-2 rounded-full bg-secondary px-[18px] font-head font-semibold text-secondary-foreground"
                >
                  <Icon name="Phone" size={16} />
                  Аудиозвонок
                </button>
                <button
                  onClick={() => onMessage(selected)}
                  className="inline-flex h-[38px] items-center gap-2 rounded-full bg-secondary px-[18px] font-head font-semibold text-secondary-foreground"
                >
                  <Icon name="MessageCircle" size={16} />
                  Написать
                </button>
              </div>
            </div>
            <div className="rounded-[14px] bg-card p-5">
              <div className="text-[.8em] text-muted-foreground">Телефон</div>
              <div className="mt-1 font-medium">{selected.phone}</div>
            </div>
            <div className="rounded-[14px] bg-card p-5">
              <div className="text-[.8em] text-muted-foreground">Статус</div>
              <div className="mt-1 font-medium">{selected.status || "—"}</div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
