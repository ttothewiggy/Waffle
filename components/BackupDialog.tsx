"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Upload, X } from "lucide-react";
import { Entry, dayKey, hasContent } from "@/lib/storage/types";
import { decodeBackup, encodeBackup } from "@/lib/backup/format";
import { journalRepository } from "@/lib/storage/indexed-db";
export default function BackupDialog({
  close,
  flush,
  reload,
}: {
  close: () => void;
  flush: () => Promise<void>;
  reload: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState<Entry[] | null>(null),
    [conflicts, setConflicts] = useState(0),
    [replace, setReplace] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy]);
  async function download() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await flush();
      const blob = await encodeBackup(await journalRepository.list());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `waffle-backup-${dayKey()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage(
        "Backup download started. Check your Downloads or Files folder.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the backup.");
    } finally {
      setBusy(false);
    }
  }
  async function inspect(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    setPreview(null);
    setReplace(false);
    try {
      await flush();
      const rows = await decodeBackup(file);
      if (!rows.length) throw new Error("This backup contains no entries.");
      for (const entry of rows)
        for (const photo of entry.photos) {
          const bitmap = await createImageBitmap(photo.blob);
          bitmap.close();
        }
      const local = new Set(
        (await journalRepository.list()).filter(hasContent).map((e) => e.date),
      );
      setConflicts(rows.filter((e) => local.has(e.date)).length);
      setPreview(rows);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This backup could not be read.",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function restore() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      await flush();
      const result = await journalRepository.restore(preview, replace);
      await reload();
      setMessage(
        `Restored ${result.imported} days. Kept ${result.skipped} existing days.`,
      );
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      className="journal-dialog"
      ref={dialog}
      aria-labelledby="backup-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">KEEP YOUR WAFFLES</span>
          <h2 id="backup-title">Backup & restore</h2>
        </div>
        <button
          disabled={busy}
          onClick={close}
          aria-label="Close backup and restore"
        >
          <X />
        </button>
      </div>
      <p>
        Take your words and photos with you. Backups stay on your device unless
        you choose to share them.
      </p>
      <p className="dialog-note">
        Backup files aren’t encrypted. Store them somewhere private. Files up to
        100 MB are supported.
      </p>
      <div className="dialog-actions">
        <button
          className="primary"
          disabled={busy}
          onClick={() => void download()}
        >
          <Download size={18} />
          Download backup
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={18} />
          Choose backup
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => void inspect(e.target.files?.[0])}
      />
      {preview && (
        <section className="restore-preview">
          <h3>
            {preview.length} {preview.length === 1 ? "day" : "days"} ·{" "}
            {preview.reduce((n, e) => n + e.photos.length, 0)} photos
          </h3>
          <p>
            {preview.map((e) => e.date).sort()[0]} to{" "}
            {preview
              .map((e) => e.date)
              .sort()
              .at(-1)}
          </p>
          <p>
            {conflicts} days already have entries on this device. Other days in
            your journal will stay as they are.
          </p>
          <label>
            <input
              type="checkbox"
              checked={replace}
              disabled={busy}
              onChange={(e) => setReplace(e.target.checked)}
            />{" "}
            Replace matching days with the backup versions
          </label>
          {replace && conflicts > 0 && (
            <p className="dialog-note">
              This replaces both text and photos for matching days. Download a
              current backup first if you want to keep those versions.
            </p>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() => void restore()}
          >
            Restore {replace ? "and replace matching days" : "missing days"}
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setPreview(null)}
          >
            Cancel restore
          </button>
        </section>
      )}
      {busy && <p role="status">Working… Please keep this window open.</p>}
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
