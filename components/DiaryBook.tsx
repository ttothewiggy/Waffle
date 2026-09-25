"use client";
import { useState } from "react";
import { Entry, newEntry } from "@/lib/storage/types";
import { adjacentDay, dayNumber, diaryStart } from "@/lib/document/diary";
import BookView from "./BookView";
export default function DiaryBook({
  entries,
  today,
  size,
  onChange,
  onEdit,
  disabled,
}: {
  entries: Record<string, Entry>;
  today: string;
  size: number;
  onChange: (patch: Partial<Entry>, date: string) => void;
  onEdit: (date: string) => void;
  disabled: boolean;
}) {
  const first = diaryStart(entries, today);
  const [cursor, setCursor] = useState({ date: first, last: false });
  const date =
    cursor.date < first ? first : cursor.date > today ? today : cursor.date;
  const entry = entries[date] || newEntry(date);
  const turn = (direction: number) =>
    setCursor({ date: adjacentDay(date, direction), last: direction < 0 });
  return (
    <section className="writing-view diary-view">
      <div className="eyebrow">YOUR WHOLE DIARY</div>
      <h1>
        Every day belongs<span className="heading-dot">.</span>
      </h1>
      <p className="full-date">
        {first} — {today} · Day {dayNumber(first, date)} of{" "}
        {dayNumber(first, today)}
      </p>
      <p className="diary-explanation">
        Blank days stay in the book. Turn the pages to carry on through your
        diary.
      </p>
      <BookView
        key={date}
        entry={entry}
        size={size}
        disabled={disabled}
        onChange={(patch) => onChange(patch, date)}
        onEdit={() => onEdit(date)}
        initialLastPage={cursor.last}
        previousEntry={date > first ? () => turn(-1) : undefined}
        nextEntry={date < today ? () => turn(1) : undefined}
        diary
      />
    </section>
  );
}
