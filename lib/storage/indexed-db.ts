import { Entry, DeletedEntry, JournalRepository, hasContent } from "./types";
export class IndexedDBRepository implements JournalRepository {
  // Keep the original database ID so renaming the app preserves existing entries.
  constructor(private name = "daybook-v1") {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 2);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains("entries"))
          req.result.createObjectStore("entries", { keyPath: "date" });
        if (!req.result.objectStoreNames.contains("trash"))
          req.result.createObjectStore("trash", { keyPath: "id" });
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
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
  async listDeleted(): Promise<DeletedEntry[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("trash", "readonly");
      const req = tx.objectStore("trash").getAll();
      tx.oncomplete = () => {
        db.close();
        resolve(req.result);
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }
  async trash(date: string): Promise<DeletedEntry> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["entries", "trash"], "readwrite");
      const entries = tx.objectStore("entries");
      let deleted: DeletedEntry;
      let reason = "Could not delete the entry. Nothing was changed.";
      tx.oncomplete = () => {
        db.close();
        resolve(deleted);
      };
      tx.onabort = () => {
        db.close();
        reject(new Error(reason));
      };
      const req = entries.get(date);
      req.onsuccess = () => {
        if (!req.result) {
          reason = "This entry no longer exists.";
          tx.abort();
          return;
        }
        deleted = {
          id: crypto.randomUUID(),
          entry: req.result,
          deletedAt: new Date().toISOString(),
        };
        try {
          tx.objectStore("trash").put(deleted);
          entries.delete(date);
        } catch {
          tx.abort();
        }
      };
    });
  }
  async recover(id: string): Promise<Entry> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["entries", "trash"], "readwrite");
      let recovered: Entry;
      let reason = "Could not restore this entry. Please retry.";
      tx.oncomplete = () => {
        db.close();
        resolve(recovered);
      };
      tx.onabort = () => {
        db.close();
        reject(new Error(reason));
      };
      const deleted = tx.objectStore("trash").get(id);
      deleted.onsuccess = () => {
        if (!deleted.result) {
          reason = "This deleted entry is no longer available.";
          tx.abort();
          return;
        }
        recovered = deleted.result.entry;
        const active = tx.objectStore("entries").get(recovered.date);
        active.onsuccess = () => {
          if (active.result && hasContent(active.result)) {
            reason =
              "There is already writing or a photo on that day. Back it up and delete it before restoring this version.";
            tx.abort();
            return;
          }
          try {
            tx.objectStore("entries").put(recovered);
            tx.objectStore("trash").delete(id);
          } catch {
            tx.abort();
          }
        };
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
