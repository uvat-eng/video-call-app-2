import Icon from "@/components/ui/icon";
import { type User } from "@/lib/messenger-data";
import GroupCreate from "../GroupCreate";
import { type E2E } from "@/lib/e2e";
import BottomNav, { TopAction, TopBar } from "../AppHeader";
import ChatList from "../ChatList";
import ActiveChat from "../ActiveChat";
import CallScreen from "../CallScreen";
import CallsView from "../CallsView";
import ContactsView from "../ContactsView";
import SettingsView from "../SettingsView";
import PushBanner from "../PushBanner";
import GroupCallScreen, { MAX_GROUP } from "../GroupCallScreen";
import ContactPicker from "../ContactPicker";
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
    deleteForMe,
    deleteForAll,
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

  const unread = chats.reduce((n, c) => n + c.unread, 0);
  const chatOpen = tab === "chats" && mobileOpen && !!active;

  return (
    <div className="app-text h-[100dvh] overflow-hidden bg-muted">
      <div className="relative mx-auto flex h-full max-w-[680px] flex-col overflow-hidden bg-card sm:shadow-xl">
        {chatOpen && active ? (
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
            onDeleteForMe={deleteForMe}
            onDeleteForAll={deleteForAll}
            onBack={() => setMobileOpen(false)}
          />
        ) : (
          <>
            <TopBar
              tab={tab}
              actions={
                tab === "chats" ? (
                  <TopAction
                    icon="Users"
                    label="Новая группа"
                    onClick={() => {
                      loadContacts();
                      setGroupCreate(true);
                    }}
                  />
                ) : tab === "calls" ? (
                  <TopAction icon="PhoneCall" label="Групповой звонок" onClick={openGroupPicker} />
                ) : null
              }
            />
            {!pushHidden && <PushBanner state={push} onEnable={enablePush} onClose={hidePush} />}
            <main className="relative flex min-h-0 flex-1 flex-col">
              {tab === "chats" && (
                <ChatList
                  chats={chats}
                  activeId={null}
                  loaded={chatsLoaded}
                  onSelect={openChat}
                  onNew={() => setTab("contacts")}
                />
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
              {(tab === "chats" || tab === "calls") && (
                <button
                  onClick={tab === "chats" ? () => setTab("contacts") : openGroupPicker}
                  aria-label={tab === "chats" ? "Новый чат" : "Новый звонок"}
                  className="absolute bottom-4 right-4 grid h-14 w-14 place-items-center rounded-2xl bg-badge text-badge-foreground shadow-lg transition-transform active:scale-95"
                >
                  <Icon name={tab === "chats" ? "MessageSquarePlus" : "PhonePlus"} size={24} />
                </button>
              )}
            </main>
            <BottomNav tab={tab} onTab={setTab} missed={missed} unread={unread} />
          </>
        )}
      </div>
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
