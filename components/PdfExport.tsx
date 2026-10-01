"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Download, X, BookOpen } from "lucide-react";
import { useJournalAccount } from "./CloudAccount";
import { dayKey, hasContent, type Entry } from "@/lib/storage/types";
import {
  pdfFilename,
  selectPdfEntries,
  type PdfOptions,
} from "@/lib/pdf/options";
import { preparePdf } from "@/lib/pdf/prepare";
const Preview = dynamic(() => import("./PdfPreview"), { ssr: false });
export default function PdfExport({
  close,
  flush,
}: {
  close: () => void;
  flush: () => Promise<void>;
}) {
  const { repository } = useJournalAccount();
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<AbortController | null>(null),
    worker = useRef<Worker | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState("");
  const today = dayKey();
  const [options, setOptions] = useState<PdfOptions>({
    from: today,
    to: today,
    size: "A5",
    title: "My Waffle journal",
    subtitle: "",
    cover: true,
    blankDays: false,
    photos: true,
    colours: false,
    font: "entry",
    textSize: 11,
  });
  const [result, setResult] = useState<{
      blob: Blob;
      options: PdfOptions;
    } | null>(null),
    [url, setUrl] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    void flush()
      .then(() => repository.list())
      .then((rows) => {
        if (!active) return;
        setEntries(rows);
        const written = rows
          .filter(hasContent)
          .sort((a, b) => a.date.localeCompare(b.date));
        setOptions((o) => ({
          ...o,
          from: written[0]?.date || today,
          to: today,
        }));
      })
      .catch(() => {
        if (active)
          setError(
            "Could not load your entries. Close this window and retry after saving.",
          );
      });
    return () => {
      active = false;
      cancel.current?.abort();
      worker.current?.terminate();
    };
  }, [repository]);
  useEffect(() => {
    if (!result) {
      setUrl("");
      return;
    }
    const link = URL.createObjectURL(result.blob);
    setUrl(link);
    return () => URL.revokeObjectURL(link);
  }, [result]);
  function change(patch: Partial<PdfOptions>) {
    setOptions((o) => ({ ...o, ...patch }));
    setResult(null);
    setError("");
  }
  function preset(value: string) {
    const year = today.slice(0, 4),
      month = today.slice(0, 7);
    if (value === "today") change({ from: today, to: today });
    if (value === "month") change({ from: `${month}-01`, to: today });
    if (value === "year") change({ from: `${year}-01-01`, to: today });
    if (value === "all")
      change({
        from:
          entries
            ?.filter(hasContent)
            .map((e) => e.date)
            .sort()[0] || today,
        to: today,
      });
  }
  function stop() {
    cancel.current?.abort();
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setProgress("Export cancelled. Your journal is unchanged.");
  }
  async function create() {
    if (!entries || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    const controller = new AbortController();
    cancel.current = controller;
    let ownWorker: Worker | null = null;
    try {
      setProgress("Gathering your pages…");
      await flush();
      const current = await repository.list();
      selectPdfEntries(current, options);
      const job = await preparePdf(
        current,
        options,
        controller.signal,
        (message) => {
          if (!controller.signal.aborted) setProgress(message);
        },
      );
      if (controller.signal.aborted) return;
      setProgress("Typesetting your book…");
      const pdfWorker = new Worker(
        new URL("../lib/pdf/worker.ts", import.meta.url),
      );
      worker.current = pdfWorker;
      ownWorker = pdfWorker;
      const blob = await new Promise<Blob>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pdfWorker.terminate();
          reject(
            new Error(
              "This edition took too long. Try a shorter range or fewer photos.",
            ),
          );
        }, 180000);
        const finish = () => clearTimeout(timeout);
        controller.signal.addEventListener(
          "abort",
          () => {
            finish();
            reject(new DOMException("Cancelled", "AbortError"));
          },
          { once: true },
        );
        pdfWorker.onmessage = (
          event: MessageEvent<{ blob?: Blob; error?: string }>,
        ) => {
          finish();
          event.data.blob
            ? resolve(event.data.blob)
            : reject(
                new Error(event.data.error || "Could not create this PDF."),
              );
        };
        pdfWorker.onerror = () => {
          finish();
          reject(
            new Error(
              "The PDF tools could not start. Reopen Waffle online and try again.",
            ),
          );
        };
        pdfWorker.postMessage(job);
      });
      if (!controller.signal.aborted) {
        setResult({ blob, options: { ...options } });
        setProgress("Your book is ready.");
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Could not create the PDF. Your journal is unchanged.",
        );
    } finally {
      ownWorker?.terminate();
      if (cancel.current === controller) {
        worker.current = null;
        setBusy(false);
      }
    }
  }
  const count =
    entries?.filter(
      (e) => hasContent(e) && e.date >= options.from && e.date <= options.to,
    ).length || 0;
  return (
    <dialog
      ref={dialog}
      className="journal-dialog pdf-dialog"
      aria-labelledby="pdf-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">A BOOK OF YOUR DAYS</span>
          <h2 id="pdf-title">Your journal, on paper.</h2>
        </div>
        <button aria-label="Close PDF export" onClick={close}>
          <X />
        </button>
      </div>
      <p>
        {options.size} portrait pages, made into a book. Prepared privately on
        this device.
      </p>
      <div className="pdf-workspace">
        <div className="pdf-options">
          <fieldset disabled={busy || !entries}>
            <legend>Make your edition</legend>
            <div
              className="pdf-presets"
              role="group"
              aria-label="Date range shortcuts"
            >
              {[
                ["today", "Today"],
                ["month", "This month"],
                ["year", "This year"],
                ["all", "All entries"],
              ].map(([value, label]) => (
                <button key={value} onClick={() => preset(value)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="pdf-date-inputs">
              <label>
                From
                <input
                  type="date"
                  value={options.from}
                  onChange={(e) => change({ from: e.target.value })}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={options.to}
                  onChange={(e) => change({ to: e.target.value })}
                />
              </label>
            </div>
            <p className="dialog-note">
              {count} written {count === 1 ? "day" : "days"} in this range
            </p>
            <label>
              Book title
              <input
                value={options.title}
                maxLength={100}
                onChange={(e) => change({ title: e.target.value })}
              />
            </label>
            <label>
              Subtitle <span>(optional)</span>
              <input
                value={options.subtitle}
                maxLength={180}
                onChange={(e) => change({ subtitle: e.target.value })}
              />
            </label>
            <label>
              Page size
              <select
                value={options.size}
                onChange={(e) =>
                  change({ size: e.target.value as PdfOptions["size"] })
                }
              >
                <option value="A5">A5 · 148 × 210 mm</option>
                <option value="A4">A4 · 210 × 297 mm</option>
              </select>
            </label>
            <label>
              Book font
              <select
                value={options.font}
                onChange={(e) =>
                  change({ font: e.target.value as PdfOptions["font"] })
                }
              >
                <option value="entry">Use each entry’s font style</option>
                <option value="serif">Classic serif</option>
                <option value="sans">Simple sans</option>
                <option value="handwritten">Handwritten</option>
              </select>
            </label>
            <label>
              Print text size
              <select
                value={options.textSize}
                onChange={(e) => change({ textSize: Number(e.target.value) })}
              >
                {[9, 10, 11, 12, 14, 16].map((size) => (
                  <option key={size} value={size}>
                    {size} pt{size === 11 ? " · Recommended" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="dialog-note">
              Separate from your screen size. Headings, bold, italic and
              underline are kept.
            </p>
            {(
              [
                ["cover", "Include a cover"],
                ["blankDays", "Include unwritten days"],
                ["photos", "Include photos and captions"],
                ["colours", "Use journal page colours"],
              ] as const
            ).map(([key, label]) => (
              <label className="check-option" key={key}>
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={(e) => change({ [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
            <p className="dialog-note">
              Each day starts on a new page. Unwritten days get a dated blank
              page. White pages use less printer ink.
            </p>
          </fieldset>
          {error && (
            <p className="dialog-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="primary"
              disabled={busy || !entries}
              onClick={() => void create()}
            >
              <BookOpen size={18} />
              {busy ? "Making your book…" : "Create PDF & preview"}
            </button>
            {busy && (
              <button className="secondary" onClick={stop}>
                Cancel export
              </button>
            )}
          </div>
          {!!progress && (
            <p role="status" className="dialog-note">
              {progress}
            </p>
          )}
          {result && url && (
            <a
              className="primary pdf-download"
              download={pdfFilename(result.options)}
              href={url}
            >
              <Download size={18} />
              Download PDF{" "}
              <span>({(result.blob.size / 1024 / 1024).toFixed(1)} MB)</span>
            </a>
          )}
          <p className="dialog-note">
            PDFs are readable copies; keep using JSON backups for restoring your
            journal. A printer-specific cover, spine and bleed can be added
            later.
          </p>
        </div>
        <div className="pdf-preview-panel">
          {result ? (
            <Preview key={url} blob={result.blob} />
          ) : (
            <div className="pdf-preview-empty">
              <BookOpen size={36} />
              <h3>A little book of your life.</h3>
              <p>
                Choose your dates and create a preview. Your words, photographs
                and quiet days, together.
              </p>
              <span>
                {options.size} portrait · Single pages in the PDF
                <br />
                Facing pages in the book preview
              </span>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
