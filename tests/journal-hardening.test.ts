import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { IndexedDBRepository } from "../lib/storage/indexed-db";
import { newEntry, type Photo } from "../lib/storage/types";
import { movePhoto } from "../lib/storage/photo-order";
const photo = (id: string): Photo => ({
  id,
  name: id + ".png",
  type: "image/png",
  blob: new Blob([id], { type: "image/png" }),
});
test("schema upgrade preserves a v1 journal including photos", async () => {
  const name = crypto.randomUUID();
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("entries", { keyPath: "date" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const entry = {
    ...newEntry("2026-09-24"),
    text: "Before upgrade",
    photos: [photo("old")],
  };
  await new Promise<void>((resolve, reject) => {
    const tx = old.transaction("entries", "readwrite");
    tx.objectStore("entries").put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  old.close();
  const repo = new IndexedDBRepository(name);
  const rows = await repo.list();
  assert.equal(rows[0].text, "Before upgrade");
  assert.equal(await rows[0].photos[0].blob.text(), "old");
  assert.deepEqual(await repo.listDeleted(), []);
});
test("delete and undo survive reopening and retain photo order and bytes", async () => {
  const name = crypto.randomUUID(),
    repo = new IndexedDBRepository(name);
  const entry = {
    ...newEntry("2026-09-24"),
    text: "My waffle",
    photos: [photo("a"), photo("b")],
  };
  await repo.save(entry);
  const removed = await repo.trash(entry.date);
  assert.equal((await repo.list()).length, 0);
  const reopened = new IndexedDBRepository(name);
  assert.equal((await reopened.listDeleted()).length, 1);
  const recovered = await reopened.recover(removed.id);
  assert.deepEqual(
    recovered.photos.map((p) => p.id),
    ["a", "b"],
  );
  assert.equal(await recovered.photos[1].blob.text(), "b");
  assert.equal((await reopened.listDeleted()).length, 0);
  assert.equal((await reopened.list())[0].text, "My waffle");
});
test("undo refuses to overwrite new writing and retains the deleted version", async () => {
  const repo = new IndexedDBRepository(crypto.randomUUID());
  const entry = { ...newEntry("2026-09-24"), text: "Original" };
  await repo.save(entry);
  const deleted = await repo.trash(entry.date);
  await repo.save({ ...entry, text: "New writing" });
  await assert.rejects(repo.recover(deleted.id), /already writing/);
  assert.equal((await repo.list())[0].text, "New writing");
  assert.equal((await repo.listDeleted())[0].entry.text, "Original");
  const second = await repo.trash(entry.date);
  assert.notEqual(second.id, deleted.id);
  assert.equal((await repo.listDeleted()).length, 2);
});
test("photo moves respect boundaries, do not mutate source, and persist", async () => {
  const original = [photo("a"), photo("b"), photo("c")];
  const moved = movePhoto(original, "c", -1);
  assert.deepEqual(
    original.map((p) => p.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    moved.map((p) => p.id),
    ["a", "c", "b"],
  );
  assert.strictEqual(movePhoto(original, "a", -1), original);
  assert.strictEqual(movePhoto(original, "c", 1), original);
  assert.strictEqual(movePhoto(original, "missing", 1), original);
  const repo = new IndexedDBRepository(crypto.randomUUID());
  await repo.save({ ...newEntry("2026-09-24"), photos: moved });
  assert.deepEqual(
    (await repo.list())[0].photos.map((p) => p.id),
    ["a", "c", "b"],
  );
});
