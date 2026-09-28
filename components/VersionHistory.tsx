"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Revision } from "@/lib/storage/types";
export default function VersionHistory({
  revisions,
  close,
  restore,
}: {
  revisions: Revision[];
  close: () => void;
  restore: (text: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="journal-dialog"
      aria-labelledby="versions-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="dialog-heading">
        <h2 id="versions-title">Previous versions</h2>
        <button aria-label="Close previous versions" onClick={close}>
          <X />
        </button>
      </div>
      <p>
        Saved before AI editing. Restoring also keeps your current words as a
        version.
      </p>
      {[...revisions].reverse().map((revision) => (
        <section className="saved-version" key={revision.id}>
          <h3>{new Date(revision.at).toLocaleString()}</h3>
          <p>{revision.text || "Empty entry"}</p>
          <button
            className="secondary"
            onClick={() => {
              if (
                window.confirm(
                  "Restore this text? Your current words will also be kept.",
                )
              ) {
                restore(revision.text);
                close();
              }
            }}
          >
            Restore this version
          </button>
        </section>
      ))}
    </dialog>
  );
}
