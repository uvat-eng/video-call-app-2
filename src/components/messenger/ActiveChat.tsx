import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { dayLabel, hhmm, presence, type CallKind, type GroupInfo, type Message, type User } from "@/lib/messenger-data";
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
  wallpaper?: string;
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
  wallpaper,
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
    <section className={cn("flex h-full min-h-0 flex-col", className)}>
      <header className="pt-safe shrink-0 border-b border-border bg-card">
        <div className="flex h-[60px] items-center gap-1 pl-1 pr-2">
          {onBack && (
            <button onClick={onBack} className="grid h-10 w-10 shrink-0 place-items-center rounded-full active:bg-secondary" aria-label="Назад">
              <Icon name="ArrowLeft" size={22} />
            </button>
          )}
          <button
            onClick={() => (group ? setInfo(true) : setShowCode((v) => !v))}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 pr-2 text-left"
          >
            {group ? (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                <Icon name="Users" size={20} />
              </span>
            ) : (
              <UserAvatar user={peer} size={40} hideOnline />
            )}
            <span className="min-w-0">
              <span className="block truncate text-[1.05em] font-medium leading-tight">{group ? group.title : peer.name}</span>
              <span className="block truncate text-[.78em] leading-tight text-muted-foreground">
                {group
                  ? `${group.members.length} участн.${onlineCount ? ` · ${onlineCount} в сети` : ""}`
                  : presence(peer)}
              </span>
            </span>
          </button>
          <button
            onClick={() => onCall("video")}
            aria-label="Видеозвонок"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full active:bg-secondary"
          >
            <Icon name="Video" size={22} />
          </button>
          <button
            onClick={() => onCall("audio")}
            aria-label="Аудиозвонок"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full active:bg-secondary"
          >
            <Icon name="Phone" size={20} />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="chat-wall scroll-thin flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto px-3 py-3 sm:px-[6%]"
        style={wallpaper ? { background: wallpaper } : undefined}
      >
        <button
          type="button"
          onClick={() => setShowCode((v) => !v)}
          className="bubble mx-auto mb-3 flex max-w-[400px] items-start gap-2 rounded-lg bg-notice px-3 py-2 text-left text-[.78em] leading-snug text-notice-foreground"
        >
          <Icon name="Lock" size={14} className="mt-0.5 shrink-0" />
          <span>
            {group
              ? "Сообщения, фото и файлы в группе зашифрованы ключом, который есть только у участников. Сервер хранит их лишь в зашифрованном виде, чтобы новые участники видели историю, — прочитать их он не может."
              : peer.publicKey
                ? "Сообщения, фото, файлы и звонки защищены сквозным шифрованием. Сервер не хранит переписку. Нажмите, чтобы сверить код безопасности."
                : `Шифрование включено всегда. ${peer.name} ещё не заходил(а) в RuChat — сообщения зашифруются и уйдут, как только собеседник откроет приложение.`}
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
          <p className="bubble mx-auto rounded-lg bg-card px-3 py-1.5 text-center text-[.8em] text-muted-foreground">Напишите первое сообщение</p>
        )}
        {visible.map(({ msg: m, p, author }, i) => {
          const prev = visible[i - 1];
          const showAuthor = !!group && !m.mine && prev?.author !== author;
          const wide = p.t === "poll" || p.t === "event" || p.t === "file";
          const first = prev?.author !== author || prev?.msg.mine !== m.mine;
          const day = dayLabel(m.at);
          const showDay = day !== (prev ? dayLabel(prev.msg.at) : "");
          return (
            <Fragment key={m.id}>
            {showDay && (
              <div className="bubble mx-auto my-2 rounded-lg bg-card px-3 py-1 text-[.75em] font-medium text-muted-foreground">
                {day}
              </div>
            )}
            <div className={cn("flex max-w-[85%] gap-1.5 md:max-w-[70%]", m.mine ? "self-end" : "self-start", first && "mt-1.5")}>
              {group && !m.mine && (
                <span className="w-8 shrink-0 self-end">
                  {visible[i + 1]?.author !== author && (
                    <UserAvatar
                      user={{ id: author, name: names[author] ?? "?", avatar: group.members.find((x) => x.id === author)?.avatar }}
                      size={32}
                    />
                  )}
                </span>
              )}
              <div
                className={cn(
                  "bubble relative min-w-0 animate-msg-in whitespace-pre-wrap break-words rounded-lg leading-[1.35]",
                  wide ? "p-1.5" : "pb-1.5 pl-2.5 pr-2 pt-1.5",
                  m.mine ? "bubble-mine" : "bubble-peer",
                  first && (m.mine ? "rounded-tr-none" : "rounded-tl-none"),
                  m.id < 0 && "opacity-70",
                )}
              >
                {showAuthor && (
                  <div className="mb-0.5 text-[.8em] font-medium text-primary">{names[author] ?? "Участник"}</div>
                )}
                {first && (
                  <span
                    className={cn(
                      "absolute top-0 h-3 w-2",
                      m.mine ? "-right-2 [clip-path:polygon(0_0,100%_0,0_100%)]" : "-left-2 [clip-path:polygon(0_0,100%_0,100%_100%)]",
                      m.mine ? "bubble-mine" : "bubble-peer",
                    )}
                  />
                )}
                {p.t === "text" && (
                  <>
                    {p.text}
                    <span className="inline-block w-[4.2em]" />
                  </>
                )}
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
                <small
                  className={cn(
                    "flex items-center justify-end gap-0.5 text-[.68em] leading-none",
                    p.t === "text" ? "float-right -mb-0.5 -mt-3 ml-2 translate-y-1" : "mt-1 pr-1",
                  )}
                >
                  <span className="opacity-60">{hhmm(m.at)}</span>
                  {m.mine && (
                    <Icon
                      name={m.id < 0 ? "Clock" : m.read ? "CheckCheck" : "Check"}
                      size={15}
                      className={m.read && m.id > 0 ? "text-tick" : "opacity-60"}
                    />
                  )}
                </small>
              </div>
            </div>
            </Fragment>
          );
        })}
        {uploading !== null && (
          <div className="bubble bubble-mine flex items-center gap-2 self-end rounded-lg px-3 py-2 text-[.9em] opacity-80">
            <Icon name="Loader2" size={16} className="animate-spin" />
            Шифрую и отправляю… {Math.round(uploading * 100)}%
          </div>
        )}
      </div>

      <form onSubmit={submit} className="pb-safe relative shrink-0 bg-chat-bg">
        {(error || localErr) && <p className="px-4 pt-2 text-[.85em] text-destructive">{error || localErr}</p>}
        {!error && !group && !peer.publicKey && messages.some((m) => m.mine && m.id < 0) && (
          <p className="flex items-center gap-1.5 px-4 pt-2 text-[.85em] text-muted-foreground">
            <Icon name="Clock" size={14} />
            Сообщения уйдут, как только {peer.name} откроет RuChat
          </p>
        )}
        {menu && (
          <div className="absolute bottom-full left-2 right-2 mb-2 grid grid-cols-4 gap-1 rounded-2xl bg-card p-3 shadow-xl ring-1 ring-border">
            {(
              [
                ["Галерея", "Image", "#bf59cf", () => photoRef.current?.click()],
                ["Документ", "FileText", "#7f66ff", () => fileRef.current?.click()],
                ["Опрос", "BarChart3", "#ffbc38", () => setCompose("poll")],
                ["Событие", "CalendarDays", "#ff2e74", () => setCompose("event")],
              ] as [string, string, string, () => void][]
            ).map(([label, icon, color, fn]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setMenu(false);
                  fn();
                }}
                className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-[.78em] text-muted-foreground"
              >
                <span className="grid h-12 w-12 place-items-center rounded-full text-white" style={{ background: color }}>
                  <Icon name={icon} size={22} />
                </span>
                {label}
              </button>
            ))}
          </div>
        )}
        <input ref={photoRef} type="file" accept="image/*,video/*" multiple hidden onChange={pick} />
        <input ref={fileRef} type="file" multiple hidden onChange={pick} />
        <div className="flex items-end gap-1.5 px-1.5 py-1.5">
          <div className="bubble flex min-h-[46px] min-w-0 flex-1 items-center gap-1 rounded-[24px] bg-card pl-1.5 pr-1">
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              aria-label="Вложения"
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-transform",
                menu && "rotate-45",
              )}
            >
              <Icon name="Plus" size={24} />
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setMenu(false)}
              placeholder="Сообщение"
              className="h-11 min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
            {!text.trim() && (
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                aria-label="Фото"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground"
              >
                <Icon name="Camera" size={22} />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Отправить"
            className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-badge text-badge-foreground shadow transition-transform active:scale-95 disabled:opacity-100"
          >
            <Icon name="SendHorizontal" size={21} />
          </button>
        </div>
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
