"use client";
import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Entry, dayKey, hasContent, newEntry } from "@/lib/storage/types";
import { JournalPhoto } from "./DocumentEditor";
const dateOf = (date: string) => new Date(`${date}T12:00:00`);
const label = (date: string, options: Intl.DateTimeFormatOptions) =>
  dateOf(date).toLocaleDateString(undefined, options);
export default function JournalOverview({
  entries,
  today,
  openDay,
}: {
  entries: Record<string, Entry>;
  today: string;
  openDay: (date: string) => void;
}) {
  const [calendar, setCalendar] = useState(false),
    [month, setMonth] = useState(() => dateOf(today));
  const rows = Object.values(entries).filter(
    (e) => hasContent(e) && e.date !== today,
  );
  rows.push(entries[today] || newEntry(today));
  rows.sort((a, b) => b.date.localeCompare(a.date));
  const groups = new Map<string, Entry[]>();
  for (const entry of rows) {
    const key = entry.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) || []), entry]);
  }
  const offset =
    (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return (
    <section className="journal-overview" aria-label="Journal overview">
      <div className="overview-heading">
        <h1>Your journal</h1>
        <button
          className="calendar-toggle"
          aria-expanded={calendar}
          aria-controls="overview-calendar"
          aria-label="Choose a day from the calendar"
          onClick={() => setCalendar(!calendar)}
        >
          <CalendarDays size={21} />
        </button>
      </div>
      <button className="today-action" onClick={() => openDay(today)}>
        <Plus size={18} />
        {entries[today] && hasContent(entries[today])
          ? "Open today"
          : "Write today"}
        <span>{label(today, { day: "numeric", month: "short" })}</span>
      </button>
      {calendar && (
        <section
          id="overview-calendar"
          className="overview-calendar"
          aria-label="Calendar"
        >
          <div className="calendar-heading">
            <button
              aria-label="Previous month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
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
                month.getFullYear() === dateOf(today).getFullYear() &&
                month.getMonth() === dateOf(today).getMonth()
              }
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="overview-calendar-grid">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = dayKey(
                  new Date(month.getFullYear(), month.getMonth(), i + 1),
                ),
                written = !!entries[date] && hasContent(entries[date]);
              return (
                <button
                  key={date}
                  disabled={date > today}
                  className={`${date === today ? "is-today " : ""}${written ? "is-written" : ""}`}
                  aria-label={`${label(date, { day: "numeric", month: "long", year: "numeric" })}${written ? ", has entry" : ""}`}
                  onClick={() => openDay(date)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </section>
      )}
      {[...groups].map(([month, days]) => (
        <section className="journal-month" key={month}>
          <h2>{label(`${month}-01`, { month: "long", year: "numeric" })}</h2>
          {days.map((entry) => (
            <button
              className="journal-day"
              key={entry.date}
              onClick={() => openDay(entry.date)}
              aria-label={`Open ${label(entry.date, { day: "numeric", month: "long", year: "numeric" })}`}
            >
              <span className="day-number">
                {label(entry.date, { day: "2-digit" })}
              </span>
              <span className="day-summary">
                <span className="day-name">
                  {label(entry.date, { weekday: "long" })}
                  {entry.date === today && <small>Today</small>}
                </span>
                <span className="day-preview">
                  {(entry.text.trim().length > 180
                    ? entry.text.trim().slice(0, 180) + "…"
                    : entry.text.trim()) ||
                    (entry.photos.length
                      ? "A day in photographs."
                      : "No entry yet.")}
                </span>
                {!!entry.photos.length && (
                  <span className="day-thumbnails">
                    {entry.photos.slice(0, 3).map((photo) => (
                      <JournalPhoto key={photo.id} photo={photo} />
                    ))}
                    {entry.photos.length > 3 && (
                      <span>+{entry.photos.length - 3}</span>
                    )}
                  </span>
                )}
              </span>
            </button>
          ))}
        </section>
      ))}
    </section>
  );
}
