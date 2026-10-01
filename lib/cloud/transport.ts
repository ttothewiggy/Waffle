import { CloudProblem } from "./errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Entry, Photo } from "../storage/types";
import type { JournalSnapshot } from "../storage/indexed-db";
import { decodeBackup } from "../backup/format";
export type CloudPhoto = Omit<Photo, "blob"> & { path: string };
export type CloudEntry = Omit<Entry, "photos"> & { photos: CloudPhoto[] };
export interface Manifest {
  version: 1 | 2;
  entries: CloudEntry[];
  trash: { id: string; deletedAt: string; entry: CloudEntry }[];
}
export interface RemoteJournal {
  revision: number;
  manifest: Manifest;
}
export interface CloudTransport {
  read(): Promise<RemoteJournal | null>;
  prepare(
    snapshot: JournalSnapshot,
    known: RemoteJournal | null,
  ): Promise<Manifest>;
  hydrate(manifest: Manifest): Promise<JournalSnapshot>;
  write(expectedRevision: number, manifest: Manifest): Promise<number>;
}
export class SyncConflict extends Error {}
const hashes = new WeakMap<Blob, Promise<string>>();
function hash(blob: Blob) {
  let result = hashes.get(blob);
  if (!result) {
    result = blob
      .arrayBuffer()
      .then((bytes) => crypto.subtle.digest("SHA-256", bytes))
      .then((bytes) =>
        Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      );
    hashes.set(blob, result);
  }
  return result;
}
function allPhotos(manifest: Manifest) {
  return [...manifest.entries, ...manifest.trash.map((t) => t.entry)].flatMap(
    (e) => e.photos,
  );
}
export class SupabaseTransport implements CloudTransport {
  private blobs = new Map<string, Blob>();
  constructor(
    private client: SupabaseClient,
    private userId: string,
  ) {}
  async read(): Promise<RemoteJournal | null> {
    const { data, error, status } = await this.client
      .from("waffle_journals")
      .select("revision,manifest")
      .eq("user_id", this.userId)
      .maybeSingle();
    if (error) throw { ...error, status };
    if (!data) return null;
    const m = data.manifest as Manifest;
    if (
      !m ||
      (m.version !== 1 && m.version !== 2) ||
      !Array.isArray(m.entries) ||
      !Array.isArray(m.trash) ||
      !Number.isSafeInteger(data.revision)
    )
      throw new CloudProblem(
        "A newer Waffle app saved this journal. Update Waffle on this device, or close all Waffle windows and reopen it online. Your device copy has not been changed.",
      );
    return { revision: data.revision, manifest: m };
  }
  async prepare(
    snapshot: JournalSnapshot,
    known: RemoteJournal | null,
  ): Promise<Manifest> {
    const exists = new Set(
      known ? allPhotos(known.manifest).map((p) => p.path) : [],
    );
    const convert = async (entry: Entry): Promise<CloudEntry> => {
      const photos: CloudPhoto[] = [];
      for (const { blob, ...photo } of entry.photos) {
        const path = `${this.userId}/${await hash(blob)}`;
        if (!exists.has(path)) {
          const { error } = await this.client.storage
            .from("waffle-photos")
            .upload(path, blob, { contentType: photo.type, upsert: false });
          if (error && String(error.statusCode) !== "409") throw error;
          exists.add(path);
        }
        this.blobs.set(path, blob);
        photos.push({ ...photo, path });
      }
      return { ...entry, photos };
    };
    const entries: CloudEntry[] = [];
    const trash: Manifest["trash"] = [];
    for (const entry of snapshot.entries) entries.push(await convert(entry));
    for (const item of snapshot.trash)
      trash.push({ ...item, entry: await convert(item.entry) });
    const manifest: Manifest = { version: 2, entries, trash };
    if (new Blob([JSON.stringify(manifest)]).size > 10 * 1024 * 1024)
      throw new CloudProblem(
        "This journal exceeds the current cloud text limit. Your device copy is safe; export a backup.",
      );
    return manifest;
  }
  async hydrate(manifest: Manifest): Promise<JournalSnapshot> {
    const convert = async (raw: CloudEntry): Promise<Entry> => {
      // Reuse backup's strict date, text, caption and revision validation before using cloud data.
      const [entry] = await decodeBackup(
        new Blob([
          JSON.stringify({
            format: "waffle-backup",
            version: 3,
            entries: [
              {
                ...raw,
                photos: raw.photos.map((p) => ({ ...p, data: "AA==" })),
              },
            ],
          }),
        ]),
      );
      for (let i = 0; i < entry.photos.length; i++) {
        const path = raw.photos[i].path;
        if (
          typeof path !== "string" ||
          !new RegExp(`^${this.userId}/[a-f0-9]{64}$`).test(path)
        )
          throw new Error("Invalid cloud photo reference.");
        let blob = this.blobs.get(path);
        if (!blob) {
          const { data, error } = await this.client.storage
            .from("waffle-photos")
            .download(path);
          if (error) throw error;
          if (
            !data ||
            data.size > 20 * 1024 * 1024 ||
            (await hash(data)) !== path.split("/")[1]
          )
            throw new CloudProblem(
              "A cloud photo could not be verified. Your local journal was not changed.",
            );
          blob = data;
          this.blobs.set(path, blob);
        }
        entry.photos[i].blob = blob;
      }
      return entry;
    };
    const entries: Entry[] = [];
    const trash: JournalSnapshot["trash"] = [];
    const dates = new Set<string>();
    const ids = new Set<string>();
    for (const raw of manifest.entries) {
      const entry = await convert(raw);
      if (dates.has(entry.date))
        throw new Error("Duplicate cloud journal date.");
      dates.add(entry.date);
      entries.push(entry);
    }
    for (const item of manifest.trash) {
      if (
        typeof item.id !== "string" ||
        ids.has(item.id) ||
        !Number.isFinite(Date.parse(item.deletedAt))
      )
        throw new Error("Invalid cloud trash record.");
      ids.add(item.id);
      trash.push({
        id: item.id,
        deletedAt: item.deletedAt,
        entry: await convert(item.entry),
      });
    }
    return { entries, trash };
  }
  async write(expectedRevision: number, manifest: Manifest) {
    const { data, error, status } = await this.client.rpc(
      "waffle_save_journal",
      {
        expected_user: this.userId,
        expected_revision: expectedRevision,
        new_manifest: manifest,
      },
    );
    if (error?.code === "40001")
      throw new SyncConflict("Another device has newer changes.");
    if (error) throw { ...error, status };
    if (!Number.isSafeInteger(data))
      throw new Error("Unexpected cloud response; retry sync.");
    return data as number;
  }
}
