import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { encodeBackup, decodeBackup } from "../lib/backup/format";
import { newEntry } from "../lib/storage/types";
import { IndexedDBRepository } from "../lib/storage/indexed-db";
const make = (date: string, text: string) => ({ ...newEntry(date), text });
test("backup round trip preserves Unicode text, dates and binary photo bytes", async () => {
  const entry = make("2026-09-23", "A waffle 🧇\nKia ora");
  const bytes = new Uint8Array([0, 255, 10, 13, 128]);
  entry.photos = [
    {
      id: "one",
      name: "café.png",
      type: "image/png",
      blob: new Blob([bytes], { type: "image/png" }),
    },
  ];
  const restored = await decodeBackup(
    await encodeBackup([entry, newEntry("2026-09-22")]),
  );
  assert.equal(restored.length, 1);
  assert.equal(restored[0].text, entry.text);
  assert.equal(restored[0].createdAt, entry.createdAt);
  assert.deepEqual(
    new Uint8Array(await restored[0].photos[0].blob.arrayBuffer()),
    bytes,
  );
});
test("reject malformed JSON, unsupported versions, duplicate dates, impossible dates and damaged photos", async () => {
  await assert.rejects(decodeBackup(new Blob(["bad"])));
  const valid = JSON.parse(
    await (await encodeBackup([make("2026-09-23", "Hi")])).text(),
  );
  for (const mutate of [
    (x: any) => (x.version = 8),
    (x: any) => x.entries.push(x.entries[0]),
    (x: any) => (x.entries[0].date = "2026-02-30"),
    (x: any) =>
      (x.entries[0].photos = [
        { id: "x", type: "image/png", name: "x", data: "!!!!" },
      ]),
  ]) {
    const input = structuredClone(valid);
    mutate(input);
    await assert.rejects(decodeBackup(new Blob([JSON.stringify(input)])));
  }
});
test("restore defaults to preserving existing days; explicit replace changes only matching days", async () => {
  const repo = new IndexedDBRepository(crypto.randomUUID());
  await repo.save(make("2026-09-23", "Original"));
  await repo.save(make("2026-09-20", "Unrelated"));
  const rows = [make("2026-09-23", "Backup"), make("2026-09-22", "New")];
  assert.deepEqual(await repo.restore(rows, false), {
    imported: 1,
    skipped: 1,
  });
  assert.equal(
    (await repo.list()).find((e) => e.date === "2026-09-23")?.text,
    "Original",
  );
  await repo.restore(rows, true);
  const saved = await repo.list();
  assert.equal(saved.length, 3);
  assert.equal(saved.find((e) => e.date === "2026-09-23")?.text, "Backup");
  assert.equal(saved.find((e) => e.date === "2026-09-20")?.text, "Unrelated");
});
test("restore rolls back every write if any record cannot be stored", async () => {
  const repo = new IndexedDBRepository(crypto.randomUUID());
  await repo.save(make("2026-09-23", "Original"));
  const invalid = { ...make("2026-09-22", "bad"), uncloneable: () => {} };
  await assert.rejects(
    repo.restore([make("2026-09-23", "Replacement"), invalid], true),
  );
  const rows = await repo.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, "Original");
});
