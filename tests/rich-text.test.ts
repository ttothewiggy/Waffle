import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  fromText,
  plainText,
  validateRich,
  documentFor,
  appendText,
  defaultAppearance,
  validateAppearance,
  type RichDocument,
} from "../lib/document/rich";
import {
  paginateRich,
  joinRichPages,
  replaceRichPage,
} from "../lib/document/rich-pages";
import { newEntry, hasContent } from "../lib/storage/types";
import { applyDraft } from "../lib/document/blocks";
import { encodeBackup, decodeBackup } from "../lib/backup/format";
import { IndexedDBRepository } from "../lib/storage/indexed-db";
import { SupabaseTransport } from "../lib/cloud/transport";
import type { SupabaseClient } from "@supabase/supabase-js";
const rich: RichDocument = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [
        { type: "text", text: "A good day", marks: [{ type: "underline" }] },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "The sea 🌊 was calm.",
          marks: [{ type: "bold" }, { type: "italic" }],
        },
        { type: "hardBreak" },
        { type: "text", text: "We stayed." },
      ],
    },
    { type: "paragraph" },
  ],
};
const entry = {
  ...newEntry("2026-09-30"),
  text: plainText(rich),
  richText: rich,
  appearance: {
    ...defaultAppearance,
    font: "handwritten" as const,
    paper: "blue" as const,
    dateUnderline: true,
  },
};
test("legacy conversion preserves whitespace, trailing blank lines and Unicode without inventing a saved date heading", () => {
  for (const text of ["", "\n", "a\n\nb\n", "  🌊 café\t\r\n  "])
    assert.equal(plainText(fromText(text)), text);
  assert.equal(
    hasContent({ ...newEntry("2026-09-30"), appearance: defaultAppearance }),
    false,
  );
  assert.deepEqual(documentFor({ text: "old" }), fromText("old"));
});
test("formatted entries and AI originals survive backup restore and local persistence", async () => {
  const edited = { ...entry, ...applyDraft(entry, "A polished version.") };
  assert.deepEqual(edited.revisions![0].richText, rich);
  assert.equal(plainText(edited.richText!), edited.text);
  const [restored] = await decodeBackup(await encodeBackup([edited]));
  assert.deepEqual(restored.richText, validateRich(edited.richText));
  assert.deepEqual(restored.revisions![0].richText, validateRich(rich));
  assert.deepEqual(restored.appearance, entry.appearance);
  const repo = new IndexedDBRepository(`rich-${crypto.randomUUID()}`);
  await repo.save(restored);
  assert.deepEqual((await repo.list())[0], restored);
  await repo.restore([restored], false);
  assert.equal((await repo.list()).length, 1);
});
test("dictation keeps existing headings and marks and appends ordinary paragraphs", () => {
  const next = appendText(entry, "More words.\nAnother thought.");
  assert.deepEqual(
    next.richText.content.slice(0, rich.content.length),
    rich.content,
  );
  assert.equal(next.text, entry.text + "\n\nMore words.\nAnother thought.");
  assert.equal(
    appendText(newEntry("2026-09-30"), "First words.").text,
    "First words.",
  );
});
test("malicious or mismatched rich content and unknown themes are rejected", async () => {
  const maliciousNode = {
    type: "doc",
    content: [{ type: "image", attrs: { src: "evil" } }],
  };
  const maliciousMark = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "link",
            marks: [{ type: "link", attrs: { href: "javascript:evil" } }],
          },
        ],
      },
    ],
  };
  for (const bad of [maliciousNode, maliciousMark])
    assert.throws(() => validateRich(bad));
  assert.throws(() => validateRich(rich, "Different words"));
  assert.throws(() =>
    validateAppearance({ ...defaultAppearance, paper: "__proto__" }),
  );
  const backup = JSON.parse(await (await encodeBackup([entry])).text());
  backup.entries[0].richText.content[0].content[0].text =
    "Changed without changing plain text";
  await assert.rejects(
    decodeBackup(new Blob([JSON.stringify(backup)])),
    /does not match/,
  );
});
test("pagination and page edits preserve all text, marks and paragraph boundaries", () => {
  const long: RichDocument = {
    type: "doc",
    content: [
      ...rich.content,
      {
        type: "heading",
        attrs: { level: 2 },
        content: [
          {
            type: "text",
            text: "Long 🌅 heading ".repeat(30),
            marks: [{ type: "italic" }],
          },
        ],
      },
      ...fromText("z".repeat(1000) + "\n\nEnd\n").content,
    ],
  };
  const pages = paginateRich(
    long,
    (doc) => Array.from(plainText(doc)).length <= 70,
  );
  assert.ok(pages.length > 10);
  assert.equal(plainText(joinRichPages(pages)), plainText(long));
  for (const page of pages)
    assert.ok(!/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/u.test(plainText(page.doc)));
  const index = pages.findIndex((p) => p.continues);
  const changed = fromText("Edited page 🌅");
  changed.content[0] = {
    ...changed.content[0],
    type: "heading",
    attrs: { level: 1 },
  };
  const next = replaceRichPage(pages, index, changed);
  const before = plainText(joinRichPages(pages.slice(0, index)));
  const after = plainText(joinRichPages(next));
  assert.ok(after.startsWith(before + "Edited page 🌅"));
  assert.equal(next[index - 1].doc.content.at(-1)!.type, "heading");
  assert.ok(
    joinRichPages(pages).content.some((p) =>
      p.content?.some(
        (n) => n.type === "text" && n.marks?.some((m) => m.type === "italic"),
      ),
    ),
  );
});
test("cloud transport round-trips formatting and page style in the new manifest format", async () => {
  const transport = new SupabaseTransport({} as SupabaseClient, "test-user");
  const manifest = await transport.prepare(
    { entries: [entry], trash: [] },
    null,
  );
  assert.equal(manifest.version, 2);
  const hydrated = await transport.hydrate(manifest);
  assert.deepEqual(hydrated.entries[0].richText, validateRich(rich));
  assert.deepEqual(hydrated.entries[0].appearance, entry.appearance);
});
