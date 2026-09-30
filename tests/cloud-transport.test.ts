import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { SupabaseTransport } from "../lib/cloud/transport";
import { cloudFetch } from "../lib/cloud/request";
import { newEntry } from "../lib/storage/types";
test("private photo transport uploads once, preserves captions, verifies bytes and sends the expected account identity", async () => {
  const user = "11111111-1111-4111-8111-111111111111";
  const files = new Map<string, Blob>();
  let uploads = 0;
  let corrupt = false;
  let sent: Record<string, unknown> = {};
  const client = createClient(
    "https://example.supabase.co",
    "public-test-key",
    {
      realtime: {
        transport: class {
          constructor() {
            throw new Error("Realtime is not used by journal sync");
          }
        } as unknown as typeof WebSocket,
      },
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: cloudFetch(async (input, options) => {
          const request = new Request(input, options);
          const url = new URL(request.url);
          if (url.pathname.endsWith("/rpc/waffle_save_journal")) {
            sent = await request.json();
            return new Response("1", {
              headers: { "Content-Type": "application/json" },
            });
          }
          const path = url.pathname.split("/waffle-photos/")[1];
          if (request.method === "POST") {
            uploads++;
            const form = await request.formData();
            files.set(path, form.get("") as Blob);
            return new Response(JSON.stringify({ Key: path }), {
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(corrupt ? new Blob(["wrong"]) : files.get(path));
        }),
      },
    },
  );
  const transport = new SupabaseTransport(client, user);
  const entry = {
    ...newEntry("2026-09-30"),
    text: "A day",
    photos: [
      {
        id: "photo",
        name: "photo.png",
        type: "image/png",
        caption: "Together",
        blob: new Blob(["photo-bytes"], { type: "image/png" }),
      },
    ],
  };
  const manifest = await transport.prepare(
    { entries: [entry], trash: [] },
    null,
  );
  await transport.prepare(
    { entries: [{ ...entry, text: "Edited" }], trash: [] },
    { revision: 1, manifest },
  );
  assert.equal(uploads, 1);
  const downloaded = await new SupabaseTransport(client, user).hydrate(
    manifest,
  );
  assert.equal(downloaded.entries[0].photos[0].caption, "Together");
  assert.equal(
    await downloaded.entries[0].photos[0].blob.text(),
    "photo-bytes",
  );
  await transport.write(0, manifest);
  assert.equal(sent.expected_user, user);
  assert.equal(sent.expected_revision, 0);
  corrupt = true;
  await assert.rejects(
    new SupabaseTransport(client, user).hydrate(manifest),
    /verified/,
  );
});
