import { useState } from "react";
import Icon from "@/components/ui/icon";
import type { User } from "@/lib/messenger-data";
import UserAvatar from "./UserAvatar";

type Props = {
  user: User;
  onSave: (name: string, status: string) => Promise<string | null>;
  onLogout: () => void;
};

export default function SettingsView({ user, onSave, onLogout }: Props) {
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
      </section>
    </>
  );
}
