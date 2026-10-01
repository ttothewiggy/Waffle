"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Entry, Photo } from "@/lib/storage/types";
import RichEditor from "./RichEditor";
import { documentFor, plainText } from "@/lib/document/rich";
import { DateHeading } from "./PageStyle";
export function JournalPhoto({ photo }: { photo: Photo }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(photo.blob);
    setUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.blob]);
  return url ? (
    <img
      src={url}
      alt={photo.caption || photo.name}
      loading="lazy"
      decoding="async"
    />
  ) : null;
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
  photo,
  dictate,
}: {
  photo: () => void;
  dictate: () => void;
  entry: Entry;
  size: number;
  disabled: boolean;
  onChange: (patch: Partial<Entry>) => void;
}) {
  return (
    <div className="document-editor">
      <DateHeading date={entry.date} appearance={entry.appearance} />
      <RichEditor
        key={entry.date}
        doc={documentFor(entry)}
        label={`Journal entry for ${entry.date}`}
        size={size}
        disabled={disabled}
        photo={photo}
        dictate={dictate}
        onChange={(richText) =>
          onChange({ richText, text: plainText(richText), blocks: undefined })
        }
      />
      {!!entry.photos.length && (
        <section className="end-photos" aria-label="Photos and captions">
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
