import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { canPickContacts, parseVcf, pickContacts, type BookEntry, type PhoneContact } from "@/lib/phonebook";
import type { CallKind, User } from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";
import { cn } from "@/lib/utils";

type Props = {
  book: BookEntry[];
  syncing: boolean;
  onSync: (list: PhoneContact[]) => Promise<string | null>;
  onMessage: (u: User) => void;
  onCall: (u: User, kind: CallKind) => void;
};

const INVITE_TEXT = "Давай общаться в RuChat — защищённые сообщения и видеозвонки: ";

export default function PhonebookPanel({ book, syncing, onSync, onMessage, onCall }: Props) {
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [ios, setIos] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPicker(canPickContacts());
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
  }, []);

  const run = async (list: PhoneContact[]) => {
    setError("");
    if (!list.length) return setError("Контакты с номерами не найдены");
    const e = await onSync(list);
    if (e) setError(e);
  };

  const fromPhone = async () => {
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

  const invite = async (e: BookEntry) => {
    const url = window.location.origin;
    const text = INVITE_TEXT + url;
    if (navigator.share) {
      navigator.share({ title: "RuChat", text, url }).catch(() => null);
    } else {
      window.location.href = `sms:${e.phone}?body=${encodeURIComponent(text)}`;
    }
  };

  const inApp = book.filter((b) => b.user);
  const others = book.filter((b) => !b.user);
  const visibleOthers = showAll ? others : others.slice(0, 8);

  return (
    <div className="rounded-[14px] bg-card p-5 md:col-span-2 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-head text-[1.1em] font-semibold">
            <Icon name="BookUser" size={18} />
            Контакты телефона
          </div>
          <p className="mt-1 text-[.85em] text-muted-foreground">
            {book.length
              ? `${book.length} номеров · в RuChat: ${inApp.length}`
              : "Найдите, кто из ваших знакомых уже пользуется RuChat"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {picker && (
            <button
              onClick={fromPhone}
              disabled={syncing}
              className="inline-flex h-[38px] items-center gap-2 rounded-full bg-primary px-[18px] font-head font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Icon name={syncing ? "Loader2" : "Smartphone"} size={16} className={syncing ? "animate-spin" : ""} />
              {book.length ? "Добавить ещё" : "Выбрать из телефона"}
            </button>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={syncing}
            className={cn(
              "inline-flex h-[38px] items-center gap-2 rounded-full px-[18px] font-head font-semibold disabled:opacity-60",
              picker ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground",
            )}
          >
            <Icon name={syncing && !picker ? "Loader2" : "FileUp"} size={16} className={syncing && !picker ? "animate-spin" : ""} />
            Загрузить файл контактов
          </button>
          <input ref={fileRef} type="file" accept=".vcf,text/vcard,text/x-vcard" hidden onChange={(e) => fromFile(e.target.files?.[0])} />
        </div>
      </div>

      {!book.length && (
        <div className="mt-4 rounded-xl bg-gradient-to-br from-tile-a to-tile-b p-4 text-[.85em] leading-relaxed">
          {picker ? (
            <>Нажмите «Выбрать из телефона», затем «Выбрать все» в открывшемся списке.</>
          ) : ios ? (
            <>
              На iPhone: откройте «Контакты» → «Списки» → удерживайте «Все контакты» → «Экспортировать». Сохраните файл и
              загрузите его сюда.
            </>
          ) : (
            <>Выгрузите контакты из телефона в файл (.vcf) и загрузите его сюда. На Android с Chrome доступен выбор прямо из телефона.</>
          )}
          <div className="mt-2 flex items-center gap-1.5 text-muted-foreground">
            <Icon name="ShieldCheck" size={14} />
            Номера уходят на сервер только в виде зашифрованных отпечатков, а список хранится на вашем устройстве.
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-[.85em] text-destructive">{error}</p>}

      {inApp.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[.8em] font-medium uppercase tracking-wide text-muted-foreground">Уже в RuChat</div>
          <div className="divide-y divide-border">
            {inApp.map((e) => (
              <div key={e.phone} className="grid grid-cols-[42px_1fr_auto] items-center gap-3 py-2.5">
                <UserAvatar user={e.user!} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{e.name}</div>
                  <div className="truncate text-[.85em] text-muted-foreground">{e.phone}</div>
                </div>
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
          <div className="mb-1 text-[.8em] font-medium uppercase tracking-wide text-muted-foreground">Пригласить</div>
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
          {others.length > 8 && (
            <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-[.85em] font-medium text-primary hover:underline">
              {showAll ? "Свернуть" : `Показать всех (${others.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
