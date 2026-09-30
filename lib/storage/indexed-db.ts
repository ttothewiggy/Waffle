import { Entry, DeletedEntry, JournalRepository, hasContent } from "./types";
export class IndexedDBRepository implements JournalRepository {
  // Keep the original database ID so renaming the app preserves existing entries.
  constructor(private name = "daybook-v1") {}
  private listeners = new Set<() => void>();
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private changed() {
    this.listeners.forEach((listener) => listener());
  }
  private dirty(tx: IDBTransaction) {
    const store = tx.objectStore("sync");
    const req = store.get("state");
    req.onsuccess = () => {
      const state = req.result || { generation: 0, synced: 0, revision: 0 };
      store.put({ ...state, generation: state.generation + 1 }, "state");
    };
  }
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 3);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains("sync"))
          req.result.createObjectStore("sync");
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
      const tx = db.transaction(["entries", "trash", "sync"], "readwrite");
      this.dirty(tx);
      const entries = tx.objectStore("entries");
      let deleted: DeletedEntry;
      let reason = "Could not delete the entry. Nothing was changed.";
      tx.oncomplete = () => {
        db.close();
        this.changed();
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
      const tx = db.transaction(["entries", "trash", "sync"], "readwrite");
      this.dirty(tx);
      let recovered: Entry;
      let reason = "Could not restore this entry. Please retry.";
      tx.oncomplete = () => {
        db.close();
        this.changed();
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
      const tx = db.transaction(["entries", "sync"], "readwrite");
      this.dirty(tx);
      const store = tx.objectStore("entries");
      let imported = 0,
        skipped = 0;
      tx.oncomplete = () => {
        db.close();
        this.changed();
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
      const tx = db.transaction(["entries", "sync"], "readwrite");
      this.dirty(tx);
      tx.objectStore("entries").put(entry);
      tx.oncomplete = () => {
        db.close();
        this.changed();
        resolve();
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("Storage is unavailable"));
      };
    });
  }
  async snapshot(): Promise<LocalSnapshot> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["entries", "trash", "sync"], "readonly");
      const entries = tx.objectStore("entries").getAll();
      const trash = tx.objectStore("trash").getAll();
      const state = tx.objectStore("sync").get("state");
      tx.oncomplete = () => {
        db.close();
        resolve({
          entries: entries.result,
          trash: trash.result,
          state: state.result || { generation: 0, synced: 0, revision: 0 },
        });
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }
  // Compare and swap prevents network responses overwriting typing in this or another tab.
  async accept(
    snapshot: JournalSnapshot | null,
    revision: number,
    generation: number,
    archive = false,
  ): Promise<boolean> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["entries", "trash", "sync"], "readwrite");
      const sync = tx.objectStore("sync");
      const req = sync.get("state");
      let accepted = false;
      req.onsuccess = () => {
        const state: SyncState = req.result || {
          generation: 0,
          synced: 0,
          revision: 0,
        };
        if (state.generation !== generation) return;
        accepted = true;
        if (snapshot) {
          if (archive) {
            const entries = tx.objectStore("entries").getAll();
            const trash = tx.objectStore("trash").getAll();
            entries.onsuccess = () => {
              for (const entry of entries.result)
                tx.objectStore("trash").put({
                  id: crypto.randomUUID(),
                  deletedAt: new Date().toISOString(),
                  entry,
                });
            };
            trash.onsuccess = () => {
              for (const item of trash.result)
                if (!snapshot.trash.some((remote) => remote.id === item.id))
                  tx.objectStore("trash").put(item);
            };
          }
          tx.objectStore("entries").clear();
          tx.objectStore("trash").clear();
          for (const entry of snapshot.entries)
            tx.objectStore("entries").put(entry);
          for (const item of snapshot.trash) tx.objectStore("trash").put(item);
        }
        sync.put(
          {
            ...state,
            generation: archive ? generation + 1 : generation,
            revision,
            synced: generation,
          },
          "state",
        );
      };
      tx.oncomplete = () => {
        db.close();
        resolve(accepted);
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }
  async archive(snapshot: JournalSnapshot): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["trash", "sync"], "readwrite");
      this.dirty(tx);
      const trash = tx.objectStore("trash");
      for (const entry of snapshot.entries)
        trash.put({
          id: crypto.randomUUID(),
          deletedAt: new Date().toISOString(),
          entry,
        });
      for (const item of snapshot.trash) {
        const existing = trash.get(item.id);
        existing.onsuccess = () => {
          if (!existing.result) trash.put(item);
        };
      }
      tx.oncomplete = () => {
        db.close();
        this.changed();
        resolve();
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(
          tx.error ||
            new Error("Could not preserve the other journal version."),
        );
      };
    });
  }
  async acknowledge(revision: number, sentGeneration: number) {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("sync", "readwrite");
      const store = tx.objectStore("sync");
      const req = store.get("state");
      req.onsuccess = () => {
        const state = req.result || { generation: 0, synced: 0, revision: 0 };
        store.put({ ...state, revision, synced: sentGeneration }, "state");
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }
}
export interface SyncState {
  generation: number;
  synced: number;
  revision: number;
}
export interface JournalSnapshot {
  entries: Entry[];
  trash: DeletedEntry[];
}
export interface LocalSnapshot extends JournalSnapshot {
  state: SyncState;
}
export const journalRepository: JournalRepository = new IndexedDBRepository();
