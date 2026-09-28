import test from "node:test";
import assert from "node:assert/strict";
import { readLocation, locationFor } from "../lib/navigation/location";
test("overview is the default and journal utilities have stable locations", () => {
  assert.deepEqual(readLocation("", "2026-09-28"), { view: "days" });
  for (const view of ["days", "keep", "settings", "diary"] as const)
    assert.equal(readLocation(locationFor(view), "2026-09-28").view, view);
});
test("dated entries can reopen through browser navigation; invalid and future dates return to journal", () => {
  assert.deepEqual(
    readLocation(locationFor("write", "2026-09-25"), "2026-09-28"),
    { view: "write", date: "2026-09-25" },
  );
  for (const hash of [
    "#entry=2026-02-30",
    "#entry=2026-09-29",
    "#entry=not-a-date",
    "#anything",
  ])
    assert.equal(readLocation(hash, "2026-09-28").view, "days");
});
