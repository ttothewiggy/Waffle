import { Entry } from "../storage/types";
/** Preserve the existing photo order when retiring inline placement. */
export function orderedPhotos(entry: Entry) {
  if (!entry.blocks) return entry.photos;
  const ids = entry.blocks
    .filter((b) => b.type === "photo")
    .map((b) => b.photoId);
  return [
    ...ids
      .map((id) => entry.photos.find((p) => p.id === id))
      .filter((p) => p !== undefined),
    ...entry.photos.filter((p) => !ids.includes(p.id)),
  ];
}
/** Page boundaries contain no extra separators: retain every original character. */
export function editPage(pages: string[], index: number, text: string): string {
  return pages.map((page, i) => (i === index ? text : page)).join("");
}
