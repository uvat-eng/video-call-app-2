import { useState } from "react";
import Icon from "@/components/ui/icon";
import type { User } from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";

type Props = {
  user: User;
  onSave: (name: string, status: string) => Promise<string | null>;
  onLogout: () => void;
  onLock?: () => void;
  onClearHistory: () => Promise<void>;
  onTestPush?: () => Promise<string>;
  bio?: { label: string; on: boolean; toggle: () => Promise<string> };
};

export default function SettingsView({ user, onSave, onLogout, onLock, onClearHistory, onTestPush, bio }: Props) {
  const [bioMsg, setBioMsg] = useState("");
  const [bioBusy, setBioBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [name, setName] = useState(user.name);
  const [status, setStatus] = useState(user.status);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const error = await onSave(name, status);
    setSaving(false);
    setMsg(error ?? "Сохранено");
  };

  const field =
    "h-12 w-full rounded-full bg-background px-5 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20";

  return (
    <>
      <aside className="flex flex-col items-start gap-4 rounded-[14px] bg-card p-6">
        <UserAvatar user={{ ...user, online: true }} size={84} />
        <div>
          <h2 className="text-[1.6em] font-semibold tracking-[-0.03em]">{user.name}</h2>
          <p className="text-muted-foreground">{user.phone}</p>
        </div>
        {onLock && (
          <button
            onClick={onLock}
            className="inline-flex h-[38px] items-center gap-2 rounded-full bg-primary px-[18px] font-head font-semibold text-primary-foreground"
          >
            <Icon name="Lock" size={16} />
            Заблокировать
          </button>
        )}
        <button
          onClick={onLogout}
          className="inline-flex h-[38px] items-center gap-2 rounded-full bg-secondary px-[18px] font-head font-semibold text-secondary-foreground"
        >
          <Icon name="LogOut" size={16} />
          Выйти
        </button>
      </aside>
      <section className="min-h-0 overflow-y-auto rounded-[14px] bg-card p-6 lg:p-7">
        <h1 className="hero-title mb-5">Профиль</h1>
        <form onSubmit={save} className="flex max-w-[480px] flex-col gap-3">
          <label className="text-[.85em] text-muted-foreground">Имя</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          <label className="text-[.85em] text-muted-foreground">Статус</label>
          <input
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="Например: на связи после 18:00"
            className={field}
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              disabled={saving}
              className="inline-flex h-[42px] items-center gap-2 rounded-full bg-primary px-[22px] font-head font-semibold text-primary-foreground disabled:opacity-60"
            >
              Сохранить
            </button>
            {msg && <span className="text-[.87em] text-muted-foreground">{msg}</span>}
          </div>
        </form>

        {bio && (
          <div className="mt-8 flex flex-wrap items-center gap-3 rounded-[14px] bg-background p-5">
            <Icon name={bio.label.includes("Face") ? "ScanFace" : "Fingerprint"} size={18} />
            <div className="min-w-0 flex-1">
              <div className="font-head font-semibold">Вход через {bio.label}</div>
              <p className="text-[.85em] text-muted-foreground">
                {bioMsg || (bio.on ? "Включено — код вводить не нужно." : "Открывайте RusAPP без ввода кода.")}
              </p>
            </div>
            <button
              disabled={bioBusy}
              onClick={async () => {
                setBioBusy(true);
                setBioMsg(await bio.toggle());
                setBioBusy(false);
              }}
              className={
                bio.on
                  ? "h-[38px] rounded-full bg-secondary px-[18px] font-head font-semibold text-secondary-foreground disabled:opacity-60"
                  : "h-[38px] rounded-full bg-primary px-[18px] font-head font-semibold text-primary-foreground disabled:opacity-60"
              }
            >
              {bio.on ? "Выключить" : "Включить"}
            </button>
          </div>
        )}

        {onTestPush && (
          <div className="mt-2.5 flex flex-wrap items-center gap-3 rounded-[14px] bg-background p-5">
            <Icon name="BellRing" size={18} />
            <div className="min-w-0 flex-1">
              <div className="font-head font-semibold">Уведомления</div>
              <p className="text-[.85em] text-muted-foreground">
                {pushMsg || "Проверьте, что сообщения и звонки дойдут при свёрнутом приложении."}
              </p>
            </div>
            <button
              disabled={testing}
              onClick={async () => {
                setTesting(true);
                setPushMsg(await onTestPush());
                setTesting(false);
              }}
              className="h-[38px] rounded-full bg-primary px-[18px] font-head font-semibold text-primary-foreground disabled:opacity-60"
            >
              Проверить
            </button>
          </div>
        )}

        <div className="mt-8 grid gap-2.5 md:grid-cols-2">
          <div className="rounded-[14px] bg-gradient-to-br from-tile-a to-tile-b p-5">
            <div className="flex items-center gap-2 font-head font-semibold">
              <Icon name="ShieldCheck" size={18} />
              Сквозное шифрование
            </div>
            <p className="mt-2 text-[.87em] text-muted-foreground">
              Сообщения шифруются на вашем устройстве ключом, который есть только у собеседника. Сервер передаёт их в
              зашифрованном виде и стирает сразу после доставки. Звонки идут напрямую между устройствами и тоже
              зашифрованы.
            </p>
          </div>
          <div className="rounded-[14px] bg-background p-5">
            <div className="flex items-center gap-2 font-head font-semibold">
              <Icon name="HardDrive" size={18} />
              Хранилище на устройстве
            </div>
            <p className="mt-2 text-[.87em] text-muted-foreground">
              История и ключи хранятся только на этом устройстве в зашифрованном виде. Код доступа спрашивается
              только после полного закрытия приложения.
            </p>
            <div className="mt-3 text-[.85em]">
              {cleared ? (
                <span className="text-muted-foreground">История удалена</span>
              ) : confirmClear ? (
                <span>
                  Удалить всю переписку с устройства?{" "}
                  <button
                    onClick={async () => {
                      await onClearHistory();
                      setCleared(true);
                    }}
                    className="font-medium text-destructive hover:underline"
                  >
                    Удалить
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmClear(true)} className="font-medium text-destructive hover:underline">
                  Очистить историю на устройстве
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
