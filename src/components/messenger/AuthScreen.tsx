import { useState } from "react";
import Icon from "@/components/ui/icon";
import { api, type User } from "@/lib/messenger-data";
import { LOGO_URL } from "./AppHeader";
import { cn } from "@/lib/utils";

type Props = { onAuth: (token: string, user: User) => void };

export default function AuthScreen({ onAuth }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api<{ token: string; user: User }>(mode, { phone, name, password });
      onAuth(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  const field =
    "h-12 w-full rounded-full bg-background px-5 text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20";

  return (
    <div className="app-text grid min-h-[100dvh] place-items-center bg-background p-2.5">
      <div className="grid w-full max-w-[900px] gap-2.5 md:grid-cols-[1fr_400px]">
        <div className="flex flex-col justify-between gap-8 rounded-[14px] bg-gradient-to-br from-tile-a to-tile-b p-7 lg:p-9">
          <div className="flex items-center gap-2.5 font-head text-[1.2em] font-semibold tracking-[-0.03em]">
            <span className="rounded-lg bg-logo-bg px-1 py-0.5">
              <img src={LOGO_URL} alt="RusAPP" className="h-8 w-auto" />
            </span>
          </div>
          <div>
            <h1 className="hero-title">RusAPP</h1>
            <p className="mt-3 font-head text-[1.15em] font-semibold">Защищённый российский мессенджер.</p>
            <p className="mt-2 text-muted-foreground">
              Без посредников и перехватов информации. Связь между двумя телефонами абонентов, без хранения переписки на
              серверах.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[.85em]">
            {[
              ["MessageCircle", "Чаты"],
              ["Phone", "Аудио"],
              ["Video", "Видео"],
            ].map(([icon, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 font-medium">
                <Icon name={icon} size={14} />
                {label}
              </span>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 rounded-[14px] bg-card p-7">
          <div className="mb-2 flex gap-1.5 rounded-full bg-background p-1">
            {(
              [
                ["login", "Вход"],
                ["register", "Регистрация"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMode(id);
                  setError("");
                }}
                className={cn(
                  "h-10 flex-1 rounded-full font-head font-semibold transition-colors",
                  mode === id ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "register" && (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ваше имя" className={field} autoComplete="name" />
          )}
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Номер телефона, +7…"
            type="tel"
            autoComplete="tel"
            className={field}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "register" ? "Придумайте пароль (от 6 символов)" : "Пароль"}
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            className={field}
          />
          {error && <p className="px-2 text-[.87em] text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-head font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
          >
            {loading && <Icon name="Loader2" size={16} className="animate-spin" />}
            {mode === "login" ? "Войти" : "Создать аккаунт"}
          </button>
          <p className="mt-auto pt-3 text-center text-[.8em] text-muted-foreground">
            {mode === "login" ? "Ещё нет аккаунта? Нажмите «Регистрация»" : "Друзья найдут вас по номеру телефона"}
          </p>
        </form>
      </div>
    </div>
  );
}