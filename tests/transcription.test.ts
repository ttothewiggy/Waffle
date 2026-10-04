import test from "node:test";
import assert from "node:assert/strict";
import {
  transcribeRequest as rawTranscribe,
  MAX_AUDIO_BYTES,
} from "../lib/transcription/server";
import { aiEnv as env, authFetch, sessionToken } from "./ai-fixture";
const transcribeRequest = (...args: Parameters<typeof rawTranscribe>) => rawTranscribe(args[0], args[1], args[2], authFetch);
function request(
  options: {
    code?: string;
    type?: string;
    bytes?: number;
    origin?: string;
  } = {},
) {
  const data = new FormData();
  data.set(
    "audio",
    new Blob([new Uint8Array(options.bytes || 20)], {
      type: options.type || "audio/webm",
    }),
    "recording.webm",
  );
  return new Request("https://waffle.test/api/transcribe", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.code || sessionToken}`,
      Origin: options.origin || "https://waffle.test",
    },
    body: data,
  });
}
test("missing configuration and invalid sessions fail before any provider request", async () => {
  const never = async () => {
    throw new Error("Must not call provider");
  };
  assert.equal((await transcribeRequest(request(), {}, never)).status, 503);
  assert.equal(
    (await transcribeRequest(request({ code: "wrong" }), env, never)).status,
    401,
  );
  assert.equal(
    (
      await transcribeRequest(
        request({ origin: "https://elsewhere.test" }),
        env,
        never,
      )
    ).status,
    403,
  );
});
test("reject unsupported and oversized recordings", async () => {
  const never = async () => {
    throw new Error("Must not call provider");
  };
  assert.equal(
    (await transcribeRequest(request({ type: "text/plain" }), env, never))
      .status,
    415,
  );
  assert.equal(
    (
      await transcribeRequest(
        request({ bytes: MAX_AUDIO_BYTES + 1 }),
        env,
        never,
      )
    ).status,
    413,
  );
});
test("provider receives audio and server credential; browser receives only transcript", async () => {
  let called = false;
  const mock: typeof fetch = async (url, options) => {
    called = true;
    assert.equal(url, "https://api.openai.com/v1/audio/transcriptions");
    assert.equal(
      (options?.headers as Record<string, string>).Authorization,
      "Bearer test-only-key",
    );
    const body = options?.body as FormData;
    assert.equal(body.get("model"), "gpt-4o-mini-transcribe");
    assert.equal((body.get("file") as File).size, 20);
    return Response.json({ text: " A lovely afternoon. " });
  };
  const result = await transcribeRequest(request(), env, mock);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { text: "A lovely afternoon." });
  assert.ok(called);
  assert.equal(result.headers.get("Cache-Control"), "no-store");
});
test("provider failures do not leak provider response or secrets", async () => {
  const result = await transcribeRequest(request(), env, async () =>
    Response.json({ secret: "private debug data" }, { status: 429 }),
  );
  assert.equal(result.status, 502);
  assert.doesNotMatch(await result.text(), /private debug data|test-only-key/);
});
