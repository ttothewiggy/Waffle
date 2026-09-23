"use client";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
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
const parseDay = (key: string) => new Date(`${key}T12:00:00`);
const format = (key: string, options: Intl.DateTimeFormatOptions) =>
  parseDay(key).toLocaleDateString(undefined, options);
function PhotoCard({ photo, remove }: { photo: Photo; remove: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(photo.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo.blob]);
  return (
    <figure>
      {url && <img src={url} alt={photo.name} />}
      <button
        className="remove"
        onClick={remove}
        aria-label={`Remove ${photo.name}`}
      >
        <X size={16} />
      </button>
      <figcaption>{photo.name}</figcaption>
    </figure>
  );
}
export default function Journal() {
  const [today, setToday] = useState("");
  const [selected, setSelected] = useState("");
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<"write" | "days">("write");
  const [month, setMonth] = useState(new Date());
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [adding, setAdding] = useState(false);
  const [offline, setOffline] = useState(false);
  const [info, setInfo] = useState(false);
  const entriesRef = useRef<Record<string, Entry>>({});
  const pending = useRef(new Map<string, Entry>());
  const serial = useRef(Promise.resolve());
  const sequence = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  async function load() {
    setError("");
    try {
      const rows = await journalRepository.list();
      const map = Object.fromEntries(rows.map((e) => [e.date, e]));
      entriesRef.current = map;
      setEntries(map);
      setReady(true);
      setStatus("Saved on this device");
    } catch {
      setError(
        "Your journal could not be opened. Allow browser storage, then retry.",
      );
    }
  }
  useEffect(() => {
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
          if (seq === sequence.current) {
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
  function update(patch: Partial<Entry>, date = selected) {
    const entry = {
      ...(entriesRef.current[date] || newEntry(date)),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    const map = { ...entriesRef.current, [date]: entry };
    entriesRef.current = map;
    setEntries(map);
    persist(entry);
  }
  function openDay(date: string) {
    setSelected(date);
    setView("write");
    setPhotoError("");
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
      update(
        { photos: [...(entriesRef.current[date]?.photos || []), ...photos] },
        date,
      );
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
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Daybook home">
          <span className="brand-icon">
            <BookOpen size={23} />
          </span>
          daybook<span className="brand-dot">.</span>
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
        </nav>
        <div className="sidebar-bottom">
          <div className="small-mark">d.</div>
          <p>
            A little space
            <br />
            <em>for your everyday.</em>
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
            {view === "write" ? "A DAY AT A TIME" : "THE DAYS COLLECTED"}
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
              them. Use this early version for memories you also keep elsewhere.
            </p>
            <p>
              On Android, open the published link in Chrome and choose “Add to
              Home screen” or “Install app” when offered.
            </p>
            <button onClick={() => setInfo(false)}>Got it</button>
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
        {!ready ? (
          <div className="loading">
            <BookOpen />
            <p>
              {error ? "Your journal is waiting." : "Opening your notebook…"}
            </p>
          </div>
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
            <div className="paper">
              <div className="paper-top">
                <span className="paper-label">
                  <span className="orange-dash" />
                  THE EVERYDAY, REMEMBERED
                </span>
                <Feather size={19} />
              </div>
              <label className="sr-only" htmlFor="entry">
                Journal entry for {selected}
              </label>
              <textarea
                id="entry"
                placeholder="What would you like to remember about today?"
                value={entry.text}
                onChange={(e) => update({ text: e.target.value })}
                spellCheck
              />
              <div className="photos">
                {entry.photos.map((photo) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    remove={() =>
                      update({
                        photos: entry.photos.filter((p) => p.id !== photo.id),
                      })
                    }
                  />
                ))}
              </div>
              <div className="paper-footer">
                <button
                  className="attach-button"
                  disabled={adding}
                  onClick={() => fileInput.current?.click()}
                >
                  <ImagePlus size={19} />
                  {adding ? "Opening photos…" : "Add photos"}
                </button>
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
            <div className="below-paper">
              <span>No perfect words needed. Just yours.</span>
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
                    <h2>Your story starts here.</h2>
                    <p>
                      A thought, a small moment, a photo.
                      <br />
                      There’s no wrong place to begin.
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
          <span>DAYBOOK</span>
          <span>One day at a time.</span>
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
        <button onClick={() => setInfo(!info)}>
          <BookOpen size={20} />
          Your journal
        </button>
      </nav>
    </div>
  );
}
