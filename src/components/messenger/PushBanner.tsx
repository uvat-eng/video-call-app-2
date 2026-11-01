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
    <div className="mx-2.5 mt-2.5 flex flex-wrap items-center gap-3 rounded-[14px] bg-primary px-4 py-3 text-primary-foreground lg:mx-10">
      <Icon name="BellRing" size={18} className="shrink-0" />
      <p className="min-w-0 flex-1 text-[.9em]">
        {state === "default" && "Включите уведомления, чтобы звонки и сообщения приходили, даже когда RusAPP закрыт."}
        {state === "ios-install" &&
          "На iPhone уведомления работают после установки: нажмите «Поделиться» → «На экран «Домой»», затем откройте RusAPP с иконки."}
        {state === "denied" &&
          "Уведомления запрещены в настройках браузера — разрешите их для этого сайта, иначе звонки не дойдут при закрытом приложении."}
      </p>
      {state === "default" && (
        <button
          onClick={onEnable}
          className="h-9 rounded-full bg-primary-foreground px-4 font-head font-semibold text-primary transition-transform hover:scale-[1.03]"
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
