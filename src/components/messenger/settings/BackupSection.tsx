import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { longTime } from "@/lib/messenger-data";
import { readBackupHeader, sizeText } from "@/lib/backup";

type Props = {
  stats: () => Promise<{ chats: number; messages: number; files: number }>;
  onDownloadAll: (onProgress: (text: string) => void) => Promise<number>;
  onCreate: (password: string, onProgress: (text: string) => void) => Promise<string>;
  onRestore: (file: File, password: string) => Promise<string | null>;
};

const field =
  "h-11 w-full rounded-full bg-card px-5 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20";

export default function BackupSection({ stats, onDownloadAll, onCreate, onRestore }: Props) {
  const [info, setInfo] = useState<{ chats: number; messages: number; files: number } | null>(null);
  const [last, setLast] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState("");
  const [rpw, setRpw] = useState("");
  const [rmsg, setRmsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => stats().then(setInfo).catch(() => undefined);

  useEffect(() => {
    refresh();
    setLast(localStorage.getItem("rusapp_last_backup") || "");
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    if (pw.length < 6) return setMsg("Пароль копии — минимум 6 символов");
    if (pw !== pw2) return setMsg("Пароли не совпадают");
    setBusy("create");
    const res = await onCreate(pw, setMsg);
    setBusy("");
    setMsg(res);
    setPw("");
    setPw2("");
    setLast(localStorage.getItem("rusapp_last_backup") || "");
  };

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    setRmsg("");
    if (!f) return;
    try {
      const { header } = await readBackupHeader(f);
      setFile(f);
      setFileInfo(`Копия от ${longTime(header.createdAt)} · ${sizeText(f.size)}`);
    } catch (err) {
      setFile(null);
      setRmsg(err instanceof Error ? err.message : "Не удалось прочитать файл");
    }
  };

  const restore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy("restore");
    setRmsg("Восстанавливаю…");
    const err = await onRestore(file, rpw);
    setBusy("");
    setRmsg(err ?? "Готово! Переписка и файлы восстановлены.");
    if (!err) {
      setFile(null);
      setRpw("");
      refresh();
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="rounded-[14px] bg-gradient-to-br from-tile-a to-tile-b p-5">
        <div className="flex items-center gap-2 font-head font-semibold">
          <Icon name="Smartphone" size={18} />
          Всё хранится на вашем устройстве
        </div>
        <p className="mt-2 text-[.87em] text-muted-foreground">
          Переписка, фото, видео и файлы сохраняются в зашифрованной памяти этого устройства. Резервная копия — это
          один файл, который остаётся у вас: в «Загрузках», «Файлах» или там, куда вы его сохраните. На сервер копия не
          отправляется.
        </p>
        {info && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {(
              [
                [info.chats, "чатов"],
                [info.messages, "сообщений"],
                [info.files, "файлов"],
              ] as const
            ).map(([n, l]) => (
              <div key={l} className="rounded-xl bg-card/70 py-2">
                <div className="font-head text-[1.3em] font-semibold tabular-nums">{n}</div>
                <div className="text-[.78em] text-muted-foreground">{l}</div>
              </div>
            ))}
          </div>
        )}
        <button
          disabled={!!busy}
          onClick={async () => {
            setBusy("dl");
            const n = await onDownloadAll(setMsg);
            setBusy("");
            setMsg(n ? `Сохранено на устройство файлов: ${n}` : "Все файлы уже на устройстве");
            refresh();
          }}
          className="mt-3 inline-flex items-center gap-2 text-[.87em] font-medium text-primary disabled:opacity-60"
        >
          <Icon name={busy === "dl" ? "Loader2" : "Download"} size={15} className={busy === "dl" ? "animate-spin" : ""} />
          Сохранить на устройство все фото и файлы из чатов
        </button>
      </div>

      <form onSubmit={create} className="rounded-[14px] bg-background p-5">
        <div className="flex items-center gap-2 font-head font-semibold">
          <Icon name="DatabaseBackup" size={18} />
          Создать резервную копию
        </div>
        <p className="mt-1 text-[.85em] text-muted-foreground">
          {last ? `Последняя копия: ${longTime(last)}.` : "Копий ещё не было."} Копия защищается отдельным паролем — без
          него открыть файл нельзя, восстановить пароль тоже нельзя.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Пароль копии" className={field} autoComplete="new-password" />
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Повторите пароль" className={field} autoComplete="new-password" />
        </div>
        <button
          disabled={!!busy}
          className="mt-3 inline-flex h-[42px] items-center gap-2 rounded-full bg-primary px-[22px] font-head font-semibold text-primary-foreground disabled:opacity-60"
        >
          <Icon name={busy === "create" ? "Loader2" : "HardDriveDownload"} size={16} className={busy === "create" ? "animate-spin" : ""} />
          Создать копию
        </button>
        {msg && <p className="mt-2 text-[.87em]">{msg}</p>}
      </form>

      <form onSubmit={restore} className="rounded-[14px] bg-background p-5">
        <div className="flex items-center gap-2 font-head font-semibold">
          <Icon name="ArchiveRestore" size={18} />
          Восстановить из копии
        </div>
        <p className="mt-1 text-[.85em] text-muted-foreground">
          Выберите файл .rusapp и введите его пароль. Сообщения из копии добавятся к текущей переписке, ничего не
          удалится.
        </p>
        <input ref={fileRef} type="file" accept=".rusapp,application/octet-stream" hidden onChange={pick} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-3 inline-flex h-[42px] items-center gap-2 rounded-full bg-secondary px-[22px] font-head font-semibold text-secondary-foreground"
        >
          <Icon name="FolderOpen" size={16} />
          Выбрать файл копии
        </button>
        {file && (
          <>
            <p className="mt-2 text-[.87em] text-muted-foreground">{fileInfo}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input type="password" value={rpw} onChange={(e) => setRpw(e.target.value)} placeholder="Пароль копии" className={`${field} flex-1`} />
              <button
                disabled={!rpw || !!busy}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 font-head font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy === "restore" && <Icon name="Loader2" size={16} className="animate-spin" />}
                Восстановить
              </button>
            </div>
          </>
        )}
        {rmsg && <p className="mt-2 text-[.87em]">{rmsg}</p>}
      </form>
    </div>
  );
}
