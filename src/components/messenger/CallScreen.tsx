import { cn } from "@/lib/utils";
import type { E2E } from "@/lib/e2e";
import { useCallSession, type ActiveCall } from "./call/useCallSession";
import CallStage from "./call/CallStage";
import CallControls from "./call/CallControls";

export type { ActiveCall };

type Props = {
  call: ActiveCall;
  token: string;
  e2e: E2E;
  onClose: () => void;
};

export default function CallScreen({ call, token, e2e, onClose }: Props) {
  const session = useCallSession({ call, token, e2e, onClose });
  const { isVideo } = session;

  return (
    <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
      <div
        className={cn(
          "relative flex h-[100dvh] w-full flex-col overflow-hidden",
          isVideo ? "bg-primary text-primary-foreground" : "bg-gradient-to-br from-tile-a to-tile-b text-foreground",
        )}
      >
        <CallStage call={call} session={session} />
        <CallControls session={session} />
      </div>
    </div>
  );
}
