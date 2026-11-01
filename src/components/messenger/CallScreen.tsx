import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { api, API_URL, type CallKind, type User } from "@/lib/messenger-data";
import { createPeer, getMedia, waitIce } from "@/lib/webrtc";
import type { E2E } from "@/lib/e2e";
import UserAvatar from "./UserAvatar";

export type ActiveCall = {
  peer: User;
  kind: CallKind;
  incoming?: { id: number; offer: string };
};

type Props = {
  call: ActiveCall;
  token: string;
  e2e: E2E;
  onClose: () => void;
};

type Phase = "ringing" | "connecting" | "calling" | "live" | "ended";

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function CallScreen({ call, token, e2e, onClose }: Props) {
  const isVideo = call.kind === "video";
  const [phase, setPhase] = useState<Phase>(call.incoming ? "ringing" : "connecting");
  const [endText, setEndText] = useState("Звонок завершён");
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(isVideo);
  const [speaker, setSpeaker] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [noCamera, setNoCamera] = useState(false);
  const [remoteVideo, setRemoteVideo] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<number | null>(call.incoming?.id ?? null);
  const finishedRef = useRef(false);
  const isCaller = !call.incoming;
  const lostAtRef = useRef(0);
  const restartingRef = useRef(false);
  const offerAtRef = useRef(0);
  const mySeqRef = useRef(0);
  const handledSeqRef = useRef(0);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const connectedOnceRef = useRef(false);

  const cleanup = () => {
    wakeRef.current?.release().catch(() => null);
    wakeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
  };

  const finish = (text: string, notify: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (notify && callIdRef.current) api("call_end", { callId: callIdRef.current }, token).catch(() => null);
    cleanup();
    setEndText(text);
    setPhase("ended");
    window.setTimeout(onClose, 1400);
  };

  const attachLocal = (stream: MediaStream) => {
    streamRef.current = stream;
    if (localRef.current) localRef.current.srcObject = stream;
    if (isVideo && stream.getVideoTracks().length === 0) {
      setNoCamera(true);
      setCam(false);
    }
  };

  const setupPeer = (stream: MediaStream | null) => {
    const pc = createPeer();
    pcRef.current = pc;
    const remote = new MediaStream();
    remoteStreamRef.current = remote;
    if (remoteRef.current) remoteRef.current.srcObject = remote;
    pc.ontrack = (e) => {
      remote.addTrack(e.track);
      if (e.track.kind === "video") setRemoteVideo(true);
      if (remoteRef.current) {
        remoteRef.current.srcObject = remote;
        remoteRef.current.play().catch(() => null);
      }
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") {
        connectedOnceRef.current = true;
        lostAtRef.current = 0;
        setReconnecting(false);
        setPhase("live");
        return;
      }
      if (st === "disconnected" || st === "failed") {
        if (!connectedOnceRef.current) {
          if (st === "failed") finish("Не удалось соединиться", true);
          return;
        }
        if (!lostAtRef.current) lostAtRef.current = Date.now();
        setReconnecting(true);
        if (st === "failed") restartIce();
      }
    };
    if (stream) stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    if (!stream || stream.getAudioTracks().length === 0) pc.addTransceiver("audio", { direction: "recvonly" });
    if (isVideo && (!stream || stream.getVideoTracks().length === 0)) pc.addTransceiver("video", { direction: "recvonly" });
    return pc;
  };

  const restartIce = async () => {
    const pc = pcRef.current;
    const id = callIdRef.current;
    if (!isCaller || !pc || !id || restartingRef.current || finishedRef.current || !call.peer.publicKey) return;
    if (pc.signalingState === "have-local-offer" && Date.now() - offerAtRef.current > 12000) {
      await pc.setLocalDescription({ type: "rollback" }).catch(() => null);
    }
    if (pc.signalingState !== "stable") return;
    restartingRef.current = true;
    offerAtRef.current = Date.now();
    try {
      pc.restartIce();
      await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
      await waitIce(pc, 2500);
      const offer = await e2e.seal(call.peer.publicKey, JSON.stringify(pc.localDescription));
      const r = await api<{ seq: number }>("call_reoffer", { callId: id, offer }, token);
      mySeqRef.current = r.seq;
    } catch {
      const sig = pc.signalingState as RTCSignalingState;
      if (sig === "have-local-offer") await pc.setLocalDescription({ type: "rollback" }).catch(() => null);
    } finally {
      restartingRef.current = false;
    }
  };

  useEffect(() => {
    if (!reconnecting) return;
    const t = window.setInterval(() => {
      const pc = pcRef.current;
      if (!pc || finishedRef.current) return;
      if (pc.connectionState === "connected") {
        setReconnecting(false);
        lostAtRef.current = 0;
        return;
      }
      if (lostAtRef.current && Date.now() - lostAtRef.current > 60000) {
        finish("Связь потеряна", true);
        return;
      }
      if (isCaller) restartIce();
    }, 5000);
    return () => window.clearInterval(t);
  }, [reconnecting]);

  useEffect(() => {
    const acquire = async () => {
      if (document.hidden || finishedRef.current) return;
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> } })
          .wakeLock;
        if (wl && !wakeRef.current) {
          wakeRef.current = await wl.request("screen");
          wakeRef.current.addEventListener("release", () => (wakeRef.current = null));
        }
      } catch {
        wakeRef.current = null;
      }
    };
    const onVis = () => {
      if (document.hidden) return;
      acquire();
      remoteRef.current?.play().catch(() => null);
      const pc = pcRef.current;
      if (pc && connectedOnceRef.current && pc.connectionState !== "connected") {
        if (!lostAtRef.current) lostAtRef.current = Date.now();
        setReconnecting(true);
        restartIce();
      }
      streamRef.current?.getVideoTracks().forEach((tr) => {
        if (tr.readyState === "ended" && isVideo) {
          navigator.mediaDevices
            .getUserMedia({ video: true })
            .then((ns) => {
              const nt = ns.getVideoTracks()[0];
              if (!nt || !pcRef.current) return;
              const sender = pcRef.current.getSenders().find((x) => x.track?.kind === "video" || x.track === tr);
              sender?.replaceTrack(nt);
              streamRef.current?.removeTrack(tr);
              streamRef.current?.addTrack(nt);
              nt.enabled = cam;
              if (localRef.current && streamRef.current) localRef.current.srcObject = streamRef.current;
            })
            .catch(() => null);
        }
      });
    };
    if (phase === "live") acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase, cam]);

  useEffect(() => {
    if (call.incoming) return;
    let cancelled = false;
    (async () => {
      const stream = await getMedia(isVideo);
      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (stream) attachLocal(stream);
      const pc = setupPeer(stream);
      await pc.setLocalDescription(await pc.createOffer());
      await waitIce(pc);
      if (cancelled) return;
      if (!call.peer.publicKey) return finish(`${call.peer.name} ещё не включил(а) шифрование`, false);
      try {
        const offer = await e2e.seal(call.peer.publicKey, JSON.stringify(pc.localDescription));
        const res = await api<{ callId: number }>(
          "call_start",
          { userId: call.peer.id, kind: call.kind, offer },
          token,
        );
        callIdRef.current = res.callId;
        if (!finishedRef.current) setPhase("calling");
      } catch (e) {
        finish(e instanceof Error ? e.message : "Ошибка звонка", false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== "calling" && phase !== "live" && phase !== "ringing") return;
    let gotAnswer = phase === "live" || !!call.incoming;
    const tick = async () => {
      const id = callIdRef.current;
      if (!id || finishedRef.current) return;
      try {
        const res = await api<{
          status: string;
          answer: string | null;
          reseq: number;
          reoffer: string | null;
          reanswerSeq: number;
          reanswer: string | null;
        }>("call_get", { callId: id }, token);
        if (res.status === "declined") return finish("Звонок отклонён", false);
        if (res.status === "missed") return finish(call.incoming ? "Пропущенный звонок" : "Не отвечает", false);
        if (res.status === "ended") return finish("Звонок завершён", false);
        if (!gotAnswer && res.answer && pcRef.current) {
          gotAnswer = true;
          const opened = await e2e.open(res.answer);
          if (opened.senderKey !== call.peer.publicKey) return finish("Ключ собеседника не совпал — звонок прерван", true);
          await pcRef.current.setRemoteDescription(JSON.parse(opened.text));
        }
        const pc = pcRef.current;
        if (pc && !isCaller && res.reoffer && res.reseq > handledSeqRef.current) {
          handledSeqRef.current = res.reseq;
          const opened = await e2e.open(res.reoffer);
          if (opened.senderKey !== call.peer.publicKey && call.peer.publicKey) return;
          await pc.setRemoteDescription(JSON.parse(opened.text));
          await pc.setLocalDescription(await pc.createAnswer());
          await waitIce(pc, 2500);
          const answer = await e2e.seal(opened.senderKey, JSON.stringify(pc.localDescription));
          await api("call_reanswer", { callId: id, answer, seq: res.reseq }, token);
        }
        if (
          pc &&
          isCaller &&
          res.reanswer &&
          mySeqRef.current &&
          res.reanswerSeq === mySeqRef.current &&
          pc.signalingState === "have-local-offer"
        ) {
          const opened = await e2e.open(res.reanswer);
          if (opened.senderKey !== call.peer.publicKey) return;
          await pc.setRemoteDescription(JSON.parse(opened.text));
        }
      } catch {
        return;
      }
    };
    const t = window.setInterval(tick, phase === "calling" || reconnecting ? 1500 : 3000);
    return () => window.clearInterval(t);
  }, [phase, reconnecting]);

  useEffect(() => {
    if (phase !== "live") return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = mic));
  }, [mic]);

  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = cam));
  }, [cam]);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.muted = !speaker;
  }, [speaker]);

  useEffect(() => {
    if (localRef.current && streamRef.current) localRef.current.srcObject = streamRef.current;
  }, [phase]);

  useEffect(() => {
    const onUnload = () => {
      if (callIdRef.current && !finishedRef.current)
        fetch(API_URL, {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json", "X-Auth-Token": token },
          body: JSON.stringify({ action: "call_end", callId: callIdRef.current }),
        }).catch(() => null);
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      cleanup();
    };
  }, []);

  const accept = async () => {
    if (!call.incoming) return;
    setPhase("connecting");
    const stream = await getMedia(isVideo);
    if (stream) attachLocal(stream);
    const pc = setupPeer(stream);
    try {
      const opened = await e2e.open(call.incoming.offer);
      if (call.peer.publicKey && opened.senderKey !== call.peer.publicKey) throw new Error("Ключ собеседника не совпал");
      await pc.setRemoteDescription(JSON.parse(opened.text));
      await pc.setLocalDescription(await pc.createAnswer());
      await waitIce(pc);
      const answer = await e2e.seal(opened.senderKey, JSON.stringify(pc.localDescription));
      await api("call_answer", { callId: call.incoming.id, answer }, token);
    } catch (e) {
      finish(e instanceof Error ? e.message : "Не удалось ответить", true);
    }
  };

  const hangup = () => finish(phase === "ringing" ? "Звонок отклонён" : "Звонок завершён", true);

  const statusText =
    phase === "ringing"
      ? isVideo
        ? "Входящий видеозвонок"
        : "Входящий аудиозвонок"
      : phase === "connecting"
        ? "Соединение…"
        : phase === "calling"
          ? "Вызов…"
          : phase === "ended"
            ? endText
            : reconnecting
              ? "Восстанавливаем связь…"
              : fmt(seconds);

  const showRemote = isVideo && phase === "live" && remoteVideo;

  return (
    <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
      <div
        className={cn(
          "relative flex h-[100dvh] w-full flex-col overflow-hidden",
          isVideo ? "bg-primary text-primary-foreground" : "bg-gradient-to-br from-tile-a to-tile-b text-foreground",
        )}
      >
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className={cn("absolute inset-0 h-full w-full bg-black object-cover", !showRemote && "pointer-events-none opacity-0")}
        />

        <div className="relative z-10 flex items-center justify-between p-5 lg:p-7">
          <div className="flex items-center gap-2 font-head font-semibold">
            <Icon name={isVideo ? "Video" : "Phone"} size={18} />
            RusAPP · {isVideo ? "Видео" : "Аудио"}
          </div>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[.8em] font-medium",
              isVideo ? "bg-primary-foreground/15" : "bg-card",
            )}
          >
            <Icon name="Lock" size={12} />
            Сквозное шифрование
          </span>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center gap-5 px-5 text-center">
          {!showRemote && (
            <>
              <div className="relative">
                {(phase === "ringing" || phase === "calling") &&
                  [0, 0.5].map((d) => (
                    <span
                      key={d}
                      className={cn(
                        "absolute inset-0 animate-ring-pulse rounded-full",
                        isVideo ? "bg-accent/50" : "bg-primary/25",
                      )}
                      style={{ animationDelay: `${d}s` }}
                    />
                  ))}
                <UserAvatar user={call.peer} hideOnline size={128} className="relative" />
              </div>
              <div className="relative">
                <h2 className="hero-title">{call.peer.name}</h2>
                <p
                  className={cn(
                    "mt-2 font-head text-[1.1em] tabular-nums",
                    isVideo ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {statusText}
                </p>
              </div>
            </>
          )}
          {showRemote && (
            <span className="absolute left-5 top-0 rounded-full bg-black/40 px-3 py-1 font-head text-[.9em] tabular-nums text-white lg:left-7">
              {call.peer.name} · {reconnecting ? "Восстанавливаем связь…" : fmt(seconds)}
            </span>
          )}
        </div>

        {isVideo && phase !== "ringing" && phase !== "ended" && (
          <div className="absolute bottom-28 right-4 z-10 aspect-[3/4] w-28 overflow-hidden rounded-xl border border-primary-foreground/20 bg-foreground/60 sm:w-40 lg:bottom-32 lg:right-7 lg:w-48">
            <video
              ref={localRef}
              autoPlay
              playsInline
              muted
              className={cn("h-full w-full -scale-x-100 object-cover", (!cam || noCamera) && "hidden")}
            />
            {(!cam || noCamera) && (
              <div className="grid h-full place-items-center p-3 text-center text-[.75em] text-primary-foreground/70">
                <div>
                  <Icon name="VideoOff" size={22} className="mx-auto mb-1.5" />
                  {noCamera ? "Нет доступа к камере" : "Камера выключена"}
                </div>
              </div>
            )}
            <span className="absolute bottom-1.5 left-2 text-[.7em] text-primary-foreground/80">Вы</span>
          </div>
        )}

        <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 p-5 lg:p-7">
          {phase === "ended" ? null : phase === "ringing" ? (
            <>
              <button
                onClick={hangup}
                className="flex h-14 items-center gap-2 rounded-full bg-destructive px-6 font-head font-semibold text-destructive-foreground transition-transform hover:scale-105"
              >
                <Icon name="PhoneOff" size={20} />
                Отклонить
              </button>
              <button
                onClick={accept}
                className="flex h-14 items-center gap-2 rounded-full bg-online px-6 font-head font-semibold text-primary-foreground transition-transform hover:scale-105"
              >
                <Icon name={isVideo ? "Video" : "Phone"} size={20} />
                Принять
              </button>
            </>
          ) : (
            <>
              <CtrlButton
                dark={isVideo}
                active={mic}
                onClick={() => setMic((v) => !v)}
                icon={mic ? "Mic" : "MicOff"}
                label={mic ? "Микрофон" : "Без звука"}
              />
              {isVideo && (
                <CtrlButton
                  dark
                  active={cam && !noCamera}
                  onClick={() => !noCamera && setCam((v) => !v)}
                  icon={cam && !noCamera ? "Video" : "VideoOff"}
                  label="Камера"
                />
              )}
              <CtrlButton
                dark={isVideo}
                active={speaker}
                onClick={() => setSpeaker((v) => !v)}
                icon={speaker ? "Volume2" : "VolumeX"}
                label="Динамик"
              />
              <button
                onClick={hangup}
                aria-label="Завершить"
                className="grid h-14 w-20 place-items-center rounded-full bg-destructive text-destructive-foreground transition-transform hover:scale-105"
              >
                <Icon name="PhoneOff" size={22} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CtrlButton({
  active,
  onClick,
  icon,
  label,
  dark,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  dark: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-14 w-14 place-items-center rounded-full transition-all hover:scale-105",
        dark
          ? active
            ? "bg-primary-foreground/15 text-primary-foreground"
            : "bg-primary-foreground text-primary"
          : active
            ? "bg-card text-foreground"
            : "bg-foreground text-background",
      )}
    >
      <Icon name={icon} size={22} />
    </button>
  );
}