import { timingSafeEqual } from "node:crypto";
import { sameOrigin } from "../server/origin";
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const media = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/wav",
  "audio/mpeg",
  "video/webm",
  "video/mp4",
]);
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function transcribeRequest(
  request: Request,
  env: { apiKey?: string; accessCode?: string },
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (!env.apiKey || !env.accessCode || env.accessCode.length < 24)
    return json(
      {
        error:
          "Dictation is not configured yet. Add OPENAI_API_KEY and a private WAFFLE_DICTATION_TOKEN in Vercel, then redeploy.",
      },
      503,
    );
  const code =
    request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const expected = Buffer.from(env.accessCode),
    actual = Buffer.from(code);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return json({ error: "That dictation access code isn’t correct." }, 401);
  if (!sameOrigin(request))
    return json({ error: "This recording must be sent from Waffle." }, 403);
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
    return json({ error: "Choose an audio recording." }, 415);
  const maxBody = MAX_AUDIO_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > maxBody)
    return json(
      { error: "Recording is too large. Please record a shorter waffle." },
      413,
    );
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "No recording received." }, 400);
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBody) {
        await reader.cancel();
        return json(
          { error: "Recording is too large. Please record a shorter waffle." },
          413,
        );
      }
      chunks.push(new Uint8Array(value));
    }
    const data = await new Response(new Blob(chunks), {
      headers: { "content-type": request.headers.get("content-type")! },
    }).formData();
    const file = data.get("audio");
    if (!(file instanceof File) || !file.size)
      return json({ error: "No recording received." }, 400);
    if (file.size > MAX_AUDIO_BYTES)
      return json(
        { error: "Recording is too large. Please record a shorter waffle." },
        413,
      );
    const mime = file.type.split(";")[0];
    if (!media.has(mime))
      return json({ error: "This audio format is not supported." }, 415);
    const form = new FormData();
    const extension = mime.includes("mp4")
      ? "m4a"
      : mime.includes("wav")
        ? "wav"
        : mime.includes("mpeg")
          ? "mp3"
          : "webm";
    form.set("file", file, `waffle.${extension}`);
    form.set("model", "gpt-4o-mini-transcribe");
    form.set("response_format", "json");
    const response = await fetcher(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(45000),
      },
    );
    if (!response.ok)
      return json(
        {
          error:
            response.status === 429
              ? "The transcription service is busy or its quota is exhausted. Try again later."
              : "Transcription failed. Your recording is still here; you can retry.",
        },
        502,
      );
    const result = await response.json();
    if (typeof result.text !== "string" || !result.text.trim())
      return json(
        { error: "No speech was recognised. Try another recording." },
        422,
      );
    return json({ text: result.text.trim() });
  } catch {
    return json(
      {
        error:
          "Could not transcribe this recording. Check your connection and try again.",
      },
      502,
    );
  }
}
