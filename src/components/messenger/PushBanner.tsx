import Icon from "@/components/ui/icon";
import type { PushState } from "@/lib/push";

type Props = {
  state: PushState;
  onEnable: () => void;
  onClose: () => void;
};

export default function PushBanner({ state, onEnable, onClose }: Props) {
  if (state !== "default" && state !== "ios-install" && state !== "denied") return null;
  return (
    <div className="flex flex-wrap items-center gap-3 bg-notice px-4 py-3 text-notice-foreground">
      <Icon name="BellRing" size={18} className="shrink-0" />
      <p className="min-w-0 flex-1 text-[.9em]">
        {state === "default" && "Включите уведомления, чтобы звонки и сообщения приходили, даже когда RuChat закрыт."}
        {state === "ios-install" &&
          "На iPhone уведомления работают после установки: нажмите «Поделиться» → «На экран «Домой»», затем откройте RuChat с иконки."}
        {state === "denied" &&
          "Уведомления запрещены в настройках браузера — разрешите их для этого сайта, иначе звонки не дойдут при закрытом приложении."}
      </p>
      {state === "default" && (
        <button
          onClick={onEnable}
          className="h-9 rounded-full bg-primary px-4 font-semibold text-primary-foreground transition-transform active:scale-95"
        >
          Включить
        </button>
      )}
      <button onClick={onClose} aria-label="Скрыть" className="rounded-full p-1.5 opacity-70 hover:opacity-100">
        <Icon name="X" size={16} />
      </button>
    </div>
  );
}
