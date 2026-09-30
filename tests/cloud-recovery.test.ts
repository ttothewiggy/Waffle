import test from "node:test";
import assert from "node:assert/strict";
import { cloudFetch, CloudTimeout } from "../lib/cloud/request";
import { CloudProblem, syncErrorMessage } from "../lib/cloud/errors";
const fast = { ordinary: 15, photo: 15 };
test("a stalled request times out and a later request can succeed", async () => {
  let signal: AbortSignal | null | undefined;
  let stall = true;
  const request = cloudFetch(async (_input, init) => {
    signal = init?.signal;
    if (stall) return new Promise<Response>(() => {});
    return new Response('{"saved":true}', {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }, fast);
  await assert.rejects(
    request("https://example.com/rest/v1/journal"),
    CloudTimeout,
  );
  assert.equal(signal?.aborted, true);
  stall = false;
  const response = await request("https://example.com/rest/v1/journal");
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { saved: true });
});
test("a photo body that stalls after headers is also bounded", async () => {
  const request = cloudFetch(
    async () => new Response(new ReadableStream({ start() {} })),
    fast,
  );
  await assert.rejects(
    request("https://example.com/storage/v1/object/photo"),
    CloudTimeout,
  );
});
test("caller cancellation is preserved and pre-cancelled requests never send", async () => {
  const controller = new AbortController();
  controller.abort();
  let sent = false;
  const request = cloudFetch(async () => {
    sent = true;
    return new Response();
  }, fast);
  await assert.rejects(
    request(new Request("https://example.com", { signal: controller.signal })),
    { name: "AbortError" },
  );
  assert.equal(sent, false);
  const later = new AbortController();
  const hanging = cloudFetch(async () => new Promise<Response>(() => {}), {
    ordinary: 1000,
    photo: 1000,
  });
  const pending = hanging("https://example.com", { signal: later.signal });
  later.abort();
  await assert.rejects(pending, { name: "AbortError" });
});
test("response status, headers, binary bytes and empty responses are preserved", async () => {
  const response = await cloudFetch(
    async () =>
      new Response(new Uint8Array([0, 255, 42]), {
        headers: { "Content-Type": "image/png" },
      }),
  )("https://example.com/storage/v1/object/photo");
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.deepEqual(
    new Uint8Array(await response.arrayBuffer()),
    new Uint8Array([0, 255, 42]),
  );
  const empty = await cloudFetch(
    async () => new Response(null, { status: 204 }),
  )("https://example.com");
  assert.equal(empty.status, 204);
  assert.equal(await empty.text(), "");
});
test("sync errors explain recovery without echoing backend text or credentials", () => {
  for (const [error, phrase] of [
    [{ status: 401 }, "Sign in again"],
    [{ code: "PGRST301" }, "Sign in again"],
    [{ code: "PGRST205" }, "setup is incomplete"],
    [{ code: "42501" }, "not allowed"],
    [{ statusCode: "429" }, "rate-limited"],
    [{ statusCode: "413" }, "too large"],
    [{ statusCode: "404" }, "could not be found"],
    [{ status: 503 }, "temporarily unavailable"],
    [new CloudTimeout(), "took too long"],
    [
      { message: "TimeoutError: The cloud request timed out. secret" },
      "took too long",
    ],
  ] as const) {
    assert.ok(syncErrorMessage(error).includes(phrase));
    assert.ok(
      !syncErrorMessage({
        ...error,
        details: "private journal",
        message: "token=secret",
      }).includes("secret"),
    );
  }
  assert.ok(
    !syncErrorMessage(new Error("private journal")).includes("private journal"),
  );
  assert.equal(
    syncErrorMessage(new CloudProblem("Waffle photo verification failed.")),
    "Waffle photo verification failed.",
  );
});

test("database HTTP failures retain status for safe actionable messages", async () => {
  const { SupabaseTransport } = await import("../lib/cloud/transport");
  const result = {
    data: null,
    error: { code: "", message: "private backend details" },
    status: 503,
  };
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => result,
  };
  const client = {
    from: () => query,
    rpc: async () => result,
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
  const transport = new SupabaseTransport(client, "test-user");
  const safeError = (error: unknown) => {
    assert.ok(syncErrorMessage(error).includes("temporarily unavailable"));
    assert.ok(!syncErrorMessage(error).includes("private backend details"));
    return true;
  };
  await assert.rejects(transport.read(), safeError);
  await assert.rejects(
    transport.write(0, { version: 1, entries: [], trash: [] }),
    safeError,
  );
});
