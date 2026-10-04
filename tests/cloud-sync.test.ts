import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  IndexedDBRepository,
  type JournalSnapshot,
} from "../lib/storage/indexed-db";
import { newEntry } from "../lib/storage/types";
import { JournalSync } from "../lib/cloud/sync";
import {
  SyncConflict,
  type CloudTransport,
  type Manifest,
  type RemoteJournal,
} from "../lib/cloud/transport";
const repo = () => new IndexedDBRepository(crypto.randomUUID());
class Remote implements CloudTransport {
  value: RemoteJournal | null = null;
  fail = false;
  afterWrite: (() => Promise<void>) | null = null;
  async read() {
    if (this.fail) throw new Error("offline");
    return structuredClone(this.value);
  }
  async prepare(snapshot: JournalSnapshot) {
    return {
      version: 1,
      entries: snapshot.entries,
      trash: snapshot.trash,
    } as unknown as Manifest;
  }
  async hydrate(manifest: Manifest) {
    return structuredClone(manifest) as unknown as JournalSnapshot;
  }
  async write(expected: number, manifest: Manifest) {
    if (expected !== (this.value?.revision || 0)) throw new SyncConflict();
    const revision = expected + 1;
    this.value = { revision, manifest: structuredClone(manifest) };
    await this.afterWrite?.();
    return revision;
  }
}
const engine = (local: IndexedDBRepository, remote: CloudTransport) =>
  new JournalSync(
    local,
    remote,
    () => {},
    () => {},
  );
test("offline changes survive reopen and sync text, photos, captions and deletion to a second device", async () => {
  const a = repo(),
    b = repo(),
    remote = new Remote();
  const entry = {
    ...newEntry("2026-09-30"),
    text: "A real day",
    photos: [
      {
        id: "p",
        name: "p.png",
        type: "image/png",
        caption: "A memory",
        blob: new Blob(["bytes"]),
      },
    ],
  };
  await a.save(entry);
  remote.fail = true;
  const first = engine(a, remote);
  await first.sync();
  assert.equal(first.status, "error");
  assert.equal((await a.snapshot()).state.synced, 0);
  remote.fail = false;
  await engine(a, remote).sync();
  await engine(b, remote).sync();
  assert.equal((await b.list())[0].text, entry.text);
  assert.equal(await (await b.list())[0].photos[0].blob.text(), "bytes");
  const deleted = await a.trash(entry.date);
  await first.sync();
  await engine(b, remote).sync();
  assert.equal((await b.list()).length, 0);
  assert.equal((await b.listDeleted())[0].id, deleted.id);
  await b.recover(deleted.id);
  await engine(b, remote).sync();
  await first.sync();
  assert.equal((await a.list())[0].text, entry.text);
});
test("overlapping passages preserve both copies until an explicit choice; choosing the other passage retains displaced writing", async () => {
  const a = repo(),
    b = repo(),
    remote = new Remote();
  const first = engine(a, remote),
    second = engine(b, remote);
  const entry = { ...newEntry("2026-09-30"), text: "original" };
  await a.save(entry);
  await first.sync();
  await second.sync();
  await a.save({ ...entry, text: "phone" });
  await b.save({ ...entry, text: "computer" });
  await first.sync();
  await second.sync();
  assert.equal(second.status, "conflict");
  assert.equal((await b.list())[0].text, "computer");
  assert.equal(remote.value!.manifest.entries[0].text, "phone");
  await second.resolve(second.reviews[0].id, "remote");
  assert.equal((await b.list())[0].text, "phone");
  assert.ok(
    (await b.listDeleted()).some((item) => item.entry.text === "computer"),
  );
  assert.ok(
    remote.value!.manifest.trash.some((item) => item.entry.text === "computer"),
  );
});
test("typing during an upload remains dirty and is sent on the next sync", async () => {
  const a = repo(),
    remote = new Remote(),
    sync = engine(a, remote);
  const entry = { ...newEntry("2026-09-30"), text: "first" };
  await a.save(entry);
  remote.afterWrite = async () => {
    remote.afterWrite = null;
    await a.save({ ...entry, text: "second" });
  };
  await sync.sync();
  assert.equal(sync.status, "waiting");
  await sync.sync();
  assert.equal(remote.value!.manifest.entries[0].text, "second");
  assert.equal(sync.status, "synced");
});
test("an incoming snapshot cannot overwrite local edits made while downloading", async () => {
  const a = repo();
  const old = await a.snapshot();
  await a.save({ ...newEntry("2026-09-30"), text: "new typing" });
  assert.equal(
    await a.accept({ entries: [], trash: [] }, 1, old.state.generation),
    false,
  );
  assert.equal((await a.list())[0].text, "new typing");
});
test("account stores stay separate and importing does not replace existing account dates", async () => {
  const local = repo(),
    account = repo(),
    other = repo();
  const entry = { ...newEntry("2026-09-30"), text: "local" };
  await local.save(entry);
  await account.save({ ...entry, text: "cloud" });
  assert.deepEqual(await account.restore(await local.list(), false), {
    imported: 0,
    skipped: 1,
  });
  assert.equal((await account.list())[0].text, "cloud");
  assert.equal((await local.list())[0].text, "local");
  assert.deepEqual(await other.list(), []);
});
test("an outdated passage choice refuses to overwrite a newer cloud revision", async () => {
  const a = repo(),
    b = repo(),
    remote = new Remote();
  const one = engine(a, remote),
    two = engine(b, remote);
  const entry = { ...newEntry("2026-09-30"), text: "one" };
  await a.save(entry);
  await one.sync();
  await two.sync();
  await a.save({ ...entry, text: "two" });
  await one.sync();
  await b.save({ ...entry, text: "local" });
  await two.sync();
  const reviewed = two.reviews[0].id;
  await a.save({ ...entry, text: "three" });
  await one.sync();
  await two.sync(); // A background poll invalidates choices for a changed passage.
  await assert.rejects(two.resolve(reviewed, "local"), /passage changed/);
  assert.equal(remote.value!.manifest.entries[0].text, "three");
});

