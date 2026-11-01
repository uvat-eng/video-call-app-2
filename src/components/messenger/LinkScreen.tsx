import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { api } from "@/lib/messenger-data";
import { linkKeypair, type LinkBundle } from "@/lib/e2e";
import { deviceName } from "@/lib/appearance";
import { LOGO_URL } from "./AppHeader";

type Props = {
  token: string;
  name: string;
  onLinked: (bundle: LinkBundle) => Promise<void>;
  onFresh: () => void;
  onLogout: () => void;
};

export default function LinkScreen({ token, name, onLinked, onFresh, onLogout }: Props) {
  const [code, setCode] = useState("");
  const [state, setState] = useState<"loading" | "waiting" | "linking" | "error">("loading");
  const [error, setError] = useState("");
  const [confirmFresh, setConfirmFresh] = useState(false);
  const kpRef = useRef<Awaited<ReturnType<typeof linkKeypair>> | null>(null);
  const doneRef = useRef(false);

  const start = async () => {
    setState("loading");
    setError("");
    try {
      const kp = await linkKeypair();
      kpRef.current = kp;
      const r = await api<{ code: string }>("link_request", { devicePub: kp.pub, deviceName: deviceName() }, token);
      setCode(r.code);
      setState("waiting");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось получить код");
      setState("error");
    }
  };

  useEffect(() => {
    start();
  }, []);

  useEffect(() => {
    if (state !== "waiting" || !code) return;
    const t = window.setInterval(async () => {
      if (doneRef.current) return;
      try {
        const r = await api<{ status: string; payload?: string }>("link_poll", { code }, token);
        if (r.status === "expired") return start();
        if (r.status === "ready" && r.payload && kpRef.current) {
          doneRef.current = true;
          setState("linking");
          const bundle = await kpRef.current.open(r.payload);
          await onLinked(bundle);
        }
      } catch {
        if (doneRef.current) {
          setError("Не удалось расшифровать данные — попробуйте ещё раз");
          doneRef.current = false;
          start();
        }
      }
    }, 2000);
    return () => window.clearInterval(t);
  }, [state, code]);

  return (
    <div className="app-text grid min-h-[100dvh] place-items-center bg-background p-2.5">
      <div className="flex w-full max-w-[460px] flex-col gap-4 rounded-[14px] bg-card p-7">
        <span className="self-start rounded-lg bg-logo-bg px-1 py-0.5">
          <img src={LOGO_URL} alt="RusAPP" className="h-8 w-auto" />
        </span>
        <h1 className="text-[1.6em] font-semibold tracking-[-0.03em]">Подключите это устройство</h1>
        <p className="text-[.92em] text-muted-foreground">
          {name.split(" ")[0]}, ваш аккаунт уже открыт на другом устройстве. Чтобы перенести сюда переписку и ключи
          шифрования, откройте RusAPP на телефоне: <b>Настройки → Связанные устройства</b> и введите код:
        </p>
        <div className="grid place-items-center rounded-[14px] bg-gradient-to-br from-tile-a to-tile-b py-6">
          {state === "loading" || state === "linking" ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Icon name="Loader2" size={20} className="animate-spin" />
              {state === "linking" ? "Переносим переписку…" : "Получаем код…"}
            </span>
          ) : state === "error" ? (
            <button onClick={start} className="font-medium text-primary">
              Получить код ещё раз
            </button>
          ) : (
            <span className="font-head text-[2.2em] font-semibold tracking-[0.18em] tabular-nums">
              {code.slice(0, 4)} {code.slice(4)}
            </span>
          )}
        </div>
        {state === "waiting" && (
          <p className="flex items-center gap-2 text-[.85em] text-muted-foreground">
            <Icon name="Loader2" size={14} className="animate-spin" />
            Ждём подтверждения с телефона. Код действует 15 минут.
          </p>
        )}
        {error && <p className="text-[.87em] text-destructive">{error}</p>}
        <div className="mt-2 flex flex-wrap justify-between gap-2 border-t border-border pt-4 text-[.82em] text-muted-foreground">
          {confirmFresh ? (
            <span>
              Старая переписка сюда не перенесётся, а на других устройствах перестанут расшифровываться новые сообщения.{" "}
              <button onClick={onFresh} className="font-medium text-destructive hover:underline">
                Всё равно начать
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirmFresh(true)} className="hover:text-foreground">
              Нет доступа к старому устройству?
            </button>
          )}
          <button onClick={onLogout} className="ml-auto hover:text-foreground">
            Выйти
          </button>
        </div>
      </div>
    </div>
  );
}
