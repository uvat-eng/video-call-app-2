import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { LOGO_URL } from "./AppHeader";

const OPTIONS = [
  { id: "read", label: "Отчёты о прочтении", hint: "Двойные галочки у ваших сообщений" },
  { id: "online", label: "Показывать «в сети»", hint: "Контакты видят, когда вы онлайн" },
  { id: "hd", label: "Видео в HD", hint: "Лучше качество при хорошей сети" },
  { id: "sound", label: "Звук уведомлений", hint: "Сигнал о новых сообщениях" },
];

export default function SettingsView() {
  const [values, setValues] = useState<Record<string, boolean>>({ read: true, online: true, hd: true, sound: false });

  return (
    <>
      <aside className="flex flex-col items-start gap-4 rounded-[14px] bg-card p-6">
        <span className="rounded-xl bg-logo-bg p-2">
          <img src={LOGO_URL} alt="RusAPP" className="h-12 w-auto" />
        </span>
        <div>
          <h2 className="text-[1.6em] font-semibold tracking-[-0.03em]">Мой профиль</h2>
          <p className="text-muted-foreground">Вход и регистрация появятся в следующей версии</p>
        </div>
        <button className="inline-flex h-[38px] items-center gap-2 rounded-full bg-primary px-[18px] font-head font-semibold text-primary-foreground">
          <Icon name="LogIn" size={16} />
          Войти по номеру
        </button>
      </aside>
      <section className="min-h-0 overflow-y-auto rounded-[14px] bg-card p-6 lg:p-7">
        <h1 className="hero-title mb-5">Настройки</h1>
        <div className="divide-y divide-border">
          {OPTIONS.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center justify-between gap-4 py-4">
              <div>
                <div className="font-medium">{o.label}</div>
                <div className="text-[.85em] text-muted-foreground">{o.hint}</div>
              </div>
              <Switch checked={values[o.id]} onCheckedChange={(v) => setValues((s) => ({ ...s, [o.id]: v }))} />
            </label>
          ))}
        </div>
      </section>
    </>
  );
}
