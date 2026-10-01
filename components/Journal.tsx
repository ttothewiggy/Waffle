"use client";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Download,
  Settings,
  ArrowLeft,
  MoreVertical,
  ImagePlus,
  Mic,
  Undo2,
  Feather,
  Check,
  CloudOff,
  LoaderCircle,
} from "lucide-react";
import { useJournalAccount, AccountSettings } from "./CloudAccount";
import {
  dayKey,
  newEntry,
  hasContent,
  type Entry,
  type Photo,
} from "@/lib/storage/types";
import WaffleIcon from "./WaffleIcon";
import AppUpdateNotice from "./AppUpdateNotice";
import { READING_SIZES } from "@/lib/preferences/reading";
import JournalOverview from "./JournalOverview";
import EntryOptions from "./EntryOptions";
import VersionHistory from "./VersionHistory";
import {
  readLocation,
  locationFor,
  type JournalView,
} from "@/lib/navigation/location";
import ExportLibrary from "./ExportLibrary";
import DeleteEntryDialog from "./DeleteEntryDialog";
import DocumentEditor from "./DocumentEditor";
import { orderedPhotos } from "@/lib/document/simple";
import BookView from "./BookView";
import DiaryBook from "./DiaryBook";
import AiDialog from "./AiDialog";
import { applyDraft } from "@/lib/document/blocks";
import { appendText, fromText } from "@/lib/document/rich";
import { pageStyle } from "./PageStyle";
import BackupDialog from "./BackupDialog";
import DictationDialog from "./DictationDialog";
const parseDay = (key: string) => new Date(`${key}T12:00:00`);
const format = (key: string, options: Intl.DateTimeFormatOptions) =>
  parseDay(key).toLocaleDateString(undefined, options);
