import { useState } from "react";
import Icon from "@/components/ui/icon";
import { presence, type GroupInfo, type User } from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";
import ContactPicker from "./ContactPicker";

type Props = {
  group: GroupInfo;
  me: User;
  contacts: User[];
  onClose: () => void;
  onAction: (action: string, body: Record<string, unknown>) => Promise<string | null>;
  onLoadContacts: () => void;
};

export default function GroupInfoPanel({ group, me, contacts, onClose, onAction, onLoadContacts }: Props) {
  const [title, setTitle] = useState(group.title);
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const ids = new Set(group.members.map((m) => m.id));

  const run = async (action: string, body: Record<string, unknown>, ok = "") => {
    const err = await onAction(action, { gchatId: group.id, ...body });
    setMsg(err ?? ok);
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-foreground/40 backdrop-blur-sm sm:place-items-center">
      <div className="app-text flex max-h-[92dvh] w-full max-w-[460px] flex-col overflow-hidden rounded-t-[14px] bg-card text-foreground sm:rounded-[14px]">
        <div className="flex items-center justify-between gap-3 p-5 pb-3">
          <h2 className="text-[1.4em] font-semibold tracking-[-0.03em]">О группе</h2>
          <button onClick={onClose} aria-label="Закрыть" className="rounded-full bg-background p-2">
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {group.admin ? (
            <div className="flex gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                className="h-11 w-full rounded-xl bg-background px-4 outline-none focus:ring-2 focus:ring-ring/20"
              />
              <button
                disabled={!title.trim() || title.trim() === group.title}
                onClick={() => run("gchat_rename", { title: title.trim() }, "Название сохранено")}
                className="h-11 shrink-0 rounded-full bg-primary px-4 font-head font-semibold text-primary-foreground disabled:opacity-50"
              >
                Сохранить
              </button>
            </div>
          ) : (
            <div className="font-head text-[1.3em] font-semibold">{group.title}</div>
          )}
          {msg && <p className="mt-2 text-[.85em] text-muted-foreground">{msg}</p>}

          <div className="mb-2 mt-5 flex items-center justify-between">
            <span className="text-[.85em] text-muted-foreground">Участники: {group.members.length}</span>
            {group.admin && (
              <button
                onClick={() => {
                  onLoadContacts();
                  setAdding(true);
                }}
                className="flex items-center gap-1.5 text-[.9em] font-medium text-primary"
              >
                <Icon name="UserPlus" size={16} />
                Добавить
              </button>
            )}
          </div>
          {group.members.map((m) => (
            <div key={m.id} className="grid grid-cols-[42px_1fr_auto] items-center gap-3 py-2">
              <UserAvatar user={m} />
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {m.id === me.id ? "Вы" : m.name}
                  {m.admin && <span className="ml-2 text-[.75em] font-normal text-muted-foreground">админ</span>}
                </div>
                <div className="truncate text-[.85em] text-muted-foreground">{m.publicKey ? presence(m) : "ещё не заходил(а) в RusAPP"}</div>
              </div>
              {group.admin && m.id !== me.id && (
                <button
                  onClick={() => run("gchat_remove", { userId: m.id })}
                  aria-label="Удалить из группы"
                  className="rounded-full p-2 text-muted-foreground hover:text-destructive"
                >
                  <Icon name="UserMinus" size={16} />
                </button>
              )}
            </div>
          ))}

          <div className="mt-5 border-t border-border pt-4">
            {confirmLeave ? (
              <div className="flex items-center justify-between gap-3 text-[.9em]">
                <span>Выйти из группы?</span>
                <span className="flex gap-3">
                  <button onClick={() => setConfirmLeave(false)} className="text-muted-foreground">
                    Отмена
                  </button>
                  <button
                    onClick={async () => {
                      await run("gchat_leave", {});
                      onClose();
                    }}
                    className="font-medium text-destructive"
                  >
                    Выйти
                  </button>
                </span>
              </div>
            ) : (
              <button onClick={() => setConfirmLeave(true)} className="flex items-center gap-2 font-medium text-destructive">
                <Icon name="LogOut" size={16} />
                Выйти из группы
              </button>
            )}
          </div>
        </div>
      </div>
      {adding && (
        <ContactPicker
          title="Добавить в группу"
          contacts={contacts.filter((c) => !ids.has(c.id)).map((c) => ({ ...c, publicKey: c.publicKey ?? "pending" }))}
          max={200}
          confirmLabel="Добавить"
          onCancel={() => setAdding(false)}
          onConfirm={async (users) => {
            setAdding(false);
            await run("gchat_add", { userIds: users.map((u) => u.id) }, "Участники добавлены");
          }}
        />
      )}
    </div>
  );
}
