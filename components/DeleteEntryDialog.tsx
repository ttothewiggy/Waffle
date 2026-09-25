"use client";
import { useEffect, useRef, useState } from "react";
export default function DeleteEntryDialog({
  date,
  close,
  remove,
}: {
  date: string;
  close: () => void;
  remove: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await remove();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this day.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="journal-dialog"
      aria-labelledby="delete-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <span className="eyebrow">A LITTLE CLEARING OUT</span>
      <h2 id="delete-title">Delete this day?</h2>
      <p>
        The entry for {date}, including its photos, will move to Recently
        deleted. You can bring it back from Export & backup.
      </p>
      <div className="dialog-actions">
        <button className="secondary" autoFocus disabled={busy} onClick={close}>
          Keep this day
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? "Moving…" : "Delete day"}
        </button>
      </div>
      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
    </dialog>
  );
}
