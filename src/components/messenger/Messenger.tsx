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
  type InboxItem,
  type Message,
  type User,
} from "@/lib/messenger-data";
import { loadIdentity, Vault, vaultExists, wipeVault, type E2E } from "@/lib/e2e";
import AppHeader, { type Tab } from "./AppHeader";
import ChatList from "./ChatList";
import ActiveChat from "./ActiveChat";
import CallScreen, { type ActiveCall } from "./CallScreen";
import CallsView from "./CallsView";
import ContactsView from "./ContactsView";
import SettingsView from "./SettingsView";
import AuthScreen from "./AuthScreen";
import PinScreen from "./PinScreen";
import { cn } from "@/lib/utils";

type PollResult = {
  chats: ChatItem[];
  inbox: InboxItem[];
  incoming: IncomingCall | null;
};

type History = Record<number, Message[]>;

const HISTORY_LIMIT = 3000;
const AUTO_LOCK_MS = 10 * 60 * 1000;

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

  useEffect(() => {
    if (!me || e2e) return;
    vaultExists(me.id)
      .then((exists) => setVaultMode(exists ? "unlock" : "create"))
      .catch(() => setVaultMode("create"));
  }, [me?.id, e2e]);

  const onAuth = (t: string, u: User) => {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setMe(u);
  };

  const lock = useCallback(() => {
    setE2e((cur) => {
      cur?.vault.close();
      return null;
    });
    setVaultMode(null);
  }, []);

  const logout = useCallback(() => {
    if (token) api("logout", {}, token).catch(() => null);
    localStorage.removeItem(TOKEN_KEY);
    lock();
    setToken(null);
    setMe(null);
  }, [token, lock]);

  const openVault = async (pin: string) => {
    if (!me || !token) return "Нет сессии";
    try {
      const vault = vaultMode === "create" ? await Vault.create(me.id, pin) : await Vault.unlock(me.id, pin);
      const id = await loadIdentity(vault);
      if (me.publicKey !== id.pub) {
        await api("set_key", { publicKey: id.pub }, token);
        setMe({ ...me, publicKey: id.pub });
      }
      setE2e(id);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Не удалось открыть хранилище";
    }
  };

  const resetVault = async () => {
    if (!me) return;
    await wipeVault(me.id);
    setVaultMode("create");
  };

  if (!ready) return <Loader />;
  if (!token || !me) return <AuthScreen onAuth={onAuth} />;
  if (!e2e) {
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
  return <MessengerApp token={token} me={me} e2e={e2e} setMe={setMe} onLogout={logout} onLock={lock} />;
}

function MessengerApp({
  token,
  me,
  e2e,
  setMe,
  onLogout,
  onLock,
}: {
  token: string;
  me: User;
  e2e: E2E;
  setMe: (u: User) => void;
  onLogout: () => void;
  onLock: () => void;
}) {
  const [tab, setTab] = useState<Tab>("chats");
  const [serverChats, setServerChats] = useState<ChatItem[]>([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [history, setHistory] = useState<History>({});
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [pending, setPending] = useState<Record<number, Message[]>>({});
  const [activeId, setActiveId] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [contacts, setContacts] = useState<User[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [callsLoaded, setCallsLoaded] = useState(false);
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [sendError, setSendError] = useState("");

  const activeRef = useRef<number | null>(null);
  const callRef = useRef<ActiveCall | null>(null);
  const seenCalls = useRef<Set<number>>(new Set());
  const pollingRef = useRef(false);
  const ackRef = useRef<number[]>([]);
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
  }, [e2e]);

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
      if (inc && inc.offer && !callRef.current && !seenCalls.current.has(inc.id)) {
        seenCalls.current.add(inc.id);
        setCall({ peer: inc.peer, kind: inc.kind, incoming: { id: inc.id, offer: inc.offer } });
      }
    } catch (e) {
      ackRef.current.unshift(...ack);
      handleAuthError(e);
    } finally {
      pollingRef.current = false;
    }
  }, [token, e2e, historyLoaded, appendMessages, handleAuthError]);

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
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS && !callRef.current) onLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [onLock]);

  const chats = useMemo<ChatItem[]>(() => {
    return serverChats
      .map((c) => {
        const list = history[c.id] ?? [];
        const last = list[list.length - 1];
        return { ...c, lastText: last?.text ?? "", lastMine: last?.mine ?? false, lastAt: last?.at ?? c.lastAt };
      })
      .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
  }, [serverChats, history]);

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
    if (chatsLoaded && activeId === null && chats.length > 0 && window.innerWidth >= 1024) openChat(chats[0].id);
  }, [chatsLoaded]);

  const loadContacts = useCallback(() => {
    api<{ contacts: User[] }>("contacts", {}, token)
      .then((r) => setContacts(r.contacts))
      .catch(handleAuthError);
  }, [token, handleAuthError]);

  const loadCalls = useCallback(() => {
    api<{ calls: CallRecord[] }>("calls", {}, token)
      .then((r) => {
        setCalls(r.calls);
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
    if (!peerKey) {
      setSendError(`${chat.peer.name} ещё не открывал(а) RusAPP с шифрованием — отправить сообщение пока нельзя`);
      return;
    }
    setSendError("");
    const chatId = chat.id;
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
    return [...list, ...(pending[active.id] ?? [])];
  }, [active, history, pending]);

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

  const startCall = (peer: User, kind: CallKind) => {
    if (call) return;
    setCall({ peer, kind });
  };

  const closeCall = () => {
    setCall(null);
    loadCalls();
  };

  const missed = calls.filter((c) => c.direction === "missed").length;

  return (
    <div className="app-text flex h-[100dvh] flex-col overflow-hidden bg-background">
      <AppHeader tab={tab} onTab={setTab} onNewCall={() => setTab("contacts")} missed={missed} />
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
        {tab === "calls" && <CallsView calls={calls} loaded={callsLoaded} onCall={startCall} />}
        {tab === "contacts" && (
          <ContactsView contacts={contacts} onCall={startCall} onMessage={openChatWith} onAdd={addContact} />
        )}
        {tab === "settings" && (
          <SettingsView user={me} onSave={saveProfile} onLogout={onLogout} onLock={onLock} onClearHistory={clearHistory} />
        )}
      </main>
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
