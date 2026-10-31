import { useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { CallKind, CallRecord, Contact } from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";

type Props = {
  calls: CallRecord[];
  contacts: Record<string, Contact>;
  onCall: (contactId: string, kind: CallKind) => void;
  onSimulateIncoming: () => void;
};

const DIR: Record<CallRecord["direction"], { icon: string; label: string }> = {
  in: { icon: "PhoneIncoming", label: "Входящий" },
  out: { icon: "PhoneOutgoing", label: "Исходящий" },
  missed: { icon: "PhoneMissed", label: "Пропущенный" },
};

export default function CallsView({ calls, contacts, onCall, onSimulateIncoming }: Props) {
  const [filter, setFilter] = useState<"all" | "missed">("all");
  const list = calls.filter((c) => filter === "all" || c.direction === "missed");
  const total = calls.length;
  const video = calls.filter((c) => c.kind === "video").length;
  const missed = calls.filter((c) => c.direction === "missed").length;

  return (
    <>
      <aside className="flex min-h-0 flex-col gap-2.5">
        <div className="rounded-[14px] bg-primary p-5 text-primary-foreground">
          <div className="text-[.8em] opacity-70">Всего звонков</div>
          <div className="font-head text-[2.6em] font-semibold leading-none tracking-[-0.04em]">{total}</div>
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
          onClick={onSimulateIncoming}
          className="flex items-center justify-between rounded-[14px] bg-gradient-to-br from-tile-a to-tile-b p-5 text-left transition-transform hover:scale-[1.01]"
        >
          <div>
            <div className="font-head font-semibold">Проверить входящий</div>
            <div className="text-[.85em] text-muted-foreground">Тестовый звонок через 2 сек</div>
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-card">
            <Icon name="BellRing" size={18} />
          </span>
        </button>
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
          {list.length === 0 && <p className="py-10 text-center text-muted-foreground">Пропущенных нет</p>}
          {list.map((c) => {
            const ct = contacts[c.contactId];
            if (!ct) return null;
            const d = DIR[c.direction];
            return (
              <div key={c.id} className="grid grid-cols-[42px_1fr_auto] items-center gap-3 py-3">
                <UserAvatar contact={ct} />
                <div className="min-w-0">
                  <div className={cn("truncate font-medium", c.direction === "missed" && "text-destructive")}>{ct.name}</div>
                  <div className="flex items-center gap-1.5 truncate text-[.85em] text-muted-foreground">
                    <Icon name={d.icon} size={14} />
                    {d.label} · {c.kind === "video" ? "видео" : "аудио"} · {c.when}
                    {c.duration !== "—" && ` · ${c.duration}`}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onCall(c.contactId, "audio")}
                    aria-label="Аудиозвонок"
                    className="grid h-9 w-9 place-items-center rounded-full bg-secondary transition-colors hover:bg-accent"
                  >
                    <Icon name="Phone" size={16} />
                  </button>
                  <button
                    onClick={() => onCall(c.contactId, "video")}
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
