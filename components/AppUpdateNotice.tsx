"use client";
import { useEffect, useRef, useState } from "react";
/** Activate a downloaded app update only after local writes have finished. */
export default function AppUpdateNotice({
  flush,
}: {
  flush: () => Promise<void>;
}) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const reloadRequested = useRef(false);
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const inspect = () => {
      if (active && registration?.waiting) setWaiting(registration.waiting);
    };
    const installed = () => {
      if (installing?.state === "installed") inspect();
    };
    const found = () => {
      installing?.removeEventListener("statechange", installed);
      installing = registration?.installing || null;
      installing?.addEventListener("statechange", installed);
    };
    const changed = () => {
      if (reloadRequested.current) window.location.reload();
    };
    const check = () => {
      void registration?.update().catch(() => {});
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    window.addEventListener("online", check);
    void navigator.serviceWorker
      .register("/sw.js")
      .then((value) => {
        if (!active) return;
        registration = value;
        inspect();
        found();
        registration.addEventListener("updatefound", found);
        check();
      })
      .catch(() => {});
    return () => {
      active = false;
      registration?.removeEventListener("updatefound", found);
      installing?.removeEventListener("statechange", installed);
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
      window.removeEventListener("online", check);
    };
  }, []);
  if (!waiting) return null;
  return (
    <aside className="app-update-notice" aria-label="Waffle update">
      <p>
        A Waffle update is ready. Update this device to keep its features in
        step with your other devices.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await flush();
            reloadRequested.current = true;
            waiting.postMessage({ type: "SKIP_WAITING" });
          } catch {
            setError(
              "Your latest writing has not saved yet. Retry saving before updating.",
            );
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving and updating…" : "Update Waffle"}
      </button>
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}
