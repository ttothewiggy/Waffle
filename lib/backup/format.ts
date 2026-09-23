import { Entry, hasContent } from "../storage/types";
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
const types = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("The backup contains an invalid record.");
  return value as Record<string, unknown>;
}
function str(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max)
    throw new Error("The backup contains invalid text.");
  return value;
}
function timestamp(value: unknown): string {
  const s = str(value, 40);
  if (!Number.isFinite(Date.parse(s)))
    throw new Error("The backup contains an invalid timestamp.");
  return s;
}
function validDate(value: unknown): string {
  const s = str(value, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s + "T12:00:00Z")) ||
    new Date(s + "T12:00:00Z").toISOString().slice(0, 10) !== s
  )
    throw new Error("The backup contains an invalid date.");
  return s;
}
export async function encodeBackup(entries: Entry[]): Promise<Blob> {
  const rows = [];
  let estimated = 0;
  for (const entry of entries.filter(hasContent)) {
    const photos = [];
    estimated += entry.text.length * 3 + 512;
    for (const p of entry.photos) {
      estimated += Math.ceil(p.blob.size / 3) * 4 + 1024;
      if (estimated > MAX_BACKUP_BYTES)
        throw new Error("This journal exceeds the 100 MB backup limit.");
      const bytes = new Uint8Array(await p.blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      photos.push({ id: p.id, name: p.name, type: p.type, data: btoa(binary) });
    }
    rows.push({ ...entry, photos });
  }
  const blob = new Blob(
    [
      JSON.stringify({
        format: "waffle-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        entries: rows,
      }),
    ],
    { type: "application/json" },
  );
  if (blob.size > MAX_BACKUP_BYTES)
    throw new Error("This journal exceeds the 100 MB backup limit.");
  return blob;
}
export async function decodeBackup(file: Blob): Promise<Entry[]> {
  if (file.size > MAX_BACKUP_BYTES)
    throw new Error("Choose a Waffle backup smaller than 100 MB.");
  let input;
  try {
    input = record(JSON.parse(await file.text()));
  } catch {
    throw new Error("This file is not a readable Waffle backup.");
  }
  if (
    input.format !== "waffle-backup" ||
    input.version !== 1 ||
    !Array.isArray(input.entries) ||
    input.entries.length > 50000
  )
    throw new Error("This backup format or version is not supported.");
  const dates = new Set<string>();
  return input.entries.map((raw) => {
    const e = record(raw);
    const date = validDate(e.date);
    if (dates.has(date)) throw new Error("The backup contains duplicate days.");
    dates.add(date);
    if (
      e.schemaVersion !== 1 ||
      !Array.isArray(e.photos) ||
      e.photos.length > 1000
    )
      throw new Error("The backup contains an unsupported entry.");
    const ids = new Set<string>();
    const photos = e.photos.map((rawPhoto) => {
      const p = record(rawPhoto);
      const id = str(p.id, 200);
      if (!id || ids.has(id))
        throw new Error("The backup contains duplicate photo identifiers.");
      ids.add(id);
      const type = str(p.type, 30);
      if (!types.has(type))
        throw new Error("The backup contains an unsupported image type.");
      const data = str(p.data, 28 * 1024 * 1024);
      if (data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(data) || !data)
        throw new Error("The backup contains damaged photo data.");
      const binary = atob(data);
      if (btoa(binary) !== data)
        throw new Error("The backup contains damaged photo data.");
      if (binary.length > 20 * 1024 * 1024)
        throw new Error("A backup photo exceeds 20 MB.");
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return {
        id,
        name: str(p.name, 1024),
        type,
        blob: new Blob([bytes], { type }),
      };
    });
    return {
      date,
      text: str(e.text, 5 * 1024 * 1024),
      createdAt: timestamp(e.createdAt),
      updatedAt: timestamp(e.updatedAt),
      schemaVersion: 1,
      photos,
    };
  });
}
