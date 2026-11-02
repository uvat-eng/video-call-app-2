import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type CallKind, type CallRecord, type ChatItem, type IncomingCall, type IncomingGroup, type GroupCallRecord, type InboxItem, type GroupInfo, type Message, type User, groupPeer } from "@/lib/messenger-data";
import { deletedIds, isSilentText, previewText } from "@/lib/payload";
import { setMediaVault } from "@/lib/files";
import { groupDecrypt, type E2E } from "@/lib/e2e";
import { downloadHistory, uploadHistory } from "@/lib/history-sync";
import { type Tab } from "../AppHeader";
import { type ActiveCall } from "../CallScreen";
import { type ActiveGroup } from "../GroupCallScreen";
import { matchContacts, type BookEntry, type PhoneContact } from "@/lib/phonebook";
import { pushState, subscribePush, type PushState } from "@/lib/push";
import { biometricAvailable, biometricEnabled, disableBiometric, enableBiometric } from "@/lib/biometric";
import { unlockCallAudio } from "@/lib/callTones";

type PollResult = {
  cursor: number;
  chats: ChatItem[];
  groups: ChatItem[];
  inbox: InboxItem[];
  incoming: IncomingCall | null;
  incomingGroup: IncomingGroup | null;
};

export type History = Record<number, Message[]>;

export const HISTORY_LIMIT = 3000;

function mergeUsers(prev: User[], book: BookEntry[]) {
  const map = new Map(prev.map((u) => [u.id, u]));
  for (const b of book) if (b.user && !map.has(b.user.id)) map.set(b.user.id, b.user);
  return [...map.values()];
}

