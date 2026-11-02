import { useEffect, useMemo, useState } from "react";
import { api, type CallKind, type ChatItem, type Message, type User } from "@/lib/messenger-data";
import { encodePayload, isSilentText, type Payload } from "@/lib/payload";
import { compressImage, prefetchMedia, storeLocal, uploadEncrypted } from "@/lib/files";
import { createBackup, restoreBackup, saveBackupFile, sizeText } from "@/lib/backup";
import { parsePayload, type FileMeta } from "@/lib/payload";
import { applyLook, loadLook, saveLook, wallpaperCss, type Look } from "@/lib/appearance";
import { groupEncrypt, exportIdentity, sealLinkBundle, newGroupKey, type E2E } from "@/lib/e2e";
import { HISTORY_LIMIT, type History, type MessengerCore } from "./useMessengerCore";

export function useMessengerActions({
  core,
  token,
  me,
  e2e,
  setMe,
}: {
  core: MessengerCore;
  token: string;
  me: User;
  e2e: E2E;
  setMe: (u: User) => void;
}) {
  const {
    setServerChats,
    history,
    pending,
    setPending,
    outbox,
    outboxRef,
    setActiveId,
    setMobileOpen,
    setContacts,
    calls,
    call,
    setCall,
    groupCall,
    setGroupCall,
    groupCalls,
    setGroupPicker,
    setSendError,
    activeRef,
    groupKeys,
    pendingChatRef,
    historyRef,
    saveChain,
    saveGroupKeys,
    saveOutbox,
    persist,
    appendMessages,
    removeMessages,
    handleAuthError,
    groupKeyOf,
    poll,
    chats,
    openChat,
    loadContacts,
    loadCalls,
    active,
  } = core;

  const sendGroup = async (chat: ChatItem, text: string, silent: boolean) => {
    const g = chat.group!;
    const tempId = -Date.now();
    if (!silent) {
      const temp: Message = { id: tempId, mine: true, text, at: new Date().toISOString(), read: false };
      setPending((p) => ({ ...p, [chat.id]: [...(p[chat.id] ?? []), temp] }));
    }
    try {
      const raw = await groupKeyOf(g);
      if (!raw) throw new Error("Ключ группы ещё не получен — подождите, пока кто-то из участников будет в сети");
      const sealed = await groupEncrypt(raw, text);
      const r = await api<{ id: number; at: string }>("gchat_send", { gchatId: g.id, ...sealed, silent }, token);
      await appendMessages([{ chatId: chat.id, msg: { id: r.id, mine: true, text, at: r.at, read: false, from: me.id } }]);
    } catch (e) {
      handleAuthError(e);
      setSendError(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      if (!silent) setPending((p) => ({ ...p, [chat.id]: (p[chat.id] ?? []).filter((m) => m.id !== tempId) }));
    }
  };

  const sendPayload = async (payload: Payload) => {
    const chat = chats.find((c) => c.id === activeRef.current);
    if (!chat) return;
    const text = encodePayload(payload);
    const silent = isSilentText(text);
    if (chat.group) return sendGroup(chat, text, silent);
    if (!silent || !chat.peer.publicKey) return send(text);
    try {
      const fresh = chat.peer.publicKey;
      const sealed = await e2e.encrypt(fresh, text);
      const r = await api<{ id: number; at: string }>("send", { chatId: chat.id, ...sealed, silent: true }, token);
      await appendMessages([{ chatId: chat.id, msg: { id: r.id, mine: true, text, at: r.at, read: true } }]);
    } catch (e) {
      handleAuthError(e);
    }
  };

  const [uploading, setUploading] = useState<number | null>(null);

  const sendFile = async (file: File, caption: string) => {
    const chat = chats.find((c) => c.id === activeRef.current);
    if (!chat) return;
    if (!chat.group && !chat.peer.publicKey) {
      setSendError(`${chat.peer.name} ещё не заходил(а) в RuChat — файлы можно будет отправить после этого`);
      return;
    }
    setSendError("");
    setUploading(0);
    try {
      const isImage = file.type.startsWith("image/");
      const prepared = isImage ? await compressImage(file) : { blob: file as Blob, w: 0, h: 0 };
      const mime = isImage && prepared.blob !== file ? "image/jpeg" : file.type || "application/octet-stream";
      const meta = await uploadEncrypted(prepared.blob, file.name, mime, token, (p) => setUploading(p));
      await storeLocal(meta, prepared.blob);
      if (prepared.w) {
        meta.w = prepared.w;
        meta.h = prepared.h;
      }
      if (caption) meta.caption = caption.slice(0, 1000);
      await sendPayload(meta);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Не удалось отправить файл");
    } finally {
      setUploading(null);
    }
  };

  const [groupCreate, setGroupCreate] = useState(false);

  const createGroup = async (title: string, users: User[]) => {
    try {
      const raw = await newGroupKey();
      const keys = [];
      for (const u of [me, ...users]) {
        const pk = u.id === me.id ? e2e.pub : u.publicKey;
        if (!pk) continue;
        const sealed = await e2e.encrypt(pk, raw);
        keys.push({ userId: u.id, cipher: sealed.cipher, iv: sealed.iv });
      }
      const r = await api<{ chatId: number }>(
        "gchat_create",
        { title, userIds: users.map((u) => u.id), senderKey: e2e.pub, keys },
        token,
      );
      groupKeys.current.set(-r.chatId, raw);
      saveGroupKeys();
      setGroupCreate(false);
      pendingChatRef.current = r.chatId;
      await poll();
      return null;
    } catch (e) {
      handleAuthError(e);
      return e instanceof Error ? e.message : "Не удалось создать группу";
    }
  };

  const groupAction = async (action: string, body: Record<string, unknown>) => {
    try {
      await api(action, body, token);
      if (action === "gchat_leave") {
        activeRef.current = null;
        setActiveId(null);
        setMobileOpen(false);
      }
      await poll();
      return null;
    } catch (e) {
      handleAuthError(e);
      return e instanceof Error ? e.message : "Ошибка";
    }
  };

  const send = async (text: string) => {
    const chat = chats.find((c) => c.id === activeRef.current);
    if (!chat) return;
    if (chat.group) return sendGroup(chat, text, false);
    const peerKey = chat.peer.publicKey;
    setSendError("");
    const chatId = chat.id;
    if (!peerKey) {
      const msg: Message = { id: -Date.now(), mine: true, text, at: new Date().toISOString(), read: false };
      saveOutbox({ ...outboxRef.current, [chatId]: [...(outboxRef.current[chatId] ?? []), msg] });
      api<{ publicKey: string | null }>("wait_key", { chatId }, token)
        .then((r) => {
          if (r.publicKey) poll();
        })
        .catch(() => null);
      return;
    }
    const tempId = -Date.now();
    const temp: Message = { id: tempId, mine: true, text, at: new Date().toISOString(), read: false };
    setPending((p) => ({ ...p, [chatId]: [...(p[chatId] ?? []), temp] }));
    try {
      const sealed = await e2e.encrypt(peerKey, text);
      const r = await api<{ id: number; at: string }>("send", { chatId, ...sealed }, token);
      await appendMessages([{ chatId, msg: { id: r.id, mine: true, text, at: r.at, read: false } }]);
    } catch (e) {
      handleAuthError(e);
      setSendError(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setPending((p) => ({ ...p, [chatId]: (p[chatId] ?? []).filter((m) => m.id !== tempId) }));
    }
  };

  const activeMessages = useMemo<Message[]>(() => {
    if (!active) return [];
    const list = (history[active.id] ?? []).map((m) => (m.mine ? { ...m, read: m.id <= active.readUpto } : m));
    return [...list, ...(outbox[active.id] ?? []), ...(pending[active.id] ?? [])];
  }, [active, history, pending, outbox]);

  const deleteForMe = (ids: number[]) => {
    if (!active) return;
    const local = ids.filter((id) => id < 0);
    if (local.length) {
      const next = { ...outboxRef.current, [active.id]: (outboxRef.current[active.id] ?? []).filter((m) => !local.includes(m.id)) };
      saveOutbox(next);
    }
    removeMessages(active.id, ids);
  };

  const deleteForAll = async (id: number) => {
    if (!active) return;
    await sendPayload({ t: "del", id });
  };

  const openChatWith = async (user: User) => {
    const existing = chats.find((c) => c.peer.id === user.id);
    if (existing) return openChat(existing.id);
    try {
      const r = await api<{ chatId: number }>("open_chat", { userId: user.id }, token);
      setServerChats((prev) => [{ id: r.chatId, peer: user, lastAt: null, unread: 0, readUpto: 0 }, ...prev]);
      openChat(r.chatId);
    } catch (e) {
      handleAuthError(e);
    }
  };

  const addContact = async (phone: string) => {
    try {
      const r = await api<{ contact: User; chatId: number }>("add_contact", { phone }, token);
      setContacts((prev) => (prev.some((c) => c.id === r.contact.id) ? prev : [...prev, r.contact]));
      return null;
    } catch (e) {
      handleAuthError(e);
      return e instanceof Error ? e.message : "Ошибка";
    }
  };

  const [look, setLook] = useState<Look>(() => loadLook());
  const [wallpaper, setWallpaper] = useState("");

  useEffect(() => {
    setWallpaper(wallpaperCss(look));
  }, [look]);

  const changeLook = (next: Look) => {
    saveLook(next);
    applyLook(next);
    setLook(next);
  };

  const saveAvatar = async (body: { image?: string; icon?: string }) => {
    try {
      const r = await api<{ user: User }>("avatar_set", body, token);
      setMe({ ...me, ...r.user });
      return null;
    } catch (e) {
      handleAuthError(e);
      return e instanceof Error ? e.message : "Не удалось сохранить";
    }
  };

  const approveDevice = async (code: string) => {
    try {
      const r = await api<{ devicePub: string; deviceName: string }>("link_lookup", { code }, token);
      const identity = await exportIdentity(e2e.vault);
      if (!identity) return "Ключи на этом устройстве не найдены";
      await saveChain.current;
      const payload = await sealLinkBundle(r.devicePub, {
        identity,
        history: historyRef.current,
        groupKeys: Object.fromEntries(groupKeys.current),
      });
      if (payload.length > 200000) {
        const trimmed: History = {};
        for (const [k, v] of Object.entries(historyRef.current)) trimmed[Number(k)] = v.slice(-150);
        const small = await sealLinkBundle(r.devicePub, { identity, history: trimmed });
        await api("link_approve", { code, payload: small }, token);
      } else {
        await api("link_approve", { code, payload }, token);
      }
      return null;
    } catch (e) {
      handleAuthError(e);
      return e instanceof Error ? e.message : "Не удалось подключить устройство";
    }
  };

  const allFiles = () => {
    const out: FileMeta[] = [];
    for (const list of Object.values(historyRef.current))
      for (const m of list) {
        const p = parsePayload(m.text);
        if (p.t === "file") out.push(p);
      }
    return out;
  };

  const backup = {
    stats: async () => {
      const lists = Object.values(historyRef.current);
      const files = (await e2e.vault.keys("media:")).length;
      return { chats: lists.filter((l) => l.length).length, messages: lists.reduce((n, l) => n + l.length, 0), files };
    },
    onDownloadAll: async (progress: (t: string) => void) => {
      const before = (await e2e.vault.keys("media:")).length;
      const files = allFiles();
      progress(`Загружаю файлы: ${files.length}…`);
      await prefetchMedia(files);
      return (await e2e.vault.keys("media:")).length - before;
    },
    onCreate: async (password: string, progress: (t: string) => void) => {
      try {
        await saveChain.current;
        progress("Сохраняю на устройство фото и файлы из чатов…");
        await prefetchMedia(allFiles());
        const r = await createBackup(e2e.vault, me.id, password, progress);
        const how = await saveBackupFile(r.blob);
        if (how === "cancelled") return "Сохранение отменено";
        localStorage.setItem("rusapp_last_backup", new Date().toISOString());
        return `Копия создана: ${sizeText(r.blob.size)}, файлов внутри: ${r.files}. ${
          how === "shared" ? "Сохраните её в «Файлы» или на диск." : "Файл сохранён в «Загрузки»."
        }`;
      } catch (e) {
        return e instanceof Error ? e.message : "Не удалось создать копию";
      }
    },
    onRestore: async (file: File, password: string) => {
      try {
        await saveChain.current;
        const current = historyRef.current;
        const currentKeys = Object.fromEntries(groupKeys.current);
        await restoreBackup(file, me.id, password, e2e.vault);
        const restored = (await e2e.vault.get<History>("history")) ?? {};
        const merged: History = { ...restored };
        for (const [k, list] of Object.entries(current)) {
          const id = Number(k);
          const map = new Map((merged[id] ?? []).map((m) => [m.id, m]));
          for (const m of list) map.set(m.id, m);
          merged[id] = [...map.values()].sort((a, b) => a.id - b.id).slice(-HISTORY_LIMIT);
        }
        const keys: Record<string, string> = {
          ...((await e2e.vault.get<Record<string, string>>("groupKeys")) ?? {}),
          ...currentKeys,
        };
        for (const [k, v] of Object.entries(keys)) groupKeys.current.set(Number(k), v);
        await e2e.vault.set("groupKeys", keys);
        await persist(merged);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Не удалось восстановить копию";
      }
    },
  };

  const saveProfile = async (name: string, status: string) => {
    try {
      const r = await api<{ user: User }>("update_profile", { name, status }, token);
      setMe(r.user);
      return null;
    } catch (e) {
      handleAuthError(e);
      return e instanceof Error ? e.message : "Ошибка";
    }
  };

  const clearHistory = async () => {
    await persist({});
  };

  const openGroupPicker = () => {
    loadContacts();
    setGroupPicker(true);
  };

  const startGroup = (users: User[], kind: CallKind) => {
    setGroupPicker(false);
    if (call || groupCall || !users.length) return;
    setGroupCall({ kind, invite: users });
  };

  const closeGroup = () => {
    setGroupCall(null);
    loadCalls();
  };

  const startCall = (peer: User, kind: CallKind) => {
    if (call || groupCall) return;
    setCall({ peer, kind });
  };

  const closeCall = () => {
    setCall(null);
    loadCalls();
  };

  const missed =
    calls.filter((c) => c.direction === "missed").length + groupCalls.filter((c) => c.direction === "missed").length;

  return {
    deleteForMe,
    deleteForAll,
    sendGroup,
    sendPayload,
    uploading,
    setUploading,
    sendFile,
    groupCreate,
    setGroupCreate,
    createGroup,
    groupAction,
    send,
    activeMessages,
    openChatWith,
    addContact,
    look,
    setLook,
    wallpaper,
    setWallpaper,
    changeLook,
    saveAvatar,
    approveDevice,
    allFiles,
    backup,
    saveProfile,
    clearHistory,
    openGroupPicker,
    startGroup,
    closeGroup,
    startCall,
    closeCall,
    missed,
  };
}

export type MessengerActions = ReturnType<typeof useMessengerActions>;
