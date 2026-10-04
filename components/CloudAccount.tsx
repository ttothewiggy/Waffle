"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  IndexedDBRepository,
  journalRepository,
} from "@/lib/storage/indexed-db";
import type { JournalRepository } from "@/lib/storage/types";
import { cloudClient } from "@/lib/cloud/client";
import { SupabaseTransport } from "@/lib/cloud/transport";
import { JournalSync } from "@/lib/cloud/sync";
import {
  OFFLINE_ACCOUNT_KEY,
  parseOfflineAccount,
  type OfflineAccount,
} from "@/lib/cloud/offline-account";
const Context = createContext<{
  repository: JournalRepository;
  revision: number;
  session: Session | null;
  account: OfflineAccount | null;
  leaveAccount: () => void;
  engine: JournalSync | null;
  configured: boolean;
  recovery: boolean;
  recovered: () => void;
}>({
  repository: journalRepository,
  revision: 0,
  session: null,
  account: null,
  leaveAccount: () => {},
  engine: null,
  configured: false,
  recovery: false,
  recovered: () => {},
});
export function useJournalAccount() {
  return useContext(Context);
}
export default function CloudAccount({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<OfflineAccount | null>(null);
  function leaveAccount() {
    try {
      localStorage.removeItem(OFFLINE_ACCOUNT_KEY);
    } catch {}
    setAccount(null);
    setSession(null);
  }
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [revision, setRevision] = useState(0);
  const [, render] = useState(0);
  const client = useMemo(() => cloudClient(), []);
  const userId = account?.id;
  const authenticatedId = session?.user.id;
  const repository = useMemo(
    () =>
      userId
        ? new IndexedDBRepository(`waffle-account-${userId}`)
        : journalRepository,
    [userId],
  );
  const [engine, setEngine] = useState<JournalSync | null>(null);
  useEffect(() => {
    try {
      const cached = parseOfflineAccount(
        localStorage.getItem(OFFLINE_ACCOUNT_KEY),
      );
      if (cached) {
        setAccount(cached);
        setReady(true);
      }
    } catch {}
    const storage = (event: StorageEvent) => {
      if (event.key === OFFLINE_ACCOUNT_KEY)
        setAccount(parseOfflineAccount(event.newValue));
    };
    window.addEventListener("storage", storage);
    if (!client) {
      setReady(true);
      return () => window.removeEventListener("storage", storage);
    }
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (next) {
        const remembered = { id: next.user.id, email: next.user.email };
        setAccount(remembered);
        try {
          localStorage.setItem(OFFLINE_ACCOUNT_KEY, JSON.stringify(remembered));
        } catch {}
      }
      setReady(true);
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
        window.location.hash = "settings";
      }
      if (event === "SIGNED_OUT") setRecovery(false);
    });
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("storage", storage);
    };
  }, [client]);
  useEffect(() => {
    if (
      !client ||
      !userId ||
      authenticatedId !== userId ||
      !(repository instanceof IndexedDBRepository)
    ) {
      setEngine(null);
      return;
    }
    const sync = new JournalSync(
      repository,
      new SupabaseTransport(client, userId),
      () => render((n) => n + 1),
      () => setRevision((n) => n + 1),
    );
    setEngine(sync);
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout>;
    const run = () => {
      if (stopped) return;
      void sync.sync();
    };
    const unsubscribe = repository.subscribe(() => {
      sync.pending();
      clearTimeout(timeout);
      timeout = setTimeout(run, 1500);
    });
    const interval = setInterval(run, 30000);
    const focus = () => {
      if (!document.hidden) run();
    };
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", focus);
    run();
    return () => {
      stopped = true;
      sync.stop();
      unsubscribe();
      clearTimeout(timeout);
      clearInterval(interval);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [client, userId, authenticatedId, repository]);
  if (!ready) return <p className="opening-journal">Opening Waffle…</p>;
  return (
    <Context.Provider
      value={{
        repository,
        revision,
        session,
        account,
        leaveAccount,
        engine:
          engine?.local === repository && authenticatedId === userId
            ? engine
            : null,
        configured: !!client,
        recovery,
        recovered: () => setRecovery(false),
      }}
    >
      <div key={userId || "device"}>{children}</div>
    </Context.Provider>
  );
}
export function AccountSettings({
  flush,
  reload,
}: {
  flush: () => Promise<void>;
  reload: () => Promise<void>;
}) {
  const {
    session,
    account,
    leaveAccount,
    engine,
    repository,
    configured,
    recovery,
    recovered,
  } = useJournalAccount();
  const [email, setEmail] = useState(account?.email || "");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await flush();
      await work();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "That didn’t work. Please retry.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submit() {
    const client = cloudClient();
    if (!client) return;
    if (recovery) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      recovered();
      setPassword("");
      setMessage("Password updated.");
      return;
    }
    if (mode === "reset") {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/",
      });
      if (error) throw error;
      setMessage(
        "If this account exists, check your email for a password reset link.",
      );
      return;
    }
    const result =
      mode === "signup"
        ? await client.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin + "/" },
          })
        : await client.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    setPassword("");
    if (mode === "signup" && !result.data.session)
      setMessage(
        "Check your email to confirm your account, then sign in here.",
      );
  }
  return (
    <section className="account-settings">
      <h2>Account & sync</h2>
      {account && !session && (
        <div>
          <p>
            Your saved account journal is available on this device. Sign in
            again when connected to resume syncing.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                leaveAccount();
              })
            }
          >
            Return to device-only journal
          </button>
        </div>
      )}
      {!configured ? (
        <p>
          Cloud sync isn’t configured in this build yet. Your journal remains on
          this device.
        </p>
      ) : session && !recovery ? (
        <>
          <p>
            Signed in as <strong>{session.user.email}</strong>
          </p>
          <p role="status">{engine?.message || "Preparing sync…"}</p>
          <div className="account-actions">
            <button
              disabled={busy || !engine}
              onClick={() =>
                void action(async () => {
                  await engine?.sync();
                  await reload();
                })
              }
            >
              Sync now
            </button>
            <button
              disabled={busy || !engine || engine.status !== "synced"}
              onClick={() =>
                void action(async () => {
                  const result = await repository.restore(
                    await journalRepository.list(),
                    false,
                  );
                  await reload();
                  await engine?.sync();
                  setMessage(
                    `Copied ${result.imported} days. Kept ${result.skipped} existing account days. The original device journal is unchanged.`,
                  );
                })
              }
            >
              Copy this device’s journal to my account
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await engine?.sync();
                  if (
                    engine &&
                    engine.status !== "synced" &&
                    !window.confirm(
                      "Some changes have not synced. They will stay in this account’s local copy on this device. Sign out anyway?",
                    )
                  )
                    return;
                  const result = await cloudClient()!.auth.signOut({
                    scope: "local",
                  });
                  if (result.error) throw result.error;
                  leaveAccount();
                  window.location.hash = "settings";
                })
              }
            >
              Sign out
            </button>
          </div>
          <p>
            Your original device-only journal stays separate. Copying keeps
            existing account days; use Export & backup to review or import any
            skipped days.
          </p>
          {engine?.reviews.some((r) => !r.choice) && (
            <div className="sync-conflict">
              <h3>A few overlapping edits need a choice</h3>
              <p>
                Only passages changed on both devices need reviewing. Open a day
                to compare them alongside your writing. No backup downloads or
                whole-journal replacement needed.
              </p>
              {[
                ...new Set(
                  engine.reviews.filter((r) => !r.choice).map((r) => r.date),
                ),
              ].map((date) => (
                <a key={date} href={`#entry=${date}`}>
                  Review {new Date(`${date}T12:00:00`).toLocaleDateString()}
                </a>
              ))}
            </div>
          )}
          <p>
            Cloud sync is not end-to-end encrypted. Authorised service
            administrators can technically access journal contents. This device
            keeps an unencrypted offline copy, including after sign-out; use a
            trusted device.
          </p>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(submit);
          }}
        >
          <p>
            {recovery
              ? "Choose your new account password."
              : "Sign in to bring your journal to your other devices. Your existing device journal will not upload automatically."}
          </p>
          {!recovery && (
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {(recovery || mode !== "reset") && (
            <label>
              {recovery ? "New password" : "Password"}
              <input
                type="password"
                autoComplete={
                  recovery || mode === "signup"
                    ? "new-password"
                    : "current-password"
                }
                required
                minLength={mode === "signin" && !recovery ? 1 : 12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          <button type="submit" disabled={busy}>
            {busy
              ? "Please wait…"
              : recovery
                ? "Save new password"
                : mode === "signup"
                  ? "Create account"
                  : mode === "reset"
                    ? "Send reset email"
                    : "Sign in"}
          </button>
          {!recovery && (
            <div className="account-actions">
              {(["signin", "signup", "reset"] as const)
                .filter((m) => m !== mode)
                .map((m) => (
                  <button
                    type="button"
                    disabled={busy}
                    key={m}
                    onClick={() => {
                      setMode(m);
                      setMessage("");
                      setError("");
                    }}
                  >
                    {m === "signin"
                      ? "Sign in"
                      : m === "signup"
                        ? "Create an account"
                        : "Forgot password?"}
                  </button>
                ))}
            </div>
          )}
        </form>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
    </section>
  );
}
