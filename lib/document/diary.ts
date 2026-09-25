import { Entry, hasContent } from "../storage/types";
export function diaryStart(entries: Record<string, Entry>, today: string) {
  return (
    Object.values(entries)
      .filter(hasContent)
      .map((e) => e.date)
      .filter((date) => date <= today)
      .sort()[0] || today
  );
}
export function adjacentDay(date: string, amount: number) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + amount);
  return day.toISOString().slice(0, 10);
}
export function dayNumber(start: string, date: string) {
  return (
    Math.round(
      (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) /
        86400000,
    ) + 1
  );
}
