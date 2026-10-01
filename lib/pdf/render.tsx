import React from "react";
import { Font, pdf } from "@react-pdf/renderer";
import emojiRegex from "emoji-regex-xs";
import { BookDocument } from "./BookDocument";
import { registerPdfFonts, fontStack } from "./fonts";
import type { PdfJob } from "./types";
export async function renderBook(job: PdfJob): Promise<Blob> {
  registerPdfFonts(job.fontsBase, job.emojis);
  // Refuse missing glyphs rather than export a journal with silently missing words.
  const families = Array.from(
    new Set([
      ...fontStack("serif"),
      ...fontStack("sans"),
      ...fontStack("handwritten"),
    ]),
  );
  await Promise.all(
    families.map((fontFamily) =>
      Font.load({ fontFamily, fontWeight: 400, fontStyle: "normal" }),
    ),
  );
  const fonts = families.map(
    (fontFamily) =>
      Font.getFont({ fontFamily, fontWeight: 400, fontStyle: "normal" }).data,
  );
  const text = [
    job.options.title,
    job.options.subtitle,
    ...job.entries.flatMap((e) => [
      e.text,
      ...e.photos.map((p) => p.caption || ""),
    ]),
  ]
    .join("\n")
    .replace(emojiRegex(), "");
  const missing = Array.from(
    new Set(
      Array.from(text).filter(
        (c) =>
          !/[\p{Control}\p{Default_Ignorable_Code_Point}]/u.test(c) &&
          !fonts.some((font) => font?.hasGlyphForCodePoint(c.codePointAt(0)!)),
      ),
    ),
  );
  if (missing.length)
    throw new Error(
      `The PDF fonts cannot render these characters yet: ${missing.slice(0, 8).join(" ")}. Your journal is unchanged.`,
    );
  return pdf(<BookDocument {...job} />).toBlob();
}
