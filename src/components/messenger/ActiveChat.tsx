import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { CallKind, Chat, Contact } from "@/lib/messenger-data";

type Props = {
  chat: Chat;
  contact: Contact;
  typing: boolean;
  onSend: (text: string) => void;
  onCall: (kind: CallKind) => void;
  onBack?: () => void;
  className?: string;
};

export default function ActiveChat({ chat, contact, typing, onSend, onCall, onBack, className }: Props) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, chat.id, typing]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };

  return (
    <section className={cn("grid min-h-0 grid-rows-[auto_1fr_auto] gap-2.5", className)}>
      {/* Шапка чата */}
      <div className="grid grid-cols-[auto_1fr] items-end gap-3 overflow-hidden rounded-[14px] bg-card px-5 py-5 sm:grid-cols-[auto_1fr_auto] lg:px-7 lg:py-[26px]">
        <span className="self-center">
          {onBack && (
            <button onClick={onBack} className="rounded-full bg-background p-2 lg:hidden" aria-label="Назад">
              <Icon name="ArrowLeft" size={18} />
            </button>
          )}
        </span>
        <div className="min-w-0">
          <h1 className="hero-title truncate">{contact.name}</h1>
          <p className="mt-2 truncate text-muted-foreground">
            {typing ? <span className="text-online">печатает…</span> : contact.lastSeen}
            {!typing && chat.contactId === "mk" && " · последний звонок сегодня, 14:20"}
          </p>
        </div>
        <div className="col-span-2 flex flex-row items-start gap-2 sm:col-span-1 sm:flex-col">
          <button
            onClick={() => onCall("video")}
            className="inline-flex h-[38px] items-center gap-2 rounded-full bg-primary px-[18px] font-head font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-95"
          >
            <span className="h-2 w-2 rounded-full bg-online" />
            Видеозвонок
          </button>
          <button
            onClick={() => onCall("audio")}
            className="inline-flex h-[38px] items-center gap-2 rounded-full bg-secondary px-[18px] font-head font-semibold text-secondary-foreground transition-transform hover:scale-[1.03] active:scale-95"
          >
            Аудиозвонок
          </button>
        </div>
      </div>

      {/* Лента + плитка звонка */}
      <div className={cn("grid min-h-0 gap-2.5", chat.scheduled ? "md:grid-cols-[1fr_300px]" : "grid-cols-1")}>
        <div
          ref={scrollRef}
          className="scroll-thin flex min-h-0 flex-col gap-2 overflow-y-auto rounded-[14px] bg-card px-6 py-[22px]"
        >
          <div className="mt-auto" />
          {chat.messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[78%] animate-msg-in rounded-2xl px-3.5 py-2.5 leading-[1.4] md:max-w-[62%]",
                m.from === "me" ? "self-end bg-accent text-accent-foreground" : "self-start bg-background",
              )}
            >
              {m.author && <div className="mb-0.5 text-[.75em] font-medium text-primary">{m.author}</div>}
              {m.text}
              <small className="mt-0.5 flex items-center justify-end gap-1 text-[.75em] opacity-60">
                {m.time}
                {m.from === "me" && <Icon name={m.read ? "CheckCheck" : "Check"} size={14} />}
              </small>
            </div>
          ))}
          {typing && (
            <div className="flex gap-1 self-start rounded-2xl bg-background px-4 py-3.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          )}
        </div>

        {chat.scheduled && (
          <div className="hidden flex-col justify-between rounded-[14px] bg-gradient-to-br from-tile-a to-tile-b p-[18px] md:flex">
            <div className="flex items-center justify-between font-head font-semibold">
              <span className="flex items-center gap-1.5">
                <Icon name={chat.scheduled.kind === "video" ? "Video" : "Phone"} size={16} />
                {chat.scheduled.kind === "video" ? "Видео" : "Аудио"}
              </span>
              <span className="rounded-md bg-card px-2 py-[3px] font-body text-[.8em] font-medium">HD</span>
            </div>
            <div>
              <div className="font-head text-[2.6em] font-semibold leading-none tracking-[-0.04em]">
                {chat.scheduled.time}
              </div>
              <p className="mt-1.5 text-muted-foreground">Запланирован звонок</p>
              <button
                onClick={() => onCall(chat.scheduled!.kind)}
                className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-card px-4 text-[.85em] font-medium transition-colors hover:bg-background"
              >
                <Icon name="PhoneForwarded" size={14} />
                Начать сейчас
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Поле ввода */}
      <form onSubmit={submit} className="flex items-center gap-2.5 rounded-[14px] bg-card p-2.5">
        <button type="button" className="hidden rounded-full p-2.5 text-muted-foreground hover:bg-background sm:block" aria-label="Прикрепить">
          <Icon name="Paperclip" size={18} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Сообщение"
          className="h-11 min-w-0 flex-1 rounded-full bg-background px-[18px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="inline-flex h-[38px] items-center gap-2 rounded-full bg-primary px-[18px] font-head font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
        >
          <span className="hidden sm:inline">Отправить</span>
          <Icon name="SendHorizontal" size={16} className="sm:hidden" />
        </button>
      </form>
    </section>
  );
}