export interface Photo {
  id: string;
  name: string;
  type: string;
  blob: Blob;
}
export interface Entry {
  date: string;
  text: string;
  photos: Photo[];
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
}
export interface JournalRepository {
  list(): Promise<Entry[]>;
  save(entry: Entry): Promise<void>;
  restore(
    entries: Entry[],
    replace: boolean,
  ): Promise<{ imported: number; skipped: number }>;
}
export function dayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function newEntry(date: string): Entry {
  const now = new Date().toISOString();
  return {
    date,
    text: "",
    photos: [],
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };
}
export function hasContent(entry: Entry) {
  return !!entry.text.trim() || entry.photos.length > 0;
}
