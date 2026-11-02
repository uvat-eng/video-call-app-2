import { useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/messenger-data";
import type { Look } from "@/lib/appearance";
import UserAvatar from "./UserAvatar";
import ProfileSection from "./settings/ProfileSection";
import AppearanceSection from "./settings/AppearanceSection";
import DevicesSection from "./settings/DevicesSection";
import BackupSection from "./settings/BackupSection";

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
  linkCode?: string;
  backup: React.ComponentProps<typeof BackupSection>;
  look: Look;
  onLook: (look: Look) => void;
  bio?: { label: string; on: boolean; toggle: () => Promise<string> };
};

type Section = "profile" | "appearance" | "devices" | "backup" | "privacy" | "notifications";

const SECTIONS: [Section, string, string, string][] = [
  ["profile", "Профиль", "UserRound", "Фото, имя, статус"],
  ["appearance", "Оформление", "Palette", "Тема, обои, размер текста"],
  ["devices", "Связанные устройства", "MonitorSmartphone", "Компьютер, планшет"],
  ["backup", "Резервная копия", "DatabaseBackup", "Чаты и файлы на устройстве"],
  ["privacy", "Конфиденциальность", "ShieldCheck", "Вход, шифрование, история"],
  ["notifications", "Уведомления", "BellRing", "Проверка доставки"],
];

export default function SettingsView(props: Props) {
  const { user, onLogout } = props;
  const [section, setSection] = useState<Section | null>(props.linkCode ? "devices" : null);
  const current = SECTIONS.find((s) => s[0] === section);

  if (section) {
    return (
      <div className="absolute inset-0 z-20 flex flex-col bg-card">
        <header className="pt-safe shrink-0 border-b border-border bg-card">
          <div className="flex h-14 items-center gap-2 px-1">
            <button
              onClick={() => setSection(null)}
              className="grid h-10 w-10 place-items-center rounded-full active:bg-secondary"
              aria-label="Назад"
            >
              <Icon name="ArrowLeft" size={22} />
            </button>
            <h2 className="truncate text-[1.25em] font-medium">{current?.[1]}</h2>
          </div>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {section === "profile" && <ProfileSection user={user} onSave={props.onSave} onAvatar={props.onAvatar} />}
          {section === "appearance" && <AppearanceSection look={props.look} onChange={props.onLook} />}
          {section === "devices" && <DevicesSection token={props.token} onApprove={props.onApproveDevice} initialCode={props.linkCode} />}
          {section === "backup" && <BackupSection {...props.backup} />}
          {section === "privacy" && <PrivacySection {...props} />}
          {section === "notifications" && <NotificationsSection onTestPush={props.onTestPush} />}
        </div>
      </div>
    );
  }

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-card pb-6">
      <button
        onClick={() => setSection("profile")}
        className="flex w-full items-center gap-4 border-b border-border px-4 py-4 text-left active:bg-secondary"
      >
        <UserAvatar user={{ ...user, online: false }} size={64} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[1.2em] font-medium">{user.name}</div>
          <div className="truncate text-[.9em] text-muted-foreground">{user.status || user.phone}</div>
        </div>
        <Icon name="QrCode" size={22} className="text-primary" />
      </button>
      {SECTIONS.map(([id, label, icon, hint]) => (
        <button
          key={id}
          onClick={() => setSection(id)}
          className="flex w-full items-center gap-5 px-5 text-left active:bg-secondary"
        >
          <Icon name={icon} size={22} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 py-3.5">
            <span className="block">{label}</span>
            <span className="block truncate text-[.85em] text-muted-foreground">{hint}</span>
          </span>
        </button>
      ))}
      <button
        onClick={onLogout}
        className="mt-2 flex w-full items-center gap-5 border-t border-border px-5 py-4 text-left text-destructive active:bg-secondary"
      >
        <Icon name="LogOut" size={22} className="shrink-0" />
        Выйти из аккаунта
      </button>
      <p className="mt-6 text-center text-[.78em] text-muted-foreground">RuChat · защищено сквозным шифрованием</p>
    </div>
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
              {bioMsg || (bio.on ? "Включено — код вводить не нужно." : "Открывайте RuChat без ввода кода.")}
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
      <div className="flex flex-wrap gap-x-5 gap-y-2 px-1 text-[.85em] text-muted-foreground">
        <a href="/privacy" target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">
          Политика конфиденциальности
        </a>
        <a href="/terms" target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">
          Пользовательское соглашение
        </a>
        <a href="mailto:support@rusapp.su?subject=Удаление аккаунта RuChat" className="hover:text-foreground hover:underline">
          Удалить аккаунт
        </a>
      </div>
    </div>
  );
}