import { syncErrorMessage } from "./errors";
import type { IndexedDBRepository } from "../storage/indexed-db";
import {
  SyncConflict,
  type CloudTransport,
  type RemoteJournal,
} from "./transport";
export type SyncStatus =
  "waiting" | "syncing" | "synced" | "offline" | "conflict" | "error";
export class JournalSync {
  status: SyncStatus = "waiting";
  message = "Saved on this device; waiting to sync.";
  private running: Promise<void> | null = null;
  private stopped = false;
  private queue = Promise.resolve();
  private exclusive(work: () => Promise<void>) {
    const run = async () =>
      typeof navigator !== "undefined" && navigator.locks
        ? await navigator.locks.request("waffle-journal-sync", () =>
            this.stopped ? Promise.resolve() : work(),
          )
        : this.stopped
          ? Promise.resolve()
          : work();
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }
  private conflict: RemoteJournal | null = null;
  constructor(
    readonly local: IndexedDBRepository,
    private remote: CloudTransport,
    private notify: () => void,
    private refreshed: () => void,
  ) {}
  stop() {
    this.stopped = true;
  }
  private state(status: SyncStatus, message: string) {
    this.status = status;
    this.message = message;
    this.notify();
  }
  pending() {
    if (this.status !== "conflict")
      this.state("waiting", "Saved on this device; waiting to sync.");
  }
  sync() {
    if (this.running) return this.running;
    if (this.stopped) return Promise.resolve();
    this.running = this.exclusive(() => this.perform()).finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async perform() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.state("offline", "Offline — changes are saved on this device.");
      return;
    }
    this.state("syncing", "Syncing your journal…");
    try {
      const local = await this.local.snapshot();
      const remote = await this.remote.read();
      if (this.stopped) return;
      const revision = remote?.revision || 0;
      const dirty = local.state.generation !== local.state.synced;
      if (dirty && revision !== local.state.revision) {
        this.state(
          "conflict",
          "This device and the cloud both have changes. Review them in Settings before choosing a version.",
        );
        return;
      }
      if (dirty) {
        const manifest = await this.remote.prepare(local, remote);
        if (this.stopped) return;
        const savedRevision = await this.remote.write(revision, manifest);
        await this.local.acknowledge(savedRevision, local.state.generation);
      } else if (remote && revision !== local.state.revision) {
        const snapshot = await this.remote.hydrate(remote.manifest);
        if (this.stopped) return;
        if (
          !(await this.local.accept(snapshot, revision, local.state.generation))
        ) {
          this.pending();
          return;
        }
        this.refreshed();
      }
      const latest = await this.local.snapshot();
      if (latest.state.generation !== latest.state.synced) this.pending();
      else {
        this.state("synced", "Synced across your devices");
        this.refreshed();
      }
    } catch (error) {
      if (error instanceof SyncConflict)
        this.state(
          "conflict",
          "Another device saved while syncing. Retry sync to review both versions.",
        );
      else this.state("error", syncErrorMessage(error));
    }
  }
  async cloudCopy() {
    const remote = await this.remote.read();
    if (!remote) throw new Error("There is no cloud journal yet.");
    this.conflict = remote;
    return this.remote.hydrate(remote.manifest);
  }
  useLocal() {
    return this.exclusive(() => this.chooseLocal());
  }
  private async chooseLocal() {
    if (!this.conflict)
      throw new Error("Download the cloud copy to review it first.");
    await this.local.archive(await this.remote.hydrate(this.conflict.manifest));
    const local = await this.local.snapshot();
    const manifest = await this.remote.prepare(local, this.conflict);
    const revision = await this.remote.write(this.conflict.revision, manifest);
    await this.local.acknowledge(revision, local.state.generation);
    this.conflict = null;
    this.pending();
    await this.perform();
  }
  useCloud() {
    return this.exclusive(() => this.chooseCloud());
  }
  private async chooseCloud() {
    // Keep a durable local archive; the UI also downloads the displaced version first.
    if (!this.conflict)
      throw new Error("Download the cloud copy to review it first.");
    const local = await this.local.snapshot();
    const snapshot = await this.remote.hydrate(this.conflict.manifest);
    if (
      !(await this.local.accept(
        snapshot,
        this.conflict.revision,
        local.state.generation,
        true,
      ))
    )
      throw new Error("Your writing changed. Try again.");
    this.conflict = null;
    this.refreshed();
    this.pending();
    await this.perform();
  }
}
