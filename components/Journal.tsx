"use client";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Download,
  Trash2,
  Undo2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Mic,
  Feather,
  X,
  Check,
  LoaderCircle,
  ArrowUpRight,
} from "lucide-react";
import { journalRepository } from "@/lib/storage/indexed-db";
import {
  dayKey,
  newEntry,
  hasContent,
  type Entry,
  type Photo,
} from "@/lib/storage/types";
import WaffleIcon from "./WaffleIcon";
import ExportLibrary from "./ExportLibrary";
import DeleteEntryDialog from "./DeleteEntryDialog";
import DocumentEditor from "./DocumentEditor";
import { orderedPhotos } from "@/lib/document/simple";
import BookView from "./BookView";
import DiaryBook from "./DiaryBook";
import AiDialog from "./AiDialog";
import { blocksFor, textFor, applyDraft } from "@/lib/document/blocks";
import type { DocumentBlock, Revision } from "@/lib/storage/types";
import BackupDialog from "./BackupDialog";
import DictationDialog from "./DictationDialog";
const parseDay = (key: string) => new Date(`${key}T12:00:00`);
const format = (key: string, options: Intl.DateTimeFormatOptions) =>
  parseDay(key).toLocaleDateString(undefined, options);
export default function Journal() {
  const [reading, setReading] = useState(false);
  const [aiSource, setAiSource] = useState<Entry | null>(null);
  const [today, setToday] = useState("");
  const [selected, setSelected] = useState("");
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<"write" | "days" | "keep" | "diary">(
    "write",
  );
  const [month, setMonth] = useState(new Date());
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [adding, setAdding] = useState(false);
  const [offline, setOffline] = useState(false);
  const [info, setInfo] = useState(false);
  const [writingSize, setWritingSize] = useState(18);
  const [deleteDay, setDeleteDay] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<{
    id: string;
    date: string;
  } | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const undoLock = useRef(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [dictationDay, setDictationDay] = useState<string | null>(null);
  const entriesRef = useRef<Record<string, Entry>>({});
  const pending = useRef(new Map<string, Entry>());
  const serial = useRef(Promise.resolve());
  const sequence = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  async function load() {
    setError("");
    try {
      const rows = await journalRepository.list();
      const map = Object.fromEntries(
        rows.map((e) => [e.date, { ...e, photos: orderedPhotos(e) }]),
      );
      entriesRef.current = map;
      setEntries(map);
      setReady(true);
      setLastDeleted(null);
      setStatus("Saved on this device");
    } catch {
      setError(
        "Your journal could not be opened. Allow browser storage, then retry.",
      );
    }
  }
  useEffect(() => {
    try {
      const size = Number(localStorage.getItem("waffle-writing-size"));
      if ([16, 18, 20, 22].includes(size)) setWritingSize(size);
    } catch {}
    const key = dayKey();
    setToday(key);
    setSelected(key);
    void load();
    const online = () => setOffline(!navigator.onLine);
    online();
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    const midnight = window.setInterval(() => setToday(dayKey()), 30000);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      clearInterval(midnight);
    };
  }, []);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (pending.current.size) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  function persist(entry: Entry) {
    const seq = ++sequence.current;
    pending.current.set(entry.date, entry);
    setStatus("Saving…");
    serial.current = serial.current
      .catch(() => {})
      .then(async () => {
        try {
          await journalRepository.save(entry);
          if (pending.current.get(entry.date) === entry)
            pending.current.delete(entry.date);
          if (seq === sequence.current && pending.current.size === 0) {
            setStatus("Saved on this device");
            setError("");
          }
        } catch {
          setError(
            "Couldn’t save. Your changes are still here. Free some device storage, then retry.",
          );
          setStatus("Not saved");
        }
      });
  }
  async function flush() {
    await serial.current;
    if (pending.current.size)
      throw new Error(
        "Some changes have not saved. Close this window and retry saving before continuing.",
      );
  }
  function update(patch: Partial<Entry>, date = selected) {
    if (undoLock.current) return;
    const entry = {
      ...(entriesRef.current[date] || newEntry(date)),
      ...patch,
      blocks: undefined,
      updatedAt: new Date().toISOString(),
    };
    const map = { ...entriesRef.current, [date]: entry };
    entriesRef.current = map;
    setEntries(map);
    persist(entry);
  }
  function openDay(date: string) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parseDay(date).getTime()) ||
      dayKey(parseDay(date)) !== date ||
      date > today
    )
      return;
    setMonth(
      new Date(parseDay(date).getFullYear(), parseDay(date).getMonth(), 1),
    );
    setSelected(date);
    setView("write");
    setPhotoError("");
  }
  function resizeWriting(size: number) {
    setWritingSize(size);
    try {
      localStorage.setItem("waffle-writing-size", String(size));
    } catch {}
  }
  async function removeDay(date: string) {
    await flush();
    const deleted = await journalRepository.trash(date);
    const map = { ...entriesRef.current };
    delete map[date];
    entriesRef.current = map;
    setEntries(map);
    setLastDeleted({ id: deleted.id, date });
    setStatus("Saved on this device");
  }
  async function undoDelete() {
    if (!lastDeleted || undoLock.current) return;
    undoLock.current = true;
    setUndoBusy(true);
    try {
      await flush();
      const restored = await journalRepository.recover(lastDeleted.id);
      const map = { ...entriesRef.current, [restored.date]: restored };
      entriesRef.current = map;
      setEntries(map);
      setLastDeleted(null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not undo deletion.");
    } finally {
      undoLock.current = false;
      setUndoBusy(false);
    }
  }
  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const date = selected;
    setAdding(true);
    setPhotoError("");
    try {
      const photos: Photo[] = [];
      for (const file of Array.from(files)) {
        if (
          !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
            file.type,
          )
        )
          throw new Error("Choose JPG, PNG, WebP, or GIF photos.");
        if (file.size > 20 * 1024 * 1024)
          throw new Error("Choose photos smaller than 20 MB each.");
        const bitmap = await createImageBitmap(file);
        bitmap.close();
        photos.push({
          id: crypto.randomUUID(),
          name: file.name,
          type: file.type,
          blob: file,
        });
      }
      const current = entriesRef.current[date] || newEntry(date);
      update({ photos: [...current.photos, ...photos] }, date);
      if (navigator.storage?.persist)
        void navigator.storage.persist().catch(() => {});
    } catch (e) {
      setPhotoError(
        e instanceof Error ? e.message : "That photo could not be opened.",
      );
    } finally {
      setAdding(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  const entry = entries[selected] || newEntry(selected);
  const savedDays = Object.values(entries)
    .filter(hasContent)
    .sort((a, b) => b.date.localeCompare(a.date));
  const words = entry.text.trim() ? entry.text.trim().split(/\s+/).length : 0;
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (start.getDay() + 6) % 7;
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  return (
    <div className="app-shell">
      {aiSource && (
        <AiDialog
          text={aiSource.text}
          close={() => setAiSource(null)}
          apply={async (text) => {
            const current =
              entriesRef.current[aiSource.date] || newEntry(aiSource.date);
            if (
              current.text === text &&
              current.revisions?.at(-1)?.text === aiSource.text
            ) {
              persist(current);
              await flush();
              return;
            }
            if (current.text !== aiSource.text)
              throw new Error("The entry changed. Close and try again.");
            await flush();
            update(applyDraft(current, text), aiSource.date);
            await flush();
          }}
        />
      )}
      {deleteDay && (
        <DeleteEntryDialog
          date={deleteDay}
          close={() => setDeleteDay(null)}
          remove={() => removeDay(deleteDay)}
        />
      )}
      {backupOpen && (
        <BackupDialog
          close={() => setBackupOpen(false)}
          flush={flush}
          reload={load}
        />
      )}
      {dictationDay && (
        <DictationDialog
          date={dictationDay}
          close={() => setDictationDay(null)}
          append={(text) => {
            const current =
              entriesRef.current[dictationDay] || newEntry(dictationDay);
            const blocks: DocumentBlock[] = [
              ...blocksFor(current),
              { id: crypto.randomUUID(), type: "text", text },
            ];
            update({ blocks, text: textFor(blocks) }, dictationDay);
          }}
        />
      )}
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Waffle home">
          <span className="brand-icon">
            <WaffleIcon size={23} />
          </span>
          waffle<span className="brand-dot">.</span>
        </a>
        <div className="notebook-label">YOUR PERSONAL JOURNAL</div>
        <nav aria-label="Journal">
          <button
            className={view === "write" ? "nav-item active" : "nav-item"}
            onClick={() => openDay(today)}
          >
            <Feather size={19} />
            Today<span className="nav-key">01</span>
          </button>
          <button
            className={view === "days" ? "nav-item active" : "nav-item"}
            onClick={() => setView("days")}
          >
            <CalendarDays size={19} />
            Your days
            <span className="nav-key">
              {String(savedDays.length).padStart(2, "0")}
            </span>
          </button>
          <button
            className={view === "diary" ? "nav-item active" : "nav-item"}
            onClick={() => setView("diary")}
          >
            <BookOpen size={19} />
            Whole diary
          </button>
          <button
            className={view === "keep" ? "nav-item active" : "nav-item"}
            onClick={() => setView("keep")}
          >
            <Download size={19} />
            Export & backup
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="small-mark">w.</div>
          <p>
            A little space
            <br />
            <em>for your waffles.</em>
          </p>
          <button className="privacy-link" onClick={() => setInfo(!info)}>
            About your journal <ArrowUpRight size={14} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span className="crumb">
            MY JOURNAL <span>/</span>{" "}
            {view === "write"
              ? "A DAY AT A TIME"
              : view === "days"
                ? "THE DAYS COLLECTED"
                : view === "diary"
                  ? "EVERY DAY BELONGS"
                  : "YOURS TO KEEP"}
          </span>
          <span className="save-status" role="status">
            {status === "Saving…" ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Check size={14} />
            )}{" "}
            {offline ? "Offline · " : ""}
            {status || "Opening journal…"}
          </span>
        </header>
        {info && (
          <section className="notice">
            <strong>Your words stay here.</strong>
            <p>
              Entries and photos are stored in this browser, on this device.
              They aren’t encrypted or synced. Clearing browser data removes
              them. Download a backup to keep another copy. Only recordings you
              choose to transcribe and text you choose to polish are sent to
              OpenAI.
            </p>
            <p>
              On Android, open the published link in Chrome and choose “Add to
              Home screen” or “Install app” when offered.
            </p>
            <div className="dialog-actions">
              <button
                className="secondary"
                disabled={!ready || adding}
                onClick={() => setBackupOpen(true)}
              >
                Backup & restore
              </button>
              <button onClick={() => setInfo(false)}>Got it</button>
            </div>
          </section>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            <button
              onClick={() =>
                ready
                  ? Array.from(pending.current.values()).forEach(persist)
                  : void load()
              }
            >
              Retry
            </button>
          </div>
        )}
        {lastDeleted && (
          <div className="undo-notice" role="status">
            <span>Entry for {lastDeleted.date} moved to Recently deleted.</span>
            <button
              disabled={undoBusy || adding}
              onClick={() => void undoDelete()}
            >
              <Undo2 size={16} />
              {undoBusy ? "Restoring…" : "Undo"}
            </button>
          </div>
        )}
        {!ready ? (
          <div className="loading">
            <BookOpen />
            <p>
              {error ? "Your journal is waiting." : "Opening your notebook…"}
            </p>
          </div>
        ) : view === "diary" ? (
          <DiaryBook
            entries={entries}
            today={today}
            size={writingSize}
            onChange={update}
            onEdit={(date) => {
              setReading(false);
              openDay(date);
            }}
            disabled={undoBusy || adding}
          />
        ) : view === "keep" ? (
          <ExportLibrary
            count={savedDays.length}
            photos={savedDays.reduce((n, e) => n + e.photos.length, 0)}
            backup={() => setBackupOpen(true)}
            flush={flush}
            reload={load}
          />
        ) : view === "write" ? (
          <section className="writing-view">
            <div className="date-heading">
              <div>
                <div className="eyebrow">
                  {selected === today ? "TODAY’S PAGE" : "FROM YOUR JOURNAL"}
                  <span className="little-line" />
                </div>
                <h1>
                  {format(selected, { weekday: "long" })}
                  <span className="heading-dot">.</span>
                </h1>
                <p className="full-date">
                  {format(selected, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div className="day-controls">
                <button
                  aria-label="Previous day"
                  onClick={() => {
                    const d = parseDay(selected);
                    d.setDate(d.getDate() - 1);
                    openDay(dayKey(d));
                  }}
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  aria-label="Next day"
                  disabled={selected >= today}
                  onClick={() => {
                    const d = parseDay(selected);
                    d.setDate(d.getDate() + 1);
                    openDay(dayKey(d));
                  }}
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
            <div className="writing-toolbar">
              {selected !== today && (
                <button className="today-link" onClick={() => openDay(today)}>
                  Back to today
                </button>
              )}
              <div
                className="writing-size"
                role="group"
                aria-label="Writing text size"
              >
                <button
                  aria-label="Smaller writing text"
                  disabled={writingSize <= 16}
                  onClick={() => resizeWriting(writingSize - 2)}
                >
                  A−
                </button>
                <span>{writingSize}px</span>
                <button
                  aria-label="Larger writing text"
                  disabled={writingSize >= 22}
                  onClick={() => resizeWriting(writingSize + 2)}
                >
                  A+
                </button>
              </div>
            </div>
            <div className="document-mode" aria-label="Document view">
              <button aria-pressed={!reading} onClick={() => setReading(false)}>
                <Feather size={16} />
                Write {!reading && <Check size={14} />}
              </button>
              <button aria-pressed={reading} onClick={() => setReading(true)}>
                <BookOpen size={16} />
                Book {reading && <Check size={14} />}
              </button>
              <span>
                {reading
                  ? "One day, page by page"
                  : "Words and pictures, together"}
              </span>
            </div>
            {reading ? (
              <BookView
                key={selected}
                entry={entry}
                size={writingSize}
                onEdit={() => setReading(false)}
                onChange={update}
                disabled={undoBusy || adding}
              />
            ) : (
              <div className="paper">
                <div className="paper-top">
                  <span className="paper-label">
                    <span className="orange-dash" />
                    YOUR WAFFLES
                  </span>
                  <Feather size={19} />
                </div>
                <DocumentEditor
                  entry={entry}
                  size={writingSize}
                  disabled={undoBusy || adding}
                  onChange={update}
                />
                <div className="paper-footer">
                  <div className="editor-tools">
                    <button
                      className="attach-button"
                      disabled={adding || undoBusy}
                      onClick={() => {
                        fileInput.current?.click();
                      }}
                    >
                      <ImagePlus size={19} />
                      {adding ? "Opening photos…" : "Add photos"}
                    </button>
                    <button
                      className="attach-button"
                      disabled={adding || undoBusy}
                      onClick={() => setDictationDay(selected)}
                    >
                      <Mic size={18} />
                      Dictate
                    </button>
                    <button
                      className="attach-button"
                      disabled={adding || undoBusy || !entry.text.trim()}
                      onClick={() => setAiSource(entry)}
                    >
                      ✧ Polish with AI
                    </button>
                  </div>
                  <span>
                    {words} {words === 1 ? "word" : "words"}
                    <span className="footer-dot">·</span>
                    {entry.photos.length}{" "}
                    {entry.photos.length === 1 ? "photo" : "photos"}
                  </span>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  hidden
                  onChange={(e) => void addPhotos(e.target.files)}
                />
                {photoError && (
                  <p className="photo-error" role="alert">
                    {photoError}
                  </p>
                )}
              </div>
            )}
            {!!entry.revisions?.length && (
              <details className="version-history">
                <summary>
                  Before AI editing · {entry.revisions.length} saved{" "}
                  {entry.revisions.length === 1 ? "version" : "versions"}
                </summary>
                {[...entry.revisions].reverse().map((revision: Revision) => (
                  <div key={revision.id}>
                    <p>{new Date(revision.at).toLocaleString()}</p>
                    <pre>{revision.text}</pre>
                    <button
                      className="secondary"
                      disabled={undoBusy}
                      onClick={() => {
                        if (
                          !window.confirm(
                            "Restore this version? Your current text will also be kept in version history.",
                          )
                        )
                          return;
                        const current = entriesRef.current[selected];
                        const restored = revision.blocks.filter(
                          (b) =>
                            b.type !== "photo" ||
                            current.photos.some((p) => p.id === b.photoId),
                        );
                        const used = new Set(
                          restored
                            .filter((b) => b.type === "photo")
                            .map((b) => b.photoId),
                        );
                        restored.push(
                          ...current.photos
                            .filter((p) => !used.has(p.id))
                            .map((p) => ({
                              id: `photo-${p.id}`,
                              type: "photo" as const,
                              photoId: p.id,
                            })),
                        );
                        update({
                          ...applyDraft(current, revision.text),
                          blocks: restored,
                        });
                      }}
                    >
                      Restore this version
                    </button>
                  </div>
                ))}
              </details>
            )}
            <div className="below-paper">
              <span>No perfect words needed. Just waffle.</span>
              {hasContent(entry) && (
                <button
                  className="delete-day"
                  disabled={adding || undoBusy}
                  onClick={() => setDeleteDay(selected)}
                >
                  <Trash2 size={14} />
                  Delete day
                </button>
              )}
              <button onClick={() => setInfo(!info)}>
                Stored on this device <ArrowUpRight size={14} />
              </button>
            </div>
          </section>
        ) : (
          <section className="days-view">
            <div className="eyebrow">
              YOUR NOTEBOOK <span className="little-line" />
            </div>
            <h1>
              Days worth keeping<span className="heading-dot">.</span>
            </h1>
            <p className="full-date">
              {savedDays.length === 0
                ? "It begins with a single day."
                : `${savedDays.length} ${savedDays.length === 1 ? "day" : "days"}, in your own words.`}
            </p>
            <div className="history-layout">
              <section className="calendar" aria-label="Choose a day">
                <div className="calendar-header">
                  <button
                    aria-label="Previous month"
                    onClick={() =>
                      setMonth(
                        new Date(month.getFullYear(), month.getMonth() - 1, 1),
                      )
                    }
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <strong>
                    {month.toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}
                  </strong>
                  <button
                    aria-label="Next month"
                    disabled={
                      month.getFullYear() === parseDay(today).getFullYear() &&
                      month.getMonth() === parseDay(today).getMonth()
                    }
                    onClick={() =>
                      setMonth(
                        new Date(month.getFullYear(), month.getMonth() + 1, 1),
                      )
                    }
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
                <div className="calendar-grid">
                  {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                    <span key={i} className="weekday">
                      {d}
                    </span>
                  ))}
                  {Array.from({ length: offset }, (_, i) => (
                    <span key={`blank${i}`} />
                  ))}
                  {Array.from({ length: count }, (_, i) => {
                    const key = dayKey(
                      new Date(month.getFullYear(), month.getMonth(), i + 1),
                    );
                    return (
                      <button
                        key={key}
                        aria-label={`${format(key, { month: "long", day: "numeric", year: "numeric" })}${entries[key] && hasContent(entries[key]) ? ", has entry" : ""}`}
                        className={`${key === today ? "today " : ""}${entries[key] && hasContent(entries[key]) ? "has-entry" : ""}`}
                        disabled={key > today}
                        onClick={() => openDay(key)}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
                <p className="calendar-key">
                  <span /> A day you’ve kept
                </p>
              </section>
              <div className="entry-list">
                {savedDays.length === 0 ? (
                  <div className="empty">
                    <BookOpen size={30} />
                    <h2>Waffle away</h2>
                    <p>
                      A thought, a small moment, a photo.
                      <br />
                      Get Waffling.
                    </p>
                    <button className="primary" onClick={() => openDay(today)}>
                      Write about today <Feather size={16} />
                    </button>
                  </div>
                ) : (
                  savedDays.map((e) => (
                    <button
                      key={e.date}
                      className="entry-card"
                      onClick={() => openDay(e.date)}
                    >
                      <div className="entry-date">
                        <strong>{format(e.date, { day: "2-digit" })}</strong>
                        <span>{format(e.date, { month: "short" })}</span>
                      </div>
                      <div>
                        <h2>
                          {format(e.date, { weekday: "long" })}
                          {e.date === today && (
                            <span className="today-badge">Today</span>
                          )}
                        </h2>
                        <p>{e.text.trim() || "A day in photographs"}</p>
                        <span className="entry-meta">
                          {e.photos.length > 0
                            ? `${e.photos.length} ${e.photos.length === 1 ? "photo" : "photos"} · `
                            : ""}
                          {format(e.date, { year: "numeric" })}
                        </span>
                      </div>
                      <ChevronRight size={18} />
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>
        )}
        <footer className="main-footer">
          <span>WAFFLE</span>
          <span>One waffle at a time.</span>
        </footer>
      </main>
      <nav className="mobile-nav" aria-label="Mobile journal">
        <button
          className={view === "write" ? "selected" : ""}
          onClick={() => openDay(today)}
        >
          <Feather size={20} />
          Today
        </button>
        <button
          className={view === "days" ? "selected" : ""}
          onClick={() => setView("days")}
        >
          <CalendarDays size={20} />
          Your days
        </button>
        <button
          className={view === "keep" ? "selected" : ""}
          onClick={() => setView("keep")}
        >
          <Download size={20} />
          Export & backup
        </button>
        <button
          className={view === "diary" ? "selected" : ""}
          onClick={() => setView("diary")}
        >
          <BookOpen size={20} />
          Whole diary
        </button>
      </nav>
    </div>
  );
}
