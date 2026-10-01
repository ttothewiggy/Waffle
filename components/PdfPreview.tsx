"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight } from "lucide-react";
function PdfCanvas({ doc, number }: { doc: PDFDocumentProxy; number: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | undefined;
    void doc
      .getPage(number)
      .then(async (page) => {
        if (cancelled || !canvas.current) return;
        const scale = 1.6;
        const viewport = page.getViewport({ scale });
        const target = canvas.current;
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        const render = page.render({ canvas: target, viewport });
        task = render;
        await render.promise;
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "This page could not be previewed. You can still download the PDF.",
          );
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, number]);
  return error ? (
    <p role="alert">{error}</p>
  ) : (
    <canvas ref={canvas} role="img" aria-label={`PDF page ${number}`} />
  );
}
export default function PdfPreview({ blob }: { blob: Blob }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [wide, setWide] = useState(false);
  useEffect(() => {
    const query = matchMedia("(min-width: 760px)");
    const change = () => setWide(query.matches);
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    let worker: Worker | undefined;
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (cancelled) return;
      worker = new Worker(
        new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
        { type: "module" },
      );
      pdfjs.GlobalWorkerOptions.workerPort = worker;
      const task = pdfjs.getDocument({
        data: new Uint8Array(await blob.arrayBuffer()),
        isEvalSupported: false,
        useSystemFonts: false,
      });
      destroy = () => {
        void task.destroy().catch(() => {});
        if (pdfjs.GlobalWorkerOptions.workerPort === worker)
          pdfjs.GlobalWorkerOptions.workerPort = null;
      };
      const document = await task.promise;
      if (cancelled) {
        destroy();
        return;
      }
      setDoc(document);
    })().catch(() => {
      if (!cancelled)
        setError(
          "Preview is unavailable in this browser. Your PDF is ready to download.",
        );
    });
    return () => {
      cancelled = true;
      destroy?.();
      worker?.terminate();
    };
  }, [blob]);
  if (error) return <p role="status">{error}</p>;
  if (!doc) return <p role="status">Opening your book…</p>;
  const spread = wide && page !== 1;
  const start = wide && page > 1 ? 2 + Math.floor((page - 2) / 2) * 2 : page;
  const visible = spread && start < doc.numPages ? [start, start + 1] : [start];
  return (
    <div className="pdf-preview">
      <div
        className={`pdf-spread ${visible.length === 2 ? "two-pages" : "one-page"}`}
      >
        {visible.map((number) => (
          <PdfCanvas key={number} doc={doc} number={number} />
        ))}
      </div>
      <nav className="pdf-page-controls" aria-label="PDF pages">
        <button
          aria-label="Previous PDF page"
          disabled={start === 1}
          onClick={() => setPage(Math.max(1, start - (wide ? 2 : 1)))}
        >
          <ChevronLeft size={18} />
        </button>
        <span aria-live="polite">
          {visible.join("–")} / {doc.numPages}
        </span>
        <button
          aria-label="Next PDF page"
          disabled={visible.at(-1) === doc.numPages}
          onClick={() => setPage(visible.at(-1)! + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </nav>
      <p className="dialog-note">
        Actual PDF pages · {wide ? "Book spread" : "Single page"} preview
      </p>
    </div>
  );
}
