import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import {
  api,
  ApiError,
  TOKEN_KEY,
  type CallKind,
  type CallRecord,
  type ChatItem,
  type IncomingCall,
  type IncomingGroup,
  type GroupCallRecord,
  type InboxItem,
  type Message,
  type User,
} from "@/lib/messenger-data";
import { loadIdentity, Vault, vaultKind, wipeVault, type E2E } from "@/lib/e2e";
import AppHeader, { type Tab } from "./AppHeader";
import ChatList from "./ChatList";
import ActiveChat from "./ActiveChat";
import CallScreen, { type ActiveCall } from "./CallScreen";
import CallsView from "./CallsView";
import ContactsView from "./ContactsView";
import SettingsView from "./SettingsView";
import AuthScreen from "./AuthScreen";
import PinScreen from "./PinScreen";
import PushBanner from "./PushBanner";
import GroupCallScreen, { MAX_GROUP, type ActiveGroup } from "./GroupCallScreen";
import ContactPicker from "./ContactPicker";
import { matchContacts, type BookEntry, type PhoneContact } from "@/lib/phonebook";
import { pushState, registerSw, subscribePush, unsubscribePush, type PushState } from "@/lib/push";
import { cn } from "@/lib/utils";

type PollResult = {
  chats: ChatItem[];
  inbox: InboxItem[];
  incoming: IncomingCall | null;
  incomingGroup: IncomingGroup | null;
};

type History = Record<number, Message[]>;

const HISTORY_LIMIT = 3000;

function Loader() {
  return (
    <div className="grid h-[100dvh] place-items-center bg-background text-muted-foreground">
      <Icon name="Loader2" size={24} className="animate-spin" />
    </div>
  );
}

export default function Messenger() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [vaultMode, setVaultMode] = useState<"create" | "unlock" | null>(null);
  const [vaultError, setVaultError] = useState("");
  const [e2e, setE2e] = useState<E2E | null>(null);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      setReady(true);
      return;
    }
    api<{ user: User }>("me", {}, t)
      .then((r) => {
        setToken(t);
        setMe(r.user);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setReady(true));
  }, []);

  const [pending, setPendingE2e] = useState<E2E | null>(null);
  const unlockedKey = (id: number) => `rusapp_unlocked_${id}`;

  const publish = async (id: E2E, user: User, t: string) => {
    if (user.publicKey !== id.pub) {
      await api("set_key", { publicKey: id.pub }, t);
      setMe({ ...user, publicKey: id.pub });
    }
  };

  const openSession = (id: E2E, user: User) => {
    sessionStorage.setItem(unlockedKey(user.id), "1");
    setPendingE2e(null);
    setVaultMode(null);
    setE2e(id);
  };

  useEffect(() => {
    if (!me || !token || e2e) return;
    setVaultError("");
    vaultKind(me.id)
      .then(async (kind) => {
        if (kind === "pin") return setVaultMode("unlock");
        const id = await loadIdentity(await Vault.openDevice(me.id));
        await publish(id, me, token);
        const locked = await id.vault.hasLock();
        if (locked && sessionStorage.getItem(unlockedKey(me.id)) === "1") return openSession(id, me);
        setPendingE2e(id);
        setVaultMode(locked ? "unlock" : "create");
      })
      .catch(() => setVaultError("Не удалось подготовить защищённое хранилище на этом устройстве"));
  }, [me?.id, token, e2e]);

  const onAuth = (t: string, u: User) => {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setMe(u);
  };

  useEffect(() => {
    registerSw();
  }, []);

  const logout = useCallback(() => {
    if (token) {
      const t = token;
      unsubscribePush(t).finally(() => api("logout", {}, t).catch(() => null));
    }
    if (me) sessionStorage.removeItem(unlockedKey(me.id));
    localStorage.removeItem(TOKEN_KEY);
    setE2e((cur) => {
      cur?.vault.close();
      return null;
    });
    setPendingE2e(null);
    setVaultMode(null);
    setToken(null);
    setMe(null);
  }, [token, me]);

  const openVault = async (pin: string) => {
    if (!me || !token) return "Нет сессии";
    try {
      if (pending) {
        if (vaultMode === "create") await pending.vault.setLock(pin);
        else if (!(await pending.vault.checkLock(pin))) return "Неверный код доступа";
        openSession(pending, me);
        return null;
      }
      const pinVault = await Vault.unlock(me.id, pin);
      const vault = pinVault.pin ? await pinVault.toDevice(me.id) : pinVault;
      if (!(await vault.hasLock())) await vault.setLock(pin);
      const id = await loadIdentity(vault);
      await publish(id, me, token);
      openSession(id, me);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Не удалось открыть хранилище";
    }
  };

  const resetVault = async () => {
    if (!me) return;
    pending?.vault.close();
    setPendingE2e(null);
    await wipeVault(me.id);
    setVaultMode(null);
    setE2e(null);
    setMe({ ...me });
  };

  if (!ready) return <Loader />;
  if (!token || !me) return <AuthScreen onAuth={onAuth} />;
  if (!e2e) {
    if (vaultError)
      return (
        <div className="grid h-[100dvh] place-items-center bg-background p-6 text-center text-muted-foreground">
          <div>
            <p>{vaultError}</p>
            <button onClick={logout} className="mt-4 rounded-full bg-primary px-5 py-2 font-head font-semibold text-primary-foreground">
              Выйти
            </button>
          </div>
        </div>
      );
    if (!vaultMode) return <Loader />;
    return (
      <PinScreen
        key={vaultMode}
        mode={vaultMode}
        name={me.name}
        onSubmit={openVault}
        onReset={resetVault}
        onLogout={logout}
      />
    );
  }
  return (
    <MessengerApp
      token={token}
      me={me}
      e2e={e2e}
      setMe={setMe}
      onLogout={logout}
    />
  );
}

