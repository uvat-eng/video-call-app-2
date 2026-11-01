import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { api, type CallKind, type GroupMember, type User } from "@/lib/messenger-data";
import { createPeer, getMedia } from "@/lib/webrtc";
import type { E2E } from "@/lib/e2e";
import UserAvatar from "./UserAvatar";
import ContactPicker from "./ContactPicker";

export const MAX_GROUP = 20;
export const MAX_VIDEO = 6;

export type ActiveGroup = {
  kind: CallKind;
  callId?: number;
  invite?: User[];
  incoming?: { host: User; total: number };
};

type Props = {
  group: ActiveGroup;
  me: User;
  token: string;
  e2e: E2E;
  contacts: User[];
  onClose: () => void;
};

type Peer = {
  pc: RTCPeerConnection;
  stream: MediaStream;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  videoSender?: RTCRtpSender;
};

type Signal =
  | { t: "sdp"; d: RTCSessionDescriptionInit }
  | { t: "ice"; d: RTCIceCandidateInit }
  | { t: "state"; cam: boolean; mic: boolean };

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function GroupCallScreen({ group, me, token, e2e, contacts, onClose }: Props) {
  const isVideo = group.kind === "video";
  const [phase, setPhase] = useState<"ringing" | "joining" | "live" | "ended">(group.incoming ? "ringing" : "joining");
  const [endText, setEndText] = useState("Звонок завершён");
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(false);
  const [camNote, setCamNote] = useState("");
  const [speaker, setSpeaker] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [, setTick] = useState(0);
  const [remoteCams, setRemoteCams] = useState<Record<number, boolean>>({});
  const [remoteMics, setRemoteMics] = useState<Record<number, boolean>>({});
  const [connected, setConnected] = useState<Record<number, boolean>>({});
  const [picker, setPicker] = useState(false);

  const callIdRef = useRef<number | null>(group.callId ?? null);
  const peersRef = useRef<Map<number, Peer>>(new Map());
  const localRef = useRef<MediaStream | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const outbox = useRef<{ to: number; payload: string }[]>([]);
  const keysRef = useRef<Map<number, string>>(new Map());
  const finishedRef = useRef(false);
  const camRef = useRef(false);
  const micRef = useRef(true);
  const pollingRef = useRef(false);

  const membersRef = useRef<GroupMember[]>([]);
  membersRef.current = members;
  camRef.current = cam;
  micRef.current = mic;

  const send = useCallback(
    async (to: number, sig: Signal) => {
      const key = keysRef.current.get(to);
      if (!key) return;
      outbox.current.push({ to, payload: await e2e.seal(key, JSON.stringify(sig)) });
    },
    [e2e],
  );

  const closePeer = (id: number) => {
    const p = peersRef.current.get(id);
    if (!p) return;
    p.pc.close();
    peersRef.current.delete(id);
    setConnected((c) => ({ ...c, [id]: false }));
    setTick((t) => t + 1);
  };

  const cleanup = () => {
    peersRef.current.forEach((p) => p.pc.close());
    peersRef.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    camTrackRef.current?.stop();
    localRef.current = null;
    camTrackRef.current = null;
  };

  const finish = useCallback(
    (text: string, notify: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const id = callIdRef.current;
      if (notify && id) api(phase === "ringing" ? "group_decline" : "group_leave", { callId: id }, token).catch(() => null);
      cleanup();
      setEndText(text);
      setPhase("ended");
      window.setTimeout(onClose, 1200);
    },
    [phase, token, onClose],
  );

  const ensurePeer = (user: User) => {
    const existing = peersRef.current.get(user.id);
    if (existing) return existing;
    if (user.publicKey) keysRef.current.set(user.id, user.publicKey);
    const pc = createPeer();
    const stream = new MediaStream();
    const peer: Peer = { pc, stream, polite: me.id > user.id, makingOffer: false, ignoreOffer: false };
    peersRef.current.set(user.id, peer);

    const local = localRef.current;
    local?.getAudioTracks().forEach((t) => pc.addTrack(t, local));
    if (isVideo) {
      const tr = pc.addTransceiver("video", { direction: "sendrecv" });
      peer.videoSender = tr.sender;
      if (camTrackRef.current) tr.sender.replaceTrack(camTrackRef.current);
    }
    if (!local || local.getAudioTracks().length === 0) pc.addTransceiver("audio", { direction: "recvonly" });

    pc.ontrack = (e) => {
      if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
      setTick((t) => t + 1);
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) send(user.id, { t: "ice", d: e.candidate.toJSON() });
    };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription) await send(user.id, { t: "sdp", d: pc.localDescription.toJSON() });
      } catch {
        return;
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      setConnected((c) => ({ ...c, [user.id]: st === "connected" }));
      if (st === "connected") send(user.id, { t: "state", cam: camRef.current, mic: micRef.current });
      if (st === "failed") pc.restartIce();
    };
    return peer;
  };

  const handleSignal = async (from: number, sig: Signal) => {
    const user = membersRef.current.find((m) => m.user.id === from)?.user;
    const peer = peersRef.current.get(from) ?? (user ? ensurePeer(user) : undefined);
    if (!peer) return;
    const pc = peer.pc;
    if (sig.t === "state") {
      setRemoteCams((r) => ({ ...r, [from]: sig.cam }));
      setRemoteMics((r) => ({ ...r, [from]: sig.mic }));
      return;
    }
    if (sig.t === "sdp") {
      const offerCollision = sig.d.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
      peer.ignoreOffer = !peer.polite && offerCollision;
      if (peer.ignoreOffer) return;
      await pc.setRemoteDescription(sig.d);
      if (sig.d.type === "offer") {
        await pc.setLocalDescription();
        if (pc.localDescription) await send(from, { t: "sdp", d: pc.localDescription.toJSON() });
      }
      return;
    }
    if (sig.t === "ice") {
      try {
        await pc.addIceCandidate(sig.d);
      } catch {
        if (!peer.ignoreOffer) return;
      }
    }
  };

  const syncMembers = (list: GroupMember[]) => {
    setMembers(list);
    membersRef.current = list;
    for (const m of list) {
      if (m.user.id === me.id) continue;
      if (m.user.publicKey) keysRef.current.set(m.user.id, m.user.publicKey);
      if (m.state === "joined") {
        if (!peersRef.current.has(m.user.id) && me.id < m.user.id) ensurePeer(m.user);
      } else if (peersRef.current.has(m.user.id)) {
        closePeer(m.user.id);
      }
    }
  };

  const poll = async () => {
    const id = callIdRef.current;
    if (!id || finishedRef.current || pollingRef.current) return;
    pollingRef.current = true;
    const signals = outbox.current;
    outbox.current = [];
    try {
      const res = await api<{
        status: string;
        members: GroupMember[];
        signals: { id: number; from: number; payload: string }[];
      }>("group_poll", { callId: id, signals }, token);
      if (res.status === "ended") return finish("Звонок завершён", false);
      syncMembers(res.members);
      for (const s of res.signals) {
        try {
          const opened = await e2e.open(s.payload);
          const expected = keysRef.current.get(s.from);
          if (expected && opened.senderKey !== expected) continue;
          const sender = res.members.find((m) => m.user.id === s.from)?.user;
          if (sender && !peersRef.current.has(s.from)) ensurePeer(sender);
          await handleSignal(s.from, JSON.parse(opened.text) as Signal);
        } catch {
          continue;
        }
      }
    } catch {
      outbox.current.unshift(...signals);
    } finally {
      pollingRef.current = false;
    }
  };

  const join = async () => {
    setPhase("joining");
    const local = await getMedia(false);
    localRef.current = local ?? new MediaStream();
    try {
      if (!callIdRef.current) {
        const ids = (group.invite ?? []).map((u) => u.id);
        const r = await api<{ callId: number; members: GroupMember[]; skipped: number }>(
          "group_start",
          { userIds: ids, kind: group.kind },
          token,
        );
        callIdRef.current = r.callId;
        syncMembers(r.members);
      } else {
        const r = await api<{ members: GroupMember[] }>("group_join", { callId: callIdRef.current }, token);
        syncMembers(r.members);
      }
      setPhase("live");
    } catch (e) {
      finish(e instanceof Error ? e.message : "Не удалось подключиться", false);
    }
  };

  useEffect(() => {
    if (!group.incoming) join();
    return () => cleanup();
  }, []);

  useEffect(() => {
    if (phase !== "live") return;
    poll();
    const t = window.setInterval(poll, outbox.current.length ? 700 : 1500);
    return () => window.clearInterval(t);
  }, [phase, members.length]);

  useEffect(() => {
    if (phase !== "ringing" || !group.callId) return;
    const t = window.setTimeout(() => finish("Пропущенный звонок", false), 45000);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "live") return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  useEffect(() => {
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = mic));
    peersRef.current.forEach((_, id) => send(id, { t: "state", cam, mic }));
  }, [mic]);

  const activeCams = Object.entries(remoteCams).filter(
    ([id, on]) => on && members.some((m) => m.user.id === Number(id) && m.state === "joined"),
  ).length;

  const toggleCam = async () => {
    if (!isVideo) return;
    if (cam) {
      camTrackRef.current?.stop();
      camTrackRef.current = null;
      peersRef.current.forEach((p) => p.videoSender?.replaceTrack(null));
      setCam(false);
      peersRef.current.forEach((_, id) => send(id, { t: "state", cam: false, mic }));
      return;
    }
    if (activeCams >= MAX_VIDEO) {
      setCamNote(`Видео одновременно могут включить не больше ${MAX_VIDEO} человек`);
      window.setTimeout(() => setCamNote(""), 3500);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 20 } },
      });
      const tr = s.getVideoTracks()[0];
      camTrackRef.current = tr;
      peersRef.current.forEach((p) => p.videoSender?.replaceTrack(tr));
      setCam(true);
      peersRef.current.forEach((_, id) => send(id, { t: "state", cam: true, mic }));
    } catch {
      setCamNote("Нет доступа к камере");
      window.setTimeout(() => setCamNote(""), 3500);
    }
  };

  const invite = async (users: User[]) => {
    setPicker(false);
    if (!callIdRef.current || !users.length) return;
    try {
      const r = await api<{ members: GroupMember[] }>(
        "group_invite",
        { callId: callIdRef.current, userIds: users.map((u) => u.id) },
        token,
      );
      syncMembers(r.members);
    } catch {
      return;
    }
  };

  const tiles = members.filter((m) => m.state === "joined" || m.state === "invited");
  const cols = tiles.length <= 1 ? 1 : tiles.length <= 4 ? 2 : tiles.length <= 9 ? 3 : 4;
  const memberIds = new Set(members.map((m) => m.user.id));
  const free = MAX_GROUP - members.filter((m) => m.state !== "declined" && m.state !== "missed").length;

  return (
    <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
      <div
        className={cn(
          "relative flex h-[100dvh] w-full flex-col overflow-hidden",
          isVideo ? "bg-primary text-primary-foreground" : "bg-gradient-to-br from-tile-a to-tile-b text-foreground",
        )}
      >
        <div className="relative z-10 flex items-center justify-between gap-3 p-4 lg:p-6">
          <div className="flex min-w-0 items-center gap-2 font-head font-semibold">
            <Icon name="Users" size={18} />
            <span className="truncate">
              Групповой {isVideo ? "видеозвонок" : "аудиозвонок"}
              {phase === "live" && ` · ${fmt(seconds)}`}
            </span>
          </div>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-[3px] text-[.8em] font-medium",
              isVideo ? "bg-primary-foreground/15" : "bg-card",
            )}
          >
            <Icon name="ShieldCheck" size={12} />
            Напрямую, зашифровано
          </span>
        </div>

        {phase === "ringing" || phase === "ended" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5 text-center">
            <div className="relative">
              {phase === "ringing" &&
                [0, 0.5].map((d) => (
                  <span
                    key={d}
                    className={cn("absolute inset-0 animate-ring-pulse rounded-full", isVideo ? "bg-accent/50" : "bg-primary/25")}
                    style={{ animationDelay: `${d}s` }}
                  />
                ))}
              {group.incoming && <UserAvatar user={group.incoming.host} hideOnline size={128} className="relative" />}
            </div>
            <div>
              <h2 className="hero-title">{group.incoming?.host.name ?? "Групповой звонок"}</h2>
              <p className={cn("mt-2 font-head text-[1.1em]", isVideo ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {phase === "ended"
                  ? endText
                  : `Приглашает в групповой ${isVideo ? "видеозвонок" : "аудиозвонок"} · ${group.incoming?.total ?? 0} участников`}
              </p>
            </div>
          </div>
        ) : (
          <div
            className="grid min-h-0 flex-1 gap-2 overflow-y-auto px-3 pb-2 lg:px-6"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: "minmax(140px, 1fr)" }}
          >
            {tiles.map((m) => {
              const isMe = m.user.id === me.id;
              const peer = peersRef.current.get(m.user.id);
              const showVideo = isVideo && (isMe ? cam : remoteCams[m.user.id] && connected[m.user.id]);
              const micOn = isMe ? mic : remoteMics[m.user.id] !== false;
              return (
                <Tile
                  key={m.user.id}
                  user={m.user}
                  label={isMe ? "Вы" : m.user.name}
                  stream={isMe ? null : (peer?.stream ?? null)}
                  localTrack={isMe ? camTrackRef.current : null}
                  showVideo={!!showVideo}
                  muted={isMe || !speaker}
                  micOn={micOn}
                  dark={isVideo}
                  status={
                    isMe
                      ? ""
                      : m.state === "invited"
                        ? "Вызов…"
                        : connected[m.user.id]
                          ? ""
                          : "Соединение…"
                  }
                />
              );
            })}
          </div>
        )}

        {camNote && (
          <div className="absolute bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-full bg-foreground/80 px-4 py-2 text-[.85em] text-background">
            {camNote}
          </div>
        )}

        <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 p-4 lg:p-6">
          {phase === "ended" ? null : phase === "ringing" ? (
            <>
              <button
                onClick={() => finish("Звонок отклонён", true)}
                className="flex h-14 items-center gap-2 rounded-full bg-destructive px-6 font-head font-semibold text-destructive-foreground"
              >
                <Icon name="PhoneOff" size={20} />
                Отклонить
              </button>
              <button
                onClick={join}
                className="flex h-14 items-center gap-2 rounded-full bg-online px-6 font-head font-semibold text-primary-foreground"
              >
                <Icon name={isVideo ? "Video" : "Phone"} size={20} />
                Присоединиться
              </button>
            </>
          ) : (
            <>
              <Ctrl dark={isVideo} active={mic} onClick={() => setMic((v) => !v)} icon={mic ? "Mic" : "MicOff"} label="Микрофон" />
              {isVideo && (
                <Ctrl dark active={cam} onClick={toggleCam} icon={cam ? "Video" : "VideoOff"} label="Камера" />
              )}
              <Ctrl
                dark={isVideo}
                active={speaker}
                onClick={() => setSpeaker((v) => !v)}
                icon={speaker ? "Volume2" : "VolumeX"}
                label="Динамик"
              />
              {phase === "live" && free > 0 && (
                <Ctrl dark={isVideo} active onClick={() => setPicker(true)} icon="UserPlus" label="Добавить" />
              )}
              <button
                onClick={() => finish("Вы вышли из звонка", true)}
                aria-label="Выйти"
                className="grid h-14 w-20 place-items-center rounded-full bg-destructive text-destructive-foreground"
              >
                <Icon name="PhoneOff" size={22} />
              </button>
            </>
          )}
        </div>
      </div>

      {picker && (
        <ContactPicker
          title="Добавить в звонок"
          contacts={contacts.filter((c) => !memberIds.has(c.id) || members.find((m) => m.user.id === c.id && m.state !== "joined" && m.state !== "invited"))}
          max={free}
          kind={group.kind}
          onCancel={() => setPicker(false)}
          onConfirm={(users) => invite(users)}
          confirmLabel="Пригласить"
        />
      )}
    </div>
  );
}

function Tile({
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

function Ctrl({
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
