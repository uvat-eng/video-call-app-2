import { useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/messenger-data";
import type { Look } from "@/lib/appearance";
import UserAvatar from "./UserAvatar";
import ProfileSection from "./settings/ProfileSection";
import AppearanceSection from "./settings/AppearanceSection";
import DevicesSection from "./settings/DevicesSection";

type Props = {
  user: User;
  token: string;
  onSave: (name: string, status: string) => Promise<string | null>;
  onAvatar: (body: { image?: string; icon?: string }) => Promise<string | null>;
  onLogout: () => void;
  onLock?: () => void;
  onClearHistory: () => Promise<void>;
  onTestPush?: () => Promise<string>;
  onApproveDevice: (code: string) => Promise<string | null>;
  look: Look;
  onLook: (look: Look) => void;
  bio?: { label: string; on: boolean; toggle: () => Promise<string> };
};

type Section = "profile" | "appearance" | "devices" | "privacy" | "notifications";

const SECTIONS: [Section, string, string, string][] = [
  ["profile", "Профиль", "UserRound", "Фото, имя, статус"],
  ["appearance", "Оформление", "Palette", "Тема, обои, размер текста"],
  ["devices", "Связанные устройства", "MonitorSmartphone", "Компьютер, планшет"],
  ["privacy", "Конфиденциальность", "ShieldCheck", "Вход, шифрование, история"],
  ["notifications", "Уведомления", "BellRing", "Проверка доставки"],
];

export default function SettingsView(props: Props) {
  const { user, onLogout } = props;
  const [section, setSection] = useState<Section | null>(null);
  const current = SECTIONS.find((s) => s[0] === section);

  return (
    <>
      <aside className={cn("flex min-h-0 flex-col gap-1 overflow-y-auto rounded-[14px] bg-card p-4", section && "hidden lg:flex")}>
        <button
          onClick={() => setSection("profile")}
          className="mb-2 flex items-center gap-4 rounded-xl p-2 text-left hover:bg-background"
        >
          <UserAvatar user={{ ...user, online: false }} size={64} />
          <div className="min-w-0">
            <div className="truncate text-[1.25em] font-semibold tracking-[-0.03em]">{user.name}</div>
            <div className="truncate text-[.9em] text-muted-foreground">{user.status || user.phone}</div>
          </div>
        </button>
        {SECTIONS.map(([id, label, icon, hint]) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={cn(
              "flex items-center gap-3 rounded-xl p-2.5 text-left transition-colors",
              section === id ? "bg-background" : "hover:bg-background/60",
            )}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-tile-a to-tile-b">
              <Icon name={icon} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{label}</span>
              <span className="block truncate text-[.82em] text-muted-foreground">{hint}</span>
            </span>
            <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
          </button>
        ))}
        <button
          onClick={onLogout}
          className="mt-3 flex items-center gap-3 rounded-xl p-2.5 text-left font-medium text-destructive hover:bg-background/60"
        >
          <span className="grid h-10 w-10 place-items-center">
            <Icon name="LogOut" size={18} />
          </span>
          Выйти из аккаунта
        </button>
      </aside>

      <section className={cn("min-h-0 overflow-y-auto rounded-[14px] bg-card p-6 lg:p-7", !section && "hidden lg:block")}>
        <div className="mb-6 flex items-center gap-3">
          {section && (
            <button onClick={() => setSection(null)} className="rounded-full bg-background p-2 lg:hidden" aria-label="Назад">
              <Icon name="ArrowLeft" size={18} />
            </button>
          )}
          <h1 className="hero-title">{current ? current[1] : "Настройки"}</h1>
        </div>
        {!section && <p className="text-muted-foreground">Выберите раздел слева.</p>}
        {section === "profile" && <ProfileSection user={user} onSave={props.onSave} onAvatar={props.onAvatar} />}
        {section === "appearance" && <AppearanceSection look={props.look} onChange={props.onLook} />}
        {section === "devices" && <DevicesSection token={props.token} onApprove={props.onApproveDevice} />}
        {section === "privacy" && <PrivacySection {...props} />}
        {section === "notifications" && <NotificationsSection onTestPush={props.onTestPush} />}
      </section>
    </>
  );
}

function NotificationsSection({ onTestPush }: { onTestPush?: () => Promise<string> }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (!onTestPush) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-background p-5">
      <Icon name="BellRing" size={18} />
      <div className="min-w-0 flex-1">
        <div className="font-head font-semibold">Проверка уведомлений</div>
        <p className="text-[.85em] text-muted-foreground">
          {msg || "Убедитесь, что сообщения и звонки дойдут при свёрнутом приложении."}
        </p>
      </div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(await onTestPush());
          setBusy(false);
        }}
        className="h-[38px] rounded-full bg-primary px-[18px] font-head font-semibold text-primary-foreground disabled:opacity-60"
      >
        Проверить
      </button>
    </div>
  );
}

function PrivacySection({ bio, onLock, onClearHistory }: Props) {
  const [bioMsg, setBioMsg] = useState("");
  const [bioBusy, setBioBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);

  return (
    <div className="flex flex-col gap-2.5">
      {bio && (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-background p-5">
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
            className={cn(
              "h-[38px] rounded-full px-[18px] font-head font-semibold disabled:opacity-60",
              bio.on ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground",
            )}
          >
            {bio.on ? "Выключить" : "Включить"}
          </button>
        </div>
      )}
      {onLock && (
        <button
          onClick={onLock}
          className="inline-flex h-[38px] items-center gap-2 self-start rounded-full bg-primary px-[18px] font-head font-semibold text-primary-foreground"
        >
          <Icon name="Lock" size={16} />
          Заблокировать сейчас
        </button>
      )}
      <div className="rounded-[14px] bg-gradient-to-br from-tile-a to-tile-b p-5">
        <div className="flex items-center gap-2 font-head font-semibold">
          <Icon name="ShieldCheck" size={18} />
          Сквозное шифрование
        </div>
        <p className="mt-2 text-[.87em] text-muted-foreground">
          Сообщения шифруются на вашем устройстве. Сервер передаёт их только в зашифрованном виде и не может прочитать.
          Звонки идут напрямую между устройствами и тоже зашифрованы.
        </p>
      </div>
      <div className="rounded-[14px] bg-background p-5">
        <div className="flex items-center gap-2 font-head font-semibold">
          <Icon name="HardDrive" size={18} />
          Хранилище на устройстве
        </div>
        <p className="mt-2 text-[.87em] text-muted-foreground">
          История и ключи хранятся на устройстве в зашифрованном виде. Код доступа спрашивается только после полного
          закрытия приложения.
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
  );
}
