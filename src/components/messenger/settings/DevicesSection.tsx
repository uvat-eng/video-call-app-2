import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { api, longTime } from "@/lib/messenger-data";

type Device = { id: number; name: string; createdAt: string; lastActive: string; current: boolean };

type Props = {
  token: string;
  onApprove: (code: string) => Promise<string | null>;
};

function deviceIcon(name: string) {
  if (/iphone|android/i.test(name)) return "Smartphone";
  if (/ipad/i.test(name)) return "Tablet";
  return "Monitor";
}

export default function DevicesSection({ token, onApprove }: Props) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<number | null>(null);

  const load = () =>
    api<{ devices: Device[] }>("devices", {}, token)
      .then((r) => setDevices(r.devices))
      .catch(() => setDevices([]));

  useEffect(() => {
    load();
  }, []);

  const approve = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    const err = await onApprove(code);
    setBusy(false);
    if (err) setMsg(err);
    else {
      setMsg("Готово! Новое устройство получило переписку и подключено.");
      setCode("");
      window.setTimeout(load, 2500);
    }
  };

  const remove = async (id: number) => {
    setConfirm(null);
    await api("device_remove", { deviceId: id }, token).catch(() => null);
    load();
  };

  return (
    <div>
      <div className="rounded-[14px] bg-gradient-to-br from-tile-a to-tile-b p-5">
        <div className="flex items-center gap-2 font-head font-semibold">
          <Icon name="Link" size={18} />
          Подключить устройство
        </div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[.9em] text-muted-foreground">
          <li>Откройте RusAPP на компьютере или другом телефоне и войдите в этот же аккаунт.</li>
          <li>На новом устройстве появится код из 8 символов.</li>
          <li>Введите его здесь — переписка и ключи шифрования зашифрованно перенесутся туда.</li>
        </ol>
        <form onSubmit={approve} className="mt-4 flex flex-wrap gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
            placeholder="Код с нового устройства"
            className="h-11 min-w-0 flex-1 rounded-full bg-card px-5 font-head tracking-[0.2em] outline-none placeholder:tracking-normal placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20"
          />
          <button
            disabled={code.length < 8 || busy}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 font-head font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy && <Icon name="Loader2" size={16} className="animate-spin" />}
            Подключить
          </button>
        </form>
        {msg && <p className="mt-2 text-[.87em]">{msg}</p>}
      </div>

      <div className="mb-2 mt-6 font-head font-semibold">Где выполнен вход</div>
      {devices === null && <Icon name="Loader2" size={20} className="animate-spin text-muted-foreground" />}
      {devices?.map((d) => (
        <div key={d.id} className="flex items-center gap-3 border-b border-border py-3 last:border-0">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-background">
            <Icon name={deviceIcon(d.name)} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">
              {d.name}
              {d.current && <span className="ml-2 text-[.8em] font-normal text-online">это устройство</span>}
            </div>
            <div className="text-[.82em] text-muted-foreground">
              {d.current ? "активно сейчас" : `был(о) в сети ${longTime(d.lastActive)}`}
            </div>
          </div>
          {!d.current &&
            (confirm === d.id ? (
              <span className="flex gap-3 text-[.85em]">
                <button onClick={() => setConfirm(null)} className="text-muted-foreground">
                  Отмена
                </button>
                <button onClick={() => remove(d.id)} className="font-medium text-destructive">
                  Отключить
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirm(d.id)}
                aria-label="Отключить устройство"
                className="rounded-full p-2 text-muted-foreground hover:text-destructive"
              >
                <Icon name="LogOut" size={16} />
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}
