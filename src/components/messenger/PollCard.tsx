import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { PollPayload } from "@/lib/payload";

type Props = {
  poll: PollPayload;
  votes: Record<number, number[]>;
  myId: number;
  names: Record<number, string>;
  onVote: (choice: number[]) => void;
};

export default function PollCard({ poll, votes, myId, names, onVote }: Props) {
  const mine = votes[myId] ?? [];
  const voters = Object.keys(votes).filter((k) => (votes[Number(k)] ?? []).length > 0);
  const total = voters.length;

  const toggle = (i: number) => {
    if (poll.multi) onVote(mine.includes(i) ? mine.filter((x) => x !== i) : [...mine, i].sort());
    else onVote(mine.length === 1 && mine[0] === i ? [] : [i]);
  };

  return (
    <div className="w-[300px] max-w-full">
      <div className="mb-1 flex items-center gap-1.5 text-[.75em] font-medium uppercase tracking-wide opacity-70">
        <Icon name="BarChart3" size={13} />
        Опрос{poll.multi ? " · несколько ответов" : ""}
      </div>
      <div className="mb-2.5 font-head text-[1.05em] font-semibold leading-snug">{poll.q}</div>
      <div className="flex flex-col gap-1.5">
        {poll.options.map((opt, i) => {
          const who = voters.filter((k) => votes[Number(k)].includes(i)).map(Number);
          const pct = total ? Math.round((who.length / total) * 100) : 0;
          const chosen = mine.includes(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              className="relative overflow-hidden rounded-xl bg-foreground/5 px-3 py-2 text-left"
              title={who.map((id) => names[id] ?? "").filter(Boolean).join(", ")}
            >
              <span className="absolute inset-y-0 left-0 bg-foreground/10 transition-all" style={{ width: `${pct}%` }} />
              <span className="relative flex items-center gap-2">
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center border-2",
                    poll.multi ? "rounded-md" : "rounded-full",
                    chosen ? "border-primary bg-primary text-primary-foreground" : "border-current opacity-50",
                  )}
                >
                  {chosen && <Icon name="Check" size={12} />}
                </span>
                <span className="min-w-0 flex-1 break-words">{opt}</span>
                <span className="text-[.85em] font-medium tabular-nums opacity-80">{who.length}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-[.8em] opacity-70">
        {total ? `Проголосовали: ${total}` : "Пока никто не голосовал"}
      </div>
    </div>
  );
}
