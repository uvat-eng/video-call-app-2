import { useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { CallKind, User } from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";

type Props = {
  title: string;
  contacts: User[];
  max: number;
  kind?: CallKind;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (users: User[], kind: CallKind) => void;
  chooseKind?: boolean;
};

export default function ContactPicker({
  title,
  contacts,
  max,
  kind: initialKind = "audio",
  confirmLabel = "Позвонить",
  onCancel,
  onConfirm,
  chooseKind,
}: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<CallKind>(initialKind);
  const q = query.trim().toLowerCase();
  const list = contacts.filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q));

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= max ? s : [...s, id]));

  const chosen = contacts.filter((c) => selected.includes(c.id));

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-foreground/40 backdrop-blur-sm sm:place-items-center">
      <div className="app-text flex max-h-[90dvh] w-full max-w-[460px] flex-col overflow-hidden rounded-t-[14px] bg-card text-foreground sm:rounded-[14px]">
        <div className="flex items-center justify-between gap-3 p-5 pb-3">
          <div>
            <h2 className="text-[1.4em] font-semibold tracking-[-0.03em]">{title}</h2>
            <p className="text-[.85em] text-muted-foreground">
              Выбрано {selected.length} из {max}
            </p>
          </div>
          <button onClick={onCancel} aria-label="Закрыть" className="rounded-full bg-background p-2">
            <Icon name="X" size={18} />
          </button>
        </div>

        {chooseKind && (
          <div className="mx-5 mb-3 flex gap-1.5 rounded-full bg-background p-1">
            {(
              [
                ["audio", "Аудио", "Phone"],
                ["video", "Видео", "Video"],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => setKind(id)}
                className={cn(
                  "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full font-head font-semibold transition-colors",
                  kind === id ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                <Icon name={icon} size={15} />
                {label}
              </button>
            ))}
          </div>
        )}
        {chooseKind && kind === "video" && (
          <p className="mx-5 -mt-1 mb-3 text-[.8em] text-muted-foreground">
            Видео одновременно могут включить до 6 человек, остальные участвуют голосом.
          </p>
        )}

        <label className="mx-5 mb-2 flex h-[38px] items-center gap-2 rounded-full bg-background px-4 text-muted-foreground">
          <Icon name="Search" size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3">
          {list.length === 0 && (
            <p className="py-8 text-center text-[.87em] text-muted-foreground">
              {contacts.length ? "Никого не найдено" : "Сначала добавьте контакты"}
            </p>
          )}
          {list.map((c) => {
            const on = selected.includes(c.id);
            const disabled = !c.publicKey;
            return (
              <button
                key={c.id}
                disabled={disabled}
                onClick={() => toggle(c.id)}
                className={cn(
                  "grid w-full grid-cols-[42px_1fr_auto] items-center gap-3 rounded-xl p-2.5 text-left transition-colors",
                  on ? "bg-background" : "hover:bg-background/60",
                  disabled && "opacity-50",
                )}
              >
                <UserAvatar user={c} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="truncate text-[.85em] text-muted-foreground">
                    {disabled ? "ещё не заходил(а) в RusAPP" : c.online ? "в сети" : c.phone}
                  </div>
                </div>
                <span
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-full border-2",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {on && <Icon name="Check" size={14} />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-border p-4">
          <button
            disabled={!chosen.length}
            onClick={() => onConfirm(chosen, kind)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-head font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Icon name={kind === "video" ? "Video" : "Phone"} size={18} />
            {confirmLabel}
            {chosen.length > 0 && ` (${chosen.length + 1} участн.)`}
          </button>
        </div>
      </div>
    </div>
  );
}
