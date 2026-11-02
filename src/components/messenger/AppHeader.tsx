import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type Tab = "chats" | "calls" | "contacts" | "settings";

export const LOGO_URL =
  "https://cdn.poehali.dev/projects/56349fef-92d7-4870-a37e-94d25b539997/bucket/f36cced5-9c99-43ec-8217-b448e4106489.png";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "chats", label: "Чаты", icon: "MessageCircle" },
  { id: "calls", label: "Звонки", icon: "Phone" },
  { id: "contacts", label: "Контакты", icon: "Users" },
  { id: "settings", label: "Настройки", icon: "Settings" },
];

const TITLES: Record<Tab, string> = {
  chats: "RuChat",
  calls: "Звонки",
  contacts: "Контакты",
  settings: "Настройки",
};

export function TopBar({ tab, actions }: { tab: Tab; actions?: React.ReactNode }) {
  return (
    <header className="pt-safe shrink-0 bg-card">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <h1
          className={cn(
            "truncate text-[1.45em] font-semibold tracking-[-0.01em]",
            tab === "chats" ? "text-primary" : "text-foreground",
          )}
        >
          {TITLES[tab]}
        </h1>
        <div className="flex items-center gap-1 text-foreground">{actions}</div>
      </div>
    </header>
  );
}

export function TopAction({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-secondary active:bg-border"
    >
      <Icon name={icon} size={21} />
    </button>
  );
}

type Props = {
  tab: Tab;
  onTab: (t: Tab) => void;
  missed: number;
  unread: number;
};

export default function BottomNav({ tab, onTab, missed, unread }: Props) {
  return (
    <nav className="pb-safe shrink-0 border-t border-border bg-card">
      <div className="grid h-[64px] grid-cols-4">
        {TABS.map((t) => {
          const on = tab === t.id;
          const count = t.id === "chats" ? unread : t.id === "calls" ? missed : 0;
          return (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              className="flex flex-col items-center justify-center gap-1 text-[.72em] font-medium"
            >
              <span
                className={cn(
                  "relative grid h-8 w-14 place-items-center rounded-full transition-colors",
                  on ? "bg-accent text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon name={t.icon} size={21} strokeWidth={on ? 2.4 : 2} />
                {count > 0 && (
                  <span className="absolute -top-1 right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-badge px-1 text-[11px] font-semibold leading-none text-badge-foreground">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </span>
              <span className={on ? "text-foreground" : "text-muted-foreground"}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