export function useMessengerCore({
  token,
  me,
  e2e,
  onLogout,
}: {
  token: string;
  me: User;
  e2e: E2E;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>("chats");
  const [serverChats, setServerChats] = useState<ChatItem[]>([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [history, setHistory] = useState<History>({});
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [pending, setPending] = useState<Record<number, Message[]>>({});
  const [outbox, setOutbox] = useState<Record<number, Message[]>>({});
  const outboxRef = useRef<Record<number, Message[]>>({});
  const flushingRef = useRef(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [contacts, setContacts] = useState<User[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [callsLoaded, setCallsLoaded] = useState(false);
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [groupCall, setGroupCall] = useState<ActiveGroup | null>(null);
  const [groupCalls, setGroupCalls] = useState<GroupCallRecord[]>([]);
  const [groupPicker, setGroupPicker] = useState(false);
  const seenGroups = useRef<Set<number>>(new Set());
  const groupRef = useRef<ActiveGroup | null>(null);
  groupRef.current = groupCall;
  const [sendError, setSendError] = useState("");
  const [book, setBook] = useState<BookEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [push, setPush] = useState<PushState>("unsupported");
  const [pushHidden, setPushHidden] = useState(false);

  const activeRef = useRef<number | null>(null);
  const callRef = useRef<ActiveCall | null>(null);
  const seenCalls = useRef<Set<number>>(new Set());
  const pollingRef = useRef(false);
  const ackRef = useRef<number[]>([]);
  const cursorRef = useRef(0);
  const groupKeys = useRef<Map<number, string>>(new Map());
  const syncingGroups = useRef<Set<number>>(new Set());
  const sharing = useRef<Set<string>>(new Set());
  const pendingChatRef = useRef<number | null>(null);
  const [linkCode, setLinkCode] = useState("");
  const historyRef = useRef<History>({});
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  activeRef.current = activeId;
  callRef.current = call;

  const reloadVault = useCallback(async () => {
    await saveChain.current;
    const [h, o] = await Promise.all([
      e2e.vault.get<History>("history").catch(() => null),
      e2e.vault.get<Record<number, Message[]>>("outbox").catch(() => null),
    ]);
    historyRef.current = h ?? {};
    setHistory(historyRef.current);
    outboxRef.current = o ?? {};
    setOutbox(outboxRef.current);
    return outboxRef.current;
  }, [e2e]);

  useEffect(() => {
    unlockCallAudio();
  }, []);

  useEffect(() => {
    setMediaVault(e2e.vault);
    e2e.vault
      .get<Record<number, string>>("groupKeys")
      .then((saved) => {
        for (const [k, v] of Object.entries(saved ?? {})) if (!groupKeys.current.has(Number(k))) groupKeys.current.set(Number(k), v);
      })
      .catch(() => undefined);
    return () => setMediaVault(null);
  }, [e2e]);

  const saveGroupKeys = useCallback(() => {
    const obj = Object.fromEntries(groupKeys.current);
    saveChain.current = saveChain.current.then(() => e2e.vault.set("groupKeys", obj)).catch(() => undefined);
  }, [e2e]);

  const historyDirty = useRef(false);
  const uploadTimer = useRef<number | null>(null);
  const uploadingHistory = useRef(false);

  const flushHistory = useCallback(async () => {
    if (!historyDirty.current || uploadingHistory.current) return;
    uploadingHistory.current = true;
    historyDirty.current = false;
    try {
      await saveChain.current;
      await uploadHistory(e2e.vault, token);
    } catch {
      historyDirty.current = true;
    } finally {
      uploadingHistory.current = false;
    }
  }, [e2e, token]);

  const markHistoryDirty = useCallback(() => {
    historyDirty.current = true;
    if (uploadTimer.current) return;
    uploadTimer.current = window.setTimeout(() => {
      uploadTimer.current = null;
      flushHistory();
    }, 3 * 60 * 1000);
  }, [flushHistory]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushHistory();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (uploadTimer.current) window.clearTimeout(uploadTimer.current);
      uploadTimer.current = null;
    };
  }, [flushHistory]);

  useEffect(() => {
    const restore = async () => {
      const local = await e2e.vault.get<History>("history").catch(() => null);
      const snap = await downloadHistory(e2e.vault, token).catch(() => null);
      if (!snap) {
        if (local && Object.keys(local).length) markHistoryDirty();
        return;
      }
      const remote = (snap.history ?? {}) as History;
      const merged: History = { ...(local ?? {}) };
      let changed = false;
      for (const [cid, list] of Object.entries(remote)) {
        const id = Number(cid);
        const cur = merged[id] ? [...merged[id]] : [];
        const seen = new Set(cur.map((m) => m.id));
        for (const m of list) {
          if (!seen.has(m.id)) {
            cur.push(m);
            changed = true;
          }
        }
        cur.sort((a, b) => a.id - b.id);
        merged[id] = cur.slice(-HISTORY_LIMIT);
      }
      if (changed) await e2e.vault.set("history", merged);
      const gk = (snap.groupKeys ?? {}) as Record<number, string>;
      const localGk = (await e2e.vault.get<Record<number, string>>("groupKeys").catch(() => null)) ?? {};
      const gkMerged = { ...gk, ...localGk };
      if (Object.keys(gkMerged).length !== Object.keys(localGk).length) {
        await e2e.vault.set("groupKeys", gkMerged);
        for (const [k, v] of Object.entries(gkMerged)) if (!groupKeys.current.has(Number(k))) groupKeys.current.set(Number(k), v);
      }
      const remoteIds = new Set(Object.values(remote).flatMap((l) => l.map((m) => `${m.id}`)));
      if (Object.values(local ?? {}).some((l) => l.some((m) => !remoteIds.has(`${m.id}`)))) historyDirty.current = true;
      if (historyDirty.current) markHistoryDirty();
    };
    restore()
      .catch(() => undefined)
      .then(() => reloadVault())
      .then((o) => {
        for (const id of Object.keys(o)) api("wait_key", { chatId: Number(id) }, token).catch(() => null);
      })
      .finally(() => setHistoryLoaded(true));
  }, [reloadVault, token, e2e]);

  const saveOutbox = useCallback(
    (next: Record<number, Message[]>) => {
      outboxRef.current = next;
      setOutbox(next);
      saveChain.current = saveChain.current.then(() => e2e.vault.set("outbox", next)).catch(() => undefined);
    },
    [e2e],
  );


  useEffect(() => {
    e2e.vault
      .get<PhoneContact[]>("phonebook")
      .then(async (saved) => {
        if (!saved?.length) return;
        const matched = await matchContacts(token, saved);
        setBook(matched);
        setContacts((prev) => mergeUsers(prev, matched));
      })
      .catch(() => undefined);
  }, [e2e, token]);

  const syncBook = async (list: PhoneContact[]) => {
    setSyncing(true);
    try {
      const prev = (await e2e.vault.get<PhoneContact[]>("phonebook")) ?? [];
      const merged = [...prev];
      for (const c of list) {
        const ex = merged.find((m) => m.name === c.name);
        if (ex) ex.phones = [...new Set([...ex.phones, ...c.phones])];
        else merged.push(c);
      }
      await e2e.vault.set("phonebook", merged);
      const matched = await matchContacts(token, merged);
      setBook(matched);
      setContacts((p) => mergeUsers(p, matched));
      return null;
    } catch (e) {
      handleAuthError(e);
      return e instanceof Error ? e.message : "Не удалось проверить контакты";
    } finally {
      setSyncing(false);
    }
  };

  const persist = useCallback(
    (next: History) => {
      historyRef.current = next;
      setHistory(next);
      saveChain.current = saveChain.current.then(() => e2e.vault.set("history", next)).catch(() => undefined);
      markHistoryDirty();
      return saveChain.current;
    },
    [e2e, markHistoryDirty],
  );

  const appendMessages = useCallback(
    (items: { chatId: number; msg: Message }[]) => {
      if (!items.length) return saveChain.current;
      const next: History = { ...historyRef.current };
      for (const { chatId, msg } of items) {
        const list = next[chatId] ? [...next[chatId]] : [];
        if (!list.some((m) => m.id === msg.id)) list.push(msg);
        list.sort((a, b) => a.id - b.id);
        next[chatId] = list.slice(-HISTORY_LIMIT);
      }
      return persist(next);
    },
    [persist],
  );

  const removeMessages = useCallback(
    (chatId: number, ids: number[]) => {
      const next: History = { ...historyRef.current };
      next[chatId] = (next[chatId] ?? []).filter((m) => !ids.includes(m.id));
      return persist(next);
    },
    [persist],
  );

  const flushOutbox = useCallback(
    async (list: ChatItem[]) => {
      if (flushingRef.current || document.hidden) return;
      const ready = list.filter((c) => c.peer.publicKey && outboxRef.current[c.id]?.length);
      if (!ready.length) return;
      flushingRef.current = true;
      try {
        for (const chat of ready) {
          for (const msg of [...(outboxRef.current[chat.id] ?? [])]) {
            const sealed = await e2e.encrypt(chat.peer.publicKey!, msg.text);
            const r = await api<{ id: number; at: string }>("send", { chatId: chat.id, ...sealed }, token);
            await appendMessages([{ chatId: chat.id, msg: { id: r.id, mine: true, text: msg.text, at: r.at, read: false } }]);
            const rest = (outboxRef.current[chat.id] ?? []).filter((m) => m.id !== msg.id);
            const next = { ...outboxRef.current };
            if (rest.length) next[chat.id] = rest;
            else delete next[chat.id];
            saveOutbox(next);
          }
        }
      } catch {
        return;
      } finally {
        flushingRef.current = false;
      }
    },
    [e2e, token, saveOutbox, appendMessages],
  );

  const handleAuthError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) onLogout();
    },
    [onLogout],
  );

  const groupKeyOf = useCallback(
    async (g: GroupInfo) => {
      const cached = groupKeys.current.get(g.id);
      if (cached) return cached;
      if (!g.key) return null;
      try {
        const raw = await e2e.decrypt(g.key.senderKey, g.key.cipher, g.key.iv);
        groupKeys.current.set(g.id, raw);
        saveGroupKeys();
        return raw;
      } catch {
        return null;
      }
    },
    [e2e, saveGroupKeys],
  );

  const syncGroups = useCallback(
    async (groups: GroupInfo[]) => {
      for (const g of groups) {
        const raw = await groupKeyOf(g);
        if (!raw) continue;
        const need = g.needKey.filter((id) => !sharing.current.has(`${g.id}:${id}`));
        if (need.length) {
          const items = [];
          for (const id of need) {
            const pk = g.members.find((m) => m.id === id)?.publicKey;
            if (!pk) continue;
            sharing.current.add(`${g.id}:${id}`);
            const sealed = await e2e.encrypt(pk, raw);
            items.push({ userId: id, cipher: sealed.cipher, iv: sealed.iv });
          }
          if (items.length)
            api("gchat_share_key", { gchatId: g.id, senderKey: e2e.pub, items }, token).catch(() =>
              need.forEach((id) => sharing.current.delete(`${g.id}:${id}`)),
            );
        }
        const chatId = -g.id;
        const have = (historyRef.current[chatId] ?? []).reduce((mx, m) => (m.id > mx ? m.id : mx), 0);
        if (g.lastId <= have || syncingGroups.current.has(g.id)) continue;
        syncingGroups.current.add(g.id);
        try {
          let after = have;
          for (;;) {
            const r = await api<{
              messages: { id: number; from: number; cipher: string; iv: string; at: string }[];
              more: boolean;
            }>("gchat_history", { gchatId: g.id, after }, token);
            const items: { chatId: number; msg: Message }[] = [];
            for (const x of r.messages) {
              let text: string;
              try {
                text = await groupDecrypt(raw, x.cipher, x.iv);
              } catch {
                text = "Не удалось расшифровать сообщение";
              }
              items.push({
                chatId,
                msg: { id: x.id, mine: x.from === me.id, text, at: x.at, read: true, from: x.from },
              });
              after = x.id;
            }
            if (items.length) await appendMessages(items);
            if (!r.more) break;
          }
        } catch {
          continue;
        } finally {
          syncingGroups.current.delete(g.id);
        }
      }
    },
    [groupKeyOf, e2e, token, appendMessages, me.id],
  );

  const poll = useCallback(async () => {
    if (pollingRef.current || !historyLoaded) return;
    pollingRef.current = true;
    const ack = ackRef.current;
    ackRef.current = [];

    const readChat = !document.hidden ? (activeRef.current ?? 0) : 0;
    try {
      const res = await api<PollResult>("poll", { ack, readChat, cursor: cursorRef.current }, token);
      if (res.cursor > cursorRef.current) cursorRef.current = res.cursor;
      const groups = (res.groups ?? []).map((g) => ({ ...g, peer: groupPeer(g.group!) }));
      setServerChats([...res.chats, ...groups]);
      setChatsLoaded(true);
      flushOutbox(res.chats);
      syncGroups((res.groups ?? []).map((g) => g.group!));
      const received: { chatId: number; msg: Message }[] = [];
      let maxId = cursorRef.current;
      for (const item of res.inbox) {
        maxId = Math.max(maxId, item.id);
        let text: string;
        try {
          const peerKey = item.mine ? res.chats.find((c) => c.id === item.chatId)?.peer.publicKey : item.senderKey;
          if (!peerKey) throw new Error();
          text = await e2e.decrypt(peerKey, item.cipher, item.iv);
        } catch {
          text = "Не удалось расшифровать сообщение: собеседник сменил устройство или ключ";
        }
        if (item.mine) {
          received.push({ chatId: item.chatId, msg: { id: item.id, mine: true, text, at: item.at, read: false } });
          continue;
        }
        received.push({ chatId: item.chatId, msg: { id: item.id, mine: false, text, at: item.at, read: true } });
      }
      if (received.length) {
        await appendMessages(received);
        ackRef.current.push(...received.filter((r) => !r.msg.mine).map((r) => r.msg.id));
      }
      cursorRef.current = maxId;
      const inc = res.incoming;
      const ig = res.incomingGroup;
      if (ig && !callRef.current && !groupRef.current && !seenGroups.current.has(ig.id)) {
        seenGroups.current.add(ig.id);
        setGroupCall({ kind: ig.kind, callId: ig.id, incoming: { host: ig.host, total: ig.total } });
      }
      if (inc && inc.offer && !callRef.current && !groupRef.current && !seenCalls.current.has(inc.id)) {
        seenCalls.current.add(inc.id);
        setCall({ peer: inc.peer, kind: inc.kind, incoming: { id: inc.id, offer: inc.offer } });
      }
    } catch (e) {
      ackRef.current.unshift(...ack);
      handleAuthError(e);
    } finally {
      pollingRef.current = false;
    }
  }, [token, e2e, historyLoaded, appendMessages, handleAuthError, flushOutbox, syncGroups]);

  useEffect(() => {
    if (!historyLoaded) return;
    poll();
    let t: number;
    const loop = () => {
      const delay = document.hidden ? 10000 : ackRef.current.length ? 600 : 3000;
      t = window.setTimeout(async () => {
        await poll();
        loop();
      }, delay);
    };
    loop();
    return () => window.clearTimeout(t);
  }, [poll, historyLoaded]);

  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) reloadVault().then(() => poll());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reloadVault, poll]);

  useEffect(() => {
    const key = `rusapp_unlocked_${me.id}`;
    const touch = () => localStorage.setItem(key, String(Date.now()));
    touch();
    const t = window.setInterval(() => {
      if (!document.hidden) touch();
    }, 20000);
    const onHide = () => touch();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [me.id]);

  useEffect(() => {
    setPush(pushState());
    setPushHidden(sessionStorage.getItem("rusapp_push_hidden") === "1");
    subscribePush(token, false)
      .then(setPush)
      .catch(() => null);
  }, [token]);

  const enablePush = async () => {
    try {
      setPush(await subscribePush(token, true));
    } catch {
      setPush(pushState());
    }
  };

  const [bioSupported, setBioSupported] = useState(false);
  const [bioOn, setBioOn] = useState(false);

  useEffect(() => {
    biometricAvailable().then(async (ok) => {
      setBioSupported(ok);
      if (ok) setBioOn(await biometricEnabled(e2e.vault));
    });
  }, [e2e]);

  const toggleBio = async () => {
    try {
      if (bioOn) {
        await disableBiometric(e2e.vault);
        setBioOn(false);
        return "Выключено — при запуске будет спрашиваться код.";
      }
      await enableBiometric(e2e.vault, me);
      setBioOn(true);
      return "Готово — теперь RuChat открывается без кода.";
    } catch {
      return "Не удалось включить. Проверьте, что на телефоне настроен отпечаток или Face ID.";
    }
  };

  const testPush = async () => {
    try {
      const state = await subscribePush(token, true);
      setPush(state);
      if (state === "denied") return "Уведомления запрещены в настройках телефона для этого сайта — разрешите их.";
      if (state === "ios-install") return "На iPhone сначала добавьте RuChat на экран «Домой» и откройте с иконки.";
      if (state !== "granted") return "Этот браузер не поддерживает уведомления.";
      const r = await api<{ sent: number; devices: number }>("push_test", {}, token);
      return r.sent > 0
        ? "Тестовое уведомление отправлено — оно должно появиться через пару секунд."
        : "Не удалось доставить уведомление на это устройство. Нажмите ещё раз.";
    } catch {
      return "Не удалось проверить уведомления";
    }
  };

  const hidePush = () => {
    sessionStorage.setItem("rusapp_push_hidden", "1");
    setPushHidden(true);
  };

  const openCallById = useCallback(
    async (callId: number, decline: boolean) => {
      if (callRef.current || seenCalls.current.has(callId)) return;
      try {
        if (decline) {
          seenCalls.current.add(callId);
          await api("call_end", { callId }, token);
          return;
        }
        const res = await api<{ status: string; offer: string | null; kind: CallKind }>("call_get", { callId }, token);
        if (res.status !== "ringing" || !res.offer) return;
        await poll();
      } catch (e) {
        handleAuthError(e);
      }
    },
    [token, poll, handleAuthError],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const link = (params.get("link") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (link.length === 8) {
      window.history.replaceState(null, "", "/");
      setLinkCode(link);
      setTab("settings");
    }
    const callId = Number(params.get("call") || 0);
    const chatId = Number(params.get("chat") || 0);
    if (callId || chatId) window.history.replaceState(null, "", "/");
    const gid = Number(params.get("group") || 0);
    if (gid) window.history.replaceState(null, "", "/");
    if (gid && params.get("decline") === "1") {
      seenGroups.current.add(gid);
      api("group_decline", { callId: gid }, token).catch(() => null);
    }
    if (callId) openCallById(callId, params.get("decline") === "1");
    if (chatId) pendingChatRef.current = chatId;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; action?: string; data?: { type?: string; callId?: number; chatId?: number } };
      if (d?.type === "vault-changed") {
        reloadVault();
        return;
      }
      if (d?.type === "key-ready") {
        poll();
        return;
      }
      if (d?.type !== "notification-click" || !d.data) return;
      if (d.data.type === "group_call" && d.data.callId && d.action === "decline") {
        seenGroups.current.add(d.data.callId);
        api("group_decline", { callId: d.data.callId }, token).catch(() => null);
      } else if (d.data.type === "call" && d.data.callId) openCallById(d.data.callId, d.action === "decline");
      else if (d.data.chatId) pendingChatRef.current = d.data.chatId;
      poll();
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, []);


  const chats = useMemo<ChatItem[]>(() => {
    return serverChats
      .map((c) => {
        const all = [...(history[c.id] ?? []), ...(outbox[c.id] ?? [])];
        const gone = deletedIds(all, me.id, c.peer.id);
        const list = all.filter((m) => !isSilentText(m.text));
        const last = list[list.length - 1];
        const author =
          c.group && last && !last.mine ? c.group.members.find((m) => m.id === last.from)?.name.split(" ")[0] : "";
        const text = last ? (gone.has(last.id) ? "Сообщение удалено" : previewText(last.text)) : "";
        return {
          ...c,
          lastText: author ? `${author}: ${text}` : text,
          lastMine: last?.mine ?? false,
          lastAt: last?.at ?? c.lastAt,
        };
      })
      .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
  }, [serverChats, history, outbox, me.id]);

  const openChat = (id: number) => {
    if (id !== activeRef.current) {
      activeRef.current = id;
      setActiveId(id);
      setSendError("");
      setServerChats((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
      poll();
    }
    setMobileOpen(true);
    setTab("chats");
  };

  useEffect(() => {
    if (!chatsLoaded) return;
    const want = pendingChatRef.current;
    if (want && chats.some((c) => c.id === want)) {
      pendingChatRef.current = null;
      openChat(want);
      return;
    }
    if (activeId === null && chats.length > 0 && window.innerWidth >= 1024) openChat(chats[0].id);
  }, [chatsLoaded, chats.length]);

  const loadContacts = useCallback(() => {
    api<{ contacts: User[] }>("contacts", {}, token)
      .then((r) => setContacts(r.contacts))
      .catch(handleAuthError);
  }, [token, handleAuthError]);

  const loadCalls = useCallback(() => {
    api<{ calls: CallRecord[]; groupCalls: GroupCallRecord[] }>("calls", {}, token)
      .then((r) => {
        setCalls(r.calls);
        setGroupCalls(r.groupCalls ?? []);
        setCallsLoaded(true);
      })
      .catch(handleAuthError);
  }, [token, handleAuthError]);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  useEffect(() => {
    if (tab === "contacts") loadContacts();
    if (tab === "calls") loadCalls();
  }, [tab, loadContacts, loadCalls]);

  const totalUnread = chats.reduce((n, c) => n + (c.unread || 0), 0);

  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (totalUnread > 0) nav.setAppBadge?.(totalUnread).catch(() => undefined);
    else nav.clearAppBadge?.().catch(() => undefined);
  }, [totalUnread]);

  const active = chats.find((c) => c.id === activeId);

  return {
    tab,
    setTab,
    serverChats,
    setServerChats,
    chatsLoaded,
    setChatsLoaded,
    history,
    setHistory,
    historyLoaded,
    setHistoryLoaded,
    pending,
    setPending,
    outbox,
    setOutbox,
    outboxRef,
    flushingRef,
    activeId,
    setActiveId,
    mobileOpen,
    setMobileOpen,
    contacts,
    setContacts,
    calls,
    setCalls,
    callsLoaded,
    setCallsLoaded,
    call,
    setCall,
    groupCall,
    setGroupCall,
    groupCalls,
    setGroupCalls,
    groupPicker,
    setGroupPicker,
    seenGroups,
    groupRef,
    sendError,
    setSendError,
    book,
    setBook,
    syncing,
    setSyncing,
    push,
    setPush,
    pushHidden,
    setPushHidden,
    activeRef,
    callRef,
    seenCalls,
    pollingRef,
    ackRef,
    cursorRef,
    groupKeys,
    syncingGroups,
    sharing,
    pendingChatRef,
    linkCode,
    setLinkCode,
    historyRef,
    saveChain,
    reloadVault,
    saveGroupKeys,
    saveOutbox,
    syncBook,
    persist,
    appendMessages,
    removeMessages,
    flushOutbox,
    handleAuthError,
    groupKeyOf,
    syncGroups,
    poll,
    enablePush,
    bioSupported,
    setBioSupported,
    bioOn,
    setBioOn,
    toggleBio,
    testPush,
    hidePush,
    openCallById,
    chats,
    openChat,
    loadContacts,
    loadCalls,
    totalUnread,
    active,
  };
}

export type MessengerCore = ReturnType<typeof useMessengerCore>;
