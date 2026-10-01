import emojiRegex from "emoji-regex-xs";
import type { Entry } from "../storage/types";
import { selectPdfEntries, type PdfOptions } from "./options";
import type { PdfJob, PdfEntry } from "./types";
function abort(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
}
export async function preparePdf(
  entries: Entry[],
  options: PdfOptions,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<PdfJob> {
  const selected = selectPdfEntries(entries, options);
  const result: PdfEntry[] = [];
  const count = options.photos
    ? selected.reduce((n, e) => n + e.photos.length, 0)
    : 0;
  let done = 0;
  for (const entry of selected) {
    abort(signal);
    const photos: PdfEntry["photos"] = [];
    if (options.photos)
      for (const photo of entry.photos) {
        abort(signal);
        progress(`Preparing photo ${++done} of ${count}…`);
        let bitmap: ImageBitmap;
        try {
          bitmap = await createImageBitmap(photo.blob);
        } catch {
          throw new Error(
            `A photo on ${entry.date} could not be opened. Try exporting without photos, or replace that photo.`,
          );
        }
        try {
          const scale = Math.min(
            1,
            2200 / Math.max(bitmap.width, bitmap.height),
          );
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Your browser could not prepare photos.");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          photos.push({
            id: photo.id,
            name: photo.name,
            caption: photo.caption,
            data: canvas.toDataURL("image/jpeg", 0.9),
            width: canvas.width,
            height: canvas.height,
          });
          canvas.width = canvas.height = 0;
        } finally {
          bitmap.close();
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    result.push({
      date: entry.date,
      text: entry.text,
      richText: entry.richText,
      appearance: entry.appearance,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      schemaVersion: 1,
      photos,
    });
  }
  abort(signal);
  const text = [
    options.title,
    options.subtitle,
    ...result.flatMap((e) => [e.text, ...e.photos.map((p) => p.caption || "")]),
  ].join("\n");
  const emojis: Record<string, string> = {};
  for (const [emoji] of text.matchAll(emojiRegex())) {
    if (emojis[emoji]) continue;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not prepare emojis.");
    ctx.font =
      '96px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, 64, 66);
    emojis[emoji] = canvas.toDataURL("image/png");
  }
  return {
    entries: result,
    options,
    emojis,
    fontsBase: `${location.origin}/pdf-fonts`,
  };
}
