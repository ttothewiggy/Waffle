"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
export default function AiDialog({
  text,
  close,
  apply,
}: {
  text: string;
  close: () => void;
  apply: (text: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    request = useRef<AbortController | null>(null);
  const [mode, setMode] = useState("tidy"),
    [code, setCode] = useState(""),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    return () => request.current?.abort();
  }, []);
  function dismiss() {
    if (busy && draft) return;
    if (
      draft &&
      !window.confirm("Discard this draft? Your original stays unchanged.")
    )
      return;
    request.current?.abort();
    close();
  }
  async function generate() {
    setBusy(true);
    setError("");
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => controller.abort(), 55000);
    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${code}`,
        },
        body: JSON.stringify({ text, mode }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not create a draft.");
      if (typeof result.text !== "string")
        throw new Error("No draft returned.");
      setDraft(result.text);
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "AbortError"
          ? e.message
          : "The request timed out or was cancelled. Your original is unchanged.",
      );
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="journal-dialog ai-dialog"
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
    >
      <button
        className="dialog-close"
        onClick={dismiss}
        aria-label="Close AI editing"
      >
        <X />
      </button>
      <div className="eyebrow">STILL YOUR WORDS</div>
      <h2>A little polish.</h2>
      <p>
        Choose how much help you’d like. Creating a draft sends this day’s text
        to OpenAI. Photos and other days stay here. Your original is kept when
        you apply a draft.
      </p>
      {!draft ? (
        <>
          <label className="ai-field">
            Editing style
            <select
              value={mode}
              disabled={busy}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="tidy">Light tidy — keep my wording</option>
              <option value="flow">Improve flow — organise my thoughts</option>
              <option value="rewrite">
                Rewrite — a fresh telling, same facts
              </option>
            </select>
          </label>
          <label className="ai-field">
            Private access code (same as dictation)
            <input
              type="password"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
            />
          </label>
          <p>{text.length.toLocaleString()} / 20,000 characters</p>
          <button
            className="primary"
            disabled={busy || !code || text.length > 20000}
            onClick={() => void generate()}
          >
            {busy ? "Polishing your words…" : "Create a draft"}
          </button>
        </>
      ) : (
        <>
          <details>
            <summary>Read the original</summary>
            <p className="original-text">{text}</p>
          </details>
          <label className="ai-field">
            Review and edit your draft
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
            />
          </label>
          <p>
            Check the details before applying. Your photos and captions stay at
            the end of the entry.
          </p>
          <div className="dialog-actions">
            <button className="secondary" disabled={busy} onClick={dismiss}>
              Keep original
            </button>
            <button
              className="primary"
              disabled={busy || !draft.trim()}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await apply(draft);
                  close();
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not save this draft. It is still here; retry.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Use this version
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="photo-error">
          {error}
        </p>
      )}
    </dialog>
  );
}
