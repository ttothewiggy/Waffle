import { Entry, JournalRepository, hasContent } from "./types";
export class IndexedDBRepository implements JournalRepository {
  // Keep the original database ID so renaming the app preserves existing entries.
  constructor(private name = "daybook-v1") {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () =>
        req.result.createObjectStore("entries", { keyPath: "date" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () =>
        reject(new Error("Close other Waffle tabs and retry."));
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
  async restore(
    entries: Entry[],
    replace: boolean,
  ): Promise<{ imported: number; skipped: number }> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("entries", "readwrite");
      const store = tx.objectStore("entries");
      let imported = 0,
        skipped = 0;
      tx.oncomplete = () => {
        db.close();
        resolve({ imported, skipped });
      };
      tx.onabort = () => {
        db.close();
        reject(
          tx.error || new Error("Restore failed; no entries were changed."),
        );
      };
      try {
        for (const entry of entries) {
          const req = store.get(entry.date);
          req.onsuccess = () => {
            if (!replace && req.result && hasContent(req.result)) {
              skipped++;
              return;
            }
            try {
              store.put(entry);
              imported++;
            } catch {
              tx.abort();
            }
          };
        }
      } catch {
        tx.abort();
      }
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
