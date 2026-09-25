import test from "node:test";
import assert from "node:assert/strict";
import { diaryStart, adjacentDay, dayNumber } from "../lib/document/diary";
import { newEntry } from "../lib/storage/types";
test("whole diary starts at first kept entry and includes unwritten days through today", () => {
  const entries = {
    "2026-09-22": { ...newEntry("2026-09-22"), text: "First" },
    "2026-09-25": { ...newEntry("2026-09-25"), text: "Today" },
  };
  assert.equal(diaryStart(entries, "2026-09-25"), "2026-09-22");
  assert.equal(dayNumber("2026-09-22", "2026-09-25"), 4);
  assert.equal(adjacentDay("2026-09-22", 1), "2026-09-23");
  assert.equal(adjacentDay("2026-09-25", -1), "2026-09-24");
  assert.equal(Object.keys(entries).length, 2);
});
test("day navigation handles leap days, year rollover and daylight-saving dates", () => {
  assert.equal(adjacentDay("2024-02-28", 1), "2024-02-29");
  assert.equal(adjacentDay("2024-03-01", -1), "2024-02-29");
  assert.equal(adjacentDay("2025-12-31", 1), "2026-01-01");
  assert.equal(dayNumber("2026-09-26", "2026-09-28"), 3);
  assert.equal(diaryStart({}, "2026-09-25"), "2026-09-25");
});
