import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/icon";
import { api, ApiError, TOKEN_KEY, type User } from "@/lib/messenger-data";
import { applyLook, loadLook } from "@/lib/appearance";
import { importIdentity, loadIdentity, openKeyBackup, sealKeyBackup, Vault, vaultKind, wipeVault, type E2E } from "@/lib/e2e";
import AuthScreen, { type AuthExtra } from "./AuthScreen";
import PinScreen from "./PinScreen";
import { registerSw, unsubscribePush } from "@/lib/push";
import { clearSwSession, saveSwSession } from "@/lib/sw-session";
import { biometricAvailable, biometricEnabled, biometricLabel, verifyBiometric } from "@/lib/biometric";
import { useMessengerCore } from "./app/useMessengerCore";
import { useMessengerActions } from "./app/useMessengerActions";
import MessengerLayout from "./app/MessengerLayout";

const UNLOCK_GRACE_MS = 30 * 60 * 1000;

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
  const [bioReady, setBioReady] = useState(false);
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
  const authRef = useRef<AuthExtra | null>(null);
  const [notice, setNotice] = useState("");
  const [vaultTick, setVaultTick] = useState(0);

  useEffect(() => {
    applyLook(loadLook());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyLook(loadLook());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const unlockedKey = (id: number) => `rusapp_unlocked_${id}`;

  const restoreFromBackup = async (vault: Vault, user: User) => {
    const auth = authRef.current;
    if (!auth?.keyBackup) return false;
    const backed = await openKeyBackup(auth.keyBackup, auth.password, user.id);
    if (!backed) return false;
    await importIdentity(vault, backed);
    return true;
  };

  const prepareIdentity = async (vault: Vault, user: User, t: string) => {
    let id = await loadIdentity(vault);
    if (user.publicKey && user.publicKey !== id.pub && user.hasKeyBackup) {
      if (!(await restoreFromBackup(vault, user))) throw new Error("stale-key");
      id = await loadIdentity(vault);
    }
    if (user.publicKey !== id.pub) {
      await api("set_key", { publicKey: id.pub }, t);
      setMe({ ...user, publicKey: id.pub });
    }
    const auth = authRef.current;
    if (auth && (!user.hasKeyBackup || user.publicKey !== id.pub)) {
      const backup = await sealKeyBackup(vault, auth.password, user.id);
      if (backup) await api("key_backup", { backup, password: auth.password }, t).catch(() => null);
    }
    authRef.current = null;
    return id;
  };

  const openSession = (id: E2E, user: User) => {
    sessionStorage.setItem(unlockedKey(user.id), "1");
    localStorage.setItem(unlockedKey(user.id), String(Date.now()));
    if (token) saveSwSession(token, user.id);
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
        const vault = await Vault.openDevice(me.id);
        if (kind === "none" && me.publicKey && !authRef.current) {
          vault.close();
          throw new Error("stale-key");
        }
        if (kind === "none" && me.publicKey) await restoreFromBackup(vault, me);
        const id = await prepareIdentity(vault, me, token);
        const locked = await id.vault.hasLock();
        const last = Number(localStorage.getItem(unlockedKey(me.id)) || 0);
        const recent = Date.now() - last < UNLOCK_GRACE_MS;
        if (locked && (sessionStorage.getItem(unlockedKey(me.id)) === "1" || recent)) return openSession(id, me);
        setPendingE2e(id);
        setBioReady(locked && (await biometricAvailable()) && (await biometricEnabled(id.vault)));
        setVaultMode(locked ? "unlock" : "create");
      })
      .catch((e) => {
        if (e instanceof Error && e.message === "stale-key") {
          setNotice("Ключи шифрования обновились. Войдите ещё раз по номеру и паролю.");
          return logoutRef.current();
        }
        setVaultError("Не удалось подготовить защищённое хранилище на этом устройстве");
      });
  }, [me?.id, token, e2e, vaultTick]);

  const onAuth = (t: string, u: User, extra: AuthExtra) => {
    authRef.current = extra;
    setNotice("");
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
    if (me) {
      sessionStorage.removeItem(unlockedKey(me.id));
      localStorage.removeItem(unlockedKey(me.id));
    }
    clearSwSession();
    localStorage.removeItem(TOKEN_KEY);
    setE2e((cur) => {
      cur?.vault.close();
      return null;
    });
    setPendingE2e(null);
    authRef.current = null;
    setVaultMode(null);
    setToken(null);
    setMe(null);
  }, [token, me]);

  const logoutRef = useRef(logout);
  logoutRef.current = logout;

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
      const id = await prepareIdentity(vault, me, token);
      openSession(id, me);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Не удалось открыть хранилище";
    }
  };

  const bioUnlock = async () => {
    if (!pending || !me) return "Нет сессии";
    try {
      if (!(await verifyBiometric(pending.vault))) return "Не удалось подтвердить личность";
      openSession(pending, me);
      return null;
    } catch {
      return "Вход отменён — введите код доступа";
    }
  };

  const resetVault = async () => {
    if (!me) return;
    pending?.vault.close();
    setPendingE2e(null);
    await wipeVault(me.id);
    setVaultMode(null);
    setE2e(null);
    setVaultTick((t) => t + 1);
  };

  if (!ready) return <Loader />;
  if (!token || !me) return <AuthScreen onAuth={onAuth} notice={notice} />;
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
        onBiometric={bioReady ? bioUnlock : undefined}
        bioLabel={bioReady ? biometricLabel() : ""}
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
  const core = useMessengerCore({ token, me, e2e, onLogout });
  const actions = useMessengerActions({ core, token, me, e2e, setMe });
  return <MessengerLayout {...core} {...actions} me={me} token={token} e2e={e2e} onLogout={onLogout} />;
}
