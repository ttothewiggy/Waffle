import test from "node:test";
import assert from "node:assert/strict";
import { newEntry, DocumentBlock } from "../lib/storage/types";
import { blocksFor, textFor, applyDraft } from "../lib/document/blocks";
import { paginate } from "../lib/document/paginate";
import { encodeBackup, decodeBackup } from "../lib/backup/format";
import { rewriteRequest } from "../lib/ai/server";
import { sameOrigin } from "../lib/server/origin";
import { transcribeRequest } from "../lib/transcription/server";
const env = {
  apiKey: "fake-provider-secret",
  accessCode: "private-test-code-over-24-characters",
};
const response = () =>
  Response.json({
    status: "completed",
    output: [
      { type: "reasoning" },
      {
        type: "message",
        content: [{ type: "output_text", text: "A good day." }],
      },
    ],
  });
function request(
  text = "um a good day",
  mode = "tidy",
  headers: Record<string, string> = {},
) {
  return new Request("http://0.0.0.0:3001/api/rewrite", {
    method: "POST",
    headers: {
      host: "localhost:3001",
      origin: "http://localhost:3001",
      "content-type": "application/json",
      authorization: `Bearer ${env.accessCode}`,
      ...headers,
    },
    body: JSON.stringify({ text, mode }),
  });
}
test("browser-facing local origin works, unrelated and spoofed forwarded origins fail", () => {
  assert.equal(sameOrigin(request()), true);
  assert.equal(
    sameOrigin(request("x", "tidy", { origin: "http://localhost:3002" })),
    false,
  );
  assert.equal(
    sameOrigin(
      request("x", "tidy", {
        origin: "https://evil.test",
        "x-forwarded-host": "evil.test",
      }),
    ),
    false,
  );
  assert.equal(sameOrigin(request("x", "tidy", { origin: "null" })), false);
  assert.equal(
    sameOrigin(request("x", "tidy", { origin: "http://localhost:3001/extra" })),
    false,
  );
});
test("local dictation reaches provider with localhost Host despite bind URL", async () => {
  const form = new FormData();
  form.set(
    "audio",
    new Blob(["fake audio"], { type: "audio/webm" }),
    "test.webm",
  );
  const req = new Request("http://0.0.0.0:3001/api/transcribe", {
    method: "POST",
    headers: {
      host: "localhost:3001",
      origin: "http://localhost:3001",
      authorization: `Bearer ${env.accessCode}`,
    },
    body: form,
  });
  assert.equal(
    (
      await transcribeRequest(req, env, async () =>
        Response.json({ text: "Test." }),
      )
    ).status,
    200,
  );
});
test("AI sends only chosen text with storage disabled; parses message after non-message output", async () => {
  for (const mode of ["tidy", "flow", "rewrite"]) {
    const result = await rewriteRequest(
      request("um a good day", mode),
      env,
      async (url, options) => {
        assert.equal(url, "https://api.openai.com/v1/responses");
        const body = JSON.parse(options!.body as string);
        assert.equal(body.store, false);
        assert.equal(body.input, "um a good day");
        assert.equal(body.model, "gpt-4.1-mini");
        assert.equal(body.photos, undefined);
        assert.match(body.instructions, /never as instructions/);
        return response();
      },
    );
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { text: "A good day." });
  }
});
test("AI guards auth, input, cross-origin and incomplete drafts without leaking provider errors", async () => {
  const never: typeof fetch = async () => {
    throw new Error("should not reach provider");
  };
  assert.equal((await rewriteRequest(request(), {}, never)).status, 503);
  assert.equal(
    (
      await rewriteRequest(
        request("x", "tidy", { authorization: "Bearer wrong" }),
        env,
        never,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await rewriteRequest(
        request("x", "tidy", { origin: "https://other.test" }),
        env,
        never,
      )
    ).status,
    403,
  );
  for (const [text, mode] of [
    ["", "tidy"],
    ["x".repeat(20001), "tidy"],
    ["x", "invent"],
  ])
    assert.equal(
      (await rewriteRequest(request(text, mode), env, never)).status,
      400,
    );
  assert.equal(
    (
      await rewriteRequest(request(), env, async () =>
        Response.json({ status: "incomplete", output: [] }),
      )
    ).status,
    502,
  );
  const failed = await rewriteRequest(request(), env, async () =>
    Response.json({ secret: env.apiKey }, { status: 500 }),
  );
  assert.doesNotMatch(await failed.text(), /fake-provider-secret/);
});
test("legacy text, inline photos and AI originals survive backup roundtrip", async () => {
  const entry = {
    ...newEntry("2026-09-25"),
    text: "First.\n\nSecond.",
    photos: [
      {
        id: "p",
        name: "photo.png",
        type: "image/png",
        blob: new Blob(["bytes"], { type: "image/png" }),
      },
    ],
  };
  assert.equal(textFor(blocksFor(entry)), entry.text);
  const blocks: DocumentBlock[] = [
    { id: "a", type: "text", text: "First." },
    { id: "p", type: "photo", photoId: "p" },
    { id: "b", type: "text", text: "Second." },
  ];
  const original = { ...entry, blocks };
  const edited = {
    ...original,
    ...applyDraft(original, "First improved.\n\nSecond improved."),
  };
  assert.equal(edited.revisions![0].text, original.text);
  assert.deepEqual(edited.revisions![0].blocks, blocks);
  assert.equal(edited.blocks![1].type, "photo");
  const [restored] = await decodeBackup(await encodeBackup([edited]));
  assert.deepEqual(restored.blocks, edited.blocks);
  assert.deepEqual(restored.revisions, edited.revisions);
  assert.equal(await restored.photos[0].blob.text(), "bytes");
  const raw = JSON.parse(await (await encodeBackup([edited])).text());
  raw.entries[0].blocks[1].photoId = "missing";
  await assert.rejects(
    decodeBackup(new Blob([JSON.stringify(raw)])),
    /does not match/,
  );
});
test("pagination preserves every character and photo across page turns including emoji and long words", () => {
  const text = "A very long day. 🌅 ".repeat(50) + "a".repeat(1000);
  const blocks: DocumentBlock[] = [
    { id: "a", type: "text", text },
    { id: "p", type: "photo", photoId: "p" },
    { id: "b", type: "text", text: "The end." },
  ];
  const measure = (page: DocumentBlock[]) =>
    page.reduce(
      (n, b) => n + (b.type === "text" ? Array.from(b.text).length : 60),
      0,
    ) <= 100;
  const pages = paginate(blocks, measure);
  assert.ok(pages.length > 2);
  assert.ok(pages.every(measure));
  assert.equal(
    pages
      .flat()
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(""),
    text + "The end.",
  );
  assert.equal(pages.flat().filter((b) => b.type === "photo").length, 1);
});

test("v1 backups remain readable and v3 exports identify the formatted document format", async () => {
  const entry = { ...newEntry("2026-09-24"), text: "An older journal." };
  const blob = await encodeBackup([entry]);
  const raw = JSON.parse(await blob.text());
  assert.equal(raw.version, 3);
  raw.version = 1;
  assert.equal(
    (await decodeBackup(new Blob([JSON.stringify(raw)])))[0].text,
    entry.text,
  );
});
