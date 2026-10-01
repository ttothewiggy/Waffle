import {
  inlineText,
  type Inline,
  type Paragraph,
  type RichDocument,
} from "./rich";
export interface RichPage {
  doc: RichDocument;
  continues: boolean;
}
/** Split at UTF-16 offsets chosen from Unicode character boundaries. */
function slice(block: Paragraph, from: number, to: number): Paragraph {
  let offset = 0;
  const content: Inline[] = [];
  for (const node of block.content || []) {
    const length = node.type === "text" ? node.text.length : 1;
    const start = Math.max(0, from - offset),
      end = Math.min(length, to - offset);
    if (end > start)
      content.push(
        node.type === "text"
          ? { ...node, text: node.text.slice(start, end) }
          : node,
      );
    offset += length;
  }
  return { ...block, content };
}
/** Keep paragraph boundaries separate from visual page breaks so editing cannot add
 * newlines or lose marks where a paragraph continues onto the next page. */
export function paginateRich(
  doc: RichDocument,
  fits: (doc: RichDocument) => boolean,
): RichPage[] {
  const pages: RichPage[] = [];
  let content: Paragraph[] = [],
    continues = false;
  function push() {
    if (content.length)
      pages.push({ doc: { type: "doc", content }, continues });
    content = [];
    continues = false;
  }
  for (const original of doc.content) {
    let block = original;
    while (true) {
      if (fits({ type: "doc", content: [...content, block] })) {
        content.push(block);
        break;
      }
      const text = inlineText(block);
      if (!text.length) {
        if (content.length) push();
        content.push(block);
        break;
      }
      const boundaries = [0];
      for (const char of text)
        boundaries.push(boundaries.at(-1)! + char.length);
      let low = 0,
        high = boundaries.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (
          fits({
            type: "doc",
            content: [...content, slice(block, 0, boundaries[mid])],
          })
        )
          low = mid;
        else high = mid - 1;
      }
      if (!low && content.length) {
        push();
        continue;
      }
      let end = boundaries[Math.max(1, low)];
      // Prefer a word boundary, but always make progress for long unbroken words.
      const space = text.slice(0, end).search(/\s+\S*$/u);
      if (space > 0 && space > end / 2) end = space + 1;
      // Whitespace boundary is ASCII/newline, never the middle of a surrogate pair.
      content.push(slice(block, 0, end));
      push();
      if (end >= text.length) break;
      continues = true;
      block = slice(block, end, text.length);
    }
  }
  push();
  return pages.length
    ? pages
    : [
        {
          doc: { type: "doc", content: [{ type: "paragraph" }] },
          continues: false,
        },
      ];
}
export function joinRichPages(pages: RichPage[]): RichDocument {
  const content: Paragraph[] = [];
  for (const page of pages) {
    const blocks = page.doc.content;
    if (page.continues && content.length && blocks.length) {
      const last = content.pop()!;
      content.push({
        ...last,
        content: [...(last.content || []), ...(blocks[0].content || [])],
      });
      content.push(...blocks.slice(1));
    } else content.push(...blocks);
  }
  return {
    type: "doc",
    content: content.length ? content : [{ type: "paragraph" }],
  };
}
/** Measurement uses DOM text nodes, never parses untrusted HTML. */
export function renderMeasure(host: HTMLElement, doc: RichDocument) {
  const fragment = document.createDocumentFragment();
  for (const block of doc.content) {
    const el = document.createElement(
      block.type === "heading" ? `h${block.attrs.level}` : "p",
    );
    for (const node of block.content || []) {
      if (node.type === "hardBreak") {
        el.append(document.createElement("br"));
        continue;
      }
      let leaf: Node = document.createTextNode(node.text);
      for (const mark of node.marks || []) {
        const wrapper = document.createElement(
          mark.type === "bold" ? "strong" : mark.type === "italic" ? "em" : "u",
        );
        wrapper.append(leaf);
        leaf = wrapper;
      }
      el.append(leaf);
    }
    if (!el.childNodes.length || block.content?.at(-1)?.type === "hardBreak")
      el.append(document.createElement("br"));
    fragment.append(el);
  }
  host.replaceChildren(fragment);
}
/** A heading applies to a paragraph, including fragments on neighbouring pages. */
export function replaceRichPage(
  pages: RichPage[],
  index: number,
  doc: RichDocument,
): RichPage[] {
  const result = pages.map((p, i) => ({
    ...p,
    doc: {
      ...p.doc,
      content: [...(i === index ? doc.content : p.doc.content)],
    },
  }));
  const style = (target: Paragraph, source: Paragraph): Paragraph =>
    source.type === "heading"
      ? { type: "heading", attrs: source.attrs, content: target.content }
      : { type: "paragraph", content: target.content };
  if (result[index].continues) {
    for (let n = index - 1; n >= 0; n--) {
      const blocks = result[n].doc.content;
      blocks[blocks.length - 1] = style(blocks.at(-1)!, doc.content[0]);
      if (!result[n].continues || blocks.length !== 1) break;
    }
  }
  for (let n = index + 1; n < result.length && result[n].continues; n++) {
    const blocks = result[n].doc.content;
    blocks[0] = style(blocks[0], doc.content.at(-1)!);
    if (blocks.length !== 1) break;
  }
  return result;
}
