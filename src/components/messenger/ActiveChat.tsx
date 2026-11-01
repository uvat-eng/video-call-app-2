import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { hhmm, presence, type CallKind, type GroupInfo, type Message, type User } from "@/lib/messenger-data";
import { safetyCode } from "@/lib/e2e";
import { MAX_FILE } from "@/lib/files";
import {
  parsePayload,
  type EventPayload,
  type Payload,
  type PollPayload,
  type RsvpAnswer,
} from "@/lib/payload";
import FileBubble from "./FileBubble";
import PollCard from "./PollCard";
import EventCard from "./EventCard";
import ComposeSheet from "./ComposeSheet";
import GroupInfoPanel from "./GroupInfoPanel";
import UserAvatar from "./UserAvatar";

type Props = {
  peer: User;
  group?: GroupInfo;
  me: User;
  contacts: User[];
  myKey: string;
  messages: Message[];
  loading: boolean;
  error?: string;
  uploading: number | null;
  onSend: (text: string) => void;
  onSendPayload: (p: Payload) => void;
  onSendFile: (file: File, caption: string) => void;
  onGroupAction: (action: string, body: Record<string, unknown>) => Promise<string | null>;
  onLoadContacts: () => void;
  onCall: (kind: CallKind) => void;
  onBack?: () => void;
  className?: string;
};

type Parsed = { msg: Message; p: Payload; author: number };

