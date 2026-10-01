"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Entry } from "@/lib/storage/types";
import {
  paginateRich,
  joinRichPages,
  replaceRichPage,
  renderMeasure,
  type RichPage,
} from "@/lib/document/rich-pages";
import { documentFor, plainText } from "@/lib/document/rich";
import RichEditor from "./RichEditor";
import { pageStyle, DateHeading } from "./PageStyle";
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
  const [layout, setLayout] = useState({
    pages: [{ doc: documentFor(entry), continues: false }] as RichPage[],
    spread: 1,
    height: 400,
  });
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
      probe.style.setProperty("--reading-size", `${size}px`);
      const pages = paginateRich(documentFor(entry), (doc) => {
        renderMeasure(probe, doc);
        return probe.scrollHeight <= height - 8;
      });
      setLayout({ pages, spread, height });
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
  }, [entry.text, entry.richText, entry.appearance, size, revision]);
  const count = layout.pages.length + entry.photos.length;
  const start = Math.min(
    Math.floor(position / layout.spread) * layout.spread,
    Math.floor((count - 1) / layout.spread) * layout.spread,
  );
  function finish() {
    editing.current = false;
    setRevision((v) => v + 1);
  }
  return (
    <div
      className="book-view"
      ref={container}
      style={
        {
          ...pageStyle(entry.appearance),
          "--reading-size": `${size}px`,
        } as CSSProperties
      }
    >
      <div
        ref={measure}
        className="rich-content book-measure rich-measure"
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
              photo = entry.photos[index - layout.pages.length];
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
                  <>
                    {index === 0 && (
                      <DateHeading
                        date={entry.date}
                        appearance={entry.appearance}
                      />
                    )}
                    <RichEditor
                      doc={layout.pages[index].doc}
                      label={`Edit page ${index + 1}`}
                      size={size}
                      disabled={disabled}
                      pageHeight={layout.height}
                      placeholder={diary ? "" : "Your story starts here…"}
                      onFocus={() => {
                        editing.current = true;
                      }}
                      onBlur={finish}
                      onChange={(doc) => {
                        const pages = replaceRichPage(layout.pages, index, doc);
                        const richText = joinRichPages(pages);
                        setLayout((current) => ({ ...current, pages }));
                        onChange({
                          richText,
                          text: plainText(richText),
                          blocks: undefined,
                        });
                      }}
                    />
                  </>
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
