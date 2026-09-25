export type DocumentBlock =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "photo"; photoId: string };
export interface Revision {
  id: string;
  at: string;
  text: string;
  blocks: DocumentBlock[];
}
export interface Photo {
  id: string;
  name: string;
  type: string;
  blob: Blob;
  caption?: string;
}
export interface Entry {
  date: string;
  text: string;
  photos: Photo[];
  blocks?: DocumentBlock[];
  revisions?: Revision[];
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
}
export interface DeletedEntry {
  id: string;
  entry: Entry;
  deletedAt: string;
}
export interface JournalRepository {
  list(): Promise<Entry[]>;
  listDeleted(): Promise<DeletedEntry[]>;
  trash(date: string): Promise<DeletedEntry>;
  recover(id: string): Promise<Entry>;
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
