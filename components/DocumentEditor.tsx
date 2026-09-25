"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Entry, Photo } from "@/lib/storage/types";
export function JournalPhoto({ photo }: { photo: Photo }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(photo.blob);
    setUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.blob]);
  return url ? <img src={url} alt={photo.caption || photo.name} /> : null;
}
export function PhotoCaption({
  photo,
  disabled,
  onChange,
}: {
  photo: Photo;
  disabled: boolean;
  onChange: (caption: string) => void;
}) {
  return (
    <textarea
      className="photo-caption"
      aria-label={`Caption for ${photo.name}`}
      placeholder="Add a caption…"
      maxLength={500}
      value={photo.caption || ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
    />
  );
}
export default function DocumentEditor({
  entry,
  size,
  disabled,
  onChange,
}: {
  entry: Entry;
  size: number;
  disabled: boolean;
  onChange: (patch: Partial<Entry>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [entry.text, size]);
  return (
    <div className="document-editor">
      <textarea
        ref={ref}
        className="document-paragraph continuous-editor"
        aria-label={`Journal entry for ${entry.date}`}
        disabled={disabled}
        style={{ fontSize: size }}
        value={entry.text}
        placeholder="What would you like to waffle about today?"
        onChange={(e) => onChange({ text: e.target.value, blocks: undefined })}
        spellCheck
      />
      {!!entry.photos.length && (
        <section className="end-photos" aria-label="Photos and captions">
          <div className="paper-label">THE DAY IN PICTURES</div>
          {entry.photos.map((photo) => (
            <figure className="captioned-photo" key={photo.id}>
              <JournalPhoto photo={photo} />
              <button
                className="remove-photo"
                disabled={disabled}
                aria-label={`Remove ${photo.name}`}
                onClick={() =>
                  onChange({
                    photos: entry.photos.filter((p) => p.id !== photo.id),
                    blocks: undefined,
                  })
                }
              >
                <X size={18} />
              </button>
              <figcaption>
                <PhotoCaption
                  photo={photo}
                  disabled={disabled}
                  onChange={(caption) =>
                    onChange({
                      photos: entry.photos.map((p) =>
                        p.id === photo.id ? { ...p, caption } : p,
                      ),
                    })
                  }
                />
              </figcaption>
            </figure>
          ))}
        </section>
      )}
    </div>
  );
}
