const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export function createPeer() {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

export function waitIce(pc: RTCPeerConnection, timeout = 3000) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      window.clearTimeout(t);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const t = window.setTimeout(done, timeout);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export async function getMedia(video: boolean) {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video });
  } catch {
    if (video) {
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        return null;
      }
    }
    return null;
  }
}
