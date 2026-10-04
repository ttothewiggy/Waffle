import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { mergeJournals, type MergeChoice } from "../lib/cloud/merge";
import { mergeSequence } from "../lib/cloud/merge-sequence";
import {
  IndexedDBRepository,
  type JournalSnapshot,
} from "../lib/storage/indexed-db";
import { newEntry, type Entry } from "../lib/storage/types";
import { fromText, plainText, validateRich } from "../lib/document/rich";
import { JournalSync } from "../lib/cloud/sync";
import {
  SyncConflict,
  type CloudTransport,
  type Manifest,
  type RemoteJournal,
} from "../lib/cloud/transport";
const entry = (text: string, date = "2026-09-30"): Entry => ({
  ...newEntry(date),
  text,
  richText: fromText(text),
});
const snapshot = (...entries: Entry[]): JournalSnapshot => ({
  entries,
  trash: [],
});
const repo = () => new IndexedDBRepository(crypto.randomUUID());
class Remote implements CloudTransport {
  value: RemoteJournal | null = null;
  hook: (() => Promise<void>) | null = null;
  async read() {
    return structuredClone(this.value);
  }
  async hydrate(manifest: Manifest) {
    return structuredClone(manifest) as unknown as JournalSnapshot;
  }
  async prepare(s: JournalSnapshot) {
    return {
      version: 2,
      entries: s.entries,
      trash: s.trash,
    } as unknown as Manifest;
  }
  async write(expected: number, manifest: Manifest) {
    if (expected !== (this.value?.revision || 0)) throw new SyncConflict();
    const revision = expected + 1;
    this.value = { revision, manifest: structuredClone(manifest) };
    await this.hook?.();
    return revision;
  }
}
const engine = (local: IndexedDBRepository, remote: Remote) =>
  new JournalSync(
    local,
    remote,
    () => {},
    () => {},
  );
