import { useEffect, useRef } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/messenger-data";
import UserAvatar from "../UserAvatar";

export default function GroupTile({
  user,
  label,
  stream,
  localTrack,
  showVideo,
  muted,
  micOn,
  dark,
  status,
}: {
  user: User;
  label: string;
  stream: MediaStream | null;
  localTrack: MediaStreamTrack | null;
  showVideo: boolean;
  muted: boolean;
  micOn: boolean;
  dark: boolean;
  status: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const src = localTrack ? new MediaStream([localTrack]) : stream;
    if (v.srcObject !== src) v.srcObject = src;
    v.play().catch(() => null);
  }, [stream, localTrack, showVideo, stream?.getTracks().length]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !stream) return;
    if (a.srcObject !== stream) a.srcObject = stream;
    a.muted = muted;
    a.play().catch(() => null);
  }, [stream, muted, stream?.getTracks().length]);

  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden rounded-[14px]",
        dark ? "bg-primary-foreground/10" : "bg-card",
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn("absolute inset-0 h-full w-full object-cover", !showVideo && "hidden", localTrack && "-scale-x-100")}
      />
      {stream && <audio ref={audioRef} autoPlay />}
      {!showVideo && <UserAvatar user={user} hideOnline size={72} />}
      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5">
        <span className="flex min-w-0 items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[.75em] text-white">
          {!micOn && <Icon name="MicOff" size={12} />}
          <span className="truncate">{label}</span>
        </span>
        {status && <span className="rounded-full bg-black/45 px-2.5 py-1 text-[.7em] text-white/80">{status}</span>}
      </div>
    </div>
  );
}
