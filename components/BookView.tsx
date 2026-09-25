"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Entry } from "@/lib/storage/types";
import { paginate } from "@/lib/document/paginate";
import { editPage } from "@/lib/document/simple";
import { JournalPhoto, PhotoCaption } from "./DocumentEditor";
export default function BookView({
  entry,
  size,
  onEdit,
  onChange,
  disabled,
  previousEntry,
  nextEntry,
  initialLastPage = false,
  diary = false,
}: {
  entry: Entry;
  size: number;
  onEdit: () => void;
  onChange: (patch: Partial<Entry>) => void;
  disabled: boolean;
  previousEntry?: () => void;
  nextEntry?: () => void;
  initialLastPage?: boolean;
  diary?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null),
    measure = useRef<HTMLDivElement>(null);
  const editing = useRef(false);
  const [revision, setRevision] = useState(0);
  const [layout, setLayout] = useState({ texts: [""], spread: 1, height: 400 });
  const [position, setPosition] = useState(
    initialLastPage ? Number.MAX_SAFE_INTEGER : 0,
  );
  useEffect(() => {
    container.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [position]);
  useLayoutEffect(() => {
    const host = container.current,
      probe = measure.current;
    if (!host || !probe) return;
    let active = true;
    const calculate = () => {
      if (!active || editing.current) return;
      const width = host.clientWidth,
        spread = width >= 760 ? 2 : 1;
      const pageWidth = (width - (spread === 2 ? 16 : 0)) / spread;
      const height = Math.max(280, Math.min(600, window.innerHeight - 310));
      probe.style.width = `${pageWidth - 50}px`;
      probe.style.fontSize = `${size}px`;
      const pages = paginate(
        [{ id: "body", type: "text", text: entry.text }],
        (blocks) => {
          probe.textContent =
            blocks.map((b) => (b.type === "text" ? b.text : "")).join("") +
            "\u200b";
          return probe.scrollHeight <= height - 8;
        },
      );
      setLayout({
        texts: pages.map((page) =>
          page.map((b) => (b.type === "text" ? b.text : "")).join(""),
        ),
        spread,
        height,
      });
    };
    calculate();
    const observer = new ResizeObserver(calculate);
    observer.observe(host);
    window.addEventListener("resize", calculate);
    void document.fonts.ready.then(calculate);
    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener("resize", calculate);
    };
  }, [entry.text, size, revision]);
  const count = layout.texts.length + entry.photos.length;
  const start = Math.min(
    Math.floor(position / layout.spread) * layout.spread,
    Math.floor((count - 1) / layout.spread) * layout.spread,
  );
  function finish() {
    editing.current = false;
    setRevision((v) => v + 1);
  }
  return (
    <div className="book-view" ref={container}>
      <div
        ref={measure}
        className="book-content book-measure book-text-measure"
        aria-hidden="true"
      />
      <div
        className="book-spread"
        style={{
          gridTemplateColumns: `repeat(${layout.spread},minmax(0,1fr))`,
        }}
      >
        {Array.from(
          { length: Math.min(layout.spread, count - start) },
          (_, i) => {
            const index = start + i,
              photo = entry.photos[index - layout.texts.length];
            return (
              <article
                className="book-page"
                key={`${entry.date}-${index}`}
                aria-label={`Page ${index + 1}`}
              >
                <header>
                  {entry.date}
                  <span>WAFFLE</span>
                </header>
                {photo ? (
                  <div
                    className="book-photo-page"
                    style={{ height: layout.height }}
                  >
                    <JournalPhoto photo={photo} />
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
                  </div>
                ) : (
                  <textarea
                    className="book-page-editor"
                    aria-label={`Edit page ${index + 1}`}
                    style={{ fontSize: size, height: layout.height }}
                    value={layout.texts[index]}
                    disabled={disabled}
                    placeholder={diary ? "" : "Your story starts here…"}
                    spellCheck
                    onFocus={() => {
                      editing.current = true;
                    }}
                    onBlur={finish}
                    onChange={(e) => {
                      const value = e.target.value;
                      const text = editPage(layout.texts, index, value);
                      setLayout((current) => ({
                        ...current,
                        texts: current.texts.map((t, n) =>
                          n === index ? value : t,
                        ),
                      }));
                      onChange({ text, blocks: undefined });
                    }}
                  />
                )}
                <footer>{index + 1}</footer>
              </article>
            );
          },
        )}
      </div>
      <nav className="book-controls" aria-label="Book pages">
        <button
          disabled={start === 0 && !previousEntry}
          onClick={() => {
            finish();
            if (start === 0 && previousEntry) previousEntry();
            else setPosition(Math.max(0, start - layout.spread));
          }}
        >
          <ChevronLeft size={18} />
          Previous
        </button>
        <span aria-live="polite">
          {start + 1}
          {layout.spread === 2 && start + 1 < count
            ? `–${Math.min(start + 2, count)}`
            : ""}{" "}
          / {count}
        </span>
        <button
          disabled={start + layout.spread >= count && !nextEntry}
          onClick={() => {
            finish();
            if (start + layout.spread >= count && nextEntry) nextEntry();
            else setPosition(start + layout.spread);
          }}
        >
          Next
          <ChevronRight size={18} />
        </button>
      </nav>
      <p className="book-note">
        Tap the words to edit. Pages reflow when you leave the text.
        <br />
        <button onClick={onEdit}>Full text & photos</button>
      </p>
    </div>
  );
}
