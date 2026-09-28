import { dayKey } from "../storage/types";
export type JournalView = "days" | "write" | "keep" | "settings" | "diary";
export function readLocation(
  hash: string,
  today: string,
): { view: JournalView; date?: string } {
  const date = hash.match(/^#entry=(\d{4}-\d{2}-\d{2})$/)?.[1];
  if (
    date &&
    Number.isFinite(new Date(`${date}T12:00:00`).getTime()) &&
    dayKey(new Date(`${date}T12:00:00`)) === date &&
    date <= today
  )
    return { view: "write", date };
  return {
    view:
      hash === "#export"
        ? "keep"
        : hash === "#settings"
          ? "settings"
          : hash === "#diary"
            ? "diary"
            : "days",
  };
}
export function locationFor(view: JournalView, date?: string) {
  return view === "write"
    ? `#entry=${date}`
    : view === "keep"
      ? "#export"
      : view === "settings"
        ? "#settings"
        : view === "diary"
          ? "#diary"
          : "#journal";
}
