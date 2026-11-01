import { useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import {
  duration,
  longTime,
  type CallKind,
  type CallRecord,
  type GroupCallRecord,
  type User,
} from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";

type Props = {
  calls: CallRecord[];
  groupCalls: GroupCallRecord[];
  loaded: boolean;
  onCall: (user: User, kind: CallKind) => void;
  onGroup: () => void;
};

type Row = (CallRecord & { group?: false }) | GroupCallRecord;

const DIR: Record<CallRecord["direction"], { icon: string; label: string }> = {
  in: { icon: "PhoneIncoming", label: "Входящий" },
  out: { icon: "PhoneOutgoing", label: "Исходящий" },
  missed: { icon: "PhoneMissed", label: "Пропущенный" },
};

export default function CallsView({ calls, groupCalls, loaded, onCall, onGroup }: Props) {
  const [filter, setFilter] = useState<"all" | "missed">("all");
  const all: Row[] = [...calls, ...groupCalls].sort((a, b) => b.at.localeCompare(a.at));
  const list = all.filter((c) => filter === "all" || c.direction === "missed");
  const video = all.filter((c) => c.kind === "video").length;
  const missed = all.filter((c) => c.direction === "missed").length;
  const totalMin = Math.round(all.reduce((s, c) => s + c.seconds, 0) / 60);

  return (
    <>
      <aside className="flex min-h-0 flex-col gap-2.5">
        <div className="rounded-[14px] bg-primary p-5 text-primary-foreground">
          <div className="text-[.8em] opacity-70">Всего звонков</div>
          <div className="font-head text-[2.6em] font-semibold leading-none tracking-[-0.04em]">{all.length}</div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-[14px] bg-card p-4">
            <div className="text-[.8em] text-muted-foreground">Видео</div>
            <div className="font-head text-[1.8em] font-semibold leading-none">{video}</div>
          </div>
          <div className="rounded-[14px] bg-card p-4">
            <div className="text-[.8em] text-muted-foreground">Пропущено</div>
            <div className="font-head text-[1.8em] font-semibold leading-none text-destructive">{missed}</div>
          </div>
        </div>
        <button
          onClick={onGroup}
          className="flex items-center justify-between rounded-[14px] bg-card p-5 text-left transition-transform hover:scale-[1.01]"
        >
          <div>
            <div className="font-head font-semibold">Групповой звонок</div>
            <div className="text-[.85em] text-muted-foreground">До 20 человек, видео до 6</div>
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground">
            <Icon name="Users" size={18} />
          </span>
        </button>
        <div className="rounded-[14px] bg-gradient-to-br from-tile-a to-tile-b p-5">
          <div className="text-[.8em] text-muted-foreground">Вместе на связи</div>
          <div className="font-head text-[1.8em] font-semibold leading-none">{totalMin} мин</div>
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-[14px] bg-card p-5 lg:p-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="hero-title">Звонки</h1>
          <div className="flex gap-1.5 text-[.85em]">
            {(
              [
                ["all", "Все"],
                ["missed", "Пропущенные"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={cn(
                  "rounded-full px-4 py-1.5 font-medium",
                  filter === id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="scroll-thin min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {!loaded && (
            <div className="grid place-items-center py-10 text-muted-foreground">
              <Icon name="Loader2" size={20} className="animate-spin" />
            </div>
          )}
          {loaded && list.length === 0 && (
            <p className="py-10 text-center text-muted-foreground">
              {filter === "missed" ? "Пропущенных нет" : "Звонков пока не было"}
            </p>
          )}
          {list.map((c) => {
            const d = DIR[c.direction];
            const dur = duration(c.seconds);
            if (c.group) {
              return (
                <div key={`g${c.id}`} className="grid grid-cols-[42px_1fr_auto] items-center gap-3 py-3">
                  <span className="grid h-[42px] w-[42px] place-items-center rounded-full bg-gradient-to-br from-tile-a to-tile-b">
                    <Icon name="Users" size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className={cn("truncate font-medium", c.direction === "missed" && "text-destructive")}>
                      {c.names || "Групповой звонок"}
                    </div>
                    <div className="flex items-center gap-1.5 truncate text-[.85em] text-muted-foreground">
                      <Icon name={d.icon} size={14} />
                      Группа · {c.total} участн. · {c.kind === "video" ? "видео" : "аудио"} · {longTime(c.at)}
                      {dur && ` · ${dur}`}
                    </div>
                  </div>
                  <span />
                </div>
              );
            }
            return (
              <div key={c.id} className="grid grid-cols-[42px_1fr_auto] items-center gap-3 py-3">
                <UserAvatar user={c.peer} />
                <div className="min-w-0">
                  <div className={cn("truncate font-medium", c.direction === "missed" && "text-destructive")}>
                    {c.peer.name}
                  </div>
                  <div className="flex items-center gap-1.5 truncate text-[.85em] text-muted-foreground">
                    <Icon name={d.icon} size={14} />
                    {d.label} · {c.kind === "video" ? "видео" : "аудио"} · {longTime(c.at)}
                    {dur && ` · ${dur}`}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onCall(c.peer, "audio")}
                    aria-label="Аудиозвонок"
                    className="grid h-9 w-9 place-items-center rounded-full bg-secondary transition-colors hover:bg-accent"
                  >
                    <Icon name="Phone" size={16} />
                  </button>
                  <button
                    onClick={() => onCall(c.peer, "video")}
                    aria-label="Видеозвонок"
                    className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
                  >
                    <Icon name="Video" size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