async function pair(seed: Entry[]) {
  const a = repo(),
    b = repo(),
    remote = new Remote();
  await a.restore(seed, true);
  const one = engine(a, remote),
    two = engine(b, remote);
  await one.sync();
  await two.sync();
  return { a, b, remote, one, two };
}
test("a weekend of corrections, new days and independent edits syncs without review", async () => {
  const original = Array.from({ length: 100 }, (_, i) =>
    entry(
      `Typo ${i}\nRemember the day`,
      new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
    ),
  );
  const { a, b, one, two } = await pair(original);
  await a.restore(
    original.map((e) => ({
      ...e,
      text: e.text.replace("Typo", "Corrected"),
      richText: fromText(e.text.replace("Typo", "Corrected")),
    })),
    true,
  );
  await a.save(entry("Camping Friday", "2026-09-25"));
  await a.save(entry("Camping Saturday", "2026-09-26"));
  await b.save(entry("Laptop addition", "2026-09-27"));
  await two.sync();
  await one.sync();
  await two.sync();
  assert.equal(one.status, "synced");
  assert.equal(two.status, "synced");
  assert.equal(one.reviews.length, 0);
  assert.equal((await b.list()).length, 103);
  assert.equal((await b.list())[0].text, "Corrected 0\nRemember the day");
  assert.deepEqual(await a.list(), await b.list());
});
test("two offline additions to the same day are both retained in either reconnect order", async () => {
  for (const order of ["phone", "laptop"]) {
    const { a, b, one, two } = await pair([entry("Shared morning")]);
    await a.save(entry("Shared morning\nPhone walk"));
    await b.save(entry("Shared morning\nLaptop evening"));
    for (const s of order === "phone" ? [one, two, one] : [two, one, two])
      await s.sync();
    const text = (await a.list())[0].text;
    assert.equal(text.split("Shared morning").length, 2);
    assert.ok(text.includes("Phone walk"));
    assert.ok(text.includes("Laptop evening"));
    assert.equal(text, (await b.list())[0].text);
    assert.equal(one.status, "synced");
  }
});
test("different words, paragraphs, headings and marks combine without flattening formatting", async () => {
  const base = entry("A red tent beside a small lake.\nA second paragraph.");
  const a = entry("A blue tent beside a small lake.\nA second paragraph.");
  const b = entry("A red tent beside a large lake.\nA second paragraph.");
  b.richText!.content[1] = {
    type: "heading",
    attrs: { level: 2 },
    content: [
      { type: "text", text: "A second paragraph.", marks: [{ type: "bold" }] },
    ],
  };
  const result = await mergeJournals(snapshot(base), snapshot(a), snapshot(b));
  assert.equal(result.reviews.length, 0);
  const out = result.snapshot.entries[0];
  assert.equal(
    out.text,
    "A blue tent beside a large lake.\nA second paragraph.",
  );
  assert.equal(out.richText!.content[1].type, "heading");
  validateRich(out.richText, out.text);
  assert.deepEqual(
    out.richText!.content[1].content![0],
    b.richText!.content[1].content![0],
  );
});
test("many corrected paragraphs only review the one passage that actually overlaps", async () => {
  const base = entry("First original\nSecond original\nThird original");
  const a = entry("First corrected\nSecond corrected\nThird corrected");
  const b = entry("First original\nSecond alternative\nThird original");
  const result = await mergeJournals(snapshot(base), snapshot(a), snapshot(b));
  assert.equal(result.reviews.length, 1);
  assert.equal(result.reviews[0].local.text, "Second corrected");
  const chosen = await mergeJournals(snapshot(base), snapshot(a), snapshot(b), {
    [result.reviews[0].id]: "remote",
  });
  assert.equal(
    chosen.snapshot.entries[0].text,
    "First corrected\nSecond alternative\nThird corrected",
  );
});
test("genuine overlapping changes are reviewed within the day, choices survive reopening and originals remain", async () => {
  const { a, b, remote, one, two } = await pair([
    entry("Original words\nOriginal ending"),
  ]);
  await a.save(entry("Phone words\nPhone ending"));
  await b.save(entry("Laptop words\nLaptop ending"));
  await one.sync();
  await two.sync();
  assert.equal(two.status, "conflict");
  assert.equal(two.reviews.length, 2);
  const [first, second] = two.reviews;
  await two.resolve(first.id, "both");
  assert.equal(two.status, "conflict");
  const reopened = engine(b, remote);
  await reopened.sync();
  assert.equal(reopened.reviews[0].choice, "both");
  await reopened.resolve(second.id, "remote");
  assert.equal(reopened.status, "synced");
  assert.equal(
    (await b.list())[0].text,
    "Phone words\nLaptop words\nPhone ending",
  );
  assert.ok(
    (await b.listDeleted()).some(
      (x) => x.entry.text === "Laptop words\nLaptop ending",
    ),
  );
  assert.ok(
    (await b.listDeleted()).some(
      (x) => x.entry.text === "Phone words\nPhone ending",
    ),
  );
  await one.sync();
  assert.deepEqual(await a.list(), await b.list());
});
test("deletion versus edit asks first, one-sided deletion does not resurrect writing", async () => {
  const { a, b, one, two } = await pair([entry("original")]);
  await a.trash("2026-09-30");
  await b.save(entry("edited while camping"));
  await one.sync();
  await two.sync();
  assert.equal(two.status, "conflict");
  assert.match(two.reviews[0].title, /deleted/);
  await two.resolve(two.reviews[0].id, "local");
  await one.sync();
  assert.equal((await a.list())[0].text, "edited while camping");
  await a.trash("2026-09-30");
  await b.save(entry("A new day", "2026-10-01"));
  await one.sync();
  await two.sync();
  assert.equal(two.status, "synced");
  assert.deepEqual(
    (await b.list()).map((e) => e.date),
    ["2026-10-01"],
  );
});
test("photo additions combine, caption versus removal requires a choice and image bytes are compared", async () => {
  const p = (id: string, data = id) => ({
    id,
    name: `${id}.png`,
    type: "image/png",
    blob: new Blob([data]),
    caption: id,
  });
  const base = { ...entry("Day"), photos: [p("one")] };
  const a = { ...base, photos: [p("one"), p("two")] },
    b = { ...base, photos: [p("one"), p("three")] };
  const joined = await mergeJournals(snapshot(base), snapshot(a), snapshot(b));
  assert.equal(joined.reviews.length, 0);
  assert.equal(joined.snapshot.entries[0].photos.length, 3);
  const removal = await mergeJournals(
    snapshot(base),
    snapshot({ ...base, photos: [] }),
    snapshot({ ...base, photos: [{ ...p("one"), caption: "New caption" }] }),
  );
  assert.equal(removal.reviews.length, 1);
  const binary = await mergeJournals(
    snapshot(base),
    snapshot({ ...base, photos: [p("one", "new local bytes")] }),
    snapshot({ ...base, photos: [p("one", "other bytes")] }),
  );
  assert.equal(binary.reviews.length, 1);
});
test("upgrading with no baseline unions new dates, but never guesses at divergent existing entries", async () => {
  const local = snapshot(entry("device"), entry("new day", "2026-09-29"));
  const remote = snapshot(entry("other"), entry("older day", "2026-09-28"));
  const result = await mergeJournals(undefined, local, remote);
  assert.equal(result.reviews.length, 1);
  assert.equal(result.snapshot.entries.length, 3);
  assert.match(result.reviews[0].title, /once/);
});
test("an acknowledged baseline is the uploaded snapshot even when typing continues during upload", async () => {
  const a = repo(),
    remote = new Remote(),
    sync = engine(a, remote);
  await a.save(entry("sent"));
  remote.hook = async () => {
    remote.hook = null;
    await a.save(entry("new typing"));
  };
  await sync.sync();
  const reopened = await new IndexedDBRepository(
    (a as unknown as { name: string }).name,
  ).snapshot();
  assert.equal(reopened.base!.entries[0].text, "sent");
  assert.equal(reopened.entries[0].text, "new typing");
  assert.notEqual(reopened.state.generation, reopened.state.synced);
});
test("typing during a merge prevents a stale result overwriting it", async () => {
  const local = repo();
  await local.save(entry("original"));
  const before = await local.snapshot();
  await local.save(entry("typing"));
  assert.equal(
    await local.accept(
      snapshot(entry("merged")),
      2,
      before.state.generation,
      false,
      snapshot(entry("remote")),
    ),
    false,
  );
  assert.equal((await local.list())[0].text, "typing");
  assert.equal((await local.snapshot()).base, undefined);
});
test("choices are invalidated when either reviewed passage changes again", async () => {
  const base = snapshot(entry("original")),
    local = snapshot(entry("local")),
    remote = snapshot(entry("remote"));
  const first = await mergeJournals(base, local, remote);
  const choices: Record<string, MergeChoice> = {
    [first.reviews[0].id]: "remote",
  };
  const changed = await mergeJournals(
    base,
    local,
    snapshot(entry("remote changed again")),
    choices,
  );
  assert.equal(changed.reviews[0].choice, undefined);
});
test("bounded diff preserves complete large divergent passages for review", async () => {
  const original = Array.from({ length: 2000 }, (_, i) => `original ${i}`);
  const a = original.map((x) => x + " local"),
    b = original.map((x) => x + " remote");
  let called = 0;
  const result = mergeSequence(original, a, b, (_o, l, r) => {
    called++;
    return [...r, ...l];
  });
  assert.equal(called, 1);
  assert.equal(result.length, 4000);
});
test("repeated synchronization does not duplicate additions or recovery copies", async () => {
  const { a, b, one, two } = await pair([entry("morning")]);
  await a.save(entry("morning\nphone"));
  await b.save(entry("morning\nlaptop"));
  await one.sync();
  await two.sync();
  await one.sync();
  const before = await a.snapshot();
  for (let i = 0; i < 5; i++) {
    await one.sync();
    await two.sync();
  }
  assert.deepEqual((await a.snapshot()).entries, before.entries);
  assert.deepEqual((await a.snapshot()).trash, before.trash);
  assert.equal(plainText(before.entries[0].richText!), before.entries[0].text);
});
test("edits to different letters of the same word do not invent a third word", async () => {
  const result = await mergeJournals(
    snapshot(entry("cat")),
    snapshot(entry("bat")),
    snapshot(entry("car")),
  );
  assert.equal(result.reviews.length, 1);
  assert.notEqual(result.snapshot.entries[0].text, "bar");
});
test("a cloud save that wins a race is re-read and merged automatically", async () => {
  const { a, b, remote, one, two } = await pair([entry("Morning")]);
  await a.save(entry("Morning\nPhone"));
  await b.save(entry("Morning\nLaptop"));
  const prepare = remote.prepare.bind(remote);
  let once = true;
  remote.prepare = async (s) => {
    if (once) {
      once = false;
      await one.sync();
    }
    return prepare(s);
  };
  await two.sync();
  await one.sync();
  assert.equal(two.status, "synced");
  assert.ok((await a.list())[0].text.includes("Phone"));
  assert.ok((await a.list())[0].text.includes("Laptop"));
});
test("a newer cloud edit invalidates the reviewed choice instead of overwriting it", async () => {
  const { a, b, one, two } = await pair([entry("original")]);
  await a.save(entry("phone version"));
  await b.save(entry("laptop version"));
  await one.sync();
  await two.sync();
  const id = two.reviews[0].id;
  await a.save(entry("phone revised again"));
  await one.sync();
  await two.resolve(id, "local");
  assert.equal(two.status, "conflict");
  assert.equal(two.reviews[0].choice, undefined);
  assert.equal(two.reviews[0].remote.text, "phone revised again");
});
test("concurrent independent page style changes survive merge", async () => {
  const base = entry("Original");
  const defaults = {
    font: "serif" as const,
    paper: "parchment" as const,
    showDate: true,
    dateUnderline: false,
  };
  const result = await mergeJournals(
    snapshot(base),
    snapshot({ ...base, appearance: { ...defaults, paper: "blue" } }),
    snapshot({ ...base, appearance: { ...defaults, font: "handwritten" } }),
  );
  assert.equal(result.reviews.length, 0);
  assert.equal(result.snapshot.entries[0].appearance?.paper, "blue");
  assert.equal(result.snapshot.entries[0].appearance?.font, "handwritten");
});
test("review choices are saved visibly even when connectivity disappears", async () => {
  const { a, b, one, two } = await pair([entry("original")]);
  await a.save(entry("phone"));
  await b.save(entry("laptop"));
  await one.sync();
  await two.sync();
  const review = two.reviews[0],
    descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: false },
  });
  try {
    await two.resolve(review.id, "both");
    assert.equal(two.status, "offline");
    assert.equal(two.reviews[0].choice, "both");
    assert.equal((await b.snapshot()).choices![review.id], "both");
    assert.equal((await b.list())[0].text, "laptop");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
  await two.sync();
  assert.equal(two.status, "synced");
  assert.equal((await b.list())[0].text, "phone\nlaptop");
});
test("adjacent edits and insertions preserve all unchanged boundaries", () => {
  const merge = (base: string, local: string, remote: string) =>
    mergeSequence([...base], [...local], [...remote], () => {
      throw new Error("Unexpected overlap");
    }).join("");
  assert.equal(merge("abcdef", "Abcdef", "abcdeF"), "AbcdeF");
  assert.equal(merge("abcdef", "abXcdef", "abcYdef"), "abXcYdef");
  assert.equal(merge("abcdef", "abdef", "abcZef"), "abZef");
  assert.equal(merge("abcdef", "Xabcdef", "abcdefY"), "XabcdefY");
});
test("very large overlapping paragraphs are preserved for review without a giant word diff", async () => {
  const text = "a".repeat(100_001);
  const result = await mergeJournals(
    snapshot(entry(text)),
    snapshot(entry("L" + text)),
    snapshot(entry("R" + text)),
  );
  assert.equal(result.reviews.length, 1);
  assert.equal(result.reviews[0].local.text, "L" + text);
  assert.equal(result.reviews[0].remote.text, "R" + text);
});
test("incompatible photo moves require a choice, while a sole reorder retains new photos", async () => {
  const photos = ["a", "b", "c"].map((id) => ({
    id,
    name: `${id}.png`,
    type: "image/png",
    blob: new Blob([id]),
  }));
  const base = { ...entry("Photos"), photos };
  const local = { ...base, photos: [photos[1], photos[0], photos[2]] };
  const remote = { ...base, photos: [photos[0], photos[2], photos[1]] };
  const clash = await mergeJournals(
    snapshot(base),
    snapshot(local),
    snapshot(remote),
  );
  assert.equal(clash.reviews.length, 1);
  assert.equal(clash.reviews[0].title, "Choose the photo order");
  const chosen = await mergeJournals(
    snapshot(base),
    snapshot(local),
    snapshot(remote),
    { [clash.reviews[0].id]: "local" },
  );
  assert.deepEqual(
    chosen.snapshot.entries[0].photos.map((p) => p.id),
    ["b", "a", "c"],
  );
  const addition = { ...photos[0], id: "d" };
  const merged = await mergeJournals(
    snapshot(base),
    snapshot(local),
    snapshot({ ...base, photos: [...photos, addition] }),
  );
  assert.equal(merged.reviews.length, 0);
  assert.deepEqual(
    merged.snapshot.entries[0].photos.map((p) => p.id),
    ["b", "a", "c", "d"],
  );
});
