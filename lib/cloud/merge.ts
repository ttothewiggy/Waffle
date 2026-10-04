import type { JournalSnapshot } from "../storage/indexed-db";
import type { Entry, Photo } from "../storage/types";
import {
  defaultAppearance,
  documentFor,
  plainText,
  inlineText,
  validateRich,
  type Paragraph,
  type Inline,
  type Mark,
} from "../document/rich";
import { orderedPhotos } from "../document/simple";
import { CloudProblem } from "./errors";
import { mergeSequence, same } from "./merge-sequence";
export type MergeChoice = "local" | "remote" | "both";
export interface ReviewSide {
  text: string;
  paragraphs?: Paragraph[];
  photos?: Photo[];
  at?: string;
}
export interface MergeReview {
  id: string;
  date: string;
  title: string;
  local: ReviewSide;
  remote: ReviewSide;
  both: boolean;
  choice?: MergeChoice;
}
export interface MergeResult {
  snapshot: JournalSnapshot;
  reviews: MergeReview[];
  changedDays: number;
}
const blobs = new WeakMap<Blob, Promise<string>>();
async function digest(value: string | Blob) {
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : await value.arrayBuffer();
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
function photoKey(photo: Photo) {
  let hash = blobs.get(photo.blob);
  if (!hash) {
    hash = digest(photo.blob);
    blobs.set(photo.blob, hash);
  }
  return hash.then((blob) => ({
    id: photo.id,
    name: photo.name,
    type: photo.type,
    caption: photo.caption || "",
    blob,
  }));
}
function canonicalParagraph(p: Paragraph): Paragraph {
  const content: Inline[] = [];
  for (const node of p.content || []) {
    if (node.type === "hardBreak") {
      content.push(node);
      continue;
    }
    const marks = [...new Set((node.marks || []).map((m) => m.type))]
      .sort()
      .map((type) => ({ type }));
    const last = content.at(-1);
    if (last?.type === "text" && same(last.marks || [], marks))
      last.text += node.text;
    else
      content.push({
        type: "text",
        text: node.text,
        ...(marks.length ? { marks } : {}),
      });
  }
  return p.type === "heading"
    ? { type: p.type, attrs: p.attrs, content }
    : { type: p.type, content };
}
const paragraphs = (entry?: Entry) =>
  entry ? documentFor(entry).content.map(canonicalParagraph) : [];
async function entryKey(entry?: Entry) {
  if (!entry) return null;
  return {
    paragraphs: paragraphs(entry),
    photos: await Promise.all(orderedPhotos(entry).map(photoKey)),
    appearance: { ...defaultAppearance, ...entry.appearance },
  };
}
interface Atom {
  text: string;
  marks?: Mark[];
  break?: boolean;
}
function atoms(p: Paragraph): Atom[] {
  return (p.content || []).flatMap((n) =>
    n.type === "hardBreak"
      ? [{ text: "\n", break: true }]
      : Array.from(n.text).map((text) => ({
          text,
          ...(n.marks ? { marks: n.marks } : {}),
        })),
  );
}
function mergeParagraph(
  base: Paragraph,
  local: Paragraph,
  remote: Paragraph,
): Paragraph | null {
  // Huge overlapping passages stay intact for review rather than allocating millions of atoms.
  if ([base, local, remote].some((p) => inlineText(p).length > 100_000))
    return null;
  const style = (p: Paragraph) => (p.type === "heading" ? p.attrs.level : 0);
  const b = style(base),
    l = style(local),
    r = style(remote);
  if (b !== l && b !== r && l !== r) return null;
  let conflict = false;
  const content: Inline[] = [];
  // Compare words, not individual letters: concurrent cat → bat / cat → car
  // must be reviewed rather than silently inventing “bar”. Keep marks on each atom.
  const words = (p: Paragraph) => {
    const groups: Atom[][] = [];
    let kind = "";
    for (const atom of atoms(p)) {
      const next = atom.break
        ? "break"
        : /[\p{L}\p{N}\p{M}'’]/u.test(atom.text)
          ? "word"
          : /\s/u.test(atom.text)
            ? "space"
            : "punctuation";
      if (next === kind && next !== "break" && next !== "punctuation")
        groups.at(-1)!.push(atom);
      else groups.push([atom]);
      kind = next;
    }
    return groups;
  };
  const merged = mergeSequence(
    words(base),
    words(local),
    words(remote),
    (_b, l) => {
      conflict = true;
      return l;
    },
  ).flat();
  if (conflict) return null;
  for (const atom of merged) {
    if (atom.break) {
      content.push({ type: "hardBreak" });
      continue;
    }
    const last = content.at(-1);
    if (last?.type === "text" && same(last.marks, atom.marks))
      last.text += atom.text;
    else
      content.push({
        type: "text",
        text: atom.text,
        ...(atom.marks ? { marks: atom.marks } : {}),
      });
  }
  const level = l === b ? r : l;
  return level
    ? { type: "heading", attrs: { level: level as 1 | 2 }, content }
    : { type: "paragraph", content };
}
const unionById = <T extends { id: string }>(l: T[], r: T[]) => [
  ...new Map([...r, ...l].map((x) => [x.id, x])).values(),
];
const side = (entry?: Entry): ReviewSide =>
  entry
    ? {
        text: entry.text,
        paragraphs: paragraphs(entry),
        photos: orderedPhotos(entry),
        at: entry.updatedAt,
      }
    : { text: "Entry deleted" };
/** Compare against the last acknowledged snapshot, not timestamps. Never use last-writer-wins. */
export async function mergeJournals(
  base: JournalSnapshot | undefined,
  local: JournalSnapshot,
  remote: JournalSnapshot,
  choices: Record<string, MergeChoice> = {},
): Promise<MergeResult> {
  const reviews: MergeReview[] = [],
    entries: Entry[] = [],
    archives: JournalSnapshot["trash"] = [];
  const lm = new Map(local.entries.map((e) => [e.date, e])),
    rm = new Map(remote.entries.map((e) => [e.date, e]));
  const bm = new Map((base?.entries || []).map((e) => [e.date, e]));
  let changedDays = 0;
  for (const date of [
    ...new Set([...lm.keys(), ...rm.keys(), ...bm.keys()]),
  ].sort()) {
    const l = lm.get(date),
      r = rm.get(date),
      b = bm.get(date);
    const [lk, rk, bk] = await Promise.all([
      entryKey(l),
      entryKey(r),
      entryKey(b),
    ]);
    const context = await digest(JSON.stringify([date, bk, lk, rk]));
    const ask = <T>(
      key: string,
      title: string,
      lv: T,
      rv: T,
      ls: ReviewSide,
      rs: ReviewSide,
      both?: () => T,
    ): T => {
      const id = `${context}:${key}`,
        choice = choices[id];
      reviews.push({
        id,
        date,
        title,
        local: { at: l?.updatedAt, ...ls },
        remote: { at: r?.updatedAt, ...rs },
        both: !!both,
        choice,
      });
      return choice === "remote" ? rv : choice === "both" && both ? both() : lv;
    };
    let entry: Entry | undefined;
    if (same(lk, rk)) entry = l || r;
    else if (base && same(lk, bk)) entry = r;
    else if (base && same(rk, bk)) entry = l;
    else if (!base && (!l || !r))
      entry = l || r; // Upgrading without a baseline: absence is not a deletion.
    else if (!l || !r || !base) {
      entry = ask(
        "entry",
        !base
          ? "Review this day once to start smarter syncing"
          : "An entry was deleted on one device and edited on another",
        l,
        r,
        side(l),
        side(r),
        l && r
          ? () => ({
              ...l,
              richText: {
                type: "doc",
                content: [...paragraphs(r), ...paragraphs(l)],
              },
              text: [...r.text, l.text].join("\n"),
              photos: [
                ...r.photos,
                ...l.photos.flatMap((photo, index) => {
                  const otherIndex = r.photos.findIndex(
                    (p) => p.id === photo.id,
                  );
                  if (otherIndex < 0) return [photo];
                  if (
                    same(
                      lk?.photos.find((p) => p.id === photo.id),
                      rk?.photos.find((p) => p.id === photo.id),
                    )
                  )
                    return [];
                  return [{ ...photo, id: `sync-${context}-${index}` }];
                }),
              ],
              blocks: undefined,
            })
          : undefined,
      );
    } else {
      const content = mergeSequence(
        paragraphs(b),
        paragraphs(l),
        paragraphs(r),
        (original, a, z, start) => {
          if (original.length === a.length && original.length === z.length) {
            return original.flatMap((paragraph, i) => {
              if (same(a[i], z[i]) || same(paragraph, z[i])) return [a[i]];
              if (same(paragraph, a[i])) return [z[i]];
              const merged = mergeParagraph(paragraph, a[i], z[i]);
              if (merged) return [merged];
              return ask(
                `text-${start + i}`,
                "Two edits to the same passage",
                [a[i]],
                [z[i]],
                {
                  text: plainText({ type: "doc", content: [a[i]] }),
                  paragraphs: [a[i]],
                },
                {
                  text: plainText({ type: "doc", content: [z[i]] }),
                  paragraphs: [z[i]],
                },
                () => [z[i], a[i]],
              );
            });
          }
          return ask(
            `text-${start}`,
            "Two edits to the same passage",
            a,
            z,
            {
              text: a.length
                ? plainText({ type: "doc", content: a })
                : "Passage removed",
              paragraphs: a,
            },
            {
              text: z.length
                ? plainText({ type: "doc", content: z })
                : "Passage removed",
              paragraphs: z,
            },
            a.length && z.length ? () => [...z, ...a] : undefined,
          );
        },
        true,
      );
      const richText = {
        type: "doc" as const,
        content: content.length
          ? content
          : [{ type: "paragraph" as const, content: [] }],
      };
      const appearance = { ...defaultAppearance, ...l.appearance };
      for (const key of Object.keys(
        defaultAppearance,
      ) as (keyof typeof defaultAppearance)[]) {
        const bv = b?.appearance?.[key] ?? defaultAppearance[key],
          lv = appearance[key],
          rv = r.appearance?.[key] ?? defaultAppearance[key];
        const value =
          same(lv, rv) || same(bv, rv)
            ? lv
            : same(bv, lv)
              ? rv
              : ask(
                  `appearance-${key}`,
                  `Choose the page setting: ${{ font: "font", paper: "page colour", showDate: "date heading", dateUnderline: "date underline" }[key]}`,
                  lv,
                  rv,
                  { text: String(lv) },
                  { text: String(rv) },
                );
        Object.assign(appearance, { [key]: value });
      }
      const photos = new Map<string, Photo>();
      const bp = new Map((b ? orderedPhotos(b) : []).map((p) => [p.id, p]));
      const lp = new Map(orderedPhotos(l).map((p) => [p.id, p])),
        rp = new Map(orderedPhotos(r).map((p) => [p.id, p]));
      for (const id of new Set([...bp.keys(), ...lp.keys(), ...rp.keys()])) {
        const a = lp.get(id),
          z = rp.get(id),
          original = bp.get(id);
        const [ak, zk, ok] = await Promise.all([
          a ? photoKey(a) : null,
          z ? photoKey(z) : null,
          original ? photoKey(original) : null,
        ]);
        const p =
          same(ak, zk) || same(ok, zk)
            ? a
            : same(ok, ak)
              ? z
              : ask(
                  `photo-${id}`,
                  "Two changes to a photo or its caption",
                  a,
                  z,
                  {
                    text: a ? a.caption || a.name : "Photo removed",
                    photos: a ? [a] : [],
                  },
                  {
                    text: z ? z.caption || z.name : "Photo removed",
                    photos: z ? [z] : [],
                  },
                );
        if (p) photos.set(id, p);
      }
      const baseOrder = [...bp.keys()],
        localOrder = [...lp.keys()],
        remoteOrder = [...rp.keys()];
      const common = baseOrder.filter((id) => lp.has(id) && rp.has(id));
      const commonSet = new Set(common);
      const localCommon = localOrder.filter((id) => commonSet.has(id));
      const remoteCommon = remoteOrder.filter((id) => commonSet.has(id));
      const localMoved = !same(common, localCommon),
        remoteMoved = !same(common, remoteCommon);
      const chooseOrder = (a: string[], z: string[], key: string) =>
        ask(
          key,
          "Choose the photo order",
          a,
          z,
          {
            text: "Photo order on this device",
            photos: a.map((id) => photos.get(id)).filter((p) => !!p),
          },
          {
            text: "Photo order on the other device",
            photos: z.map((id) => photos.get(id)).filter((p) => !!p),
          },
        );
      // Moves are not independent delete/insert operations. Preserve a sole reorder,
      // and ask when both devices disagree about the order of surviving photos.
      const order =
        localMoved && remoteMoved && !same(localCommon, remoteCommon)
          ? chooseOrder(localOrder, remoteOrder, "photo-order")
          : localMoved
            ? [...localOrder, ...remoteOrder.filter((id) => !lp.has(id))]
            : remoteMoved
              ? [...remoteOrder, ...localOrder.filter((id) => !rp.has(id))]
              : mergeSequence(
                  baseOrder,
                  localOrder,
                  remoteOrder,
                  (_b, a, z, start) =>
                    chooseOrder(a, z, `photo-order-${start}`),
                  true,
                );
      entry = {
        ...l,
        richText,
        text: plainText(richText),
        appearance,
        blocks: undefined,
        photos: [...new Set([...order, ...photos.keys()])]
          .map((id) => photos.get(id))
          .filter((p) => !!p),
        createdAt: [l.createdAt, r.createdAt].sort()[0],
        updatedAt: [l.updatedAt, r.updatedAt].sort().at(-1)!,
      };
    }
    if (entry) {
      entry = {
        ...entry,
        revisions: unionById(l?.revisions || [], r?.revisions || []),
      };
      if (
        entry.text.length > 5 * 1024 * 1024 ||
        entry.photos.length > 1000 ||
        (entry.revisions?.length || 0) > 50000
      )
        throw new CloudProblem(
          "Combining these versions would exceed the entry limit. Both originals are unchanged. Export a backup and split a large entry before retrying.",
        );
      if (entry.richText) validateRich(entry.richText, entry.text);
      entries.push(entry);
    }
    const resultKey = await entryKey(entry);
    if (!same(lk, resultKey)) changedDays++;
    // Preserve pre-merge originals only when BOTH sides diverged from the shared version.
    if (!same(lk, rk) && (!base || (!same(lk, bk) && !same(rk, bk)))) {
      for (const [source, original, key] of [
        ["local", l, lk],
        ["remote", r, rk],
      ] as const)
        if (original && !same(key, resultKey))
          archives.push({
            id: `sync-${context}-${source}`,
            entry: original,
            deletedAt: new Date().toISOString(),
          });
    }
  }
  // Trash deletions (restores) also follow the baseline. Preserve independent recovery items.
  const bt = new Set((base?.trash || []).map((t) => t.id));
  const lt = new Set(local.trash.map((t) => t.id)),
    rt = new Set(remote.trash.map((t) => t.id));
  const trash = unionById(local.trash, remote.trash).filter(
    (t) => !bt.has(t.id) || (lt.has(t.id) && rt.has(t.id)),
  );
  return {
    snapshot: { entries, trash: unionById(archives, trash) },
    reviews,
    changedDays,
  };
}
