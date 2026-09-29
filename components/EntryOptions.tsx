"use client";
import { READING_SIZES } from "@/lib/preferences/reading";
import { useEffect, useRef } from "react";
import {
  X,
  ImagePlus,
  Mic,
  Sparkles,
  BookOpen,
  History,
  Trash2,
} from "lucide-react";
export default function EntryOptions({
  close,
  photo,
  dictate,
  polish,
  history,
  remove,
  reading,
  toggleReading,
  canPolish,
  canDelete,
  hasHistory,
  disabled,
  size,
  setSize,
}: {
  close: () => void;
  photo: () => void;
  dictate: () => void;
  polish: () => void;
  history: () => void;
  remove: () => void;
  reading: boolean;
  toggleReading: () => void;
  canPolish: boolean;
  canDelete: boolean;
  hasHistory: boolean;
  disabled: boolean;
  size: number;
  setSize: (size: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const action = (fn: () => void) => {
    close();
    fn();
  };
  return (
    <dialog
      className="journal-dialog entry-options"
      ref={ref}
      aria-labelledby="entry-options-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="dialog-heading">
        <h2 id="entry-options-title">Entry options</h2>
        <button aria-label="Close entry options" onClick={close}>
          <X />
        </button>
      </div>
      <div className="entry-options-list">
        <button disabled={disabled} onClick={() => action(photo)}>
          <ImagePlus size={19} />
          Add photos
        </button>
        <button disabled={disabled} onClick={() => action(dictate)}>
          <Mic size={19} />
          Dictate
        </button>
        <button
          disabled={disabled || !canPolish}
          onClick={() => action(polish)}
        >
          <Sparkles size={19} />
          Polish text
        </button>
        <button onClick={() => action(toggleReading)}>
          <BookOpen size={19} />
          {reading ? "Continuous text" : "Paginated view"}
        </button>
        <button
          disabled={!hasHistory || disabled}
          onClick={() => action(history)}
        >
          <History size={19} />
          Previous versions
        </button>
      </div>
      <label className="reader-size">
        Text size
        <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {READING_SIZES.map((value) => (
            <option key={value} value={value}>
              {value}px{value === 16 ? " · Default" : ""}
            </option>
          ))}
        </select>
      </label>
      <button
        className="entry-delete"
        disabled={!canDelete || disabled}
        onClick={() => action(remove)}
      >
        <Trash2 size={18} />
        Delete entry
      </button>
    </dialog>
  );
}
