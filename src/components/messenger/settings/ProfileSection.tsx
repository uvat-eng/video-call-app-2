import { useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/messenger-data";
import { squareImage } from "@/lib/appearance";
import UserAvatar, { AVATAR_COLORS, AVATAR_ICONS } from "../UserAvatar";

type Props = {
  user: User;
  onSave: (name: string, status: string) => Promise<string | null>;
  onAvatar: (body: { image?: string; icon?: string }) => Promise<string | null>;
};

const field =
  "h-12 w-full rounded-full bg-background px-5 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20";

export default function ProfileSection({ user, onSave, onAvatar }: Props) {
  const [name, setName] = useState(user.name);
  const [status, setStatus] = useState(user.status);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);
  const [icon, setIcon] = useState("Smile");
  const [color, setColor] = useState(0);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const error = await onSave(name, status);
    setSaving(false);
    setMsg(error ?? "Сохранено");
  };

  const setAvatar = async (body: { image?: string; icon?: string }) => {
    setBusy(true);
    const err = await onAvatar(body);
    setBusy(false);
    setMsg(err ?? "Фото профиля обновлено");
    if (!err) setPicker(false);
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const data = await squareImage(f, 512);
      await setAvatar({ image: data.split(",")[1] });
    } catch {
      setMsg("Не удалось открыть изображение");
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-5">
        <div className="relative">
          <UserAvatar user={{ ...user, online: false }} size={104} />
          {busy && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white">
              <Icon name="Loader2" size={24} className="animate-spin" />
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={upload} />
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-[38px] items-center gap-2 rounded-full bg-primary px-[18px] font-head font-semibold text-primary-foreground"
          >
            <Icon name="Camera" size={16} />
            Загрузить фото
          </button>
          <button
            onClick={() => setPicker((v) => !v)}
            className="inline-flex h-[38px] items-center gap-2 rounded-full bg-secondary px-[18px] font-head font-semibold text-secondary-foreground"
          >
            <Icon name="Smile" size={16} />
            Выбрать иконку
          </button>
          {user.avatar && (
            <button onClick={() => setAvatar({})} className="text-left text-[.85em] text-destructive hover:underline">
              Убрать фото
            </button>
          )}
        </div>
      </div>

      {picker && (
        <div className="mb-6 rounded-[14px] bg-background p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {AVATAR_COLORS.map((c, i) => (
              <button
                key={c}
                onClick={() => setColor(i)}
                aria-label={`Цвет ${i + 1}`}
                className={cn("h-8 w-8 rounded-full ring-offset-2 ring-offset-background", color === i && "ring-2 ring-primary")}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="grid grid-cols-8 gap-2">
            {AVATAR_ICONS.map((n) => (
              <button
                key={n}
                onClick={() => setIcon(n)}
                className={cn(
                  "grid aspect-square place-items-center rounded-full text-white",
                  icon === n && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                )}
                style={{ background: AVATAR_COLORS[color] }}
              >
                <Icon name={n} size={18} />
              </button>
            ))}
          </div>
          <button
            onClick={() => setAvatar({ icon: `icon:${icon}:${color}` })}
            className="mt-4 h-[38px] rounded-full bg-primary px-[18px] font-head font-semibold text-primary-foreground"
          >
            Поставить иконку
          </button>
        </div>
      )}

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
        <label className="text-[.85em] text-muted-foreground">Телефон</label>
        <div className="flex h-12 items-center rounded-full bg-background px-5 text-muted-foreground">{user.phone}</div>
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
    </div>
  );
}
