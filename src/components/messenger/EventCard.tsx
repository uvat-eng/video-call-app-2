import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { EventPayload, RsvpAnswer } from "@/lib/payload";

type Props = {
  event: EventPayload;
  answers: Record<number, RsvpAnswer>;
  myId: number;
  names: Record<number, string>;
  onAnswer: (a: RsvpAnswer) => void;
};

const OPTIONS: [RsvpAnswer, string, string][] = [
  ["yes", "Пойду", "Check"],
  ["maybe", "Возможно", "HelpCircle"],
  ["no", "Не пойду", "X"],
];

function whenText(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function addToCalendar(e: EventPayload) {
  const start = new Date(e.when);
  if (Number.isNaN(start.getTime())) return;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const esc = (s: string) => s.replace(/[,;\\]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RuChat//RU",
    "BEGIN:VEVENT",
    `UID:${e.id}@rusapp`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.place ? `LOCATION:${esc(e.place)}` : "",
    e.note ? `DESCRIPTION:${esc(e.note)}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(e.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "event.ics";
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export default function EventCard({ event, answers, myId, names, onAnswer }: Props) {
  const mine = answers[myId];
  const going = Object.entries(answers)
    .filter(([, a]) => a === "yes")
    .map(([id]) => names[Number(id)] ?? "")
    .filter(Boolean);
  const count = (a: RsvpAnswer) => Object.values(answers).filter((x) => x === a).length;
  const past = new Date(event.when).getTime() < Date.now();

  return (
    <div className="w-[300px] max-w-full">
      <div className="mb-1 flex items-center gap-1.5 text-[.75em] font-medium uppercase tracking-wide opacity-70">
        <Icon name="CalendarDays" size={13} />
        Мероприятие{past ? " · прошло" : ""}
      </div>
      <div className="font-head text-[1.1em] font-semibold leading-snug">{event.title}</div>
      <div className="mt-2 flex flex-col gap-1 text-[.9em]">
        <span className="flex items-center gap-1.5">
          <Icon name="Clock" size={14} className="shrink-0 opacity-70" />
          {whenText(event.when)}
        </span>
        {event.place && (
          <span className="flex items-start gap-1.5">
            <Icon name="MapPin" size={14} className="mt-0.5 shrink-0 opacity-70" />
            <span className="break-words">{event.place}</span>
          </span>
        )}
        {event.note && <span className="mt-1 whitespace-pre-wrap break-words opacity-90">{event.note}</span>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {OPTIONS.map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => onAnswer(id)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[.8em] font-medium transition-colors",
              mine === id ? "bg-primary text-primary-foreground" : "bg-foreground/5 hover:bg-foreground/10",
            )}
          >
            <Icon name={icon} size={16} />
            {label}
            <span className="tabular-nums opacity-80">{count(id)}</span>
          </button>
        ))}
      </div>
      {going.length > 0 && <div className="mt-2 text-[.8em] opacity-75">Идут: {going.join(", ")}</div>}
      {!past && (
        <button
          type="button"
          onClick={() => addToCalendar(event)}
          className="mt-2 flex items-center gap-1.5 text-[.85em] font-medium underline-offset-2 hover:underline"
        >
          <Icon name="CalendarPlus" size={14} />
          Добавить в календарь
        </button>
      )}
    </div>
  );
}
