import { Entry, hasContent, newEntry } from "../storage/types";
export interface PdfOptions {
  from: string;
  to: string;
  size: "A5" | "A4";
  title: string;
  subtitle: string;
  cover: boolean;
  blankDays: boolean;
  photos: boolean;
  colours: boolean;
  font: "entry" | "serif" | "sans" | "handwritten";
  textSize: number;
}
export const pageSizes = {
  A5: { width: 419.5276, height: 595.2756 },
  A4: { width: 595.2756, height: 841.8898 },
};
export function validDay(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function dayCount(from: string, to: string) {
  return (
    Math.round(
      (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
        86400000,
    ) + 1
  );
}
export function selectPdfEntries(
  entries: Entry[],
  options: PdfOptions,
): Entry[] {
  if (
    !validDay(options.from) ||
    !validDay(options.to) ||
    options.from > options.to
  )
    throw new Error("Choose a valid start and end date.");
  if (
    !Object.hasOwn(pageSizes, options.size) ||
    ![9, 10, 11, 12, 14, 16].includes(options.textSize)
  )
    throw new Error("Choose a supported paper and text size.");
  if (
    !options.title.trim() ||
    options.title.length > 100 ||
    options.subtitle.length > 180
  )
    throw new Error(
      "Give your book a title of up to 100 characters and a subtitle of up to 180.",
    );
  const written = entries
    .filter(
      (e) => e.date >= options.from && e.date <= options.to && hasContent(e),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  let days = written;
  if (options.blankDays) {
    if (dayCount(options.from, options.to) > 366)
      throw new Error(
        "Include up to one year of blank days at a time. Choose a shorter date range.",
      );
    const byDay = new Map(written.map((e) => [e.date, e]));
    days = Array.from(
      { length: dayCount(options.from, options.to) },
      (_, i) => {
        const date = new Date(
          Date.parse(`${options.from}T12:00:00Z`) + i * 86400000,
        )
          .toISOString()
          .slice(0, 10);
        return byDay.get(date) || newEntry(date);
      },
    );
  }
  if (!days.length)
    throw new Error(
      "There are no written entries in this range. Choose different dates or include unwritten days.",
    );
  if (days.length > 366)
    throw new Error(
      "Export up to 366 entries at a time. Choose a shorter range.",
    );
  if (days.reduce((n, e) => n + e.text.length, 0) > 500000)
    throw new Error(
      "This edition is too large to prepare comfortably on a phone. Try a month or a shorter range.",
    );
  const photos = options.photos ? days.flatMap((e) => e.photos) : [];
  if (
    photos.length > 200 ||
    photos.reduce((n, p) => n + p.blob.size, 0) > 150 * 1024 * 1024
  )
    throw new Error(
      "Try a shorter range or turn off photos. This export supports up to 200 photos and 150 MB of source images.",
    );
  return days;
}
export function pdfDate(
  date: string,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "long",
    year: "numeric",
  },
) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-NZ", {
    ...options,
    timeZone: "UTC",
  });
}
export function pdfFilename(options: PdfOptions) {
  return `waffle-${options.from}-to-${options.to}-${options.size.toLowerCase()}.pdf`;
}
