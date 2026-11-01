import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import {
  api,
  ApiError,
  TOKEN_KEY,
  type CallKind,
  type CallRecord,
  type ChatItem,
  type IncomingCall,
  type Message,
  type User,
} from "@/lib/messenger-data";
import AppHeader, { type Tab } from "./AppHeader";
import ChatList from "./ChatList";
import ActiveChat from "./ActiveChat";
import CallScreen, { type ActiveCall } from "./CallScreen";
import CallsView from "./CallsView";
import ContactsView from "./ContactsView";
import SettingsView from "./SettingsView";
import AuthScreen from "./AuthScreen";
import { cn } from "@/lib/utils";

type PollResult = {
  chats: ChatItem[];
  incoming: IncomingCall | null;
  chatId?: number;
  messages?: Message[];
  readUpto?: number;
};

export default function Messenger() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<User | null>(null);

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

  const onAuth = (t: string, u: User) => {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setMe(u);
  };

  const logout = () => {
    if (token) api("logout", {}, token).catch(() => null);
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setMe(null);
  };

  if (!ready)
    return (
      <div className="grid h-[100dvh] place-items-center bg-background text-muted-foreground">
        <Icon name="Loader2" size={24} className="animate-spin" />
      </div>
    );
  if (!token || !me) return <AuthScreen onAuth={onAuth} />;
  return <MessengerApp token={token} me={me} setMe={setMe} onLogout={logout} />;
}

function MessengerApp({
  token,
  me,
  setMe,
  onLogout,
}: {
  token: string;
  me: User;
  setMe: (u: User) => void;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>("chats");
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [contacts, setContacts] = useState<User[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [callsLoaded, setCallsLoaded] = useState(false);
  const [call, setCall] = useState<ActiveCall | null>(null);

  const activeRef = useRef<number | null>(null);
  const lastIdRef = useRef(0);
  const callRef = useRef<ActiveCall | null>(null);
  const seenCalls = useRef<Set<number>>(new Set());
  const pollingRef = useRef(false);

  activeRef.current = activeId;
  callRef.current = call;

  const handleAuthError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) onLogout();
    },
    [onLogout],
  );

  const poll = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    const chatId = activeRef.current;
    try {
      const res = await api<PollResult>("poll", { chatId: chatId ?? 0, afterId: chatId ? lastIdRef.current : 0 }, token);
      setChats(res.chats);
      setChatsLoaded(true);
      if (chatId && res.chatId === chatId && activeRef.current === chatId) {
        const fresh = res.messages ?? [];
        const readUpto = res.readUpto ?? 0;
        if (fresh.length) lastIdRef.current = fresh[fresh.length - 1].id;
        setMessages((prev) => {
          const known = new Set(prev.map((m) => m.id));
          const merged = [...prev.filter((m) => m.id > 0), ...fresh.filter((m) => !known.has(m.id))];
          const pending = prev.filter((m) => m.id < 0 && !fresh.some((f) => f.mine && f.text === m.text));
          return [...merged, ...pending].map((m) => (m.mine && m.id > 0 && m.id <= readUpto ? { ...m, read: true } : m));
        });
        setMsgLoading(false);
      }
      const inc = res.incoming;
      if (inc && !callRef.current && !seenCalls.current.has(inc.id)) {
        seenCalls.current.add(inc.id);
        setCall({ peer: inc.peer, kind: inc.kind, incoming: { id: inc.id, offer: inc.offer } });
      }
    } catch (e) {
      handleAuthError(e);
    } finally {
      pollingRef.current = false;
    }
  }, [token, handleAuthError]);

  useEffect(() => {
    poll();
    let t: number;
    const loop = () => {
      const delay = document.hidden ? 10000 : 3000;
      t = window.setTimeout(async () => {
        await poll();
        loop();
      }, delay);
    };
    loop();
    return () => window.clearTimeout(t);
  }, [poll]);

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

  const openChat = (id: number) => {
    if (id !== activeRef.current) {
      activeRef.current = id;
      lastIdRef.current = 0;
      setMessages([]);
      setMsgLoading(true);
      setActiveId(id);
      setChats((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
      poll();
    }
    setMobileOpen(true);
    setTab("chats");
  };

  const send = async (text: string) => {
    const chatId = activeRef.current;
    if (!chatId) return;
    const tempId = -Date.now();
    const at = new Date().toISOString();
    setMessages((prev) => [...prev, { id: tempId, mine: true, text, at, read: false }]);
    setChats((prev) => {
      const target = prev.find((c) => c.id === chatId);
      if (!target) return prev;
      return [{ ...target, lastText: text, lastAt: at, lastMine: true }, ...prev.filter((c) => c.id !== chatId)];
    });
    try {
      const r = await api<{ message: Message }>("send", { chatId, text }, token);
      setMessages((prev) => {
        if (prev.some((m) => m.id === r.message.id)) return prev.filter((m) => m.id !== tempId);
        return prev.map((m) => (m.id === tempId ? r.message : m));
      });
    } catch (e) {
      handleAuthError(e);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  const openChatWith = async (user: User) => {
    const existing = chats.find((c) => c.peer.id === user.id);
    if (existing) return openChat(existing.id);
    try {
      const r = await api<{ chatId: number }>("open_chat", { userId: user.id }, token);
      setChats((prev) => [{ id: r.chatId, peer: user, lastText: "", lastAt: null, lastMine: false, unread: 0 }, ...prev]);
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

  const startCall = (peer: User, kind: CallKind) => {
    if (call) return;
    setCall({ peer, kind });
  };

  const closeCall = () => {
    setCall(null);
    loadCalls();
  };

  const active = chats.find((c) => c.id === activeId);
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
                messages={messages}
                loading={msgLoading}
                onSend={send}
                onCall={(k) => startCall(active.peer, k)}
                onBack={() => setMobileOpen(false)}
                className={cn(!mobileOpen && "hidden lg:grid")}
              />
            ) : (
              <section className="hidden flex-col items-center justify-center gap-3 rounded-[14px] bg-card p-8 text-center lg:flex">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-tile-a to-tile-b">
                  <Icon name="MessageCircle" size={28} />
                </span>
                <h1 className="hero-title">Здравствуйте, {me.name.split(" ")[0]}</h1>
                <p className="max-w-[420px] text-muted-foreground">
                  Выберите чат слева или добавьте человека по номеру телефона, чтобы написать или позвонить.
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
        {tab === "settings" && <SettingsView user={me} onSave={saveProfile} onLogout={onLogout} />}
      </main>
      {call && <CallScreen key={call.incoming?.id ?? `out-${call.peer.id}`} call={call} token={token} onClose={closeCall} />}
    </div>
  );
}
