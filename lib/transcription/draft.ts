export interface RecordingDraft {
  key: string;
  id: string;
  audio: Blob;
  seconds: number;
  transcript: string;
  at: string;
}
/** Account + date scoped, local-only audio. No audio goes into cloud sync/backups. */
export class RecordingDraftStore {
  constructor(private name = 'waffle-recording-drafts-v1') {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('drafts', { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async read(key: string): Promise<RecordingDraft | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readonly'), req = tx.objectStore('drafts').get(key);
      tx.oncomplete = () => { db.close(); resolve(req.result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async save(draft: RecordingDraft) {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(draft);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async remove(key: string, id: string) {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite'), store = tx.objectStore('drafts'), req = store.get(key);
      req.onsuccess = () => { if (req.result?.id === id) store.delete(key); };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
}
export const recordingDrafts = new RecordingDraftStore();
