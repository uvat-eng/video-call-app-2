import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { LOGO_URL } from "./AppHeader";

type Props = {
  mode: "create" | "unlock";
  name: string;
  onSubmit: (pin: string) => Promise<string | null>;
  onReset: () => void;
  onLogout: () => void;
  onBiometric?: () => Promise<string | null>;
  bioLabel?: string;
};

export default function PinScreen({ mode, name, onSubmit, onReset, onLogout, onBiometric, bioLabel }: Props) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const autoTried = useRef(false);

  const bio = async () => {
    if (!onBiometric) return;
    setError("");
    setBusy(true);
    const err = await onBiometric();
    setBusy(false);
    if (err) setError(err);
  };

  useEffect(() => {
    if (onBiometric && !autoTried.current) {
      autoTried.current = true;
      bio();
    }
  }, [onBiometric]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "create" ? !/^\d{4}$/.test(pin) : pin.length < 4) return setError("Код — 4 цифры");
    if (mode === "create" && pin !== pin2) return setError("Коды не совпадают");
    setBusy(true);
    const err = await onSubmit(pin);
    setBusy(false);
    if (err) {
      setError(err);
      setPin("");
    }
  };

  const field =
    "h-12 w-full rounded-full bg-background px-5 text-center font-head text-[1.15em] tracking-[0.3em] outline-none placeholder:tracking-normal placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20";

  return (
    <div className="app-text grid min-h-[100dvh] place-items-center bg-background p-2.5">
      <form onSubmit={submit} className="flex w-full max-w-[420px] flex-col gap-3 rounded-[14px] bg-card p-7">
        <div className="mb-2 flex items-center justify-between">
          <span className="rounded-lg bg-logo-bg px-1 py-0.5">
            <img src={LOGO_URL} alt="RuChat" className="h-8 w-auto" />
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-gradient-to-br from-tile-a to-tile-b px-3 py-1 text-[.8em] font-medium">
            <Icon name="ShieldCheck" size={14} />
            Сквозное шифрование
          </span>
        </div>
        <h1 className="text-[1.6em] font-semibold tracking-[-0.03em]">
          {mode === "create" ? "Защитите переписку" : `С возвращением, ${name.split(" ")[0]}`}
        </h1>
        <p className="text-[.9em] text-muted-foreground">
          {mode === "create"
            ? "Придумайте код для входа в приложение. Его спросят только после полного закрытия RuChat — пока приложение открыто или свёрнуто, вводить его не нужно."
            : "Введите код доступа. Пока RuChat открыт или свёрнут, повторно его не спросят."}
        </p>
        <input
          value={pin}
          onChange={(e) => setPin(mode === "create" ? e.target.value.replace(/\D/g, "").slice(0, 4) : e.target.value.slice(0, 32))}
          type="password"
          inputMode="numeric"
          maxLength={mode === "create" ? 4 : 32}
          autoFocus
          autoComplete="off"
          placeholder="Код из 4 цифр"
          className={field}
        />
        {mode === "create" && (
          <input
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            placeholder="Повторите код"
            className={field}
          />
        )}
        {error && <p className="px-2 text-center text-[.87em] text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-head font-semibold text-primary-foreground disabled:opacity-60"
        >
          <Icon name={busy ? "Loader2" : mode === "create" ? "Lock" : "Unlock"} size={16} className={busy ? "animate-spin" : ""} />
          {mode === "create" ? "Сохранить код" : "Открыть"}
        </button>
        {onBiometric && (
          <button
            type="button"
            onClick={bio}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-background font-head font-semibold text-foreground disabled:opacity-60"
          >
            <Icon name={bioLabel?.includes("Face") ? "ScanFace" : "Fingerprint"} size={18} />
            Войти через {bioLabel}
          </button>
        )}
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-[.8em] text-muted-foreground">
          {mode === "unlock" &&
            (confirmReset ? (
              <span>
                Вся переписка на этом устройстве будет удалена.{" "}
                <button type="button" onClick={onReset} className="font-medium text-destructive hover:underline">
                  Сбросить
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmReset(true)} className="hover:text-foreground">
                Забыли код?
              </button>
            ))}
          <button type="button" onClick={onLogout} className="ml-auto hover:text-foreground">
            Выйти из аккаунта
          </button>
        </div>
      </form>
    </div>
  );
}