export default function Journal() {
  const {
    repository: journalRepository,
    revision,
    account,
    engine,
  } = useJournalAccount();
  const [reading, setReading] = useState(false);
  const [aiSource, setAiSource] = useState<Entry | null>(null);
  const [today, setToday] = useState("");
  const [selected, setSelected] = useState("");
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<JournalView>("days");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const overviewScroll = useRef(0);
  const openedFromOverview = useRef(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [adding, setAdding] = useState(false);
  const [offline, setOffline] = useState(false);
  const [writingSize, setWritingSize] = useState(16);
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
  const openDictation = () => setDictationDay(selected);
  async function load() {
    setError("");
    try {
      const before = sequence.current;
      const rows = await journalRepository.list();
      if (before !== sequence.current || pending.current.size) return;
      const map = Object.fromEntries(
        rows.map((e) => [e.date, { ...e, photos: orderedPhotos(e) }]),
      );
      entriesRef.current = map;
      setEntries(map);
      setReady(true);
      setLastDeleted(null);
      setStatus("");
    } catch {
      setError(
        "Your journal could not be opened. Allow browser storage, then retry.",
      );
    }
  }
  useEffect(() => {
    void flush()
      .then(load)
      .catch(() => {});
  }, [revision]);
  useEffect(() => {
    try {
      const size = Number(localStorage.getItem("waffle-reader-size"));
      if (READING_SIZES.includes(size)) setWritingSize(size);
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
  useEffect(() => {
    const sync = () => {
      const route = readLocation(window.location.hash, dayKey());
      if (route.date) setSelected(route.date);
      setView(route.view);
      setOptionsOpen(false);
      setVersionsOpen(false);
      setPhotoError("");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    window.scrollTo(0, view === "days" ? overviewScroll.current : 0);
  }, [view, selected]);
  useEffect(() => {
    if (status !== "Saved on this device") return;
    const timeout = window.setTimeout(() => setStatus(""), 2000);
    return () => clearTimeout(timeout);
  }, [status]);
  function navigate(next: JournalView, date?: string) {
    const hash = locationFor(next, date);
    if (window.location.hash === hash) {
      setView(next);
      if (date) setSelected(date);
    } else window.location.hash = hash;
  }
  function backToJournal() {
    if (openedFromOverview.current) {
      openedFromOverview.current = false;
      window.history.back();
    } else navigate("days");
  }
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
      ...(patch.text !== undefined && patch.richText === undefined
        ? { richText: fromText(patch.text) }
        : {}),
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
    if (view === "days") overviewScroll.current = window.scrollY;
    openedFromOverview.current = view === "days";
    setReading(false);
    navigate("write", date);
  }
  function resizeWriting(size: number) {
    setWritingSize(size);
    try {
      localStorage.setItem("waffle-reader-size", String(size));
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
  return (
    <div
      className={`journal-app ${view === "write" ? "entry-screen" : "overview-screen"}`}
    >
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
            if (
              current.text !== aiSource.text ||
              JSON.stringify(current.richText) !==
                JSON.stringify(aiSource.richText)
            )
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
            update(appendText(current, text), dictationDay);
          }}
        />
      )}
      {optionsOpen && (
        <EntryOptions
          close={() => setOptionsOpen(false)}
          photo={() => fileInput.current?.click()}
          dictate={openDictation}
          polish={() => setAiSource(entry)}
          history={() => setVersionsOpen(true)}
          remove={() => setDeleteDay(selected)}
          reading={reading}
          toggleReading={() => setReading(!reading)}
          canPolish={!!entry.text.trim()}
          canDelete={hasContent(entry)}
          hasHistory={!!entry.revisions?.length}
          disabled={adding || undoBusy}
          size={writingSize}
          setSize={resizeWriting}
          appearance={entry.appearance}
          setAppearance={(appearance) => update({ appearance })}
        />
      )}
      {versionsOpen && (
        <VersionHistory
          revisions={entry.revisions || []}
          close={() => setVersionsOpen(false)}
          restore={(version) =>
            update({
              ...applyDraft(
                entriesRef.current[selected] || newEntry(selected),
                version.text,
              ),
              richText: version.richText || fromText(version.text),
            })
          }
        />
      )}
      {view === "write" ? (
        <header className="entry-header">
          <button aria-label="Back to journal" onClick={backToJournal}>
            <ArrowLeft size={22} />
          </button>
          <h1>
            {selected
              ? format(selected, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "Journal entry"}
          </h1>
          <button
            aria-label="Entry options"
            disabled={!ready}
            onClick={() => setOptionsOpen(true)}
          >
            <MoreVertical size={22} />
          </button>
          {status && (
            <span className="entry-save-status" role="status">
              {status === "Saved on this device" ? "Saved" : status}
            </span>
          )}
        </header>
      ) : (
        <header className="overview-header">
          <button
            className="overview-brand"
            onClick={() => navigate("days")}
            aria-label="Waffle journal"
          >
            <WaffleIcon size={32} />
            waffle<span>.</span>
          </button>
        </header>
      )}
      <main className="journal-main">
        <AppUpdateNotice flush={flush} />
        {account && (view !== "write" || engine?.status !== "synced") && (
          <p className="cloud-status" role="status">
            {engine?.message ||
              "Saved account copy on this device — sign in through Settings to sync."}
          </p>
        )}
        {error && (
          <div className="journal-error" role="alert">
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
          <div className="undo-banner" role="status">
            Entry deleted.
            <button disabled={undoBusy} onClick={() => void undoDelete()}>
              <Undo2 size={16} />
              Undo
            </button>
          </div>
        )}
        {!ready ? (
          <p className="opening-journal">Opening your journal…</p>
        ) : view === "write" ? (
          <article className="full-entry" style={pageStyle(entry.appearance)}>
            <button
              className="page-sync"
              onClick={() => navigate("settings")}
              title={
                error ||
                (status === "Saving…"
                  ? status
                  : account
                    ? engine?.message || "Sign in through Settings to sync"
                    : "Saved on this device")
              }
              aria-label={
                error ||
                (status === "Saving…"
                  ? status
                  : account
                    ? engine?.message || "Sign in through Settings to sync"
                    : "Saved on this device")
              }
            >
              {error ||
              (account &&
                (!engine ||
                  engine.status === "error" ||
                  engine.status === "offline" ||
                  engine.status === "conflict")) ? (
                <CloudOff size={16} />
              ) : status === "Saving…" ||
                (account && engine?.status !== "synced") ? (
                <LoaderCircle size={16} />
              ) : (
                <Check size={16} />
              )}
            </button>
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
              <DocumentEditor
                photo={() => fileInput.current?.click()}
                dictate={openDictation}
                entry={entry}
                size={writingSize}
                disabled={undoBusy || adding}
                onChange={update}
              />
            )}
            {reading && (
              <div className="entry-end-tools">
                <button
                  disabled={adding || undoBusy}
                  onClick={() => fileInput.current?.click()}
                >
                  <ImagePlus size={18} />
                  <span className="sr-only">
                    {adding ? "Opening photos…" : "Add photos"}
                  </span>
                </button>
                <button disabled={adding || undoBusy} onClick={openDictation}>
                  <Mic size={18} />
                  <span className="sr-only">Dictate</span>
                </button>
              </div>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              hidden
              onChange={(e) => void addPhotos(e.target.files)}
            />
            {photoError && (
              <p className="dialog-error" role="alert">
                {photoError}
              </p>
            )}
          </article>
        ) : view === "days" ? (
          <JournalOverview entries={entries} today={today} openDay={openDay} />
        ) : view === "keep" ? (
          <ExportLibrary
            count={savedDays.length}
            photos={savedDays.reduce((n, e) => n + e.photos.length, 0)}
            backup={() => setBackupOpen(true)}
            flush={flush}
            reload={load}
          />
        ) : view === "diary" ? (
          <>
            <button className="text-back" onClick={() => navigate("days")}>
              <ArrowLeft size={18} />
              Journal
            </button>
            <DiaryBook
              entries={entries}
              today={today}
              size={writingSize}
              onChange={update}
              onEdit={openDay}
              disabled={undoBusy || adding}
            />
          </>
        ) : (
          <section className="settings-view">
            <h1>Settings</h1>
            <AccountSettings flush={flush} reload={load} />
            <section>
              <h2>Reading</h2>
              <label className="reader-size">
                Journal text size
                <select
                  value={writingSize}
                  onChange={(e) => resizeWriting(Number(e.target.value))}
                >
                  {READING_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}px{size === 16 ? " · Default" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="settings-row"
                onClick={() => navigate("diary")}
              >
                <BookOpen size={19} />
                Page through your diary
              </button>
              <p>Includes unwritten days between your first entry and today.</p>
            </section>
            <section>
              <h2>Your data</h2>
              <button className="settings-row" onClick={() => navigate("keep")}>
                <Download size={19} />
                Export, backup & restore
              </button>
              <p>
                {account
                  ? "Your account journal is saved on this device and synced when connected. Wait for the synced message before switching devices. Keep an independent backup."
                  : "Entries and photos live in this browser on this device. Sign in to set up cloud sync, or keep using Waffle locally. Keep a backup before clearing browser data."}
              </p>
              <p>
                Only recordings you choose to transcribe and text you choose to
                polish are sent to OpenAI.
              </p>
            </section>
            <section>
              <h2>On your phone</h2>
              <p>
                Open Waffle in Chrome and choose “Add to Home screen” or
                “Install app” to open it like an app.
              </p>
              {offline && (
                <p>
                  You’re offline. Writing and saved entries are still available.
                </p>
              )}
            </section>
          </section>
        )}
      </main>
      <nav className="overview-nav" aria-label="Main navigation">
        <button
          aria-current={view === "days" ? "page" : undefined}
          onClick={() => navigate("days")}
        >
          <BookOpen size={20} />
          Journal
        </button>
        <button
          aria-current={
            view === "write" && selected === today ? "page" : undefined
          }
          onClick={() => openDay(today)}
        >
          <Feather size={20} />
          Today
        </button>
        <button
          aria-current={view === "keep" ? "page" : undefined}
          onClick={() => navigate("keep")}
        >
          <Download size={20} />
          Export
        </button>
        <button
          aria-current={view === "settings" ? "page" : undefined}
          onClick={() => navigate("settings")}
        >
          <Settings size={20} />
          Settings
        </button>
      </nav>
    </div>
  );
}
