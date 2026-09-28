"use client";
import { useEffect, useState } from "react";
import { Download, Upload, BookOpen, Undo2 } from "lucide-react";
import { journalRepository } from "@/lib/storage/indexed-db";
import type { DeletedEntry } from "@/lib/storage/types";
export default function ExportLibrary({
  count,
  photos,
  backup,
  flush,
  reload,
}: {
  count: number;
  photos: number;
  backup: () => void;
  flush: () => Promise<void>;
  reload: () => Promise<void>;
}) {
  const [deleted, setDeleted] = useState<DeletedEntry[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function refresh() {
    try {
      setDeleted(
        (await journalRepository.listDeleted()).sort((a, b) =>
          b.deletedAt.localeCompare(a.deletedAt),
        ),
      );
    } catch {
      setError("Could not open Recently deleted. Please try again.");
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function recover(id: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await flush();
      const entry = await journalRepository.recover(id);
      await reload();
      await refresh();
      setMessage(`Restored your entry for ${entry.date}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore this day.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="export-view">
      <h1>Export & backup</h1>
      <p className="export-intro">
        {count} {count === 1 ? "entry" : "entries"} · {photos}{" "}
        {photos === 1 ? "photo" : "photos"}
      </p>
      <section className="data-card">
        <h2>Journal backup</h2>
        <p>
          A restorable JSON file with your words, photos, captions and saved
          versions.
        </p>
        <div className="dialog-actions">
          <button className="primary" disabled={busy} onClick={backup}>
            <Download size={18} />
            Back up journal
          </button>
          <button className="secondary" disabled={busy} onClick={backup}>
            <Upload size={18} />
            Restore backup
          </button>
        </div>
        <p className="dialog-note">
          Backup files aren’t encrypted. Keep them somewhere private.
        </p>
      </section>
      <section className="data-card pdf-card">
        <BookOpen size={22} />
        <h2>
          Export journal as PDF <span>Planned</span>
        </h2>
        <p>
          A readable edition to keep, share privately or print. PDF export isn’t
          available yet; your JSON backup remains separate.
        </p>
      </section>
      <section className="deleted-section" aria-labelledby="deleted-title">
        <h2 id="deleted-title">Recently deleted</h2>
        <p>
          Deleted days remain on this device until restored. They aren’t
          included in backup files.
        </p>
        {error && (
          <div role="alert">
            {error}
            <button className="secondary" onClick={() => void refresh()}>
              Retry list
            </button>
          </div>
        )}
        {message && <p role="status">{message}</p>}
        {!deleted.length && !error ? (
          <p className="deleted-empty">
            Nothing here. Your days are all accounted for.
          </p>
        ) : (
          deleted.map((item) => (
            <div className="deleted-row" key={item.id}>
              <div>
                <strong>{item.entry.date}</strong>
                <p>
                  {item.entry.text.trim().slice(0, 100) ||
                    "A day in photographs"}
                </p>
                <span>{item.entry.photos.length} photos</span>
              </div>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void recover(item.id)}
              >
                <Undo2 size={16} />
                Restore<span className="sr-only"> {item.entry.date}</span>
              </button>
            </div>
          ))
        )}
      </section>
    </section>
  );
}
