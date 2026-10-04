"use client";
import { useEffect, useRef, useState } from "react";
import type { JournalSync } from "@/lib/cloud/sync";
import type { MergeChoice, ReviewSide } from "@/lib/cloud/merge";
import type { Photo } from "@/lib/storage/types";
function ReviewPhoto({ photo }: { photo: Photo }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(photo.blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.blob]);
  return (
    <figure>
      {src && <img src={src} alt={photo.caption || photo.name} />}
      <figcaption>{photo.caption || photo.name}</figcaption>
    </figure>
  );
}
function Version({ value, name }: { value: ReviewSide; name: string }) {
  return (
    <div className="sync-review-version">
      <h4>{name}</h4>
      {value.at && (
        <small>Entry last edited {new Date(value.at).toLocaleString()}</small>
      )}
      {value.paragraphs?.length ? (
        <div className="sync-review-passage">
          {value.paragraphs.map((p, i) => {
            const Tag =
              p.type === "heading" ? (p.attrs.level === 1 ? "h3" : "h4") : "p";
            return (
              <Tag key={i}>
                {p.content?.map((n, j) => {
                  if (n.type === "hardBreak") return <br key={j} />;
                  const marks = n.marks?.map((m) => m.type) || [];
                  return (
                    <span
                      key={j}
                      style={{
                        fontWeight: marks.includes("bold") ? 700 : undefined,
                        fontStyle: marks.includes("italic")
                          ? "italic"
                          : undefined,
                        textDecoration: marks.includes("underline")
                          ? "underline"
                          : undefined,
                      }}
                    >
                      {n.text}
                    </span>
                  );
                })}
              </Tag>
            );
          })}
        </div>
      ) : (
        <p>{value.text}</p>
      )}
      {!!value.photos?.length && (
        <div className="sync-review-photos">
          {value.photos.map((p) => (
            <ReviewPhoto key={p.id} photo={p} />
          ))}
        </div>
      )}
    </div>
  );
}
export default function SyncReview({
  engine,
  date,
  flush,
  reload,
}: {
  engine: JournalSync;
  date: string;
  flush: () => Promise<void>;
  reload: () => Promise<void>;
}) {
  const reviews = engine.reviews.filter((r) => r.date === date);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function choose(id: string, choice: MergeChoice) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await flush();
      await engine.resolve(id, choice);
      await reload();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save your choice. Please retry.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!reviews.length) return null;
  return (
    <section
      id="entry-sync-review"
      className="entry-sync-review"
      aria-label="Review overlapping edits"
      aria-busy={busy}
    >
      <h2>A little help with this day</h2>
      <p>
        These changes overlap. Everything else combines automatically once the
        choices are finished. Your writing stays on this device until then, and
        the original versions are kept in Recently deleted after merging.
      </p>
      {reviews.map((review) => (
        <section className="sync-review-card" key={review.id}>
          <h3>{review.title}</h3>
          {review.choice && (
            <p role="status">
              Choice saved:{" "}
              {review.choice === "both"
                ? "keep both"
                : review.choice === "local"
                  ? "this version"
                  : "other version"}
              . You can change it until the remaining choices are finished.
            </p>
          )}
          <div className="sync-review-comparison">
            <Version value={review.local} name="This device" />
            <Version value={review.remote} name="Other device" />
          </div>
          <div className="sync-review-actions">
            <button
              disabled={busy}
              aria-pressed={review.choice === "local"}
              onClick={() => void choose(review.id, "local")}
            >
              Keep this version
            </button>
            <button
              disabled={busy}
              aria-pressed={review.choice === "remote"}
              onClick={() => void choose(review.id, "remote")}
            >
              Keep other version
            </button>
            {review.both && (
              <button
                disabled={busy}
                aria-pressed={review.choice === "both"}
                onClick={() => void choose(review.id, "both")}
              >
                Keep both
              </button>
            )}
          </div>
        </section>
      ))}
      {busy && (
        <p role="status">Saving your choice and checking for other changes…</p>
      )}
      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
    </section>
  );
}
