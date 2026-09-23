"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
const MAX_BYTES = 3 * 1024 * 1024;
export default function DictationDialog({
  date,
  close,
  append,
}: {
  date: string;
  close: () => void;
  append: (text: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    mounted = useRef(true),
    controller = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "starting" | "recording" | "recorded" | "sending" | "review"
  >("idle");
  const [audio, setAudio] = useState<Blob | null>(null),
    [url, setUrl] = useState(""),
    [seconds, setSeconds] = useState(0),
    [error, setError] = useState(""),
    [transcript, setTranscript] = useState(""),
    [code, setCode] = useState(""),
    [supported, setSupported] = useState(false);
  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    if (timer.current) clearInterval(timer.current);
  }
  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    setSupported(
      !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined",
    );
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      stop();
      controller.current?.abort();
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  useEffect(() => {
    if (!audio) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(audio);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [audio]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (phase !== "idle") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [phase]);
  async function start() {
    setError("");
    setAudio(null);
    setTranscript("");
    setSeconds(0);
    setPhase("starting");
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = mic;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      if (!mime)
        throw new Error(
          "This browser cannot record a supported audio format. Try Chrome or Safari.",
        );
      const r = new MediaRecorder(mic, {
        mimeType: mime,
        audioBitsPerSecond: 64000,
      });
      recorder.current = r;
      const chunks: Blob[] = [];
      let size = 0;
      let failed = false;
      r.ondataavailable = (e) => {
        if (e.data.size) {
          size += e.data.size;
          chunks.push(e.data);
          if (size >= MAX_BYTES) stop();
        }
      };
      r.onerror = () => {
        failed = true;
        stop();
        if (mounted.current) {
          setError("Recording was interrupted. Please try again.");
          setPhase("idle");
        }
      };
      r.onstop = () => {
        stop();
        if (!mounted.current || failed) return;
        const blob = new Blob(chunks, { type: r.mimeType });
        if (!blob.size || blob.size > MAX_BYTES) {
          setError(
            "That recording was empty or too large. Try a shorter waffle.",
          );
          setPhase("idle");
          return;
        }
        setAudio(blob);
        setPhase("recorded");
      };
      r.start(1000);
      setPhase("recording");
      const began = Date.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - began) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 180) stop();
      }, 500);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone access was denied. Allow it in your browser settings, or keep typing."
          : e instanceof Error
            ? e.message
            : "Could not start the microphone.",
      );
      setPhase("idle");
    }
  }
  async function transcribe() {
    if (!audio) return;
    setError("");
    setPhase("sending");
    controller.current = new AbortController();
    const timeout = setTimeout(() => controller.current?.abort(), 55000);
    try {
      const form = new FormData();
      form.set(
        "audio",
        audio,
        audio.type.includes("mp4") ? "waffle.m4a" : "waffle.webm",
      );
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${code}` },
        body: form,
        signal: controller.current.signal,
      });
      const result = await response
        .json()
        .catch(() => ({
          error: "The server could not process this recording. Try again.",
        }));
      if (!response.ok)
        throw new Error(result.error || "Transcription failed.");
      if (typeof result.text !== "string")
        throw new Error("The transcript could not be read.");
      setTranscript(result.text);
      setPhase("review");
    } catch (e) {
      if (mounted.current) {
        setError(
          e instanceof Error && e.name !== "AbortError"
            ? e.message
            : "Transcription timed out or was cancelled. Your recording is still here.",
        );
        setPhase("recorded");
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  function dismiss() {
    if (
      phase !== "idle" &&
      !window.confirm(
        "Discard this recording and transcript? They have not been added to your journal.",
      )
    )
      return;
    close();
  }
  return (
    <dialog
      ref={dialog}
      className="journal-dialog"
      aria-labelledby="dictation-title"
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
    >
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">SAY YOUR PIECE</span>
          <h2 id="dictation-title">Have a waffle</h2>
        </div>
        <button onClick={dismiss} aria-label="Close dictation">
          <X />
        </button>
      </div>
      <p>
        For your entry on {date}. Record up to 3 minutes at a time, then review
        your words.
      </p>
      <p className="dialog-note">
        Recording stays in this window until you tap Transcribe. That sends it
        through Waffle to OpenAI. Waffle doesn’t save the audio to your journal.
        An internet connection is required.
      </p>
      {!supported ? (
        <p>
          Recording isn’t supported here. Try a current Chrome or Safari
          browser, or use your keyboard’s microphone.
        </p>
      ) : (
        <>
          <div className="recording-status" role="status">
            {phase === "recording"
              ? `Recording · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
              : phase === "starting"
                ? "Waiting for microphone permission…"
                : phase === "sending"
                  ? "Turning your waffle into words…"
                  : phase === "review"
                    ? "Your words, ready to review"
                    : audio
                      ? "Recording ready"
                      : "Make yourself comfortable."}
          </div>
          {(phase === "idle" || phase === "recorded") && (
            <button className="primary" onClick={() => void start()}>
              <Mic size={18} />
              {audio ? "Record again" : "Start recording"}
            </button>
          )}
          {phase === "recording" && (
            <button className="primary" onClick={stop}>
              <Square size={18} />
              Stop recording
            </button>
          )}
          {url && <audio className="recording-player" controls src={url} />}
          {phase === "recorded" && (
            <>
              <label className="field-label" htmlFor="dictation-code">
                Private dictation access code
              </label>
              <input
                id="dictation-code"
                className="text-field"
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                placeholder="The code configured for your Waffle"
              />
              <button
                className="primary"
                disabled={!code.trim()}
                onClick={() => void transcribe()}
              >
                Transcribe recording
              </button>
            </>
          )}
          {phase === "sending" && (
            <button
              className="secondary"
              onClick={() => controller.current?.abort()}
            >
              Cancel transcription
            </button>
          )}
          {phase === "review" && (
            <>
              <label className="field-label" htmlFor="transcript">
                Review and edit your transcript
              </label>
              <textarea
                id="transcript"
                className="transcript"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
              />
              <button
                className="primary"
                disabled={!transcript.trim()}
                onClick={() => {
                  append(transcript.trim());
                  close();
                }}
              >
                Add to this day
              </button>
              <p className="dialog-note">
                Your existing writing stays; this is added underneath.
              </p>
            </>
          )}
        </>
      )}
      {error && (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
