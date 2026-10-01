"use client";
import { useEffect, type CSSProperties } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { EditorState } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Underline,
  Heading1,
  Heading2,
  ImagePlus,
  Mic,
} from "lucide-react";
import {
  plainText,
  validateRich,
  type RichDocument,
} from "@/lib/document/rich";

const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2] },
    blockquote: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    link: false,
    trailingNode: false,
  }),
];

export default function RichEditor({
  doc,
  label,
  size,
  disabled,
  onChange,
  onFocus,
  onBlur,
  photo,
  dictate,
  pageHeight,
  placeholder = "What would you like to waffle about today?",
}: {
  doc: RichDocument;
  label: string;
  size: number;
  disabled: boolean;
  onChange: (doc: RichDocument) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  photo?: () => void;
  dictate?: () => void;
  pageHeight?: number;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    content: doc,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "rich-content",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor }) => onChange(validateRich(editor.getJSON())),
    onFocus,
    onBlur,
  });
  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            underline: editor.isActive("underline"),
            h1: editor.isActive("heading", { level: 1 }),
            h2: editor.isActive("heading", { level: 2 }),
          }
        : null,
  });
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  useEffect(() => {
    if (
      editor &&
      JSON.stringify(validateRich(editor.getJSON())) !== JSON.stringify(doc)
    ) {
      // External updates (sync, dictation, AI, restored version) must not be undoable
      // into another entry. The parent also keys editors by day/page.
      editor.commands.setContent(doc, { emitUpdate: false });
      editor.view.updateState(
        EditorState.create({
          schema: editor.schema,
          doc: editor.state.doc,
          plugins: editor.state.plugins,
        }),
      );
    }
  }, [doc, editor]);
  return (
    <div
      className={`rich-editor ${pageHeight ? "rich-page-editor" : ""}`}
      style={{ "--reading-size": `${size}px` } as CSSProperties}
    >
      <div
        className="rich-writing-area"
        style={
          pageHeight ? { height: pageHeight, overflowY: "auto" } : undefined
        }
      >
        {!editor && <div className="rich-content">{plainText(doc)}</div>}
        <EditorContent editor={editor} />
        {placeholder && !plainText(doc) && (
          <span className="rich-placeholder" aria-hidden="true">
            {placeholder}
          </span>
        )}
      </div>
      <div className="format-toolbar" role="group" aria-label="Text formatting">
        {photo && (
          <button
            type="button"
            title="Add photos"
            aria-label="Add photos"
            disabled={disabled}
            onClick={photo}
          >
            <ImagePlus size={19} />
          </button>
        )}
        {dictate && (
          <button
            type="button"
            title="Dictate"
            aria-label="Dictate"
            disabled={disabled}
            onClick={dictate}
          >
            <Mic size={19} />
          </button>
        )}
        {(
          [
            [
              "Bold",
              Bold,
              state?.bold,
              () => editor?.chain().focus().toggleBold().run(),
            ],
            [
              "Italic",
              Italic,
              state?.italic,
              () => editor?.chain().focus().toggleItalic().run(),
            ],
            [
              "Underline",
              Underline,
              state?.underline,
              () => editor?.chain().focus().toggleUnderline().run(),
            ],
            [
              "Heading 1",
              Heading1,
              state?.h1,
              () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
            ],
            [
              "Heading 2",
              Heading2,
              state?.h2,
              () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
            ],
          ] as const
        ).map(([label, Icon, active, action]) => (
          <button
            type="button"
            key={label}
            title={label}
            aria-label={label}
            aria-pressed={!!active}
            disabled={disabled || !editor}
            onMouseDown={(e) => e.preventDefault()}
            onClick={action}
          >
            <Icon size={19} />
          </button>
        ))}
      </div>
    </div>
  );
}