function mergeUsers(prev: User[], book: BookEntry[]) {
  const map = new Map(prev.map((u) => [u.id, u]));
  for (const b of book) if (b.user && !map.has(b.user.id)) map.set(b.user.id, b.user);
  return [...map.values()];
}

function MessengerApp({
  token,
  me,
  e2e,
  setMe,
  onLogout,
}: {
  token: string;
  me: User;
  e2e: E2E;
  setMe: (u: User) => void;
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
  const pendingChatRef = useRef<number | null>(null);
  const historyRef = useRef<History>({});
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  activeRef.current = activeId;
  callRef.current = call;

  useEffect(() => {
    e2e.vault
      .get<History>("history")
      .then((h) => {
        historyRef.current = h ?? {};
        setHistory(historyRef.current);
      })
      .catch(() => undefined)
      .finally(() => setHistoryLoaded(true));
    e2e.vault
      .get<Record<number, Message[]>>("outbox")
      .then((o) => {
        outboxRef.current = o ?? {};
        setOutbox(outboxRef.current);
      })
      .catch(() => undefined);
  }, [e2e]);

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
      return saveChain.current;
    },
    [e2e],
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

  const flushOutbox = useCallback(
    async (list: ChatItem[]) => {
      if (flushingRef.current) return;
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

  const poll = useCallback(async () => {
    if (pollingRef.current || !historyLoaded) return;
    pollingRef.current = true;
    const ack = ackRef.current;
    ackRef.current = [];
    const readChat = !document.hidden ? (activeRef.current ?? 0) : 0;
    try {
      const res = await api<PollResult>("poll", { ack, readChat }, token);
      setServerChats(res.chats);
      setChatsLoaded(true);
      flushOutbox(res.chats);
      const received: { chatId: number; msg: Message }[] = [];
      for (const item of res.inbox) {
        let text: string;
        try {
          text = await e2e.decrypt(item.senderKey, item.cipher, item.iv);
        } catch {
          text = "Не удалось расшифровать сообщение: собеседник сменил устройство или ключ";
        }
        received.push({ chatId: item.chatId, msg: { id: item.id, mine: false, text, at: item.at, read: true } });
      }
      if (received.length) {
        await appendMessages(received);
        ackRef.current.push(...received.map((r) => r.msg.id));
      }
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
  }, [token, e2e, historyLoaded, appendMessages, handleAuthError, flushOutbox]);

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
        const list = [...(history[c.id] ?? []), ...(outbox[c.id] ?? [])];
        const last = list[list.length - 1];
        return { ...c, lastText: last?.text ?? "", lastMine: last?.mine ?? false, lastAt: last?.at ?? c.lastAt };
      })
      .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
  }, [serverChats, history, outbox]);

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

  const active = chats.find((c) => c.id === activeId);

  const send = async (text: string) => {
    const chat = chats.find((c) => c.id === activeRef.current);
    if (!chat) return;
    const peerKey = chat.peer.publicKey;
    setSendError("");
    const chatId = chat.id;
    if (!peerKey) {
      const msg: Message = { id: -Date.now(), mine: true, text, at: new Date().toISOString(), read: false };
      saveOutbox({ ...outboxRef.current, [chatId]: [...(outboxRef.current[chatId] ?? []), msg] });
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

  return (
    <div className="app-text flex h-[100dvh] flex-col overflow-hidden bg-background">
      <AppHeader tab={tab} onTab={setTab} onNewCall={openGroupPicker} missed={missed} />
      {!pushHidden && <PushBanner state={push} onEnable={enablePush} onClose={hidePush} />}
      <main
        className={cn(
          "grid min-h-0 flex-1 gap-2.5 px-2.5 pb-4 pt-2.5 lg:grid-cols-[340px_1fr] lg:grid-rows-[minmax(0,1fr)] lg:px-10",
          tab === "chats" ? "grid-rows-[minmax(0,1fr)]" : "auto-rows-min overflow-y-auto lg:overflow-hidden",
        )}
      >
        {tab === "chats" && (
          <>
            <ChatList
              chats={chats}
              activeId={activeId}
              loaded={chatsLoaded}
              onSelect={openChat}
              onNew={() => setTab("contacts")}
              className={cn(mobileOpen && active && "hidden lg:flex")}
            />
            {active ? (
              <ActiveChat
                peer={active.peer}
                myKey={e2e.pub}
                messages={activeMessages}
                loading={!historyLoaded}
                error={sendError}
                onSend={send}
                onCall={(k) => startCall(active.peer, k)}
                onBack={() => setMobileOpen(false)}
                className={cn(!mobileOpen && "hidden lg:grid")}
              />
            ) : (
              <section className="hidden flex-col items-center justify-center gap-3 rounded-[14px] bg-card p-8 text-center lg:flex">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-tile-a to-tile-b">
                  <Icon name="ShieldCheck" size={28} />
                </span>
                <h1 className="hero-title">Здравствуйте, {me.name.split(" ")[0]}</h1>
                <p className="max-w-[440px] text-muted-foreground">
                  Переписка и звонки защищены сквозным шифрованием: прочитать их можете только вы и собеседник.
                </p>
                <button
                  onClick={() => setTab("contacts")}
                  className="mt-2 inline-flex h-[38px] items-center gap-2 rounded-full bg-primary px-[18px] font-head font-semibold text-primary-foreground"
                >
                  <Icon name="UserPlus" size={16} />
                  Добавить контакт
                </button>
              </section>
            )}
          </>
        )}
        {tab === "calls" && (
          <CallsView
            calls={calls}
            groupCalls={groupCalls}
            loaded={callsLoaded}
            onCall={startCall}
            onGroup={openGroupPicker}
          />
        )}
        {tab === "contacts" && (
          <ContactsView
            contacts={contacts}
            onCall={startCall}
            onMessage={openChatWith}
            onAdd={addContact}
            book={book}
            syncing={syncing}
            onSync={syncBook}
          />
        )}
        {tab === "settings" && (
          <SettingsView user={me} onSave={saveProfile} onLogout={onLogout} onClearHistory={clearHistory} />
        )}
      </main>
      {groupPicker && (
        <ContactPicker
          title="Групповой звонок"
          contacts={contacts}
          max={MAX_GROUP - 1}
          chooseKind
          onCancel={() => setGroupPicker(false)}
          onConfirm={startGroup}
        />
      )}
      {groupCall && (
        <GroupCallScreen
          key={groupCall.callId ?? "new"}
          group={groupCall}
          me={me}
          token={token}
          e2e={e2e}
          contacts={contacts}
          onClose={closeGroup}
        />
      )}
      {call && (
        <CallScreen
          key={call.incoming?.id ?? `out-${call.peer.id}`}
          call={call}
          token={token}
          e2e={e2e}
          onClose={closeCall}
        />
      )}
    </div>
  );
}
