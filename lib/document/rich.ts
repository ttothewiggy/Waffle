/** Portable, deliberately small rich-text schema. No HTML or executable attributes. */
export type Mark = { type: "bold" | "italic" | "underline" };
export type Inline =
  { type: "text"; text: string; marks?: Mark[] } | { type: "hardBreak" };
export type Paragraph =
  | { type: "paragraph"; content?: Inline[] }
  | { type: "heading"; attrs: { level: 1 | 2 }; content?: Inline[] };
export interface RichDocument {
  type: "doc";
  content: Paragraph[];
}
export interface Appearance {
  font: "serif" | "sans" | "handwritten";
  paper: "parchment" | "ivory" | "blue" | "sage" | "grey";
  showDate: boolean;
  dateUnderline: boolean;
}
export const defaultAppearance: Appearance = {
  font: "serif",
  paper: "parchment",
  showDate: true,
  dateUnderline: false,
};
export const fonts = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "Arial, Helvetica, sans-serif",
  handwritten: "Kalam, cursive",
};
export const papers = {
  parchment: { name: "Parchment", paper: "#ecdfc5", ink: "#3e3026" },
  ivory: { name: "Ivory", paper: "#faf7ed", ink: "#38332c" },
  blue: { name: "Pale blue", paper: "#e2edf0", ink: "#293e47" },
  sage: { name: "Soft sage", paper: "#e4eadc", ink: "#343e2e" },
  grey: { name: "Warm grey", paper: "#e7e3de", ink: "#3b3632" },
};
export function fromText(text: string): RichDocument {
  return {
    type: "doc",
    content: text
      .split("\n")
      .map((text) => ({
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      })),
  };
}
export function inlineText(block: Paragraph): string {
  return (block.content || [])
    .map((n) => (n.type === "text" ? n.text : "\n"))
    .join("");
}
export function plainText(doc: RichDocument): string {
  return doc.content.map(inlineText).join("\n");
}
export function documentFor(entry: {
  text: string;
  richText?: RichDocument;
}): RichDocument {
  return entry.richText || fromText(entry.text);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid formatted document.");
  return value as Record<string, unknown>;
}
export function validateRich(value: unknown, text?: string): RichDocument {
  const doc = record(value);
  if (
    doc.type !== "doc" ||
    !Array.isArray(doc.content) ||
    !doc.content.length ||
    doc.content.length > 50000
  )
    throw new Error("Invalid formatted document.");
  let total = 0,
    nodes = 0;
  const content = doc.content.map((raw) => {
    const p = record(raw);
    if (p.type !== "paragraph" && p.type !== "heading")
      throw new Error("Unsupported paragraph style.");
    const level = p.type === "heading" ? record(p.attrs).level : undefined;
    if (p.type === "heading" && level !== 1 && level !== 2)
      throw new Error("Unsupported heading.");
    if (p.content !== undefined && !Array.isArray(p.content))
      throw new Error("Invalid formatted paragraph.");
    const inline: Inline[] = ((p.content || []) as unknown[]).map((raw) => {
      if (++nodes > 200000) throw new Error("Formatted document is too large.");
      const n = record(raw);
      if (n.type === "hardBreak") return { type: "hardBreak" };
      if (n.type !== "text" || typeof n.text !== "string" || !n.text.length)
        throw new Error("Invalid formatted text.");
      total += n.text.length;
      if (total > 5 * 1024 * 1024)
        throw new Error("Formatted document is too large.");
      if (
        n.marks !== undefined &&
        (!Array.isArray(n.marks) || n.marks.length > 3)
      )
        throw new Error("Invalid text formatting.");
      const marks: Mark[] = ((n.marks || []) as unknown[]).map((raw) => {
        const mark = record(raw).type;
        if (mark !== "bold" && mark !== "italic" && mark !== "underline")
          throw new Error("Unsupported text formatting.");
        return { type: mark };
      });
      return { type: "text", text: n.text, ...(marks.length ? { marks } : {}) };
    });
    return p.type === "heading"
      ? ({ type: "heading", attrs: { level }, content: inline } as Paragraph)
      : ({ type: "paragraph", content: inline } as Paragraph);
  });
  const result: RichDocument = { type: "doc", content };
  if (text !== undefined && plainText(result) !== text)
    throw new Error("Formatting does not match the entry’s words.");
  return result;
}
export function validateAppearance(value: unknown): Appearance {
  const a = record(value);
  if (
    !(typeof a.font === "string" && Object.hasOwn(fonts, a.font)) ||
    !(typeof a.paper === "string" && Object.hasOwn(papers, a.paper)) ||
    typeof a.showDate !== "boolean" ||
    typeof a.dateUnderline !== "boolean"
  )
    throw new Error("Invalid page appearance.");
  return {
    font: a.font,
    paper: a.paper,
    showDate: a.showDate,
    dateUnderline: a.dateUnderline,
  } as Appearance;
}
export function appendText(
  entry: { text: string; richText?: RichDocument },
  text: string,
) {
  const current = documentFor(entry);
  const richText: RichDocument = entry.text
    ? {
        type: "doc",
        content: [
          ...current.content,
          { type: "paragraph" },
          ...fromText(text).content,
        ],
      }
    : fromText(text);
  return { text: plainText(richText), richText };
}
