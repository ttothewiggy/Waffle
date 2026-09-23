import { Entry, JournalRepository } from "./types";
export class IndexedDBRepository implements JournalRepository {
  constructor(private name = "daybook-v1") {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () =>
        req.result.createObjectStore("entries", { keyPath: "date" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () =>
        reject(new Error("Close other Daybook tabs and retry."));
    });
  }
  async list(): Promise<Entry[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("entries", "readonly");
      const req = tx.objectStore("entries").getAll();
      tx.oncomplete = () => {
        db.close();
        resolve(req.result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }
  async save(entry: Entry): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("entries", "readwrite");
      tx.objectStore("entries").put(entry);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("Storage is unavailable"));
      };
    });
  }
}
export const journalRepository: JournalRepository = new IndexedDBRepository();
