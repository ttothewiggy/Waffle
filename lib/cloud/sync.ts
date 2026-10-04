import { mergeJournals, type MergeChoice, type MergeReview } from "./merge";
import { syncErrorMessage } from "./errors";
import type { IndexedDBRepository } from "../storage/indexed-db";
import { SyncConflict, type CloudTransport } from "./transport";
export type SyncStatus =
  | "waiting"
  | "syncing"
  | "synced"
  | "offline"
  | "conflict"
  | "error";
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
  reviews: MergeReview[] = [];
  mergedDays = 0;
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
  private async perform(attempt = 0): Promise<void> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.state("offline", "Offline — changes are saved on this device.");
      return;
    }
    this.mergedDays = 0;
    this.state("syncing", "Syncing your journal…");
    try {
      let local = await this.local.snapshot();
      const remote = await this.remote.read();
      if (this.stopped) return;
      const revision = remote?.revision || 0;
      const dirty = local.state.generation !== local.state.synced;
      if (dirty && revision !== local.state.revision) {
        const incoming = remote
          ? await this.remote.hydrate(remote.manifest)
          : { entries: [], trash: [] };
        if (this.stopped) return;
        const merged = await mergeJournals(
          local.base,
          local,
          incoming,
          local.choices,
        );
        if (this.stopped) return;
        // A result computed during typing is stale; do not present or apply it.
        if (
          (await this.local.snapshot()).state.generation !==
          local.state.generation
        ) {
          this.pending();
          return;
        }
        this.reviews = merged.reviews;
        const unresolved = this.reviews.filter((r) => !r.choice);
        if (unresolved.length) {
          this.state(
            "conflict",
            `${unresolved.length} overlapping ${unresolved.length === 1 ? "edit needs" : "edits need"} a choice. Your other changes will combine automatically. Review the affected entries below.`,
          );
          return;
        }
        if (
          !(await this.local.accept(
            merged.snapshot,
            revision,
            local.state.generation,
            false,
            incoming,
          ))
        ) {
          this.pending();
          return;
        }
        this.mergedDays = merged.changedDays;
        this.reviews = [];
        this.refreshed();
        local = await this.local.snapshot();
      } else this.reviews = [];
      if (dirty) {
        const manifest = await this.remote.prepare(local, remote);
        if (this.stopped) return;
        const savedRevision = await this.remote.write(revision, manifest);
        await this.local.acknowledge(
          savedRevision,
          local.state.generation,
          local,
        );
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
      // Upgrade a clean installation to keep its first shared baseline without changing cloud data.
      if (!dirty && !local.base && revision === local.state.revision)
        await this.local.acknowledge(revision, local.state.synced, local);
      const latest = await this.local.snapshot();
      if (latest.state.generation !== latest.state.synced) this.pending();
      else {
        this.state(
          "synced",
          this.mergedDays
            ? "Synced across your devices — changes combined."
            : "Synced across your devices",
        );
        this.refreshed();
      }
    } catch (error) {
      if (error instanceof SyncConflict) {
        if (attempt < 2 && !this.stopped) return this.perform(attempt + 1);
        this.state(
          "waiting",
          "Another device is saving. Your writing is safe; Waffle will retry automatically.",
        );
      } else this.state("error", syncErrorMessage(error));
    }
  }
  async resolve(id: string, choice: MergeChoice) {
    await this.exclusive(async () => {
      const review = this.reviews.find((r) => r.id === id);
      if (!review || (choice === "both" && !review.both))
        throw new Error(
          "This passage changed. Review its latest versions before choosing.",
        );
      await this.local.recordChoice(id, choice);
      this.reviews = this.reviews.map((r) =>
        r.id === id ? { ...r, choice } : r,
      );
      this.notify();
      await this.perform();
    });
  }
}
