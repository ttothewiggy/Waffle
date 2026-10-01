import type { CSSProperties } from "react";
import {
  defaultAppearance,
  fonts,
  papers,
  type Appearance,
} from "@/lib/document/rich";
export function pageStyle(appearance?: Appearance): CSSProperties {
  const a = appearance || defaultAppearance;
  return {
    "--page-paper": papers[a.paper].paper,
    "--page-ink": papers[a.paper].ink,
    "--journal-font": fonts[a.font],
  } as CSSProperties;
}
export function DateHeading({
  date,
  appearance,
}: {
  date: string;
  appearance?: Appearance;
}) {
  const a = appearance || defaultAppearance;
  if (!a.showDate) return null;
  const day = new Date(`${date}T12:00:00`);
  const number = day.getDate();
  const suffix =
    number >= 11 && number <= 13
      ? "th"
      : { 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th";
  return (
    <div className={`page-date ${a.dateUnderline ? "date-underlined" : ""}`}>
      <span>{day.getFullYear()}</span>
      <h2>
        {day.toLocaleDateString("en-NZ", { weekday: "long" })}
        <br />
        <small>
          {number}
          {suffix} of {day.toLocaleDateString("en-NZ", { month: "long" })}
        </small>
      </h2>
    </div>
  );
}
