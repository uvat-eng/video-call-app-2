import { useState } from "react";
import Icon from "@/components/ui/icon";
import { presence, type CallKind, type User } from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";
import PhonebookPanel from "./PhonebookPanel";
import type { BookEntry, PhoneContact } from "@/lib/phonebook";

type Props = {
  contacts: User[];
  onCall: (user: User, kind: CallKind) => void;
  onMessage: (user: User) => void;
  onAdd: (phone: string) => Promise<string | null>;
  book: BookEntry[];
  syncing: boolean;
  onSync: (list: PhoneContact[]) => Promise<string | null>;
};

export default function ContactsView({ contacts, onCall, onMessage, onAdd, book, syncing, onSync }: Props) {
  const bookName = (u: User) => book.find((b) => b.user?.id === u.id)?.name;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [phone, setPhone] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const q = query.trim().toLowerCase();
  const list = contacts.filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q));
  const online = contacts.filter((c) => c.online).length;
  const selected = contacts.find((c) => c.id === selectedId);

  const [inviteTo, setInviteTo] = useState("");
  const [added, setAdded] = useState("");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteTo("");
    setAdded("");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return setAddError("Введите номер полностью, например +7 900 123-45-67");
    setAdding(true);
    setAddError("");
    const error = await onAdd(phone);
    setAdding(false);
    if (error) {
      setAddError(error);
      if (error.includes("нет в RuChat")) setInviteTo(phone);
    } else {
      setAdded("Контакт добавлен");
      setPhone("");
    }
  };

  const sendInvite = () => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const text = `Давай общаться в RuChat — защищённые сообщения и видеозвонки: ${window.location.origin}`;
    window.location.href = `sms:${inviteTo.replace(/[^\d+]/g, "")}${ios ? "&" : "?"}body=${encodeURIComponent(text)}`;
  };

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-card pb-6">
      <div className="px-4 pb-2">
        <label className="flex h-10 items-center gap-3 rounded-full bg-secondary px-4 text-muted-foreground">
          <Icon name="Search" size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени или номеру"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <form onSubmit={add} className="px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-full bg-badge text-badge-foreground">
            <Icon name="UserPlus" size={22} />
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setAddError("");
                setInviteTo("");
              }}
              type="tel"
              placeholder="Новый контакт: +7 900 000-00-00"
              className="h-10 min-w-0 flex-1 rounded-full bg-secondary px-4 outline-none placeholder:text-muted-foreground"
            />
            <button
              disabled={adding || !phone.trim()}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              aria-label="Добавить"
            >
              <Icon name={adding ? "Loader2" : "Check"} size={18} className={adding ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        {addError && <p className="mt-2 pl-[62px] text-[.85em] text-destructive">{addError}</p>}
        {added && <p className="mt-2 pl-[62px] text-[.85em] text-primary">{added}</p>}
        {inviteTo && (
          <button
            type="button"
            onClick={sendInvite}
            className="ml-[62px] mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[.85em] font-medium text-accent-foreground"
          >
            <Icon name="Send" size={14} />
            Пригласить по СМС
          </button>
        )}
      </form>

      <div className="flex items-baseline justify-between px-4 pb-1 pt-3">
        <span className="font-medium">Контакты в RuChat</span>
        <span className="text-[.8em] text-muted-foreground">{online} в сети</span>
      </div>
      {contacts.length === 0 && (
        <p className="px-4 py-6 text-center text-muted-foreground">Добавьте первого человека по номеру телефона</p>
      )}
      {list.map((c) => {
        const open = selected?.id === c.id && selectedId !== null;
        return (
          <div key={c.id}>
            <div className="flex items-center gap-3 px-4">
              <button onClick={() => setSelectedId(open ? null : c.id)} aria-label="Подробнее">
                <UserAvatar user={c} size={50} />
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-1 border-b border-border py-3">
                <button onClick={() => onMessage(c)} className="min-w-0 flex-1 text-left">
                  <div className="truncate font-medium">{bookName(c) ?? c.name}</div>
                  <div className="truncate text-[.88em] text-muted-foreground">{c.status || presence(c)}</div>
                </button>
                <button
                  onClick={() => onCall(c, "audio")}
                  aria-label="Аудиозвонок"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full active:bg-secondary"
                >
                  <Icon name="Phone" size={20} />
                </button>
                <button
                  onClick={() => onCall(c, "video")}
                  aria-label="Видеозвонок"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full active:bg-secondary"
                >
                  <Icon name="Video" size={21} />
                </button>
              </div>
            </div>
            {open && (
              <div className="mx-4 mb-2 mt-1 rounded-xl bg-secondary p-4 text-[.9em]">
                <div className="text-muted-foreground">Телефон</div>
                <div className="font-medium">{c.phone}</div>
                <div className="mt-2 text-muted-foreground">Статус</div>
                <div className="font-medium">{c.status || "—"}</div>
                <div className="mt-2 text-muted-foreground">{presence(c)}</div>
              </div>
            )}
          </div>
        );
      })}

      <div className="mt-4">
        <PhonebookPanel book={book} syncing={syncing} onSync={onSync} onMessage={onMessage} onCall={onCall} />
      </div>
    </div>
  );
}