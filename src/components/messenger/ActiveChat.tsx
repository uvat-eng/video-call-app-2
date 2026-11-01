import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { hhmm, presence, type CallKind, type Message, type User } from "@/lib/messenger-data";
import { safetyCode } from "@/lib/e2e";

type Props = {
  peer: User;
  myKey: string;
  messages: Message[];
  loading: boolean;
  error?: string;
  onSend: (text: string) => void;
  onCall: (kind: CallKind) => void;
  onBack?: () => void;
  className?: string;
};

export default function ActiveChat({ peer, myKey, messages, loading, error, onSend, onCall, onBack, className }: Props) {
  const [text, setText] = useState("");
  const [code, setCode] = useState<string[] | null>(null);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    setShowCode(false);
    setCode(null);
    if (peer.publicKey) safetyCode(myKey, peer.publicKey).then(setCode);
  }, [peer.publicKey, myKey]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, peer.id]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };

  return (
    <section className={cn("grid min-h-0 grid-rows-[auto_1fr_auto] gap-2.5", className)}>
      <div className="grid grid-cols-[auto_1fr] items-end gap-3 overflow-hidden rounded-[14px] bg-card px-5 py-5 sm:grid-cols-[auto_1fr_auto] lg:px-7 lg:py-[26px]">
        <span className="self-center">
          {onBack && (
            <button onClick={onBack} className="rounded-full bg-background p-2 lg:hidden" aria-label="Назад">
              <Icon name="ArrowLeft" size={18} />
            </button>
          )}
        </span>
        <div className="min-w-0">
          <h1 className="hero-title truncate">{peer.name}</h1>
          <p className={cn("mt-2 truncate", peer.online ? "text-online" : "text-muted-foreground")}>{presence(peer)}</p>
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

      <div
        ref={scrollRef}
        className="scroll-thin flex min-h-0 flex-col gap-2 overflow-y-auto rounded-[14px] bg-card px-6 py-[22px]"
      >
        <button
          type="button"
          onClick={() => setShowCode((v) => !v)}
          className="mx-auto mb-2 flex max-w-[460px] items-start gap-2 rounded-xl bg-gradient-to-br from-tile-a to-tile-b px-3.5 py-2.5 text-left text-[.8em] leading-snug"
        >
          <Icon name={peer.publicKey ? "Lock" : "LockOpen"} size={14} className="mt-0.5 shrink-0" />
          <span>
            {peer.publicKey
              ? "Сообщения и звонки защищены сквозным шифрованием. Сервер не хранит переписку — она есть только на устройствах собеседников. Нажмите, чтобы сверить код безопасности."
              : `${peer.name} ещё не включил(а) шифрование. Писать можно будет, когда собеседник откроет RusAPP.`}
            {showCode && code && (
              <span className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 font-head text-[1.15em] font-semibold tabular-nums tracking-wider">
                {code.map((g, i) => (
                  <span key={i}>{g}</span>
                ))}
                <span className="col-span-3 mt-1 font-body text-[.8em] font-normal tracking-normal text-muted-foreground">
                  Если у собеседника такие же цифры — вас никто не подслушивает.
                </span>
              </span>
            )}
          </span>
        </button>
        <div className="mt-auto" />
        {loading && messages.length === 0 && (
          <div className="grid place-items-center py-6 text-muted-foreground">
            <Icon name="Loader2" size={20} className="animate-spin" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <p className="py-6 text-center text-muted-foreground">Здесь пока пусто. Напишите первое сообщение</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[78%] animate-msg-in whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 leading-[1.4] md:max-w-[62%]",
              m.mine ? "self-end bg-accent text-accent-foreground" : "self-start bg-background",
              m.id < 0 && "opacity-70",
            )}
          >
            {m.text}
            <small className="mt-0.5 flex items-center justify-end gap-1 text-[.75em] opacity-60">
              {hhmm(m.at)}
              {m.mine && <Icon name={m.id < 0 ? "Clock" : m.read ? "CheckCheck" : "Check"} size={14} />}
            </small>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-center gap-2.5 rounded-[14px] bg-card p-2.5">
        {error && <p className="w-full px-3 pt-1 text-[.85em] text-destructive">{error}</p>}
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
