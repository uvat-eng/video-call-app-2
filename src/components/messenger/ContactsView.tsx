import { useState } from "react";
import Icon from "@/components/ui/icon";
import type { CallKind, Contact } from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";

type Props = {
  contacts: Contact[];
  onCall: (contactId: string, kind: CallKind) => void;
  onMessage: (contactId: string) => void;
};

export default function ContactsView({ contacts, onCall, onMessage }: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(contacts[0]?.id);
  const q = query.trim().toLowerCase();
  const list = contacts.filter((c) => !q || c.name.toLowerCase().includes(q));
  const online = contacts.filter((c) => c.online).length;
  const selected = contacts.find((c) => c.id === selectedId) ?? contacts[0];

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
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`grid w-full grid-cols-[42px_1fr] items-center gap-3 rounded-xl p-2.5 text-left transition-colors ${
                selected?.id === c.id ? "bg-background" : "hover:bg-background/60"
              }`}
            >
              <UserAvatar contact={c} />
              <div className="min-w-0">
                <div className="truncate font-medium">{c.name}</div>
                <div className="truncate text-[.85em] text-muted-foreground">{c.lastSeen}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {selected && (
        <section className="grid min-h-0 auto-rows-min gap-2.5 overflow-y-auto md:grid-cols-2">
          <div className="flex flex-col items-start gap-4 rounded-[14px] bg-card p-6 md:col-span-2 lg:p-7">
            <UserAvatar contact={selected} size={84} />
            <div>
              <h1 className="hero-title">{selected.name}</h1>
              <p className="mt-2 text-muted-foreground">{selected.lastSeen}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onCall(selected.id, "video")}
                className="inline-flex h-[38px] items-center gap-2 rounded-full bg-primary px-[18px] font-head font-semibold text-primary-foreground"
              >
                <Icon name="Video" size={16} />
                Видеозвонок
              </button>
              <button
                onClick={() => onCall(selected.id, "audio")}
                className="inline-flex h-[38px] items-center gap-2 rounded-full bg-secondary px-[18px] font-head font-semibold text-secondary-foreground"
              >
                <Icon name="Phone" size={16} />
                Аудиозвонок
              </button>
              <button
                onClick={() => onMessage(selected.id)}
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
          <div className="rounded-[14px] bg-gradient-to-br from-tile-a to-tile-b p-5">
            <div className="text-[.8em] text-muted-foreground">Статус</div>
            <div className="mt-1 font-medium">{selected.status}</div>
          </div>
        </section>
      )}
    </>
  );
}
