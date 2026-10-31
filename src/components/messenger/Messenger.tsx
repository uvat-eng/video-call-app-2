import { useEffect, useMemo, useRef, useState } from "react";
import {
  AUTO_REPLIES,
  CONTACTS,
  INITIAL_CALLS,
  INITIAL_CHATS,
  type CallKind,
  type CallRecord,
  type Chat,
  type Contact,
} from "@/lib/messenger-data";
import AppHeader, { type Tab } from "./AppHeader";
import ChatList from "./ChatList";
import ActiveChat from "./ActiveChat";
import CallScreen, { type ActiveCall } from "./CallScreen";
import CallsView from "./CallsView";
import ContactsView from "./ContactsView";
import SettingsView from "./SettingsView";
import { cn } from "@/lib/utils";

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Messenger() {
  const [tab, setTab] = useState<Tab>("chats");
  const [chats, setChats] = useState<Chat[]>(INITIAL_CHATS);
  const [calls, setCalls] = useState<CallRecord[]>(INITIAL_CALLS);
  const [activeId, setActiveId] = useState(INITIAL_CHATS[0].id);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [typingId, setTypingId] = useState<string | null>(null);
  const [call, setCall] = useState<ActiveCall | null>(null);
  const timers = useRef<number[]>([]);

  const contacts = useMemo(() => {
    const map: Record<string, Contact> = {};
    CONTACTS.forEach((c) => (map[c.id] = c));
    return map;
  }, []);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const active = chats.find((c) => c.id === activeId) ?? chats[0];
  const activeContact = contacts[active.contactId];
  const missed = calls.filter((c) => c.direction === "missed").length;

  const selectChat = (id: string) => {
    setActiveId(id);
    setMobileOpen(true);
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  };

  const send = (text: string) => {
    const chatId = active.id;
    const time = nowTime();
    const msgId = `me-${chatId}-${active.messages.length}-${time}`;
    setChats((prev) => {
      const target = prev.find((c) => c.id === chatId);
      if (!target) return prev;
      const updated: Chat = {
        ...target,
        preview: text,
        time,
        messages: [...target.messages, { id: msgId, from: "me", text, time, read: false }],
      };
      return [updated, ...prev.filter((c) => c.id !== chatId)];
    });
    const contact = contacts[active.contactId];
    if (!contact) return;
    timers.current.push(
      window.setTimeout(() => {
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId ? { ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, read: true } : m)) } : c,
          ),
        );
        setTypingId(chatId);
      }, 900),
    );
    timers.current.push(
      window.setTimeout(() => {
        setTypingId(null);
        const reply = AUTO_REPLIES[(text.length + active.messages.length) % AUTO_REPLIES.length];
        const t = nowTime();
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  preview: reply,
                  time: t,
                  messages: [...c.messages, { id: `r-${msgId}`, from: "them", text: reply, time: t }],
                }
              : c,
          ),
        );
      }, 2600),
    );
  };

  const startCall = (contactId: string, kind: CallKind, incoming = false) => {
    const contact = contacts[contactId];
    if (!contact) return;
    setCall({ contact, kind, incoming });
  };

  const endCall = (seconds: number, accepted: boolean) => {
    if (!call) return;
    const time = nowTime();
    const duration = seconds > 0 ? (seconds < 60 ? `${seconds} сек` : `${Math.round(seconds / 60)} мин`) : "—";
    const direction = call.incoming ? (accepted ? "in" : "missed") : "out";
    setCalls((prev) => [
      {
        id: `call-${prev.length}-${time}`,
        contactId: call.contact.id,
        kind: call.kind,
        direction,
        when: `Сегодня, ${time}`,
        duration,
      },
      ...prev,
    ]);
    const label = `${call.kind === "video" ? "Видеозвонок" : "Аудиозвонок"}${duration !== "—" ? ` · ${duration}` : ""}`;
    setChats((prev) =>
      prev.map((c) =>
        c.contactId === call.contact.id
          ? { ...c, preview: direction === "missed" ? "Пропущенный звонок" : label, time }
          : c,
      ),
    );
    setCall(null);
  };

  const simulateIncoming = () => {
    timers.current.push(window.setTimeout(() => startCall("ek", "video", true), 2000));
  };

  const openChatWith = (contactId: string) => {
    const existing = chats.find((c) => c.contactId === contactId);
    if (existing) {
      selectChat(existing.id);
    } else {
      const id = `c-${contactId}`;
      setChats((prev) => [{ id, contactId, unread: 0, preview: "Новый чат", time: nowTime(), messages: [] }, ...prev]);
      setActiveId(id);
      setMobileOpen(true);
    }
    setTab("chats");
  };

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
              contacts={contacts}
              activeId={active.id}
              onSelect={selectChat}
              className={cn(mobileOpen && "hidden lg:flex")}
            />
            {activeContact && (
              <ActiveChat
                chat={active}
                contact={activeContact}
                typing={typingId === active.id}
                onSend={send}
                onCall={(k) => startCall(active.contactId, k)}
                onBack={() => setMobileOpen(false)}
                className={cn(!mobileOpen && "hidden lg:grid")}
              />
            )}
          </>
        )}
        {tab === "calls" && (
          <CallsView calls={calls} contacts={contacts} onCall={startCall} onSimulateIncoming={simulateIncoming} />
        )}
        {tab === "contacts" && <ContactsView contacts={CONTACTS} onCall={startCall} onMessage={openChatWith} />}
        {tab === "settings" && <SettingsView />}
      </main>
      {call && <CallScreen key={`${call.contact.id}-${call.kind}`} call={call} onEnd={endCall} />}
    </div>
  );
}