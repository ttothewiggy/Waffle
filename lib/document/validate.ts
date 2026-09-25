import { textFor } from "./blocks";
import { DocumentBlock, Revision } from "../storage/types";
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid document in backup.");
  return value as Record<string, unknown>;
}
function string(value: unknown, max: number) {
  if (typeof value !== "string" || value.length > max)
    throw new Error("Invalid document text in backup.");
  return value;
}
export function validateBlocks(value: unknown): DocumentBlock[] {
  if (!Array.isArray(value) || !value.length || value.length > 50000)
    throw new Error("Invalid document blocks in backup.");
  const ids = new Set<string>();
  const photoIds = new Set<string>();
  return value.map((raw) => {
    const b = object(raw),
      id = string(b.id, 200);
    if (!id || ids.has(id))
      throw new Error("Duplicate document block in backup.");
    ids.add(id);
    if (b.type === "text")
      return { id, type: "text", text: string(b.text, 5 * 1024 * 1024) };
    if (b.type === "photo") {
      const photoId = string(b.photoId, 200);
      if (!photoId || photoIds.has(photoId))
        throw new Error("Invalid photo placement in backup.");
      photoIds.add(photoId);
      return { id, type: "photo", photoId };
    }
    throw new Error("Unknown document block in backup.");
  });
}
export function validateRevisions(value: unknown): Revision[] {
  if (!Array.isArray(value) || value.length > 50000)
    throw new Error("Invalid version history in backup.");
  return value.map((raw) => {
    const r = object(raw),
      at = string(r.at, 40);
    if (!Number.isFinite(Date.parse(at)))
      throw new Error("Invalid revision date in backup.");
    const text = string(r.text, 5 * 1024 * 1024),
      blocks = validateBlocks(r.blocks);
    if (textFor(blocks) !== text)
      throw new Error("Invalid revision text in backup.");
    return { id: string(r.id, 200), at, text, blocks };
  });
}
