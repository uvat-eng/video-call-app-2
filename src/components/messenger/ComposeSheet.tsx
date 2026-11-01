import { useState } from "react";
import Icon from "@/components/ui/icon";
import { uid, type EventPayload, type PollPayload } from "@/lib/payload";

type Props = {
  kind: "poll" | "event";
  onCancel: () => void;
  onSubmit: (p: PollPayload | EventPayload) => void;
};

const field =
  "h-11 w-full rounded-xl bg-background px-4 text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20";

function defaultWhen() {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setMinutes(0, 0, 0);
  d.setHours(19);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ComposeSheet({ kind, onCancel, onSubmit }: Props) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState(defaultWhen);
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === "poll") {
      const opts = options.map((o) => o.trim()).filter(Boolean);
      if (!q.trim()) return setError("Напишите вопрос");
      if (opts.length < 2) return setError("Нужно минимум 2 варианта ответа");
      onSubmit({ t: "poll", id: uid(), q: q.trim().slice(0, 300), options: opts.map((o) => o.slice(0, 100)), multi });
      return;
    }
    if (!title.trim()) return setError("Укажите название");
    const d = new Date(when);
    if (Number.isNaN(d.getTime())) return setError("Укажите дату и время");
    onSubmit({
      t: "event",
      id: uid(),
      title: title.trim().slice(0, 120),
      when: d.toISOString(),
      place: place.trim().slice(0, 200),
      note: note.trim().slice(0, 1000),
    });
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-foreground/40 backdrop-blur-sm sm:place-items-center">
      <form
        onSubmit={submit}
        className="app-text flex max-h-[92dvh] w-full max-w-[460px] flex-col gap-3 overflow-y-auto rounded-t-[14px] bg-card p-5 text-foreground sm:rounded-[14px]"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[1.4em] font-semibold tracking-[-0.03em]">
            <Icon name={kind === "poll" ? "BarChart3" : "CalendarDays"} size={22} />
            {kind === "poll" ? "Новый опрос" : "Новое мероприятие"}
          </h2>
          <button type="button" onClick={onCancel} aria-label="Закрыть" className="rounded-full bg-background p-2">
            <Icon name="X" size={18} />
          </button>
        </div>

        {kind === "poll" ? (
          <>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Вопрос" className={field} />
            <div className="text-[.85em] text-muted-foreground">Варианты ответа</div>
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={o}
                  onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`Вариант ${i + 1}`}
                  className={field}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Убрать"
                    className="rounded-full p-2 text-muted-foreground hover:text-foreground"
                  >
                    <Icon name="X" size={16} />
                  </button>
                )}
              </div>
            ))}
            {options.length < 12 && (
              <button
                type="button"
                onClick={() => setOptions((prev) => [...prev, ""])}
                className="flex items-center gap-1.5 self-start text-[.9em] font-medium text-primary"
              >
                <Icon name="Plus" size={16} />
                Добавить вариант
              </button>
            )}
            <label className="mt-1 flex items-center gap-2.5 text-[.95em]">
              <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="h-4 w-4 accent-primary" />
              Можно выбрать несколько ответов
            </label>
          </>
        ) : (
          <>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название" className={field} />
            <label className="text-[.85em] text-muted-foreground">Дата и время</label>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={field} />
            <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Место (необязательно)" className={field} />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Описание (необязательно)"
              rows={3}
              className="w-full resize-none rounded-xl bg-background px-4 py-3 text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20"
            />
          </>
        )}

        {error && <p className="text-[.87em] text-destructive">{error}</p>}
        <button className="mt-1 flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-head font-semibold text-primary-foreground">
          <Icon name="SendHorizontal" size={16} />
          Отправить
        </button>
      </form>
    </div>
  );
}
