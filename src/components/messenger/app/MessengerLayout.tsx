import Icon from "@/components/ui/icon";
import { type User } from "@/lib/messenger-data";
import GroupCreate from "../GroupCreate";
import { type E2E } from "@/lib/e2e";
import AppHeader from "../AppHeader";
import ChatList from "../ChatList";
import ActiveChat from "../ActiveChat";
import CallScreen from "../CallScreen";
import CallsView from "../CallsView";
import ContactsView from "../ContactsView";
import SettingsView from "../SettingsView";
import PushBanner from "../PushBanner";
import GroupCallScreen, { MAX_GROUP } from "../GroupCallScreen";
import ContactPicker from "../ContactPicker";
import { cn } from "@/lib/utils";
import { biometricLabel } from "@/lib/biometric";
import type { MessengerCore } from "./useMessengerCore";
import type { MessengerActions } from "./useMessengerActions";

type Props = MessengerCore &
  MessengerActions & {
    me: User;
    token: string;
    e2e: E2E;
    onLogout: () => void;
  };

export default function MessengerLayout(props: Props) {
  const {
    tab,
    setTab,
    chatsLoaded,
    historyLoaded,
    activeId,
    mobileOpen,
    setMobileOpen,
    contacts,
    calls,
    callsLoaded,
    call,
    groupCall,
    groupCalls,
    groupPicker,
    setGroupPicker,
    sendError,
    book,
    syncing,
    push,
    pushHidden,
    linkCode,
    syncBook,
    enablePush,
    bioSupported,
    bioOn,
    toggleBio,
    testPush,
    hidePush,
    chats,
    openChat,
    loadContacts,
    active,
    sendPayload,
    uploading,
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
    wallpaper,
    changeLook,
    saveAvatar,
    approveDevice,
    backup,
    saveProfile,
    clearHistory,
    openGroupPicker,
    startGroup,
    closeGroup,
    startCall,
    closeCall,
    missed,
    me,
    token,
    e2e,
    onLogout,
  } = props;

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
              onNewGroup={() => {
                loadContacts();
                setGroupCreate(true);
              }}
              className={cn(mobileOpen && active && "hidden lg:flex")}
            />
            {active ? (
              <ActiveChat
                key={active.id}
                wallpaper={wallpaper}
                peer={active.peer}
                group={active.group}
                me={me}
                contacts={contacts}
                uploading={uploading}
                onSendPayload={sendPayload}
                onSendFile={sendFile}
                onGroupAction={groupAction}
                onLoadContacts={loadContacts}
                myKey={e2e.pub}
                messages={activeMessages}
                loading={!historyLoaded}
                error={sendError}
                onSend={send}
                onCall={(k) =>
                  active.group
                    ? startGroup(
                        active.group.members.filter((m) => m.id !== me.id && m.publicKey).slice(0, MAX_GROUP - 1),
                        k,
                      )
                    : startCall(active.peer, k)
                }
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
          <SettingsView
            user={me}
            token={token}
            onAvatar={saveAvatar}
            onApproveDevice={approveDevice}
            look={look}
            onLook={changeLook}
            backup={backup}
            linkCode={linkCode}
            onSave={saveProfile}
            onLogout={onLogout}
            onClearHistory={clearHistory}
            onTestPush={testPush}
            bio={bioSupported ? { label: biometricLabel(), on: bioOn, toggle: toggleBio } : undefined}
          />
        )}
      </main>
      {groupCreate && (
        <GroupCreate contacts={contacts} onCancel={() => setGroupCreate(false)} onCreate={createGroup} />
      )}
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
