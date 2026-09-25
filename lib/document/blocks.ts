import { DocumentBlock, Entry } from "../storage/types";
export function blocksFor(entry: Entry): DocumentBlock[] {
  if (entry.blocks) return entry.blocks;
  return [
    ...entry.text
      .split(/\n\n/)
      .map(
        (text, i): DocumentBlock => ({
          id: `legacy-text-${i}`,
          type: "text",
          text,
        }),
      ),
    ...entry.photos.map(
      (p): DocumentBlock => ({
        id: `photo-${p.id}`,
        type: "photo",
        photoId: p.id,
      }),
    ),
  ];
}
export function textFor(blocks: DocumentBlock[]): string {
  return blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n\n");
}
/** Keep photo positions by paragraph number when a whole-entry draft is accepted. */
export function replaceText(entry: Entry, text: string): DocumentBlock[] {
  const paragraphs: DocumentBlock[] = text
    .split(/\n\n/)
    .map((text, i) => ({ id: `draft-${i}`, type: "text", text }));
  let paragraph = 0;
  const photos: { at: number; block: DocumentBlock }[] = [];
  for (const block of blocksFor(entry)) {
    if (block.type === "text") paragraph++;
    else photos.push({ at: paragraph, block });
  }
  const result: DocumentBlock[] = [];
  for (let i = 0; i <= paragraphs.length; i++) {
    result.push(
      ...photos
        .filter((p) => Math.min(p.at, paragraphs.length) === i)
        .map((p) => p.block),
    );
    if (i < paragraphs.length) result.push(paragraphs[i]);
  }
  return result;
}
export function applyDraft(entry: Entry, text: string): Partial<Entry> {
  return {
    text,
    blocks: replaceText(entry, text),
    revisions: [
      ...(entry.revisions || []),
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        text: entry.text,
        blocks: blocksFor(entry),
      },
    ],
  };
}
