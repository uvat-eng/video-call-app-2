import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import {
  canPickContacts,
  hasNativeContacts,
  nativeContactsGranted,
  parseVcf,
  pickContacts,
  readNativeContacts,
  type BookEntry,
  type PhoneContact,
} from "@/lib/phonebook";
import type { CallKind, User } from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";

type Props = {
  book: BookEntry[];
  syncing: boolean;
  onSync: (list: PhoneContact[]) => Promise<string | null>;
  onMessage: (u: User) => void;
  onCall: (u: User, kind: CallKind) => void;
};

type Mode = "native" | "picker" | "file";

const INVITE_TEXT = "Давай общаться в RuChat — защищённые сообщения и видеозвонки: ";

export default function PhonebookPanel({ book, syncing, onSync, onMessage, onCall }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [ios, setIos] = useState(false);
  const [filter, setFilter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const autoRan = useRef(false);

  const run = async (list: PhoneContact[]) => {
    setError("");
    if (!list.length) return setError("В телефоне не нашлось контактов с номерами");
    const e = await onSync(list);
    if (e) setError(e);
  };

  const fromNative = async () => {
    try {
      await run(await readNativeContacts());
    } catch {
      setError("Разрешите RuChat доступ к контактам в настройках телефона");
    }
  };

  useEffect(() => {
    const m: Mode = hasNativeContacts() ? "native" : canPickContacts() ? "picker" : "file";
    setMode(m);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    if (m === "native" && nativeContactsGranted() && !autoRan.current) {
      autoRan.current = true;
      fromNative();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromPicker = async () => {
    try {
      await run(await pickContacts());
    } catch {
      setError("Доступ к контактам не выдан");
    }
  };

  const fromFile = async (f: File | undefined) => {
    if (!f) return;
    await run(parseVcf(await f.text()));
    if (fileRef.current) fileRef.current.value = "";
  };

  const invite = (e: BookEntry) => {
    const url = window.location.origin;
    const text = INVITE_TEXT + url;
    const sep = ios ? "&" : "?";
    window.location.href = `sms:${e.phone}${sep}body=${encodeURIComponent(text)}`;
  };

  const f = filter.trim().toLowerCase();
  const match = (b: BookEntry) => !f || b.name.toLowerCase().includes(f) || b.phone.includes(f.replace(/\D/g, "") || "@");
  const inApp = book.filter((b) => b.user && match(b));
  const others = book.filter((b) => !b.user && match(b));
  const visibleOthers = showAll || f ? others : others.slice(0, 10);

  const mainAction = mode === "native" ? fromNative : mode === "picker" ? fromPicker : () => fileRef.current?.click();
  const mainLabel = book.length ? "Обновить" : mode === "file" ? "Загрузить контакты" : "Найти друзей";

  return (
    <div className="border-t-8 border-secondary px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-medium">
            <Icon name="BookUser" size={18} />
            Контакты телефона
          </div>
          <p className="mt-1 text-[.85em] text-muted-foreground">
            {book.length
              ? `${book.length} в телефоне · уже в RuChat: ${book.filter((b) => b.user).length}`
              : "Узнайте, кто из ваших знакомых уже пользуется RuChat"}
          </p>
        </div>
        {mode && (
          <button
            onClick={mainAction}
            disabled={syncing}
            className="inline-flex h-[38px] items-center gap-2 rounded-full bg-primary px-[18px] font-medium text-primary-foreground disabled:opacity-60"
          >
            <Icon
              name={syncing ? "Loader2" : book.length ? "RefreshCw" : "Users"}
              size={16}
              className={syncing ? "animate-spin" : ""}
            />
            {syncing ? "Ищем друзей…" : mainLabel}
          </button>
        )}
        <input ref={fileRef} type="file" accept=".vcf,text/vcard,text/x-vcard" hidden onChange={(e) => fromFile(e.target.files?.[0])} />
      </div>

      {!book.length && mode && (
        <div className="mt-4 rounded-xl bg-secondary p-4 text-[.85em] leading-relaxed">
          {mode === "native" && <>Нажмите «Найти друзей» и разрешите доступ к контактам — RuChat сам покажет, кто уже здесь.</>}
          {mode === "picker" && <>Нажмите «Найти друзей», затем «Выбрать все» в открывшемся списке.</>}
          {mode === "file" && ios && (
            <>
              В браузере iPhone доступ к контактам закрыт. Установите RuChat из App Store — там друзья найдутся
              автоматически. А пока: «Контакты» → «Списки» → удерживайте «Все контакты» → «Экспортировать» и
              загрузите файл сюда.
            </>
          )}
          {mode === "file" && !ios && (
            <>Установите приложение RuChat — там друзья найдутся автоматически. В браузере можно загрузить файл контактов (.vcf).</>
          )}
          <div className="mt-2 flex items-center gap-1.5 text-muted-foreground">
            <Icon name="ShieldCheck" size={14} />
            Номера уходят на сервер только в виде зашифрованных отпечатков, список хранится на вашем устройстве.
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-[.85em] text-destructive">{error}</p>}

      {book.length > 12 && (
        <label className="mt-4 flex h-10 items-center gap-2 rounded-full bg-secondary px-4 text-[.93em] text-muted-foreground">
          <Icon name="Search" size={16} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Поиск по имени или номеру"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      )}

      {inApp.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[.8em] font-medium uppercase tracking-wide text-muted-foreground">Уже в RuChat</div>
          <div className="divide-y divide-border">
            {inApp.map((e) => (
              <div key={e.phone} className="grid grid-cols-[42px_1fr_auto] items-center gap-3 py-2.5">
                <UserAvatar user={e.user!} />
                <button onClick={() => onMessage(e.user!)} className="min-w-0 text-left">
                  <div className="truncate font-medium">{e.name}</div>
                  <div className="truncate text-[.85em] text-muted-foreground">{e.phone}</div>
                </button>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onMessage(e.user!)}
                    aria-label="Написать"
                    className="grid h-9 w-9 place-items-center rounded-full bg-secondary transition-colors hover:bg-accent"
                  >
                    <Icon name="MessageCircle" size={16} />
                  </button>
                  <button
                    onClick={() => onCall(e.user!, "audio")}
                    aria-label="Аудиозвонок"
                    className="grid h-9 w-9 place-items-center rounded-full bg-secondary transition-colors hover:bg-accent"
                  >
                    <Icon name="Phone" size={16} />
                  </button>
                  <button
                    onClick={() => onCall(e.user!, "video")}
                    aria-label="Видеозвонок"
                    className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground"
                  >
                    <Icon name="Video" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[.8em] font-medium uppercase tracking-wide text-muted-foreground">Пригласить в RuChat</div>
          <div className="divide-y divide-border">
            {visibleOthers.map((e) => (
              <div key={e.phone} className="grid grid-cols-[1fr_auto] items-center gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate font-medium">{e.name}</div>
                  <div className="truncate text-[.85em] text-muted-foreground">{e.phone}</div>
                </div>
                <button
                  onClick={() => invite(e)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-[.85em] font-medium hover:bg-accent"
                >
                  <Icon name="Send" size={14} />
                  Пригласить
                </button>
              </div>
            ))}
          </div>
          {others.length > 10 && !f && (
            <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-[.85em] font-medium text-primary hover:underline">
              {showAll ? "Свернуть" : `Показать всех (${others.length})`}
            </button>
          )}
        </div>
      )}

      {mode === "file" && book.length > 0 && (
        <button onClick={() => fileRef.current?.click()} className="mt-3 text-[.85em] font-medium text-primary hover:underline">
          Загрузить другой файл контактов
        </button>
      )}
    </div>
  );
}
