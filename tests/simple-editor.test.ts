import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { editPage, orderedPhotos } from "../lib/document/simple";
import { newEntry, Entry } from "../lib/storage/types";
import { encodeBackup, decodeBackup } from "../lib/backup/format";
import { IndexedDBRepository } from "../lib/storage/indexed-db";
test("editing one book page keeps neighbours and exact whitespace, including empty and Unicode edits", () => {
  const pages = ["First.\n\n", "Second 🌅 page. ", "Last."];
  assert.equal(editPage(pages, 1, "Changed.\n"), "First.\n\nChanged.\nLast.");
  assert.equal(editPage(pages, 1, ""), "First.\n\nLast.");
  assert.equal(editPage([""], 0, "New words."), "New words.");
  assert.deepEqual(pages, ["First.\n\n", "Second 🌅 page. ", "Last."]);
});
test("retiring inline placement preserves photo order without dropping unmatched photos", () => {
  const photos = ["a", "b", "c"].map((id) => ({
    id,
    name: id,
    type: "image/png",
    blob: new Blob(["photo"]),
  }));
  const entry: Entry = {
    ...newEntry("2026-09-25"),
    text: "Original",
    photos,
    blocks: [
      { id: "body", type: "text", text: "Original" },
      { id: "pb", type: "photo", photoId: "b" },
      { id: "pa", type: "photo", photoId: "a" },
    ],
  };
  assert.deepEqual(
    orderedPhotos(entry).map((p) => p.id),
    ["b", "a", "c"],
  );
  assert.equal(entry.text, "Original");
});
test("captions and edited book text survive reopening and a backup restore", async () => {
  const entry = {
    ...newEntry("2026-09-25"),
    text: "Edited on the page.\n\nStill here.",
    photos: [
      {
        id: "a",
        name: "a.png",
        type: "image/png",
        caption: "Breakfast by the fire 🧇",
        blob: new Blob(["photo"], { type: "image/png" }),
      },
    ],
  };
  const name = `captions-${crypto.randomUUID()}`;
  await new IndexedDBRepository(name).save(entry);
  const [stored] = await new IndexedDBRepository(name).list();
  const [restored] = await decodeBackup(await encodeBackup([stored]));
  assert.equal(restored.text, entry.text);
  assert.equal(restored.photos[0].caption, entry.photos[0].caption);
  assert.equal(await restored.photos[0].blob.text(), "photo");
  const raw = JSON.parse(await (await encodeBackup([entry])).text());
  raw.entries[0].photos[0].caption = "x".repeat(501);
  await assert.rejects(
    decodeBackup(new Blob([JSON.stringify(raw)])),
    /invalid text/,
  );
});
