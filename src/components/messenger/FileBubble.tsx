import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { loadDecrypted, saveBlob } from "@/lib/files";
import { fileSize, type FileMeta } from "@/lib/payload";
import VoiceBubble from "./chat/VoiceBubble";
import CircleBubble from "./chat/CircleBubble";

export default function FileBubble({ meta }: { meta: FileMeta; mine?: boolean }) {
  if (meta.kind === "voice") return <VoiceBubble meta={meta} />;
  if (meta.kind === "circle") return <CircleBubble meta={meta} />;
  return <PlainFile meta={meta} />;
}

function PlainFile({ meta }: { meta: FileMeta }) {
  const isImage = meta.mime.startsWith("image/");
  const isVideo = meta.mime.startsWith("video/");
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">(isImage ? "loading" : "idle");
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!isImage) return;
    let obj = "";
    loadDecrypted(meta)
      .then((b) => {
        obj = URL.createObjectURL(b);
        setUrl(obj);
        setState("idle");
      })
      .catch(() => setState("error"));
    return () => {
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [meta.urls[0]]);

  const open = async () => {
    setState("loading");
    try {
      const b = await loadDecrypted(meta);
      if (isVideo) {
        setUrl(URL.createObjectURL(b));
        setState("idle");
        return;
      }
      saveBlob(b, meta.name);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  if (isImage) {
    const ratio = meta.w && meta.h ? meta.w / meta.h : 4 / 3;
    return (
      <>
        <button
          type="button"
          onClick={() => url && setFull(true)}
          className="block w-[260px] max-w-full overflow-hidden rounded-xl bg-foreground/5"
          style={{ aspectRatio: String(ratio) }}
        >
          {url ? (
            <img src={url} alt={meta.caption || meta.name} className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-muted-foreground">
              <Icon name={state === "error" ? "ImageOff" : "Loader2"} size={22} className={state === "loading" ? "animate-spin" : ""} />
            </span>
          )}
        </button>
        {meta.caption && <div className="mt-1.5">{meta.caption}</div>}
        {full && url && (
          <div className="fixed inset-0 z-[70] grid place-items-center bg-black/90 p-4" onClick={() => setFull(false)}>
            <img src={url} alt="" className="max-h-full max-w-full object-contain" />
            <div className="absolute right-4 top-4 flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  loadDecrypted(meta).then((b) => saveBlob(b, meta.name));
                }}
                className="rounded-full bg-white/15 p-2.5 text-white"
                aria-label="Скачать"
              >
                <Icon name="Download" size={20} />
              </button>
              <button className="rounded-full bg-white/15 p-2.5 text-white" aria-label="Закрыть">
                <Icon name="X" size={20} />
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (isVideo && url) {
    return <video src={url} controls playsInline className="w-[280px] max-w-full rounded-xl" />;
  }

  return (
    <button type="button" onClick={open} className="flex w-[260px] max-w-full items-center gap-3 text-left">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-foreground/10">
        <Icon
          name={state === "loading" ? "Loader2" : state === "error" ? "FileX" : isVideo ? "Play" : "FileText"}
          size={20}
          className={state === "loading" ? "animate-spin" : ""}
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{meta.name}</span>
        <span className="text-[.8em] opacity-70">
          {state === "error" ? "Не удалось загрузить — нажмите ещё раз" : `${fileSize(meta.size)} · ${isVideo ? "смотреть" : "скачать"}`}
        </span>
      </span>
    </button>
  );
}
