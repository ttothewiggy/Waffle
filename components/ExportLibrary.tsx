"use client";
import { useEffect, useState } from "react";
import { Download, BookOpen, ArchiveRestore, Undo2 } from "lucide-react";
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
      <div className="eyebrow">
        OFF THE PAGE, INTO YOUR LIFE <span className="little-line" />
      </div>
      <h1>
        Yours to keep<span className="heading-dot">.</span>
      </h1>
      <p className="full-date">
        Your words, your pictures, your collection of days.
      </p>
      <div className="export-feature">
        <div className="export-symbol">
          <Download size={28} />
        </div>
        <div>
          <span className="eyebrow">EXPORT & BACKUP</span>
          <h2>A copy for safekeeping.</h2>
          <p>
            Download your journal with every photo, or bring a Waffle backup
            onto this device.
          </p>
          <p className="collection-count">
            {count} {count === 1 ? "day" : "days"} · {photos}{" "}
            {photos === 1 ? "photo" : "photos"}
          </p>
          <button className="primary" disabled={busy} onClick={backup}>
            <Download size={18} />
            Back up or restore
          </button>
          <p className="dialog-note">
            A Waffle backup is a restorable file, not a PDF. It isn’t encrypted;
            keep it somewhere private.
          </p>
        </div>
      </div>
      <div className="export-future">
        <article>
          <BookOpen size={24} />
          <span className="planned-label">ON THE HORIZON</span>
          <h2>A journal to leaf through.</h2>
          <p>
            Beautiful PDF editions with your chosen dates, photographs, and a
            cover of your own.
          </p>
        </article>
        <article>
          <ArchiveRestore size={24} />
          <span className="planned-label">A LITTLE FURTHER AHEAD</span>
          <h2>On your bookshelf.</h2>
          <p>
            A printed collection of your days. Book printing is an idea we’re
            exploring; it isn’t available yet.
          </p>
        </article>
      </div>
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