test("offline account pointer only restores a valid local identity and strips unrelated fields", async () => {
  const { parseOfflineAccount } = await import("../lib/cloud/offline-account");
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(
    parseOfflineAccount(
      JSON.stringify({
        id,
        email: "test@example.com",
        access_token: "not-a-credential",
      }),
    ),
    { id, email: "test@example.com" },
  );
  assert.equal(parseOfflineAccount("broken"), null);
  assert.equal(
    parseOfflineAccount(JSON.stringify({ id: "../../other" })),
    null,
  );
  assert.equal(parseOfflineAccount(null), null);
});

test("keeping this passage preserves displaced synced writing", async () => {
  const a = repo(),
    b = repo(),
    remote = new Remote();
  const first = engine(a, remote),
    second = engine(b, remote);
  const entry = { ...newEntry("2026-09-30"), text: "original" };
  await a.save(entry);
  await first.sync();
  await second.sync();
  await a.save({ ...entry, text: "cloud version" });
  await first.sync();
  await b.save({ ...entry, text: "device version" });
  await second.sync();
  await second.resolve(second.reviews[0].id, "local");
  assert.equal(remote.value!.manifest.entries[0].text, "device version");
  assert.ok(
    remote.value!.manifest.trash.some(
      (item) => item.entry.text === "cloud version",
    ),
  );
});

test("an uncertain timed-out save retains local changes and never blindly overwrites a committed cloud copy", async () => {
  const { CloudTimeout } = await import("../lib/cloud/request");
  const local = repo(),
    remote = new Remote(),
    sync = engine(local, remote);
  await local.save({ ...newEntry("2026-09-30"), text: "Keep these words" });
  remote.afterWrite = async () => {
    remote.afterWrite = null;
    throw new CloudTimeout();
  };
  await sync.sync();
  assert.equal(sync.status, "error");
  assert.ok(sync.message.includes("took too long"));
  assert.equal((await local.snapshot()).state.synced, 0);
  assert.equal((await local.list())[0].text, "Keep these words");
  await sync.sync();
  // The retry recognises identical contents instead of forcing a whole-journal choice.
  assert.equal(sync.status, "synced");
  assert.equal(remote.value!.revision, 2);
  assert.equal(remote.value!.manifest.entries[0].text, "Keep these words");
});
