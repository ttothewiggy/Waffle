import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { IndexedDBRepository } from "../lib/storage/indexed-db";
import { dayKey, newEntry, hasContent } from "../lib/storage/types";
test("local dates do not shift across UTC day boundaries", () => {
  assert.equal(dayKey(new Date(2026, 8, 23, 0, 2)), "2026-09-23");
});
test("text and photo survive reopening and edits replace one daily entry", async () => {
  const name = `test-${Date.now()}`;
  const first = new IndexedDBRepository(name);
  const entry = newEntry("2026-09-23");
  entry.text = "A good little day";
  entry.photos = [
    {
      id: "p1",
      name: "memory.png",
      type: "image/png",
      blob: new Blob(["photo"], { type: "image/png" }),
    },
  ];
  await first.save(entry);
  const reopened = new IndexedDBRepository(name);
  let rows = await reopened.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, entry.text);
  assert.equal(await rows[0].photos[0].blob.text(), "photo");
  await reopened.save({ ...rows[0], text: "Edited", photos: [] });
  rows = await first.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, "Edited");
  assert.equal(rows[0].photos.length, 0);
  await first.save({ ...newEntry("2026-09-22"), text: "Yesterday" });
  assert.equal((await reopened.list()).length, 2);
});
test("empty days stay out of history; photos alone count", () => {
  const e = newEntry("2026-09-23");
  assert.equal(hasContent(e), false);
  e.text = "  ";
  assert.equal(hasContent(e), false);
  e.photos = [{ id: "p", name: "p", type: "image/png", blob: new Blob() }];
  assert.equal(hasContent(e), true);
});