export default function ActiveChat({
  peer,
  group,
  me,
  contacts,
  myKey,
  messages,
  loading,
  error,
  uploading,
  onSend,
  onSendPayload,
  onSendFile,
  onGroupAction,
  onLoadContacts,
  onCall,
  onBack,
  className,
}: Props) {
  const [text, setText] = useState("");
  const [code, setCode] = useState<string[] | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [menu, setMenu] = useState(false);
  const [compose, setCompose] = useState<"poll" | "event" | null>(null);
  const [info, setInfo] = useState(false);
  const [localErr, setLocalErr] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowCode(false);
    setCode(null);
    if (!group && peer.publicKey) safetyCode(myKey, peer.publicKey).then(setCode);
  }, [peer.publicKey, myKey, group]);

  const names = useMemo(() => {
    const n: Record<number, string> = { [me.id]: "Вы" };
    if (group) {
      for (const m of group.members) if (m.id !== me.id) n[m.id] = m.name;
    } else {
      n[peer.id] = peer.name;
    }
    return n;
  }, [group, peer, me.id]);

  const { visible, votes, rsvps } = useMemo(() => {
    const parsed: Parsed[] = messages.map((msg) => ({
      msg,
      p: parsePayload(msg.text),
      author: msg.mine ? me.id : (msg.from ?? peer.id),
    }));
    const votes: Record<string, Record<number, number[]>> = {};
    const rsvps: Record<string, Record<number, RsvpAnswer>> = {};
    for (const x of parsed) {
      if (x.p.t === "vote") (votes[x.p.poll] ??= {})[x.author] = x.p.choice;
      if (x.p.t === "rsvp") (rsvps[x.p.event] ??= {})[x.author] = x.p.answer;
    }
    return { visible: parsed.filter((x) => x.p.t !== "vote" && x.p.t !== "rsvp"), votes, rsvps };
  }, [messages, me.id, peer.id]);

  const lastId = visible[visible.length - 1]?.msg.id;

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

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setMenu(false);
    setLocalErr("");
    for (const f of files.slice(0, 10)) {
      if (f.size > MAX_FILE) {
        setLocalErr(`«${f.name}» больше 25 МБ`);
        continue;
      }
      onSendFile(f, "");
    }
  };

  const others = group ? group.members.filter((m) => m.id !== me.id) : [];
  const onlineCount = others.filter((m) => m.online).length;

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
        {group ? (
          <button onClick={() => setInfo(true)} className="min-w-0 text-left">
            <h1 className="hero-title truncate">{group.title}</h1>
            <p className="mt-2 truncate text-muted-foreground">
              {group.members.length} участн.{onlineCount ? ` · ${onlineCount} в сети` : ""} · нажмите для информации
            </p>
          </button>
        ) : (
          <div className="min-w-0">
            <h1 className="hero-title truncate">{peer.name}</h1>
            <p className={cn("mt-2 truncate", peer.online ? "text-online" : "text-muted-foreground")}>{presence(peer)}</p>
          </div>
        )}
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
        className="scroll-thin flex min-h-0 flex-col gap-2 overflow-y-auto rounded-[14px] bg-card px-4 py-[22px] sm:px-6"
      >
        <button
          type="button"
          onClick={() => setShowCode((v) => !v)}
          className="mx-auto mb-2 flex max-w-[460px] items-start gap-2 rounded-xl bg-gradient-to-br from-tile-a to-tile-b px-3.5 py-2.5 text-left text-[.8em] leading-snug"
        >
          <Icon name="Lock" size={14} className="mt-0.5 shrink-0" />
          <span>
            {group
              ? "Сообщения, фото и файлы в группе зашифрованы для каждого участника отдельно. Сервер их не читает и не хранит после доставки."
              : peer.publicKey
                ? "Сообщения, фото, файлы и звонки защищены сквозным шифрованием. Сервер не хранит переписку. Нажмите, чтобы сверить код безопасности."
                : `Шифрование включено всегда. ${peer.name} ещё не заходил(а) в RusAPP — сообщения зашифруются и уйдут, как только собеседник откроет приложение.`}
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
        {loading && visible.length === 0 && (
          <div className="grid place-items-center py-6 text-muted-foreground">
            <Icon name="Loader2" size={20} className="animate-spin" />
          </div>
        )}
        {!loading && visible.length === 0 && (
          <p className="py-6 text-center text-muted-foreground">Здесь пока пусто. Напишите первое сообщение</p>
        )}
        {visible.map(({ msg: m, p, author }, i) => {
          const prev = visible[i - 1];
          const showAuthor = !!group && !m.mine && prev?.author !== author;
          const wide = p.t === "poll" || p.t === "event" || p.t === "file";
          return (
            <div key={m.id} className={cn("flex max-w-[86%] gap-2 md:max-w-[66%]", m.mine ? "self-end" : "self-start")}>
              {group && !m.mine && (
                <span className="w-8 shrink-0 self-end">
                  {visible[i + 1]?.author !== author && (
                    <UserAvatar user={{ id: author, name: names[author] ?? "?" }} size={32} />
                  )}
                </span>
              )}
              <div
                className={cn(
                  "min-w-0 animate-msg-in whitespace-pre-wrap break-words rounded-2xl leading-[1.4]",
                  wide ? "p-2.5" : "px-3.5 py-2.5",
                  m.mine ? "bg-accent text-accent-foreground" : "bg-background",
                  m.id < 0 && "opacity-70",
                )}
              >
                {showAuthor && (
                  <div className="mb-1 text-[.8em] font-semibold text-primary">{names[author] ?? "Участник"}</div>
                )}
                {p.t === "text" && p.text}
                {p.t === "file" && <FileBubble meta={p} />}
                {p.t === "poll" && (
                  <PollCard
                    poll={p as PollPayload}
                    votes={votes[p.id] ?? {}}
                    myId={me.id}
                    names={names}
                    onVote={(choice) => onSendPayload({ t: "vote", poll: p.id, choice })}
                  />
                )}
                {p.t === "event" && (
                  <EventCard
                    event={p as EventPayload}
                    answers={rsvps[p.id] ?? {}}
                    myId={me.id}
                    names={names}
                    onAnswer={(answer) => onSendPayload({ t: "rsvp", event: p.id, answer })}
                  />
                )}
                <small className="mt-0.5 flex items-center justify-end gap-1 text-[.75em] opacity-60">
                  {hhmm(m.at)}
                  {m.mine && <Icon name={m.id < 0 ? "Clock" : m.read ? "CheckCheck" : "Check"} size={14} />}
                </small>
              </div>
            </div>
          );
        })}
        {uploading !== null && (
          <div className="flex items-center gap-2 self-end rounded-2xl bg-accent px-3.5 py-2.5 text-[.9em] text-accent-foreground opacity-80">
            <Icon name="Loader2" size={16} className="animate-spin" />
            Шифрую и отправляю… {Math.round(uploading * 100)}%
          </div>
        )}
      </div>

      <form onSubmit={submit} className="relative flex flex-wrap items-center gap-2 rounded-[14px] bg-card p-2.5">
        {(error || localErr) && <p className="w-full px-3 pt-1 text-[.85em] text-destructive">{error || localErr}</p>}
        {!error && !group && !peer.publicKey && messages.some((m) => m.mine && m.id < 0) && (
          <p className="flex w-full items-center gap-1.5 px-3 pt-1 text-[.85em] text-muted-foreground">
            <Icon name="Clock" size={14} />
            Сообщения зашифруются и уйдут автоматически, как только {peer.name} откроет RusAPP
          </p>
        )}
        {menu && (
          <div className="absolute bottom-full left-2.5 mb-2 grid w-[260px] grid-cols-2 gap-1.5 rounded-[14px] bg-card p-2 shadow-lg ring-1 ring-border">
            {(
              [
                ["Фото и видео", "Image", () => photoRef.current?.click()],
                ["Файл", "Paperclip", () => fileRef.current?.click()],
                ["Опрос", "BarChart3", () => setCompose("poll")],
                ["Мероприятие", "CalendarDays", () => setCompose("event")],
              ] as [string, string, () => void][]
            ).map(([label, icon, fn]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setMenu(false);
                  fn();
                }}
                className="flex flex-col items-center gap-1.5 rounded-xl p-3 text-[.85em] font-medium hover:bg-background"
              >
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-tile-a to-tile-b">
                  <Icon name={icon} size={18} />
                </span>
                {label}
              </button>
            ))}
          </div>
        )}
        <input ref={photoRef} type="file" accept="image/*,video/*" multiple hidden onChange={pick} />
        <input ref={fileRef} type="file" multiple hidden onChange={pick} />
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-label="Вложения"
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors",
            menu ? "bg-primary text-primary-foreground" : "bg-background text-foreground",
          )}
        >
          <Icon name={menu ? "X" : "Plus"} size={20} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setMenu(false)}
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

      {compose && (
        <ComposeSheet
          kind={compose}
          onCancel={() => setCompose(null)}
          onSubmit={(p) => {
            setCompose(null);
            onSendPayload(p);
          }}
        />
      )}
      {info && group && (
        <GroupInfoPanel
          group={group}
          me={me}
          contacts={contacts}
          onClose={() => setInfo(false)}
          onAction={onGroupAction}
          onLoadContacts={onLoadContacts}
        />
      )}
    </section>
  );
}
