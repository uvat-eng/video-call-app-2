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

type Props = {
  tab: Tab;
  onTab: (t: Tab) => void;
  onNewCall: () => void;
  missed: number;
};

export default function AppHeader({ tab, onTab, onNewCall, missed }: Props) {
  return (
    <header className="flex h-[58px] shrink-0 items-center justify-between gap-3 border-b border-border px-4 lg:px-10">
      <div className="flex items-center gap-2.5 font-head text-[1.2em] font-semibold tracking-[-0.03em]">
        <span className="rounded-lg bg-logo-bg px-1 py-0.5">
          <img src={LOGO_URL} alt="RuChat" className="h-7 w-auto" />
        </span>
        RuChat
      </div>
      <nav className="flex items-center gap-1 text-muted-foreground lg:gap-[22px]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            aria-label={t.label}
            className={cn(
              "relative flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition-colors hover:text-foreground lg:px-0",
              tab === t.id && "text-foreground",
            )}
          >
            <Icon name={t.icon} size={18} className="lg:hidden" />
            <span className="hidden lg:inline">{t.label}</span>
            {t.id === "calls" && missed > 0 && (
              <span className="absolute -right-0.5 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground lg:-right-3 lg:-top-1">
                {missed}
              </span>
            )}
            {tab === t.id && (
              <span className="absolute -bottom-[13px] left-0 right-0 hidden h-[2px] rounded-full bg-primary lg:block" />
            )}
          </button>
        ))}
        <button
          onClick={onNewCall}
          className="ml-1 inline-flex h-[38px] items-center gap-2 rounded-full bg-primary px-3.5 font-head font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-95 lg:ml-0 lg:px-[18px]"
        >
          <Icon name="PhoneCall" size={16} />
          <span className="hidden sm:inline">Новый звонок</span>
        </button>
      </nav>
    </header>
  );
}
